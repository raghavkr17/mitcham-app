/* =========================================================
   Mitcham — API client
   Talks to the Express + Postgres server.
   Stores the JWT in localStorage under "mitcham_token".
   ========================================================= */
(function () {
  // No real backend configured (e.g. running as a static demo on GitHub
  // Pages) — mock-api.js provides window.mitchamApi instead. Set
  // window.MITCHAM_API_BASE before this script loads to use a real server.
  if (!window.MITCHAM_API_BASE) return;

  const API_BASE = window.MITCHAM_API_BASE;

  const TOKEN_KEY = "mitcham_token";
  const USER_KEY = "mitcham_user";

  // --- Token & user state ---
  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); }
    catch { return null; }
  }
  function setUser(u) {
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
    else localStorage.removeItem(USER_KEY);
  }

  // On boot: pull ?token=… out of the URL if the OAuth callback just landed.
  (function consumeTokenFromUrl() {
    const url = new URL(location.href);
    const t = url.searchParams.get("token");
    if (t) {
      setToken(t);
      url.searchParams.delete("token");
      history.replaceState(null, "", url.pathname + (url.search ? url.search : "") + url.hash);
    }
  })();

  // --- Core fetch wrapper ---
  async function apiFetch(path, { method = "GET", body, auth = false, headers = {} } = {}) {
    const finalHeaders = { "Content-Type": "application/json", ...headers };
    if (auth) {
      const t = getToken();
      if (t) finalHeaders["Authorization"] = `Bearer ${t}`;
    }
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "omit",
    });
    let data = null;
    const text = await res.text();
    if (text) {
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
    }
    if (!res.ok) {
      const err = new Error(data?.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  const api = {
    API_BASE,

    // --- Auth ---
    signInWithGoogle() {
      sessionStorage.setItem("mitcham_return_to", location.hash || "#/");
      location.href = `${API_BASE}/auth/google`;
    },
    async fetchMe() {
      const me = await apiFetch("/auth/me", { auth: true });
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
    listVendors(params = {}) {
      const qs = new URLSearchParams(params).toString();
      return apiFetch(`/api/vendors${qs ? `?${qs}` : ""}`);
    },
    getImpact() { return apiFetch("/api/vendors/impact"); },
    getVendorBySlug(slug) {
      return apiFetch(`/api/vendors/slug/${encodeURIComponent(slug)}`, { auth: true });
    },
    applyToListVendor(payload) {
      return apiFetch("/api/vendors", { method: "POST", body: payload, auth: true });
    },
    updateVendor(id, payload) {
      return apiFetch(`/api/vendors/${id}`, { method: "PATCH", body: payload, auth: true });
    },

    // --- Platform admin ---
    listPendingVendors() { return apiFetch("/api/vendors/admin/pending", { auth: true }); },
    listAllVendors() { return apiFetch("/api/vendors/admin/all", { auth: true }); },
    approveVendor(id) { return apiFetch(`/api/vendors/${id}/approve`, { method: "POST", auth: true }); },
    rejectVendor(id) { return apiFetch(`/api/vendors/${id}/reject`, { method: "POST", auth: true }); },
    suspendVendor(id) { return apiFetch(`/api/vendors/${id}/suspend`, { method: "POST", auth: true }); },
    deleteVendor(id) {return apiFetch(`/api/vendors/${id}`, { method: "DELETE", auth: true });},

    // --- Listings & bags (per vendor) ---
    getListings(vendorId) { return apiFetch(`/api/vendors/${vendorId}/listings`); },
    getFullListings(vendorId) { return apiFetch(`/api/vendors/${vendorId}/listings/all`, { auth: true }); },
    getBags(vendorId) { return apiFetch(`/api/vendors/${vendorId}/bags`); },
    createListing(vendorId, payload) {
      return apiFetch(`/api/vendors/${vendorId}/listings`, { method: "POST", body: payload, auth: true });
    },
    updateListing(vendorId, listingId, payload) {
      return apiFetch(`/api/vendors/${vendorId}/listings/${listingId}`, { method: "PATCH", body: payload, auth: true });
    },
    deleteListing(vendorId, listingId) {
      return apiFetch(`/api/vendors/${vendorId}/listings/${listingId}`, { method: "DELETE", auth: true });
    },
    restockBags(vendorId, listingId, quantity) {
      return apiFetch(`/api/vendors/${vendorId}/bags/restock`, {
        method: "POST", body: { listingId, quantity }, auth: true,
      });
    },

    // --- Reservations ---
    getVendorReservations(vendorId) {
      return apiFetch(`/api/vendors/${vendorId}/reservations`, { auth: true });
    },
    createReservation(vendorId, { customer, items }) {
      return apiFetch(`/api/vendors/${vendorId}/reservations`, {
        method: "POST", body: { customer, items }, auth: true,
      });
    },
    confirmPickup(vendorId, pickupCode) {
      return apiFetch(`/api/vendors/${vendorId}/reservations/${encodeURIComponent(pickupCode)}/confirm-pickup`, {
        method: "POST", auth: true,
      });
    },
    markReservationReady(vendorId, pickupCode) {
      return apiFetch(`/api/vendors/${vendorId}/reservations/${encodeURIComponent(pickupCode)}/mark-ready`, {
        method: "POST", auth: true,
      });
    },
    getMyReservations() { return apiFetch("/api/reservations/mine", { auth: true }); },
    getReservation(pickupCode) { return apiFetch(`/api/reservations/${encodeURIComponent(pickupCode)}`, { auth: true }); },
    cancelReservation(pickupCode) {
      return apiFetch(`/api/reservations/${encodeURIComponent(pickupCode)}`, { method: "DELETE", auth: true });
    },
  };

  window.mitchamApi = api;
})();
