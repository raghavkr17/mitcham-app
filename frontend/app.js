/* =========================================================
   Mitcham — Frontend Application Logic (API-backed)
   Vanilla JS, hash-based router, no build step.
   ========================================================= */

const LOW_BAGS_THRESHOLD = 3;
const CATEGORIES = ["Restaurant", "Bakery", "Sweet Shop", "Grocery", "Café", "Cloud Kitchen", "Other"];
const CITIES = ["Bengaluru", "Mumbai", "Delhi", "Pune", "Chennai", "Hyderabad", "Kolkata", "Other"];

const state = {
  user: null,           // { id, email, displayName, role, vendors } | null
  route: { name: "marketplace", params: {} },
  vendorCache: {},       // slug -> vendor
  listingCache: {},      // vendorId -> listings
  bagCache: {},          // vendorId -> { listingId: qty }
  cart: {},              // vendorId -> [{ listingId, qty }]
  loading: false,
};

// ===== Utilities =====
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const fmtMoney = (n) => `₹${Math.round(Number(n) || 0)}`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function toast(msg, kind = "info") {
  const t = document.createElement("div");
  t.className = `toast ${kind}`;
  t.textContent = msg;
  $("#toastWrap").appendChild(t);
  setTimeout(() => {
    t.style.transition = "opacity 0.4s, transform 0.4s";
    t.style.opacity = "0";
    t.style.transform = "translateX(20px)";
    setTimeout(() => t.remove(), 400);
  }, 2800);
}

function requireSignIn(message = "Sign in to continue") {
  toast(message, "info");
  window.mitchamApi.signInWithGoogle();
}

// ===== Router =====
function parseRoute() {
  const hash = (location.hash || "#/").slice(1) || "/";
  const parts = hash.split("/").filter(Boolean);
  if (parts.length === 0) return { name: "marketplace", params: {} };
  if (parts[0] === "for-vendors") return { name: "forVendors", params: {} };
  if (parts[0] === "list-vendor") return { name: "listVendor", params: {} };
  if (parts[0] === "my-reservations") return { name: "myReservations", params: {} };
  if (parts[0] === "admin") return { name: "admin", params: {} };
  if (parts[0] === "manage" && parts[1]) return { name: "manageDetail", params: { id: parts[1] } };
  if (parts[0] === "manage") return { name: "manageList", params: {} };
  if (parts[0] === "v" && parts[1]) {
    if (parts[2] === "reserve") return { name: "reserve", params: { slug: parts[1] } };
    return { name: "storefront", params: { slug: parts[1] } };
  }
  return { name: "notFound", params: {} };
}

function navigate(hash) { location.hash = hash; }

window.addEventListener("hashchange", () => render());

// ===== Boot =====
async function boot() {
  refreshNav();
  if (window.mitchamApi.hasToken()) {
    try {
      state.user = await window.mitchamApi.fetchMe();
    } catch (err) {
      window.mitchamApi.signOut();
      state.user = null;
    }
    const returnTo = window.mitchamApi.consumeReturnTo();
    if (returnTo && returnTo !== location.hash) navigate(returnTo);
  }
  refreshNav();
  render();
}

// ===== Nav / user chip =====
function refreshNav() {
  const u = state.user;
  const name = $("#userName");
  const loginBtn = $("#loginBtn");
  const manageTab = $("#manageTab");
  const adminTab = $("#adminTab");

  if (u) {
    name.textContent = u.displayName;
    loginBtn.textContent = "Sign out";
    loginBtn.onclick = () => {
      window.mitchamApi.signOut();
      state.user = null;
      refreshNav();
      toast("Signed out", "info");
      navigate("#/");
    };
    manageTab.classList.toggle("hidden", !(u.role === "vendor" || u.role === "platform_admin"));
    adminTab.classList.toggle("hidden", u.role !== "platform_admin");
  } else {
    name.textContent = "Guest";
    loginBtn.textContent = "Sign in with Google";
    loginBtn.onclick = () => window.mitchamApi.signInWithGoogle();
    manageTab.classList.add("hidden");
    adminTab.classList.add("hidden");
  }
  highlightNav();
}

function highlightNav() {
  const hash = location.hash || "#/";
  $$(".tab").forEach((t) => {
    const route = t.dataset.route;
    const isActive = route === "/" ? hash === "#/" : hash.startsWith(`#${route}`);
    t.classList.toggle("active", isActive);
  });
}

// ===== Cart helpers (scoped per vendor id) =====
function cartFor(vendorId) { return state.cart[vendorId] || (state.cart[vendorId] = []); }

// Mirrors the server's integer-paise math exactly so the total shown here
// always matches what createReservation() actually charges.
function cartTotals(vendorId, listings, feeRate) {
  const cart = cartFor(vendorId);
  let subtotalPaise = 0;
  let originalSubtotalPaise = 0;
  for (const c of cart) {
    const item = listings.find((l) => String(l.id) === String(c.listingId));
    if (!item) continue;
    subtotalPaise += item.discountPricePaise * c.qty;
    originalSubtotalPaise += item.originalPricePaise * c.qty;
  }
  const totalPaise = Math.round(subtotalPaise * (1 + feeRate));
  const savingsPaise = Math.max(0, originalSubtotalPaise - subtotalPaise);
  return { subtotal: subtotalPaise / 100, savings: savingsPaise / 100, total: totalPaise / 100 };
}

