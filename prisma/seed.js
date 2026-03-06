// prisma/seed.js
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

function firstNameOnly(fullName) {
  return String(fullName || "")
    .trim()
    .split(/\s+/)[0]
    .toLowerCase();
}

function emailFor(name) {
  const fn = firstNameOnly(name);
  return `${fn}@canstemeducation.com`;
}

function passwordFor(name) {
  const fn = firstNameOnly(name);
  return `${fn}12345`;
}

async function upsertUser({ name, role }) {
  const email = emailFor(name);
  const rawPw = passwordFor(name);
  const hashed = await bcrypt.hash(rawPw, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      role,
      isActive: true,
    },
    create: {
      email,
      name,
      role,
      password: hashed,
      isActive: true,
    },
  });

  return { user, rawPw };
}

async function upsertCourse({ id, name, description }) {
  const course = await prisma.course.upsert({
    where: { id },
    update: { name, description: description || null, isLive: true },
    create: { id, name, description: description || null, isLive: true },
  });
  return course;
}

function pickRandom(arr, countMin, countMax) {
  const count = Math.floor(Math.random() * (countMax - countMin + 1)) + countMin;
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}

async function main() {
  // 1) Core accounts
  // Admin: admin@canstemeducation.com / admin12345
  const { user: admin, rawPw: adminPw } = await upsertUser({ name: "Admin", role: "admin" });

  // Teachers
  const teacherNames = ["Teacher", "Rimplejeet", "Vibhuti", "Gurleen", "Radhika"];
  const teachers = [];
  for (const n of teacherNames) {
    const { user, rawPw } = await upsertUser({ name: n, role: "teacher" });
    teachers.push({ ...user, rawPw });
  }

  // Students
  const studentNames = [
    "Student",
    "Mahak",
    "Sajjal",
    "Aman",
    "Harpreet",
    "Simran",
    "Jaspreet",
    "Karan",
    "Priya",
    "Neha",
  ];
  const students = [];
  for (const n of studentNames) {
    const { user, rawPw } = await upsertUser({ name: n, role: "student" });
    students.push({ ...user, rawPw });
  }

  // 2) Courses
  const courses = [];
  courses.push(await upsertCourse({ id: "FRE1D", name: "French (FRE1D)", description: "French fundamentals" }));
  courses.push(await upsertCourse({ id: "MHF4U", name: "Advanced Functions (MHF4U)", description: "Functions & transformations" }));
  courses.push(await upsertCourse({ id: "ENG4U", name: "English (ENG4U)", description: "Essay writing & critical reading" }));
  courses.push(await upsertCourse({ id: "MCV4U", name: "Calculus and Vectors (MCV4U)", description: "Calculus + vectors course" }));
  courses.push(await upsertCourse({ id: "SBI4U", name: "Biology (SBI4U)", description: "Grade 12 biology" }));

  // 3) Assign MULTIPLE teachers to each course (1-2 teachers per course)
  for (const c of courses) {
    const chosenTeachers = pickRandom(teachers, 1, 2);
    for (const t of chosenTeachers) {
      await prisma.courseTeacher.upsert({
        where: { courseId_teacherId: { courseId: c.id, teacherId: t.id } },
        update: {},
        create: { courseId: c.id, teacherId: t.id },
      });
    }
  }

  // 4) Enroll students randomly (each student 1–3 courses)
  for (const s of students) {
    const chosenCourses = pickRandom(courses, 1, 3);
    for (const c of chosenCourses) {
      await prisma.enrollment.upsert({
        where: { userId_courseId: { userId: s.id, courseId: c.id } },
        update: { status: "active" },
        create: { userId: s.id, courseId: c.id, status: "active" },
      });
    }
  }

  console.log("✅ Seed complete");
  console.log("---- Login credentials (pattern) ----");
  console.log("Email: firstname@canstemeducation.com");
  console.log("Password: firstname12345 (lowercase firstname)");
  console.log("------------------------------------");
  console.log(`Admin: ${admin.email} / ${adminPw}`);
  console.log("Teachers:");
  teachers.forEach((t) => console.log(`- ${t.email} / ${t.rawPw}`));
  console.log("Students:");
  students.forEach((s) => console.log(`- ${s.email} / ${s.rawPw}`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });