# Security Policy

## Status

This repository is a **prototype**. It is a static site whose sign-in, roles and data all run in the visitor's browser. It is **not secure and must not hold real customer, order or payment data.** All bundled data is synthetic.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Instead:

- use GitHub's **private vulnerability reporting** on this repository, or
- message the Tyllage project lead directly.

Include:

- what you found
- steps to reproduce
- the impact you expect

We aim to acknowledge reports within **3 working days**. If MEOD data or systems could be affected, MEOD will be told as well.

If you think real customer data has leaked, follow the Deployment Plan §10:

1. Disable the affected integration.
2. Rotate secrets.
3. Inform MEOD so they can run their response procedure.

## Supported versions

Only the latest commit on `main` is maintained.

## Known limitations (by design for the prototype)

| Area | Prototype | Required before a live pilot |
|---|---|---|
| Authentication | Client-side demo accounts, shared demo password | Server-side auth, hashed passwords, httpOnly `Secure` `SameSite` cookies, rate-limited login, MFA for admin |
| Authorisation | Permission matrix in `js/auth.js` | Enforced on the server for every request; least-privilege roles |
| Data storage | `localStorage` in the browser, including customer profile photos, addresses and phone numbers | PostgreSQL with restricted network access, encrypted backups, retention policy; photos in private object storage |
| File uploads | Profile photo checked and re-encoded in the browser only | Server-side type sniffing, size limits, re-encoding, malware scanning |
| Hosting | Public static site on GitHub Pages | Static front end on Pages is fine; the backend (API, database, webhooks) runs on a separate server host |
| Secrets | None used | Kept only in the backend host's environment variables; never in git, the front end, or chat (see list below) |
| Headers | GitHub Pages defaults (custom response headers aren't supported) | CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors` |
| Audit | Editable client log | Append-only server log |
| AI | Rule-based mock | OpenAI project key with spend limits; send minimum fields; redact PII; AI never writes to the DB or changes prices |
| WhatsApp | Mock | Verified webhook signatures, dedupe, consent and template checks, opt-out handling |
| Delivery tracking | Simulated by `trackingFor()` in `js/data.js` | Shopify fulfilment or courier / driver-app webhooks with signature checks; show customers only their own orders; never expose drivers' personal numbers |

## Secrets for the production build (from the Deployment Plan)

Set these as environment variables on the **backend** host, never in the repo. GitHub Pages only serves public static files, so it must never hold any of them:

- `DATABASE_URL`
- `SHOPIFY_SHOP_DOMAIN`, `SHOPIFY_ACCESS_TOKEN`, `SHOPIFY_WEBHOOK_SECRET`
- `META_WABA_ID`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`
- `OPENAI_API_KEY`, `OPENAI_MODEL`
- `JWT_SECRET`, `SESSION_SECRET`
- `PUBLIC_SITE_URL`, `CORS_ORIGIN`
- Delivery provider credentials, if MEOD uses a courier or driver app (for example `DELIVERY_API_KEY`, `DELIVERY_WEBHOOK_SECRET`)

## Rules for contributors

- Never commit real names, phone numbers, addresses, emails or order data. Use the `+65 8000 00xx` range and `.test` emails.
- Render user or data content with `textContent`. Only fixed icon or illustration markup written in the code may go through `innerHTML`.
- Don't add third-party scripts without a review.