// ===== Main render dispatch =====
async function render() {
  state.route = parseRoute();
  highlightNav();
  const app = $("#app");
  app.innerHTML = `<p class="muted" style="padding:40px 0;text-align:center;">Loading…</p>`;
  window.scrollTo({ top: 0, behavior: "smooth" });

  try {
    switch (state.route.name) {
      case "marketplace": return renderMarketplace(app);
      case "forVendors": return renderForVendors(app);
      case "listVendor": return renderListVendor(app);
      case "storefront": return renderStorefront(app, state.route.params.slug);
      case "reserve": return renderReserve(app, state.route.params.slug);
      case "myReservations": return renderMyReservations(app);
      case "manageList": return renderManageList(app);
      case "manageDetail": return renderManageDetail(app, state.route.params.id);
      case "admin": return renderAdmin(app);
      default: return renderNotFound(app);
    }
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="empty-state"><h3>Something went wrong</h3><p class="muted">${esc(err.message || "Unknown error")}</p></div>`;
  }
}

function renderNotFound(app) {
  app.innerHTML = `<div class="empty-state"><h3>Page not found</h3><p class="muted">That link doesn't lead anywhere on Mitcham.</p><a class="btn primary" href="#/">Back to Nearby Bags</a></div>`;
}

// =========================================================
// MARKETPLACE — browse approved vendors with bags left
// =========================================================
async function renderMarketplace(app, filters = {}) {
  let vendors, impact;
  try {
    [vendors, impact] = await Promise.all([
      window.mitchamApi.listVendors(filters),
      window.mitchamApi.getImpact().catch(() => null),
    ]);
  } catch (err) {
    app.innerHTML = `<div class="empty-state"><h3>Can't reach the server</h3><p class="muted">Is the API running? (${esc(err.message)})</p></div>`;
    return;
  }

  app.innerHTML = `
    <section class="hero">
      <div class="hero-text">
        <h2>Great food, saved from the bin.</h2>
        <p>Restaurants, bakeries, sweet shops, and grocers near you have food left at closing time — perfectly good, steeply discounted. Reserve a bag, pick it up in the window, save it from going to waste.</p>
        <div class="hero-actions">
          <a class="btn primary" href="#/for-vendors">List Your Business</a>
          <a class="btn ghost" href="#/my-reservations">Track a Reservation</a>
        </div>
      </div>
      <div class="hero-stat">
        <div class="stat-card"><div class="stat-label">Vendors Live</div><div class="stat-value">${vendors.length}</div></div>
        <div class="stat-card"><div class="stat-label">Bags Rescued</div><div class="stat-value">${impact ? impact.bagsRescued : "—"}</div></div>
      </div>
    </section>

    ${impact ? `
    <div class="impact-strip">
      <div class="impact-item"><span class="impact-num">${impact.bagsRescued}</span><span class="impact-label">meals rescued</span></div>
      <div class="impact-item"><span class="impact-num">${fmtMoney(impact.totalSavingsPaise / 100)}</span><span class="impact-label">saved by customers</span></div>
      <div class="impact-item"><span class="impact-num">${impact.estimatedKgCo2Avoided} kg</span><span class="impact-label">CO₂e avoided (est.)</span></div>
    </div>` : ""}

    <div class="filter-row">
      <input id="searchInput" type="text" placeholder="Search vendors…" value="${esc(filters.q || "")}" />
      <select id="citySelect">
        <option value="">All cities</option>
        ${CITIES.map((c) => `<option value="${c}" ${filters.city === c ? "selected" : ""}>${c}</option>`).join("")}
      </select>
      <select id="categorySelect">
        <option value="">All categories</option>
        ${CATEGORIES.map((c) => `<option value="${c}" ${filters.category === c ? "selected" : ""}>${c}</option>`).join("")}
      </select>
    </div>

    <div id="vendorGrid" class="vendor-grid"></div>
  `;

  const grid = $("#vendorGrid");
  if (vendors.length === 0) {
    grid.innerHTML = `<div class="empty-state"><h3>No vendors match yet</h3><p class="muted">Try clearing your filters, or be the first to <a href="#/for-vendors">list a business</a>.</p></div>`;
  } else {
    grid.innerHTML = vendors.map((v) => `
      <a class="vendor-card" href="#/v/${v.slug}" style="--card-accent:${esc(v.themeColor)}">
        <div class="vc-top">
          <div class="vc-emoji">${v.emoji}</div>
          ${v.bagsLeft > 0 ? `<span class="bags-pill ${v.bagsLeft <= LOW_BAGS_THRESHOLD ? "low" : ""}">${v.bagsLeft} bags left</span>` : `<span class="bags-pill out">Sold out</span>`}
        </div>
        <h4>${esc(v.name)}</h4>
        <span class="vc-meta">${esc(v.category)} · ${esc(v.city)}</span>
        <p class="muted vc-tagline">${esc(v.tagline)}</p>
      </a>
    `).join("");
  }

  $("#searchInput").addEventListener("input", debounce((e) => {
    renderMarketplace(app, { ...filters, q: e.target.value });
  }, 300));
  $("#citySelect").addEventListener("change", (e) => {
    renderMarketplace(app, { ...filters, city: e.target.value || undefined });
  });
  $("#categorySelect").addEventListener("change", (e) => {
    renderMarketplace(app, { ...filters, category: e.target.value || undefined });
  });
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// =========================================================
// FOR VENDORS — pitch page
// =========================================================
function renderForVendors(app) {
  app.innerHTML = `
    <section class="hero pitch-hero">
      <div class="hero-text">
        <h2>Turn tonight's surplus into tomorrow's regulars.</h2>
        <p>Every plate, loaf, or box you'd otherwise throw out at closing time can instead be reserved by someone nearby — at a price you set, for food that would've cost you money either way. List it in minutes, no new hardware, no contract.</p>
        <div class="hero-actions">
          <a class="btn primary" href="#/list-vendor">List Your Business — Free</a>
          <a class="btn ghost" href="#/">See it in action</a>
        </div>
      </div>
    </section>

    <div class="pitch-grid">
      <div class="pitch-card">
        <div class="pitch-icon">🥡</div>
        <h4>Post a surprise bag in minutes</h4>
        <p class="muted">Name it, set an original and discounted price, pick a pickup window near your closing time. Done.</p>
      </div>
      <div class="pitch-card">
        <div class="pitch-icon">📉</div>
        <h4>Recover cost, not waste it</h4>
        <p class="muted">Food you'd otherwise bin earns something instead — and every sale is one less bag going to landfill.</p>
      </div>
      <div class="pitch-card">
        <div class="pitch-icon">📊</div>
        <h4>A dashboard built for closing time</h4>
        <p class="muted">See reservations as they land, confirm pickups at the counter, and restock bag counts with one tap.</p>
      </div>
      <div class="pitch-card">
        <div class="pitch-icon">🤝</div>
        <h4>New customers, low commitment</h4>
        <p class="muted">Rescue shoppers are discovering your business for the first time — a fraction of them become regulars.</p>
      </div>
    </div>

    <div class="pitch-steps">
      <h3 class="section-title">How it works</h3>
      <ol class="steps-list">
        <li><strong>Apply.</strong> Tell us your business name, category, and city.</li>
        <li><strong>Get approved.</strong> A quick review, then your page goes live at <code>mitcham.app/v/your-business</code>.</li>
        <li><strong>Post today's surplus.</strong> Add a listing — original price, discount price, and tonight's pickup window.</li>
        <li><strong>Confirm pickups.</strong> A customer shows their pickup code at the counter; you mark it collected.</li>
      </ol>
    </div>
  `;
}

// =========================================================
// LIST VENDOR — application form
// =========================================================
function renderListVendor(app) {
  if (!state.user) {
    app.innerHTML = `
      <div class="empty-state">
        <h3>Sign in to list your business</h3>
        <p class="muted">Mitcham uses your Google account to identify the owner of each vendor listing.</p>
        <button class="btn primary" id="signInCta">Sign in with Google</button>
      </div>
    `;
    $("#signInCta").addEventListener("click", () => requireSignIn());
    return;
  }

  app.innerHTML = `
    <h2 class="section-title">List Your Business</h2>
    <p class="muted" style="margin-bottom:16px;">Applications are reviewed by a Mitcham platform admin before going live in the marketplace.</p>
    <form id="applyForm" class="form-card">
      <label class="field"><span>Business name</span><input name="name" type="text" required maxlength="80" placeholder="e.g. Sunrise Bakery" /></label>
      <label class="field"><span>Category</span>
        <select name="category">${CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join("")}</select>
      </label>
      <label class="field"><span>City</span>
        <select name="city">${CITIES.map((c) => `<option value="${c}">${c}</option>`).join("")}</select>
      </label>
      <label class="field"><span>Tagline (short, shows on your card)</span><input name="tagline" type="text" maxlength="120" placeholder="e.g. Today's bake, rescued tonight." /></label>
      <label class="field"><span>Description</span><textarea name="description" rows="3" placeholder="Tell customers what kind of surplus you'll be listing."></textarea></label>
      <label class="field"><span>Emoji (your page icon)</span><input name="emoji" type="text" maxlength="4" placeholder="🥐" /></label>
      <label class="field"><span>Theme color</span><input name="themeColor" type="color" value="#1f7a4d" /></label>
      <button class="btn primary block" type="submit">Submit Application</button>
      <div id="applyResult" class="tool-result"></div>
    </form>
  `;

  $("#applyForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      name: fd.get("name").trim(),
      category: fd.get("category"),
      city: fd.get("city"),
      tagline: fd.get("tagline").trim(),
      description: fd.get("description").trim(),
      emoji: fd.get("emoji").trim() || "🍱",
      themeColor: fd.get("themeColor"),
    };
    if (!payload.name) { toast("Business name is required", "danger"); return; }
    try {
      const vendor = await window.mitchamApi.applyToListVendor(payload);
      state.user = await window.mitchamApi.fetchMe();
      refreshNav();
      $("#applyResult").innerHTML = `<span style="color:var(--good);">✓ Application submitted! "${esc(vendor.name)}" is pending review — check its status under <a href="#/manage/${vendor.id}">Manage</a>.</span>`;
      toast("Application submitted", "success");
      e.target.reset();
    } catch (err) {
      $("#applyResult").innerHTML = `<span style="color:var(--danger);">${esc(err.message)}</span>`;
    }
  });
}

