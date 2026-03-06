const OpenAI = require("openai");

function mockAnswer(courseId, text) {
  return `(${courseId}) ✅ Backend is connected.\n\nYou asked: "${text}"\n\nNext step: add OPENAI_API_KEY + indexing so I answer from uploaded course materials.`;
}

async function buildTutorAnswer({ course, userMessage }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { answer: mockAnswer(course.id, userMessage), sources: [] };

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_TEXT_MODEL || "gpt-5";

  const system = `You are CanSTEM AI Tutor for course ${course.id}.
Rules:
- Answer ONLY from course materials via file_search.
- If not found, say you don't have it in the course content.
- Be clear, step-by-step, student-friendly.`;

  const tools = course.vectorStoreId
    ? [{ type: "file_search", vector_store_ids: [course.vectorStoreId] }]
    : [];

  const resp = await client.responses.create({
    model,
    input: [
      { role: "system", content: system },
      { role: "user", content: userMessage }
    ],
    tools,
  });

  return { answer: resp.output_text || "No response.", sources: [] };
}

module.exports = { buildTutorAnswer };