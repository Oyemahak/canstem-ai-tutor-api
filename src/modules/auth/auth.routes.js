const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { prisma } = require("../../db/prisma");
const { requireAuth } = require("../../middleware/requireAuth");

function isProd() {
  return process.env.NODE_ENV === "production";
}

function cookieOptions() {
  const prod = isProd();
  return {
    httpOnly: true,
    secure: prod,                 // ✅ must be true on https (Render)
    sameSite: prod ? "none" : "lax", // ✅ cross-site cookie for Vercel -> Render
    path: "/",                    // ✅ important for clearCookie consistency
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

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

  res.cookie(cookieName, token, cookieOptions());

  res.json({
    ok: true,
    user: { id: user.id, email: user.email, role: user.role, name: user.name },
  });
});

router.post("/logout", (req, res) => {
  const cookieName = process.env.COOKIE_NAME || "canstem_session";

  // ✅ must match sameSite/secure/path used on set
  res.clearCookie(cookieName, cookieOptions());

  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => res.json({ ok: true, user: req.user }));

module.exports = router;