// =========================================================
// STOREFRONT — per-vendor public listings
// =========================================================
async function loadVendorContext(slug) {
  const vendor = await window.mitchamApi.getVendorBySlug(slug);
  const [listings, bags] = await Promise.all([
    window.mitchamApi.getListings(vendor.id),
    window.mitchamApi.getBags(vendor.id),
  ]);
  state.vendorCache[slug] = vendor;
  state.listingCache[vendor.id] = listings;
  state.bagCache[vendor.id] = Object.fromEntries(bags.map((r) => [String(r.id), r.quantity]));
  return { vendor, listings };
}

function bagsOf(vendorId, listingId) {
  return state.bagCache[vendorId]?.[String(listingId)] ?? 0;
}

function themeStyle(vendor) {
  return `--accent:${vendor.themeColor};--accent-dark:${shade(vendor.themeColor, -18)};`;
}
function shade(hex, percent) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + Math.round((percent / 100) * 255)));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + Math.round((percent / 100) * 255)));
  const b = Math.max(0, Math.min(255, (n & 255) + Math.round((percent / 100) * 255)));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function listingCardHtml(l, vendorId, { compact = false } = {}) {
  const bags = bagsOf(vendorId, l.id);
  const bagsClass = bags === 0 ? "out" : bags <= LOW_BAGS_THRESHOLD ? "low" : "";
  const bagsLabel = bags === 0 ? "Sold out" : `${bags} bag${bags === 1 ? "" : "s"} left`;
  return `
    <div class="menu-card" data-item-id="${l.id}">
      <div class="menu-emoji">${l.emoji}</div>
      <h4>${esc(l.name)}</h4>
      ${compact ? "" : `<p class="muted" style="font-size:12px;margin-bottom:6px;">${esc(l.description || "")}</p>`}
      <div class="price-row">
        <span class="price">${fmtMoney(l.discountPrice)}</span>
        <span class="price-original">${fmtMoney(l.originalPrice)}</span>
        <span class="discount-badge">${l.discountPct}% off</span>
      </div>
      <div class="pickup-window">🕘 Pickup ${l.pickupStart}–${l.pickupEnd}</div>
      <span class="stock-pill ${bagsClass}">${bagsLabel}</span>
      <div class="actions">
        <div class="qty">
          <button data-act="dec" aria-label="Decrease">−</button>
          <input type="number" min="1" max="${Math.max(bags, 1)}" value="1" ${bags === 0 ? "disabled" : ""} />
          <button data-act="inc" aria-label="Increase">+</button>
        </div>
        <button class="add-btn" ${bags === 0 ? "disabled" : ""}>Reserve</button>
      </div>
    </div>
  `;
}

