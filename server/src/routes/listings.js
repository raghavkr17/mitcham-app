// =========================================================
// /api/vendors/:vendorId/listings — a vendor's surplus "rescue bags"
// =========================================================
const express = require("express");
const { pool, withTransaction } = require("../db");
const { requireAuth, requireVendorAccess } = require("../auth");

const router = express.Router({ mergeParams: true });

function serialize(l) {
  const discountPct = l.original_price_paise > 0
    ? Math.round((1 - l.discount_price_paise / l.original_price_paise) * 100)
    : 0;
  return {
    id: l.id,
    vendorId: l.vendor_id,
    name: l.name,
    originalPrice: l.original_price_paise / 100,
    discountPrice: l.discount_price_paise / 100,
    originalPricePaise: l.original_price_paise,
    discountPricePaise: l.discount_price_paise,
    discountPct,
    emoji: l.emoji,
    description: l.description,
    pickupStart: l.pickup_start,
    pickupEnd: l.pickup_end,
    isActive: l.is_active,
    sortOrder: l.sort_order,
  };
}

// Public: active listings for a vendor, in display order.
router.get("/", async (req, res) => {
  try {
    const vendorId = parseInt(req.params.vendorId, 10);
    const r = await pool.query(
      `SELECT * FROM surplus_listings
       WHERE vendor_id = $1 AND is_active = TRUE
       ORDER BY sort_order, id`,
      [vendorId]
    );
    res.json(r.rows.map(serialize));
  } catch (err) {
    console.error("[listings] list error:", err);
    res.status(500).json({ error: "internal" });
  }
});

// Manage: full list including inactive listings (for the vendor dashboard).
router.get("/all", requireAuth, requireVendorAccess, async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT * FROM surplus_listings WHERE vendor_id = $1 ORDER BY sort_order, id",
      [req.vendor.id]
    );
    res.json(r.rows.map(serialize));
  } catch (err) {
    console.error("[listings] admin list error:", err);
    res.status(500).json({ error: "internal" });
  }
});

// Manage: post a new surplus listing. Seeds an initial bag count.
router.post("/", requireAuth, requireVendorAccess, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const originalPrice = Number(req.body?.originalPrice);
  const discountPrice = Number(req.body?.discountPrice);
  const emoji = String(req.body?.emoji || "🥡").trim() || "🥡";
  const description = String(req.body?.description || "").trim();
  const pickupStart = String(req.body?.pickupStart || "20:00").trim();
  const pickupEnd = String(req.body?.pickupEnd || "21:00").trim();
  const initialBags = Number.isInteger(req.body?.initialBags) ? req.body.initialBags : 10;

  if (!name) return res.status(400).json({ error: "name_required" });
  if (!Number.isFinite(originalPrice) || originalPrice < 0) return res.status(400).json({ error: "invalid_original_price" });
  if (!Number.isFinite(discountPrice) || discountPrice < 0) return res.status(400).json({ error: "invalid_discount_price" });
  if (discountPrice > originalPrice) return res.status(400).json({ error: "discount_exceeds_original" });
  if (initialBags < 0) return res.status(400).json({ error: "invalid_initial_bags" });
  if (!/^\d{2}:\d{2}$/.test(pickupStart) || !/^\d{2}:\d{2}$/.test(pickupEnd)) {
    return res.status(400).json({ error: "invalid_pickup_window" });
  }

  try {
    const listing = await withTransaction(async (client) => {
      const insert = await client.query(
        `INSERT INTO surplus_listings
           (vendor_id, name, original_price_paise, discount_price_paise, emoji, description, pickup_start, pickup_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [req.vendor.id, name, Math.round(originalPrice * 100), Math.round(discountPrice * 100), emoji, description, pickupStart, pickupEnd]
      );
      const listing = insert.rows[0];
      await client.query("INSERT INTO bag_snapshots (listing_id, quantity) VALUES ($1, $2)", [listing.id, initialBags]);
      return listing;
    });
    res.status(201).json(serialize(listing));
  } catch (err) {
    console.error("[listings] create error:", err);
    res.status(500).json({ error: "internal" });
  }
});

// Manage: edit a listing.
router.patch("/:listingId", requireAuth, requireVendorAccess, async (req, res) => {
  const fields = {};
  if (typeof req.body?.name === "string" && req.body.name.trim()) fields.name = req.body.name.trim();
  if (typeof req.body?.emoji === "string" && req.body.emoji.trim()) fields.emoji = req.body.emoji.trim();
  if (typeof req.body?.description === "string") fields.description = req.body.description.trim();
  if (typeof req.body?.isActive === "boolean") fields.is_active = req.body.isActive;
  if (Number.isInteger(req.body?.sortOrder)) fields.sort_order = req.body.sortOrder;
  if (typeof req.body?.pickupStart === "string" && /^\d{2}:\d{2}$/.test(req.body.pickupStart)) fields.pickup_start = req.body.pickupStart;
  if (typeof req.body?.pickupEnd === "string" && /^\d{2}:\d{2}$/.test(req.body.pickupEnd)) fields.pickup_end = req.body.pickupEnd;
  if (req.body?.originalPrice !== undefined) {
    const p = Number(req.body.originalPrice);
    if (!Number.isFinite(p) || p < 0) return res.status(400).json({ error: "invalid_original_price" });
    fields.original_price_paise = Math.round(p * 100);
  }
  if (req.body?.discountPrice !== undefined) {
    const p = Number(req.body.discountPrice);
    if (!Number.isFinite(p) || p < 0) return res.status(400).json({ error: "invalid_discount_price" });
    fields.discount_price_paise = Math.round(p * 100);
  }
  const keys = Object.keys(fields);
  if (keys.length === 0) return res.status(400).json({ error: "no_fields" });

  try {
    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
    const values = keys.map((k) => fields[k]);
    const r = await pool.query(
      `UPDATE surplus_listings SET ${setClause}
       WHERE id = $${keys.length + 1} AND vendor_id = $${keys.length + 2}
       RETURNING *`,
      [...values, req.params.listingId, req.vendor.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "not_found" });
    res.json(serialize(r.rows[0]));
  } catch (err) {
    if (err.code === "23514") return res.status(400).json({ error: "discount_exceeds_original" });
    console.error("[listings] update error:", err);
    res.status(500).json({ error: "internal" });
  }
});

// Manage: remove a listing entirely (cascades bag snapshots).
router.delete("/:listingId", requireAuth, requireVendorAccess, async (req, res) => {
  try {
    const r = await pool.query(
      "DELETE FROM surplus_listings WHERE id = $1 AND vendor_id = $2 RETURNING id",
      [req.params.listingId, req.vendor.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  } catch (err) {
    console.error("[listings] delete error:", err);
    res.status(500).json({ error: "internal" });
  }
});

module.exports = router;
