// =========================================================
// /api/vendors/:vendorId/bags — bags-left counts + restock
// =========================================================
const express = require("express");
const { pool, withTransaction } = require("../db");
const { requireAuth, requireVendorAccess } = require("../auth");

const router = express.Router({ mergeParams: true });

// Public: lets the storefront show "3 bags left" before sign-in.
router.get("/", async (req, res) => {
  try {
    const vendorId = parseInt(req.params.vendorId, 10);
    const r = await pool.query(
      `SELECT l.id, l.name, l.emoji, l.discount_price_paise, cb.quantity, cb.recorded_at
       FROM current_bags cb
       JOIN surplus_listings l ON l.id = cb.listing_id
       WHERE l.vendor_id = $1
       ORDER BY l.sort_order, l.id`,
      [vendorId]
    );
    res.json(r.rows.map((row) => ({
      id: row.id,
      name: row.name,
      emoji: row.emoji,
      quantity: row.quantity,
      recordedAt: row.recorded_at,
    })));
  } catch (err) {
    console.error("[bags] error:", err);
    res.status(500).json({ error: "internal" });
  }
});

// Manage: set a listing's bag count to an exact number (a fresh count of
// what's actually left on the shelf at closing time).
router.post("/restock", requireAuth, requireVendorAccess, async (req, res) => {
  const listingId = parseInt(req.body?.listingId, 10);
  const quantity = Number.isInteger(req.body?.quantity) ? req.body.quantity : 0;
  if (!Number.isInteger(listingId)) return res.status(400).json({ error: "invalid_listing_id" });
  if (quantity < 0) return res.status(400).json({ error: "invalid_quantity" });

  try {
    await withTransaction(async (client) => {
      const exists = await client.query(
        "SELECT 1 FROM surplus_listings WHERE id = $1 AND vendor_id = $2",
        [listingId, req.vendor.id]
      );
      if (exists.rows.length === 0) {
        const err = new Error("listing_not_found");
        err.status = 404;
        throw err;
      }
      await client.query("INSERT INTO bag_snapshots (listing_id, quantity) VALUES ($1, $2)", [listingId, quantity]);
    });
    res.json({ ok: true, listingId, quantity });
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: "listing_not_found" });
    console.error("[bags] restock error:", err);
    res.status(500).json({ error: "internal" });
  }
});

module.exports = router;
