/* =========================================================
   Mitcham — Demo API (no backend required)
   -----------------------------------------------------------
   GitHub Pages (and any other static host) can't run the Express
   + Postgres server in server/, and can't complete a Google OAuth
   redirect without a backend to receive the callback. So when no
   real API is configured, this file stands in for api.js: it
   implements the exact same window.mitchamApi interface, backed by
   localStorage instead of Postgres, seeded with the same demo
   vendors/listings used by server/src/seed.js.

   "Sign in with Google" becomes a persona picker (you choose which
   demo account to act as) since there's no server to run real OAuth.
   Everything else — browsing, reserving bags, managing listings,
   restocking, confirming pickups, the admin approval queue — behaves
   the same as the real API, just persisted in your browser instead
   of a shared database.

   To point the app at a real backend instead, set
   window.MITCHAM_API_BASE = "https://your-api.example.com"
   before api.js loads (e.g. in a small config.js you add locally) —
   this file then does nothing and api.js takes over.
   ========================================================= */
(function () {
  if (window.MITCHAM_API_BASE) return; // a real backend is configured — let api.js handle everything

  const TOKEN_KEY = "mitcham_token";
  const USER_KEY = "mitcham_user";
  const DB_KEY = "mitcham_demo_db_v1";
  const MAX_QTY_PER_LINE = 20;

  // ---------- seed data (mirrors server/src/seed.js) ----------
  function buildSeed() {
    const now = Date.now();
    const users = [
      { id: 1, email: "admin@mitcham.local", displayName: "Mitcham Admin", role: "platform_admin" },
      { id: 7, email: "demo-customer@mitcham.local", displayName: "Demo Customer", role: "customer" },
    ];

    // Note: the placeholder vendors that used to live here (Spice Route Kitchen,
    // Annapurna Sweets, Daily Grocers, Flour Power Bakery, Anna's Corner Bakery)
    // were only ever tied to fake @mitcham.local owner accounts, not real users —
    // removed so a fresh install starts empty and only shows vendors real people apply with.
    const vendorSpecs = [];

    const vendors = [];
    const vendorStaff = [];
    const listings = [];
    const bags = {};
    let listingId = 1;

    vendorSpecs.forEach((spec, vi) => {
      vendors.push({
        id: spec.id, ownerId: spec.ownerId, slug: spec.slug, name: spec.name, category: spec.category,
        city: spec.city, tagline: spec.tagline, description: spec.description, emoji: spec.emoji,
        themeColor: spec.themeColor, status: spec.status, platformFeeRate: 0,
        createdAt: new Date(now - (vendorSpecs.length - vi) * 3600 * 1000).toISOString(),
      });
      vendorStaff.push({ vendorId: spec.id, userId: spec.ownerId, staffRole: "owner" });
      spec.listings.forEach((item, i) => {
        const id = listingId++;
        listings.push({
          id, vendorId: spec.id, name: item.name,
          originalPricePaise: Math.round(item.originalPrice * 100),
          discountPricePaise: Math.round(item.discountPrice * 100),
          emoji: item.emoji, description: item.desc,
          pickupStart: item.pickupStart, pickupEnd: item.pickupEnd,
          isActive: true, sortOrder: i,
        });
        bags[id] = item.bags;
      });
    });

    return {
      nextListingId: listingId,
      nextVendorId: vendors.length + 1,
      nextReservationSeq: 1,
      users, vendors, vendorStaff, listings, bags,
      reservations: [], reservationItems: [],
    };
  }

  // Old placeholder vendor accounts (owner ids 2–6) were seeded with fake
  // @mitcham.local addresses just to demo the marketplace — never real vendors.
  // Anyone who already has one of these in localStorage from before gets it
  // cleaned up here, once, without touching their real data or order history.
  const FAKE_SEED_OWNER_IDS = [2, 3, 4, 5, 6];
  function scrubFakeSeedVendors(d) {
    const fakeVendors = d.vendors.filter((v) => FAKE_SEED_OWNER_IDS.includes(Number(v.ownerId)));
    if (fakeVendors.length === 0) return d;
    const fakeVendorIds = new Set(fakeVendors.map((v) => v.id));
    // preserve order history: bake the vendor's name/emoji onto its past
    // reservations before the vendor row disappears.
    d.reservations.forEach((r) => {
      if (fakeVendorIds.has(r.vendorId) && !r.vendorName) {
        const v = fakeVendors.find((x) => x.id === r.vendorId);
        if (v) { r.vendorName = v.name; r.vendorEmoji = v.emoji; }
      }
    });
    d.vendors = d.vendors.filter((v) => !fakeVendorIds.has(v.id));
    d.listings = d.listings.filter((l) => !fakeVendorIds.has(l.vendorId));
    d.vendorStaff = d.vendorStaff.filter((s) => !fakeVendorIds.has(s.vendorId));
    d.users = d.users.filter((u) => !FAKE_SEED_OWNER_IDS.includes(Number(u.id)));
    return d;
  }

  function loadDb() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) {
        const parsed = scrubFakeSeedVendors(JSON.parse(raw));
        persist(parsed);
        return parsed;
      }
    } catch { /* fall through to reseed */ }
    const fresh = buildSeed();
    persist(fresh);
    return fresh;
  }
  function persist(d) {
    try { localStorage.setItem(DB_KEY, JSON.stringify(d)); } catch { /* storage full/unavailable — demo continues in-memory */ }
  }

  let db = loadDb();
  function save() { persist(db); }

  // ---------- token / user plumbing (mirrors api.js) ----------
  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); }
  function setUser(u) { if (u) localStorage.setItem(USER_KEY, JSON.stringify(u)); else localStorage.removeItem(USER_KEY); }
  function getUser() { try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch { return null; } }

  function currentUser() {
    const t = getToken();
    const m = t && /^demo:(\d+)$/.exec(t);
    if (!m) return null;
    return db.users.find((u) => String(u.id) === m[1]) || null;
  }

  function apiErr(status, message) {
    const e = new Error(message);
    e.status = status;
    return e;
  }
  function requireAuth() {
    const u = currentUser();
    if (!u) throw apiErr(401, "auth_required");
    return u;
  }
  function findVendor(id) {
    return db.vendors.find((v) => Number(v.id) === Number(id));
  }
  function isStaffOrOwner(vendor, user) {
    if (Number(vendor.ownerId) === Number(user.id)) return true;
    return db.vendorStaff.some((s) => s.vendorId === vendor.id && s.userId === user.id);
  }
  function requireVendorAccess(vendorId, user) {
    const vendor = findVendor(vendorId);
    if (!vendor) throw apiErr(404, "not_found");
    if (user.role === "platform_admin" || isStaffOrOwner(vendor, user)) return vendor;
    throw apiErr(403, "forbidden");
  }

  // ---------- serializers (mirror server route `serialize()` fns) ----------
  function currentBags(listingId) { return db.bags[listingId] ?? 0; }

  function serializeVendor(v) {
    return {
      id: v.id, slug: v.slug, name: v.name, category: v.category, city: v.city,
      tagline: v.tagline, description: v.description, emoji: v.emoji, themeColor: v.themeColor,
      status: v.status, platformFeeRate: Number(v.platformFeeRate), createdAt: v.createdAt,
    };
  }
  function serializeListing(l) {
    const discountPct = l.originalPricePaise > 0
      ? Math.round((1 - l.discountPricePaise / l.originalPricePaise) * 100) : 0;
    return {
      id: l.id, vendorId: l.vendorId, name: l.name,
      originalPrice: l.originalPricePaise / 100, discountPrice: l.discountPricePaise / 100,
      originalPricePaise: l.originalPricePaise, discountPricePaise: l.discountPricePaise,
      discountPct, emoji: l.emoji, description: l.description,
      pickupStart: l.pickupStart, pickupEnd: l.pickupEnd, isActive: l.isActive, sortOrder: l.sortOrder,
    };
  }
  function serializeReservation(r) {
    return {
      pickupCode: r.pickupCode, vendorId: r.vendorId, customer: r.customer,
      total: r.totalPaise / 100, totalPaise: r.totalPaise,
      savings: r.savingsPaise / 100, savingsPaise: r.savingsPaise,
      status: r.status, placedAt: r.placedAt, userId: r.userId,
      vendorName: r.vendorName, vendorEmoji: r.vendorEmoji,
    };
  }

  function slugify(name) {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "vendor";
  }
  function uniqueSlug(base) {
    let slug = base, n = 1;
    while (db.vendors.some((v) => v.slug === slug)) { n += 1; slug = `${base}-${n}`; }
    return slug;
  }

  function generatePickupCode(vendorId) {
    const d = new Date();
    const pad = (n, w = 2) => String(n).padStart(w, "0");
    const stamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
      `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}${pad(d.getUTCMilliseconds(), 3)}`;
    return `M${vendorId}-${stamp}-${db.nextReservationSeq++}`;
  }

  function canAccessReservation(user, reservation) {
    if (user.role === "platform_admin" || Number(reservation.userId) === Number(user.id)) return true;
    const vendor = findVendor(reservation.vendorId);
    return vendor ? isStaffOrOwner(vendor, user) : false;
  }

  // ---------- the api object itself (same surface as api.js) ----------
  const api = {
    API_BASE: null,
    DEMO_MODE: true,

    signInWithGoogle() {
      sessionStorage.setItem("mitcham_return_to", location.hash || "#/");
      openPersonaPicker();
    },
    async fetchMe() {
      const u = requireAuth();
      const managed = db.vendors
        .filter((v) => Number(v.ownerId) === Number(u.id) || db.vendorStaff.some((s) => s.vendorId === v.id && s.userId === u.id))
        .map((v) => ({ id: v.id, slug: v.slug, name: v.name, emoji: v.emoji, status: v.status }));
      const me = { id: u.id, email: u.email, displayName: u.displayName, role: u.role, vendors: managed };
      setUser(me);
      return me;
    },
    signOut() { setToken(null); setUser(null); },
    hasToken() { return !!getToken(); },
    getCachedUser() { return getUser(); },
    consumeReturnTo() {
      const to = sessionStorage.getItem("mitcham_return_to");
      sessionStorage.removeItem("mitcham_return_to");
      return to;
    },

    // --- Marketplace ---
    async listVendors(params = {}) {
      let rows = db.vendors.filter((v) => v.status === "approved");
      if (params.city) rows = rows.filter((v) => v.city === params.city);
      if (params.category) rows = rows.filter((v) => v.category === params.category);
      if (params.q) {
        const q = String(params.q).toLowerCase();
        rows = rows.filter((v) => v.name.toLowerCase().includes(q) || v.description.toLowerCase().includes(q));
      }
      const withStats = rows.map((v) => {
        const vListings = db.listings.filter((l) => l.vendorId === v.id);
        const activeListings = vListings.filter((l) => l.isActive);
        const bagsLeft = activeListings.reduce((s, l) => s + currentBags(l.id), 0);
        return { ...serializeVendor(v), bagsLeft, activeListings: activeListings.length };
      });
      withStats.sort((a, b) => b.bagsLeft - a.bagsLeft || new Date(b.createdAt) - new Date(a.createdAt));
      return withStats;
    },
    async getImpact() {
      const active = db.reservations.filter((r) => r.status !== "cancelled");
      const bagsRescued = active.length;
      const totalSavingsPaise = active.reduce((s, r) => s + r.savingsPaise, 0);
      return {
        bagsRescued, totalSavingsPaise,
        estimatedKgCo2Avoided: Math.round(bagsRescued * 2.5),
      };
    },
    async getVendorBySlug(slug) {
      const v = db.vendors.find((x) => x.slug === slug);
      if (!v) throw apiErr(404, "not_found");
      if (v.status !== "approved") {
        const u = currentUser();
        const ok = u && (u.role === "platform_admin" || isStaffOrOwner(v, u));
        if (!ok) throw apiErr(404, "not_found");
      }
      return serializeVendor(v);
    },
    async applyToListVendor(payload) {
      const u = requireAuth();
      const name = String(payload?.name || "").trim();
      if (!name || name.length < 2) throw apiErr(400, "name_required");
      if (name.length > 80) throw apiErr(400, "name_too_long");
      const vendor = {
        id: db.nextVendorId++,
        ownerId: u.id,
        slug: uniqueSlug(slugify(name)),
        name,
        category: String(payload?.category || "Restaurant").trim(),
        city: String(payload?.city || "Bengaluru").trim(),
        tagline: String(payload?.tagline || "").trim(),
        description: String(payload?.description || "").trim(),
        emoji: String(payload?.emoji || "🍱").trim() || "🍱",
        themeColor: /^#[0-9a-fA-F]{6}$/.test(payload?.themeColor) ? payload.themeColor : "#1f7a4d",
        status: "pending",
        platformFeeRate: 0,
        createdAt: new Date().toISOString(),
      };
      db.vendors.push(vendor);
      db.vendorStaff.push({ vendorId: vendor.id, userId: u.id, staffRole: "owner" });
      if (u.role === "customer") u.role = "vendor";
      save();
      return serializeVendor(vendor);
    },
    async updateVendor(id, payload) {
      const u = requireAuth();
      const vendor = requireVendorAccess(id, u);
      const fields = {};
      for (const key of ["name", "category", "city", "tagline", "description", "emoji"]) {
        if (typeof payload?.[key] === "string" && payload[key].trim()) fields[key] = payload[key].trim();
      }
      if (typeof payload?.themeColor === "string" && /^#[0-9a-fA-F]{6}$/.test(payload.themeColor)) {
        fields.themeColor = payload.themeColor;
      }
      if (Object.keys(fields).length === 0) throw apiErr(400, "no_fields");
      Object.assign(vendor, fields);
      save();
      return serializeVendor(vendor);
    },

    // --- Platform admin ---
    async listPendingVendors() {
      const u = requireAuth();
      if (u.role !== "platform_admin") throw apiErr(403, "forbidden");
      return db.vendors.filter((v) => v.status === "pending").map(serializeVendor);
    },
    async listAllVendors() {
      const u = requireAuth();
      if (u.role !== "platform_admin") throw apiErr(403, "forbidden");
      return [...db.vendors].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((v) => {
        const owner = db.users.find((x) => Number(x.id) === Number(v.ownerId));
        return { ...serializeVendor(v), ownerEmail: owner?.email || null };
      });
    },
    async deleteVendor(id) {
      const u = requireAuth();
      if (u.role !== "platform_admin") throw apiErr(403, "forbidden");
      const v = findVendor(id);
      if (!v) throw apiErr(404, "not_found");
      // keep order history readable after the vendor row is gone
      db.reservations.forEach((r) => {
        if (r.vendorId === v.id && !r.vendorName) { r.vendorName = v.name; r.vendorEmoji = v.emoji; }
      });
      db.listings = db.listings.filter((l) => l.vendorId !== v.id);
      db.vendorStaff = db.vendorStaff.filter((s) => s.vendorId !== v.id);
      db.vendors = db.vendors.filter((x) => x.id !== v.id);
      save();
      return { ok: true };
    },
    async approveVendor(id) {
      const u = requireAuth();
      if (u.role !== "platform_admin") throw apiErr(403, "forbidden");
      const v = findVendor(id); if (!v) throw apiErr(404, "not_found");
      v.status = "approved"; save(); return serializeVendor(v);
    },
    async rejectVendor(id) {
      const u = requireAuth();
      if (u.role !== "platform_admin") throw apiErr(403, "forbidden");
      const v = findVendor(id); if (!v) throw apiErr(404, "not_found");
      v.status = "rejected"; save(); return serializeVendor(v);
    },
    async suspendVendor(id) {
      const u = requireAuth();
      if (u.role !== "platform_admin") throw apiErr(403, "forbidden");
      const v = findVendor(id); if (!v) throw apiErr(404, "not_found");
      v.status = "suspended"; save(); return serializeVendor(v);
    },

    // --- Listings & bags ---
    async getListings(vendorId) {
      return db.listings
        .filter((l) => l.vendorId === Number(vendorId) && l.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
        .map(serializeListing);
    },
    async getFullListings(vendorId) {
      const u = requireAuth();
      requireVendorAccess(vendorId, u);
      return db.listings
        .filter((l) => l.vendorId === Number(vendorId))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
        .map(serializeListing);
    },
    async getBags(vendorId) {
      return db.listings
        .filter((l) => l.vendorId === Number(vendorId))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
        .map((l) => ({ id: l.id, name: l.name, emoji: l.emoji, quantity: currentBags(l.id) }));
    },
    async createListing(vendorId, payload) {
      const u = requireAuth();
      const vendor = requireVendorAccess(vendorId, u);
      const name = String(payload?.name || "").trim();
      const originalPrice = Number(payload?.originalPrice);
      const discountPrice = Number(payload?.discountPrice);
      if (!name) throw apiErr(400, "name_required");
      if (!Number.isFinite(originalPrice) || originalPrice < 0) throw apiErr(400, "invalid_original_price");
      if (!Number.isFinite(discountPrice) || discountPrice < 0) throw apiErr(400, "invalid_discount_price");
      if (discountPrice > originalPrice) throw apiErr(400, "discount_exceeds_original");
      const initialBags = Number.isInteger(payload?.initialBags) ? payload.initialBags : 10;
      if (initialBags < 0) throw apiErr(400, "invalid_initial_bags");
      const listing = {
        id: db.nextListingId++, vendorId: vendor.id, name,
        originalPricePaise: Math.round(originalPrice * 100), discountPricePaise: Math.round(discountPrice * 100),
        emoji: String(payload?.emoji || "🥡").trim() || "🥡", description: String(payload?.description || "").trim(),
        pickupStart: String(payload?.pickupStart || "20:00").trim(), pickupEnd: String(payload?.pickupEnd || "21:00").trim(),
        isActive: true, sortOrder: db.listings.filter((l) => l.vendorId === vendor.id).length,
      };
      db.listings.push(listing);
      db.bags[listing.id] = initialBags;
      save();
      return serializeListing(listing);
    },
    async updateListing(vendorId, listingId, payload) {
      const u = requireAuth();
      const vendor = requireVendorAccess(vendorId, u);
      const listing = db.listings.find((l) => l.id === Number(listingId) && l.vendorId === vendor.id);
      if (!listing) throw apiErr(404, "not_found");
      if (typeof payload?.name === "string" && payload.name.trim()) listing.name = payload.name.trim();
      if (typeof payload?.emoji === "string" && payload.emoji.trim()) listing.emoji = payload.emoji.trim();
      if (typeof payload?.description === "string") listing.description = payload.description.trim();
      if (typeof payload?.isActive === "boolean") listing.isActive = payload.isActive;
      if (Number.isInteger(payload?.sortOrder)) listing.sortOrder = payload.sortOrder;
      if (typeof payload?.pickupStart === "string" && /^\d{2}:\d{2}$/.test(payload.pickupStart)) listing.pickupStart = payload.pickupStart;
      if (typeof payload?.pickupEnd === "string" && /^\d{2}:\d{2}$/.test(payload.pickupEnd)) listing.pickupEnd = payload.pickupEnd;
      if (payload?.originalPrice !== undefined) {
        const p = Number(payload.originalPrice);
        if (!Number.isFinite(p) || p < 0) throw apiErr(400, "invalid_original_price");
        listing.originalPricePaise = Math.round(p * 100);
      }
      if (payload?.discountPrice !== undefined) {
        const p = Number(payload.discountPrice);
        if (!Number.isFinite(p) || p < 0) throw apiErr(400, "invalid_discount_price");
        listing.discountPricePaise = Math.round(p * 100);
      }
      if (listing.discountPricePaise > listing.originalPricePaise) throw apiErr(400, "discount_exceeds_original");
      save();
      return serializeListing(listing);
    },
    async deleteListing(vendorId, listingId) {
      const u = requireAuth();
      const vendor = requireVendorAccess(vendorId, u);
      const idx = db.listings.findIndex((l) => l.id === Number(listingId) && l.vendorId === vendor.id);
      if (idx === -1) throw apiErr(404, "not_found");
      db.listings.splice(idx, 1);
      delete db.bags[listingId];
      save();
      return { ok: true };
    },
    async restockBags(vendorId, listingId, quantity) {
      const u = requireAuth();
      const vendor = requireVendorAccess(vendorId, u);
      const id = parseInt(listingId, 10);
      const qty = Number.isInteger(quantity) ? quantity : parseInt(quantity, 10);
      if (!Number.isInteger(id)) throw apiErr(400, "invalid_listing_id");
      if (!Number.isInteger(qty) || qty < 0) throw apiErr(400, "invalid_quantity");
      const listing = db.listings.find((l) => l.id === id && l.vendorId === vendor.id);
      if (!listing) throw apiErr(404, "listing_not_found");
      db.bags[id] = qty;
      save();
      return { ok: true, listingId: id, quantity: qty };
    },

    // --- Reservations ---
    async getVendorReservations(vendorId) {
      const u = requireAuth();
      const vendor = requireVendorAccess(vendorId, u);
      return db.reservations
        .filter((r) => r.vendorId === vendor.id)
        .sort((a, b) => new Date(b.placedAt) - new Date(a.placedAt))
        .slice(0, 200)
        .map(serializeReservation);
    },
    async createReservation(vendorId, { customer, items } = {}) {
      const u = requireAuth();
      const vendor = findVendor(vendorId);
      if (!vendor || vendor.status !== "approved") throw apiErr(404, "vendor_not_found");
      const custName = String(customer || "").trim();
      if (!custName) throw apiErr(400, "customer_required");
      if (!Array.isArray(items) || items.length === 0) throw apiErr(400, "items must be a non-empty array");

      const merged = new Map();
      for (const it of items) {
        const id = parseInt(it.listingId, 10);
        const qty = parseInt(it.qty, 10);
        if (!Number.isInteger(id) || id < 1) throw apiErr(400, `invalid listing id ${it.listingId}`);
        if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) throw apiErr(400, `invalid qty ${it.qty}`);
        merged.set(id, (merged.get(id) || 0) + qty);
      }
      const merged_ = Array.from(merged.entries()).map(([listingId, qty]) => ({ listingId, qty }));

      for (const { listingId } of merged_) {
        const listing = db.listings.find((l) => l.id === listingId && l.vendorId === vendor.id);
        if (!listing) throw apiErr(400, `listing_not_in_vendor:${listingId}`);
      }
      for (const { listingId, qty } of merged_) {
        const have = currentBags(listingId);
        if (have < qty) throw apiErr(409, `insufficient_bags:${listingId}`);
      }
      for (const { listingId, qty } of merged_) {
        db.bags[listingId] = currentBags(listingId) - qty;
      }

      let subtotalPaise = 0, originalSubtotalPaise = 0;
      for (const { listingId, qty } of merged_) {
        const listing = db.listings.find((l) => l.id === listingId);
        subtotalPaise += listing.discountPricePaise * qty;
        originalSubtotalPaise += listing.originalPricePaise * qty;
      }
      const totalPaise = Math.round(subtotalPaise * (1 + Number(vendor.platformFeeRate)));
      const savingsPaise = Math.max(0, originalSubtotalPaise - subtotalPaise);
      const pickupCode = generatePickupCode(vendor.id);

      db.reservations.push({
        pickupCode, vendorId: vendor.id, userId: u.id, customer: custName,
        totalPaise, savingsPaise, status: "reserved", placedAt: new Date().toISOString(),
        vendorName: vendor.name, vendorEmoji: vendor.emoji,
      });
      for (const { listingId, qty } of merged_) {
        db.reservationItems.push({ pickupCode, listingId, quantity: qty });
      }
      save();
      return { pickupCode, total: totalPaise / 100, savings: savingsPaise / 100, vendorId: vendor.id };
    },
    async markReservationReady(vendorId, pickupCode) {
      const u = requireAuth();
      const vendor = requireVendorAccess(vendorId, u);
      const r = db.reservations.find((x) => x.pickupCode === pickupCode && x.vendorId === vendor.id && x.status === "reserved");
      if (!r) throw apiErr(404, "not_found_or_not_reserved");
      r.status = "ready";
      save();
      return serializeReservation(r);
    },
    async confirmPickup(vendorId, pickupCode) {
      const u = requireAuth();
      const vendor = requireVendorAccess(vendorId, u);
      const r = db.reservations.find((x) => x.pickupCode === pickupCode && x.vendorId === vendor.id && (x.status === "reserved" || x.status === "ready"));
      if (!r) throw apiErr(404, "not_found_or_not_reserved");
      r.status = "picked_up";
      save();
      return serializeReservation(r);
    },
    async getMyReservations() {
      const u = requireAuth();
      return db.reservations
        .filter((r) => r.userId === u.id)
        .sort((a, b) => new Date(b.placedAt) - new Date(a.placedAt))
        .slice(0, 200)
        .map((r) => {
          const vendor = findVendor(r.vendorId);
          return {
            ...serializeReservation(r),
            vendorName: r.vendorName || vendor?.name || "Removed vendor",
            vendorSlug: vendor?.slug || null,
            vendorEmoji: r.vendorEmoji || vendor?.emoji || "🥡",
          };
        });
    },
    async getReservation(pickupCode) {
      const u = requireAuth();
      const r = db.reservations.find((x) => x.pickupCode === pickupCode);
      if (!r) throw apiErr(404, "not_found");
      if (!canAccessReservation(u, r)) throw apiErr(403, "forbidden");
      const items = db.reservationItems
        .filter((i) => i.pickupCode === pickupCode)
        .map((i) => {
          const listing = db.listings.find((l) => l.id === i.listingId);
          return {
            listingId: i.listingId, qty: i.quantity,
            name: listing?.name || `Listing #${i.listingId}`, emoji: listing?.emoji || "🥡",
            price: listing ? listing.discountPricePaise / 100 : null,
          };
        });
      return { ...serializeReservation(r), items };
    },
    async cancelReservation(pickupCode) {
      const u = requireAuth();
      const r = db.reservations.find((x) => x.pickupCode === pickupCode);
      if (!r) throw apiErr(404, "not_found");
      if (!canAccessReservation(u, r)) throw apiErr(403, "forbidden");
      if (r.status !== "reserved" && r.status !== "ready") throw apiErr(409, "not_cancellable");
      const items = db.reservationItems.filter((i) => i.pickupCode === pickupCode);
      for (const it of items) db.bags[it.listingId] = currentBags(it.listingId) + it.quantity;
      r.status = "cancelled";
      save();
      return { ok: true };
    },
  };

  // ---------- persona picker (stands in for the Google OAuth redirect) ----------
  const PERSONAS = [
    { userId: 7, label: "Demo Customer", hint: "Browse the marketplace, list a business, reserve bags" },
    { userId: 1, label: "Platform Admin", hint: "Approve, reject, suspend, or delete vendors" },
  ];

  function openPersonaPicker() {
    if (document.getElementById("demoPersonaModal")) return;
    const overlay = document.createElement("div");
    overlay.id = "demoPersonaModal";
    overlay.setAttribute("style", "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;");
    overlay.innerHTML = `
      <div style="background:var(--bg,#fff);color:inherit;max-width:440px;width:100%;border-radius:12px;padding:24px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <h3 style="margin:0 0 6px;">Choose a demo account</h3>
        <p class="muted" style="margin:0 0 16px;font-size:13px;">This is a static demo running without a backend, so "Sign in with Google" isn't available — pick who you'd like to be instead. Everything else behaves like the real app.</p>
        <div id="demoPersonaList" style="display:flex;flex-direction:column;gap:8px;"></div>
        <button id="demoPersonaCancel" class="btn ghost block" style="margin-top:16px;">Cancel</button>
      </div>
    `;
    document.body.appendChild(overlay);
    const list = overlay.querySelector("#demoPersonaList");
    PERSONAS.forEach((p) => {
      const btn = document.createElement("button");
      btn.className = "btn ghost block";
      btn.style.textAlign = "left";
      btn.innerHTML = `<strong>${p.label}</strong><br><span class="muted" style="font-weight:normal;font-size:12px;">${p.hint}</span>`;
      btn.addEventListener("click", () => {
        setToken(`demo:${p.userId}`);
        location.reload();
      });
      list.appendChild(btn);
    });
    overlay.querySelector("#demoPersonaCancel").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  }

  window.mitchamApi = api;
  window.mitchamDemoReset = function () {
    localStorage.removeItem(DB_KEY);
    setToken(null);
    setUser(null);
    location.reload();
  };
})();