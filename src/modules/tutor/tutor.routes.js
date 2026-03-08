const router = require("express").Router();
const { prisma } = require("../../db/prisma");
const { requireAuth } = require("../../middleware/requireAuth");
const { buildTutorAnswer } = require("./tutor.service");

// POST /api/tutor/chat
router.post("/chat", requireAuth, async (req, res) => {
  const { courseId, conversationId, message } = req.body;
  if (!courseId || !message) return res.status(400).json({ error: "Missing courseId/message" });

  const cid = String(courseId).toUpperCase();

  const course = await prisma.course.findUnique({
    where: { id: cid },
    select: { id: true, name: true, vectorStoreId: true, isLive: true },
  });
  if (!course) return res.status(404).json({ error: "Course not found" });
  if (!course.isLive) return res.status(403).json({ error: "Course is hidden" });

  // Student must be enrolled
  if (req.user.role === "student") {
    const enrolled = await prisma.enrollment.findFirst({
      where: { userId: req.user.id, courseId: cid, status: "active" },
      select: { id: true },
    });
    if (!enrolled) return res.status(403).json({ error: "Not enrolled" });
  }

  // Teacher must be assigned to this course (multi-teacher)
  if (req.user.role === "teacher") {
    const assigned = await prisma.courseTeacher.findUnique({
      where: { courseId_teacherId: { courseId: cid, teacherId: req.user.id } },
      select: { id: true },
    });
    if (!assigned) return res.status(403).json({ error: "Forbidden" });
  }

  // Create conversation if missing
  let convoId = conversationId;
  if (!convoId) {
    const convo = await prisma.conversation.create({
      data: { userId: req.user.id, courseId: cid, title: String(message).slice(0, 60) },
      select: { id: true },
    });
    convoId = convo.id;
  }

  // Save user message
  await prisma.message.create({
    data: { conversationId: convoId, userId: req.user.id, role: "user", content: String(message) },
  });

  const result = await buildTutorAnswer({
    course,
    userMessage: String(message),
  });

  // Save assistant message
  await prisma.message.create({
    data: { conversationId: convoId, userId: req.user.id, role: "assistant", content: result.answer },
  });

  res.json({
    conversationId: convoId,
    answer: result.answer,
    sources: result.sources || [],
  });
});

module.exports = router;