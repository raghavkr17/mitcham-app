# Deploying Mitcham for real

This turns the GitHub Pages site from the in-browser mock demo into the
real thing: a live Postgres database, a real Express API, and real "Sign
in with Google" accounts. Everything below is free.

Three pieces, in this order: **database → API → frontend**.

## 1. Database — Supabase

1. Create a project at [supabase.com](https://supabase.com) (sign in with
   GitHub is easiest). Pick any region close to you; note the database
   password you set — you'll need it once, right now.
2. In the project, go to **Project Settings → Database → Connection
   string**, tab **URI**, and copy it. It looks like:
   `postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-xxxx.pooler.supabase.com:6543/postgres`
   — use the **pooler** connection string (port 6543), not the direct one, since
   Render's free tier opens/closes connections a lot.
3. Paste your DB password in where it says `[YOUR-PASSWORD]`. This full
   string is your `DATABASE_URL`.
4. Free-tier note: a Supabase project **pauses after 7 days with no
   activity** — the dashboard has a one-click "Restore" button if that
   happens. It doesn't expire or delete data.

## 2. Google OAuth client

1. Go to the [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create a project (or reuse one), then **Create Credentials → OAuth
   client ID**.
2. If prompted, configure the **OAuth consent screen** first: External,
   app name "Mitcham", your email as support/contact email. You can leave
   it in "Testing" mode and add your own Google account under **Test
   users** — that's enough for a small number of real users; publish it
   later if you want anyone to sign in without that restriction.
3. Application type: **Web application**.
4. **Authorized redirect URIs**: add
   `https://mitcham-api.onrender.com/auth/google/callback`
   (swap in your actual Render URL once you have it from step 3 — you can
   come back and edit this after).
5. Save. Copy the **Client ID** and **Client Secret** — these are
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

## 3. API — Render

1. Go to [render.com](https://render.com), sign in with GitHub, grant it
   access to the `mitcham-app` repo.
2. **New → Blueprint**, pick this repo. Render reads `render.yaml` at the
   repo root and proposes one service, `mitcham-api`.
3. When it asks for the env vars marked "sync: false", fill in:
   - `DATABASE_URL` — the Supabase pooler string from step 1
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — from step 2
   - `FRONTEND_ORIGIN` — `https://raghavkr17.github.io` (the GitHub Pages
     origin — no trailing slash or path)
   - `JWT_SECRET` / `SESSION_SECRET` — Render can auto-generate these
     (blueprint already sets `generateValue: true`); leave as-is
   - `PLATFORM_ADMIN_EMAILS` — already defaults to `contactraghavkr@gmail.com`
     in the blueprint; edit if you want a different or additional address
4. Deploy. First build takes a couple minutes. Note the resulting URL,
   e.g. `https://mitcham-api.onrender.com`.
5. Go back to the Google Cloud Console (step 2) and fix the redirect URI
   to match this exact URL if it differs from your guess.
6. Free-tier note: the service **spins down after 15 minutes idle** and
   takes about a minute to wake back up on the next request — normal for
   a demo, upgrade to the $7/mo instance later if that's annoying.

### Run the schema + seed data

Once `DATABASE_URL` is set, run the seed script once against production —
easiest from your own machine:

```bash
cd server
DATABASE_URL="<the same Supabase pooler URL>" \
PLATFORM_ADMIN_EMAILS="contactraghavkr@gmail.com" \
npm install && npm run seed
```

This creates the schema, seeds the demo vendors/listings (the example
profiles), and ensures `contactraghavkr@gmail.com` exists as a
`platform_admin`. It's idempotent — safe to re-run any time.

## 4. Frontend — GitHub Pages

The Pages workflow (`.github/workflows/pages.yml`) already deploys
`frontend/` on every push to `main`. To point it at the real API instead
of the mock demo:

1. Repo → **Settings → Secrets and variables → Actions → Variables** tab
   → **New repository variable**.
2. Name: `MITCHAM_API_BASE`. Value: your Render URL, e.g.
   `https://mitcham-api.onrender.com` (no trailing slash).
3. Re-run the "Deploy frontend to GitHub Pages" workflow (Actions tab →
   select it → **Run workflow**), or push any change to `frontend/`.

The live site now generates `frontend/config.js` at build time pointing
at your API, so "Sign in with Google" becomes a real login instead of the
persona picker.

## 5. Verify

1. Visit the live site, click **Sign in with Google**, sign in with
   `contactraghavkr@gmail.com` (add it as a test user in step 2 if the
   consent screen is still in Testing mode).
2. You should land back on the site signed in, with an **Admin** tab —
   confirming the `platform_admin` role took effect.
3. Check `https://<your-render-url>/healthz` returns `{"ok":true,"db":"up"}`.
4. Browse the marketplace — the four demo vendors from `seed.js` should
   be visible, plus "Anna's Corner Bakery" waiting in the Admin queue as
   a pending application.

## Everyday costs

| Piece | Provider | Free tier limit |
|---|---|---|
| Database | Supabase | 500MB storage, pauses after 7 days idle (one-click resume) |
| API | Render | 750 free instance-hours/mo, spins down after 15min idle (~1min cold start) |
| Frontend | GitHub Pages | No practical limit for a site this size |

Nothing here costs money unless you choose to upgrade Render off the free
plan for an always-on API (~$7/mo, no cold starts).
