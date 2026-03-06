// src/modules/courses/courses.routes.js
const router = require("express").Router();
const { z } = require("zod");
const fs = require("fs");
const { prisma } = require("../../db/prisma");
const { requireAuth } = require("../../middleware/requireAuth");
const { requireRole } = require("../../middleware/requireRole");

function safeUnlink(filePath) {
  if (!filePath) return;
  fs.unlink(filePath, () => {});
}

function zodMsg(parsed) {
  const first = parsed?.error?.issues?.[0];
  if (!first) return "Invalid input";
  const field = first.path?.[0] ? String(first.path[0]) : "field";
  return `${field}: ${first.message}`;
}

// ✅ List courses (includes assigned teachers)
router.get("/", requireAuth, async (req, res) => {
  const courses = await prisma.course.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      isLive: true,
      vectorStoreId: true,
      teachers: {
        select: {
          teacher: { select: { id: true, email: true, name: true, role: true, isActive: true } },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  // Flatten teachers into a simple array
  const normalized = courses.map((c) => ({
    ...c,
    teachers: c.teachers.map((t) => t.teacher),
  }));

  res.json({ courses: normalized });
});

// Create course (admin)
router.post("/", requireAuth, requireRole(["admin"]), async (req, res) => {
  const schema = z.object({
    id: z.string().min(2),
    name: z.string().min(2),
    description: z.string().optional(),
    isLive: z.boolean().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMsg(parsed) });

  const data = parsed.data;
  const courseId = data.id.toUpperCase();

  try {
    const exists = await prisma.course.findUnique({ where: { id: courseId } });
    if (exists) return res.status(409).json({ error: "Course ID already exists." });

    const course = await prisma.course.create({
      data: {
        id: courseId,
        name: data.name,
        description: data.description || null,
        isLive: typeof data.isLive === "boolean" ? data.isLive : true,
      },
    });

    res.json({ ok: true, course });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to create course." });
  }
});

// Update course fields (admin)
router.patch("/:courseId", requireAuth, requireRole(["admin"]), async (req, res) => {
  const schema = z.object({
    name: z.string().optional(),
    description: z.string().nullable().optional(),
    isLive: z.boolean().optional(),
    vectorStoreId: z.string().nullable().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMsg(parsed) });

  const courseId = req.params.courseId.toUpperCase();

  try {
    const course = await prisma.course.update({
      where: { id: courseId },
      data: parsed.data,
    });
    res.json({ ok: true, course });
  } catch (e) {
    if (e?.code === "P2025") return res.status(404).json({ error: "Course not found." });
    console.error(e);
    res.status(500).json({ error: "Failed to update course." });
  }
});

// ✅ Bulk set teachers for a course (admin)
// Body: { teacherIds: ["...","..."] }
router.put("/:courseId/teachers", requireAuth, requireRole(["admin"]), async (req, res) => {
  const schema = z.object({
    teacherIds: z.array(z.string()).default([]),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMsg(parsed) });

  const courseId = req.params.courseId.toUpperCase();
  const teacherIds = [...new Set(parsed.data.teacherIds)].filter(Boolean);

  try {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return res.status(404).json({ error: "Course not found." });

    // Validate teacher ids
    const foundTeachers = await prisma.user.findMany({
      where: { id: { in: teacherIds }, role: "teacher", isActive: true },
      select: { id: true },
    });
    const validTeacherIds = foundTeachers.map((t) => t.id);

    await prisma.$transaction(async (tx) => {
      // remove existing
      await tx.courseTeacher.deleteMany({ where: { courseId } });
      // add new
      if (validTeacherIds.length) {
        await tx.courseTeacher.createMany({
          data: validTeacherIds.map((tid) => ({ courseId, teacherId: tid })),
          skipDuplicates: true,
        });
      }
    });

    res.json({ ok: true, teacherIds: validTeacherIds });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to update course teachers." });
  }
});

// ✅ Remove one teacher from a course (admin)
router.delete("/:courseId/teachers/:teacherId", requireAuth, requireRole(["admin"]), async (req, res) => {
  const courseId = req.params.courseId.toUpperCase();
  const teacherId = req.params.teacherId;

  try {
    await prisma.courseTeacher.delete({
      where: { courseId_teacherId: { courseId, teacherId } },
    });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to remove teacher from course." });
  }
});

// Normal delete (admin) — blocked if enrollments/files exist
router.delete("/:courseId", requireAuth, requireRole(["admin"]), async (req, res) => {
  const courseId = req.params.courseId.toUpperCase();

  try {
    const enrollCount = await prisma.enrollment.count({ where: { courseId } });
    const fileCount = await prisma.courseFile.count({ where: { courseId } });

    if (enrollCount > 0 || fileCount > 0) {
      return res.status(400).json({ error: "Cannot delete course with enrollments/files. Remove them first." });
    }

    // also remove teacher links
    await prisma.courseTeacher.deleteMany({ where: { courseId } });

    await prisma.course.delete({ where: { id: courseId } });
    res.json({ ok: true });
  } catch (e) {
    if (e?.code === "P2025") return res.status(404).json({ error: "Course not found." });
    console.error(e);
    res.status(500).json({ error: "Failed to delete course." });
  }
});

// FORCE DELETE (admin) — deletes everything linked to the course
router.delete("/:courseId/force", requireAuth, requireRole(["admin"]), async (req, res) => {
  const courseId = req.params.courseId.toUpperCase();

  try {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return res.status(404).json({ error: "Course not found" });

    // Collect file paths to delete from disk
    const fileRows = await prisma.courseFile.findMany({
      where: { courseId },
      select: { storagePath: true },
    });
    const paths = fileRows.map((f) => f.storagePath).filter(Boolean);

    await prisma.$transaction(async (tx) => {
      // Delete messages/conversations for this course
      const convos = await tx.conversation.findMany({
        where: { courseId },
        select: { id: true },
      });
      const convoIds = convos.map((c) => c.id);

      if (convoIds.length) {
        await tx.message.deleteMany({ where: { conversationId: { in: convoIds } } });
        await tx.conversation.deleteMany({ where: { id: { in: convoIds } } });
      }

      // Enrollments
      await tx.enrollment.deleteMany({ where: { courseId } });

      // Files
      await tx.courseFile.deleteMany({ where: { courseId } });

      // Teacher links
      await tx.courseTeacher.deleteMany({ where: { courseId } });

      // Course
      await tx.course.delete({ where: { id: courseId } });
    });

    // Delete physical files (best effort)
    paths.forEach(safeUnlink);

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to force delete course." });
  }
});

module.exports = router;