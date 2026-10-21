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
| **SalesDesk**: stock snapshots with source and last sync | Portal → Stock (`portal.js › inventoryView`) | ✅ Mock |
| SalesDesk: searchable order history | Portal → Orders (status filter) | ✅ Filter only, no free-text search |
| SalesDesk: escalation inbox | Portal → Inbox (tickets + farm bookings) | ✅ |
| SalesDesk: promo approvals | Campaign Studio approve/reject | ✅ |
| SalesDesk: group-buy settlement report | Portal → Group buys → Commission ledger | ✅ |
| **Sync**: Shopify products, stock and orders, idempotent webhooks | "Run Shopify sync (mock)" button | ⚠️ Simulated; no API calls |
| **Assist**: language detect, intent classify, backend lookups, human handover | `js/assist.js`, chat widget, portal Ask MEOD | ✅ Rule-based; EN/中文/BM; Tamil falls back to English |
| Assist: no invented availability; stale → "cannot confirm" | `stockStatus()` fail-closed | ✅ |
| Assist: verify identity before giving order details | Guests are told to sign in; signed-in customers get their own order | ✅ Demo-level |
| **Recommend**: in-stock only, explains why, opt-out respected | `recommendFor()` | ✅ |
| **Campaign Studio**: product-first audience, consented cohort, preview, approval | Campaign Studio | ✅ Four-eyes approval; consent re-checked at send time |
| **GroupBuy**: leader code/link, discount captured, gross/net basis, refund handling | Group buys, leader portal, customer join | ✅ |
| Growth Insights dashboards | SalesDesk KPI tiles | ⚠️ Basic KPIs only; no conversion or repeat-purchase charts |
| Roles: admin / staff / leader / customer / AI | `auth.js` permission matrix | ✅ Client-side only (see 3.1) |
| Leader sees masked member PII | Leader → Group orders | ✅ |
| Staff sees pseudonymous / masked customers | Orders and Customers views | ✅ Admin sees full details |
| Audit log of actor, event, object, timestamp | Portal → Audit log | ✅ Not tamper-proof |
| Consent flag + timestamp | Customer → Preferences | ✅ |
| Synthetic fixtures; no real phone numbers | `js/data.js` uses the +65 8000 00xx range and `.test` emails | ✅ |
| Public site stays the storefront (no second checkout) | "Place order" creates a *pending payment* order; copy says payment goes through Shopify | ✅ |

## 2. Public site vs meod.com.sg

| Kept | Changed / added |
|---|---|
| Palette, hero "More Than A Farm", stats, What We Do, Promise, Growing, Get our greens, Visit | **Portal** button in nav, **harvest strip** with stock, **group buy** band, **Ask MEOD** widget |
| Page set: About, Produce, Experiences, Contact | Produce filter chips and stock badges; booking form with validation that saves to the staff inbox |
| Copy themes and facts (6 ha, since 2014, 13 Neo Tiew Harvest Lane) | Copy shortened and reworded; footer Portal column |

**Fonts.** MEOD uses *Befalow* and *TT Commons*, which are licensed fonts. The prototype substitutes Google Fonts *Caveat Brush* and *Figtree*. Swap them in once MEOD provides font licences.

**Images.** MEOD-supplied originals are in `assets/`. The site uses optimised WebP copies in `assets/img/` (6.8 MB down to about 1.5 MB). Large photos have a smaller version for phones, chosen with `srcset`. The MEOD logo (`assets/meod-light.svg`) replaces the text wordmark, and the round logo is the favicon. Nothing loads from meod.com.sg any more.

## 3. Security & privacy findings

| # | Finding | Severity | Action before real data |
|---|---|---|---|
| 3.1 | Sign-in, roles and permissions run in the browser. Anyone can edit `sessionStorage` and act as admin. | **Critical (by design for demo)** | Server-side auth (hashed passwords, httpOnly secure cookies), server-side RBAC on every request |
| 3.2 | All data lives in `localStorage`, per browser, and is readable by anyone using that device | High | PostgreSQL behind an API; no PII on the client beyond the current user |
| 3.3 | Demo password is in source | Low (demo only) | Remove the demo accounts; seed from env-only secrets |
| 3.4 | No Content-Security-Policy or security headers | Medium | Add CSP, HSTS, `X-Content-Type-Options` and `Referrer-Policy` at the host or server |
| 3.5 | Fonts and the map come from third-party origins (Google Fonts, Google Maps embed). Images are now self-hosted. | Low | Self-host fonts; review the Maps embed's privacy notice |
| 3.6 | Audit log can be edited client-side | Medium | Append-only, server-side log |
| 3.7 | Ticket summaries redact numbers of 4+ digits only | Low | Proper PII redaction before storing or sending to an LLM |
| ✅ | All dynamic portal content is rendered with `textContent` (the `h()` helper). No user data goes through `innerHTML`. | — | Keep this rule (see CONTRIBUTING) |
| ✅ | Booking form validates on the client | — | Validate again on the server |

## 4. Accessibility spot-check

- ✅ Skip link, landmark elements, `aria-current` on nav, labelled form fields, `aria-live` chat log, Esc closes the chat
- ✅ `prefers-reduced-motion` disables reveal animations
- ✅ No horizontal scroll at 375 px on any public page or the portal shop
- ✅ Portal tables turn into labelled cards under 640 px; the shop and product grids use two columns on phones
- ✅ Checked at 320, 375, 768, 1024 and 1440 px across all public pages, and at 375 px for every portal view of every role
- ⚠️ Colour contrast not formally measured; gold on white is used only for buttons with dark text

## 5. Verification performed (21 Oct 2026)

Run manually in the browser against `py -m http.server`:

- Every portal view renders for admin with no console errors.
- Leader and customer are redirected away from admin-only routes such as `#users`.
- Commission ledger matches hand calculation (seed total S$4.16). Marking #MF5007 paid accrues S$0.78 (S$15.58 × 5%).
- Admin cannot approve a campaign they created.
- Customer flow:
  1. Invite code is pre-filled from the link.
  2. Join succeeds.
  3. Cart totals are correct: S$25.00 − S$1.25 + S$8.00 = S$31.75.
  4. Stale product (Mizuna) can't be added.
  5. The order is created as pending payment.
  6. Ask MEOD returns that order.
- Public chat: the complaint "My veg arrived wilted" creates a ticket that appears in the staff inbox.
- Booking form: empty submit shows all four errors; a valid submit stores the booking and shows a reference.

No automated test suite yet. That's a follow-up.

## 6. Open questions for MEOD (from proposal §9)

1. Shopify store ownership and API scopes (read-only first?)
2. Meaning of "Microsoft Narvation": Dynamics NAV / Navision?
3. Real commission basis, rate, and refund / partial-fulfilment rules
4. What leaders may see about members, and the consent wording that covers it
5. Official WhatsApp Cloud API number and template approval owner
6. Human support hours to state in the bot
7. Brand assets (fonts, logo SVG, photos) and permission to reuse them
8. Who delivers: in-house drivers, a courier (e.g. Ninja Van, Lalamove) or Shopify fulfilment? This decides the real source behind the mock delivery tracking (`trackingFor()` in `js/data.js`).

## 7. Changelog

- **21 Oct 2026, images & responsive pass.** Switched to MEOD-supplied images (optimised WebP with phone-size versions). Added a Farm & More showcase (gelato, pesto, crackers, vege powder) and a Goodness Gracious Gelato flavour strip. Added product photos to the catalogue and the portal shop. Mobile card tables, a full-width chat panel on phones, svh hero heights and a tablet three-column grid. Demo storage key bumped to v2, so the new catalogue loads.
