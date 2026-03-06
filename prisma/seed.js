const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const pw = await bcrypt.hash("CanSTEM@123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@canstemeducation.com" },
    update: {},
    create: { email: "admin@canstemeducation.com", name: "Admin", role: "admin", password: pw },
  });

  const teacher = await prisma.user.upsert({
    where: { email: "teacher@canstemeducation.com" },
    update: {},
    create: { email: "teacher@canstemeducation.com", name: "Teacher", role: "teacher", password: pw },
  });

  const student = await prisma.user.upsert({
    where: { email: "student@canstemeducation.com" },
    update: {},
    create: { email: "student@canstemeducation.com", name: "Student", role: "student", password: pw },
  });

  await prisma.course.upsert({
    where: { id: "FRE1D" },
    update: { teacherId: teacher.id },
    create: { id: "FRE1D", name: "French (FRE1D)", description: "French fundamentals", teacherId: teacher.id },
  });

  await prisma.enrollment.upsert({
    where: { userId_courseId: { userId: student.id, courseId: "FRE1D" } },
    update: { status: "active" },
    create: { userId: student.id, courseId: "FRE1D" },
  });

  console.log("✅ Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());