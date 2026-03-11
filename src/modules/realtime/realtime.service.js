// src/modules/realtime/realtime.service.js

async function createRealtimeClientSecret({ courseId, voice }) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime";
  const resolvedVoice = (voice || process.env.OPENAI_REALTIME_VOICE || "shimmer")
    .toString()
    .trim()
    .toLowerCase();

  if (!apiKey) {
    return {
      ok: true,
      mock: true,
      courseId,
      model,
      voice: resolvedVoice,
      client_secret: { value: "MOCK_EPHEMERAL_KEY", expires_at: Date.now() + 60_000 },
    };
  }

  // GA client secret
  const resp = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model,
        audio: { output: { voice: resolvedVoice } },
      },
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Realtime client_secret failed (${resp.status}): ${t || "Unknown error"}`);
  }

  const data = await resp.json();

  return {
    ok: true,
    mock: false,
    courseId,
    model,
    voice: resolvedVoice,
    client_secret: { value: data.value, expires_at: data.expires_at || null },
  };
}

/**
 * ✅ CORS FIX: backend-to-OpenAI SDP exchange
 * Browser cannot call /v1/realtime/calls directly due to CORS.
 */
async function exchangeRealtimeOffer({ model, offerSdp }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  if (!offerSdp || offerSdp.length < 20) {
    throw new Error("Invalid offer SDP");
  }

  const resp = await fetch(
    `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(model)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/sdp",
      },
      body: offerSdp,
    }
  );

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Realtime connect failed (${resp.status}): ${t || "Unknown error"}`);
  }

  const answerSdp = await resp.text();
  return answerSdp;
}

module.exports = { createRealtimeClientSecret, exchangeRealtimeOffer };