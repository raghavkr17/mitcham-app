// =========================================================
// /auth/* — Google OAuth, JWT issuance, current-user lookup
// =========================================================
const express = require("express");
const { passport, signJwt, requireAuth } = require("../auth");
const { pool } = require("../db");

const router = express.Router();

// Start the OAuth flow.
router.get(
  "/google",
  passport.authenticate("google", { session: false, scope: ["profile", "email"] })
);

// OAuth callback: passport populates req.user, we sign a JWT and redirect
// back to the SPA with the token in the query string.
// FRONTEND_ORIGIN must be a bare origin (no path) for CORS to match it.
// The deployed SPA can live at a sub-path (e.g. GitHub Project Pages at
// /<repo>/), so the OAuth redirect target is configurable separately via
// FRONTEND_APP_URL and falls back to FRONTEND_ORIGIN for local dev where
// the app is served from the origin root.
const FRONTEND_APP_URL = process.env.FRONTEND_APP_URL || process.env.FRONTEND_ORIGIN;

router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${FRONTEND_APP_URL}/?auth_error=1`,
  }),
  (req, res) => {
    const token = signJwt(req.user);
    res.redirect(`${FRONTEND_APP_URL}/?token=${encodeURIComponent(token)}`);
  }
);

// Returns the current user plus the vendors they can manage — used by
// the SPA on load to re-hydrate the user chip and "Manage" nav entries.
router.get("/me", requireAuth, async (req, res) => {
  try {
    const u = await pool.query(
      "SELECT id, email, display_name, role FROM users WHERE id = $1",
      [req.user.id]
    );
    if (u.rows.length === 0) return res.status(401).json({ error: "user_not_found" });
    const user = u.rows[0];

    const managed = await pool.query(
      `SELECT DISTINCT v.id, v.slug, v.name, v.emoji, v.status
       FROM vendors v
       LEFT JOIN vendor_staff s ON s.vendor_id = v.id AND s.user_id = $1
       WHERE v.owner_id = $1 OR s.user_id = $1
       ORDER BY v.name`,
      [req.user.id]
    );

    res.json({
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      role: user.role,
      vendors: managed.rows,
    });
  } catch (err) {
    console.error("[auth] /me error:", err);
    res.status(500).json({ error: "internal" });
  }
});

// Stateless logout — the client deletes the JWT.
router.post("/logout", (_req, res) => res.json({ ok: true }));

module.exports = router;
