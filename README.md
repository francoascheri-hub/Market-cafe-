# Market Café Pre-Order — Pay with Your USF ID, Skip the Line

Pilot web app for **USF BENI-349** (Franco Ascheri & Alejandro).

**Problem:** at the USF Market Café, peak-hour lines (11:30am–12:45pm and 6:30–8pm) run 15–25 minutes, so students choose between eating and getting to class on time.

**Solution:** order and pay in one step from your phone (*Task Unification*), pick a pickup slot that matches when class ends, then grab your food from a numbered cubby: no line (*Subtraction*).

> **Pilot only:** sign-in and payment are **mock**. No real USF login and no real charges.

## Run it

Requires Node 20+.

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). For the demo, open three tabs **in the same browser** (they share state through `localStorage`):

| Tab | URL | Who |
|---|---|---|
| Student app | `/#/` | Maya / Diego on their phone (use the browser's mobile view) |
| Staff view | `/#/staff` | Market Café staff behind the counter |
| Ready board | `/#/board` | TV next to the cubby shelf |

Other commands: `npm run e2e` (drives the whole demo in headless Chrome, checks every step and refreshes the screenshots below; needs Google Chrome installed), `npm run build` (production build in `dist/`, deployable to any static host such as Vercel, Netlify or GitHub Pages), `npm run scrape` (refresh the menu, see below).

## Demo script

1. **Student** (`/#/`): sign in with the demo USF ID, add items, tap **Checkout**, pick a pickup slot (e.g. 12:45), pay with Dons Dollars / Flexi / Meal swipe. You get an order number (e.g. **#201**) and a **cubby number**.
2. **Staff** (`/#/staff`): the order shows up instantly under its pickup slot. Tap **Start preparing**, then **Mark ready**. Cubbies can be reassigned.
3. **Ready board** (`/#/board`): the number appears under **READY FOR PICKUP** with its cubby. The student's screen switches to **READY** too.
4. Staff taps **Picked up** and the cubby frees up. Use **Add sample order** and **Reset demo** at the bottom of the staff view to set up a demo quickly.

## Screenshots

| Sign in | Menu | Checkout | Confirmation |
|---|---|---|---|
| ![](docs/screenshots/1-sign-in.png) | ![](docs/screenshots/2-menu.png) | ![](docs/screenshots/3-checkout.png) | ![](docs/screenshots/4-confirmation.png) |

| Staff view | Ready board |
|---|---|
| ![](docs/screenshots/5-staff.png) | ![](docs/screenshots/6-ready-board.png) |

## Menu data (real, scraped)

- **Source:** Bon Appétit's public USF menu for The Market Café, `https://usf.cafebonappetit.com/cafe/the-market-cafe/<date>/`
- **Saved to:** [`src/data/menu.json`](src/data/menu.json). It includes `source.url`, `source.menuDate` and `source.scrapedAt`.
- **Scraper:** [`scripts/scrape-menu.mjs`](scripts/scrape-menu.mjs). It reads the menu JSON that the page embeds (`Bamco.menu_items`, `Bamco.dayparts`). Run `npm run scrape` for today's menu or `npm run scrape -- 2026-11-12` for a specific date.
- **Real:** every item name, station, daypart (Breakfast 7:00–10:30, Lunch 11:00–4:00, Dinner 4:30–9:00), dietary tags, and every price marked as listed.
- **Placeholder:** some items have no price on the site (pastries, hand fruit, spa water, build-your-own burrito/bowl, buttermilk pancakes, Don's sandbox salad). They are kept with `"priceSource": "example"` and shown in the app as **"example price"**. Individual toppings/ingredients and unpriced sides/garnishes are left out.
- The menu changes daily, so re-run the scraper before a demo if you want that day's menu.

## Tech

Vite + React + TypeScript with no other runtime dependencies. State lives in `localStorage` (`src/store.ts`), and tabs sync through the browser `storage` event. Routes are hash-based: `#/`, `#/staff`, `#/board`.

```
scripts/scrape-menu.mjs   menu scraper
src/data/menu.json        scraped menu
src/store.ts              orders + mock sign-in (localStorage)
src/menu.ts               daypart + pickup-slot helpers
src/student/              student flow
src/staff/                staff view
src/board/                ready board
```

### Pilot limitations

- Shared state only works between tabs of **one browser on one device**. A real pilot would need a small backend (e.g. Supabase or Firebase) so phones, the staff tablet and the TV share orders.
- Mock sign-in and payment. A real version would integrate USF SSO and the campus card system (Dons Dollars / Flexi).
- Pickup slots are the next six 5-minute slots, at least 15 minutes from now and inside the current meal period's hours. After dinner closes, orders are for tomorrow's lunch.
- The mock sign-in is shared by all tabs, so only one student can be simulated at a time. Use **Add sample order** on the staff view to add other students' orders.
- There are 24 cubbies. If all 24 are taken by open orders, new orders reuse cubby 1. Staff can't pick a cubby that another open order is using.
