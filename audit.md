# Prototype Audit — Tyllage × Tyllage

**Date:** 21 Oct 2026, updated 24 Oct 2026  **Scope:** static HTML/CSS/JS prototype (this repo)  **Status:** Stage 1 — discovery, mock inventory and prototype

This audit checks the prototype against the Tyllage proposal pack:

- Project Proposal
- Product Specification
- Deployment Plan
- Industry Research
- Problem Statement 6B

It also lists what must change before any real data is used.

---

## 1. Requirement traceability

| Proposal module / requirement | Where in prototype | Status |
|---|---|---|
| **SalesDesk**: stock snapshots with source and last sync | Portal → Stock (`portal.js › inventoryView`); SalesDesk stock alerts | ✅ Mock |
| SalesDesk: searchable order history | Staff Orders (status filter); customer My orders (status filter) | ⚠️ Filters only; no free-text order search for staff |
| SalesDesk: escalation inbox | Portal → Inbox (tickets + farm bookings); "Needs a human" on SalesDesk | ✅ |
| SalesDesk: promo approvals | Campaign Studio approve/reject | ✅ |
| SalesDesk: group-buy settlement report | Portal → Group buys → Commission ledger | ✅ |
| **Sync**: Shopify products, stock and orders, idempotent webhooks | "Run Shopify sync (mock)" button | ⚠️ Simulated; no API calls |
| **Assist**: language detection, intent classification, backend lookups, human handover | `js/assist.js`; site chat widget; portal Ask Tyllage | ✅ Rule-based; EN/中文/BM; Tamil falls back to English |
| Assist: no invented availability; stale stock → "cannot confirm" | `stockStatus()` fail-closed | ✅ |
| Assist: verify identity before giving order details | Guests are told to sign in; signed-in customers get only their own order and its tracking status | ✅ Demo-level |
| **Recommend**: in-stock only, explains why, opt-out respected | `recommendFor()` / `tasteProfile()`: restock, co-purchase, taste and fresh signals, each with a reason and match % | ✅ Rule-based scoring, no LLM |
| **Campaign Studio**: product-first audience, consented cohort, preview, approval | Campaign Studio | ✅ Four-eyes approval; consent re-checked at send time |
| **GroupBuy**: leader code/link, discount captured, gross/net basis, refund handling | Group buys (staff), leader portal, customer Group buy page and cart code box | ✅ |
| Customer order status | My orders: tracker, **mock delivery tracking** (`trackingFor()`), receipts, reorder | ⚠️ Tracking is simulated; real source depends on the delivery provider (§6 Q8) |
| Customer profile and consent | Preferences: photo, contact email, mobile, delivery address, consent switches with timestamp, language | ✅ |
| Growth Insights dashboards | SalesDesk, Customers and Users summary tiles | ⚠️ Basic KPIs only; no conversion or repeat-purchase charts |
| Roles: admin / staff / leader / customer / AI | `auth.js` permission matrix; Users page shows a matching permission grid | ✅ Client-side only (see 3.1) |
| Leader sees masked member PII | Leader → Group orders | ✅ |
| Staff sees pseudonymous / masked customers | Orders and Customers views; staff search is ID-only | ✅ Admin sees full details |
| Audit log of actor, event, object, timestamp | Portal → Audit log (categories, search, plain-English labels) | ✅ Not tamper-proof |
| Synthetic fixtures; no real phone numbers | `js/data.js` uses the +65 8000 00xx range and `.test` emails | ✅ |
| Public site stays the storefront (no second checkout) | "Place order" creates a *pending payment* order; copy says payment is on Tyllage Fresh | ✅ |
| **Buy to Clear** (proposal §4.1): clearance listings, candidates, minimum-price guardrail, Surprise Harvest Bag pre-order, staff tools | `clearance.html`; Portal → Shop "Buy to Clear" section; Portal → **Buy to Clear** (staff/admin); `M.clearance` in `js/data.js` | ✅ Mock. Clearance price can't go below the minimum (admin-only field; staff see it read-only). Stale stock blocks ordering. Bag "Approve contents" reserves real stock or fails closed |
| **Harvest-linked selling**: pre-order by harvest date, sell before sell-by | Harvest Planner (batches, pre-orders, Record harvest with photo grading), Harvest Rescue, Harvest allocation; customer Shop pre-order row and product dialog | ✅ Mock. Pre-orders don't take stock; a harvest serves them first. Grading is a leaf-colour check that staff confirm |
| **Demand insight**: what to grow and harvest | Demand Radar (3-week supply vs demand per crop), harvest & pack list, Lost demand, Decision twin | ✅ Rule-based. Weekly sales history is mock Tyllage Fresh data |
| **Pricing with guardrails** | Price Advisor with Margin Guard and Promotion simulator | ✅ Floor = max(cost + 15% margin, minimum price); proposals need a different admin's approval; no surge pricing |
| **B2B / trade growth** | B2B buyers (accounts, standing orders, leads) and Quotations (Quotation Copilot; accepted quotes become recurring demand) | ✅ Mock; trade price 80% of retail is illustrative |
| **Outreach content** | Campaign Studio recommendations and restock reminders; Content studio; recipe ideas | ✅ Drafts only; a different person approves; consent re-checked at send |
| **Loyalty**: Grow with Tyllage | Customer Rewards page, cart voucher, Home card; staff Rewards ops brief, member search and nudge composer | ✅ Points come from orders; refunds reverse them. Rates mirror Tyllage Fresh Store Rewards and need confirming (§6 Q11) |
| **Farm visits → sales** | Experiences learning journeys, `visit.html` visitor shop, Visits page (funnel, capacity, AI reply drafts, re-invites) | ✅ Visit code built on GroupBuy; 5% of orders to the group's fund (illustrative) |
| **Feedback intelligence** | Feedback page; product ratings and reviews with AI summaries | ✅ Grouped by theme and traced to a harvest batch or delivery round |
| **Explainable AI** | AI-assisted pill on every AI feature; "Why?" panels; AI decision ledger; Ask Tyllage shows its working | ✅ All rule-based; no AI service is called |
| **Staff Q&A** | Ask Tyllage (EN / 中文, typed or voice) | ⚠️ Pattern-matched questions only; says so when it can't answer |
| **Weekly priorities** | Weekly briefing; SalesDesk teaser | ✅ |
| **Pilot measurement** | Pilot metrics vs a recorded baseline, CSV export; Data import from Excel / CSV | ✅ Mock baseline. Import parses in the browser (see 3.12) |
| Editable assumptions | Settings: AI assumptions and per-product unit costs with "used by" and a preview | ✅ Admin only |