function wireListingCard(card, vendor, l, onAdd) {
  const bags = bagsOf(vendor.id, l.id);
  const qtyInput = card.querySelector("input");
  card.querySelector('[data-act="dec"]').addEventListener("click", () => {
    qtyInput.value = Math.max(1, (parseInt(qtyInput.value, 10) || 1) - 1);
  });
  card.querySelector('[data-act="inc"]').addEventListener("click", () => {
    qtyInput.value = Math.min(Math.max(bags, 1), (parseInt(qtyInput.value, 10) || 1) + 1);
  });
  card.querySelector(".add-btn").addEventListener("click", () => {
    const qty = parseInt(qtyInput.value, 10) || 1;
    addToCart(vendor, l, qty);
    if (onAdd) onAdd();
  });
}

function addToCart(vendor, listing, qty) {
  const bags = bagsOf(vendor.id, listing.id);
  const cart = cartFor(vendor.id);
  const existing = cart.find((c) => String(c.listingId) === String(listing.id));
  const inCart = existing ? existing.qty : 0;
  const desired = inCart + qty;
  if (bags === 0) { toast("Sold out", "danger"); return; }
  if (desired > bags) { toast(`Only ${bags - inCart} more available`, "danger"); return; }
  if (existing) existing.qty = desired;
  else cart.push({ listingId: listing.id, qty });
  toast(`Added ${qty} × ${listing.name} to your reservation`, "success");
  navigate(`#/v/${vendor.slug}/reserve`);
}

async function renderStorefront(app, slug) {
  let ctx;
  try {
    ctx = await loadVendorContext(slug);
  } catch (err) {
    app.innerHTML = `<div class="empty-state"><h3>Vendor not found</h3><p class="muted">"${esc(slug)}" isn't live on Mitcham right now.</p><a class="btn primary" href="#/">Back to Nearby Bags</a></div>`;
    return;
  }
  const { vendor, listings } = ctx;
  const totalBags = Object.values(state.bagCache[vendor.id] || {}).reduce((a, b) => a + b, 0);

  app.setAttribute("style", themeStyle(vendor));

  const pendingBanner = vendor.status !== "approved"
    ? `<div class="notice-banner">This page is <strong>${esc(vendor.status)}</strong> and only visible to you as the owner/admin — it won't show in the public marketplace until approved.</div>`
    : "";

  app.innerHTML = `
    ${pendingBanner}
    <section class="hero">
      <div class="hero-text">
        <div class="storefront-title"><span class="storefront-emoji">${vendor.emoji}</span><h2>${esc(vendor.name)}</h2></div>
        <p class="muted" style="margin-bottom:8px;">${esc(vendor.category)} · ${esc(vendor.city)} · ${esc(vendor.tagline)}</p>
        <p>${esc(vendor.description)}</p>
        <div class="hero-actions">
          <a class="btn primary" href="#/v/${vendor.slug}/reserve">Reserve a Bag</a>
          <a class="btn ghost" href="#/my-reservations">Track a Reservation</a>
        </div>
      </div>
      <div class="hero-stat">
        <div class="stat-card"><div class="stat-label">Bags Left Today</div><div class="stat-value">${totalBags}</div></div>
        <div class="stat-card"><div class="stat-label">Listings</div><div class="stat-value">${listings.length}</div></div>
      </div>
    </section>

    <h3 class="section-title">Today's Surplus</h3>
    <div id="menuGrid" class="menu-grid"></div>
  `;

  const grid = $("#menuGrid");
  if (listings.length === 0) {
    grid.innerHTML = `<p class="muted">Nothing listed yet — check back closer to closing time.</p>`;
  } else {
    grid.innerHTML = listings.map((l) => listingCardHtml(l, vendor.id)).join("");
    $$(".menu-card", grid).forEach((card) => {
      const l = listings.find((x) => String(x.id) === card.dataset.itemId);
      wireListingCard(card, vendor, l);
    });
  }
}

