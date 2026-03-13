-- CreateTable
CREATE TABLE "CourseMaterialChunk" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "fileId" TEXT,
    "title" TEXT,
    "topic" TEXT,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseMaterialChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseMaterialChunk_courseId_idx" ON "CourseMaterialChunk"("courseId");

-- CreateIndex
CREATE INDEX "CourseMaterialChunk_fileId_idx" ON "CourseMaterialChunk"("fileId");

-- CreateIndex
CREATE INDEX "CourseMaterialChunk_courseId_topic_idx" ON "CourseMaterialChunk"("courseId", "topic");

-- AddForeignKey
ALTER TABLE "CourseMaterialChunk" ADD CONSTRAINT "CourseMaterialChunk_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMaterialChunk" ADD CONSTRAINT "CourseMaterialChunk_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "CourseFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