## 2. Public site vs meod.com.sg

| Kept | Changed / added |
|---|---|
| Palette, "More Than A Farm" hero, stats, What We Do, Promise, Growing, Get our greens, Visit | **Portal** button in nav, **Picked this morning** strip with stock, **Buy together** group-buy band, **Ask Tyllage** chat, scroll-to-top |
| Page set: About, Produce, Experiences, Contact | Produce: searchable catalogue with filters and Show more, Seed to plate, Farm & More photo grid, Where to buy. About: fact cards. Experiences: photo cards, visit facts, booking form. Contact: contact cards and a map panel |
| Copy themes and facts (6 ha, since 2014, 13 Neo Tiew Harvest Lane, WhatsApp +65 8133 0358) | Copy shortened and reworded; footer kept site-only, with no portal links |

**Fonts.** Tyllage uses *Befalow* and *TT Commons*, which are licensed fonts. The prototype uses Google Fonts *Caveat Brush* and *Figtree* instead. Swap them in once Tyllage provides font licences.

**Images.** Tyllage-supplied originals are in `assets/`. The site uses optimised WebP copies in `assets/img/`, cutting 6.8 MB down to about 1.5 MB. Large photos have a phone-size version, chosen with `srcset`. The Tyllage logo (`assets/meod-light.svg`) replaces the text wordmark, and the round logo is the favicon. Nothing loads from meod.com.sg.

**Copy to confirm with Tyllage:**

- Farm & More product names (Farm Pesto, Veggie Crackers, Vege Powder, Gelato Tubs) and all prices
- Experience descriptions and tags
- The "SG Fresh" fact-card wording
- The Tue / Thu / Sat delivery schedule, which came from the research doc

## 3. Security & privacy findings

