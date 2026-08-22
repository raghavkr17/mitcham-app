// =========================================================
// Mitcham API — Express app entry
// =========================================================
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const session = require("express-session");
const rateLimit = require("express-rate-limit");
const { passport } = require("./auth");
const { pool } = require("./db");

const authRoutes = require("./routes/auth");
const vendorRoutes = require("./routes/vendors");
const listingRoutes = require("./routes/listings");
const bagRoutes = require("./routes/bags");
const { vendorReservationsRouter, globalReservationsRouter } = require("./routes/reservations");

// Safety net: an async route handler that throws *before* its own try/catch
// (e.g. a malformed field the type-checks didn't anticipate) rejects a
// promise Express 4 never awaits. Node terminates the whole process on an
// unhandled rejection by default — one bad request would take the API down
// for every vendor and customer. Log and carry on instead; the request that
// triggered it still gets no response and will simply time out client-side,
// which is the correct degraded behavior for one bad request.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandled-rejection]", reason);
});

// --- Required env ---
const REQUIRED = ["DATABASE_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "JWT_SECRET", "SESSION_SECRET", "FRONTEND_ORIGIN"];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[boot] missing required env vars: ${missing.join(", ")}`);
  console.error("[boot] copy .env.example to .env and fill them in.");
  process.exit(1);
}

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;

// --- Security & infra middleware ---
app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: false, // SPA is served separately; relax here.
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN,
  credentials: true,
}));
app.use(express.json({ limit: "64kb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// --- Rate limits ---
app.use("/auth/", rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false }));
app.use("/api/", rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false }));

// --- Session is required only for passport's state parameter on the callback ---
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" },
}));

app.use(passport.initialize());
// passport.session() intentionally NOT mounted — we don't keep a server session.

// --- Health check ---
app.get("/healthz", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: "up" });
  } catch (err) {
    res.status(503).json({ ok: false, db: "down", error: err.message });
  }
});

// --- Routes ---
app.use("/auth", authRoutes);
app.use("/api/vendors/:vendorId/listings", listingRoutes);
app.use("/api/vendors/:vendorId/bags", bagRoutes);
app.use("/api/vendors/:vendorId/reservations", vendorReservationsRouter);
app.use("/api/vendors", vendorRoutes);
app.use("/api/reservations", globalReservationsRouter);

// --- 404 ---
app.use((req, res) => res.status(404).json({ error: "not_found", path: req.path }));

// --- Error handler ---
app.use((err, _req, res, _next) => {
  console.error("[error]", err);
  res.status(500).json({ error: "internal", detail: err.message });
});

// --- Boot ---
app.listen(PORT, () => {
  console.log(`[boot] mitcham API listening on http://localhost:${PORT}`);
  console.log(`[boot] CORS origin: ${process.env.FRONTEND_ORIGIN}`);
});

// --- Graceful shutdown ---
function shutdown() {
  console.log("\n[shutdown] closing pool...");
  pool.end().then(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
