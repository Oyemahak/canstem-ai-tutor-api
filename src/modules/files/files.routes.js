// src/modules/files/files.routes.js
const router = require("express").Router();
const path = require("path");
const multer = require("multer");
const { prisma } = require("../../db/prisma");
const { requireAuth } = require("../../middleware/requireAuth");
const { requireRole } = require("../../middleware/requireRole");

// Store uploads locally (Render disk is ephemeral; later switch to S3/Spaces)
const upload = multer({
  dest: path.join(process.cwd(), "uploads"),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB each
});

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

// ✅ List files (admin or assigned teacher; students not allowed here)
router.get(
  "/course/:courseId",
  requireAuth,
  requireRole(["admin", "teacher"]),
  async (req, res) => {
    const courseId = req.params.courseId.toUpperCase();
    if (!(await canManageCourse(req, courseId))) return res.status(403).json({ error: "Forbidden" });

    const files = await prisma.courseFile.findMany({
      where: { courseId },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        topic: true,
        createdAt: true,
        uploader: { select: { email: true, role: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ files });
  }
);

// ✅ Upload MULTIPLE files with optional topic
// Frontend should send: fd.append("files", file1), fd.append("files", file2), ... and fd.append("topic", "...optional...")
router.post(
  "/course/:courseId",
  requireAuth,
  requireRole(["teacher", "admin"]),
  upload.array("files", 20), // up to 20 files per request
  async (req, res) => {
    const courseId = req.params.courseId.toUpperCase();
    if (!(await canManageCourse(req, courseId))) return res.status(403).json({ error: "Forbidden" });

    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: "No files uploaded" });

    const topic = req.body?.topic ? String(req.body.topic).trim() : null;

    const created = await prisma.$transaction(
      files.map((f) =>
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
          },
        })
      )
    );

    res.json({ ok: true, files: created });
  }
);

// ✅ Delete material (admin or assigned teacher)
router.delete("/:fileId", requireAuth, requireRole(["teacher", "admin"]), async (req, res) => {
  const file = await prisma.courseFile.findUnique({
    where: { id: req.params.fileId },
    select: { id: true, courseId: true },
  });
  if (!file) return res.status(404).json({ error: "File not found" });

  if (!(await canManageCourse(req, file.courseId))) return res.status(403).json({ error: "Forbidden" });

  await prisma.courseFile.delete({ where: { id: file.id } });
  res.json({ ok: true });
});

module.exports = router;