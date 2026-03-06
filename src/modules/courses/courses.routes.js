const router = require("express").Router();
const { z } = require("zod");
const { prisma } = require("../../db/prisma");
const { requireAuth } = require("../../middleware/requireAuth");
const { requireRole } = require("../../middleware/requireRole");

// List courses (admin sees all, others also can read list; enrollment controls dashboard)
router.get("/", requireAuth, async (req, res) => {
  const courses = await prisma.course.findMany({
    select: { id: true, name: true, description: true, isLive: true, teacherId: true },
    orderBy: { id: "asc" },
  });
  res.json({ courses });
});

// Admin: create course
router.post("/", requireAuth, requireRole(["admin"]), async (req, res) => {
  const schema = z.object({
    id: z.string().min(2),
    name: z.string().min(2),
    description: z.string().optional(),
    teacherId: z.string().optional(),
    isLive: z.boolean().optional(),
  });

  const data = schema.parse(req.body);

  const course = await prisma.course.create({
    data: {
      id: data.id.toUpperCase(),
      name: data.name,
      description: data.description || null,
      teacherId: data.teacherId || null,
      isLive: typeof data.isLive === "boolean" ? data.isLive : true,
    },
  });

  res.json({ ok: true, course });
});

// Admin: update course (assign teacher / update live status)
router.patch("/:courseId", requireAuth, requireRole(["admin"]), async (req, res) => {
  const schema = z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    teacherId: z.string().nullable().optional(),
    isLive: z.boolean().optional(),
    vectorStoreId: z.string().nullable().optional(),
  });

  const data = schema.parse(req.body);

  const course = await prisma.course.update({
    where: { id: req.params.courseId.toUpperCase() },
    data,
  });

  res.json({ ok: true, course });
});

// Admin: delete course (safety: prevent delete if has enrollments/files)
router.delete("/:courseId", requireAuth, requireRole(["admin"]), async (req, res) => {
  const courseId = req.params.courseId.toUpperCase();

  const enrollCount = await prisma.enrollment.count({ where: { courseId } });
  const fileCount = await prisma.courseFile.count({ where: { courseId } });

  if (enrollCount > 0 || fileCount > 0) {
    return res.status(400).json({
      error: "Cannot delete course with enrollments/files. Remove them first.",
    });
  }

  await prisma.course.delete({ where: { id: courseId } });
  res.json({ ok: true });
});

module.exports = router;