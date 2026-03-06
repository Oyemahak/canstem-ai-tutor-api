const router = require("express").Router();
const { prisma } = require("../../db/prisma");
const { requireAuth } = require("../../middleware/requireAuth");
const { buildTutorAnswer } = require("./tutor.service");

router.post("/chat", requireAuth, async (req, res) => {
  const { courseId, conversationId, message } = req.body;
  if (!courseId || !message) return res.status(400).json({ error: "Missing courseId/message" });

  const cid = String(courseId).toUpperCase();
  const course = await prisma.course.findUnique({ where: { id: cid } });
  if (!course) return res.status(404).json({ error: "Course not found" });

  // Student must be enrolled
  if (req.user.role === "student") {
    const enrolled = await prisma.enrollment.findFirst({
      where: { userId: req.user.id, courseId: cid, status: "active" },
    });
    if (!enrolled) return res.status(403).json({ error: "Not enrolled" });
  }

  // Teacher should only access their own course (optional guard)
  if (req.user.role === "teacher" && course.teacherId !== req.user.id) {
    return res.status(403).json({ error: "Forbidden (not your course)" });
  }

  // Create conversation if missing
  let convoId = conversationId;
  if (!convoId) {
    const convo = await prisma.conversation.create({
      data: { userId: req.user.id, courseId: cid, title: String(message).slice(0, 60) },
    });
    convoId = convo.id;
  }

  await prisma.message.create({
    data: { conversationId: convoId, userId: req.user.id, role: "user", content: String(message) },
  });

  const result = await buildTutorAnswer({ course, userMessage: String(message) });

  await prisma.message.create({
    data: { conversationId: convoId, userId: req.user.id, role: "assistant", content: result.answer },
  });

  res.json({ conversationId: convoId, answer: result.answer, sources: result.sources || [] });
});

module.exports = router;