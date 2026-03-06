// src/modules/enrollments/enrollments.routes.js
const router = require("express").Router();
const { z } = require("zod");
const { prisma } = require("../../db/prisma");
const { requireAuth } = require("../../middleware/requireAuth");
const { requireRole } = require("../../middleware/requireRole");

function zodErr(parsed) {
  return parsed?.error?.issues?.[0]?.message || "Invalid input";
}

// Student: enrolled courses
router.get("/me", requireAuth, requireRole(["student"]), async (req, res) => {
  const rows = await prisma.enrollment.findMany({
    where: { userId: req.user.id, status: "active" },
    include: {
      course: { select: { id: true, name: true, description: true, isLive: true, vectorStoreId: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const courses = rows.map((r) => r.course).filter((c) => c.isLive);
  res.json({ courses });
});

// Teacher: courses I teach (multi-teacher)
router.get("/teaching", requireAuth, requireRole(["teacher"]), async (req, res) => {
  const rows = await prisma.courseTeacher.findMany({
    where: { teacherId: req.user.id },
    include: { course: { select: { id: true, name: true, description: true, isLive: true } } },
    orderBy: { createdAt: "desc" },
  });

  const courses = rows.map((r) => r.course).filter((c) => c.isLive);
  res.json({ courses });
});

// Admin: enroll student
router.post("/", requireAuth, requireRole(["admin"]), async (req, res) => {
  const schema = z.object({
    studentEmail: z.string().email(),
    courseId: z.string().min(2),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodErr(parsed) });

  const { studentEmail } = parsed.data;
  const courseId = parsed.data.courseId.toUpperCase();

  const student = await prisma.user.findUnique({
    where: { email: studentEmail.toLowerCase() },
    select: { id: true, role: true, isActive: true },
  });
  if (!student) return res.status(404).json({ error: "Student not found" });
  if (!student.isActive) return res.status(400).json({ error: "Student is disabled" });
  if (student.role !== "student") return res.status(400).json({ error: "User is not a student" });

  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
  if (!course) return res.status(404).json({ error: "Course not found" });

  const enrollment = await prisma.enrollment.upsert({
    where: { userId_courseId: { userId: student.id, courseId } },
    update: { status: "active" },
    create: { userId: student.id, courseId, status: "active" },
  });

  res.json({ ok: true, enrollment });
});

// ✅ Admin OR Teacher: update enrollment status (teacher must be assigned to course)
router.patch("/:enrollmentId", requireAuth, requireRole(["admin", "teacher"]), async (req, res) => {
  const schema = z.object({ status: z.enum(["active", "inactive"]) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodErr(parsed) });

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: req.params.enrollmentId },
    select: { id: true, courseId: true },
  });
  if (!enrollment) return res.status(404).json({ error: "Enrollment not found" });

  // Teacher can only change enrollments for courses they teach
  if (req.user.role === "teacher") {
    const isAssigned = await prisma.courseTeacher.findUnique({
      where: { courseId_teacherId: { courseId: enrollment.courseId, teacherId: req.user.id } },
      select: { courseId: true },
    });
    if (!isAssigned) return res.status(403).json({ error: "Forbidden" });
  }

  const updated = await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: { status: parsed.data.status },
  });

  res.json({ ok: true, enrollment: updated });
});

// Admin/Teacher: students in course (teacher must be assigned)
router.get("/course/:courseId/students", requireAuth, requireRole(["admin", "teacher"]), async (req, res) => {
  const courseId = req.params.courseId.toUpperCase();

  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
  if (!course) return res.status(404).json({ error: "Course not found" });

  if (req.user.role === "teacher") {
    const isAssigned = await prisma.courseTeacher.findUnique({
      where: { courseId_teacherId: { courseId, teacherId: req.user.id } },
      select: { courseId: true },
    });
    if (!isAssigned) return res.status(403).json({ error: "Forbidden" });
  }

  const enrollments = await prisma.enrollment.findMany({
    where: { courseId, status: "active" },
    include: { user: { select: { id: true, email: true, name: true, isActive: true } } },
    orderBy: { createdAt: "desc" },
  });

  const students = enrollments.map((e) => ({
    enrollmentId: e.id,
    userId: e.user.id,
    email: e.user.email,
    name: e.user.name,
    isActive: e.user.isActive,
    enrolledAt: e.createdAt,
  }));

  res.json({ courseId, students });
});

// ✅ NEW: Admin OR Teacher: remove student from course (unenroll)
// Teacher must be assigned to course
router.delete(
  "/course/:courseId/student/:userId",
  requireAuth,
  requireRole(["admin", "teacher"]),
  async (req, res) => {
    const courseId = req.params.courseId.toUpperCase();
    const userId = req.params.userId;

    const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
    if (!course) return res.status(404).json({ error: "Course not found" });

    if (req.user.role === "teacher") {
      const isAssigned = await prisma.courseTeacher.findUnique({
        where: { courseId_teacherId: { courseId, teacherId: req.user.id } },
        select: { courseId: true },
      });
      if (!isAssigned) return res.status(403).json({ error: "Forbidden" });
    }

    await prisma.enrollment.deleteMany({ where: { courseId, userId } });

    res.json({ ok: true });
  }
);

module.exports = router;