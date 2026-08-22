// =========================================================
// One-shot seed: schema + demo platform admin + demo vendors
//
// Seeds a handful of fictional vendors across Indian cities and food
// categories so the marketplace isn't empty on first run. One vendor
// ("Anna's Corner Bakery") is seeded pending, to demonstrate the
// onboarding/approval workflow end to end.
// =========================================================
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { pool, withTransaction } = require("./db");

const SQL_PATH = path.join(__dirname, "..", "migrations", "001_init.sql");

async function runSchema(client) {
  const sql = fs.readFileSync(SQL_PATH, "utf8");
  await client.query(sql);
}

async function ensureUser(client, email, displayName, role = "customer") {
  const r = await client.query(
    `INSERT INTO users (email, display_name, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
     RETURNING *`,
    [email, displayName, role]
  );
  return r.rows[0];
}

async function ensureVendor(client, owner, spec) {
  const existing = await client.query("SELECT * FROM vendors WHERE slug = $1", [spec.slug]);
  if (existing.rows.length > 0) return existing.rows[0];
  const r = await client.query(
    `INSERT INTO vendors (owner_id, slug, name, category, city, tagline, description, emoji, theme_color, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      owner.id, spec.slug, spec.name, spec.category, spec.city, spec.tagline, spec.description,
      spec.emoji, spec.themeColor, spec.status || "approved",
    ]
  );
  const vendor = r.rows[0];
  await client.query(
    `INSERT INTO vendor_staff (vendor_id, user_id, staff_role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`,
    [vendor.id, owner.id]
  );
  return vendor;
}

async function ensureListing(client, vendor, item, bags) {
  const existing = await client.query(
    "SELECT * FROM surplus_listings WHERE vendor_id = $1 AND name = $2",
    [vendor.id, item.name]
  );
  let row;
  if (existing.rows.length > 0) {
    row = existing.rows[0];
  } else {
    const r = await client.query(
      `INSERT INTO surplus_listings
         (vendor_id, name, original_price_paise, discount_price_paise, emoji, description, pickup_start, pickup_end, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        vendor.id, item.name, Math.round(item.originalPrice * 100), Math.round(item.discountPrice * 100),
        item.emoji, item.desc, item.pickupStart, item.pickupEnd, item.sort ?? 0,
      ]
    );
    row = r.rows[0];
  }
  const hasStock = await client.query("SELECT 1 FROM bag_snapshots WHERE listing_id = $1", [row.id]);
  if (hasStock.rows.length === 0) {
    await client.query("INSERT INTO bag_snapshots (listing_id, quantity) VALUES ($1, $2)", [row.id, bags ?? 10]);
  }
  return row;
}

