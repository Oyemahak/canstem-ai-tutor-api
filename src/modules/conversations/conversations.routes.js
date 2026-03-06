const router = require("express").Router();
const { prisma } = require("../../db/prisma");
const { requireAuth } = require("../../middleware/requireAuth");

// list my conversations (ChatGPT history)
router.get("/", requireAuth, async (req, res) => {
  const conversations = await prisma.conversation.findMany({
    where: { userId: req.user.id },
    select: { id: true, courseId: true, title: true, createdAt: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  res.json({ conversations });
});

// create a new conversation (optional)
router.post("/", requireAuth, async (req, res) => {
  const { courseId, title } = req.body;
  if (!courseId) return res.status(400).json({ error: "courseId required" });

  const convo = await prisma.conversation.create({
    data: {
      userId: req.user.id,
      courseId: String(courseId).toUpperCase(),
      title: title ? String(title).slice(0, 120) : null,
    },
  });

  res.json({ ok: true, conversation: convo });
});

// get messages for a conversation
router.get("/:conversationId/messages", requireAuth, async (req, res) => {
  const convo = await prisma.conversation.findFirst({
    where: { id: req.params.conversationId, userId: req.user.id },
  });
  if (!convo) return res.status(404).json({ error: "Conversation not found" });

  const messages = await prisma.message.findMany({
    where: { conversationId: convo.id },
    select: { id: true, role: true, content: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  res.json({ messages });
});

module.exports = router;