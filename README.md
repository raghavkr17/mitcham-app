# Mitcham

**Rescue great food, before it's gone.**

🔗 **Try it live:** https://raghavkr17.github.io/mitcham-app/#/

## What it is

Every day, restaurants, bakeries, sweet shops, and grocers end up with good food they can't sell — not because it's bad, just because the day is over. Mitcham lets them list that surplus as discounted "rescue bags," and lets nearby customers grab one for pickup before closing.

It's a two-sided marketplace: any vendor can apply, get approved, and instantly have their own storefront, live bag counts, and a reservation dashboard — no setup, no infrastructure to build themselves. Customers browse nearby vendors, reserve a bag, and pick it up with a simple code.

Less food wasted, cheaper food for customers, extra revenue for vendors on food that would otherwise be thrown out.

See [`docs/PITCH.md`](docs/PITCH.md) for the full product pitch.

## Try it

The live link above is the real thing — a live Postgres database, a real Express API, and real "Sign in with Google" accounts. Click **Sign in with Google** to create an account, browse nearby vendors, and reserve a bag. Vendors can apply for their own storefront from **For Vendors**.

If no backend is configured, the app automatically falls back to a self-contained in-browser mock demo (no account needed, persona picker instead of real sign-in) — useful for exploring the UI without standing up any infrastructure.

## Running your own instance

Mitcham is a full-stack app (vanilla JS frontend, Node/Express + Postgres backend, Google OAuth for accounts). See [`docs/DEPLOY.md`](docs/DEPLOY.md) for the full walkthrough (Supabase for Postgres, Render for the API, GitHub Pages for the frontend) to stand up your own copy with a real database, real sign-in, and your own admin account.

## History

Mitcham started as **Biryani Box**, a single-restaurant ordering system, then grew into a general platform for rescuing surplus food across many vendors at once.
