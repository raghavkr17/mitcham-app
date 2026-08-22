# Mitcham

**Rescue great food, before it's gone.**

## The problem

Every restaurant, bakery, sweet shop, and grocer in India throws away food
at closing time — not because it's spoiled, but because the day is over.
A thali kitchen makes enough for its dinner rush, not its exact demand; a
sweet shop can't sell yesterday's mithai at full price; a grocer's produce
crosses its sell-by date before anyone buys it. All of it still edible,
all of it discarded, because there's no fast way to sell it at a price
someone will take *right now*.

India wastes an estimated 78–80 million tonnes of food a year — second
only to China globally — worth roughly ₹1.55 lakh crore (~$18.6B) annually
(UNEP Food Waste Index Report 2024). Vendors absorb that as pure loss:
food they paid to make or stock, thrown out instead of sold. Meanwhile,
the same evening, someone nearby would happily pay half price for a good
meal if they knew it existed.

## The idea

Mitcham is a marketplace for unsold end-of-day food. Vendors list what's
left as "rescue bags" — a surprise thali, a box of today's mithai, a bag
of produce nearing its date — at a steep discount, with a same-day pickup
window. Customers browse what's nearby, reserve a bag, and collect it
before the vendor closes. Everybody wins: the vendor recovers revenue
that was otherwise zero, the customer eats well for less, and food that
would have gone in the bin gets eaten instead.

This is the shared infrastructure a single vendor would never build for
itself — a public storefront, live bag counts, and a reservation system —
built once and offered to every kitchen, bakery, sweet shop, and grocer
on the platform.

## How it works

1. **Apply.** Any signed-in user can apply to list a vendor — name,
   category, city, tagline. A platform admin reviews and approves it.
2. **List today's surplus.** An approved vendor posts rescue bags:
   what's in it, original price, discount price, how many are available,
   and the pickup window (e.g. 9–10pm tonight).
3. **Customers reserve.** Anyone nearby browses the marketplace, adds
   bags to a cart, and reserves — no payment collected online; the price
   is paid at pickup. Reserving instantly decrements the vendor's bag
   count so two customers can never claim the same last bag.
4. **Pickup.** The customer shows their pickup code at the counter; the
   vendor marks it collected. If a customer can't make it, they can
   cancel before the window closes and the bag returns to the shelf for
   someone else.
5. **Track impact.** The marketplace shows running totals — bags
   rescued, money saved by customers, and an estimated CO₂ footprint
   avoided — so the impact is visible, not just implied.

## Why the architecture holds up

Under the hood, every stock change goes through the same discipline a
real point-of-sale system needs: reservations run inside a database
transaction that row-locks a listing's current bag count before
decrementing it, so two people racing for the last samosa box can't both
win — the second one gets a clean "sold out," not an overbooked pickup.
Every table is scoped to a vendor, and every query re-checks that scope
before touching data, so one vendor's staff account can never see or
modify another vendor's listings, bags, or reservations, even through a
crafted request. It's the same pattern real inventory and ordering
systems use in production, applied here to bags instead of dishes.

## Who this is for

- **Vendors** — restaurants, bakeries, sweet shops, and grocers who
  currently write off unsold food as pure loss and get a new, incremental
  revenue stream with zero marginal cost to list.
- **Customers** — price-conscious, food-conscious people who want a good
  meal for less and like that it didn't go to waste.
- **The platform** — takes a small fee on completed reservations
  (configurable per vendor), scaling with transaction volume rather than
  requiring vendors to pay anything upfront.

## What's next

- Real payment collection at reservation time (currently pay-at-pickup)
  once the vendor and customer bases are established.
- Push notifications when a favorite vendor lists a new batch of bags.
- A ratings/photo layer so customers can see what a "surprise bag" from
  a given vendor typically looks like before reserving.

---
Sources: [UNEP Food Waste Index Report 2024](https://www.unep.org/resources/publication/food-waste-index-report-2024); India-specific figures via [Drishti IAS, "India's Food Waste Conundrum"](https://www.drishtiias.com/daily-updates/daily-news-analysis/indias-food-waste-conundrum), citing the same UNEP report.
