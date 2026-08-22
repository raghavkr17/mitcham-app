-- =========================================================
-- Mitcham — Initial Schema
-- A multi-tenant marketplace for surplus food: vendors list unsold
-- food as end-of-day "rescue bags" at a steep discount; customers
-- reserve and collect within a pickup window. Idempotent: safe to re-run.
-- =========================================================

-- ----- Users (authenticated via OAuth) -----
-- role is platform-wide: 'customer' (default), 'vendor' (owns >=1 vendor
-- profile), or 'platform_admin' (Mitcham staff — approves/suspends vendors).
CREATE TABLE IF NOT EXISTS users (
  id           BIGSERIAL PRIMARY KEY,
  email        TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'customer'
                 CHECK (role IN ('customer', 'vendor', 'platform_admin')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----- Link OAuth identities to local users -----
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL,
  provider_sub  TEXT NOT NULL,
  UNIQUE (provider, provider_sub)
);

-- ----- Vendors -----
-- Any food business: restaurant, bakery, sweet shop, café, cloud kitchen,
-- or grocer with unsold stock at day's end. Applications start 'pending'
-- until a platform_admin approves them; only 'approved' vendors are
-- visible in the public marketplace.
CREATE TABLE IF NOT EXISTS vendors (
  id           BIGSERIAL PRIMARY KEY,
  owner_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'Restaurant',
  city         TEXT NOT NULL DEFAULT 'Bengaluru',
  tagline      TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  emoji        TEXT NOT NULL DEFAULT '🍱',
  theme_color  TEXT NOT NULL DEFAULT '#1f7a4d',
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  platform_fee_rate NUMERIC(5,4) NOT NULL DEFAULT 0.0000 CHECK (platform_fee_rate >= 0 AND platform_fee_rate < 1),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors(status);
CREATE INDEX IF NOT EXISTS idx_vendors_owner  ON vendors(owner_id);
CREATE INDEX IF NOT EXISTS idx_vendors_city   ON vendors(city);

-- ----- Vendor staff -----
-- Lets an owner add teammates who can manage a vendor's listings without
-- being the owner_id on the row.
CREATE TABLE IF NOT EXISTS vendor_staff (
  id         BIGSERIAL PRIMARY KEY,
  vendor_id  BIGINT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  staff_role TEXT NOT NULL DEFAULT 'staff' CHECK (staff_role IN ('owner', 'staff')),
  UNIQUE (vendor_id, user_id)
);

-- ----- Surplus listings ("rescue bags") -----
-- A listing is what would otherwise go to waste: today's unsold bakery
-- items, a kitchen's extra thalis, groceries near their sell-by date.
-- original_price_paise is what it would normally cost; discount_price_paise
-- is what the customer actually pays. Pickup window is a same-day time
-- range (e.g. 20:00–21:00) — Mitcham listings are always "collect today."
CREATE TABLE IF NOT EXISTS surplus_listings (
  id                    BIGSERIAL PRIMARY KEY,
  vendor_id             BIGINT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  original_price_paise  INT NOT NULL CHECK (original_price_paise >= 0),
  discount_price_paise  INT NOT NULL CHECK (discount_price_paise >= 0),
  emoji                 TEXT NOT NULL DEFAULT '🥡',
  description           TEXT NOT NULL DEFAULT '',
  pickup_start          TEXT NOT NULL DEFAULT '20:00',
  pickup_end            TEXT NOT NULL DEFAULT '21:00',
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order            INT NOT NULL DEFAULT 0,
  CHECK (discount_price_paise <= original_price_paise)
);

CREATE INDEX IF NOT EXISTS idx_listings_vendor ON surplus_listings(vendor_id);

-- ----- Bag availability: append-only snapshots, latest one wins per listing -----
-- Same pattern as a stock count, but the domain is "bags left today" —
-- append-only so every change (a reservation, a restock, a manual
-- correction) is a free audit trail, and the latest row can be locked
-- with SELECT ... FOR UPDATE to make reservations race-safe.
CREATE TABLE IF NOT EXISTS bag_snapshots (
  id           BIGSERIAL PRIMARY KEY,
  listing_id   BIGINT NOT NULL REFERENCES surplus_listings(id) ON DELETE CASCADE,
  quantity     INT NOT NULL CHECK (quantity >= 0),
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE VIEW current_bags AS
  SELECT DISTINCT ON (listing_id) listing_id, quantity, recorded_at
  FROM bag_snapshots
  ORDER BY listing_id, recorded_at DESC;

CREATE INDEX IF NOT EXISTS idx_bags_listing_time ON bag_snapshots(listing_id, recorded_at DESC);

-- ----- Reservations -----
-- pickup_code is a natural, human-readable primary key (timestamp-derived)
-- so a vendor can verify a collection at the counter without an account
-- lookup — literally a "show this code" flow, same as picking up any
-- online order.
CREATE TABLE IF NOT EXISTS reservations (
  pickup_code   TEXT PRIMARY KEY,
  vendor_id     BIGINT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  user_id       BIGINT REFERENCES users(id) ON DELETE SET NULL,
  customer      TEXT NOT NULL,
  total_paise   INT NOT NULL CHECK (total_paise >= 0),
  savings_paise INT NOT NULL DEFAULT 0 CHECK (savings_paise >= 0),
  status        TEXT NOT NULL DEFAULT 'reserved'
                  CHECK (status IN ('reserved', 'picked_up', 'cancelled')),
  placed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reservation_items (
  id           BIGSERIAL PRIMARY KEY,
  pickup_code  TEXT NOT NULL REFERENCES reservations(pickup_code) ON DELETE CASCADE,
  listing_id   BIGINT NOT NULL REFERENCES surplus_listings(id),
  quantity     INT NOT NULL CHECK (quantity > 0)
);

-- ----- Indexes -----
CREATE INDEX IF NOT EXISTS idx_reservations_vendor ON reservations(vendor_id);
CREATE INDEX IF NOT EXISTS idx_reservations_user    ON reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_reservations_placed   ON reservations(placed_at);
CREATE INDEX IF NOT EXISTS idx_ritem_pickup_code       ON reservation_items(pickup_code);