| # | Finding | Severity | Action before real data |
|---|---|---|---|
| 3.1 | Sign-in, roles and permissions run in the browser. Anyone can edit `sessionStorage` and act as admin. | **Critical (by design for demo)** | Server-side auth (hashed passwords, httpOnly secure cookies), server-side role checks on every request |
| 3.2 | All data lives in `localStorage`, per browser, and anyone using that device can read it. This now includes customer **profile photos, addresses and phone numbers**. | High | PostgreSQL behind an API; no PII on the client beyond the signed-in user; photos in object storage |
| 3.3 | Demo password is in source | Low (demo only) | Remove the demo accounts; seed from env-only secrets |
| 3.4 | No Content-Security-Policy or security headers; GitHub Pages can't set custom headers (it does serve HTTPS) | Medium | Add a CSP `<meta>` tag to each page now; set full headers (CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`) on the production host |
| 3.5 | Fonts and the map come from third parties (Google Fonts, Google Maps embed). Images are self-hosted. | Low | Self-host fonts; review the Maps embed's privacy notice |
| 3.6 | Audit log can be edited client-side | Medium | Append-only, server-side log |
| 3.7 | Ticket summaries only redact numbers of 4+ digits | Low | Proper PII redaction before storing or sending to an LLM |
| 3.8 | Profile photo upload is checked only on the client (type, 5 MB limit, re-encoded to a 192 px JPEG) | Medium (once real) | Server-side type sniffing, size limits, re-encoding and malware scanning |
| 3.9 | Delivery tracking is simulated; the driver "Message" button opens Tyllage's public WhatsApp | Info | Real provider via signed webhooks; never expose driver personal numbers |
| 3.10 | Data import and visit QR codes load SheetJS (`xlsx` 0.18.5) and `qrcodejs` 1.0.0 from cdnjs without Subresource Integrity. SheetJS 0.18.5 has known issues when reading crafted files (CVE-2023-30533 prototype pollution; CVE-2024-22363 ReDoS) | Medium | Self-host a patched SheetJS (0.20.2+) or parse on the server; add `integrity` hashes; until then, only import files from trusted sources |
| 3.11 | Ask Tyllage's voice input uses the browser's speech recognition; Chrome and Edge send the audio to Google's or Microsoft's servers | Medium (once real) | Tell staff; never dictate customer details; choose a speech service under Tyllage's own data agreement |
| 3.12 | Imported spreadsheets are parsed and stored in the browser | Medium (once real) | Server-side upload with type and size checks, row validation and an audit entry |
| 3.13 | Four-eyes approvals (prices, campaigns, posts) and the AI decision ledger run and are stored client-side | Medium | Enforce approvals on the server; append-only ledger |
| 3.14 | Ask Tyllage reads all demo records in the browser, not just what the user's role may see | Low (demo data only) | Scope answers to the user's role on the server; masked PII for staff |
| ✅ | All user and data content is rendered with `textContent` (the `h()` helper). `innerHTML` only receives **static** icon and illustration markup defined in the code. | — | Keep this rule (see CONTRIBUTING) |
| ✅ | Booking and profile forms validate input on the client | — | Validate again on the server |

## 4. Accessibility spot-check

- ✅ Skip link, landmark elements, `aria-current` on nav, labelled form fields, `aria-live` chat logs; Esc closes the chat
- ✅ Native `<dialog>` for the receipt and edit-profile pop-ups (focus is kept inside; Esc closes them)
- ✅ Consent toggles are real checkboxes with `role="switch"`; the language picker is a radio group
- ✅ `prefers-reduced-motion` turns off reveal, typing, pulse and hover animations
- ✅ Automated responsive sweep (21 Oct 2026), all clean:
  - **Public pages** at 320, 360, 375, 414, 480, 600, 667, 768, 820, 900, 1024, 1100, 1280, 1440 and 1920 px, plus landscape phone (667 × 375)
  - **Every portal screen for every role** at 320–1440 px
  - **Open states:** chat, mobile menu, Show more, tracking, and the receipt and edit-profile pop-ups at 320 px
  - **Checks:** no horizontal scroll, nothing spilling out of the screen, no clipped text, all images load
- ✅ Phone tap targets: portal action buttons and pills are at least 34 px tall; the in-stock toggle label is at least 40 px tall
- ✅ Portal tables turn into labelled cards under 640 px
- ⚠️ Colour contrast not formally measured; gold on white is only used for buttons with dark text
- ⚠️ The route map is decorative; the timeline next to it carries the same information as text
- ✅ Ask Tyllage: `aria-live` chat log, labelled message box, mic and send buttons; typing works where voice isn't supported
- ⚠️ The 21 Oct responsive sweep above predates the farm-ops, sales and AI screens added on 22–23 Oct. They were checked by hand at desktop and narrow widths while being built, but the full 320–1920 px sweep needs re-running

## 5. Verification performed (21 Oct 2026)

All checks were run manually in the browser against a local static server.

**Staff and admin**

