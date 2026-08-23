// =========================================================
// /api/vendors — marketplace browsing, onboarding, and
// per-vendor profile management
// =========================================================
const express = require("express");
const { pool, withTransaction } = require("../db");
const {
  requireAuth,
  optionalAuth,
  requirePlatformAdmin,
  requireVendorAccess,
} = require("../auth");

const router = express.Router();

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || "vendor";
}

async function uniqueSlug(client, base) {
  let slug = base;
  let n = 1;
  for (let i = 0; i < 500; i++) {
    const existing = await client.query("SELECT 1 FROM vendors WHERE slug = $1", [slug]);
    if (existing.rows.length === 0) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
  throw new Error("could not allocate a unique slug");
}

function serialize(v) {
  return {
    id: v.id,
    slug: v.slug,
    name: v.name,
    category: v.category,
    city: v.city,
    tagline: v.tagline,
    description: v.description,
    emoji: v.emoji,
    themeColor: v.theme_color,
    status: v.status,
    platformFeeRate: Number(v.platform_fee_rate),
    createdAt: v.created_at,
  };
}

// --- Public: browse the marketplace ---
// ?city=Mumbai&category=Bakery&q=croissant filters; only approved vendors,
// and only ones with at least one active listing with bags left right now.
router.get("/", async (req, res) => {
  try {
    const { city, category, q } = req.query;
    const clauses = ["v.status = 'approved'"];
    const params = [];
    if (city) { params.push(city); clauses.push(`v.city = $${params.length}`); }
    if (category) { params.push(category); clauses.push(`v.category = $${params.length}`); }
    if (q) { params.push(`%${q}%`); clauses.push(`(v.name ILIKE $${params.length} OR v.description ILIKE $${params.length})`); }

    const r = await pool.query(
      `SELECT v.*,
              COALESCE(SUM(cb.quantity) FILTER (WHERE sl.is_active), 0) AS bags_left,
              COUNT(sl.id) FILTER (WHERE sl.is_active) AS active_listings
       FROM vendors v
       LEFT JOIN surplus_listings sl ON sl.vendor_id = v.id
       LEFT JOIN current_bags cb ON cb.listing_id = sl.id
       WHERE ${clauses.join(" AND ")}
       GROUP BY v.id
       ORDER BY bags_left DESC, v.created_at DESC`,
      params
    );
    res.json(r.rows.map((row) => ({
      ...serialize(row),
      bagsLeft: Number(row.bags_left),
      activeListings: Number(row.active_listings),
    })));
  } catch (err) {
    console.error("[vendors] list error:", err);
    res.status(500).json({ error: "internal" });
  }
});

// --- Public: platform-wide impact counters for the marketplace hero ---
router.get("/impact", async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status != 'cancelled') AS bags_rescued,
         COALESCE(SUM(savings_paise) FILTER (WHERE status != 'cancelled'), 0) AS total_savings_paise
       FROM reservations`
    );
    const row = r.rows[0];
    const bagsRescued = Number(row.bags_rescued);
    res.json({
      bagsRescued,
      totalSavingsPaise: Number(row.total_savings_paise),
      // Illustrative estimate, not a measured figure — commonly cited food
      // rescue calculators use ~2.5kg CO2e avoided per meal saved from waste.
      estimatedKgCo2Avoided: Math.round(bagsRescued * 2.5),
    });
  } catch (err) {
    console.error("[vendors] impact error:", err);
    res.status(500).json({ error: "internal" });
  }
});

// --- Public: single vendor by slug (storefront landing) ---
// Non-approved vendors are only visible to their owner/staff/admin.
router.get("/slug/:slug", optionalAuth, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM vendors WHERE slug = $1", [req.params.slug]);
    if (r.rows.length === 0) return res.status(404).json({ error: "not_found" });
    const vendor = r.rows[0];
    if (vendor.status !== "approved") {
      const isOwner = req.user && Number(vendor.owner_id) === Number(req.user.id);
      const isAdmin = req.user?.role === "platform_admin";
      if (!isOwner && !isAdmin) return res.status(404).json({ error: "not_found" });
    }
    res.json(serialize(vendor));
  } catch (err) {
    console.error("[vendors] get by slug error:", err);
    res.status(500).json({ error: "internal" });
  }
});

// --- Auth required: apply to list a new vendor ---
router.post("/", requireAuth, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const category = String(req.body?.category || "Restaurant").trim();
  const city = String(req.body?.city || "Bengaluru").trim();
  const tagline = String(req.body?.tagline || "").trim();
  const description = String(req.body?.description || "").trim();
  const emoji = String(req.body?.emoji || "🍱").trim() || "🍱";
  const themeColor = /^#[0-9a-fA-F]{6}$/.test(req.body?.themeColor) ? req.body.themeColor : "#1f7a4d";

  if (!name || name.length < 2) return res.status(400).json({ error: "name_required" });
  if (name.length > 80) return res.status(400).json({ error: "name_too_long" });

  try {
    const vendor = await withTransaction(async (client) => {
      const slug = await uniqueSlug(client, slugify(name));
      const insert = await client.query(
        `INSERT INTO vendors (owner_id, slug, name, category, city, tagline, description, emoji, theme_color)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [req.user.id, slug, name, category, city, tagline, description, emoji, themeColor]
      );
      const vendor = insert.rows[0];

      await client.query(
        `INSERT INTO vendor_staff (vendor_id, user_id, staff_role)
         VALUES ($1, $2, 'owner') ON CONFLICT (vendor_id, user_id) DO NOTHING`,
        [vendor.id, req.user.id]
      );

      await client.query("UPDATE users SET role = 'vendor' WHERE id = $1 AND role = 'customer'", [req.user.id]);

      return vendor;
    });
    res.status(201).json(serialize(vendor));
  } catch (err) {
    console.error("[vendors] create error:", err);
    res.status(500).json({ error: "internal" });
  }
});

