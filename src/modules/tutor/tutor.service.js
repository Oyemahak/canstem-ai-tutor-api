const OpenAI = require("openai");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function safeModel() {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

function buildSystemPrompt(course) {
  return `
You are CanSTEM AI Tutor for course ${course.id}.
Rules:
- Prefer course materials when available.
- If the materials do not contain the answer, say so briefly and give a helpful general explanation.
- Be accurate, step-by-step, and student-friendly.
- If you are uncertain, ask a short clarifying question.
`.trim();
}

async function buildTutorAnswer({ course, userMessage }) {
  const model = safeModel();

  // If we have a vector store, use file_search tool
  const tools = [];
  if (course.vectorStoreId) {
    tools.push({
      type: "file_search",
      vector_store_ids: [course.vectorStoreId],
    });
  }

  // Responses API
  const resp = await openai.responses.create({
    model,
    input: [
      { role: "system", content: buildSystemPrompt(course) },
      { role: "user", content: userMessage },
    ],
    tools,
  });

  // Text output
  const answer =
    resp.output_text ||
    "I couldn’t generate a response. Please try again.";

  // Best-effort citations (file_search results often include annotations)
  // Keep it simple: return empty array if none
  const sources = [];

  // Try to extract citations if present
  try {
    for (const item of resp.output || []) {
      if (item.type === "message") {
        for (const c of item.content || []) {
          if (c.type === "output_text" && Array.isArray(c.annotations)) {
            for (const a of c.annotations) {
              if (a.type === "file_citation" && a.file_id) {
                sources.push({ file_id: a.file_id });
              }
            }
          }
        }
      }
    }
  } catch {}

  return { answer, sources };
}

module.exports = { buildTutorAnswer };