const DEMO_VENDORS = [
  {
    slug: "spice-route-kitchen",
    name: "Spice Route Kitchen",
    category: "Restaurant",
    city: "Bengaluru",
    tagline: "Today's thalis, rescued at closing time.",
    description: "A neighborhood multi-cuisine kitchen saving its unsold dinner thalis instead of binning them every night.",
    emoji: "🍛",
    themeColor: "#c0392b",
    ownerEmail: "spiceroute@mitcham.local",
    ownerName: "Spice Route Kitchen",
    listings: [
      { name: "Surprise Veg Thali", originalPrice: 220, discountPrice: 79, emoji: "🍛", desc: "Chef's pick of today's unsold veg thali — rice, 2 sabzi, dal, roti", pickupStart: "21:00", pickupEnd: "22:00", bags: 8 },
      { name: "Surprise Non-Veg Thali", originalPrice: 280, discountPrice: 99, emoji: "🍗", desc: "Today's unsold non-veg thali, chef's choice of curry", pickupStart: "21:00", pickupEnd: "22:00", bags: 5 },
    ],
  },
  {
    slug: "annapurna-sweets",
    name: "Annapurna Sweets & Snacks",
    category: "Sweet Shop",
    city: "Mumbai",
    tagline: "Today's mithai and namkeen, before they're gone.",
    description: "A family-run sweet shop that makes fresh mithai daily and rescues whatever's left at closing.",
    emoji: "🍬",
    themeColor: "#e0a106",
    ownerEmail: "annapurnasweets@mitcham.local",
    ownerName: "Annapurna Sweets & Snacks",
    listings: [
      { name: "Mithai Rescue Box", originalPrice: 300, discountPrice: 99, emoji: "🍬", desc: "Assorted mithai made today — kaju katli, barfi, ladoo, chef's mix", pickupStart: "20:30", pickupEnd: "21:30", bags: 10 },
      { name: "Namkeen Surplus Pack", originalPrice: 150, discountPrice: 49, emoji: "🥨", desc: "Today's fresh namkeen, assorted", pickupStart: "20:30", pickupEnd: "21:30", bags: 12 },
    ],
  },
  {
    slug: "daily-grocers",
    name: "Daily Grocers",
    category: "Grocery",
    city: "Delhi",
    tagline: "Produce and bakery items near their sell-by date, half price.",
    description: "A neighborhood grocer bundling produce and bakery items close to their sell-by date instead of discarding them.",
    emoji: "🥬",
    themeColor: "#2f7d3a",
    ownerEmail: "dailygrocers@mitcham.local",
    ownerName: "Daily Grocers",
    listings: [
      { name: "Fruit & Veg Rescue Box", originalPrice: 350, discountPrice: 129, emoji: "🥕", desc: "5–6kg mixed produce nearing its sell-by date — still good, just not shelf-perfect", pickupStart: "19:30", pickupEnd: "20:30", bags: 6 },
      { name: "Bakery Shelf Box", originalPrice: 180, discountPrice: 59, emoji: "🍞", desc: "Bread, buns, and pastries from today that won't be fresh tomorrow", pickupStart: "19:30", pickupEnd: "20:30", bags: 9 },
    ],
  },
  {
    slug: "flour-power-bakery",
    name: "Flour Power Bakery",
    category: "Bakery",
    city: "Pune",
    tagline: "Fresh-baked today, rescued tonight.",
    description: "Artisan bakery — croissants, sourdough, and pastries baked fresh every morning, discounted at close.",
    emoji: "🥐",
    themeColor: "#a5682c",
    ownerEmail: "flourpower@mitcham.local",
    ownerName: "Flour Power Bakery",
    listings: [
      { name: "Pastry Surprise Bag", originalPrice: 250, discountPrice: 89, emoji: "🥐", desc: "Assorted pastries and croissants from today's bake", pickupStart: "20:00", pickupEnd: "21:00", bags: 7 },
      { name: "Sourdough Loaf (Day-Old)", originalPrice: 180, discountPrice: 69, emoji: "🍞", desc: "One day past bake — still excellent for toast", pickupStart: "20:00", pickupEnd: "21:00", bags: 5 },
    ],
  },
];

// A vendor still waiting on platform-admin review — demonstrates the
// onboarding/approval workflow end to end.
const PENDING_VENDOR = {
  slug: "annas-corner-bakery",
  name: "Anna's Corner Bakery",
  category: "Bakery",
  city: "Chennai",
  tagline: "A small home bakery applying to join Mitcham.",
  description: "One-person home bakery in Chennai, applying to list its unsold evening stock.",
  emoji: "🧁",
  themeColor: "#8e44ad",
  ownerEmail: "annascorner@mitcham.local",
  ownerName: "Anna's Corner Bakery",
  status: "pending",
  listings: [
    { name: "Cupcake Surprise Box", originalPrice: 200, discountPrice: 79, emoji: "🧁", desc: "Assorted cupcakes from today's batch", pickupStart: "20:00", pickupEnd: "21:00", bags: 6 },
  ],
};

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[seed] DATABASE_URL is not set. Copy .env.example to .env first.");
    process.exit(1);
  }
  try {
    await withTransaction(async (client) => {
      console.log("[seed] running schema...");
      await runSchema(client);

      console.log("[seed] ensuring platform admin...");
      const adminEmail = (process.env.PLATFORM_ADMIN_EMAILS || "admin@mitcham.local").split(",")[0].trim();
      await ensureUser(client, adminEmail, "Mitcham Admin", "platform_admin");

      console.log("[seed] seeding demo vendors...");
      for (const spec of DEMO_VENDORS) {
        const owner = await ensureUser(client, spec.ownerEmail, spec.ownerName, "vendor");
        const vendor = await ensureVendor(client, owner, spec);
        for (let i = 0; i < spec.listings.length; i++) {
          const item = spec.listings[i];
          await ensureListing(client, vendor, { ...item, sort: i }, item.bags);
        }
      }

      console.log("[seed] seeding one pending vendor application...");
      const pendingOwner = await ensureUser(client, PENDING_VENDOR.ownerEmail, PENDING_VENDOR.ownerName, "vendor");
      const pendingVendor = await ensureVendor(client, pendingOwner, PENDING_VENDOR);
      for (let i = 0; i < PENDING_VENDOR.listings.length; i++) {
        await ensureListing(client, pendingVendor, { ...PENDING_VENDOR.listings[i], sort: i }, PENDING_VENDOR.listings[i].bags);
      }
    });
    console.log("[seed] done.");
  } catch (err) {
    console.error("[seed] failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
