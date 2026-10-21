# Tyllage × MEOD Farm — Vibecode Prototype

A clickable prototype for **MEOD Farm** (Problem Statement 6B: *Improving Sales and Marketing Outreach Through AI*).
It has two parts:

1. **Public site.** A refresh of [meod.com.sg](https://meod.com.sg/) that keeps MEOD's look (forest green, gold, berry and stony palette; hand-brushed headings; MEOD's own photos and logo) and adds a searchable produce catalogue, a Farm & More showcase, community group buys, a farm-visit booking form and the **Ask MEOD** chat assistant.
2. **MEOD Portal.** Role-based dashboards for **admin**, **sales staff**, **group leaders** and **customers**. They're built on the modules in the proposal: SalesDesk, Sync, Assist, Recommend, Campaign Studio and GroupBuy.

Built with plain **HTML, CSS and vanilla JavaScript**. There's no framework, no build step and no backend.

> ⚠️ **Prototype only.** All data is synthetic and lives in the visitor's browser (`localStorage`). Sign-in runs in the browser and is **not secure**. Don't put real customer data in this repo. See [SECURITY.md](SECURITY.md) and [audit.md](audit.md).

---

## Run it locally

Any static file server works. From the repo root:

```bash
py -m http.server 5173
```

Then open http://localhost:5173. `npx serve .` or VS Code Live Server work too.

> **Seeing an old version after an update?** Browsers cache the JS and CSS. Do a hard refresh (**Ctrl + Shift + R**, or **Cmd + Shift + R** on Mac).

## Deploy to GitHub Pages

The site is plain static files with relative paths, so it runs on GitHub Pages as it is. There's no build step.

1. Push to GitHub.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*, choose **main** and **/ (root)**, and save.
4. After a minute the site is live at `https://<your-username>.github.io/<repo-name>/`. The portal is at `…/portal.html`.

Every push to `main` redeploys automatically.

> **Heads-up:** the GitHub Pages site is public. It only ever holds the synthetic demo data in each visitor's browser, but the demo accounts and password are visible to anyone. Never connect real data or API keys to it.

---

## Public site

| Page | File | What's on it |
|---|---|---|
| Home | `index.html` | Hero, What we do, **Picked this morning** (in-stock produce with live stock badges), Our promise, Growing, **Buy together** group-buy band, stockists, Visit us |
| About | `about.html` | Story, purpose, values, **food-security fact cards** (SG Fresh, 6 hectares, since 2014) |
| Our Produce | `produce.html` | Catalogue with **search** (English and Chinese names), category chips with counts, **In stock only**, **Show more**, product cards with nutrients and *Buy ↗*. Also **Seed to plate** steps, **Farm & More** photo grid featuring Goodness Gracious Gelato, and **Where to buy** |
| Experiences | `experiences.html` | Farm Tour, Workshop and School Visit cards, visit facts, and a **booking form** (validated; saved to the staff inbox) |
| Contact | `contact.html` | WhatsApp, email and tours contact cards, and a **Visit the farm** panel with map and directions |

On every page:

- **Ask MEOD** chat bubble: stock, prices, delivery and group buys in EN / 中文 / BM. Complaints hand over to a person.
- **Scroll-to-top** button, above the chat bubble.
- **Portal** button in the top nav.

### Where the portal entry points are (and why)

- **"Portal" button in the top nav**, next to the gold *Our Store* button. It's on every page, but outlined so it doesn't compete with MEOD's main sales action.
- **"Join with a code" on the home page's group-buy band.** Group-buy members are the customers who need the portal most.
- **Leader invite links** (`portal.html?role=customer&code=…`) fill in the code for new members.

The footer deliberately has **no** portal links, so the site reads like MEOD's real website.

---

## MEOD Portal

Sign in at `portal.html`. There are one-click demo accounts for each role. The shared demo password is `DEMO_PASSWORD` in `js/data.js`.

| Role | Demo account | Screens |
|---|---|---|
| **Admin** | `admin@meod.test` | **SalesDesk** overview, Stock, Orders, Inbox, Campaign Studio, Group buys, Customers, **Users & roles**, **Audit log**, **Settings** |
| **Sales staff** | `sales@meod.test` | Same as admin, minus Users / Audit / Settings. Customer names and phones are **masked**, and campaigns need an admin's approval |
| **Group leader** | `leader@meod.test`, `leader2@meod.test` | Own group buys and share link, members' orders (**masked**), commission ledger with a worked example |
| **Customer** | `customer@meod.test` | Home with **Smart picks**, Shop, My orders with **delivery tracking**, Group buy, Preferences (**profile editing**), Ask MEOD |

### Highlights

- **Shop and cart.** Live stock checks, a group-code box in the cart, a **free-delivery progress bar** and the delivery address. Stock is re-checked when you place the order.
- **My orders.** Status filters, and on each order:
  - a 5-step tracker
  - **Track**: an expandable panel with route map, driver card or proof of delivery, and a timeline
  - **Receipt**: printable, or save as PDF
  - **Reorder**
  - **Get help**: opens Ask MEOD with the order number filled in
- **Smart picks.** Each in-stock product gets a score for **restock** timing, **pairs well** (other customers' baskets), **your taste** (recent orders count more) and **fresh** produce. Every pick shows a reason and a % match, and there's a *Your taste* breakdown. Turning personalisation off switches to generic fresh picks.
- **Profile.** Customers can edit their photo (resized in the browser), contact email, Singapore mobile number and delivery address. Every field is checked when they press Save.
- **Staff tools.**
  - Campaign Studio: messages only go to customers who opted in, need sign-off from a *different* admin, and re-check consent at send time.
  - Group-buy commission ledger.
  - Users, Customers and Audit log pages with filters and search.
  - Settings shown as rule cards with a reset-demo-data button.

### Business rules (illustrative — MEOD to confirm)

All of these live in `RULES` in `js/data.js`:

- **Pricing:** amounts are integer cents. Group discount is 5%. Delivery is free from S$60, otherwise S$8. Deliveries run Tue / Thu / Sat.
- **Commission:** 5% of net merchandise (subtotal − discount, delivery excluded). It counts once an order is paid, and a refund posts a matching negative adjustment. The ledger is rebuilt from the orders, so it always reconciles.
- **Stock never guesses.** A sync older than 6 hours, or a failed one, shows as *Checking stock*. Those items can't be ordered, and the bot won't confirm them.
- **Ask MEOD** detects language (EN / 中文 / BM; Tamil falls back to English) and what the customer is asking about. Complaints, refunds, payment and food-safety messages **create a ticket and hand over to a person**, and the reply is honest about after-hours wait times.

### Delivery tracking (mock adapter)

`trackingFor(order)` in `js/data.js` works out a delivery timeline from each order. It uses **Shopify fulfilment-style statuses** (`confirmed`, `picked_up`, `out_for_delivery`, `delivered`) and the Tue / Thu / Sat schedule. The demo customer always has one order *out for delivery*.

To connect real tracking later, replace just this function. The source could be:

- Shopify fulfilment webhooks,
- a courier API (e.g. Ninja Van, Lalamove), or
- a driver app (e.g. Detrack).

Which one depends on who does MEOD's deliveries; that's an open question in [audit.md](audit.md).

---

## Project layout

```
index.html about.html produce.html          public site
experiences.html contact.html
portal.html dashboard.html                  portal (sign-in, app)

css/style.css     site styles + design tokens (:root)
css/portal.css    portal styles

js/data.js        demo data, RULES, pricing, commission, stock, smart picks,
                  delivery tracking adapter, line-art icons, storage + migrations
js/assist.js      Ask MEOD rule-based assistant (shared by site and portal)
js/main.js        public site: nav, produce catalogue, booking form,
                  chat widget, scroll-to-top
js/auth.js        demo session + role permission matrix
js/login.js       sign-in page
js/portal.js      all portal screens

assets/           MEOD-supplied originals (logo SVG, photos)
assets/img/       optimised WebP copies the site actually loads
```

**Script order:** public pages load `data.js → assist.js → main.js`. `dashboard.html` loads `data.js → assist.js → auth.js → portal.js`.

## Demo data

- Stored in `localStorage` under `meod-demo-state-v2`. Each browser has its own copy.
- **Reset:** sign in as admin and use **Settings → Reset demo data**, or clear the site's storage.
- **Additive updates:** `migrate()` in `data.js` can add new demo records (like the out-for-delivery order) without wiping anyone's data.

## Images

MEOD-supplied originals stay in `assets/`, and the site loads the optimised WebP copies in `assets/img/`. To add or replace a photo:

1. Drop the original into `assets/`.
2. Export a WebP: about 1200 px wide for full-width photos (plus a ~640 px phone version), or 600 px for product shots.
3. Reference it with `width` and `height` attributes, plus `srcset` if there are two sizes.

Product photos for the catalogue are mapped in `IMAGES` in `js/data.js`. Products without a photo use the line drawings in `CATEGORY_ART`.

## Responsive breakpoints

| Width | What changes |
|---|---|
| ≤ 1100 px | Portal shop, chat and preferences stack to one column |
| ≤ 960 px | Site nav collapses to a menu button; the Portal button stays |
| ≤ 860 px | Two-column sections stack; portal sidebar becomes a swipeable top nav |
| ≤ 640 px | Portal tables become labelled cards; product, shop and Farm & More grids go two-up; chat goes full width |
| ≤ 480 px | Footer goes single-column; smaller logo |
| ≥ 1600 px | Wider content container |

Every public page and every portal screen (all four roles) is checked at widths from 320 px to 1920 px, plus a landscape phone, with no sideways scrolling or clipped content. See [audit.md](audit.md) §4.

## Path to production

The proposal's target stack is **Node/Express + PostgreSQL + Shopify Admin API + WhatsApp Cloud API + OpenAI**. This prototype keeps those boundaries, so each piece can move to a server later:

| Prototype | Becomes |
|---|---|
| `js/data.js` rules, pricing, commission | Server-side services + PostgreSQL |
| Mock "Shopify sync" and demo catalogue | Shopify Admin API + webhooks (Tyllage Sync) |
| `trackingFor()` | Shopify fulfilment webhooks or a courier / driver-app API |
| `js/assist.js` | LLM for language only; stock, prices and orders from the backend |
| `js/auth.js` | Server-side auth and role checks on every request |

See [audit.md](audit.md) for the full gap list and open questions for MEOD.

## Docs

[CONTRIBUTING.md](CONTRIBUTING.md) · [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) · [SECURITY.md](SECURITY.md) · [audit.md](audit.md) · [LICENSE](LICENSE)
