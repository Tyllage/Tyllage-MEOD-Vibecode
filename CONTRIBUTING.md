# Contributing

Thanks for helping build the Tyllage × MEOD Farm prototype. This is a vibecoding project: move fast, but keep it tidy and keep it safe.

## Getting started

```bash
git clone <repo-url>
cd Tyllage-Vibecode
py -m http.server 5173
```

Then open http://localhost:5173. There's no build step and no `npm install`.

To start with fresh data, use **Portal → (admin) Settings → Reset demo data**, or clear the site's storage.

## Branches and commits

- Branch from `main`: `feat/campaign-scheduling`, `fix/cart-total`, `docs/readme`.
- Keep commits small, with an imperative subject: `Add leader CSV export`.
- Open a pull request into `main`. At least one teammate reviews it before merge.

## Code conventions

- **Plain HTML, CSS and JavaScript.** No frameworks or bundlers unless the team agrees.
- JS files are self-contained IIFEs that hang off `window.MEOD`. Load order is `data.js` → `assist.js` → `auth.js` / `main.js` → `portal.js`.
- **Never put data into `innerHTML`.** In the portal, use the `h()` helper, which sets `textContent`.
- Money is **integer cents**. Format it only with `MEOD.money()`.
- Business rules (rates, thresholds, hours) live in `RULES` in `js/data.js`. Don't hard-code them elsewhere.
- Use the CSS tokens in `:root` (`--forest`, `--gold`, `--berry`, `--stony`). Don't add new colours.
- The public pages share one header and footer. If you change the nav, change it in **every** HTML page.

## Data rules

- **Synthetic data only.** Use fake names, the `+65 8000 00xx` range and `.test` emails.
- Never paste real MEOD customer, order or WhatsApp data into the repo, issues, screenshots or AI tools.

## Before you open a PR

- [ ] Pages load with no console errors
- [ ] Checked at 375 px wide (no horizontal scroll) and on desktop
- [ ] Tried each affected role (admin, staff, leader, customer)
- [ ] Keyboard works: Tab through, Enter / Esc on dialogs
- [ ] Updated `README.md` / `audit.md` if behaviour or scope changed

## Reporting bugs and ideas

Open an issue with steps to reproduce, the expected vs actual result, browser, and a screenshot. For security issues, follow [SECURITY.md](SECURITY.md) instead.

By contributing you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).
