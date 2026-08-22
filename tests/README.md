# Mitcham e2e tests

Playwright scripts that drive the real, running app — no mocks. They start
a headless Chromium, click through the actual UI, and hit the actual API
and Postgres database. They exist because the transactional reservation/bag
logic and multi-tenant access control are the parts of this app most worth
verifying for real, not just reading.

## Prerequisites

1. Postgres running, with the schema seeded:
   ```bash
   cd ../server
   npm install
   cp .env.example .env   # fill in DATABASE_URL etc.
   npm run seed
   ```
2. The API running on `:3001` (`npm run dev` from `server/`).
3. The frontend served on `:5500` (`npx serve frontend -l 5500` from the repo root).
4. Two extra `users` rows for the tokens the tests sign themselves (the
   tests never touch Google OAuth — they sign a JWT locally with the
   server's `JWT_SECRET` and inject it into `localStorage`):
   ```sql
   INSERT INTO users (id, email, display_name, role)
   VALUES (100, 'testcustomer@example.com', 'Test Customer', 'customer')
   ON CONFLICT (id) DO NOTHING;
   -- uid 1 / platform_admin already exists from `npm run seed`
   -- if PLATFORM_ADMIN_EMAILS resolves to a different id, update
   -- helpers.js's signTestToken call in 03_*.test.js to match.
   ```

## Running

```bash
cd tests
npm install
npm test
```

Or run a single file directly: `node e2e/02_checkout_and_order_lifecycle.test.js`.

There's also `smoke_check.js` — a quicker, read-only pass over the main
frontend routes (marketplace, storefront, for-vendors, my-reservations)
that just checks for console/page errors, useful for a fast sanity check
without the full onboarding flow.

## What each file covers

- **01_marketplace_and_storefront** — anonymous browsing: marketplace
  listing, category filter, search, storefront listings, adding a bag to
  cart without signing in, the pitch page, and the 404 route.
- **02_checkout_and_order_lifecycle** — signed-in reservation flow end to
  end: reserves real bags, asserts the cart total shown in the UI matches
  what the server actually charges (this pattern is what caught a
  float-vs-paise rounding bug during development), looks the reservation
  up by pickup code with resolved listing names, and cancels it.
- **03_onboarding_and_admin_approval** — the full vendor onboarding loop:
  someone applies to list a vendor, manages its surplus listings (add,
  restock, hide), confirms it's invisible in the public marketplace while
  pending, has a platform admin approve it, and confirms it then appears.

None of these are unit tests with mocks — they're closer to acceptance
tests, and they're slow-ish (a real browser, a real database) on purpose:
the goal is confidence that the whole stack works together, which is
exactly the kind of bug that unit tests miss.