- Every portal screen renders for each role with no console errors. Leaders and customers are redirected away from admin-only routes such as `#users`.
- Commission ledger matches a hand calculation (seed total S$4.16). Marking #MF5007 paid accrues S$0.78 (S$15.58 × 5%).
- An admin can't approve a campaign they created.
- Staff see masked customer names and phones. Their customer search is ID-only, so searching "aster" returns nothing.
- SalesDesk panel footers ("Open inbox", "View stock") line up at the bottom of side-by-side panels.

**Customer shopping**

- Invite code pre-fills; joining applies 5%. Cart total S$25.00 − S$1.25 + S$8.00 = S$31.75.
- Stale stock (Mizuna) can't be added.
- The cart code box joins a group buy. The free-delivery bar shows the remaining amount.
- Placing an order creates it as pending payment.

**Customer orders and tracking**

- Receipt totals match the order. Reorder adds only in-stock items.
- Get help opens Ask Tyllage with the order number filled in.
- Tracking:
  - Delivered orders show proof of delivery.
  - The demo order shows *Out for delivery* with the driver, arrival window and a van on the route.
  - Paid orders show the next Tue / Thu / Sat window.
  - Ask Tyllage reports the tracking status.

**Customer picks and profile**

- Smart picks give each demo customer varied reasons (restock, pairs well, taste), always fill four slots, and switch to fresh picks when personalisation is off.
- Profile form:
  - Rejects a bad email, an 8-digit number not starting with 8/9, a short street and a non-6-digit postal code.
  - Accepts a valid update and tidies the phone (+65 9123 4567) and unit (#05-12).
  - Stores the uploaded photo at about 2 KB.
  - Shows the new address in the cart.

**Public site**

- Catalogue search finds Chinese names (菜心 → HK Cai Xin). Show more reveals two full rows at a time on 4- and 5-column layouts, and three on phones. Price rows line up in every row.
- Public chat: "My veg arrived wilted" creates a ticket that appears in the staff inbox.
- Booking form: an empty submit shows all four errors; a valid submit stores the booking and shows a reference.

**Ask Tyllage (23 Oct 2026)**

- Suggestion chips return tables with "How I worked this out" and page links (e.g. *Which vegetables are selling slower this week?*, *How is Kai Lan doing?*).
- Greetings ("yo") get a friendly prompt; unknown questions say they can't be answered from the records.
- No console errors at desktop width or with the side panels stacked.

The features added on 22–23 Oct (§7) were checked by hand while being built; they haven't had the full role-by-role pass above. There's no automated test suite yet; that's a follow-up.

## 6. Open questions for Tyllage (from proposal §9)

1. Shopify store ownership and API scopes (read-only first?)
2. Meaning of "Microsoft Narvation": Dynamics NAV / Navision?
3. Real commission basis, rate, and refund / partial-fulfilment rules
4. What leaders may see about members, and the consent wording that covers it
5. Official WhatsApp Cloud API number and template approval owner
6. Human support hours to state in the bot
7. Brand assets (fonts, logo SVG, photos) and permission to reuse them
8. Who delivers: in-house drivers, a courier (e.g. Ninja Van, Lalamove) or Shopify fulfilment? This decides the real source behind the mock delivery tracking (`trackingFor()` in `js/data.js`).
9. Real Farm & More product names, prices and the current delivery schedule
10. A S$12 bag plus S$8 delivery is S$20, which weakens the "worth at least S$18" message. Should bags get free delivery, be add-ons to a normal order, or use pickup points?
11. Real Tyllage Fresh Store Rewards rates (points per S$1, redemption value) and whether growth-stage tiers can sit on top of them
12. Unit costs (growing, packaging, handling), the minimum margin, the trade price and the shelf life per category used by Margin Guard and Harvest Rescue
13. Typical sow-to-harvest days per crop, and how much of a batch to open to pre-orders
14. Learning-journey pricing, guides per group, session capacity and the share of visit orders paid to a group's fund
15. Whether staff may use browser voice input, given where the audio is sent (3.11)

## 7. Changelog

- **23 Oct 2026, explainable AI and planning.**
  - "Why?" panels on Demand Radar, Price Advisor, Campaign Advisor and Harvest allocation, and an **AI decision ledger** page.
  - **Quotations** (Quotation Copilot) with recurring commitments that feed Demand Radar and Harvest allocation.
  - **Decision twin**: harvest and demand sliders, a lost buyer, a failed batch and stress tests comparing five responses.
  - **Ask Tyllage**: EN / 中文 questions, typed or spoken, answered from the records. Restyled as a chat like the customer's Ask Tyllage, with side panels and a friendly reply to greetings.
  - **Lost demand**, **Harvest allocation**, **Promotion simulator**, **Data import** (Excel / CSV) and **Pilot metrics**; substitute suggestions, learning-journey packages and visit re-invites.
  - Layout fixes: equal-size action pills (Lost demand, Price Advisor, Campaign Advisor), aligned card rows, stat cards and customer Home cards; the Decision twin panel no longer repeats the page title.
- **22–23 Oct 2026, farm ops, sales and customer growth.**
  - **Harvest Planner** with pre-orders by harvest date, **photo grading** on Record harvest, and **Harvest Rescue** with sell-by dates.
  - **Demand Radar** with a daily harvest & pack list; **Weekly briefing**.
  - **B2B buyers**, **Price Advisor with Margin Guard**, **Content studio**, **Feedback intelligence**, and Campaign Studio recommendations and restock reminders.
  - **Grow with Tyllage rewards** for customers, and an AI ops brief, member search and nudge composer for staff.
  - **Group learning journeys**, the `visit.html` visitor shop, the Visits page, AI-drafted enquiry replies and visit capacity.
  - Ratings, reviews and AI review summaries; recipe ideas; editable AI settings and unit costs; a leader finder for group buys.
  - Staff sidebar grouped into Today, Farm ops, Sales, Customers and Admin. One **AI-assisted** pill on every AI feature.
  - Tables wider than their panel switch to labelled cards at any width; fixes for 320 px phones.

- **22 Oct 2026, Buy to Clear.**
  - Added clearance listings, candidates (high stock vs. low 14-day sales, plain-English reason) and a minimum-price guardrail to `js/data.js`, seeded additively via `migrate()`.
  - Turned the flat-price "Surprise Harvest Bag" product into a pre-order bag offer (two sizes, "worth at least", a bag limit per delivery day, a 10pm-the-day-before cutoff, one excluded category); it's no longer sold as a plain Shop item.
  - New public page `clearance.html` ("Buy to Clear"), linked from every public page's nav after Farm & More.
  - Customer Shop: a Buy to Clear section (clearance items + the bag) using the same cart and order flow.
  - New staff/admin **Buy to Clear** screen: candidates, a listing form (minimum price is admin-only; staff see it read-only), active listings with End early, a bag panel with rule-based proposed contents and Approve contents (reserves real stock or fails closed with a clear reason), a Send WhatsApp alert button that only drafts a Campaign Studio message, and an illustrative money-breakdown panel. Every action is logged to the Audit log.
  - Ask Tyllage (EN/中文/BM) now answers questions about the bag and clearance, and says so when stock can't be confirmed.
- **21 Oct 2026, images & responsive pass.** Switched to Tyllage-supplied images (optimised WebP with phone-size versions). Added a Farm & More showcase and a Goodness Gracious Gelato flavour strip, plus product photos in the catalogue and portal shop. Mobile card tables, full-width chat on phones, svh hero heights, tablet three-column grid. Demo storage key bumped to v2 so the new catalogue loads.
- **21 Oct 2026, public site redesign.**
  - Removed the footer portal column and the "Group leader sign in" button.
  - Rebuilt About (fact cards), Experiences (photo cards and visit facts), Contact (contact cards and map panel) and Produce (catalogue with search, filters and Show more; Seed to plate; Farm & More grid; Where to buy).
  - Added scroll-to-top.
  - Fixed the chat panel inheriting section padding.
- **21 Oct 2026, portal redesign.**
  - Staff and admin: Users, Audit log, Customers and Settings redesigned with summary tiles, filter chips and search. Duplicate panel headings removed. SalesDesk panel footers aligned.
  - Customer pages: Shop, My orders, Group buy, Preferences and Ask Tyllage redesigned. Smart picks scoring added.
  - Orders: receipts, reorder and get-help actions.
  - Preferences: profile editing (photo, contact details, address).
  - Delivery: mock delivery tracking with an additive data migration (`migrate()`).
- **21 Oct 2026, responsive hardening.**
  - Fixed the customer Shop overflowing on phones: single-column grids now use `minmax(0, 1fr)` so swipeable chip rows can't widen the page.
  - Fixed the Farm & More feature tile overflowing at 641–700 px: it had `aspect-ratio` plus `min-height`; its height now scales with the screen.
  - Larger tap targets on phones.
