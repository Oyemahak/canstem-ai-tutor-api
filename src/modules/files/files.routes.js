const router = require("express").Router();
const path = require("path");
const multer = require("multer");
const { prisma } = require("../../db/prisma");
const { requireAuth } = require("../../middleware/requireAuth");
const { requireRole } = require("../../middleware/requireRole");

const upload = multer({
  dest: path.join(process.cwd(), "uploads"),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB
});

async function canManageCourse(req, courseId) {
  if (req.user.role === "admin") return true;
  if (req.user.role !== "teacher") return false;

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  return !!course && course.teacherId === req.user.id;
}

// list files for a course (any logged-in user can view)
router.get("/course/:courseId", requireAuth, async (req, res) => {
  const courseId = req.params.courseId.toUpperCase();

  const files = await prisma.courseFile.findMany({
    where: { courseId },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
      uploader: { select: { email: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({ files });
});

// upload file (teacher/admin)
router.post(
  "/course/:courseId",
  requireAuth,
  requireRole(["teacher", "admin"]),
  upload.single("file"),
  async (req, res) => {
    const courseId = req.params.courseId.toUpperCase();
    if (!(await canManageCourse(req, courseId))) return res.status(403).json({ error: "Forbidden" });

    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const file = await prisma.courseFile.create({
      data: {
        courseId,
        uploaderId: req.user.id,
        originalName: req.file.originalname,
        storagePath: req.file.path,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
      },
    });

    // Later: upload to OpenAI + attach to course vector store
    res.json({ ok: true, file });
  }
);

// delete file (teacher/admin)
router.delete("/:fileId", requireAuth, requireRole(["teacher", "admin"]), async (req, res) => {
  const file = await prisma.courseFile.findUnique({ where: { id: req.params.fileId } });
  if (!file) return res.status(404).json({ error: "File not found" });

  if (!(await canManageCourse(req, file.courseId))) return res.status(403).json({ error: "Forbidden" });

  // Later: remove from OpenAI vector store if file.openaiFileId exists
  await prisma.courseFile.delete({ where: { id: file.id } });

  res.json({ ok: true });
});

module.exports = router;