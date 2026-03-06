// src/modules/users/users.routes.js
const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const { prisma } = require("../../db/prisma");
const { requireAuth } = require("../../middleware/requireAuth");
const { requireRole } = require("../../middleware/requireRole");

function zodErrorToMessage(zodError) {
  const first = zodError.issues?.[0];
  if (!first) return "Invalid input.";
  const field = first.path?.[0] ? String(first.path[0]) : "field";
  return `${field}: ${first.message}`;
}

/**
 * ADMIN ONLY:
 * - List users
 * - Search users (name/email) for autocomplete
 * - Create users
 * - Update user
 * - Reset password
 * - Disable user (soft delete)
 * - Force delete user (permanent)
 */

// List users
router.get("/", requireAuth, requireRole(["admin"]), async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ users });
});

// ✅ Search users (autocomplete)
// GET /api/users/search?q=mahak&role=student
router.get("/search", requireAuth, requireRole(["admin"]), async (req, res) => {
  const q = String(req.query.q || "").trim();
  const role = String(req.query.role || "").trim(); // student|teacher|admin optional

  if (!q) return res.json({ users: [] });

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      ...(role ? { role } : {}),
      OR: [
        { email: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, email: true, name: true, role: true },
    take: 10,
    orderBy: { createdAt: "desc" },
  });

  res.json({ users });
});

// Create user
router.post("/", requireAuth, requireRole(["admin"]), async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    name: z.string().optional(),
    role: z.enum(["student", "teacher", "admin"]),
    password: z.string().min(8, "Password must be at least 8 characters."),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodErrorToMessage(parsed.error) });

  const data = parsed.data;
  const email = data.email.toLowerCase();

  try {
    const hashed = await bcrypt.hash(data.password, 10);

    const user = await prisma.user.create({
      data: { email, name: data.name || null, role: data.role, password: hashed },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    });

    res.json({ ok: true, user });
  } catch (e) {
    if (e?.code === "P2002") return res.status(409).json({ error: "Email already exists." });
    console.error(e);
    return res.status(500).json({ error: "Failed to create user." });
  }
});

// Update user
router.patch("/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
  const schema = z.object({
    name: z.string().optional(),
    role: z.enum(["student", "teacher", "admin"]).optional(),
    isActive: z.boolean().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodErrorToMessage(parsed.error) });

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: parsed.data,
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
  });

  res.json({ ok: true, user });
});

// Reset password
router.patch("/:id/password", requireAuth, requireRole(["admin"]), async (req, res) => {
  const schema = z.object({
    password: z.string().min(8, "Password must be at least 8 characters."),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodErrorToMessage(parsed.error) });

  const hashed = await bcrypt.hash(parsed.data.password, 10);

  await prisma.user.update({
    where: { id: req.params.id },
    data: { password: hashed },
  });

  res.json({ ok: true });
});

// Disable user (soft delete)
router.delete("/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
  await prisma.user.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });

  res.json({ ok: true });
});

// ✅ Force delete user (permanent)
router.delete("/:id/force", requireAuth, requireRole(["admin"]), async (req, res) => {
  const id = req.params.id;

  // safety: don't let admin delete themselves
  if (req.user?.id === id) {
    return res.status(400).json({ error: "You cannot permanently delete your own account." });
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { role: true, isActive: true },
  });
  if (!target) return res.status(404).json({ error: "User not found." });

  // safety: block deleting last active admin
  if (target.role === "admin" && target.isActive) {
    const activeAdmins = await prisma.user.count({ where: { role: "admin", isActive: true } });
    if (activeAdmins <= 1) {
      return res.status(400).json({ error: "Cannot delete the last active admin." });
    }
  }

  // with onDelete: Cascade in schema, related enrollments/messages etc will be deleted automatically
  await prisma.user.delete({ where: { id } });

  res.json({ ok: true });
});

module.exports = router;