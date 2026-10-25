# Tyllage × MEOD Farm — Vibecode Prototype

A clickable prototype for **MEOD Farm** (Problem Statement 6B: *Improving Sales and Marketing Outreach Through AI*).
It has two parts:

1. **Public site.** A refresh of [meod.com.sg](https://meod.com.sg/) that keeps MEOD's look (forest green, gold, berry and stony palette; hand-brushed headings; MEOD's own photos and logo) and adds a searchable produce catalogue, a Farm & More showcase, community group buys, **Buy to Clear**, group learning journeys with a visitor farm shop, and the **Ask MEOD** chat assistant.
2. **MEOD Portal.** Role-based dashboards for **admin**, **sales staff**, **group leaders** and **customers**. They're built on the modules in the proposal (SalesDesk, Sync, Assist, Recommend, Campaign Studio and GroupBuy), plus farm-ops tools that tie sales to what the farm is growing: Demand Radar, Harvest Planner, Harvest Rescue, Price Advisor, Ask Tyllage and more.

Built with plain **HTML, CSS and vanilla JavaScript**. There's no framework, no build step and no backend.

> **Proprietary software. © 2026 Tyllage LLP. All rights reserved.**
> This repository is not open source. Being able to see it on GitHub does not give you permission to copy, use, run, modify, deploy or redistribute any part of it. Outside contributions are not accepted. See [LICENSE](LICENSE).

> ⚠️ **Prototype only.** All data is synthetic and lives in the visitor's browser (`localStorage`). Sign-in runs in the browser and is **not secure**. Every "AI" feature is rule-based: no data is sent to an AI service. Don't put real customer data in this repo. See [SECURITY.md](SECURITY.md) and [audit.md](audit.md).

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
| Buy to Clear | `clearance.html` | Why Buy to Clear exists, the **Surprise Harvest Bag** pre-order (sizes, "worth at least", likely-inside preview, exclude-a-category, a live countdown to the next 10pm cutoff and bags left), and a grid of clearance items (normal price struck through, clearance price, reason badge, qty left, available until). Buttons send people to the Portal to buy — no second checkout |
| Experiences | `experiences.html` | Farm Tour, Workshop and School Visit cards, **group learning journeys** (schools, companies, community groups; up to 200 guests split into 40-person sessions), visit facts, and a validated **booking form** saved to the staff inbox |
| Visitor shop | `visit.html` | Opened from a visit's QR code or link. Visitors order with their group's farm-shop code, choose collect or delivery, and can opt in to harvest updates |
| Contact | `contact.html` | WhatsApp, email and tours contact cards, and a **Visit the farm** panel with map and directions |

On every page:

- **Ask MEOD** chat bubble: stock, prices, delivery, group buys, the Surprise Harvest Bag and clearance in EN / 中文 / BM. Complaints hand over to a person.
- **Scroll-to-top** button, above the chat bubble. The portal has one too, for every role.
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
| **Admin** | `admin@meod.test` | Everything in the staff sidebar below, plus **Users**, **Audit log** and **Settings** (editable AI assumptions and unit costs). Admins approve campaigns and price changes proposed by someone else, and set clearance minimum prices |
| **Sales staff** | `sales@meod.test` | The staff sidebar below, minus Users / Audit log / Settings. Customer names and phones are **masked**, campaigns and price proposals need an admin's approval, and only an admin can set a clearance **minimum price** (staff see it, read-only) |
| **Farm worker** | `worker@meod.test` | Phone-first **Greenhouse round** (photo, condition and harvest estimate per batch, grouped by greenhouse; saved on the phone first and uploaded when there's signal), **Past rounds** and **Signal check**. Nothing else |
| **Group leader** | `leader@meod.test`, `leader2@meod.test` | Own group buys and share link, members' orders (**masked**), commission ledger with a worked example |
| **Customer** | `customer@meod.test` | Home with **Smart picks** and a rewards card, Shop (incl. **Buy to Clear**, the Surprise Harvest Bag and **harvest pre-orders**), My orders with **delivery tracking**, **Rewards**, Group buy, Preferences (**profile editing**), Ask MEOD |

### Staff and admin sidebar

| Group | Screens |
|---|---|
| **Today** | SalesDesk **Overview**, **Ask Tyllage**, **Weekly briefing**, **Pilot metrics**, **AI decision ledger** |
| **Farm ops** | **Lost demand**, **Demand Radar**, **Harvest allocation**, **Decision twin**, **Greenhouse rounds**, **Seasonal calendar**, **Harvest Planner**, **Harvest Rescue**, Stock |
| **Sales** | Orders, **Content studio**, **B2B buyers**, **Quotations**, Campaigns, **Price Advisor**, Buy to Clear, **Rewards**, Group buys, **Visits** |
| **Customers** | Inbox, **Feedback**, Customers |
| **Admin** | **Data import**, Users, Audit log, Settings |

On phones the sidebar becomes a swipeable top menu with the same group labels.

### AI-assisted features

Every AI-assisted feature carries the same **AI-assisted** pill. All of them are **rule-based** in the prototype: they read the demo records, show how they reached an answer, and never change prices, send messages or write orders on their own. A person always approves.

What each part of the intelligence actually is today (also shown in Campaign Studio under *How Tyllage decides, and what's rule-based*):

| Part | How it works | Status |
|---|---|---|
| Demand gaps and uncommitted harvest | Calculation | Now |
| Margin Guard | Fixed business rule | Now |
| Choosing the promotion type | Explainable decision rules (`RULES.promo`) | Now |
| Campaign messages | Editable templates | Now |
| Campaign results | Recorded outcomes vs assumptions saved at draft | Now |
| Message writing by a language model | Optional LLM | Future |
| Predicting which promotion works best | Model trained on recorded results | Future, once each type has enough campaigns |

- **Ask Tyllage** (staff): a chat, laid out like the customer's Ask MEOD, for questions in English or 中文, typed or spoken (browser speech recognition). Answers are tables of real records with "How I worked this out" and links to the page behind them. If the records can't answer, it says so.
- **"Why?" panels and the AI decision ledger.** Demand Radar, Price Advisor, Campaign Advisor and Harvest allocation suggestions open a "Why?" panel: the data, calculation, assumptions, confidence, who decided and what happened. Price, campaign, quote and visit decisions are logged to the ledger.
- **Weekly briefing.** Ranked priorities across farm ops, sales and customers, a harvest and pack summary, a sales pulse, a 7-day calendar and an editable summary to copy.
- **Demand Radar.** Supply (stock + planned harvests) vs demand (pre-orders, confirmed trade orders, expected sales) per crop for the next 3 weeks, with a suggested next step. Also a printable **harvest & pack list** for the next 3 delivery days.
- **Lost demand.** Unmet requests, "Notify me" on sold-out products and crops MEOD doesn't grow, grouped per crop with a verdict, a substitute in stock and notify-when-back drafts.
- **Harvest allocation** and **Decision twin.** Where each upcoming harvest goes (trade, pre-orders, group buys, shop), and a 2-week what-if model with sliders and stress tests comparing five responses.
- **Harvest Planner** (with **photo grading** of harvest photos into Grade A / Cosmetic / Check) and **Harvest Rescue** (sell-by deadlines per batch and ranked rescue options).
- **Greenhouse rounds** (no drones or sensors). Workers keep doing their normal inspection walk; the phone records it.
  - **For each growing batch:** a photo (or a demo photo: fresh, yellowing or brown spots). Leafy crops get the same leaf-colour check as Harvest Planner, which suggests Healthy, Monitor or Needs review. The worker confirms the condition, adjusts the harvest estimate with −5/−1/+1/+5 buttons and can add a note. **Save & next** moves on to the next batch.
  - **Checking the last batch sends the round automatically.** Estimate changes within ±20% update the batch straight away, so Demand Radar, Harvest Drops and Campaign Advisor recalculate. Bigger changes, and anything marked "Needs review", wait for the farm manager in **Greenhouse rounds**, which shows what approving would do (for example, uncommitted 29 → 11). The worker can also send a part-finished round.
  - **A batch flagged "Needs review"** shows as **Hold promotions** in Campaign Advisor until the manager approves or keeps the estimate.
  - A lower estimate never takes pre-order spots below what's already reserved. Photos are kept only as small thumbnails, and the colour check judges looks only, never food safety.
  - **Harvest commitment risk.** Tyllage compares each batch's estimate with what's actually been promised: confirmed trade orders and accepted-quote deliveries in the batch's window, plus the batch's own pre-orders. Each is counted once by its underlying order, and usual shop sales are left out because they're estimates.
    - A lower estimate still waiting for review shows as a **potential shortfall**. New Harvest Drop offers for that batch are paused, and drop approvals are refused.
    - Once approved, it becomes a **confirmed shortfall**, with the affected orders listed (trade orders first, then pre-orders oldest first).
  - **Sales follow-ups.** A confirmed shortfall creates one internal task per affected order. Tyllage never contacts customers itself. Staff close a task with a note of what was agreed, a closed task isn't reopened, and tasks close themselves if a later estimate covers the order again.
  - **Batch history.** Every batch has a history: the previous and latest inspection photos side by side, every inspection exactly as the worker sent it, its status (Draft, Accepted automatically, Review required, Accepted by manager, Not accepted), the manager's decision and reason, and a log of every estimate change. Inspections are never edited; decisions are added beside them.
- **Greenhouse health map** (Greenhouse rounds). One tile per greenhouse, coloured by its most serious latest inspection: green Healthy, amber Monitor, red Needs review. A greenhouse not checked for 3+ days fades. Each crop shows its trend arrow (↗ ↘ →). Tap a crop to open its history.
- **Conditions saved with every inspection.**
  - **Outdoor forecast:** NEA's forecast at that moment is saved with the inspection (what it said, where, when NEA issued it, and whether it was live or demo weather).
  - **Greenhouse reading (optional):** the worker can add the temperature and humidity from a thermometer inside the greenhouse.

  Batch history shows the two on separate lines, "Outside (forecast)" and "Inside (thermometer)". NEA's figures are never treated as greenhouse conditions.
- **Batch health trend.** Improving, Stable or Worsening, from the worker-confirmed condition (never the photo check), one check per round over the last 21 days. With fewer than two rounds it says **Insufficient history**, not Stable.
- **Weather-aware daily advisory** (on the round page, for workers and staff). Today's forecast for MEOD's area (Lim Chu Kang, west region) comes live from NEA's public forecasts on data.gov.sg. Rules turn it into advice:
  - **Hot day (33°C+):** which greenhouses' leafy greens to check first for wilting, with those already under watch first.
  - **Showers or thunder:** when they'll hit, a lightning warning, and which delivery days may run late.
  - **Very humid:** which greenhouses to check for mould or rot.
  - **Farm visits:** confirmed learning journeys inside a forecast showers window (9am–5pm) get a note to review the outdoor parts of the route and have an indoor alternative ready.

  Every item is labelled **Forecast**. It isn't a report of what's happening at the farm, or an official warning. If there's thunder or an NEA warning, staff follow official safety guidance, and the farm manager makes the call.

  It's kept for 30 minutes. If data.gov.sg can't be reached, a clearly labelled demo forecast is used.
- **Learning from inspections** ("What Tyllage is learning" on Greenhouse rounds). Measured, not claimed:
  - **Photo check vs workers.** Each worker decision on a photo-checked batch is a labelled example. The panel shows how often the colour check agrees with workers, whether it flags too much or too little, and a suggestion-vs-decision table.
  - **Estimate accuracy.** Each harvest of an inspected batch is archived with the last worker estimate and the real yield. Once a crop has 3+ harvests and a steady bias of 5% or more, the inspection screen shows a corrected figure, e.g. "Kai Lan estimates have run 10% high over 4 past harvests, so about 56 is likelier", with a one-tap **Use 56**.
  - Ships with 12 weeks of demo history so the panel isn't empty.
- **Seasonal calendar.** Singapore festivals in the next five months (Deepavali, Dongzhi, Christmas, Chinese New Year, Hari Raya) and the greens each one lifts.
  - For each crop: festive demand vs planned harvests, the gap, and the last day to sow to close it.
  - Harvest Planner shows a **Sow now for the festivals** panel when a sowing deadline is within 3 weeks.
  - Campaign Advisor suggests a normal-price festive pre-order message 3 weeks before a festival.
  - Uplifts are illustrative until MEOD's own festive sales replace them.
- **Market price check** (Seasonal calendar). Staff record supermarket and wet-market prices for a similar pack. Tyllage compares the last 30 days with MEOD's price: Premium, At market or Below market.
- **Price Advisor with Margin Guard** and a **Promotion simulator**: discount, bundle or bulk-trade suggestions checked against a price floor; no surge pricing.
- **Campaign Studio**: a ranked list of recommended campaigns, AI-drafted messages per language, and **restock reminders**.
- **Promotion Intelligence** (inside Campaign Studio): every recommendation is ranked as **Suggested**, **Alternative** and **Avoid**, each with a reason. The suggested option names the kind of promotion that fits (Harvest Drop, Smart bundle, Rescue offer, Group-buy milestone, Learning-journey voucher, Repeat-buyer reward, Reactivation, Normal-price promo), or says **No promotion needed**.
  - **Harvest Drops.** Each harvest in the next 2 weeks shows expected, committed, usual sales and uncommitted quantities. Tyllage compares a normal-price pre-order, a bundle and a small discount, showing contribution per unit and the potential revenue if every drop spot sells. A drop never opens more pre-order spots than the batch's limit (60% of expected yield by default). If the uncommitted amount is bigger, the drop is sized to the spots left. Raising the limit is a separate decision in Harvest Planner, and a harvest with no spots left shows a "Pre-order limit reached" card.
  - **Assumptions vs actual.** Each draft saves what Tyllage expected: how many people order (the *Expected campaign response* in Settings, 25% by default), plus drop spots, group volume or voucher cost where relevant. Each sent campaign shows those beside what actually happened, marked met, below or still counting.
  - **Results by promotion type.** Each sent campaign shows what it led to: orders, sales, margin, vouchers used and drop spots taken. A table compares the promotion types: assumed vs actual buyers, how many finished campaigns met their assumptions, and which types have enough campaigns to judge.
- **Content studio**: weekly social and WhatsApp post ideas with caption checks.
- **B2B buyers** insights and **Quotation Copilot** (reads a buyer's enquiry, checks a counter-offer against Margin Guard and spare supply; accepted quotes become recurring demand).
- **Feedback intelligence**: ratings, reviews, chats, tickets, trade buyers and visits, grouped by theme and traced to a harvest batch or delivery round.
- **Visits**: AI-drafted enquiry replies, daily session capacity, learning-journey packages, re-invites and **learning-journey vouchers** (a thank-you voucher for visitors who opted in, issued when the campaign is sent).
- **Group-buy goals**: a volume goal about 25% above a group's usual volume that unlocks a voucher for everyone who ordered. It's suggested only when the extra margin covers the vouchers. Leaders and members see progress, and an admin issues the vouchers once the goal is reached.
- **Rewards** ops brief, member search in plain English and a nudge composer; customer **Smart tips**.
- **Smart picks**, **recipe ideas** and **review summaries** for customers.

### Customer highlights

- **Product details.** Tap any shop card for a pop-up with a large photo, live stock, star ratings with an AI review summary, reviews (verified-buyer tags, and a review form once you've received it), storage and cooking tips, recipe ideas, "often bought together", and a quantity picker. Sold-out items offer the next-harvest pre-order or "Notify me".
- **Shop and cart.** Live stock checks, a group-code box, a reward-voucher picker, a **free-delivery progress bar** and the delivery address. Stock is re-checked when you place the order.
- **Harvest pre-orders.** Reserve from an upcoming batch. Pre-orders don't take stock; the harvest serves them first.
- **Buy to Clear.** A Shop section for clearance-priced produce and the pre-order **Surprise Harvest Bag**.
- **My orders.** Status filters, and on each order a 5-step tracker, **Track** (route map, driver or proof of delivery, timeline), a printable **Receipt**, **Reorder** and **Get help** (opens Ask MEOD with the order number filled in).
- **Grow with MEOD rewards.** Points per S$1, growth-stage tiers counted in bunches of MEOD-grown produce, 2× points on Buy to Clear and pre-orders, tier-up vouchers, a stamp card and points history.
- **Smart picks.** Each in-stock product is scored for **restock** timing, **pairs well**, **your taste** and **fresh** produce, with a reason and a % match. Turning personalisation off switches to generic fresh picks.
- **Profile.** Photo (resized in the browser), contact email, Singapore mobile number and delivery address, all checked on Save.

### Other staff tools

- **Campaign Studio:** messages only go to customers who opted in, need sign-off from a *different* admin, and re-check consent at send time.
- **Buy to Clear:** candidates with plain-English reasons, a listing form (admin-only minimum price), End early, the Surprise Bag panel with **Approve contents** (reserves real stock or fails closed) and a WhatsApp alert that only drafts a Campaign Studio message.
- **Surprise Bags: should we?** (Harvest Rescue). Tyllage decides *whether* a mixed bag is the right way to move surplus.
  - **Spare stock:** pooled across harvested batches for the next bag day. That's unsold stock that stays within its sell-by date through that day, minus what usual sales should take.
  - **Household-sized bags:** each bag is filled until it meets its "worth at least" promise, but never beyond 6 items (Small) or 9 (Regular), with at most 2 of one crop. Bags stay within the 15-a-day cap and the 10pm cutoff.
  - **Contribution check:** contribution = price − produce cost − packaging − extra handling, checked against Margin Guard's minimum margin.
  - **Compared on the same cost basis** with individual Buy to Clear, a trade buyer offer and no bag. Bags are suggested only when expected to earn at least as much as selling the items one by one.
  - **It can say no, with the reason:** too few crops, one crop dominates, not enough for 2 bags, the worth promise can't be met, below the minimum margin, or individual sales earn more. With the demo costs, for example, a S$12 Small bag needs 6 items (about S$10 of produce, packing and handling) to keep its S$18 promise, so it falls below the 15% minimum margin.
  - **Plans:** staff propose a plan, and someone else approves it. An approved plan only sets how many bags customers can order that day and which crops they draw on. **Nothing is reserved** until each order's contents are approved in Buy to Clear, which rechecks stock and skips the customer's excluded category.
  - **Scorecard:** Surprise Bags vs Buy to Clear over 30 days (orders, items, revenue, contribution, repeat buyers, packing time). Waste is reported in three separate tiers: items sold through bags (measured), items that would otherwise have gone unsold (estimated, from approved plans), and waste actually avoided (not claimed without a disposal baseline).
  - Costs and sell-through assumptions are editable in **Settings → Surprise Bags**.
- **Group buys:** commission ledger and a **leader finder** for neighbourhoods with regular buyers but no leader.
- **Data import:** Excel (`.xlsx`) or CSV sales and harvest records, with automatic column and product matching, a preview and skipped-row reasons.
- **Pilot metrics:** conversion, sell-through, unsold stock, campaign margin, lost demand and time saved vs a recorded baseline, with CSV export.
- **Settings:** business rules as cards, editable AI assumptions and per-product unit costs (each shows what uses it and previews the change), and **Reset demo data**.
- Users, Customers and Audit log pages with filters and search. Every action is written to the Audit log.

### Business rules (illustrative — MEOD to confirm)

All of these live in `RULES` in `js/data.js`. Admins can change the AI assumptions and unit costs in **Settings**.

- **Pricing:** amounts are integer cents. Group discount is 5%. Delivery is free from S$60, otherwise S$8. Deliveries run Tue / Thu / Sat. Trade (B2B) price is 80% of retail.
- **Commission:** 5% of net merchandise (subtotal − discount, delivery excluded). It counts once an order is paid, and a refund posts a matching negative adjustment. The ledger is rebuilt from the orders, so it always reconciles.
- **Stock never guesses.** A sync older than 6 hours, or a failed one, shows as *Checking stock*. Those items can't be ordered, and Ask MEOD won't confirm them.
- **Buy to Clear.** A clearance price can never be below its minimum price (default 60% of normal). Clearance stock is a discounted slice of a product's own stock, so a sale decrements both. Bag pre-orders close 10pm the day before each delivery.
- **Harvest pre-orders** close 10pm the night before harvest. 60% of a batch's expected yield opens to pre-order by default. A cancel or refund frees the spot.
- **Margin Guard:** no price may go below max(unit cost + 15% margin, the minimum price). Short crops get "hold price", never a surge.
- **Promotions (`RULES.promo`):** a Harvest Drop stays at the normal price when 25% or less of the harvest is uncommitted or pre-orders are filling fast. Between 25% and 50% it suggests a bundle (10% off the pair). Above 50%, with slow pre-orders, it suggests 10% off the drop spots only. A drop is sized to the smaller of the uncommitted amount and the pre-order spots left. At approval, the drop must still fit in the spots left and pass Margin Guard; if either check fails, the approval fails and nothing changes. Approval never raises a batch's pre-order limit. Uncommitted figures can't double-count across two batches of the same crop: each batch only counts trade orders, standing orders and usual sales from its own harvest day up to the next batch's, and pre-orders belong to one batch. Group goals pay S$3 per member, visit vouchers are S$5, and results count orders by recipients within 7 days of sending.
- **Who does what:** MEOD owns the produce, sets and approves prices and offers, sends from MEOD Fresh and owns its customer relationships. Tyllage analyses, recommends, drafts and reports. It never buys or resells produce.
- **Harvest Rescue:** sell-by dates come from a shelf life per category (4–7 days).
- **Rewards:** 1 point per S$1; 100 points = S$5 voucher (S$20 minimum on full-price items, valid 90 days); 2× points on anti-waste lines; four tiers (Seedling, Sprout, Harvester, Farm Friend). Points come from orders, so refunds reverse them.
- **Visits:** up to 200 guests, 40 per session, 3 sessions a day; 5% of a visit group's orders goes to its fund; the farm-shop code stays open 7 days.
- **Greenhouse rounds (`RULES.inspect`):** 8 demo greenhouses (GH-01 to GH-08). Every batch belongs to one; new batches are assigned automatically. Only growing batches are inspected. Changes within ±20% apply automatically; anything bigger, or marked "Needs review", needs the farm manager. In the demo the admin is the farm manager: sales staff can see estimate changes, their effect on orders and the follow-up tasks, but can't approve estimates.
- **Ask MEOD** detects language (EN / 中文 / BM; Tamil falls back to English) and what the customer is asking about. Complaints, refunds, payment and food-safety messages **create a ticket and hand over to a person**, and the reply is honest about after-hours wait times.

### Delivery tracking (mock adapter)

`trackingFor(order)` in `js/data.js` works out a delivery timeline from each order. It uses **Shopify fulfilment-style statuses** (`confirmed`, `picked_up`, `out_for_delivery`, `delivered`) and the Tue / Thu / Sat schedule; pre-orders are scheduled for their harvest day. The demo customer always has one order *out for delivery*.

To connect real tracking later, replace just this function. The source could be:

- Shopify fulfilment webhooks,
- a courier API (e.g. Ninja Van, Lalamove), or
- a driver app (e.g. Detrack).

Which one depends on who does MEOD's deliveries; that's an open question in [audit.md](audit.md).

---

## Project layout

```
index.html about.html produce.html          public site
clearance.html experiences.html contact.html
visit.html                                  visitor farm shop (from a visit's QR code)
portal.html dashboard.html                  portal (sign-in, app)

css/style.css     site styles + design tokens (:root)
css/portal.css    portal styles

js/data.js        demo data, RULES, pricing, commission, stock, smart picks, harvests,
                  Demand Radar, Margin Guard, rewards, Ask Tyllage answers,
                  delivery tracking adapter, storage + migrations
js/assist.js      Ask MEOD rule-based assistant (shared by site and portal)
js/main.js        public site: nav, produce catalogue, booking form,
                  chat widget, scroll-to-top
js/visit.js       visitor farm shop
js/auth.js        demo session + role permission matrix
js/login.js       sign-in page
js/grade.js       harvest photo grading (in-browser leaf-colour check)
js/recipes.js     recipe library (EN / 中文 / BM)
js/content.js     Content studio post ideas and caption checks
js/replies.js     visit enquiry reply drafts
js/portal.js      all portal screens
js/pwa.js         registers the service worker, "Install app"
sw.js             service worker: portal opens with no signal
manifest.webmanifest  installable app (name, icons, colours)

assets/           MEOD-supplied originals (logo SVG, photos)
assets/img/       optimised WebP copies the site actually loads
```

**Script order:**

- Public pages: `data.js → assist.js → main.js` (plus `visit.js` on `visit.html`).
- `portal.html`: `data.js → auth.js → login.js`.
- `dashboard.html`: `data.js → assist.js → auth.js → grade.js → recipes.js → content.js → replies.js → portal.js`.

**Third-party scripts, loaded only when needed** from cdnjs: SheetJS (`xlsx` 0.18.5) when an Excel file is imported, and `qrcodejs` 1.0.0 when a visit QR code is shown. CSV import and everything else work offline. See [SECURITY.md](SECURITY.md).

**Public weather data:** the round page reads NEA's 24-hour and 2-hour forecasts from `api-open.data.gov.sg` with plain GET requests. Nothing about MEOD, its staff or customers is sent. With no signal it shows the last forecast saved on the phone, labelled "Last saved · offline", or demo weather if there isn't one.

## Offline-first rounds and the installable app

Signal can drop inside MEOD's greenhouses, so greenhouse rounds work without it.

- **Saved on the phone first.** Every inspection gets its own ID and a status shown on its batch:
  - **Saved on device:** just saved.
  - **Waiting to upload:** there's no connection.
  - **Received · simulated:** the server acknowledged that exact ID.

  Coming back online is never treated as proof of receipt. The round is sent to the harvest plan only once every checked batch has been received. "Send now" for a part-finished round waits for the same.
- **No duplicates.** The server remembers every ID it has accepted. Re-sending an inspection returns the same receipt and is never counted twice, and a round can't be sent twice.
- **Signal and demo switch.** The round's hero shows the phone's signal. **Simulate no signal** fakes a dead zone so the whole save → wait → upload → receipt cycle can be shown anywhere. Uploads retry automatically when the signal returns, and every 30 seconds while anything is waiting.
- **On this phone** card: inspections, photo and data size, the browser's storage allowance, and how much isn't received yet, with a warning not to clear browser data until it is.
- **Signal check** (worker) and **Signal by greenhouse** (staff). Workers test the connection inside each greenhouse, either automatically (a timed request to data.gov.sg, standing in for Tyllage's server) or by tapping "No signal". Two or more tests give a verdict per greenhouse: Good, Patchy or Dead zone. Demo-mode tests are kept apart and not counted. Run this at MEOD before relying on offline sync.
- **Installable app (PWA).** `manifest.webmanifest`, icons in `assets/icons/`, and a service worker (`sw.js`, registered by `js/pwa.js`). The portal's own files are fetched fresh when there's signal (or within 4 seconds) and otherwise come from the copy saved on the phone, so the round page opens even with no connection. Install with **Install app** on the "On this phone" card (Chrome or Edge), or Share → Add to Home Screen on iPhone. Bump `VERSION` in `sw.js` when the list of saved files changes.

**What's simulated, and what real use needs.** There's no backend, so the "server" is simulated inside the browser and its receipts are labelled as simulated. In this prototype the phone is the only copy of an inspection, so nothing is deleted after a receipt, and clearing the browser's data loses it. Before real use MEOD needs:
- a shared server that acknowledges each inspection ID,
- authenticated sign-in,
- a screen lock and device rules for work phones,
- a retention period for photos and records kept on phones,
- a way to sign out and wipe a lost phone.

## Demo data

- Stored in `localStorage` under `meod-demo-state-v2`. Each browser has its own copy.
- **Reset:** sign in as admin and use **Settings → Reset demo data**, or clear the site's storage.
- **Additive updates:** `migrate()` in `data.js` adds new demo records (harvest batches, trade accounts, reviews, visits and so on) without wiping anyone's data.

## Images

MEOD-supplied originals stay in `assets/`, and the site loads the optimised WebP copies in `assets/img/`. To add or replace a photo:

1. Drop the original into `assets/`.
2. Export a WebP: about 1200 px wide for full-width photos (plus a ~640 px phone version), or 600 px for product shots.
3. Reference it with `width` and `height` attributes, plus `srcset` if there are two sizes.

Product photos for the catalogue are mapped in `IMAGES` in `js/data.js`. Products without a photo use the line drawings in `CATEGORY_ART`.

## Responsive breakpoints

| Width | What changes |
|---|---|
| Any width | Portal tables wider than their panel switch to labelled cards |
| ≤ 1100 px | Portal shop, chat (Ask MEOD and Ask Tyllage) and preferences stack to one column |
| ≤ 960 px | Site nav collapses to a menu button; the Portal button stays |
| ≤ 860 px | Two-column sections stack; portal sidebar becomes a swipeable top nav |
| ≤ 640 px | Portal tables always become labelled cards; product, shop and Farm & More grids go two-up; chat goes full width |
| ≤ 480 px | Footer goes single-column; smaller logo |
| ≥ 1600 px | Wider content container |

The full sweep from 320 px to 1920 px was last run on 21 Oct 2026, before the farm-ops screens were added. See [audit.md](audit.md) §4.

## Path to production

The proposal's target stack is **Node/Express + PostgreSQL + Shopify Admin API + WhatsApp Cloud API + OpenAI**. This prototype keeps those boundaries, so each piece can move to a server later:

| Prototype | Becomes |
|---|---|
| `js/data.js` rules, pricing, commission, Margin Guard, rewards | Server-side services + PostgreSQL |
| Mock "Shopify sync" and demo catalogue | Shopify Admin API + webhooks (Tyllage Sync) |
| Data import (parsed in the browser) | Upload to the server; parse, validate and de-duplicate there |
| `trackingFor()` | Shopify fulfilment webhooks or a courier / driver-app API |
| `js/assist.js`, Ask Tyllage, reply and post drafts | LLM for language only; facts from the backend, scoped to the user's role |
| `js/grade.js` | A trained grading model, with staff still confirming each grade |
| AI decision ledger and Audit log | Append-only server-side logs |
| `js/auth.js` | Server-side auth and role checks on every request |

See [audit.md](audit.md) for the full gap list and open questions for MEOD.

## License and ownership

© 2026 Tyllage LLP. All rights reserved.

This prototype, including its code, designs, business rules and documentation, is proprietary to Tyllage LLP and is shared under the [Tyllage Proprietary License](LICENSE). No licence is granted to use, copy, modify, deploy or redistribute it without Tyllage's prior written permission. GitHub's Terms of Service let you view and fork public repositories on GitHub; that does not give any further right to use this code.

The MEOD name, logo, photographs and website copy belong to MEOD Farm and are used here for demonstration to MEOD only. Third-party libraries loaded at runtime (SheetJS and qrcodejs) remain under their own licences.

For licensing or partnership enquiries, contact the team through the [Tyllage GitHub organisation](https://github.com/Tyllage).

## Docs

[CONTRIBUTING.md](CONTRIBUTING.md) · [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) · [SECURITY.md](SECURITY.md) · [audit.md](audit.md) · [LICENSE](LICENSE)
