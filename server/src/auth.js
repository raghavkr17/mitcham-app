// =========================================================
// Auth: Google OAuth + JWT issuance + Express middleware
// =========================================================
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const jwt = require("jsonwebtoken");
const { pool } = require("./db");

const PLATFORM_ADMIN_EMAILS = (process.env.PLATFORM_ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function isPlatformAdminEmail(email) {
  return !!email && PLATFORM_ADMIN_EMAILS.includes(email.toLowerCase());
}

// --- Passport Google strategy ---
// We only use Google for identity — we don't keep the Google access token.
// After the callback we issue our own JWT and redirect back to the SPA.
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/auth/google/callback",
      scope: ["profile", "email"],
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) return done(new Error("Google account has no email"));

        const displayName = profile.displayName || email.split("@")[0];
        const providerSub = profile.id;

        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          let userRes = await client.query(
            `SELECT u.* FROM users u
             JOIN oauth_accounts oa ON oa.user_id = u.id
             WHERE oa.provider = $1 AND oa.provider_sub = $2`,
            ["google", providerSub]
          );

          if (userRes.rows.length === 0) {
            userRes = await client.query("SELECT * FROM users WHERE email = $1", [email]);
          }

          let user;
          if (userRes.rows.length === 0) {
            const role = isPlatformAdminEmail(email) ? "platform_admin" : "customer";
            const insert = await client.query(
              `INSERT INTO users (email, display_name, role)
               VALUES ($1, $2, $3)
               RETURNING *`,
              [email, displayName, role]
            );
            user = insert.rows[0];
          } else {
            user = userRes.rows[0];
            if (isPlatformAdminEmail(email) && user.role !== "platform_admin") {
              const upd = await client.query(
                "UPDATE users SET role = 'platform_admin' WHERE id = $1 RETURNING *",
                [user.id]
              );
              user = upd.rows[0];
            }
            await client.query("UPDATE users SET display_name = $1 WHERE id = $2", [displayName, user.id]);
            user.display_name = displayName;
          }

          await client.query(
            `INSERT INTO oauth_accounts (user_id, provider, provider_sub)
             VALUES ($1, $2, $3)
             ON CONFLICT (provider, provider_sub) DO NOTHING`,
            [user.id, "google", providerSub]
          );

          await client.query("COMMIT");
          return done(null, user);
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
      } catch (err) {
        return done(err);
      }
    }
  )
);

// Sessions aren't used for API auth (JWT is), but Passport still requires
// these hooks to exist.
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// --- JWT helpers ---
function signJwt(user) {
  return jwt.sign(
    { uid: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d", issuer: "mitcham" }
  );
}

function verifyJwt(token) {
  return jwt.verify(token, process.env.JWT_SECRET, { issuer: "mitcham" });
}

// --- Express middleware ---
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: "missing_token" });
  try {
    const payload = verifyJwt(match[1]);
    req.user = { id: payload.uid, email: payload.email, role: payload.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: "invalid_token", detail: err.message });
  }
}

// Populates req.user if a valid token is present, but never rejects the
// request. Used on public endpoints that behave differently when signed in
// (e.g. showing a vendor's own pending listing to its owner).
function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match) {
    try {
      const payload = verifyJwt(match[1]);
      req.user = { id: payload.uid, email: payload.email, role: payload.role };
    } catch (_) { /* ignore invalid/expired token on optional routes */ }
  }
  next();
}

function requirePlatformAdmin(req, res, next) {
  if (req.user?.role !== "platform_admin") return res.status(403).json({ error: "forbidden" });
  next();
}

// A user can manage a vendor if they're its owner, on its staff list, or a
// platform admin. Attaches req.vendor for downstream handlers.
async function requireVendorAccess(req, res, next) {
  try {
    const vendorId = parseInt(req.params.vendorId, 10);
    if (!Number.isInteger(vendorId)) return res.status(400).json({ error: "invalid_vendor_id" });

    const r = await pool.query("SELECT * FROM vendors WHERE id = $1", [vendorId]);
    if (r.rows.length === 0) return res.status(404).json({ error: "vendor_not_found" });
    const vendor = r.rows[0];

    if (req.user.role === "platform_admin" || Number(vendor.owner_id) === Number(req.user.id)) {
      req.vendor = vendor;
      return next();
    }
    const staff = await pool.query(
      "SELECT 1 FROM vendor_staff WHERE vendor_id = $1 AND user_id = $2",
      [vendorId, req.user.id]
    );
    if (staff.rows.length === 0) return res.status(403).json({ error: "forbidden" });
    req.vendor = vendor;
    next();
  } catch (err) {
    console.error("[auth] requireVendorAccess error:", err);
    res.status(500).json({ error: "internal" });
  }
}

module.exports = {
  passport,
  signJwt,
  verifyJwt,
  requireAuth,
  optionalAuth,
  requirePlatformAdmin,
  requireVendorAccess,
  isPlatformAdminEmail,
};
