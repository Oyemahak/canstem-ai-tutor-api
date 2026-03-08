// src/modules/tutor/openaiCourseStore.js
const fs = require("fs");
const { prisma } = require("../../db/prisma");
const { openai } = require("../../config/openai");

async function ensureCourseVectorStore(courseId) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw new Error("Course not found");

  if (course.vectorStoreId) return course.vectorStoreId;

  const vs = await openai.vectorStores.create({
    name: `CanSTEM ${courseId} Knowledge Base`,
  });

  await prisma.course.update({
    where: { id: courseId },
    data: { vectorStoreId: vs.id },
  });

  return vs.id;
}

async function uploadCourseFileToOpenAI({ courseId, fileId }) {
  const file = await prisma.courseFile.findUnique({ where: { id: fileId } });
  if (!file) throw new Error("File not found");

  // already uploaded
  if (file.openaiFileId) return file.openaiFileId;

  const vsId = await ensureCourseVectorStore(courseId);

  // Upload file content to OpenAI
  const uploaded = await openai.files.create({
    file: fs.createReadStream(file.storagePath),
    purpose: "assistants", // required for file search usage
  });

  // Attach to vector store (index it)
  await openai.vectorStores.files.create(vsId, {
    file_id: uploaded.id,
  });

  await prisma.courseFile.update({
    where: { id: fileId },
    data: { openaiFileId: uploaded.id },
  });

  return uploaded.id;
}

module.exports = {
  ensureCourseVectorStore,
  uploadCourseFileToOpenAI,
};