// src/lib/openaiClient.js
const OpenAI = require("openai");

function getOpenAIClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is missing in .env");
  return new OpenAI({ apiKey: key });
}

function getModel() {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

module.exports = { getOpenAIClient, getModel };