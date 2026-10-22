# Prototype Audit — Tyllage × MEOD Farm

**Date:** 21 Oct 2026  **Scope:** static HTML/CSS/JS prototype (this repo)  **Status:** Stage 1 — discovery, mock inventory and prototype

This audit checks the prototype against the MEOD proposal pack:

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
| **Assist**: language detection, intent classification, backend lookups, human handover | `js/assist.js`; site chat widget; portal Ask MEOD | ✅ Rule-based; EN/中文/BM; Tamil falls back to English |
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
| Public site stays the storefront (no second checkout) | "Place order" creates a *pending payment* order; copy says payment is on MEOD Fresh | ✅ |
| **Buy to Clear** (proposal §4.1): clearance listings, candidates, minimum-price guardrail, Surprise Harvest Bag pre-order, staff tools | `clearance.html`; Portal → Shop "Buy to Clear" section; Portal → **Buy to Clear** (staff/admin); `M.clearance` in `js/data.js` | ✅ Mock. Clearance price can't go below the minimum (admin-only field; staff see it read-only). Stale stock blocks ordering. Bag "Approve contents" reserves real stock or fails closed |

## 2. Public site vs meod.com.sg

| Kept | Changed / added |
|---|---|
| Palette, "More Than A Farm" hero, stats, What We Do, Promise, Growing, Get our greens, Visit | **Portal** button in nav, **Picked this morning** strip with stock, **Buy together** group-buy band, **Ask MEOD** chat, scroll-to-top |
| Page set: About, Produce, Experiences, Contact | Produce: searchable catalogue with filters and Show more, Seed to plate, Farm & More photo grid, Where to buy. About: fact cards. Experiences: photo cards, visit facts, booking form. Contact: contact cards and a map panel |
| Copy themes and facts (6 ha, since 2014, 13 Neo Tiew Harvest Lane, WhatsApp +65 8133 0358) | Copy shortened and reworded; footer kept site-only, with no portal links |

**Fonts.** MEOD uses *Befalow* and *TT Commons*, which are licensed fonts. The prototype uses Google Fonts *Caveat Brush* and *Figtree* instead. Swap them in once MEOD provides font licences.

**Images.** MEOD-supplied originals are in `assets/`. The site uses optimised WebP copies in `assets/img/`, cutting 6.8 MB down to about 1.5 MB. Large photos have a phone-size version, chosen with `srcset`. The MEOD logo (`assets/meod-light.svg`) replaces the text wordmark, and the round logo is the favicon. Nothing loads from meod.com.sg.

**Copy to confirm with MEOD:**

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
| 3.9 | Delivery tracking is simulated; the driver "Message" button opens MEOD's public WhatsApp | Info | Real provider via signed webhooks; never expose driver personal numbers |
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
- Get help opens Ask MEOD with the order number filled in.
- Tracking:
  - Delivered orders show proof of delivery.
  - The demo order shows *Out for delivery* with the driver, arrival window and a van on the route.
  - Paid orders show the next Tue / Thu / Sat window.
  - Ask MEOD reports the tracking status.

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

There's no automated test suite yet; that's a follow-up.

## 6. Open questions for MEOD (from proposal §9)

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

## 7. Changelog

- **22 Oct 2026, Buy to Clear.**
  - Added clearance listings, candidates (high stock vs. low 14-day sales, plain-English reason) and a minimum-price guardrail to `js/data.js`, seeded additively via `migrate()`.
  - Turned the flat-price "Surprise Harvest Bag" product into a pre-order bag offer (two sizes, "worth at least", a bag limit per delivery day, a 10pm-the-day-before cutoff, one excluded category); it's no longer sold as a plain Shop item.
  - New public page `clearance.html` ("Buy to Clear"), linked from every public page's nav after Farm & More.
  - Customer Shop: a Buy to Clear section (clearance items + the bag) using the same cart and order flow.
  - New staff/admin **Buy to Clear** screen: candidates, a listing form (minimum price is admin-only; staff see it read-only), active listings with End early, a bag panel with rule-based proposed contents and Approve contents (reserves real stock or fails closed with a clear reason), a Send WhatsApp alert button that only drafts a Campaign Studio message, and an illustrative money-breakdown panel. Every action is logged to the Audit log.
  - Ask MEOD (EN/中文/BM) now answers questions about the bag and clearance, and says so when stock can't be confirmed.
- **21 Oct 2026, images & responsive pass.** Switched to MEOD-supplied images (optimised WebP with phone-size versions). Added a Farm & More showcase and a Goodness Gracious Gelato flavour strip, plus product photos in the catalogue and portal shop. Mobile card tables, full-width chat on phones, svh hero heights, tablet three-column grid. Demo storage key bumped to v2 so the new catalogue loads.
- **21 Oct 2026, public site redesign.**
  - Removed the footer portal column and the "Group leader sign in" button.
  - Rebuilt About (fact cards), Experiences (photo cards and visit facts), Contact (contact cards and map panel) and Produce (catalogue with search, filters and Show more; Seed to plate; Farm & More grid; Where to buy).
  - Added scroll-to-top.
  - Fixed the chat panel inheriting section padding.
- **21 Oct 2026, portal redesign.**
  - Staff and admin: Users, Audit log, Customers and Settings redesigned with summary tiles, filter chips and search. Duplicate panel headings removed. SalesDesk panel footers aligned.
  - Customer pages: Shop, My orders, Group buy, Preferences and Ask MEOD redesigned. Smart picks scoring added.
  - Orders: receipts, reorder and get-help actions.
  - Preferences: profile editing (photo, contact details, address).
  - Delivery: mock delivery tracking with an additive data migration (`migrate()`).
- **21 Oct 2026, responsive hardening.**
  - Fixed the customer Shop overflowing on phones: single-column grids now use `minmax(0, 1fr)` so swipeable chip rows can't widen the page.
  - Fixed the Farm & More feature tile overflowing at 641–700 px: it had `aspect-ratio` plus `min-height`; its height now scales with the screen.
  - Larger tap targets on phones.
