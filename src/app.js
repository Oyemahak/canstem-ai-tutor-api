// src/app.js
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");

const { errorHandler } = require("./middleware/errorHandler");

const authRoutes = require("./modules/auth/auth.routes");
const usersRoutes = require("./modules/users/users.routes");
const coursesRoutes = require("./modules/courses/courses.routes");
const enrollRoutes = require("./modules/enrollments/enrollments.routes");
const filesRoutes = require("./modules/files/files.routes");
const convoRoutes = require("./modules/conversations/conversations.routes");
const tutorRoutes = require("./modules/tutor/tutor.routes");
const realtimeRoutes = require("./modules/realtime/realtime.routes");

const app = express();

// ✅ IMPORTANT (Render / reverse proxies): needed for Secure cookies + correct protocol
app.set("trust proxy", 1);

app.use(helmet());
app.use(morgan("dev"));

app.use(
  cors({
    origin: (process.env.CORS_ORIGIN || "http://localhost:3000")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 240,
  })
);

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/courses", coursesRoutes);
app.use("/api/enrollments", enrollRoutes);
app.use("/api/files", filesRoutes);
app.use("/api/conversations", convoRoutes);
app.use("/api/tutor", tutorRoutes);
app.use("/api/realtime", realtimeRoutes);

app.use(errorHandler);

module.exports = app;