// =========================================================
// RESERVE — cart + checkout for one vendor
// =========================================================
async function renderReserve(app, slug) {
  let vendor = state.vendorCache[slug];
  let listings = vendor ? state.listingCache[vendor.id] : null;
  if (!vendor || !listings) {
    try {
      ({ vendor, listings } = await loadVendorContext(slug));
    } catch (err) {
      app.innerHTML = `<div class="empty-state"><h3>Vendor not found</h3><a class="btn primary" href="#/">Back to Nearby Bags</a></div>`;
      return;
    }
  }
  app.setAttribute("style", themeStyle(vendor));
  const cart = cartFor(vendor.id);

  app.innerHTML = `
    <div class="breadcrumb"><a href="#/v/${vendor.slug}">${vendor.emoji} ${esc(vendor.name)}</a> / Reserve</div>
    <h2 class="section-title">Reserve Today's Surplus</h2>
    <div class="order-layout">
      <div class="order-left">
        <div id="orderMenu" class="menu-grid compact"></div>
      </div>
      <aside class="order-cart">
        <h3>🥡 Your Reservation</h3>
        <div id="cartList" class="cart-list"></div>
        <div class="cart-totals">
          <div><span>You pay</span><span id="cartSubtotal">₹0</span></div>
          <div><span>You save</span><span id="cartSavings" class="savings-line">₹0</span></div>
          <div class="grand"><span>Total</span><span id="cartTotal">₹0</span></div>
        </div>
        <label class="field">
          <span>Name for pickup</span>
          <input id="orderName" type="text" placeholder="e.g. Raghav" value="${esc(state.user?.displayName || "")}" />
        </label>
        <button id="checkoutBtn" class="btn primary block" ${cart.length === 0 ? "disabled" : ""}>Reserve & Get Pickup Code</button>
        <button id="clearCartBtn" class="btn ghost block">Clear</button>
        <div id="checkoutResult" class="checkout-result"></div>
      </aside>
    </div>
  `;

  function paintOrderMenu() {
    const grid = $("#orderMenu");
    grid.innerHTML = listings.map((l) => listingCardHtml(l, vendor.id, { compact: true })).join("");
    $$(".menu-card", grid).forEach((card) => {
      const l = listings.find((x) => String(x.id) === card.dataset.itemId);
      wireListingCard(card, vendor, l, paintAll);
    });
  }

  function paintCart() {
    const list = $("#cartList");
    if (cart.length === 0) {
      list.innerHTML = `<p class="muted">No bags reserved yet. Add one from the list.</p>`;
    } else {
      list.innerHTML = cart.map((c) => {
        const l = listings.find((x) => String(x.id) === String(c.listingId));
        if (!l) return "";
        return `
          <div class="cart-item" data-item-id="${c.listingId}">
            <div>
              <div class="ci-name">${l.emoji} ${esc(l.name)}</div>
              <div class="ci-meta">
                <button data-act="dec" class="ci-step">−</button>
                <span style="margin:0 6px;">${c.qty}</span>
                <button data-act="inc" class="ci-step">+</button>
                <span style="margin-left:8px;">× ${fmtMoney(l.discountPrice)}</span>
              </div>
            </div>
            <div style="text-align:right;">
              <div class="ci-price">${fmtMoney(l.discountPrice * c.qty)}</div>
              <button class="ci-remove">Remove</button>
            </div>
          </div>
        `;
      }).join("");
      $$(".cart-item", list).forEach((row) => {
        const listingId = row.dataset.itemId;
        row.querySelector('[data-act="dec"]').addEventListener("click", () => updateCartQty(vendor, listingId, -1, paintAll));
        row.querySelector('[data-act="inc"]').addEventListener("click", () => updateCartQty(vendor, listingId, +1, paintAll));
        row.querySelector(".ci-remove").addEventListener("click", () => {
          state.cart[vendor.id] = cartFor(vendor.id).filter((c) => String(c.listingId) !== listingId);
          paintAll();
        });
      });
    }
    const { subtotal, savings, total } = cartTotals(vendor.id, listings, Number(vendor.platformFeeRate));
    $("#cartSubtotal").textContent = fmtMoney(subtotal);
    $("#cartSavings").textContent = `−${fmtMoney(savings)}`;
    $("#cartTotal").textContent = fmtMoney(total);
    $("#checkoutBtn").disabled = cart.length === 0;
  }

  function paintAll() { paintOrderMenu(); paintCart(); }
  paintAll();

  $("#clearCartBtn").addEventListener("click", () => { state.cart[vendor.id] = []; paintAll(); });

  $("#checkoutBtn").addEventListener("click", async () => {
    if (cartFor(vendor.id).length === 0) return;
    if (!state.user) { requireSignIn("Sign in to reserve a bag"); return; }
    const name = ($("#orderName").value || "").trim() || state.user.displayName;
    $("#checkoutBtn").disabled = true;
    try {
      const items = cartFor(vendor.id).map((c) => ({ listingId: c.listingId, qty: c.qty }));
      const res = await window.mitchamApi.createReservation(vendor.id, { customer: name, items });
      const bags = await window.mitchamApi.getBags(vendor.id);
      state.bagCache[vendor.id] = Object.fromEntries(bags.map((r) => [String(r.id), r.quantity]));
      state.cart[vendor.id] = [];
      paintAll();
      const result = $("#checkoutResult");
      result.innerHTML = `
        ✅ Reserved for <strong>${esc(name)}</strong>!
        <div>You paid <strong>${fmtMoney(res.total)}</strong> and saved <strong>${fmtMoney(res.savings)}</strong>.</div>
        <div>Your pickup code:</div>
        <div class="barcode">${res.pickupCode}</div>
        <div class="muted" style="margin-top:6px;font-size:12px;">Show this at the counter during the pickup window. Manage it anytime from <a href="#/my-reservations">My Reservations</a>.</div>
      `;
      result.classList.add("show");
      toast("Reserved!", "success");
    } catch (err) {
      if (err.status === 409) toast("Not enough bags left for one of the items", "danger");
      else toast(err.message || "Reservation failed", "danger");
    } finally {
      $("#checkoutBtn").disabled = cartFor(vendor.id).length === 0;
    }
  });
}

function updateCartQty(vendor, listingId, delta, onChange) {
  const cart = cartFor(vendor.id);
  const item = cart.find((c) => String(c.listingId) === String(listingId));
  if (!item) return;
  const bags = bagsOf(vendor.id, listingId);
  const next = item.qty + delta;
  if (next < 1) {
    state.cart[vendor.id] = cart.filter((c) => String(c.listingId) !== String(listingId));
  } else if (next > bags) {
    toast(`Only ${bags} available`, "danger");
  } else {
    item.qty = next;
  }
  onChange();
}

