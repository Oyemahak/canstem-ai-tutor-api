const router = require("express").Router();
const { requireAuth } = require("../../middleware/requireAuth");
const { createRealtimeSession } = require("./realtime.service");

router.post("/session", requireAuth, async (req, res) => {
  const { courseId } = req.body;
  res.json(await createRealtimeSession({ courseId: String(courseId || "").toUpperCase() }));
});

module.exports = router;