// --- Manage: update a vendor's public profile ---
router.patch("/:vendorId", requireAuth, requireVendorAccess, async (req, res) => {
  const fields = {};
  for (const key of ["name", "category", "city", "tagline", "description", "emoji"]) {
    if (typeof req.body?.[key] === "string" && req.body[key].trim()) fields[key] = req.body[key].trim();
  }
  if (typeof req.body?.themeColor === "string" && /^#[0-9a-fA-F]{6}$/.test(req.body.themeColor)) {
    fields.theme_color = req.body.themeColor;
  }
  const keys = Object.keys(fields);
  if (keys.length === 0) return res.status(400).json({ error: "no_fields" });

  try {
    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
    const values = keys.map((k) => fields[k]);
    const r = await pool.query(
      `UPDATE vendors SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, req.vendor.id]
    );
    res.json(serialize(r.rows[0]));
  } catch (err) {
    console.error("[vendors] update error:", err);
    res.status(500).json({ error: "internal" });
  }
});

// --- Platform admin: review queue ---
router.get("/admin/pending", requireAuth, requirePlatformAdmin, async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM vendors WHERE status = 'pending' ORDER BY created_at");
    res.json(r.rows.map(serialize));
  } catch (err) {
    console.error("[vendors] pending list error:", err);
    res.status(500).json({ error: "internal" });
  }
});

router.get("/admin/all", requireAuth, requirePlatformAdmin, async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM vendors ORDER BY created_at DESC");
    res.json(r.rows.map(serialize));
  } catch (err) {
    console.error("[vendors] admin list error:", err);
    res.status(500).json({ error: "internal" });
  }
});

router.post("/:vendorId/approve", requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const r = await pool.query("UPDATE vendors SET status = 'approved' WHERE id = $1 RETURNING *", [req.params.vendorId]);
    if (r.rows.length === 0) return res.status(404).json({ error: "not_found" });
    res.json(serialize(r.rows[0]));
  } catch (err) {
    console.error("[vendors] approve error:", err);
    res.status(500).json({ error: "internal" });
  }
});

router.post("/:vendorId/reject", requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const r = await pool.query("UPDATE vendors SET status = 'rejected' WHERE id = $1 RETURNING *", [req.params.vendorId]);
    if (r.rows.length === 0) return res.status(404).json({ error: "not_found" });
    res.json(serialize(r.rows[0]));
  } catch (err) {
    console.error("[vendors] reject error:", err);
    res.status(500).json({ error: "internal" });
  }
});

router.post("/:vendorId/suspend", requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const r = await pool.query("UPDATE vendors SET status = 'suspended' WHERE id = $1 RETURNING *", [req.params.vendorId]);
    if (r.rows.length === 0) return res.status(404).json({ error: "not_found" });
    res.json(serialize(r.rows[0]));
  } catch (err) {
    console.error("[vendors] suspend error:", err);
    res.status(500).json({ error: "internal" });
  }
});

router.delete("/:id", requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM vendors WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("[vendors] delete error:", err);
    res.status(500).json({ error: "internal" });
  }
});

module.exports = router;
