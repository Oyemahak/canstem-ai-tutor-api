// src/utils/chunkText.js
function chunkText(text, { chunkSize = 1200, overlap = 200 } = {}) {
  const clean = String(text || "").replace(/\r/g, "").trim();
  if (!clean) return [];

  const chunks = [];
  let start = 0;

  while (start < clean.length) {
    const end = Math.min(start + chunkSize, clean.length);
    const slice = clean.slice(start, end);

    chunks.push(slice.trim());
    if (end === clean.length) break;

    start = Math.max(0, end - overlap);
  }

  return chunks.filter(Boolean);
}

module.exports = { chunkText };