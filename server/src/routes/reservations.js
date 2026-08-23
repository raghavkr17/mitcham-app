// =========================================================
// Reservations — creation/listing scoped to a vendor, plus a
// global pickup-code lookup surface for customer tracking.
//
// Exports two routers:
//   vendorReservationsRouter -> mounted at /api/vendors/:vendorId/reservations
//   globalReservationsRouter -> mounted at /api/reservations
// =========================================================
const express = require("express");
const { pool, withTransaction } = require("../db");
const { requireAuth, requireVendorAccess } = require("../auth");

const MAX_QTY_PER_LINE = 20; // rescue bags are sold in small counts, not bulk

// --- helpers ---

// Pickup code: <vendorId>-<UTC timestamp>. Human-readable, sortable, and
// namespaced so two vendors can never collide on the same code — this is
// what a customer shows at the counter to collect their bag.
function generatePickupCode(vendorId) {
  const d = new Date();
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const stamp =
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}${pad(d.getUTCMilliseconds(), 3)}`;
  return `M${vendorId}-${stamp}`;
}

function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) return "items must be a non-empty array";
  const merged = new Map();
  for (const it of items) {
    const id = parseInt(it.listingId, 10);
    const qty = parseInt(it.qty, 10);
    if (!Number.isInteger(id) || id < 1) return `invalid listing id ${it.listingId}`;
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) return `invalid qty ${it.qty}`;
    merged.set(id, (merged.get(id) || 0) + qty);
  }
  return Array.from(merged.entries()).map(([listingId, qty]) => ({ listingId, qty }));
}

async function applyBagDelta(client, deltas) {
  for (const { listingId, newQty } of deltas) {
    if (newQty < 0) {
      const err = new Error(`sold_out:${listingId}`);
      err.status = 409;
      throw err;
    }
    await client.query("INSERT INTO bag_snapshots (listing_id, quantity) VALUES ($1, $2)", [listingId, newQty]);
  }
}

// Locks the latest bag snapshot for each listing, scoped to one vendor so a
// caller can't reference another vendor's listing id.
async function lockCurrentBags(client, vendorId, listingIds) {
  const result = new Map();
  for (const id of listingIds) {
    const owned = await client.query(
      "SELECT 1 FROM surplus_listings WHERE id = $1 AND vendor_id = $2",
      [id, vendorId]
    );
    if (owned.rows.length === 0) {
      const err = new Error(`listing_not_in_vendor:${id}`);
      err.status = 400;
      throw err;
    }
    const r = await client.query(
      `SELECT quantity FROM bag_snapshots
       WHERE listing_id = $1 ORDER BY recorded_at DESC LIMIT 1 FOR UPDATE`,
      [id]
    );
    if (r.rows.length === 0) {
      const err = new Error(`no_bags_tracked:${id}`);
      err.status = 409;
      throw err;
    }
    result.set(id, r.rows[0].quantity);
  }
  return result;
}

function serializeReservation(r) {
  return {
    pickupCode: r.pickup_code,
    vendorId: r.vendor_id,
    customer: r.customer,
    total: r.total_paise / 100,
    totalPaise: r.total_paise,
    savings: r.savings_paise / 100,
    savingsPaise: r.savings_paise,
    status: r.status,
    placedAt: r.placed_at,
    userId: r.user_id,
  };
}

async function canAccessReservation(userId, role, reservation) {
  if (role === "platform_admin" || Number(reservation.user_id) === Number(userId)) return true;
  const staff = await pool.query(
    "SELECT 1 FROM vendor_staff WHERE vendor_id = $1 AND user_id = $2",
    [reservation.vendor_id, userId]
  );
  if (staff.rows.length > 0) return true;
  const owned = await pool.query("SELECT 1 FROM vendors WHERE id = $1 AND owner_id = $2", [
    reservation.vendor_id,
    userId,
  ]);
  return owned.rows.length > 0;
}

// =========================================================
// vendorReservationsRouter — /api/vendors/:vendorId/reservations
// =========================================================
const vendorReservationsRouter = express.Router({ mergeParams: true });

// Reserve one or more listings from this vendor.
vendorReservationsRouter.post("/", requireAuth, async (req, res) => {
  const vendorId = parseInt(req.params.vendorId, 10);
  const customer = String(req.body?.customer || "").trim();
  if (!customer) return res.status(400).json({ error: "customer_required" });

  const items = validateItems(req.body?.items);
  if (typeof items === "string") return res.status(400).json({ error: items });

  try {
    const vendorRes = await pool.query("SELECT * FROM vendors WHERE id = $1 AND status = 'approved'", [vendorId]);
    if (vendorRes.rows.length === 0) return res.status(404).json({ error: "vendor_not_found" });
    const vendor = vendorRes.rows[0];

    const result = await withTransaction(async (client) => {
      const bags = await lockCurrentBags(client, vendorId, items.map((i) => i.listingId));

      const deltas = [];
      for (const { listingId, qty } of items) {
        const current = bags.get(listingId);
        if (current < qty) {
          const err = new Error(`insufficient_bags:${listingId}`);
          err.status = 409;
          throw err;
        }
        deltas.push({ listingId, newQty: current - qty });
      }
      await applyBagDelta(client, deltas);

      const priceRes = await client.query(
        "SELECT id, original_price_paise, discount_price_paise FROM surplus_listings WHERE id = ANY($1::bigint[]) AND vendor_id = $2",
        [items.map((i) => i.listingId), vendorId]
      );
      const priceMap = new Map(priceRes.rows.map((r) => [Number(r.id), r]));
      let subtotalPaise = 0;
      let originalSubtotalPaise = 0;
      for (const { listingId, qty } of items) {
        const p = priceMap.get(listingId);
        subtotalPaise += (p?.discount_price_paise || 0) * qty;
        originalSubtotalPaise += (p?.original_price_paise || 0) * qty;
      }
      const totalPaise = Math.round(subtotalPaise * (1 + Number(vendor.platform_fee_rate)));
      const savingsPaise = Math.max(0, originalSubtotalPaise - subtotalPaise);

      const pickupCode = generatePickupCode(vendorId);
      await client.query(
        `INSERT INTO reservations (pickup_code, vendor_id, user_id, customer, total_paise, savings_paise, placed_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [pickupCode, vendorId, req.user.id, customer, totalPaise, savingsPaise]
      );
      for (const { listingId, qty } of items) {
        await client.query("INSERT INTO reservation_items (pickup_code, listing_id, quantity) VALUES ($1, $2, $3)", [
          pickupCode,
          listingId,
          qty,
        ]);
      }
      return { pickupCode, total: totalPaise / 100, savings: savingsPaise / 100, vendorId };
    });
    res.status(201).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error("[reservations] create error:", err);
    res.status(500).json({ error: "internal" });
  }
});

