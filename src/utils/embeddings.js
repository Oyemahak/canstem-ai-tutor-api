// src/utils/embeddings.js
const OpenAI = require("openai");

function getClient() {
  if (!process.env.OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// Keep this simple and cheap for MVP
const DEFAULT_EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";

async function embedText(text) {
  const client = getClient();
  const input = String(text || "").slice(0, 8000); // safety
  const res = await client.embeddings.create({
    model: DEFAULT_EMBED_MODEL,
    input,
  });
  return res.data[0].embedding;
}

module.exports = { embedText, DEFAULT_EMBED_MODEL };