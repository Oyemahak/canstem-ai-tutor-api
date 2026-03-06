const jwt = require("jsonwebtoken");
const { prisma } = require("../db/prisma");

async function requireAuth(req, res, next) {
  try {
    const cookieName = process.env.COOKIE_NAME || "canstem_session";
    const token = req.cookies[cookieName];
    if (!token) return res.status(401).json({ error: "Not authenticated" });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user || !user.isActive) return res.status(401).json({ error: "Invalid session" });

    req.user = { id: user.id, role: user.role, email: user.email, name: user.name };
    next();
  } catch {
    res.status(401).json({ error: "Not authenticated" });
  }
}

module.exports = { requireAuth };