const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { prisma } = require("../../db/prisma");
const { requireAuth } = require("../../middleware/requireAuth");

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({
    where: { email: String(email).trim().toLowerCase() },
  });

  if (!user || !user.isActive) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(String(password), user.password);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  const cookieName = process.env.COOKIE_NAME || "canstem_session";
  res.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  res.json({ ok: true, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
});

router.post("/logout", (req, res) => {
  const cookieName = process.env.COOKIE_NAME || "canstem_session";
  res.clearCookie(cookieName);
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => res.json({ ok: true, user: req.user }));

module.exports = router;