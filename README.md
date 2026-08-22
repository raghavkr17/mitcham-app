# Mitcham

**Rescue great food, before it's gone.**

🔗 **Try it live:** https://raghavkr17.github.io/mitcham-app/#/

## What it is

Every day, restaurants, bakeries, sweet shops, and grocers end up with good food they can't sell — not because it's bad, just because the day is over. Mitcham lets them list that surplus as discounted "rescue bags," and lets nearby customers grab one for pickup before closing.

It's a two-sided marketplace: any vendor can apply, get approved, and instantly have their own storefront, live bag counts, and a reservation dashboard — no setup, no infrastructure to build themselves. Customers browse nearby vendors, reserve a bag, and pick it up with a simple code.

Less food wasted, cheaper food for customers, extra revenue for vendors on food that would otherwise be thrown out.

See [`docs/PITCH.md`](docs/PITCH.md) for the full product pitch.

## Try it

The live demo above is a self-contained version that runs entirely in your browser — no account needed. Click "Sign in with Google" and pick any persona to explore:

- **Demo Customer** — browse the marketplace and reserve bags
- **A vendor owner** — manage listings, restock bags, confirm pickups
- **Platform Admin** — approve or reject new vendors

## Running it for real

Mitcham is a full-stack app (vanilla JS frontend, Node/Express + Postgres backend). It falls back to the in-browser mock demo above only when no backend is configured — see [`docs/DEPLOY.md`](docs/DEPLOY.md) for the full walkthrough (Supabase for Postgres, Render for the API, GitHub Pages for the frontend) to turn the live link into the real thing: real Google sign-in, a shared database, and an admin account.

## History

Mitcham started as **Biryani Box**, a single-restaurant ordering system, then grew into a general platform for rescuing surplus food across many vendors at once.
