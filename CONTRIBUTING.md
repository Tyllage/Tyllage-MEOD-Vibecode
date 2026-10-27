# Contributing

> **Tyllage does not accept outside contributions.**
> This repository is proprietary and is maintained only by the Tyllage team. Pull requests, patches, issues and feature work from anyone outside the team will be closed without review. Forking or copying this repository does not give you any right to use, run, modify or redistribute the code. See [LICENSE](LICENSE).

If you are not a member of the Tyllage team:

- **Found a security problem?** Report it privately as described in [SECURITY.md](SECURITY.md). Do not open a public issue.
- **Interested in licensing, a pilot or a partnership?** Contact the team through the [Tyllage GitHub organisation](https://github.com/Tyllage).

The rest of this guide is for **Tyllage team members** only, working on the Tyllage × Tyllage prototype. This is a vibecoding project: move fast, but keep it tidy and keep it safe.

## Ownership of your work

All work you do on this repository belongs to Tyllage LLP and is covered by the [Tyllage Proprietary License](LICENSE). Don't commit code, images or text you don't have the right to give to Tyllage, and don't copy code from other projects unless its licence allows it and the team has agreed. Note any third-party code and its licence in the pull request.

Do not copy Tyllage code into personal projects, other repositories or public places (gists, forums, AI chat tools that keep your data) without approval.

## Getting started

```bash
git clone https://github.com/Tyllage/Tyllage-Vibecode.git
cd Tyllage-Vibecode
py -m http.server 5173
```

Then open http://localhost:5173. There's no build step and no `npm install`. If a change doesn't show up, hard refresh (**Ctrl + Shift + R**), because browsers cache the JS and CSS.

To start with fresh data, use **Portal → (admin) Settings → Reset demo data**, or clear the site's storage.

## Branches and commits

- Branch from `main`: `feat/campaign-scheduling`, `fix/cart-total`, `docs/readme`.
- Keep commits small, with an imperative subject: `Add leader CSV export`.
- Open a pull request into `main`. At least one teammate reviews it before merge.

## Code conventions

- **Plain HTML, CSS and JavaScript.** No frameworks or bundlers unless the team agrees.
- JS files are self-contained IIFEs that hang off `window.MEOD`. Public pages load `data.js → assist.js → main.js` (plus `visit.js` on `visit.html`). The portal app (`dashboard.html`) loads `data.js → assist.js → auth.js → grade.js → recipes.js → content.js → replies.js → portal.js`.
- **Never put data into `innerHTML`.** In the portal, use the `h()` helper, which sets `textContent`. Only fixed icon or illustration markup written in the code (`ICONS`, `CATEGORY_ART`) may use `innerHTML`.
- Never set `position` on an open `<dialog>` (for example `position: relative` to place a close button). A modal dialog must stay `position: fixed`. Otherwise it renders at the top of the page, and opening it scrolls the page up.
- Don't use `<section>` for floating or nested UI (chat panels, dialogs, settings groups) on the public site. Every `section` gets large page padding there. Use `<div>` instead.
- Delivery tracking goes through `trackingFor(order)` in `js/data.js`. Keep screens reading from it, not from order fields directly, so the real provider can be swapped in later.
- Need to add demo records to existing browsers? Add a step to `migrate()` in `js/data.js` instead of bumping the storage version, which would wipe everyone's demo data.
- Money is **integer cents**. Format it only with `MEOD.money()`.
- Business rules (rates, thresholds, hours) live in `RULES` in `js/data.js`. Don't hard-code them elsewhere. If admins should be able to tune one, add it to the editable AI settings so Settings shows what uses it.
- **AI features:** mark them with `aiPill()` / `aiTitle()` so every one carries the same *AI-assisted* pill. Show how a suggestion was worked out (a "Why?" panel or a "How I worked this out" line), say so when the data can't answer, and log decisions to the AI decision ledger. AI may draft or suggest; a person approves.
- Don't repeat the page title as a panel heading. `panel()` drops a plain-string heading that matches the title, but an `aiTitle()` heading needs its own name.
- In a row of cards, give the action buttons one fixed width with `white-space: nowrap` (see `.adv-list` and `.ld-brief` in `portal.css`) so the pills line up.
- New portal screens go in `NAV` in `js/portal.js` under the right sidebar group, with a `perm` that is also added to the roles in `js/auth.js`.
- In CSS grids, use `minmax(0, 1fr)` (not `1fr`) for columns that hold scrolling rows or long text, and don't combine `aspect-ratio` with `min-height`. Both can push a page wider than the screen.
- Use the CSS tokens in `:root` (`--forest`, `--gold`, `--berry`, `--stony`). Don't add new colours.
- The public pages share one header and footer. If you change the nav, change it in **every** HTML page.

## Data rules

- **Synthetic data only.** Use fake names, the `+65 8000 00xx` range and `.test` emails.
- Never paste real Tyllage customer, order or WhatsApp data into the repo, issues, screenshots or AI tools.

## Before you open a PR

- [ ] Pages load with no console errors
- [ ] Checked at 375 px wide (no horizontal scroll), tablet (768 px) and desktop
- [ ] Tried each affected role (admin, staff, leader, customer)
- [ ] New AI features carry the AI-assisted pill and show how they reached their answer
- [ ] Keyboard works: Tab through, Enter / Esc on dialogs and the chat
- [ ] Hard-refreshed so you are testing the latest JS and CSS
- [ ] Updated `README.md` / `audit.md` if behaviour or scope changed

## Reporting bugs and ideas

Team members: open an issue with steps to reproduce, the expected vs actual result, browser, and a screenshot. For security issues, follow [SECURITY.md](SECURITY.md) instead. Outside the team, the only reports we accept are security reports through [SECURITY.md](SECURITY.md).

By contributing you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md) and confirm that your work belongs to Tyllage LLP under the [Tyllage Proprietary License](LICENSE).
