const router = require("express").Router();
const { z } = require("zod");
const { prisma } = require("../../db/prisma");
const { requireAuth } = require("../../middleware/requireAuth");
const { requireRole } = require("../../middleware/requireRole");

// Student: get my enrolled courses (dashboard uses this)
router.get("/me", requireAuth, requireRole(["student"]), async (req, res) => {
  const rows = await prisma.enrollment.findMany({
    where: { userId: req.user.id, status: "active" },
    include: {
      course: { select: { id: true, name: true, description: true, isLive: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const courses = rows.map((r) => r.course).filter((c) => c.isLive);
  res.json({ courses });
});

// Teacher: get courses I teach (teacher dashboard uses this)
router.get("/teaching", requireAuth, requireRole(["teacher"]), async (req, res) => {
  const courses = await prisma.course.findMany({
    where: { teacherId: req.user.id },
    select: { id: true, name: true, description: true, isLive: true },
    orderBy: { id: "asc" },
  });

  res.json({ courses });
});

// Admin: enroll student by email into a course
router.post("/", requireAuth, requireRole(["admin"]), async (req, res) => {
  const schema = z.object({
    studentEmail: z.string().email(),
    courseId: z.string().min(2),
  });

  const data = schema.parse(req.body);
  const courseId = data.courseId.toUpperCase();

  const student = await prisma.user.findUnique({
    where: { email: data.studentEmail.toLowerCase() },
  });
  if (!student) return res.status(404).json({ error: "Student not found" });
  if (student.role !== "student") return res.status(400).json({ error: "User is not a student" });

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return res.status(404).json({ error: "Course not found" });

  const enrollment = await prisma.enrollment.upsert({
    where: { userId_courseId: { userId: student.id, courseId } },
    update: { status: "active" },
    create: { userId: student.id, courseId },
  });

  res.json({ ok: true, enrollment });
});

// Admin: unenroll (set inactive)
router.patch("/:enrollmentId", requireAuth, requireRole(["admin"]), async (req, res) => {
  const schema = z.object({
    status: z.enum(["active", "inactive"]),
  });

  const data = schema.parse(req.body);

  const enrollment = await prisma.enrollment.update({
    where: { id: req.params.enrollmentId },
    data: { status: data.status },
  });

  res.json({ ok: true, enrollment });
});

module.exports = router;