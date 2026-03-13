// src/utils/extractText.js
const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const pptx2json = require("pptx2json");

async function extractTextFromPdf(filePath) {
  const buf = fs.readFileSync(filePath);
  const data = await pdfParse(buf);
  return data.text || "";
}

async function extractTextFromDocx(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value || "";
}

async function extractTextFromTxt(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

async function extractTextFromPptx(filePath) {
  // pptx2json returns slide objects; we pull all text runs
  const json = await pptx2json(filePath);
  const slides = json?.slides || [];
  const texts = [];

  for (const s of slides) {
    const elements = s?.elements || [];
    for (const el of elements) {
      // Some pptx2json outputs use `text` or nested runs; handle both
      if (typeof el?.text === "string") texts.push(el.text);
      if (Array.isArray(el?.runs)) {
        for (const r of el.runs) {
          if (typeof r?.text === "string") texts.push(r.text);
        }
      }
    }
  }

  return texts.join("\n");
}

async function extractText({ filePath, mimeType, originalName }) {
  const ext = path.extname(originalName || "").toLowerCase();

  if (mimeType === "application/pdf" || ext === ".pdf") return extractTextFromPdf(filePath);
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === ".docx"
  ) {
    return extractTextFromDocx(filePath);
  }
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    ext === ".pptx"
  ) {
    return extractTextFromPptx(filePath);
  }
  if (mimeType?.startsWith("text/") || ext === ".txt") return extractTextFromTxt(filePath);

  throw new Error(`Unsupported file type: ${mimeType || ext}`);
}

module.exports = { extractText };