// =========================================================
// MY RESERVATIONS — cross-vendor history + pickup-code tools
// =========================================================
async function renderMyReservations(app) {
  if (!state.user) {
    app.innerHTML = `
      <div class="empty-state">
        <h3>Sign in to see your reservations</h3>
        <button class="btn primary" id="signInCta">Sign in with Google</button>
      </div>`;
    $("#signInCta").addEventListener("click", () => requireSignIn());
    return;
  }

  app.innerHTML = `
    <h2 class="section-title">My Reservations</h2>
    <div class="order-tools">
      <div class="tool-card">
        <h4>🔍 Look Up a Reservation</h4>
        <p class="muted">Enter a pickup code to see its details.</p>
        <div class="row"><input id="retrBarcode" type="text" placeholder="e.g. M1-20260822T005345068" /><button id="retrBtn" class="btn primary">Look Up</button></div>
        <div id="retrResult" class="tool-result"></div>
      </div>
      <div class="tool-card danger">
        <h4>❌ Cancel a Reservation</h4>
        <p class="muted">Frees the bag(s) back up for someone else.</p>
        <div class="row"><input id="cancelBarcode" type="text" placeholder="Pickup code" /><button id="cancelBtn" class="btn danger">Cancel</button></div>
        <div id="cancelResult" class="tool-result"></div>
      </div>
    </div>

    <h3 class="section-title">History</h3>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Vendor</th><th>Pickup Code</th><th>Status</th><th>Placed</th><th>Total</th><th>Saved</th></tr></thead>
        <tbody id="ordersBody"></tbody>
      </table>
    </div>
  `;

  async function refreshHistory() {
    const tbody = $("#ordersBody");
    try {
      const reservations = await window.mitchamApi.getMyReservations();
      if (reservations.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="muted" style="text-align:center;padding:24px;">No reservations yet — <a href="#/">browse nearby bags</a>.</td></tr>`;
      } else {
        tbody.innerHTML = reservations.map((o) => `
          <tr>
            <td>${o.vendorSlug ? `<a href="#/v/${o.vendorSlug}">${o.vendorEmoji} ${esc(o.vendorName)}</a>` : `${o.vendorEmoji} ${esc(o.vendorName)}`}</td>
            <td class="barcode-cell">${o.pickupCode}</td>
            <td><span class="status-pill status-${o.status}">${o.status.replace("_", " ")}</span></td>
            <td>${new Date(o.placedAt).toLocaleString()}</td>
            <td class="total-cell">${fmtMoney(o.total)}</td>
            <td class="savings-cell">${fmtMoney(o.savings)}</td>
          </tr>
        `).join("");
      }
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted" style="text-align:center;padding:24px;">Couldn't load reservations.</td></tr>`;
    }
  }
  await refreshHistory();

  $("#retrBtn").addEventListener("click", async () => {
    const code = $("#retrBarcode").value.trim();
    if (!code) { toast("Enter a pickup code", "danger"); return; }
    try {
      const r = await window.mitchamApi.getReservation(code);
      const itemsList = r.items.map((i) => `<div class="retr-line">${i.qty} × ${i.emoji} ${esc(i.name)}${i.price != null ? ` (${fmtMoney(i.price * i.qty)})` : ""}</div>`).join("");
      $("#retrResult").innerHTML = `
        <div class="retr-line"><strong>Name:</strong> ${esc(r.customer)}</div>
        <div class="retr-line"><strong>Status:</strong> ${esc(r.status)}</div>
        <div class="retr-line"><strong>Placed:</strong> ${new Date(r.placedAt).toLocaleString()}</div>
        <div class="retr-line"><strong>Bags:</strong></div>${itemsList}
        <div class="retr-line" style="margin-top:6px;"><strong>Total:</strong> ${fmtMoney(r.total)} (saved ${fmtMoney(r.savings)})</div>
      `;
    } catch (err) {
      $("#retrResult").innerHTML = `<span style="color:var(--danger);">No reservation found for code "${esc(code)}".</span>`;
    }
  });

  $("#cancelBtn").addEventListener("click", async () => {
    const code = $("#cancelBarcode").value.trim();
    if (!code) { toast("Enter a pickup code", "danger"); return; }
    try {
      await window.mitchamApi.cancelReservation(code);
      $("#cancelResult").innerHTML = `<span style="color:var(--good);">✓ Cancelled ${esc(code)}. The bag is back up for grabs.</span>`;
      $("#cancelBarcode").value = "";
      toast(`Reservation ${code} cancelled`, "danger");
      await refreshHistory();
    } catch (err) {
      $("#cancelResult").innerHTML = `<span style="color:var(--danger);">${esc(err.message)}</span>`;
    }
  });
}

// =========================================================
// MANAGE — vendor dashboard (list + detail)
// =========================================================
function renderManageList(app) {
  if (!state.user) { app.innerHTML = `<div class="empty-state"><h3>Sign in required</h3></div>`; return; }
  const mine = state.user.vendors || [];
  app.innerHTML = `
    <h2 class="section-title">Manage Your Vendors</h2>
    <div class="vendor-grid" id="manageGrid"></div>
    <a class="btn ghost" href="#/list-vendor" style="margin-top:16px;display:inline-block;">+ List another business</a>
  `;
  const grid = $("#manageGrid");
  if (mine.length === 0) {
    grid.innerHTML = `<div class="empty-state"><h3>No vendors yet</h3><p class="muted">Apply to list one and it'll show up here.</p></div>`;
  } else {
    grid.innerHTML = mine.map((v) => `
      <a class="vendor-card" href="#/manage/${v.id}">
        <div class="vc-emoji">${v.emoji}</div>
        <h4>${esc(v.name)}</h4>
        <span class="status-pill status-${v.status}">${v.status}</span>
      </a>
    `).join("");
  }
}

async function renderManageDetail(app, id) {
  if (!state.user) { app.innerHTML = `<div class="empty-state"><h3>Sign in required</h3></div>`; return; }

  let listings, vendor, reservations, fullVendor;
  try {
    listings = await window.mitchamApi.getFullListings(id);
    vendor = (state.user.vendors || []).find((v) => String(v.id) === String(id));
    reservations = await window.mitchamApi.getVendorReservations(id);
    fullVendor = vendor?.slug ? await window.mitchamApi.getVendorBySlug(vendor.slug) : null;
  } catch (err) {
    app.innerHTML = `<div class="empty-state"><h3>Can't manage this vendor</h3><p class="muted">${esc(err.message)}</p></div>`;
    return;
  }

  const activeReservations = reservations.filter((r) => r.status !== "cancelled");
  const revenue = activeReservations.reduce((s, o) => s + o.totalPaise, 0) / 100;
  const savedForCustomers = activeReservations.reduce((s, o) => s + o.savingsPaise, 0) / 100;
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = reservations.filter((o) => o.placedAt?.slice(0, 10) === today).length;

  app.innerHTML = `
    <div class="breadcrumb"><a href="#/manage">Manage</a> / ${esc(vendor?.name || "Vendor")}</div>
    <h2 class="section-title">${esc(vendor?.name || "Vendor")} <span class="status-pill status-${vendor?.status}">${vendor?.status}</span></h2>

    <details class="form-card" id="editVendorDetails" style="margin-bottom:16px;">
      <summary style="cursor:pointer;font-weight:600;">✏️ Customize emoji &amp; details</summary>
      <form id="editVendorForm" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <input name="emoji" value="${esc(fullVendor?.emoji || vendor?.emoji || "")}" maxlength="4" placeholder="🥡" style="flex:0 0 64px;" />
        <input name="name" value="${esc(fullVendor?.name || vendor?.name || "")}" placeholder="Business name" style="flex:2;" />
        <input name="tagline" value="${esc(fullVendor?.tagline || "")}" placeholder="Tagline" style="flex:2;" />
        <button class="btn primary" type="submit">Save</button>
      </form>
    </details>

    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-label">Revenue</div><div class="kpi-value">${fmtMoney(revenue)}</div></div>
      <div class="kpi"><div class="kpi-label">Reservations Today</div><div class="kpi-value">${todayCount}</div></div>
      <div class="kpi"><div class="kpi-label">Bags Rescued</div><div class="kpi-value">${activeReservations.length}</div></div>
      <div class="kpi"><div class="kpi-label">Saved For Customers</div><div class="kpi-value">${fmtMoney(savedForCustomers)}</div></div>
    </div>

    <h3 class="section-title">Today's Listings</h3>
    <form id="newItemForm" class="form-card inline-form">
      <input name="name" placeholder="Listing name" required style="flex:2;" />
      <input name="originalPrice" type="number" step="1" min="0" placeholder="Original ₹" required style="flex:1;" />
      <input name="discountPrice" type="number" step="1" min="0" placeholder="Discount ₹" required style="flex:1;" />
      <input name="emoji" placeholder="🥡" maxlength="4" style="flex:1;" />
      <input name="pickupStart" type="time" value="20:00" style="flex:1;" />
      <input name="pickupEnd" type="time" value="21:00" style="flex:1;" />
      <input name="initialBags" type="number" min="0" placeholder="Bags" style="flex:1;" />
      <button class="btn primary" type="submit">Post Listing</button>
    </form>
    <div id="manageMenuGrid" class="menu-grid compact"></div>

    <h3 class="section-title">Recent Reservations</h3>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Pickup Code</th><th>Customer</th><th>Status</th><th>Placed</th><th>Total</th><th></th></tr></thead>
        <tbody id="reservationsBody">
          ${reservations.length === 0
            ? `<tr><td colspan="6" class="muted" style="text-align:center;padding:24px;">No reservations yet.</td></tr>`
            : reservations.slice(0, 25).map((o) => `
              <tr data-code="${o.pickupCode}">
                <td class="barcode-cell">${o.pickupCode}</td>
                <td>${esc(o.customer)}</td>
                <td><span class="status-pill status-${o.status}">${o.status.replace("_", " ")}</span></td>
                <td>${new Date(o.placedAt).toLocaleString()}</td>
                <td class="total-cell">${fmtMoney(o.total)}</td>
                <td>
                  ${o.status === "reserved" ? `<button class="btn ghost mark-ready-btn">Mark ready</button>` : ""}
                  ${o.status === "reserved" || o.status === "ready" ? `<button class="btn ghost confirm-pickup-btn">Confirm pickup</button>` : ""}
                </td>
              </tr>
            `).join("")}
        </tbody>
      </table>
    </div>
  `;

  $$(".mark-ready-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = btn.closest("tr");
      const code = row.dataset.code;
      try {
        await window.mitchamApi.markReservationReady(id, code);
        toast(`${code} marked ready for pickup`, "success");
        renderManageDetail(app, id);
      } catch (err) {
        toast(err.message, "danger");
      }
    });
  });

  $$(".confirm-pickup-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = btn.closest("tr");
      const code = row.dataset.code;
      try {
        await window.mitchamApi.confirmPickup(id, code);
        toast(`${code} marked picked up`, "success");
        renderManageDetail(app, id);
      } catch (err) {
        toast(err.message, "danger");
      }
    });
  });

  const editVendorForm = $("#editVendorForm");
  if (editVendorForm) {
    editVendorForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        emoji: (fd.get("emoji") || "").trim(),
        name: (fd.get("name") || "").trim(),
        tagline: (fd.get("tagline") || "").trim(),
      };
      try {
        await window.mitchamApi.updateVendor(id, payload);
        state.user = await window.mitchamApi.fetchMe();
        toast("Vendor details updated", "success");
        renderManageDetail(app, id);
      } catch (err) {
        toast(err.message, "danger");
      }
    });
  }

  function paintMenu() {
    const grid = $("#manageMenuGrid");
    if (listings.length === 0) {
      grid.innerHTML = `<p class="muted">No listings yet — post one above.</p>`;
      return;
    }
    grid.innerHTML = listings.map((l) => `
      <div class="menu-card ${l.isActive ? "" : "inactive"}" data-item-id="${l.id}">
        <div class="menu-emoji">${l.emoji}</div>
        <h4>${esc(l.name)}</h4>
        <div class="price-row">
          <span class="price">${fmtMoney(l.discountPrice)}</span>
          <span class="price-original">${fmtMoney(l.originalPrice)}</span>
          <span class="discount-badge">${l.discountPct}% off</span>
        </div>
        <div class="pickup-window">🕘 ${l.pickupStart}–${l.pickupEnd}</div>
        <span class="stock-pill">${l.isActive ? "Live" : "Hidden"}</span>
        <div class="actions manage-actions">
          <input class="restock-input" type="number" min="0" placeholder="Bags" style="width:56px;" />
          <button class="btn ghost restock-btn" style="flex:1;">Restock</button>
        </div>
        <div class="actions manage-actions">
          <button class="btn ghost toggle-btn" style="flex:1;">${l.isActive ? "Hide" : "Unhide"}</button>
          <button class="btn danger delete-btn" style="flex:1;">Delete</button>
        </div>
      </div>
    `).join("");

    $$(".menu-card", grid).forEach((card) => {
      const listingId = card.dataset.itemId;
      const item = listings.find((l) => String(l.id) === listingId);
      card.querySelector(".restock-btn").addEventListener("click", async () => {
        const qty = parseInt(card.querySelector(".restock-input").value, 10);
        if (!Number.isInteger(qty) || qty < 0) { toast("Enter a valid bag count", "danger"); return; }
        try {
          await window.mitchamApi.restockBags(id, listingId, qty);
          toast(`${item.name} restocked to ${qty} bags`, "success");
        } catch (err) { toast(err.message, "danger"); }
      });
      card.querySelector(".toggle-btn").addEventListener("click", async () => {
        try {
          const updated = await window.mitchamApi.updateListing(id, listingId, { isActive: !item.isActive });
          Object.assign(item, updated);
          paintMenu();
        } catch (err) { toast(err.message, "danger"); }
      });
      card.querySelector(".delete-btn").addEventListener("click", async () => {
        try {
          await window.mitchamApi.deleteListing(id, listingId);
          listings = listings.filter((l) => String(l.id) !== listingId);
          paintMenu();
          toast(`${item.name} removed`, "info");
        } catch (err) { toast(err.message, "danger"); }
      });
    });
  }
  paintMenu();

  $("#newItemForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      name: fd.get("name").trim(),
      originalPrice: Number(fd.get("originalPrice")),
      discountPrice: Number(fd.get("discountPrice")),
      emoji: fd.get("emoji").trim() || "🥡",
      pickupStart: fd.get("pickupStart"),
      pickupEnd: fd.get("pickupEnd"),
      initialBags: fd.get("initialBags") ? parseInt(fd.get("initialBags"), 10) : 10,
    };
    if (!payload.name || !Number.isFinite(payload.originalPrice) || !Number.isFinite(payload.discountPrice)) {
      toast("Name, original price, and discount price are required", "danger");
      return;
    }
    if (payload.discountPrice > payload.originalPrice) {
      toast("Discount price can't be higher than the original price", "danger");
      return;
    }
    try {
      const listing = await window.mitchamApi.createListing(id, payload);
      listings.push(listing);
      paintMenu();
      e.target.reset();
      toast(`${listing.name} posted`, "success");
    } catch (err) {
      toast(err.message, "danger");
    }
  });
}

