const OpenAI = require("openai");

async function createRealtimeSession({ courseId }) {
  const apiKey = process.env.OPENAI_API_KEY;

  // allow testing without key
  if (!apiKey) {
    return {
      ok: true,
      mock: true,
      courseId,
      model: process.env.OPENAI_REALTIME_MODEL || "gpt-5-realtime-preview",
      voice: process.env.OPENAI_REALTIME_VOICE || "alloy",
      client_secret: { value: "MOCK_EPHEMERAL_KEY", expires_at: Date.now() + 60_000 },
    };
  }

  const client = new OpenAI({ apiKey });

  const session = await client.realtime.sessions.create({
    model: process.env.OPENAI_REALTIME_MODEL || "gpt-5-realtime-preview",
    voice: process.env.OPENAI_REALTIME_VOICE || "alloy",
  });

  return {
    ok: true,
    mock: false,
    courseId,
    model: session.model,
    voice: session.voice,
    client_secret: session.client_secret,
  };
}

module.exports = { createRealtimeSession };