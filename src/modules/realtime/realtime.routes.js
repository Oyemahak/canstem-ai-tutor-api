// src/modules/realtime/realtime.routes.js
const router = require("express").Router();
const { requireAuth } = require("../../middleware/requireAuth");
const { createRealtimeClientSecret, exchangeRealtimeOffer } = require("./realtime.service");

const SUPPORTED_VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
]);

router.post("/session", requireAuth, async (req, res) => {
  const { courseId, voice } = req.body;

  const normalizedVoice = (voice || "").toString().trim().toLowerCase();
  const safeVoice = SUPPORTED_VOICES.has(normalizedVoice)
    ? normalizedVoice
    : (process.env.OPENAI_REALTIME_VOICE || "shimmer").toLowerCase();

  try {
    const data = await createRealtimeClientSecret({
      courseId: String(courseId || "").toUpperCase(),
      voice: safeVoice,
    });
    res.json(data);
  } catch (err) {
    console.error("Realtime /session error:", err?.message || err);
    res.status(400).json({ ok: false, error: err?.message || "Realtime session error" });
  }
});

/**
 * ✅ IMPORTANT: This fixes CORS.
 * Browser sends SDP offer here, backend forwards to OpenAI and returns SDP answer.
 */
router.post("/offer", requireAuth, async (req, res) => {
  const { model, offerSdp } = req.body;

  try {
    const answerSdp = await exchangeRealtimeOffer({
      model: String(model || process.env.OPENAI_REALTIME_MODEL || "gpt-realtime"),
      offerSdp: String(offerSdp || ""),
    });
    res.json({ ok: true, answerSdp });
  } catch (err) {
    console.error("Realtime /offer error:", err?.message || err);
    res.status(400).json({ ok: false, error: err?.message || "Realtime offer exchange error" });
  }
});

module.exports = router;