// =========================================================
// ADMIN — platform admin approval queue
// =========================================================
async function renderAdmin(app) {
  if (!state.user || state.user.role !== "platform_admin") {
    app.innerHTML = `<div class="empty-state"><h3>Platform admins only</h3></div>`;
    return;
  }
  let pending, all;
  try {
    [pending, all] = await Promise.all([
      window.mitchamApi.listPendingVendors(),
      window.mitchamApi.listAllVendors(),
    ]);
  } catch (err) {
    app.innerHTML = `<div class="empty-state"><h3>Couldn't load admin data</h3></div>`;
    return;
  }

  app.innerHTML = `
    <h2 class="section-title">Review Queue</h2>
    <div id="pendingGrid" class="vendor-grid"></div>

    <h2 class="section-title">All Vendors</h2>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Name</th><th>Category</th><th>City</th><th>Owner email</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody id="allBody"></tbody>
      </table>
    </div>
  `;

  const pendingGrid = $("#pendingGrid");
  pendingGrid.innerHTML = pending.length === 0
    ? `<p class="muted">Nothing pending review.</p>`
    : pending.map((v) => `
        <div class="vendor-card" style="--card-accent:${esc(v.themeColor)}">
          <div class="vc-emoji">${v.emoji}</div>
          <h4>${esc(v.name)}</h4>
          <span class="vc-meta">${esc(v.category)} · ${esc(v.city)}</span>
          <p class="muted vc-tagline">${esc(v.tagline)}</p>
          <div class="actions manage-actions">
            <button class="btn primary approve-btn" data-id="${v.id}" style="flex:1;">Approve</button>
            <button class="btn danger reject-btn" data-id="${v.id}" style="flex:1;">Reject</button>
          </div>
        </div>
      `).join("");

  $$(".approve-btn", pendingGrid).forEach((b) => b.addEventListener("click", async () => {
    try { await window.mitchamApi.approveVendor(b.dataset.id); toast("Approved", "success"); renderAdmin(app); }
    catch (err) { toast(err.message, "danger"); }
  }));
  $$(".reject-btn", pendingGrid).forEach((b) => b.addEventListener("click", async () => {
    try { await window.mitchamApi.rejectVendor(b.dataset.id); toast("Rejected", "info"); renderAdmin(app); }
    catch (err) { toast(err.message, "danger"); }
  }));

  const allBody = $("#allBody");
  allBody.innerHTML = all.map((v) => `
    <tr>
      <td><a href="#/v/${v.slug}">${v.emoji} ${esc(v.name)}</a></td>
      <td>${esc(v.category)}</td>
      <td>${esc(v.city)}</td>
      <td class="muted">${esc(v.ownerEmail || "—")}</td>
      <td><span class="status-pill status-${v.status}">${v.status}</span></td>
      <td>
        ${v.status === "approved" ? `<button class="btn ghost suspend-btn" data-id="${v.id}">Suspend</button>` : ""}
        <button class="btn danger delete-vendor-btn" data-id="${v.id}" data-name="${esc(v.name)}">Delete</button>
      </td>
    </tr>
  `).join("");
  $$(".suspend-btn", allBody).forEach((b) => b.addEventListener("click", async () => {
    try { await window.mitchamApi.suspendVendor(b.dataset.id); toast("Suspended", "info"); renderAdmin(app); }
    catch (err) { toast(err.message, "danger"); }
  }));
  $$(".delete-vendor-btn", allBody).forEach((b) => b.addEventListener("click", async () => {
    if (!confirm(`Permanently delete "${b.dataset.name}"? This removes its listings but keeps past order history.`)) return;
    try { await window.mitchamApi.deleteVendor(b.dataset.id); toast("Vendor deleted", "info"); renderAdmin(app); }
    catch (err) { toast(err.message, "danger"); }
  }));
}

// ===== Initial boot =====
boot();
