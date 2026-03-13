// src/modules/files/files.routes.js
const router = require("express").Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const OpenAI = require("openai");
const { prisma } = require("../../db/prisma");
const { requireAuth } = require("../../middleware/requireAuth");
const { requireRole } = require("../../middleware/requireRole");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// =====================
// Upload config
// =====================
// We can't do "infinite" safely, so we set a VERY HIGH limit.
// You can raise MAX_FILES if you want.
const MAX_FILES = 500;

const upload = multer({
  dest: path.join(process.cwd(), "uploads"),
  limits: {
    fileSize: 30 * 1024 * 1024, // ✅ keep 30MB each (same as before)
    files: MAX_FILES, // ✅ allow lots of files
  },
});

// ✅ Clean multer error responses (prevents 500 crashes)
function multerArray(fieldName, maxCount) {
  return (req, res, next) => {
    upload.array(fieldName, maxCount)(req, res, (err) => {
      if (!err) return next();

      // Multer known errors
      if (err instanceof multer.MulterError) {
        const code = err.code || "MULTER_ERROR";
        let msg = err.message;

        if (code === "LIMIT_FILE_SIZE") msg = "One of the files is larger than 30MB.";
        if (code === "LIMIT_FILE_COUNT") msg = `Too many files selected. Max allowed: ${MAX_FILES}`;
        if (code === "LIMIT_UNEXPECTED_FILE") msg = "Unexpected file field or too many files selected.";

        return res.status(400).json({ ok: false, error: msg, code });
      }

      // Other errors
      return res.status(400).json({ ok: false, error: err.message || "Upload error" });
    });
  };
}

// ✅ Multi-teacher permission check
async function canManageCourse(req, courseId) {
  if (req.user.role === "admin") return true;
  if (req.user.role !== "teacher") return false;

  const row = await prisma.courseTeacher.findUnique({
    where: { courseId_teacherId: { courseId, teacherId: req.user.id } },
    select: { courseId: true },
  });

  return !!row;
}

async function ensureVectorStore(courseId) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, vectorStoreId: true },
  });
  if (!course) throw new Error("Course not found");

  if (course.vectorStoreId) return course.vectorStoreId;

  const vs = await openai.vectorStores.create({
    name: `Course ${courseId} Vector Store`,
  });

  await prisma.course.update({
    where: { id: courseId },
    data: { vectorStoreId: vs.id },
  });

  return vs.id;
}

// ✅ List files (admin or assigned teacher)
router.get(
  "/course/:courseId",
  requireAuth,
  requireRole(["admin", "teacher"]),
  async (req, res) => {
    const courseId = req.params.courseId.toUpperCase();
    if (!(await canManageCourse(req, courseId))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const files = await prisma.courseFile.findMany({
      where: { courseId },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        topic: true,
        openaiFileId: true,
        createdAt: true,
        uploader: { select: { email: true, role: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ ok: true, files });
  }
);

// ✅ Upload MANY files with optional topic + index to OpenAI vector store
router.post(
  "/course/:courseId",
  requireAuth,
  requireRole(["teacher", "admin"]),
  multerArray("files", MAX_FILES), // ✅ higher limit + safe error handling
  async (req, res) => {
    const courseId = req.params.courseId.toUpperCase();
    if (!(await canManageCourse(req, courseId))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const uploaded = req.files || [];
    if (!uploaded.length) return res.status(400).json({ error: "No files uploaded" });

    const topic = req.body?.topic ? String(req.body.topic).trim() : null;

    // If key missing, still save DB rows, but skip OpenAI indexing
    const hasOpenAI = !!process.env.OPENAI_API_KEY;

    // 1) Ensure vector store exists (for this course)
    let vectorStoreId = null;
    if (hasOpenAI) {
      try {
        vectorStoreId = await ensureVectorStore(courseId);
      } catch (e) {
        return res.status(500).json({ error: `Vector store error: ${e.message}` });
      }
    }

    // 2) Save DB rows first
    const createdRows = await prisma.$transaction(
      uploaded.map((f) =>
        prisma.courseFile.create({
          data: {
            courseId,
            uploaderId: req.user.id,
            originalName: f.originalname,
            storagePath: f.path,
            mimeType: f.mimetype,
            sizeBytes: f.size,
            topic: topic || null,
          },
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            topic: true,
            createdAt: true,
            storagePath: true,
          },
        })
      )
    );

    // 3) Index each file into the vector store (best-effort)
    const indexed = [];
    const failed = [];

    if (hasOpenAI && vectorStoreId) {
      for (const row of createdRows) {
        try {
          const fileStream = fs.createReadStream(row.storagePath);

          const of = await openai.files.create({
            file: fileStream,
            purpose: "assistants",
          });

          await openai.vectorStores.files.create(vectorStoreId, {
            file_id: of.id,
          });

          await prisma.courseFile.update({
            where: { id: row.id },
            data: { openaiFileId: of.id },
          });

          indexed.push({ id: row.id, openaiFileId: of.id });
        } catch (e) {
          failed.push({ id: row.id, error: e.message });
        }
      }
    }

    res.json({
      ok: true,
      courseId,
      vectorStoreId: vectorStoreId || null,
      topic,
      files: createdRows.map((r) => ({
        id: r.id,
        originalName: r.originalName,
        mimeType: r.mimeType,
        sizeBytes: r.sizeBytes,
        topic: r.topic,
        createdAt: r.createdAt,
      })),
      indexed,
      failed,
      note: !hasOpenAI
        ? "OPENAI_API_KEY missing: files saved, OpenAI indexing skipped."
        : undefined,
    });
  }
);

// ✅ Delete material (admin or assigned teacher)
// Also removes from vector store if openaiFileId exists (best-effort)
router.delete(
  "/:fileId",
  requireAuth,
  requireRole(["teacher", "admin"]),
  async (req, res) => {
    const file = await prisma.courseFile.findUnique({
      where: { id: req.params.fileId },
      select: { id: true, courseId: true, openaiFileId: true, storagePath: true },
    });
    if (!file) return res.status(404).json({ error: "File not found" });

    if (!(await canManageCourse(req, file.courseId))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const course = await prisma.course.findUnique({
      where: { id: file.courseId },
      select: { vectorStoreId: true },
    });

    if (process.env.OPENAI_API_KEY && course?.vectorStoreId && file.openaiFileId) {
      try {
        await openai.vectorStores.files.del(course.vectorStoreId, file.openaiFileId);
      } catch {}
      try {
        await openai.files.del(file.openaiFileId);
      } catch {}
    }

    // Best-effort local cleanup
    try {
      if (file.storagePath && fs.existsSync(file.storagePath)) fs.unlinkSync(file.storagePath);
    } catch {}

    await prisma.courseFile.delete({ where: { id: file.id } });
    res.json({ ok: true });
  }
);

module.exports = router;