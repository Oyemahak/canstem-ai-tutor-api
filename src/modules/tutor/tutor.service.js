// src/modules/tutor/tutor.service.js
const OpenAI = require("openai");
const { prisma } = require("../../db/prisma");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function safeModel() {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

function courseLanguage(courseId) {
  if (String(courseId || "").toUpperCase() === "FRE1D") return "fr";
  return "en";
}

// Minimal abuse/offensive detection (kept light to avoid false positives)
function looksAbusive(text) {
  const t = String(text || "").toLowerCase();
  const patterns = [
    /\b(fuck|shit|bitch|asshole|cunt)\b/i,
    /\b(kill yourself|suicide)\b/i,
    /\b(nigger|faggot)\b/i,
  ];
  return patterns.some((re) => re.test(t));
}

function buildCoreSystemPrompt({ course, lang }) {
  const langRule =
    lang === "fr"
      ? "Réponds UNIQUEMENT en français (français canadien). Ne change jamais de langue."
      : "Respond ONLY in English (Canadian). Never switch languages.";

  return `
You are CanSTEM AI Tutor for course ${course.id} (${course.name || "Course"}).

LANGUAGE (must follow):
- ${langRule}

COURSE SCOPE:
- You are dedicated to ${course.id}. Always keep the conversation within this course.
- If the user asks something unrelated: DO NOT answer the unrelated topic.
  Instead: briefly explain you are the ${course.id} tutor and redirect with 2 examples of valid course questions.

MATERIALS-FIRST RULE:
- When course materials are available via File Search, use them as the primary source of truth.
- If you cannot find the answer in the uploaded materials, you MUST say: "Not found in your uploaded course materials yet."
- In that case, still help using a course-appropriate method/approach (steps, formulas, outline, checklist),
  but do NOT claim specific facts that would require the missing materials.
- Ask one follow-up: Unit/Topic/Page/Worksheet name so the teacher can upload it.

TUTOR QUALITY:
- Step-by-step, student-friendly, concise.
- If student requests a quiz: ask ONE question at a time and wait for the answer before continuing.
- Use clean markdown formatting (headings, bullets, numbered steps).
`.trim();
}

function buildFallbackSystemPrompt({ course, lang }) {
  // Used ONLY when no useful materials/citations were found
  const langRule =
    lang === "fr"
      ? "Réponds UNIQUEMENT en français (français canadien)."
      : "Respond ONLY in English (Canadian).";

  return `
You are CanSTEM AI Tutor for course ${course.id} (${course.name || "Course"}).

${langRule}

IMPORTANT:
- The student asked something, but it was NOT found in uploaded course materials.
- You must still answer helpfully without inventing course-specific facts.
- Provide a course-appropriate method: steps, approach, how to solve, what to look for, common mistakes.
- Give a generic example (clearly labeled as example).
- Start your response with:
  "**Not found in your uploaded course materials yet.**"
- End by asking for Unit/Topic/Page/Worksheet name so the teacher can upload the missing material.

If the question is clearly unrelated to ${course.id}, do NOT answer it.
Redirect back to the course with examples.
`.trim();
}

function extractAnswerAndSources(resp) {
  let answer = "";
  const sources = [];

  if (typeof resp.output_text === "string" && resp.output_text.trim()) {
    answer = resp.output_text.trim();
  }

  // Best-effort citation extraction
  try {
    for (const item of resp.output || []) {
      if (item.type !== "message") continue;
      for (const part of item.content || []) {
        if (part.type !== "output_text") continue;

        if (!answer && typeof part.text === "string") answer = part.text;

        if (Array.isArray(part.annotations)) {
          for (const a of part.annotations) {
            if (a?.type === "file_citation" && a.file_id) {
              sources.push({
                type: "file_citation",
                file_id: a.file_id,
                quote: a.quote || null,
              });
            }
          }
        }
      }
    }
  } catch {}

  return {
    answer: (answer || "").trim(),
    sources,
  };
}

async function buildTutorAnswer({ course, conversationId, userMessage }) {
  const model = safeModel();
  const lang = courseLanguage(course.id);

  // Light safety behavior
  if (looksAbusive(userMessage)) {
    const msg =
      lang === "fr"
        ? `Je ne peux pas aider avec un langage offensant.\n\nVeuillez poser une question liée au cours **${course.id}**.\n\nExemples:\n- "Explique la notion ___ (Unité 1)"\n- "Aide-moi avec la question 3 de la fiche ___"`
        : `I can’t help with offensive language.\n\nPlease ask a question related to **${course.id}** course content.\n\nExamples:\n- "Explain ___ from Unit 1"\n- "Help me solve Question 3 from worksheet ___"`;
    return { answer: msg, sources: [], mode: "blocked" };
  }

  // Load recent conversation history to support “wait for reply” quizzes
  const history = conversationId
    ? await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: "asc" },
        take: 24,
        select: { role: true, content: true },
      })
    : [];

  // If no vector store yet, we can only do fallback-style help
  if (!course.vectorStoreId) {
    const sys = buildFallbackSystemPrompt({ course, lang });
    const resp = await openai.responses.create({
      model,
      input: [
        { role: "system", content: sys },
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: String(userMessage) },
      ],
      temperature: 0.2,
      max_output_tokens: 800,
    });

    const out = extractAnswerAndSources(resp);
    return {
      answer:
        out.answer ||
        (lang === "fr"
          ? `**Not found in your uploaded course materials yet.**\n\nQuel est l’unité/page/fiche ?`
          : `**Not found in your uploaded course materials yet.**\n\nWhich unit/page/worksheet is this from?`),
      sources: [],
      mode: "no_vector_store_fallback",
    };
  }

  // ----------- PASS 1: MATERIALS-FIRST (file_search) -----------
  const sys1 = buildCoreSystemPrompt({ course, lang });

  const resp1 = await openai.responses.create({
    model,
    input: [
      { role: "system", content: sys1 },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: String(userMessage) },
    ],
    tools: [
      {
        type: "file_search",
        vector_store_ids: [course.vectorStoreId],
      },
    ],
    temperature: 0.2,
    max_output_tokens: 900,
  });

  const out1 = extractAnswerAndSources(resp1);

  // If we found citations, treat as “materials-based” answer
  if ((out1.sources || []).length > 0 && out1.answer) {
    return { answer: out1.answer, sources: out1.sources, mode: "materials_first" };
  }

  // ----------- PASS 2: COURSE-STYLE FALLBACK (no hallucination) -----------
  // Still answers, but explicitly says not found in materials.
  const sys2 = buildFallbackSystemPrompt({ course, lang });

  const resp2 = await openai.responses.create({
    model,
    input: [
      { role: "system", content: sys2 },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: String(userMessage) },
    ],
    temperature: 0.2,
    max_output_tokens: 900,
  });

  const out2 = extractAnswerAndSources(resp2);

  const fallbackAnswer =
    out2.answer ||
    (lang === "fr"
      ? `**Not found in your uploaded course materials yet.**\n\nDis-moi l’unité/page/fiche, et je vais t’aider étape par étape.`
      : `**Not found in your uploaded course materials yet.**\n\nTell me the unit/page/worksheet and I’ll help step-by-step.`);

  return { answer: fallbackAnswer, sources: [], mode: "fallback" };
}

module.exports = { buildTutorAnswer };