// List reservations for this vendor (owner/staff/admin dashboard view).
vendorReservationsRouter.get("/", requireAuth, requireVendorAccess, async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT * FROM reservations WHERE vendor_id = $1 ORDER BY placed_at DESC LIMIT 200",
      [req.vendor.id]
    );
    res.json(r.rows.map(serializeReservation));
  } catch (err) {
    console.error("[reservations] vendor list error:", err);
    res.status(500).json({ error: "internal" });
  }
});
// Vendor confirms an order is ready.
vendorReservationsRouter.post("/:pickupCode/mark-ready", requireAuth, requireVendorAccess, async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE reservations SET status = 'ready'
       WHERE pickup_code = $1 AND vendor_id = $2 AND status = 'reserved'
       RETURNING *`,
      [req.params.pickupCode, req.vendor.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "not_found_or_not_reserved" });
    res.json(serializeReservation(r.rows[0]));
  } catch (err) {
    console.error("[reservations] mark-ready error:", err);
    res.status(500).json({ error: "internal" });
  }
});
// Vendor confirms a customer collected their bag at the counter.
vendorReservationsRouter.post("/:pickupCode/confirm-pickup", requireAuth, requireVendorAccess, async (req, res) => {
  try {
    const r = await pool.query(
      "UPDATE reservations SET status = 'picked_up' WHERE pickup_code = $1 AND vendor_id = $2 AND status = 'reserved' RETURNING *",
      [req.params.pickupCode, req.vendor.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "not_found_or_not_reserved" });
    res.json(serializeReservation(r.rows[0]));
  } catch (err) {
    console.error("[reservations] confirm-pickup error:", err);
    res.status(500).json({ error: "internal" });
  }
});

// =========================================================
// globalReservationsRouter — /api/reservations
// =========================================================
const globalReservationsRouter = express.Router();

// The signed-in customer's own reservation history, across every vendor.
globalReservationsRouter.get("/mine", requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT res.*, v.name AS vendor_name, v.slug AS vendor_slug, v.emoji AS vendor_emoji
       FROM reservations res
       JOIN vendors v ON v.id = res.vendor_id
       WHERE res.user_id = $1
       ORDER BY res.placed_at DESC
       LIMIT 200`,
      [req.user.id]
    );
    res.json(r.rows.map((row) => ({
      ...serializeReservation(row),
      vendorName: row.vendor_name,
      vendorSlug: row.vendor_slug,
      vendorEmoji: row.vendor_emoji,
    })));
  } catch (err) {
    console.error("[reservations] mine error:", err);
    res.status(500).json({ error: "internal" });
  }
});

