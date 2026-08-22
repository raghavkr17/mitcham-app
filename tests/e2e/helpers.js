// Shared helpers for the Playwright e2e smoke tests.
//
// These tests drive the real, running app (frontend static server +
// Express API + Postgres) with a headless browser — they are not unit
// tests and don't mock anything. See tests/README.md for how to run them.
const path = require("path");

const CHROMIUM_PATH =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ||
  path.join(process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers", "chromium-1194", "chrome-linux", "chrome");

const FRONTEND_ORIGIN = process.env.MITCHAM_TEST_FRONTEND || "http://localhost:5500";
const API_ORIGIN = process.env.MITCHAM_TEST_API || "http://localhost:3001";

async function launchBrowser(chromium) {
  return chromium.launch({ executablePath: CHROMIUM_PATH, args: ["--no-sandbox"] });
}

// Signs a JWT locally with the server's JWT_SECRET so tests can simulate a
// signed-in user without driving the real Google OAuth consent screen.
// Requires the corresponding `users` row to already exist (see seed.js, or
// insert one with `INSERT INTO users ...` before running).
function signTestToken({ uid, email, role }) {
  const jwt = require("jsonwebtoken");
  require("dotenv").config({ path: path.join(__dirname, "..", "..", "server", ".env") });
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET not found — run these tests from a checkout with server/.env configured.");
  }
  return jwt.sign({ uid, email, role }, process.env.JWT_SECRET, { expiresIn: "1h", issuer: "mitcham" });
}

module.exports = { CHROMIUM_PATH, FRONTEND_ORIGIN, API_ORIGIN, launchBrowser, signTestToken };
