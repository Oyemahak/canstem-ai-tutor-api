const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const { prisma } = require("../../db/prisma");
const { requireAuth } = require("../../middleware/requireAuth");
const { requireRole } = require("../../middleware/requireRole");

/**
 * ADMIN ONLY:
 * - List users
 * - Create users (student/teacher/admin)
 * - Update user (role/status/name)
 * - Reset password
 */

// List all users
router.get("/", requireAuth, requireRole(["admin"]), async (req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({ users });
});

// Create new user
router.post("/", requireAuth, requireRole(["admin"]), async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    name: z.string().optional(),
    role: z.enum(["student", "teacher", "admin"]),
    password: z.string().min(8),
  });

  const data = schema.parse(req.body);

  const hashed = await bcrypt.hash(data.password, 10);

  const user = await prisma.user.create({
    data: {
      email: data.email.toLowerCase(),
      name: data.name || null,
      role: data.role,
      password: hashed,
    },
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
  });

  res.json({ ok: true, user });
});

// Update user (role/status/name)
router.patch("/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
  const schema = z.object({
    name: z.string().optional(),
    role: z.enum(["student", "teacher", "admin"]).optional(),
    isActive: z.boolean().optional(),
  });

  const data = schema.parse(req.body);

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      ...(typeof data.name !== "undefined" ? { name: data.name } : {}),
      ...(typeof data.role !== "undefined" ? { role: data.role } : {}),
      ...(typeof data.isActive !== "undefined" ? { isActive: data.isActive } : {}),
    },
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
  });

  res.json({ ok: true, user });
});

// Reset user password
router.patch("/:id/password", requireAuth, requireRole(["admin"]), async (req, res) => {
  const schema = z.object({
    password: z.string().min(8),
  });

  const data = schema.parse(req.body);

  const hashed = await bcrypt.hash(data.password, 10);

  await prisma.user.update({
    where: { id: req.params.id },
    data: { password: hashed },
  });

  res.json({ ok: true });
});

// Optional: delete user (I recommend disabling instead, but keeping this here)
router.delete("/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
  // safer: disable user instead of deleting
  await prisma.user.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });

  res.json({ ok: true });
});

module.exports = router;