async function loadReservationWithItems(pickupCode) {
  const r = await pool.query("SELECT * FROM reservations WHERE pickup_code = $1", [pickupCode]);
  if (r.rows.length === 0) return null;
  const reservation = r.rows[0];
  const items = await pool.query(
    `SELECT ri.listing_id, ri.quantity, l.name, l.emoji, l.discount_price_paise
     FROM reservation_items ri
     LEFT JOIN surplus_listings l ON l.id = ri.listing_id
     WHERE ri.pickup_code = $1
     ORDER BY ri.id`,
    [pickupCode]
  );
  return {
    reservation,
    items: items.rows.map((i) => ({
      listingId: Number(i.listing_id),
      qty: i.quantity,
      name: i.name || `Listing #${i.listing_id}`,
      emoji: i.emoji || "🥡",
      price: i.discount_price_paise != null ? i.discount_price_paise / 100 : null,
    })),
  };
}

// Retrieve a single reservation by pickup code (the customer who made it,
// that vendor's staff/owner, or a platform admin).
globalReservationsRouter.get("/:pickupCode", requireAuth, async (req, res) => {
  try {
    const found = await loadReservationWithItems(req.params.pickupCode);
    if (!found) return res.status(404).json({ error: "not_found" });
    if (!(await canAccessReservation(req.user.id, req.user.role, found.reservation))) {
      return res.status(403).json({ error: "forbidden" });
    }
    res.json({ ...serializeReservation(found.reservation), items: found.items });
  } catch (err) {
    console.error("[reservations] get error:", err);
    res.status(500).json({ error: "internal" });
  }
});

// Cancel a reservation — restores bags to the shelf.
globalReservationsRouter.delete("/:pickupCode", requireAuth, async (req, res) => {
  try {
    await withTransaction(async (client) => {
      const res_ = await client.query("SELECT * FROM reservations WHERE pickup_code = $1 FOR UPDATE", [req.params.pickupCode]);
      if (res_.rows.length === 0) {
        const err = new Error("not_found"); err.status = 404; throw err;
      }
      const reservation = res_.rows[0];
      if (!(await canAccessReservation(req.user.id, req.user.role, reservation))) {
        const err = new Error("forbidden"); err.status = 403; throw err;
      }
      if (reservation.status !== "reserved") {
        const err = new Error("not_cancellable"); err.status = 409; throw err;
      }

      const items = await client.query("SELECT listing_id, quantity FROM reservation_items WHERE pickup_code = $1", [
        req.params.pickupCode,
      ]);
      for (const it of items.rows) {
        const r = await client.query(
          `SELECT quantity FROM bag_snapshots
           WHERE listing_id = $1 ORDER BY recorded_at DESC LIMIT 1 FOR UPDATE`,
          [it.listing_id]
        );
        if (r.rows.length === 0) continue;
        await client.query("INSERT INTO bag_snapshots (listing_id, quantity) VALUES ($1, $2)", [
          it.listing_id,
          r.rows[0].quantity + it.quantity,
        ]);
      }
      await client.query("UPDATE reservations SET status = 'cancelled' WHERE pickup_code = $1", [req.params.pickupCode]);
    });
    res.json({ ok: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error("[reservations] cancel error:", err);
    res.status(500).json({ error: "internal" });
  }
});

module.exports = { vendorReservationsRouter, globalReservationsRouter };
