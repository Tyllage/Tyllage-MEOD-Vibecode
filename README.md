# Tyllage × MEOD Farm — Vibecode Prototype

A clickable prototype for **MEOD Farm** (Problem Statement 6B: *Improving Sales and Marketing Outreach Through AI*).
It has two parts:

1. **Public site.** A refresh of [meod.com.sg](https://meod.com.sg/) that keeps MEOD's look (forest green, gold, berry, stony; hand-brushed headings) and adds:
   - a **"Picked this morning"** harvest strip with live stock badges
   - a **Group buy** band
   - a floating **Ask MEOD** chat assistant
   - a working farm-visit **booking form**
2. **MEOD Portal.** Role-based dashboards for **admin**, **sales staff**, **group leaders** and **customers**, based on the modules in the proposal: SalesDesk, Assist, Recommend, Campaign Studio, GroupBuy and Sync.

Plain **HTML, CSS and vanilla JavaScript**. No framework, no build step, no backend.

> ⚠️ **Prototype only.** All data is synthetic and lives in the visitor's browser (`localStorage`). Sign-in is client-side and **not secure**. Do not put real customer data in this repo. See [SECURITY.md](SECURITY.md) and [audit.md](audit.md).

## Run it locally

Any static file server works. From the repo root:

```bash
py -m http.server 5173
```

Then open http://localhost:5173. (`npx serve .` also works.) Opening `index.html` directly also mostly works, but some browsers limit `localStorage` on `file://`.

## Deploy to Railway

`railway.json` uses the **Railpack** builder. Railpack sees `index.html` in the repo root and serves the folder as a static site. To deploy:

1. Push to GitHub.
2. In Railway, create a new project from this repo.
3. Generate a domain.

No environment variables are needed for the prototype.

## Pages

| Page | File | Notes |
|---|---|---|
| Home | `index.html` | Hero, what we do, harvest strip *(new)*, promise, growing, group buy *(new)*, stockists, visit |
| About | `about.html` | Story, purpose, food security |
| Our Produce | `produce.html` | Category filter, stock badges, nutrients |
| Experiences | `experiences.html` | Tours and workshops, booking form (validated, saved to the staff inbox) |
| Contact | `contact.html` | Address, WhatsApp, map embed |
| Portal sign-in | `portal.html` | Role tabs plus one-click demo accounts |
| Portal app | `dashboard.html` | Role-based views (hash routes) |

## Where the portal lives (and why)

- **Top nav "Portal" button**, next to the gold "Our Store" button. It's always visible on every page, but styled as an outline button so it doesn't compete with "Our Store", MEOD's main sales action.
- **Group buy band on the home page.** Leaders and members are the users who need the portal most, so they get a contextual entry point ("Group leader sign in" / "Join with a code").
- **Footer "Portal" column** with separate links for customers, group leaders and staff.
- **Leader invite links** (`portal.html?role=customer&code=…`) fill in the code for the member.

## Portal roles

| Role | Demo account | Can see / do |
|---|---|---|
| Admin | `admin@meod.test` | Everything; full customer details; approve campaigns (not their own); create and close group buys; users; audit log; settings and reset |
| Sales staff | `sales@meod.test` | Stock, orders (names masked), inbox, draft campaigns, group-buy view. No approvals, users or audit |
| Group leader | `leader@meod.test`, `leader2@meod.test` | Their own events, share link, members' orders **masked**, commission ledger with worked example |
| Customer | `customer@meod.test` | Shop with live stock check, group code discount, orders, personalised picks, consent and language preferences, Ask MEOD with order lookup |

The shared demo password is `DEMO_PASSWORD` in `js/data.js`. The sign-in page also has one-click buttons.

## Business rules (illustrative, MEOD to confirm)

All of these live in `RULES` in `js/data.js`:

- **Pricing** is in integer cents. Group discount is 5%. Delivery is free from S$60, otherwise S$8.
- **Commission** is 5% of net merchandise (subtotal − discount, delivery excluded). It accrues once the order is paid or fulfilled. A refund posts a matching negative adjustment. The ledger is rebuilt from the orders, so it always reconciles.
- **Stock fails closed.** A sync older than 6 hours (or a failed one) shows as *"Checking stock"*. That product can't be added to a cart, and the bot won't confirm it's available.
- **Ask MEOD** detects the language (EN / 中文 / BM, Tamil falls back to English) and the intent. Complaints, refunds, payment and food-safety messages **create a ticket and hand over to a human**, with honest after-hours wording.
- **Campaigns** only target customers who opted in, need approval from a *different* admin, and re-check consent at send time.

## Project layout

```
index.html about.html produce.html experiences.html contact.html   public site
portal.html dashboard.html                                          portal
css/style.css   css/portal.css
js/data.js      demo data, rules, pricing, commission, stock, recommendations
js/assist.js    Ask MEOD rule-based assistant
js/main.js      public site behaviour + chat widget + booking form
js/auth.js      demo session + role permission matrix
js/login.js     sign-in page
js/portal.js    dashboards
railway.json    Railway deploy config
assets/         MEOD-supplied originals (logo SVG, photos)
assets/img/     optimised WebP copies the site actually loads
```

## Images

MEOD-supplied originals stay in `assets/`. The site loads the optimised WebP copies in `assets/img/`. To add or replace a photo:

1. Drop the original into `assets/`.
2. Export a WebP: around 1200 px wide for full-width photos (plus a ~640 px version for phones), or 600 px for product shots.
3. Reference it with `width`/`height` attributes, plus `srcset` if there are two sizes.

Product photos for the catalogue are mapped in `IMAGES` in `js/data.js`.

## Responsive breakpoints

| Width | What changes |
|---|---|
| ≤ 960 px | Nav collapses to a menu button. The Portal button stays visible |
| ≤ 860 px | Two-column splits stack. The portal sidebar becomes a swipeable top nav |
| ≤ 640 px | Portal tables become labelled cards. Shop, picks and Farm & More go two-up. The chat becomes a full-width panel |
| ≤ 480 px | Footer goes single-column. Smaller logo |
| ≥ 1600 px | Wider content container |

## Path to production

The proposal's target architecture is Node/Express + PostgreSQL + Shopify Admin API + WhatsApp Cloud API + OpenAI. This prototype keeps those boundaries: `data.js` holds the rules a backend would own, and `assist.js` stands in for the LLM layer. That should make each piece straightforward to lift into a server later. See [audit.md](audit.md) for the gap list.

## Docs

[CONTRIBUTING.md](CONTRIBUTING.md) · [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) · [SECURITY.md](SECURITY.md) · [audit.md](audit.md) · [LICENSE](LICENSE)
