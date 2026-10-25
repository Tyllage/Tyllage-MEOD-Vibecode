/* MEOD Portal — role-based dashboards (Tyllage SalesDesk, GroupBuy,
 * Campaign Studio, customer self-service). Depends on data.js, assist.js
 * and auth.js. All rendering goes through h(), which sets text with
 * textContent, so demo data can never inject HTML. */
(function () {
  'use strict';
  var M = window.MEOD;
  var session = M.auth.current();
  if (!session) { location.replace('portal.html'); return; }

  /* ---------------- helpers ---------------- */
  function h(tag, props) {
    var node = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), v);
      else if (k === 'value') node.value = v;
      else node.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  }
  function append(node) {
    for (var i = 1; i < arguments.length; i++) {
      var child = arguments[i];
      if (child == null || child === false) continue;
      if (Array.isArray(child)) { child.forEach(function (c) { append(node, c); }); continue; }
      node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
    }
  }
  function $(sel) { return document.querySelector(sel); }
  var money = M.money;
  function ago(iso) {
    var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    if (m < 1440) return Math.round(m / 60) + ' h ago';
    return Math.round(m / 1440) + ' d ago';
  }
  function date(iso) { return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }); }
  // No-year date, for the Buy to Clear feature (listings, bag days — never more than a few weeks out).
  function shortDate(iso) { return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }); }
  function shortWeekday(iso) { return new Date(iso).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' }); }
  function badge(text, tone) { return h('span', { class: 'badge b-' + tone, text: String(text).replace(/_/g, ' ') }); }
  var STATUS_TONE = {
    pending_payment: 'amber', paid: 'blue', fulfilled: 'green', refunded: 'red', cancelled: 'grey',
    open: 'amber', resolved: 'green', new: 'amber', confirmed: 'green', declined: 'grey', closed: 'grey',
    draft: 'grey', pending_approval: 'amber', approved: 'blue', sent: 'green', rejected: 'red', posted: 'green',
    accrued: 'green', pending: 'amber', reversed: 'red', void: 'grey', active: 'green', ended: 'grey',
    planned: 'grey', growing: 'blue', due: 'amber', harvested: 'green'
  };
  function statusBadge(s) { return badge(s, STATUS_TONE[s] || 'grey'); }
  function stockBadge(p) {
    var s = M.stockStatus(p);
    return badge(s.label, { ok: 'green', low: 'amber', out: 'red', stale: 'grey' }[s.key]);
  }

  // Every table pages itself once it passes 10 rows: a search box over what's in the rows,
  // "Showing 1–10 of 45", page numbers and a rows-per-page choice. Page and search survive a
  // redraw of the same table (keyed by page title + columns). opts.paginate = false opts out
  // (for tables that page themselves).
  var tableState = {};
  var PAGE_SIZES = [10, 25, 50, 100];
  function plainTable(columns, rows) {
    return h('div', { class: 'table-wrap' },
      h('table', null,
        h('thead', null, h('tr', null, columns.map(function (c) { return h('th', { class: c.num ? 'num' : null, scope: 'col', text: c.label }); }))),
        h('tbody', null, rows.map(function (r) {
          return h('tr', null, columns.map(function (c) { return h('td', { class: c.num ? 'num' : null, 'data-label': c.label }, c.render(r)); }));
        }))));
  }
  function table(columns, rows, emptyText, opts) {
    opts = opts || {};
    if (!rows.length) return h('p', { class: 'empty', text: emptyText || 'Nothing here yet.' });
    if (opts.paginate === false || rows.length <= PAGE_SIZES[0]) return plainTable(columns, rows);
    var key = currentTitle + '|' + columns.map(function (c) { return c.label; }).join('|');
    var st = tableState[key] || (tableState[key] = { page: 0, size: PAGE_SIZES[0], q: '' });
    var texts = [];
    // Searchable text of a row = the data its cells show (not button or menu labels), worked
    // out only when someone searches.
    function rowText(i) {
      if (texts[i] == null) {
        var tr = h('tr', null, columns.map(function (c) { return h('td', null, c.render(rows[i])); }));
        tr.querySelectorAll('button, select, input, textarea').forEach(function (el) { el.remove(); });
        texts[i] = tr.textContent.toLowerCase();
      }
      return texts[i];
    }
    var body = h('div', { class: 'tbl-body' }), pager = h('nav', { class: 'tbl-pager', 'aria-label': 'Table pages' }), info = h('small', { class: 'tbl-info', 'aria-live': 'polite' });
    var search = h('input', { type: 'search', class: 'tbl-search', placeholder: 'Search ' + rows.length + ' rows', value: st.q, 'aria-label': 'Search this table' });
    var size = h('select', { class: 'tbl-size', 'aria-label': 'Rows per page' }, PAGE_SIZES.map(function (n) { return h('option', { value: String(n), text: n + ' per page' }); }));
    size.value = String(st.size);
    var block = h('div', { class: 'tbl-block' }, h('div', { class: 'tbl-tools' }, search, size), body, h('div', { class: 'tbl-foot' }, info, pager));
    function go(p) {
      st.page = p; draw();
      var top = block.getBoundingClientRect().top;
      if (top < 0) window.scrollBy({ top: top - 80, behavior: 'smooth' });
    }
    function draw() {
      var q = st.q.trim().toLowerCase(), idx = [];
      for (var i = 0; i < rows.length; i++) if (!q || rowText(i).indexOf(q) > -1) idx.push(i);
      var pages = Math.max(1, Math.ceil(idx.length / st.size));
      if (st.page >= pages) st.page = pages - 1;
      var from = st.page * st.size, slice = idx.slice(from, from + st.size).map(function (i) { return rows[i]; });
      body.textContent = '';
      append(body, slice.length ? plainTable(columns, slice) : h('p', { class: 'empty', text: 'Nothing matches "' + st.q + '".' }));
      info.textContent = idx.length ? 'Showing ' + (from + 1) + '–' + (from + slice.length) + ' of ' + idx.length + (q ? ' (filtered from ' + rows.length + ')' : '') : '';
      pager.textContent = '';
      if (pages <= 1) return;
      var btn = function (label, p, o) {
        o = o || {};
        return h('button', { type: 'button', class: 'pg' + (o.current ? ' on' : ''), disabled: o.disabled, 'aria-current': o.current ? 'page' : null, 'aria-label': o.aria || 'Page ' + (p + 1), text: label, onclick: function () { go(p); } });
      };
      append(pager, btn('‹', st.page - 1, { disabled: st.page === 0, aria: 'Previous page' }));
      // 1 … 4 5 6 … 12: first, last, and the pages around the current one.
      var shown = [0, pages - 1, st.page - 1, st.page, st.page + 1].filter(function (p, k, a) { return p >= 0 && p < pages && a.indexOf(p) === k; }).sort(function (a, b) { return a - b; });
      shown.forEach(function (p, k) {
        if (k && p - shown[k - 1] > 1) append(pager, h('span', { class: 'pg-gap', text: '…' }));
        append(pager, btn(String(p + 1), p, { current: p === st.page }));
      });
      append(pager, btn('›', st.page + 1, { disabled: st.page >= pages - 1, aria: 'Next page' }));
    }
    // A page that already has its own search box (Customers, Users, Audit log) keeps just
    // that one: see .panel:has(.user-search) .tbl-search in portal.css.
    var timer;
    search.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { st.q = search.value; st.page = 0; draw(); }, 150); });
    size.addEventListener('change', function () { st.size = Number(size.value); st.page = 0; draw(); });
    draw();
    return block;
  }
  function kpi(label, value, note) { return h('div', { class: 'kpi' }, h('span', { text: label }), h('strong', { text: value }), note ? h('small', { text: note }) : null); }
  // One look for every AI-assisted feature (insights, drafts, suggestions, AI search, grading):
  // a blue "AI-assisted" pill beside its heading. aiTitle() builds that heading for panel().
  function aiPill() { return h('span', { class: 'badge b-blue ai-pill', text: 'AI-assisted', title: 'In this prototype: explainable rules, calculations and editable templates. No trained model, and no data is sent to an AI service.' }); }
  function aiTitle(text, tag) { return h('div', { class: 'rw-head' }, h(tag || 'h2', { text: text }), aiPill()); }
  var currentTitle = '';
  function panel(title, hint) {
    var rest = Array.prototype.slice.call(arguments, 2);
    // Skip the heading when it would just repeat the page title above it.
    if (typeof title === 'string' && title.toLowerCase() === currentTitle.toLowerCase()) title = null;
    var head = !title ? null : typeof title === 'string' ? h('h2', { text: title }) : title;
    return h('section', { class: 'panel' }, head, hint ? h('p', { class: 'hint', text: hint }) : null, rest);
  }
  function mini(label, onclick, opts) {
    opts = opts || {};
    return h('button', { class: 'mini' + (opts.danger ? ' danger' : ''), type: 'button', onclick: onclick, disabled: opts.disabled, title: opts.title, text: label });
  }

  var toastTimer;
  function toast(msg) {
    var t = $('[data-toast]');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }
  function commit(event, target, msg) {
    // Every new draft saves what Tyllage expects of it, to compare with the results later.
    if (event === 'campaign.submitted') M.state.campaigns.forEach(function (c) { if (c.status === 'pending_approval' && !c.assumed) M.promo.assume(c); });
    M.audit(session.email, event, target);
    M.save();
    if (msg) toast(msg);
    render();
  }

  var S = function () { return M.state; };
  function customer(id) { return M.byId('customers', id); }
  function customerLabel(id) {
    var c = customer(id);
    if (!c) return '—';
    return M.auth.can(session, 'customers.pii') ? c.name + ' (' + c.id + ')' : M.maskName(c.name) + ' (' + c.id + ')';
  }
  function eventFor(order) { return order.groupEventId ? M.byId('events', order.groupEventId) : null; }
  function itemsSummary(o) { return o.items.map(function (i) { return i.qty + '× ' + i.title; }).join(', '); }

  /* ---------------- staff / admin views ---------------- */
  // Every role's Overview starts the same way: a greeting band with today's one-line summary
  // and the main next steps, then a row of KPI tiles, then that role's own content.
  function greeting() { var hr = new Date().getHours(); return hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'; }
  function overviewBand(o) {
    return h('section', { class: 'ov-band' },
      h('div', { class: 'ov-text' },
        h('span', { class: 'rnd-eyebrow', text: new Date().toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long' }) + ' · ' + o.eyebrow }),
        h('h2', { text: greeting() + (o.name ? ', ' + o.name : '') + ' 🌱' }),
        h('p', { text: o.summary })),
      h('div', { class: 'ov-actions' }, o.actions.map(function (a, i) {
        return h('a', { class: 'btn ' + (i ? 'btn-ghost' : 'btn-gold'), href: a.href, text: a.label });
      })));
  }
  function sessionFirstName() { return String(session.name || '').replace(/\s*\(demo\)/i, '').split(' ')[0]; }

  function staffOverview(root) {
    var weekAgo = Date.now() - 7 * 864e5;
    var recent = S().orders.filter(function (o) { return new Date(o.createdAt) > weekAgo && o.status !== 'cancelled'; });
    var revenue = recent.reduce(function (s, o) { return s + o.totalCents - (o.refundedCents || 0); }, 0);
    // Worst first: sold out, then can't confirm, then low.
    var SEVERITY = { out: 0, stale: 1, low: 2 };
    var alerts = S().products.filter(function (p) { return M.stockStatus(p).key !== 'ok'; })
      .sort(function (a, b) { return SEVERITY[M.stockStatus(a).key] - SEVERITY[M.stockStatus(b).key]; });
    var LIMIT = 5;
    var openTickets = S().tickets.filter(function (t) { return t.status === 'open'; });
    var newBookings = S().bookings.filter(function (b) { return b.status === 'new'; });
    var payable = M.ledger().reduce(function (s, e) { return s + e.payableCents; }, 0);

    // The weekly AI briefing's top priority leads the day.
    var pr = M.auth.can(session, 'radar') ? briefingPriorities() : [];
    append(root, overviewBand({ eyebrow: session.role === 'admin' ? 'Admin' : 'Sales staff',
      summary: pr.length ? pr.length + ' priorities this week. Top: ' + pr[0].title + '.' : 'Nothing urgent this week.',
      actions: [{ label: 'Open the weekly briefing', href: '#briefing' }, { label: 'Ask Tyllage', href: '#copilot' }] }));

    append(root, h('div', { class: 'kpis' },
      kpi('Orders · 7 days', String(recent.length), money(revenue) + ' net of refunds'),
      kpi('Open tickets', String(openTickets.length), 'Human handover queue'),
      kpi('New bookings', String(newBookings.length), 'Farm tours & workshops'),
      kpi('Stock alerts', String(alerts.length), 'Low, sold out or stale · ' + money(payable) + ' commission owed')));

    append(root, h('div', { class: 'two-col' },
      panel('Needs a human', 'Complaints, refunds, payment and food-safety chats go here. The bot stops handling them.',
        table([
          { label: 'Ticket', render: function (t) { return t.id; } },
          { label: 'Type', render: function (t) { return statusBadge(t.intent); } },
          { label: 'Summary', render: function (t) { return t.summary; } },
          { label: 'Age', render: function (t) { return ago(t.createdAt); } }
        ], openTickets.slice(0, LIMIT), 'No open tickets 🎉'),
        h('div', { class: 'panel-foot' }, h('a', { class: 'pill-btn', href: '#inbox', text: openTickets.length > LIMIT ? 'View all ' + openTickets.length + ' in inbox →' : 'Open inbox →' }))),
      panel('Stock alerts', 'Stale syncs are shown as unknown, never as available.',
        table([
          { label: 'Product', render: function (p) { return p.title; } },
          { label: 'Status', render: stockBadge },
          { label: 'Last sync', render: function (p) { return ago(p.stock.updatedAt); } }
        ], alerts.slice(0, LIMIT), 'All stock is fresh.'),
        h('div', { class: 'panel-foot' }, h('a', { class: 'pill-btn', href: '#inventory', text: alerts.length > LIMIT ? 'View all ' + alerts.length + ' alerts →' : 'View stock →' })))));
  }

  function inventoryView(root) {
    var filter = inventoryView.filter || 'all';
    var sel = h('select', { 'aria-label': 'Category', onchange: function (e) { inventoryView.filter = e.target.value; render(); } },
      h('option', { value: 'all', text: 'All categories' }),
      Object.keys(M.CATEGORIES).map(function (k) { return h('option', { value: k, text: M.CATEGORIES[k].label, selected: filter === k }); }));
    var rows = S().products.filter(function (p) { return filter === 'all' || p.category === filter; });
    append(root, panel(null, 'Shopify is the master for products, prices and stock. This view is read-only; run a sync to refresh it.',
      h('div', { class: 'toolbar', style: 'margin-bottom:14px' }, sel,
        h('button', { class: 'btn btn-sm btn-forest', type: 'button', text: '↻ Run Shopify sync (mock)', onclick: function () {
          S().products.forEach(function (p) { p.stock.syncStatus = 'ok'; p.stock.updatedAt = new Date().toISOString(); });
          commit('inventory.synced', 'all', 'Stock synced from Shopify (mock).');
        } })),
      table([
        { label: 'Product', render: function (p) { return h('span', null, h('strong', { text: p.title }), h('br'), h('small', { text: p.subtitle })); } },
        { label: 'Category', render: function (p) { return M.CATEGORIES[p.category].label; } },
        { label: 'Type', render: function (p) { return p.category === 'farm-more' ? 'Made by MEOD' : 'Fresh harvest'; } },
        { label: 'Price', num: true, render: function (p) { return money(p.priceCents); } },
        { label: 'Qty', num: true, render: function (p) { return M.stockStatus(p).known ? String(p.stock.qty) : '—'; } },
        // Part of Qty that is listed on Buy to Clear: units left at the clearance price, plus
        // the price and end date. Links to the Buy to Clear page where it can be ended early.
        { label: 'On clearance', num: true, render: function (p) {
          var listing = S().clearance.filter(function (l) { return l.productId === p.id && M.clearance.isOpen(l); })[0];
          if (!listing) return h('span', { class: 'muted-dash', text: '—' });
          return h('a', { class: 'clear-cell', href: '#clearance', title: 'Open this listing in Buy to Clear' },
            h('strong', { text: String(M.clearance.remaining(listing)) }),
            h('small', { text: money(listing.clearancePriceCents) + ' · until ' + shortDate(listing.availableUntil) }));
        } },
        { label: 'Status', render: stockBadge },
        { label: 'Last synced', render: function (p) { return ago(p.stock.updatedAt); } }
      ], rows),
      h('p', { class: 'hint', style: 'margin-top:14px', text: 'Approving a Surprise Harvest Bag’s contents reserves stock here too — in production this would update Shopify.' })));
  }

  var TRANSITIONS = { pending_payment: ['paid', 'cancelled'], paid: ['fulfilled', 'refunded'], fulfilled: ['refunded'] };
  function setOrderStatus(o, next) {
    if ((TRANSITIONS[o.status] || []).indexOf(next) === -1) return;
    if (next === 'refunded' && !confirm('Refund ' + o.ref + ' (' + money(o.netCents) + ' merchandise)? Any group commission will be reversed.')) return;
    if (next === 'cancelled') {
      // Pre-order lines never took stock (their spot frees itself once the order is cancelled).
      o.items.forEach(function (i) { var p = M.byId('products', i.productId); if (p && !i.preorderBatchId) p.stock.qty += i.qty; });
    }
    if (next === 'refunded') o.refundedCents = o.netCents;
    o.status = next;
    commit('order.' + next, o.ref, o.ref + ' marked ' + next.replace('_', ' ') + '.');
  }

  function ordersView(root) {
    var filter = ordersView.filter || 'all';
    var statuses = ['all', 'pending_payment', 'paid', 'fulfilled', 'refunded', 'cancelled'];
    var rows = S().orders.slice().reverse().filter(function (o) { return filter === 'all' || o.status === filter; });
    append(root, panel('Orders', M.auth.can(session, 'customers.pii')
      ? 'Admin view: full customer names are shown because you have a fulfilment reason to see them.'
      : 'Sales view: names are masked. Pseudonymous IDs are enough to follow up.',
      h('div', { class: 'toolbar', style: 'margin-bottom:14px' },
        h('select', { 'aria-label': 'Status', onchange: function (e) { ordersView.filter = e.target.value; render(); } },
          statuses.map(function (s) { return h('option', { value: s, text: s === 'all' ? 'All statuses' : s.replace('_', ' '), selected: s === filter }); }))),
      table([
        { label: 'Order', render: function (o) { return h('span', null, h('strong', { text: o.ref }), h('br'), h('small', { text: date(o.createdAt) })); } },
        { label: 'Customer', render: function (o) { return customerLabel(o.customerId); } },
        { label: 'Items', render: itemsSummary },
        { label: 'Group', render: function (o) { var e = eventFor(o); return e ? h('span', { class: 'code-box', text: e.code }) : '—'; } },
        { label: 'Total', num: true, render: function (o) { return money(o.totalCents); } },
        { label: 'Status', render: function (o) { return statusBadge(o.status); } },
        { label: 'Actions', render: function (o) {
          var next = TRANSITIONS[o.status] || [];
          return next.length ? h('div', { class: 'actions' }, next.map(function (n) {
            return mini({ paid: 'Mark paid', fulfilled: 'Fulfil', refunded: 'Refund', cancelled: 'Cancel' }[n], function () { setOrderStatus(o, n); }, { danger: n === 'refunded' || n === 'cancelled' });
          })) : '—';
        } }
      ], rows, 'No orders with this status.')));
  }

  // Confirming any booking gives it a visitor farm-shop code (see M.visits in data.js).
  function confirmVisit(b) {
    var r = M.visits.confirm(b.id);
    if (!r.ok) { toast(r.error); return; }
    commit('booking.confirmed', b.id, b.id + ' confirmed (WhatsApp mock). Farm-shop code ' + r.event.code + ' is ready in Visits.');
  }

  /* ---- AI-drafted reply to a visit enquiry (js/replies.js). Staff edit, then Send. ----
   * Sending is simulated: the reply is logged on the booking and in the audit log. A
   * "Confirm" reply also confirms the booking and fills in the new farm-shop code. */
  var REPLY_KINDS = [['confirm', 'Confirm the visit'], ['details', 'Ask for more details'], ['alternative', 'Offer other dates']];
  var REPLY_LABEL = { confirm: 'Confirmed', details: 'Asked for details', alternative: 'Offered other dates' };
  function openReplyDialog(b) {
    document.querySelectorAll('.reply-dialog').forEach(function (d) { if (d.open) d.close(); d.remove(); });
    var full = b.status !== 'confirmed' && !M.visits.fits(b).fits;
    var kind = b.status === 'confirmed' ? 'details' : full ? 'alternative' : 'confirm', tone = 'warm', edited = false;
    var dlg = h('dialog', { class: 'receipt-dialog reply-dialog', 'aria-labelledby': 'rd-title' });
    function closeDialog() { if (dlg.open) dlg.close(); dlg.remove(); }
    var kindSel = h('select', { 'aria-label': 'Type of reply' }, REPLY_KINDS.map(function (k) {
      return h('option', { value: k[0], text: k[1], selected: k[0] === kind, disabled: k[0] === 'confirm' && b.status === 'confirmed' });
    }));
    var toneSel = h('select', { 'aria-label': 'Tone' }, h('option', { value: 'warm', text: 'Warm' }), h('option', { value: 'formal', text: 'Formal' }));
    var subject = h('input', { 'aria-label': 'Subject', maxlength: 140 });
    var body = h('textarea', { rows: 18, 'aria-label': 'Email body' });
    var notes = h('aside', { class: 'rd-notes', 'aria-label': 'What the AI picked up' });
    var tokenNote = h('small', { class: 'pf-hint' });
    var errorBox = h('p', { class: 'pf-error', 'aria-live': 'polite' });
    body.addEventListener('input', function () { edited = true; drawTokenNote(); });
    subject.addEventListener('input', function () { edited = true; });

    function drawNotes(info) {
      notes.textContent = '';
      append(notes,
        h('h3', { text: 'What the AI picked up' }),
        h('ul', { class: 'rd-facts' }, info.facts.map(function (f) { return h('li', { text: f }); })),
        info.flags.length ? [h('h3', { text: 'Check before sending' }), h('ul', { class: 'rd-flags' }, info.flags.map(function (f) { return h('li', { text: f }); }))] : null,
        b.message ? [h('h3', { text: 'Their message' }), h('blockquote', { text: b.message })] : null,
        h('small', { class: 'rd-disclaimer', text: 'Prototype: drafted by rules from the enquiry. The live version would use a language model. Always check before sending.' }));
    }
    function drawTokenNote() {
      tokenNote.textContent = body.value.indexOf(M.replies.CODE_TOKEN) > -1 ? M.replies.CODE_TOKEN + ' is filled in with the group\'s new code when you send.' : '';
    }
    function generate() {
      var d = M.replies.draft(b, { kind: kind, tone: tone });
      subject.value = d.subject;
      body.value = d.body;
      edited = false;
      drawNotes(d.info);
      drawTokenNote();
    }
    function regenerate() {
      if (edited && !confirm('Replace your edits with a fresh draft?')) { kindSel.value = kind; toneSel.value = tone; return; }
      kind = kindSel.value; tone = toneSel.value;
      generate();
    }
    kindSel.addEventListener('change', regenerate);
    toneSel.addEventListener('change', regenerate);

    function send() {
      if (!subject.value.trim() || !body.value.trim()) { errorBox.textContent = 'Add a subject and a message.'; return; }
      var text = body.value, msg;
      if (kind === 'confirm') {
        var r = M.visits.confirm(b.id);
        if (!r.ok) { errorBox.textContent = r.error; return; }
        text = text.split(M.replies.CODE_TOKEN).join(r.event.code + ' (' + visitShopUrl(r.event.code) + ')');
        msg = 'Reply sent to ' + b.email + ' (simulated) and ' + b.id + ' confirmed. Farm-shop code ' + r.event.code + ' is ready in Visits.';
      } else {
        msg = 'Reply sent to ' + b.email + ' (simulated).';
      }
      b.replies = b.replies || [];
      b.replies.push({ at: new Date().toISOString(), by: session.email, kind: kind, to: b.email, subject: subject.value.trim(), body: text });
      closeDialog();
      commit('booking.replied', b.id, msg);
    }

    append(dlg,
      h('button', { class: 'pd-close', type: 'button', 'aria-label': 'Close', onclick: closeDialog }, iconCircle(ICONS.x, 'bare')),
      h('div', { class: 'rd-body' },
        h('div', { class: 'rd-head' },
          h('h2', { id: 'rd-title', text: 'Reply to ' + (b.org || b.name) }),
          aiPill(), h('small', { class: 'ai-note', text: 'You review and send' })),
        h('div', { class: 'rd-layout' },
          notes,
          h('div', { class: 'rd-form' },
            h('div', { class: 'rd-controls' }, h('label', null, 'Reply type', kindSel), h('label', null, 'Tone', toneSel)),
            h('label', null, 'To', h('input', { value: b.email, readonly: true, 'aria-readonly': 'true' })),
            h('label', null, 'Subject', subject),
            h('label', null, 'Message', body),
            tokenNote,
            errorBox))),
      h('div', { class: 'r-actions' },
        h('button', { class: 'btn btn-sm btn-outline', type: 'button', text: 'Copy', onclick: function () {
          var all = 'Subject: ' + subject.value + '\n\n' + body.value;
          (navigator.clipboard ? navigator.clipboard.writeText(all) : Promise.reject()).then(function () { toast('Draft copied.'); }, function () { toast('Copy not available here — select the text instead.'); });
        } }),
        h('button', { class: 'btn btn-sm btn-outline', type: 'button', text: 'Cancel', onclick: closeDialog }),
        h('button', { class: 'btn btn-sm btn-forest', type: 'button', text: 'Send (simulated)', onclick: send })));

    dlg.addEventListener('close', function () { dlg.remove(); });
    document.body.appendChild(dlg);
    generate();
    dlg.showModal();
  }
  function lastReplyCell(b) {
    var rs = b.replies || [];
    var last = rs[rs.length - 1];
    return last ? h('span', null, REPLY_LABEL[last.kind] || 'Replied', h('br'), h('small', { text: ago(last.at) + ' · ' + last.by })) : h('small', { text: 'Not replied yet' });
  }

  function inboxView(root) {
    var tickets = S().tickets.slice().sort(function (a, b) { return (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1); });
    append(root, panel('Support tickets', 'Created when the assistant hands over. During human hours (Mon–Sat 9am–6pm) customers are told someone will reply soon; outside them, that the team is offline.',
      table([
        { label: 'Ticket', render: function (t) { return h('span', null, h('strong', { text: t.id }), h('br'), h('small', { text: t.channel + ' · ' + ago(t.createdAt) })); } },
        { label: 'Type', render: function (t) { return statusBadge(t.intent); } },
        { label: 'Summary (redacted)', render: function (t) { return t.summary; } },
        { label: 'Customer', render: function (t) { return t.customerId ? customerLabel(t.customerId) : 'Guest (web)'; } },
        { label: 'Assignee', render: function (t) { return t.assignee || '—'; } },
        { label: 'Status', render: function (t) { return statusBadge(t.status); } },
        { label: 'Actions', render: function (t) {
          if (t.status !== 'open') return '—';
          return h('div', { class: 'actions' },
            mini('Assign to me', function () { t.assignee = session.email; commit('ticket.assigned', t.id, t.id + ' assigned to you.'); }, { disabled: t.assignee === session.email }),
            mini('Resolve', function () { t.status = 'resolved'; commit('ticket.resolved', t.id, t.id + ' resolved.'); }));
        } }
      ], tickets, 'No tickets.')));

    append(root, panel(aiTitle('Farm visit bookings'), 'From the Experiences page. In production, confirming sends an approved WhatsApp template or an email.',
      table([
        { label: 'Ref', render: function (b) { return h('span', { class: 'nowrap' }, h('strong', { text: b.id }), h('br'), h('small', { text: ago(b.createdAt) })); } },
        { label: 'Contact', render: function (b) { return h('span', null, b.org ? h('strong', { text: b.org }) : null, b.org ? h('br') : null, b.name, h('br'), h('small', { text: b.email })); } },
        { label: 'Experience', render: function (b) { return b.experience + ' · ' + b.pax + ' pax' + (M.visits.sessions(b.pax) > 1 ? ' (' + M.visits.sessions(b.pax) + ' sessions)' : ''); } },
        { label: 'Date', render: function (b) {
          if (b.status !== 'new') return date(b.date);
          var f = M.visits.fits(b);
          return h('span', null, date(b.date), h('br'), h('small', { class: f.fits ? 'cap-ok' : 'cap-warn', text: f.fits ? f.booked + ' of ' + f.cap + ' sessions booked that day' : 'Fully booked (' + f.booked + ' of ' + f.cap + ' taken)' }));
        } },
        { label: 'Message', render: function (b) { return b.message || '—'; } },
        { label: 'Status', render: function (b) { return statusBadge(b.status); } },
        { label: 'Actions', render: function (b) {
          if (b.status !== 'new') return '—';
          return h('div', { class: 'actions stack' },
            mini('✨ Draft reply', function () { openReplyDialog(b); }),
            mini(b.proposal ? '✓ Package ' + money(b.proposal.totalCents) : '✨ Package', function () { openVisitPackage(b); }),
            mini('Confirm', function () { confirmVisit(b); }),
            mini('Decline', function () { b.status = 'declined'; commit('booking.declined', b.id, b.id + ' declined.'); }, { danger: true }));
        } }
      ], S().bookings, 'No bookings yet.')));
  }

  var DRAFTS = {
    en: function (p) { return 'Fresh from Kranji 🌱 Our ' + p.title + ' was harvested this morning — pesticide-free and full of flavour. Order by Thursday for Saturday delivery. Reply STOP to opt out.'; },
    zh: function (p) { return '克兰芝新鲜直送 🌱 今早刚采收的 ' + p.title + '，无农药、口感鲜嫩。周四前下单，周六送达。回复 STOP 取消订阅。'; },
    ms: function (p) { return 'Segar dari Kranji 🌱 ' + p.title + ' kami dituai pagi ini — bebas racun perosak. Pesan sebelum Khamis untuk penghantaran Sabtu. Balas STOP untuk berhenti.'; }
  };

  function audienceFor(productId) {
    var p = M.byId('products', productId);
    if (!p) return { eligible: [], excluded: 0 };
    var buyers = {};
    S().orders.forEach(function (o) {
      o.items.forEach(function (i) {
        var ip = M.byId('products', i.productId);
        if (ip && ip.category === p.category) buyers[o.customerId] = true;
      });
    });
    var ids = Object.keys(buyers);
    var eligible = ids.filter(function (id) { var c = customer(id); return c && c.consentMarketing; });
    return { eligible: eligible, excluded: ids.length - eligible.length };
  }

  /* ---- Restock reminders: suggested from purchase history, drafted per language ---- */
  // {first_name} and {days} are filled in per recipient when the campaign is sent.
  var RESTOCK_DRAFTS = {
    en: function (p, next, tip) { return 'Hi {first_name} 🌱 It\'s been {days} days since your last ' + p.title + '. Fresh ' + p.title + ' is in stock for our next delivery (' + next + ') — reorder in one tap from your MEOD account. ' + (tip ? tip + ' ' : '') + 'Reply STOP to opt out.'; },
    zh: function (p, next, tip) { return '{first_name} 您好 🌱 距离您上次购买 ' + p.title + ' 已经 {days} 天了。新鲜 ' + p.title + ' 现已有货，下次配送：' + next + '。在 MEOD 账户中一键回购。' + (tip || '') + '回复 STOP 取消订阅。'; },
    ms: function (p, next, tip) { return 'Hai {first_name} 🌱 Sudah {days} hari sejak anda membeli ' + p.title + '. ' + p.title + ' segar kini ada stok untuk penghantaran seterusnya (' + next + ') — pesan semula dalam akaun MEOD anda. ' + (tip ? tip + ' ' : '') + 'Balas STOP untuk berhenti.'; }
  };
  var LANG_SHORT = { en: 'English', zh: '中文', ms: 'Melayu' };
  function restockLang(c) { return RESTOCK_DRAFTS[c.language] ? c.language : 'en'; }
  function personalise(text, c, days) {
    var first = M.auth.can(session, 'customers.pii') ? c.name.split(' ')[0] : M.maskName(c.name).split(' ')[0];
    return text.replace('{first_name}', first).replace('{days}', String(days));
  }
  /* ---- Campaign Advisor: one ranked list of what to send this week ----
   * Pulls together the campaign ideas that used to live on separate pages: Harvest Rescue
   * alerts, Demand Radar surplus promos, Harvest Planner pre-order nudges, restock reminders
   * and Rewards nudges. Farm-ops ones (food that would otherwise go to waste) rank first.
   * It also warns against promoting crops that are short, and skips anything already drafted
   * in the last 7 days. Every "Draft it" still goes through admin approval. */
  var ADVISOR_SOURCE = { rescue: ['Harvest Rescue', 'red'], drop: ['Harvest allocation', 'green'], radar: ['Demand Radar', 'green'], preorder: ['Harvest Planner', 'green'], restock: ['Restock', 'blue'], rewards: ['Rewards', 'amber'],
    group: ['Group buys', 'blue'], visit: ['Visits', 'blue'], season: ['Seasonal calendar', 'amber'], hold: ['Hold off', 'grey'], none: ['Keep the price', 'grey'], limit: ['Pre-order limit', 'grey'], flag: ['Greenhouse rounds', 'red'] };
  var REWARD_PTYPE = { preorder: 'drop', surplus: 'rescue', tier: 'repeat', points: 'repeat', winback: 'reactivate' };
  function recentlyDrafted(productId, kinds) {
    var weekAgo = Date.now() - 7 * 864e5;
    return S().campaigns.filter(function (c) {
      return c.productId === productId && kinds.indexOf(c.kind) > -1 && c.status !== 'rejected' && new Date(c.createdAt).getTime() > weekAgo;
    })[0] || null;
  }
  function campaignAdvice() {
    var out = [];
    var crops = M.radar.crops();
    var shortIds = crops.filter(function (c) { return c.status === 'short'; }).map(function (c) { return c.product.id; });
    // 1. Harvest Rescue: batches about to pass their sell-by date.
    M.rescue.batches().filter(function (x) { return (x.level === 'urgent' || x.level === 'soon') && x.unsold > 0; }).forEach(function (x) {
      var a = audienceFor(x.product.id);
      out.push({ source: 'rescue', score: 95 - x.daysLeft, product: x.product, audience: a.eligible.length, done: recentlyDrafted(x.product.id, ['rescue-alert']),
        title: 'Sell ' + x.unsold + ' ' + x.product.title + ' before ' + shortWeekday(M.clearance.parseDayKey(x.batch.sellBy).toISOString()),
        why: 'Harvested ' + shortDate(x.batch.harvestedAt || M.clearance.parseDayKey(x.batch.harvestDate).toISOString()) + ', ' + money(x.valueCents) + ' at risk. An alert to past buyers sells it at full price before it needs a discount.',
        label: 'Draft alert', run: function () { rescueAlert(x); } });
    });
    out.forEach(function (o) { o.ptype = 'rescue'; });
    // 1b. Harvest Drops: upcoming harvests with supply nobody has committed to, offered as a
    // pre-order sized to that supply. Harvests already covered get a "no promotion" card.
    var covered = [], drops = 0;
    M.promo.drops().sort(function (a, b) { return b.uncommitted - a.uncommitted; }).forEach(function (d) {
      if (out.some(function (o) { return o.product && o.product.id === d.product.id; })) return;
      if (d.recommended === 'none') { if (!d.shortBy && d.openable) covered.push(d); return; }
      if (++drops > 4) return;
      var a = audienceFor(d.product.id);
      out.push({ source: 'drop', ptype: d.recommended === 'bundle' ? 'bundle' : 'drop', score: 82 + Math.min(8, d.sharePct / 10), product: d.product, audience: a.eligible.length, drop: d, ranking: d.ranking,
        done: d.campaign, title: 'Harvest Drop: ' + d.uncommitted + ' ' + d.product.title + ' uncommitted',
        why: 'Harvest ' + shortWeekday(M.clearance.parseDayKey(d.batch.harvestDate).toISOString()) + '. ' + d.reason,
        label: 'Compare options', run: function () { openDropCompare(d); } });
    });
    // Batches a worker flagged, then harvests at their pre-order limit: someone has to decide.
    var urgency = function (d) { return d.flagged ? 2 : d.capped ? 1 : 0; };
    covered.sort(function (a, b) { return urgency(b) - urgency(a); }).slice(0, 3).forEach(function (d) {
      var day = shortWeekday(M.clearance.parseDayKey(d.batch.harvestDate).toISOString());
      out.push({ source: d.flagged ? 'flag' : d.capped ? 'limit' : 'none', ptype: 'none', score: 19 + urgency(d), product: d.product, audience: 0, hold: true, ranking: d.ranking,
        title: (d.flagged ? 'Hold promotions: ' : d.capped ? 'Pre-order limit reached: ' : 'No promotion needed: ') + d.product.title + ' on ' + day,
        why: d.flagged || d.capped ? d.reason : 'All ' + d.supply + ' expected are covered by trade orders, pre-orders and usual sales. Keep the normal price.' });
    });
    // 2. Demand Radar: crops with more supply than demand.
    crops.filter(function (c) { return c.status === 'surplus'; }).sort(function (a, b) { return b.gap - a.gap; }).slice(0, 2).forEach(function (c) {
      if (out.some(function (o) { return o.product && o.product.id === c.product.id; })) return;
      var a = audienceFor(c.product.id);
      out.push({ source: 'radar', ptype: c.openBatch ? 'drop' : 'normal', score: 80 + Math.min(9, c.gap / 10), product: c.product, audience: a.eligible.length, done: recentlyDrafted(c.product.id, ['radar-surplus']),
        title: (c.openBatch ? 'Pre-order push: ' : 'Promote ') + c.product.title,
        why: 'About ' + c.gap + ' more than expected demand over ' + M.radar.weeks + ' weeks' + (c.trendPct < -5 ? ', and demand is down ' + Math.abs(c.trendPct) + '%' : '') + '. Promoting it now avoids a discount later.',
        label: 'Draft promo', run: function () { radarPromo(c); } });
    });
    // 3. Restock reminders from order history.
    M.restockDue().slice(0, 2).forEach(function (g) {
      out.push({ source: 'restock', ptype: 'normal', score: shortIds.indexOf(g.product.id) > -1 ? 30 : 66 + Math.min(6, g.customers.length), product: g.product, audience: g.customers.length, done: recentlyDrafted(g.product.id, ['restock']),
        title: g.customers.length + ' customer(s) due to reorder ' + g.product.title,
        why: 'They bought it ' + (g.minDays === g.maxDays ? g.minDays : g.minDays + '–' + g.maxDays) + ' days ago and haven\'t since. A reminder in their own language, with a recipe tip.',
        label: 'Draft reminder', run: function () { restockDraft(g); } });
    });
    // 4. Rewards: pre-order nudges, clear-with-points, tiers, unused points, win-backs.
    rewardsInsights(M.rewards.members()).forEach(function (x) {
      var p = x.ctx && x.ctx.product;
      if (p && out.some(function (o) { return o.product && o.product.id === p.id && o.source !== 'restock'; })) return;
      out.push({ source: x.kind === 'preorder' ? 'preorder' : 'rewards', ptype: REWARD_PTYPE[x.kind] || 'repeat', score: x.area === 'Farm ops' ? 76 : 58, product: p || null, audience: x.audience.length,
        done: p ? recentlyDrafted(p.id, ['rewards-' + x.kind]) : null, title: x.title, why: x.why + ' ' + x.estimate + '.', label: 'Review draft', run: function () { openNudgeComposer(x); } });
    });
    // 4b. Group-buy milestones, only where the extra margin covers the vouchers.
    S().events.filter(function (ev) { return ev.status === 'open' && ev.kind !== 'visit' && !milestoneLive(ev); }).forEach(function (ev) {
      var m = M.promo.milestoneIdea(ev);
      if (!m.worth) return;
      var aud = m.members.filter(function (id) { var cu = customer(id); return cu && cu.consentMarketing; });
      out.push({ source: 'group', ptype: 'group', score: 61, product: null, audience: aud.length, done: milestoneDrafted(ev),
        title: 'Group goal for ' + ev.title + ': ' + m.target + ' items in ' + m.days + ' days',
        why: 'They usually order about ' + m.baseline + '. If they reach ' + m.target + ', each member who ordered gets ' + money(m.voucherCents) + ': about ' + money(m.rewardCostCents) + ' in vouchers against about ' + money(m.extraMarginCents) + ' extra margin.',
        label: 'Draft goal', run: function () { milestoneDraft(m); } });
    });
    // 4c. Learning-journey vouchers for recent visits.
    M.promo.visitIdeas().forEach(function (x) {
      var b = x.booking;
      out.push({ source: 'visit', ptype: 'visit', score: 59, product: null, audience: x.audience.length,
        title: 'Thank-you voucher for ' + (b.org || b.name) + ' visitors',
        why: x.audience.length + ' visitor(s) opted in after the ' + shortWeekday(M.clearance.parseDayKey(b.date).toISOString()) + ' visit. A ' + money(x.voucherCents) + ' voucher on full-price produce (min ' + money(M.RULES.rewards.voucherMinSpendCents) + ') turns a visit into repeat orders.',
        label: 'Draft voucher', run: function () { visitVoucherDraft(x); } });
    });
    // 4d. Festivals in the next 3 weeks: open pre-orders at the normal price, no discount.
    M.seasons.outlook(21).forEach(function (o) {
      var f = o.festival, crops = o.crops.filter(function (c) { return shortIds.indexOf(c.product.id) < 0; });
      if (!crops.length) return;
      var aud = festiveAudience(crops);
      out.push({ source: 'season', ptype: 'normal', score: 72 + Math.round((21 - o.daysAway) / 2), product: crops[0].product, audience: aud.length, festival: o,
        done: S().campaigns.filter(function (c) { return c.kind === 'festive' && c.festival === f.key && c.status !== 'rejected'; })[0] || null,
        title: f.name + ' in ' + o.daysAway + ' day' + (o.daysAway === 1 ? '' : 's') + ': ' + crops.map(function (c) { return c.product.title; }).join(', '),
        why: f.why + ' Demand for these usually rises about ' + Math.round(f.uplift * 100) + '% in the ' + M.seasons.WINDOW_DAYS + ' days before. Open festive pre-orders at the normal price.',
        ranking: M.promo.ranking('normal', null, { alt: ['A festive bundle', 'Pair them for the festive meal if MEOD wants a gift-style offer.'], avoid: ['A discount', 'Festive demand is coming anyway; a discount only gives margin away.'] }),
        label: 'Draft festive message', run: function () { festiveDraft(o, crops); } });
    });
    // 5. Short crops: say what NOT to promote.
    crops.filter(function (c) { return c.status === 'short'; }).sort(function (a, b) { return a.gap - b.gap; }).slice(0, 2).forEach(function (c) {
      out.push({ source: 'hold', ptype: 'none', score: 20, product: c.product, audience: 0, hold: true,
        ranking: M.promo.ranking('none', null, { alt: ['Sow another batch', 'Demand Radar shows when one would be ready.'], avoid: ['Any promotion', 'It would sell stock the farm doesn\'t have.'] }),
        title: 'Don\'t promote ' + c.product.title + ' this week',
        why: 'About ' + Math.abs(c.gap) + ' units short of demand. A promo would only disappoint customers — leave it out of campaigns until the next harvest.' });
    });
    // Never promote a short crop (a rescue alert for stock already harvested is the exception).
    out = out.filter(function (x) { return x.hold || x.source === 'rescue' || !x.product || shortIds.indexOf(x.product.id) < 0; });
    return out.sort(function (a, b) { return (a.done ? 1 : 0) - (b.done ? 1 : 0) || b.score - a.score; });
  }
  function campaignAdvisorPanel() {
    var adv = campaignAdvice();
    var todo = adv.filter(function (x) { return !x.hold && !x.done; });
    return panel(aiTitle('Recommended campaigns'), 'One list from Harvest Rescue, upcoming harvests, Demand Radar, restock history, Rewards, group buys and visits. Each idea comes with the kind of promotion that fits, and sometimes that\'s no promotion. Food that would otherwise be wasted comes first. Only opted-in customers are messaged, and an admin approves every draft.',
      adv.length ? adviceCards(adv, todo) : h('p', { class: 'empty', text: 'Nothing to send right now — supply and demand are balanced.' }),
      promoTypesGuide());
  }
  // Top 6 to act on (plus "don't promote" warnings) first; the rest behind a toggle.
  function adviceCards(adv, todo) {
    var first = adv.filter(function (x) { return x.hold || todo.indexOf(x) > -1 && todo.indexOf(x) < 6; });
    var rest = adv.filter(function (x) { return first.indexOf(x) < 0; });
    var grid = function (list) { return h('div', { class: 'ops-brief adv-list aligned', style: '--rows:4' }, list.map(function (x) {
        var src = ADVISOR_SOURCE[x.source];
        var link = { none: ['#allocation', 'Harvest allocation'], limit: ['#harvest', 'Harvest Planner'], flag: ['#rounds', 'Greenhouse rounds'] }[x.source] || ['#radar', 'Demand Radar'];
        return h('article', { class: 'ops-card' + (x.hold ? ' adv-hold' : /^(rescue|drop|radar|preorder)$/.test(x.source) ? ' farm' : '') + (x.done ? ' adv-done' : '') },
          h('div', { class: 'ops-card-head' },
            x.product ? h('span', { class: 'rw-tier-cell' }, thumbMini(x.product)) : iconCircle(ICONS.users, 'soft'),
            h('span', { class: 'why-wrap' }, whyBtn(x.title, function () { return explainAdvice(x); }), h('span', { class: 'badge b-' + src[1], text: (x.hold ? '' : (todo.indexOf(x) + 1 || '✓') + ' · ') + src[0] }))),
          h('strong', { class: 'ops-title', text: x.title }),
          h('div', { class: 'adv-body' },
            x.drop ? dropStats(x.drop) : null,
            h('p', { text: x.why }),
            rankList(adviceRanking(x))),
          h('div', { class: 'ops-foot' },
            h('small', { text: x.source === 'none' ? 'Keep the normal price' : x.source === 'limit' ? 'A Harvest Planner decision' : x.source === 'flag' ? 'Waiting for the farm manager' : x.hold ? 'Pause promotions' : x.audience + ' opted-in ' + (x.audience === 1 ? 'person' : 'people') + ' · farm approval required' }),
            x.hold ? h('a', { class: 'mini', href: link[0], text: link[1] })
              : x.done ? h('small', { class: 'pending-note', text: 'Drafted ' + ago(x.done.createdAt) })
              : !x.audience ? h('small', { class: 'hint', text: 'Nobody opted in yet' })
              : h('button', { class: 'btn btn-sm btn-forest', type: 'button', text: x.label, onclick: function () {
                  var n0 = S().campaigns.length;
                  x.run();
                  if (S().campaigns.length > n0) {
                    M.decisions.log(Object.assign({ kind: 'campaign', feature: 'Campaign Advisor', title: x.title, recommendation: x.label, campaignId: S().campaigns[0].id }, explainAdvice(x)), session.email);
                    M.save();
                  }
                } })));
    })); };
    return h('div', null, grid(first),
      rest.length ? h('details', { class: 'adv-more' }, h('summary', { text: rest.length + ' more idea' + (rest.length === 1 ? '' : 's') + ' (lower priority or already drafted)' }), grid(rest)) : null);
  }

  /* ---- Promotion Intelligence helpers (Campaign Advisor) ---- */
  // Suggested / Alternative / Avoid. The suggested reason is the card's own text, so it's
  // only repeated where there's no card around it (full).
  var RANK_ROLE = { suggested: 'Suggested', alternative: 'Alternative', avoid: 'Avoid' };
  function adviceRanking(x) { return x.ranking || M.promo.ranking(x.ptype || 'normal', x.why); }
  function rankList(ranking, full) {
    return h('ul', { class: 'adv-rank' }, ranking.map(function (r) {
      return h('li', { class: 'rk-' + r.role }, h('span', { class: 'rk-role', text: RANK_ROLE[r.role] }),
        h('span', { class: 'rk-text' }, h('strong', { text: r.label }), r.role !== 'suggested' || full ? h('small', { text: r.why }) : null));
    }));
  }
  // What each part of the "intelligence" actually is today, so nothing rule-based is passed
  // off as a trained model.
  var INTEL_LAYERS = [
    ['Demand gaps and uncommitted harvest', 'Calculation', 'Now', 'Expected yield minus trade orders, pre-orders and 4-week average sales.'],
    ['Margin Guard', 'Fixed business rule', 'Now', 'No price below unit cost + minimum margin, or below the minimum price.'],
    ['Choosing the promotion type', 'Explainable decision rules', 'Now', 'Thresholds in RULES.promo; each card shows Suggested, Alternative and Avoid.'],
    ['Campaign messages', 'Editable templates', 'Now', 'Filled in with the product, dates and prices; staff can edit before approval.'],
    ['Campaign results', 'Recorded outcomes', 'Now', 'Orders by the people messaged, compared with what was assumed at draft.'],
    ['Photo check on inspections', 'Leaf-colour rule (not a trained model)', 'Now', 'Suggests a condition; the worker decides. Agreement with workers is measured in Greenhouse rounds.'],
    ['Estimate correction per crop', 'Measured from past harvests', 'Now', 'Average gap between worker estimates and real yields, once a crop has 3+ harvests.'],
    ['Weather advice', 'NEA forecast + rules', 'Now', 'Live public forecast from data.gov.sg; rules turn heat, showers and humidity into checks and delivery warnings.'],
    ['Festive demand', 'Calendar + illustrative uplifts', 'Now', 'Singapore festivals and the crops they lift; MEOD\'s own sales history would replace the uplifts.'],
    ['Message writing by a language model', 'Optional LLM', 'Future', 'Would rephrase the same facts; it wouldn\'t decide prices or audiences.'],
    ['Predicting which promotion works best', 'Model trained on results', 'Future', 'Needs enough recorded campaigns per type first (3+ is the minimum to compare).']
  ];
  function promoTypesGuide() {
    var T = M.promo.TYPES;
    return h('details', { class: 'adv-more promo-guide' }, h('summary', { text: 'How Tyllage decides, and what\'s rule-based' }),
      h('ul', { class: 'promo-types' }, Object.keys(T).map(function (k) {
        return h('li', null, badge(T[k].label, T[k].tone), h('small', { text: T[k].when }));
      })),
      h('div', { class: 'intel-layers' }, table([
        { label: 'Part', render: function (r) { return h('strong', { text: r[0] }); } },
        { label: 'How it works', render: function (r) { return h('span', null, r[1], h('br'), h('small', { class: 'hint', text: r[3] })); } },
        { label: 'Status', render: function (r) { return badge(r[2], r[2] === 'Now' ? 'green' : 'grey'); } }
      ], INTEL_LAYERS)),
      h('small', { class: 'hint', text: 'Tyllage recommends and drafts. MEOD sets prices, approves every offer and sends it from MEOD Fresh to customers who opted in.' }));
  }
  // The card shows the four allocation figures; the dialog (wide) adds the pre-order spots left.
  function dropStats(d, wide) {
    var cell = function (label, v, cls) { return h('li', { class: cls || '' }, h('small', { text: label }), h('strong', { text: String(v) })); };
    return h('ul', { class: 'drop-stats' + (wide ? ' wide' : '') },
      cell('Expected', d.supply), cell('Committed', d.committed), cell('Usual sales', d.expectedSales), cell('Uncommitted', d.uncommitted + (d.kg ? ' (~' + d.kg + ' kg)' : ''), 'hl'),
      wide ? cell('Pre-order spots left', d.spotsLeft + ' of ' + d.batch.preorderCap) : null);
  }
  var DROP_MSG = {
    normal: function (d, o, day, by) { return 'Harvest Drop 🌱 We\'re picking ' + d.product.title + ' on ' + day + '. ' + d.dropQty + ' are open for pre-order at ' + money(o.priceCents) + '. Reserve yours by ' + by + ' in your MEOD account and earn 2× reward points. Reply STOP to opt out.'; },
    bundle: function (d, o, day, by) { return 'Harvest Drop 🌱 We\'re picking ' + d.product.title + ' on ' + day + '. Pair it with ' + o.partner.title + ': both for ' + money(o.bundlePriceCents) + ' (usually ' + money(d.product.priceCents + o.partner.priceCents) + '), for the first ' + d.dropQty + ' orders before ' + by + '. Reply STOP to opt out.'; },
    discount: function (d, o, day, by) { return 'Harvest Drop 🌱 We\'re picking ' + d.product.title + ' on ' + day + '. ' + d.dropQty + ' Harvest Drop spots at ' + money(o.priceCents) + ' (usually ' + money(d.product.priceCents) + '), only until ' + by + '. Reserve in your MEOD account. Reply STOP to opt out.'; }
  };
  function draftDrop(d, o) {
    var p = d.product, a = audienceFor(p.id), id = M.nextId('CP');
    var day = shortWeekday(M.clearance.parseDayKey(d.batch.harvestDate).toISOString()), by = cutoffText(M.harvest.cutoff(d.batch));
    S().campaigns.unshift({
      id: id, kind: 'harvest-drop', productId: p.id, title: p.title + ' — Harvest Drop (' + o.label + ')', language: 'en', message: DROP_MSG[o.key](d, o, day, by),
      audience: a.eligible, status: 'pending_approval', createdBy: session.email, approvedBy: null, createdAt: new Date().toISOString(), sentCount: 0,
      drop: { batchId: d.batch.id, qty: d.dropQty, option: o.key, priceCents: o.priceCents, partnerId: o.partner ? o.partner.id : null, bundlePriceCents: o.bundlePriceCents || null }
    });
    M.promo.assume(S().campaigns[0], { units: d.dropQty, unitsLabel: 'Drop spots filled (goal: all)',
      scenario: 'If all ' + d.dropQty + ' sell: ' + money(o.potentialRevenueCents) + ' revenue, ' + money(o.potentialContributionCents) + ' contribution. A ceiling, not a forecast.' });
    M.decisions.log({ kind: 'campaign', feature: 'Campaign Advisor', title: 'Harvest Drop: ' + d.dropQty + ' ' + p.title + ' (' + o.label + ')', recommendation: d.options.filter(function (x) { return x.recommended; }).map(function (x) { return x.label; })[0] || o.label,
      campaignId: id, inputs: [['Expected harvest', d.supply], ['Committed (trade + pre-orders)', d.committed], ['Usual sales (est.)', d.expectedSales], ['Uncommitted', d.uncommitted], ['Pre-order spots left', d.spotsLeft], ['Chosen option', o.label + ' at ' + money(o.priceCents)]],
      calc: ['Uncommitted = expected − committed − usual sales', 'Drop size = the smaller of uncommitted and pre-order spots left = ' + d.dropQty, 'Contribution per unit = ' + money(o.priceCents) + ' − unit cost = ' + money(o.contributionCents), d.reason]
        .concat(d.ranking.map(function (r) { return RANK_ROLE[r.role] + ': ' + r.label + (r.role === 'suggested' ? '' : ' — ' + r.why); })),
      assumptions: ['Usual sales are 4-week averages.', 'Potential revenue assumes every drop spot sells; actual sales may be lower.', 'About ' + Math.round(M.RULES.promo.assumedResponse * 100) + '% of the people messaged order (Settings).'],
      confidence: { level: 'medium', note: 'Committed figures are firm; usual sales are estimates.' } }, session.email);
    commit('campaign.submitted', id, 'Harvest Drop for ' + p.title + ' drafted for ' + a.eligible.length + ' opted-in buyer(s) — waiting for admin approval.');
  }
  function openDropCompare(d) {
    document.querySelectorAll('.drop-dialog').forEach(function (x) { if (x.open) x.close(); x.remove(); });
    var p = d.product, a = audienceFor(p.id);
    var dlg = h('dialog', { class: 'receipt-dialog reply-dialog drop-dialog', 'aria-labelledby': 'dd-title' });
    function closeDialog() { if (dlg.open) dlg.close(); dlg.remove(); }
    append(dlg,
      h('button', { class: 'pd-close', type: 'button', 'aria-label': 'Close', onclick: closeDialog }, iconCircle(ICONS.x, 'bare')),
      h('div', { class: 'rd-body' },
        h('div', { class: 'rd-head' }, h('h2', { id: 'dd-title', text: 'Harvest Drop: ' + p.title }), aiPill(), badge('Harvest ' + shortWeekday(M.clearance.parseDayKey(d.batch.harvestDate).toISOString()), 'green')),
        dropStats(d, true),
        h('p', { class: 'callout green', text: 'Tyllage suggests: ' + d.reason }),
        rankList(d.ranking),
        h('div', { class: 'sim-grid' }, d.options.map(function (o) {
          var blocked = !o.guard.ok;
          return h('article', { class: 'sim-card' + (o.recommended ? ' best' : '') + (blocked ? ' blocked' : '') },
            h('div', { class: 'sim-head' }, h('strong', { text: o.label }), o.recommended ? badge('Suggested', 'green') : blocked ? badge('Blocked', 'red') : h('span')),
            h('div', { class: 'sim-price' }, o.priceCents < p.priceCents ? [h('span', { class: 'price-was', text: money(p.priceCents) }), h('strong', { text: money(o.priceCents) })] : h('strong', { text: money(o.priceCents) })),
            h('ul', { class: 'sim-nums' },
              h('li', null, h('small', { text: 'Drop spots' }), h('strong', { text: String(d.dropQty) })),
              h('li', { class: 'sim-margin' }, h('small', { text: 'Contribution / unit' }), h('strong', { text: money(o.contributionCents) })),
              h('li', null, h('small', { text: 'Potential revenue*' }), h('strong', { text: money(o.potentialRevenueCents) })),
              h('li', { class: 'sim-margin' }, h('small', { text: 'Potential contribution*' }), h('strong', { text: money(o.potentialContributionCents) }))),
            h('small', { class: 'sim-note', text: blocked ? 'Margin Guard: ' + o.guard.reasons.join('; ') + '.' : o.note }),
            h('button', { class: 'pa-act btn btn-sm ' + (o.recommended ? 'btn-forest' : 'btn-outline'), type: 'button', disabled: blocked || !a.eligible.length,
              text: 'Draft for approval', onclick: function () { closeDialog(); draftDrop(d, o); } }));
        })),
        h('small', { class: 'rd-disclaimer', text: '*If all ' + d.dropQty + ' drop spots sell at that price. This is a scenario, not a sales forecast: actual sales may be zero. Contribution is after the unit cost in Settings; delivery and fixed costs aren\'t included.' }),
        h('small', { class: 'hint', text: 'Goes out as MEOD Fresh on WhatsApp to ' + a.eligible.length + ' opted-in past buyer(s) of ' + M.CATEGORIES[p.category].label.toLowerCase() + '. Customers order in MEOD\'s own shop. The drop uses ' + d.dropQty + ' of the ' + d.spotsLeft + ' pre-order spots already open; it never opens more.' +
          (d.overLimit ? ' The other ' + d.overLimit + ' uncommitted would need the pre-order limit raised in Harvest Planner.' : '') })),
      h('div', { class: 'r-actions' }, h('button', { class: 'btn btn-sm btn-outline', type: 'button', text: 'Close', onclick: closeDialog })));
    dlg.addEventListener('close', function () { dlg.remove(); });
    document.body.appendChild(dlg);
    dlg.showModal();
  }
  function milestoneLive(ev) { var pr = M.promo.milestoneProgress(ev); return pr && (pr.status === 'active' || pr.status === 'reached'); }
  function milestoneDrafted(ev) {
    return S().campaigns.filter(function (c) { return c.kind === 'group-milestone' && c.milestone && c.milestone.eventId === ev.id && c.status === 'pending_approval'; })[0] || null;
  }
  function milestoneDraft(m) {
    var ev = m.event, id = M.nextId('CP');
    var aud = m.members.filter(function (cid) { var cu = customer(cid); return cu && cu.consentMarketing; });
    S().campaigns.unshift({
      id: id, kind: 'group-milestone', productId: null, title: ev.title + ' — group goal', language: 'en',
      message: 'Group goal 🌱 If ' + ev.title + ' orders ' + m.target + ' items from MEOD together in the next ' + m.days + ' days, everyone who ordered gets a ' + money(m.voucherCents) + ' voucher. Use code ' + ev.code + ' at checkout. Reply STOP to opt out.',
      audience: aud, status: 'pending_approval', createdBy: session.email, approvedBy: null, createdAt: new Date().toISOString(), sentCount: 0,
      milestone: { eventId: ev.id, target: m.target, days: m.days, voucherCents: m.voucherCents }
    });
    M.promo.assume(S().campaigns[0], { buyers: m.expectBuyers, units: m.target, unitsLabel: 'Group items ordered', unitsActual: 'group', voucherCostCents: m.rewardCostCents,
      basis: 'About ' + m.expectBuyers + ' member(s) order and the group reaches its goal of ' + m.target + ' (usually ' + m.baseline + '), so vouchers cost about ' + money(m.rewardCostCents) + '.' });
    commit('campaign.submitted', id, 'Group goal for ' + ev.title + ' drafted — waiting for admin approval.');
  }
  function visitVoucherDraft(x) {
    var b = x.booking, id = M.nextId('CP');
    S().campaigns.unshift({
      id: id, kind: 'visit-voucher', productId: null, bookingId: b.id, voucherCents: x.voucherCents, title: (b.org || b.name) + ' — thank-you voucher', language: 'en',
      message: 'Thanks for visiting MEOD Farm 🌱 Here\'s ' + money(x.voucherCents) + ' off your next order of fresh greens (min ' + money(M.RULES.rewards.voucherMinSpendCents) + ' of full-price produce). It\'s already in your MEOD account. Reply STOP to opt out.',
      audience: x.audience, status: 'pending_approval', createdBy: session.email, approvedBy: null, createdAt: new Date().toISOString(), sentCount: 0
    });
    var used = Math.round(x.audience.length * M.RULES.promo.assumedResponse);
    M.promo.assume(S().campaigns[0], { voucherCostCents: used * x.voucherCents });
    commit('campaign.submitted', id, 'Thank-you voucher for ' + (b.org || b.name) + ' drafted — waiting for admin approval.');
  }

  function restockNextLabel() { return M.nextDeliveryDay(new Date()).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' }); }
  // One draft per language for a restock group; also used by the Campaign Advisor.
  function restockDraft(g) {
    var next = restockNextLabel();
    var byLang = {};
    g.customers.forEach(function (x) { (byLang[restockLang(x.customer)] = byLang[restockLang(x.customer)] || []).push(x.customer.id); });
    var langs = Object.keys(byLang);
    langs.forEach(function (lang) {
      S().campaigns.unshift({
        id: M.nextId('CP'), kind: 'restock', productId: g.product.id, language: lang,
        title: g.product.title + ' — Restock reminder' + (langs.length > 1 ? ' (' + LANG_SHORT[lang] + ')' : ''),
        message: RESTOCK_DRAFTS[lang](g.product, next, M.recipes ? M.recipes.tipLine(g.product, lang) : ''),
        audience: byLang[lang], status: 'pending_approval', createdBy: session.email, approvedBy: null, createdAt: new Date().toISOString(), sentCount: 0
      });
    });
    commit('campaign.submitted', g.product.title, langs.length + ' restock reminder draft(s) for ' + g.product.title + ' added — waiting for admin approval.');
  }
  function restockPanel() {
    var groups = M.restockDue();
    var next = restockNextLabel();
    var draft = restockDraft;
    var rows = table([
      { label: 'Product', render: function (g) {
        var x = g.customers[0];
        var lang = restockLang(x.customer);
        return h('div', { class: 'restock-product' }, h('strong', { text: g.product.title }),
          h('details', { class: 'restock-preview' }, h('summary', { text: 'Preview message' }),
            h('p', { text: personalise(RESTOCK_DRAFTS[lang](g.product, next, M.recipes ? M.recipes.tipLine(g.product, lang) : ''), x.customer, x.days) }),
            h('small', { text: 'Example for ' + customerLabel(x.customer.id) + '. Name and days are filled in for each person when sent.' })));
      } },
      { label: 'Due', num: true, render: function (g) { return String(g.customers.length); } },
      { label: 'Last bought', render: function (g) { return g.minDays === g.maxDays ? g.minDays + ' days ago' : g.minDays + '–' + g.maxDays + ' days ago'; } },
      { label: 'Customers', render: function (g) { return h('small', { text: g.customers.map(function (x) { return customerLabel(x.customer.id); }).join(', ') }); } },
      { label: 'Languages', render: function (g) {
        var seen = {};
        g.customers.forEach(function (x) { seen[LANG_SHORT[restockLang(x.customer)]] = true; });
        return Object.keys(seen).join(', ');
      } },
      { label: 'Actions', render: function (g) { return mini('Draft reminder', function () { draft(g); }); } }
    ], groups, 'Nobody is due right now — everyone who opted in has bought recently, has it on pre-order, or was reminded in the last ' + M.RULES.restockCooldownDays + ' days.');
    return panel(aiTitle('Restock reminders'), 'Opted-in customers who bought an item ' + M.RULES.restockAfterDays + '–' + M.RULES.restockWindowDays + ' days ago and haven\'t bought it since. Suggested from order history; drafting creates one message per language, and an admin still has to approve it.',
      h('div', { class: 'restock-table' }, rows));
  }

  function campaignsView(root) {
    append(root, campaignAdvisorPanel());
    append(root, restockPanel());
    var inStock = S().products.filter(function (p) { var s = M.stockStatus(p); return s.known && s.qty > 0; });
    var form = h('form', { class: 'form-grid', novalidate: true });
    var productSel = h('select', { name: 'product', required: true }, inStock.map(function (p) { return h('option', { value: p.id, text: p.title }); }));
    var langSel = h('select', { name: 'language' }, h('option', { value: 'en', text: 'English' }), h('option', { value: 'zh', text: '中文' }), h('option', { value: 'ms', text: 'Bahasa Melayu' }));
    var title = h('input', { name: 'title', placeholder: 'e.g. Kai Lan Weekend', maxlength: 60 });
    var msg = h('textarea', { name: 'message', rows: 4, maxlength: 500, placeholder: 'Write a message or draft one with AI' });
    var audienceBox = h('p', { class: 'callout green' });
    var recipeToggle = h('input', { type: 'checkbox', checked: true });
    var recipeNote = h('small', { class: 'pf-hint' });
    function refreshRecipeNote() {
      var r = M.recipes && M.recipes.forProduct(M.byId('products', productSel.value));
      recipeToggle.disabled = !r;
      recipeNote.textContent = r ? 'Adds: ' + M.recipes.tipLine(M.byId('products', productSel.value), langSel.value) : 'No recipe idea for this product yet.';
    }

    function refreshAudience() {
      var a = audienceFor(productSel.value);
      audienceBox.textContent = 'Audience: ' + a.eligible.length + ' customer(s) who bought ' +
        M.CATEGORIES[M.byId('products', productSel.value).category].label.toLowerCase() + ' and agreed to marketing (' +
        (a.eligible.join(', ') || 'none') + '). ' + a.excluded + ' past buyer(s) left out because they have not given consent.';
    }
    productSel.addEventListener('change', refreshAudience);
    productSel.addEventListener('change', refreshRecipeNote);
    langSel.addEventListener('change', refreshRecipeNote);
    if (inStock.length) { refreshAudience(); refreshRecipeNote(); }

    append(form,
      h('label', null, 'Promoted product', productSel),
      h('label', null, 'Language', langSel),
      h('label', null, 'Campaign title', title),
      h('label', { style: 'grid-column:1/-1' }, 'Message', msg),
      h('div', { class: 'recipe-opt', style: 'grid-column:1/-1' },
        h('label', { class: 'toggle' }, recipeToggle, h('span', { text: 'Add a recipe idea to the AI draft' })), recipeNote),
      h('div', { class: 'actions', style: 'grid-column:1/-1' },
        h('button', { class: 'btn btn-sm btn-outline', type: 'button', text: '✨ Draft with AI (mock)', onclick: function () {
          var p = M.byId('products', productSel.value);
          msg.value = DRAFTS[langSel.value](p);
          var tip = recipeToggle.checked && M.recipes ? M.recipes.tipLine(p, langSel.value) : '';
          // Put the tip before the opt-out sentence, which always stays last.
          if (tip) msg.value = msg.value.replace(/(Reply STOP|回复 STOP|Balas STOP)/, tip + (langSel.value === 'zh' ? '' : ' ') + '$1');
          if (!title.value) title.value = p.title + ' Fresh Pick';
        } }),
        h('button', { class: 'btn btn-sm btn-forest', type: 'submit', text: 'Submit for approval' })));

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!title.value.trim() || !msg.value.trim()) { toast('Add a title and message first.'); return; }
      var id = M.nextId('CP');
      S().campaigns.unshift({
        id: id, productId: productSel.value, title: title.value.trim(), message: msg.value.trim(), language: langSel.value,
        audience: audienceFor(productSel.value).eligible, status: 'pending_approval',
        createdBy: session.email, approvedBy: null, createdAt: new Date().toISOString(), sentCount: 0
      });
      commit('campaign.submitted', id, 'Campaign sent for approval.');
    });

    append(root, panel(aiTitle('New campaign'), 'Pick a product. The system finds past buyers who agreed to marketing, and AI drafts the message. An admin who did not write it must approve before it can be sent.',
      audienceBox, form));

    var canApprove = M.auth.can(session, 'campaigns.approve');
    // Campaign list: status chips instead of a heading (the page is already titled Campaign Studio).
    var cState = campaignsView.state || (campaignsView.state = { filter: 'all' });
    var CAMPAIGN_FILTERS = [['all', 'All'], ['pending_approval', 'Waiting for approval'], ['approved', 'Approved'], ['sent', 'Sent'], ['rejected', 'Rejected']];
    var cChips = h('div', { class: 'filters', role: 'toolbar', 'aria-label': 'Filter campaigns by status' });
    var cList = h('div');
    function drawCampaigns() {
      cChips.textContent = '';
      CAMPAIGN_FILTERS.forEach(function (f) {
        var n = S().campaigns.filter(function (c) { return f[0] === 'all' || c.status === f[0]; }).length;
        append(cChips, h('button', { type: 'button', class: 'chip' + (cState.filter === f[0] ? ' active' : ''), 'aria-pressed': String(cState.filter === f[0]),
          onclick: function () { cState.filter = f[0]; drawCampaigns(); } }, f[1] + ' ', h('span', { class: 'chip-count', text: String(n) })));
      });
      var rows = S().campaigns.filter(function (c) { return cState.filter === 'all' || c.status === cState.filter; });
      cList.textContent = '';
      append(cList, table([
        { label: 'Campaign', render: function (c) {
          return h('span', null, h('strong', { text: c.title }), h('br'), h('small', { text: c.message.slice(0, 90) + (c.message.length > 90 ? '…' : '') }),
            c.kind === 'restock' ? [h('br'), h('small', { class: 'restock-tag', text: 'Restock reminder · {first_name} and {days} are filled in per person' })] : null,
            (c.kind === 'tier-nudge' || /^rewards-/.test(c.kind || '')) ? [h('br'), h('small', { class: 'restock-tag', text: 'Rewards nudge · names, bunches and points are filled in per person' })] : null);
        } },
        { label: 'Type', render: function (c) { var T = M.promo.TYPES[M.promo.typeOf(c)]; return h('span', { class: 'ptype', title: T.when }, badge(T.label, T.tone)); } },
        { label: 'Product', render: function (c) { var p = M.byId('products', c.productId); return p ? p.title : '—'; } },
        { label: 'Lang', render: function (c) { return c.language.toUpperCase(); } },
        { label: 'Audience', num: true, render: function (c) { return String(c.audience.length); } },
        { label: 'By', render: function (c) { return h('span', null, c.createdBy, c.approvedBy ? h('br') : null, c.approvedBy ? h('small', { text: 'approved: ' + c.approvedBy }) : null); } },
        { label: 'Status', render: function (c) { return h('span', { class: 'status-cell' }, statusBadge(c.status), c.status === 'sent' ? h('small', { text: c.sentCount + ' sent' }) : null); } },
        { label: 'Results', render: resultCell },
        { label: 'Actions', render: function (c) {
          if (c.status === 'pending_approval') {
            if (!canApprove) return h('small', { text: 'Waiting for admin' });
            var own = c.createdBy === session.email;
            return h('div', { class: 'actions' },
              mini('Approve', function () {
                // Harvest Drops and group goals change a batch or a group buy too; that's checked again now and fails closed.
                var r = M.promo.onApprove(c);
                if (!r.ok) { toast(r.error); return; }
                c.status = 'approved'; c.approvedBy = session.email;
                commit('campaign.approved', c.id, c.kind === 'harvest-drop' ? 'Harvest Drop approved — ' + c.drop.qty + ' pre-order spots open' + (c.drop.option === 'discount' ? ' at ' + money(c.drop.priceCents) : '') + (c.drop.option === 'bundle' ? '. Publish the bundle in MEOD Fresh' : '') + '.'
                  : c.kind === 'group-milestone' ? 'Group goal approved — progress shows to the group from now.' : 'Campaign approved.');
              }, { disabled: own, title: own ? 'You can\'t approve your own campaign' : null }),
              mini('Reject', function () { c.status = 'rejected'; commit('campaign.rejected', c.id, 'Campaign rejected.'); }, { danger: true }));
          }
          if (c.status === 'approved') {
            return mini('Send (simulated)', function () {
              // Re-check consent at send time — people may have opted out since approval.
              var recipients = c.audience.filter(function (id) { var cu = customer(id); return cu && cu.consentMarketing; });
              c.status = 'sent'; c.sentCount = recipients.length;
              M.promo.onSend(c, recipients);
              commit('campaign.sent', c.id, 'Sent to ' + recipients.length + ' opted-in customer(s) (mock WhatsApp)' + (c.kind === 'visit-voucher' ? ', each with a ' + money(c.voucherCents) + ' voucher in their account' : '') + '.');
            });
          }
          return '—';
        } }
      ], rows, cState.filter === 'all' ? 'No campaigns yet.' : 'No campaigns with this status.'));
    }
    drawCampaigns();
    append(root, h('section', { class: 'panel' }, h('div', { class: 'user-toolbar' }, cChips), cList));
    append(root, promoResultsPanel());
  }
  // What a sent campaign led to (orders by its recipients within RULES.promo.resultDays).
  function resultCell(c) {
    var r = M.promo.result(c);
    if (!r) return '—';
    return h('span', { class: 'cp-result' },
      h('strong', { text: r.buyers + ' of ' + r.recipients + ' ordered' }),
      h('small', { text: money(r.revenueCents) + ' sales · ' + money(r.marginCents) + ' margin' }),
      r.dropQty ? h('small', { text: r.dropTaken + ' of ' + r.dropQty + ' drop spots taken' }) : null,
      r.vouchersIssued ? h('small', { text: r.vouchersUsed + ' of ' + r.vouchersIssued + ' vouchers used' }) : null,
      r.open ? h('small', { class: 'pending-note', text: 'Still counting' }) : null,
      r.vsAssumed.length ? h('details', { class: 'cp-vs' }, h('summary', { text: 'Assumed vs actual' }), vsTable(r)) : null);
  }
  // What Tyllage assumed when the campaign was drafted, beside what happened.
  var VS_MARK = { met: ['✓ met', 'green'], below: ['✕ below', 'red'], counting: ['… counting', 'grey'] };
  function vsTable(r) {
    var fmt = function (x, v) { return x.money ? money(v) : String(v); };
    return h('div', { class: 'cp-vs-body' },
      h('ul', null, r.vsAssumed.map(function (x) {
        return h('li', null, h('span', { text: x.label }), h('small', { text: 'assumed ' + fmt(x, x.assumed) }), h('strong', { text: fmt(x, x.actual) }), badge(VS_MARK[x.verdict][0], VS_MARK[x.verdict][1]));
      })),
      h('small', { text: r.assumed.basis + (r.assumed.scenario ? ' ' + r.assumed.scenario : '') + (r.assumed.savedAt === 'approval' ? ' Saved at approval (drafted before assumptions were recorded).' : ' Saved ' + shortDate(r.assumed.at) + ' when drafted.') }));
  }
  function promoResultsPanel() {
    var rows = M.promo.resultsByType();
    return panel(aiTitle('What\'s working, by promotion type'), 'Every sent campaign, counted the same way: orders by the people it went to within ' + M.RULES.promo.resultDays + ' days, margin after unit cost, and the cost of any vouchers used. This is the history Tyllage needs to learn which kind of promotion suits which harvest. Until a type has 3 or more campaigns, it keeps using the rules.',
      table([
        { label: 'Type', render: function (x) { var T = M.promo.TYPES[x.type]; return h('span', { class: 'ptype', title: T.when }, badge(T.label, T.tone)); } },
        { label: 'Campaigns', num: true, render: function (x) { return String(x.campaigns); } },
        { label: 'Messaged', num: true, render: function (x) { return String(x.recipients); } },
        { label: 'Ordered', num: true, render: function (x) { return x.buyers + ' (' + x.conversionPct + '%)'; } },
        { label: 'Sales', num: true, render: function (x) { return money(x.revenueCents); } },
        { label: 'Margin', num: true, render: function (x) { return money(x.marginCents); } },
        { label: 'Vouchers used', num: true, render: function (x) { return x.voucherCostCents ? '−' + money(x.voucherCostCents) : '—'; } },
        { label: 'Net', num: true, render: function (x) { return h('strong', { text: money(x.netCents) }); } },
        { label: 'Assumed → actual buyers', num: true, render: function (x) { return x.withAssumed ? x.assumedBuyers + ' → ' + x.buyers : '—'; } },
        { label: 'Met assumption', num: true, render: function (x) { return x.settled ? x.met + ' of ' + x.settled : h('small', { class: 'hint', text: 'None finished yet' }); } },
        { label: 'Evidence', render: function (x) { return x.enough ? h('span', { class: 'ptype' }, badge('Enough to compare', 'green')) : h('small', { class: 'hint', text: 'Too few to judge (' + x.campaigns + ' of 3)' }); } }
      ], rows, 'No campaigns sent yet. Results show here a week after each one goes out.'));
  }

  /* ---------------- Buy to Clear (staff + admin) ---------------- */
  function dollarsToCents(v) { var n = Math.round(parseFloat(v) * 100); return isNaN(n) ? NaN : n; }
  function centsToDollars(c) { return (c / 100).toFixed(2); }

  function clearanceView(root) {
    var canEditMin = M.auth.can(session, 'clearance.minprice');

    /* ---- a. Candidates ---- */
    var candidates = M.clearance.candidates();
    append(root, panel(aiTitle('Clearance candidates'), 'High stock, low recent sales — a plain-English reason for each.',
      table([
        { label: 'Product', render: function (c) { return c.product.title; } },
        { label: 'In stock', num: true, render: function (c) { return String(c.qty); } },
        { label: 'Sold · 14 days', num: true, render: function (c) { return String(c.sold14); } },
        { label: 'Reason', render: function (c) { return c.reason; } },
        { label: 'Actions', render: function (c) {
          return mini('List for clearance', function () { prefillForm(c); });
        } }
      ], candidates, 'Nothing stands out right now — stock and recent sales look balanced.')));

    /* ---- b. Create a listing ---- */
    var inStock = S().products.filter(function (p) { return !p.bagOffer && M.stockStatus(p).known && p.stock.qty > 0; });
    var productSel = h('select', { name: 'product', required: true }, inStock.map(function (p) { return h('option', { value: p.id, text: p.title + ' (' + p.stock.qty + ')' }); }));
    var qtyInput = h('input', { name: 'qty', type: 'number', min: 1, step: 1, required: true, value: '10' });
    var priceInput = h('input', { name: 'price', type: 'number', min: 0, step: '0.01', required: true });
    var minInput = h('input', { name: 'min', type: 'number', min: 0, step: '0.01', required: true, disabled: !canEditMin });
    var minLine = h('small', { class: 'pf-hint min-live' });
    var reasonSel = h('select', { name: 'reason' },
      h('option', { value: 'surplus', text: 'Surplus' }), h('option', { value: 'short_dated', text: 'Short-dated' }), h('option', { value: 'cosmetic', text: 'Cosmetic' }));
    var minDate = new Date().toISOString().slice(0, 10);
    var untilInput = h('input', { name: 'until', type: 'date', required: true, min: minDate, value: daysFromNowStr(3) });
    var errorBox = h('p', { class: 'pf-error', 'aria-live': 'polite' });

    function selectedProduct() { return M.byId('products', productSel.value); }
    function refreshMinLine() {
      var minC = dollarsToCents(minInput.value);
      minLine.textContent = isNaN(minC) ? '' : 'Min ' + money(minC);
      var priceC = dollarsToCents(priceInput.value);
      var tooLow = !isNaN(priceC) && !isNaN(minC) && priceC < minC;
      priceInput.setAttribute('aria-invalid', String(tooLow));
      errorBox.textContent = tooLow ? 'Clearance price can\'t be below the minimum of ' + money(minC) + '.' : '';
    }
    function applyDefaults() {
      var p = selectedProduct();
      if (!p) return;
      priceInput.value = centsToDollars(Math.round(p.priceCents * 0.8));
      minInput.value = centsToDollars(Math.round(p.priceCents * M.RULES.clearanceDefaultMinRate));
      refreshMinLine();
    }
    productSel.addEventListener('change', applyDefaults);
    priceInput.addEventListener('input', refreshMinLine);
    minInput.addEventListener('input', refreshMinLine);
    if (inStock.length) applyDefaults();

    function prefillForm(candidate) {
      productSel.value = candidate.product.id;
      applyDefaults();
      qtyInput.value = String(Math.max(1, Math.round(candidate.qty * 0.6)));
      var formPanel = document.getElementById('clearance-form-panel');
      if (formPanel) formPanel.scrollIntoView({ block: 'start', behavior: 'smooth' });
      qtyInput.focus();
    }

    var minField = canEditMin ? minInput : h('span', { class: 'min-locked' }, minInput, iconCircle(ICONS.lock, 'bare'));
    var form = h('form', { class: 'form-grid clearance-form', novalidate: true },
      h('label', null, 'Product', productSel),
      h('label', null, 'Quantity to list', qtyInput),
      h('label', null, 'Clearance price (S$)', priceInput, minLine),
      h('label', null, 'Min price (S$)', minField),
      h('label', null, 'Reason', reasonSel),
      h('label', null, 'Available until', untilInput),
      !canEditMin ? h('small', { class: 'pf-hint', style: 'grid-column:1/-1', text: 'Example minimum (MEOD to confirm) — only an admin can change this.' }) : null,
      h('div', { style: 'grid-column:1/-1' }, errorBox),
      h('div', { style: 'grid-column:1/-1' }, h('button', { class: 'btn btn-sm btn-forest', type: 'submit', text: 'List for clearance' })));

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = {
        productId: productSel.value, qty: parseInt(qtyInput.value, 10),
        clearancePriceCents: dollarsToCents(priceInput.value), minPriceCents: dollarsToCents(minInput.value),
        reason: reasonSel.value, availableUntil: untilInput.value
      };
      var r = M.clearance.create(data, session.email);
      if (!r.ok) { errorBox.textContent = r.error; return; }
      errorBox.textContent = '';
      var p = selectedProduct();
      commit('clearance.listed', r.id, p.title + ' listed for clearance at ' + money(data.clearancePriceCents) + '.');
    });

    append(root, h('section', { class: 'panel', id: 'clearance-form-panel' },
      h('h2', { text: 'List a product for clearance' }),
      h('p', { class: 'hint', text: 'A clearance price can never be below the minimum price. Stale stock can\'t be listed or ordered.' }),
      form));

    /* ---- c. Active listings ---- */
    var activeListings = S().clearance.slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    append(root, panel('Listings', null,
      h('div', { class: 'clearance-table' },
        table([
          { label: 'Product', render: function (l) { var p = M.byId('products', l.productId); return p ? p.title : '—'; } },
          { label: 'Price', render: function (l) { return h('span', null, h('span', { class: 'price-was', text: money(l.normalPriceCents) }), ' ', h('span', { class: 'price-now', text: money(l.clearancePriceCents) }), ' ', h('span', { class: 'discount-badge', text: '−' + M.clearance.discountPct(l) + '%' })); } },
          { label: 'Minimum', num: true, render: function (l) { return money(l.minPriceCents); } },
          { label: 'Sold / left', render: function (l) { return l.qtySold + ' sold · ' + M.clearance.remaining(l) + ' left'; } },
          { label: 'Reason', render: function (l) { return M.clearance.reasonLabel(l.reason); } },
          { label: 'Ends', render: function (l) { return shortDate(l.availableUntil); } },
          { label: 'Status', render: function (l) { return statusBadge(M.clearance.isOpen(l) ? 'active' : 'ended'); } },
          { label: 'Actions', render: function (l) {
            var actions = [];
            if (M.clearance.isOpen(l)) {
              actions.push(mini('End', function () {
                if (!confirm('End this clearance listing early?')) return;
                M.clearance.endEarly(l.id);
                var p = M.byId('products', l.productId);
                commit('clearance.ended', l.id, p.title + ' clearance listing ended early.');
              }, { danger: true, title: 'End early' }));
              actions.push(mini('Alert', function () { draftClearanceAlert(l); }, { title: 'Send WhatsApp alert' }));
            }
            return actions.length ? h('div', { class: 'actions' }, actions) : '—';
          } }
        ], activeListings, 'No clearance listings yet.'))));

    /* ---- e. WhatsApp alert -> Campaign Studio draft (never sent directly) ---- */
    function draftClearanceAlert(listing) {
      var p = M.byId('products', listing.productId);
      var audience = audienceFor(p.id);
      var id = M.nextId('CP');
      S().campaigns.unshift({
        id: id, kind: 'clear-alert', productId: p.id, title: p.title + ' — Buy to Clear', language: 'en',
        message: 'Buy to Clear 🌱 ' + p.title + ' is now ' + money(listing.clearancePriceCents) + ' (was ' + money(listing.normalPriceCents) +
          '), only ' + M.clearance.remaining(listing) + ' left, available until ' + shortDate(listing.availableUntil) + '. Reply STOP to opt out.',
        audience: audience.eligible, status: 'pending_approval', createdBy: session.email, approvedBy: null, createdAt: new Date().toISOString(), sentCount: 0
      });
      commit('campaign.submitted', id, 'Draft added to Campaign Studio — needs admin approval before it sends.');
    }

    /* ---- d. Surprise Harvest Bag: pre-orders per day + proposed contents ---- */
    function bagValueInfo(o) {
      var items = o.bagContents || o.bagProposed || [];
      var worth = items.reduce(function (s, it) { var p = M.byId('products', it.productId); return s + (p ? p.priceCents * it.qty : 0); }, 0);
      var sz = S().harvestBag.sizes.filter(function (s) { return s.key === o.bagSize; })[0];
      var promise = sz ? sz.worthCents : 0;
      return { items: items, worth: worth, promise: promise, ok: worth >= promise };
    }
    function approveAllForDay(dayOrders, dayLabel) {
      var pending = dayOrders.filter(function (o) { return !o.bagContentsApproved && o.status !== 'cancelled'; });
      if (!pending.length) { toast('Nothing to approve for this day.'); return; }
      var okCount = 0, fails = [];
      pending.forEach(function (o) {
        var r = M.clearance.approveBagContents(o.id, o.bagProposed || []);
        if (r.ok) okCount++; else fails.push(o.ref + ': ' + r.error);
      });
      commit('clearance.bag_approved', dayLabel, 'Approved ' + okCount + ' of ' + pending.length + ' bag(s) for ' + dayLabel + '.' +
        (fails.length ? ' Blocked: ' + fails.join('; ') : ''));
    }

    var bagDays = []; var from = new Date();
    for (var i = 0; i < 4; i++) {
      var info = M.clearance.nextBagCutoff(from);
      bagDays.push(info);
      from = new Date(info.deliveryDay.getTime() + 36e5);
    }
    var limit = S().harvestBag.limitPerDay;
    var busyDays = [], emptyDays = [];
    bagDays.forEach(function (info) {
      var key = M.clearance.dayKey(info.deliveryDay);
      var orders = M.clearance.bagOrdersForDay(key);
      (orders.length ? busyDays : emptyDays).push({ info: info, key: key, orders: orders });
    });

    var bagPanels = busyDays.map(function (d) {
      var dayLabel = weekdayLongLabel(d.info.deliveryDay);
      var pct = Math.min(100, Math.round(d.orders.length / limit * 100));
      var bar = h('div', { class: 'bag-day-progress' },
        h('div', { class: 'bar' }, h('span', { class: 'bar-fill', style: 'width:' + pct + '%' })),
        h('small', { text: d.orders.length + ' / ' + limit + ' bags' }),
        mini('Approve all for this day', function () { approveAllForDay(d.orders, dayLabel); }));
      var rows = d.orders.length ? d.orders.map(function (o) {
        var sz = S().harvestBag.sizes.filter(function (s) { return s.key === o.bagSize; })[0];
        var v = bagValueInfo(o);
        return h('div', { class: 'bag-order-row' },
          h('div', { class: 'bor-id' }, h('strong', { text: o.ref }), h('small', { text: customerLabel(o.customerId) })),
          h('div', { class: 'bor-mid' },
            h('small', { class: 'bor-tags' }, (sz ? sz.label : o.bagSize) + ' · Excludes ' + (o.excludedCategory ? M.CATEGORIES[o.excludedCategory].label : 'none')),
            v.items.length
              ? h('div', null,
                  h('span', { text: v.items.map(function (it) { return it.title; }).join(', ') }),
                  h('small', { class: v.ok ? 'bag-value-ok' : 'bag-value-low' },
                    v.items.length + ' items · worth ' + money(v.worth) + ' ' + (v.ok ? '✓' : '✗') + ' (promise ' + money(v.promise) + ')'))
              : h('span', { class: 'empty', text: 'No contents proposed.' })),
          h('div', { class: 'bor-status' }, o.bagContentsApproved ? statusBadge('approved') : statusBadge('pending')),
          h('div', { class: 'bor-action' }, (o.bagContentsApproved || o.status === 'cancelled') ? null : mini('Approve', function () {
            var r = M.clearance.approveBagContents(o.id, o.bagProposed || []);
            if (!r.ok) { toast(r.error); return; }
            commit('clearance.bag_approved', o.ref, 'Contents approved for ' + o.ref + '.');
          })));
      }) : h('p', { class: 'empty', text: 'No pre-orders for this day yet.' });
      return panel(dayLabel, null, bar, h('div', { class: 'bag-order-rows' }, rows));
    });
    append(root, h('div', { class: 'settings-group' }, h('h2', { class: 'settings-heading', text: 'Surprise Harvest Bag — pre-orders' }),
      bagPanels,
      emptyDays.length ? panel('No pre-orders yet', null, emptyDays.map(function (d) {
        return h('div', { class: 'bag-day-empty' }, h('span', { text: weekdayLongLabel(d.info.deliveryDay) }), h('span', { text: '0 / ' + limit + ' bags' }));
      })) : null));

    /* ---- f. Money breakdown ---- */
    append(root, panel('Money breakdown', 'Example numbers — MEOD to confirm real costs.',
      h('div', { class: 'clearance-table' }, table([
        { label: 'Product', render: function (l) { var p = M.byId('products', l.productId); return p ? p.title : '—'; } },
        { label: 'Listed qty', num: true, render: function (l) { return String(l.qty); } },
        { label: 'Sold so far (S$)', num: true, render: function (l) { return money(l.qtySold * l.clearancePriceCents); } },
        { label: 'If all sold (S$)', num: true, render: function (l) { return money(l.qty * l.clearancePriceCents); } },
        { label: 'Normal value (S$)', num: true, render: function (l) { return money(l.qty * l.normalPriceCents); } },
        { label: 'vs S$0 if wasted', num: true, render: function (l) { return h('span', { class: 'bag-value-ok' }, '+' + money(l.qtySold * l.clearancePriceCents)); } }
      ], S().clearance, 'No clearance history yet.'))));
  }
  function daysFromNowStr(d) { return new Date(Date.now() + d * 864e5).toISOString().slice(0, 10); }
  function weekdayLongLabel(d) { return d.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'short' }); }

  /* ---------------- Harvest Planner (staff + admin) ---------------- */
  var dayKeyDate = function (key) { return M.clearance.parseDayKey(key); };
  function daysUntil(key) { return Math.round((dayKeyDate(key).getTime() - new Date().setHours(0, 0, 0, 0)) / 864e5); }
  function inDaysText(key) {
    var n = daysUntil(key);
    return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n > 0 ? 'in ' + n + ' days' : Math.abs(n) + ' days ago';
  }
  function cutoffText(d) {
    var hh = d.getHours();
    return d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' + (hh % 12 || 12) + (hh >= 12 ? 'pm' : 'am');
  }
  function fillBar(taken, cap) {
    var pct = cap ? Math.min(100, Math.round(taken / cap * 100)) : 0;
    var bar = h('span', { class: 'po-bar' }, h('span', { class: 'po-fill' + (pct >= 100 ? ' full' : '') }));
    bar.firstChild.style.width = pct + '%';
    return bar;
  }

  /* ---- Record harvest dialog, with optional photo grading (Tyllage Grade, js/grade.js) ----
   * Staff enter the real yield and can add sample photos. Each photo gets a suggested grade
   * from a leaf-colour check; the share of grades splits the yield into Grade A / Cosmetic /
   * Check, which staff can overrule. Cosmetic units can be listed on Buy to Clear in the same
   * step; Check units are held back for inspection. Looks only — never a food-safety call. */
  var COSMETIC_RATE = 0.7; // illustrative clearance price for cosmetic produce: 30% off
  function openHarvestDialog(b) {
    var H = M.harvest;
    var p = M.byId('products', b.productId);
    var reserved = H.preordered(b);
    var gradable = Boolean(M.grade) && M.grade.canGrade(p);
    var results = [];
    var manual = false;
    document.querySelectorAll('.grade-dialog').forEach(function (d) { if (d.open) d.close(); d.remove(); });
    var dlg = h('dialog', { class: 'receipt-dialog grade-dialog', 'aria-labelledby': 'gd-title' });
    function closeDialog() { if (dlg.open) dlg.close(); dlg.remove(); }

    var qtyInput = h('input', { type: 'number', min: 0, step: 1, value: String(b.expectedQty), 'aria-label': 'Harvested quantity' });
    var aIn = h('input', { type: 'number', min: 0, step: 1, 'aria-label': 'Grade A units' });
    var cIn = h('input', { type: 'number', min: 0, step: 1, 'aria-label': 'Cosmetic units' });
    var kIn = h('input', { type: 'number', min: 0, step: 1, 'aria-label': 'Check units' });
    var listCosmetic = h('input', { type: 'checkbox', checked: true });
    var showMarks = h('input', { type: 'checkbox', checked: true });
    var photoGrid = h('div', { class: 'gd-photos' });
    var splitBar = h('div', { class: 'gd-split-bar', 'aria-hidden': 'true' });
    var planBox = h('ul', { class: 'gd-plan' });
    var errorBox = h('p', { class: 'pf-error', 'aria-live': 'polite' });
    var busy = h('small', { class: 'gd-busy', 'aria-live': 'polite' });
    var fileInput = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'visually-hidden', 'aria-label': 'Add harvest photos' });
    var num = function (el) { var n = parseInt(el.value, 10); return isNaN(n) ? 0 : Math.max(0, n); };

    function autoSplit() {
      if (manual) return;
      var qty = num(qtyInput);
      var s = gradable ? M.grade.split(results.map(function (x) { return x.r; }), qty) : null;
      aIn.value = String(s ? s.A : qty);
      cIn.value = String(s ? s.cosmetic : 0);
      kIn.value = String(s ? s.check : 0);
    }
    function plan() {
      var qty = num(qtyInput), A = num(aIn), C = num(cIn), K = num(kIn);
      var sellable = A + C;
      var served = Math.min(reserved, sellable);
      var toStock = Math.max(0, sellable - reserved);
      var listQty = Math.min(C, toStock);
      return { qty: qty, A: A, C: C, K: K, served: served, toStock: toStock, shortfall: Math.max(0, reserved - sellable), listQty: listQty, sumOk: A + C + K === qty };
    }
    function drawPlan() {
      var pl = plan();
      errorBox.textContent = pl.sumOk ? '' : 'Grade A + Cosmetic + Check is ' + (pl.A + pl.C + pl.K) + ' — it must add up to the ' + pl.qty + ' harvested.';
      splitBar.textContent = '';
      [['A', pl.A, 'seg-a'], ['C', pl.C, 'seg-c'], ['K', pl.K, 'seg-k']].forEach(function (s) {
        if (!s[1] || !pl.qty) return;
        var seg = h('span', { class: 'gd-seg ' + s[2] });
        seg.style.width = (s[1] / pl.qty * 100) + '%';
        splitBar.appendChild(seg);
      });
      var clearPrice = Math.round(p.priceCents * COSMETIC_RATE);
      planBox.textContent = '';
      append(planBox,
        h('li', null, h('strong', { text: pl.served }), ' to pre-orders' + (reserved ? ' (' + reserved + ' reserved)' : '')),
        h('li', null, h('strong', { text: pl.toStock }), ' into stock' + (pl.listQty && listCosmetic.checked ? ', of which ' : ''),
          pl.listQty && listCosmetic.checked ? h('strong', { text: pl.listQty }) : null,
          pl.listQty && listCosmetic.checked ? ' listed on Buy to Clear as Cosmetic at ' + money(clearPrice) + ' (was ' + money(p.priceCents) + ')' : null),
        pl.K ? h('li', null, h('strong', { text: pl.K }), ' held back for a person to inspect — not sold') : null,
        pl.shortfall ? h('li', { class: 'bag-value-low' }, 'Short by ' + pl.shortfall + ' for pre-orders — contact the affected customers.') : null);
    }
    function refresh() { autoSplit(); drawPlan(); }

    function drawPhotos() {
      photoGrid.textContent = '';
      photoGrid.classList.toggle('marks-off', !showMarks.checked);
      if (!results.length) {
        append(photoGrid, h('p', { class: 'empty', text: 'No photos yet. Add 3–6 photos of different bunches from this harvest.' }));
        return;
      }
      results.forEach(function (x, idx) {
        append(photoGrid, h('figure', { class: 'gd-photo' },
          h('div', { class: 'gd-img' },
            h('img', { src: x.url, alt: x.label }),
            h('img', { class: 'gd-mark', src: x.r.overlayUrl, alt: '' }),
            h('button', { type: 'button', class: 'gd-remove', 'aria-label': 'Remove photo', onclick: function () { results.splice(idx, 1); drawPhotos(); refresh(); } }, iconCircle(ICONS.x, 'bare'))),
          h('figcaption', null,
            badge(x.r.label, x.r.tone),
            h('small', { text: x.r.reason }),
            x.simulated ? h('small', { class: 'gd-sim', text: x.label }) : null)));
      });
    }
    function addResult(source, label, simulated) {
      var url = source.toDataURL ? source.toDataURL('image/jpeg', 0.82) : source.src;
      results.push({ label: label, simulated: simulated, url: url, r: M.grade.analyze(source) });
    }
    fileInput.addEventListener('change', function () {
      var files = Array.prototype.slice.call(fileInput.files || []);
      if (!files.length) return;
      busy.textContent = 'Grading ' + files.length + ' photo(s)…';
      Promise.all(files.map(function (f) {
        var u = URL.createObjectURL(f);
        return M.grade.loadImage(u).then(function (img) { addResult(img, f.name, false); });
      })).catch(function () { toast('One of those files could not be read as an image.'); })
        .then(function () { busy.textContent = ''; fileInput.value = ''; manual = false; drawPhotos(); refresh(); });
    });
    function useDemo() {
      busy.textContent = 'Grading demo photos…';
      M.grade.demoSamples(p.category).then(function (samples) {
        samples.forEach(function (s) { addResult(s.source, s.label, s.simulated); });
        busy.textContent = ''; manual = false; drawPhotos(); refresh();
      });
    }

    qtyInput.addEventListener('input', refresh);
    [aIn, cIn, kIn].forEach(function (el) { el.addEventListener('input', function () { manual = true; drawPlan(); }); });
    listCosmetic.addEventListener('change', drawPlan);
    showMarks.addEventListener('change', function () { photoGrid.classList.toggle('marks-off', !showMarks.checked); });

    var confirmBtn = h('button', { class: 'btn btn-sm btn-forest', type: 'button', text: 'Confirm harvest', onclick: function () {
      var pl = plan();
      if (!pl.sumOk) { drawPlan(); return; }
      var graded = results.length > 0 || pl.C > 0 || pl.K > 0;
      var r = H.markHarvested(b.id, pl.qty, graded ? { A: pl.A, cosmetic: pl.C, check: pl.K, photos: results.length } : null);
      if (!r.ok) { errorBox.textContent = r.error; return; }
      var msg = p.title + ': ' + r.served + ' kept for pre-orders, ' + r.toStock + ' added to stock.';
      if (pl.listQty && listCosmetic.checked) {
        var until = new Date(Date.now() + 3 * 864e5);
        var lr = M.clearance.create({
          productId: p.id, qty: pl.listQty, clearancePriceCents: Math.round(p.priceCents * COSMETIC_RATE),
          minPriceCents: Math.round(p.priceCents * M.RULES.clearanceDefaultMinRate), reason: 'cosmetic', availableUntil: M.clearance.dayKey(until)
        }, session.email);
        if (lr.ok) { M.audit(session.email, 'clearance.listed', lr.id); msg += ' ' + pl.listQty + ' cosmetic listed on Buy to Clear.'; }
        else msg += ' Could not list cosmetic stock: ' + lr.error;
      }
      if (r.held) msg += ' ' + r.held + ' held for inspection.';
      if (r.shortfall) msg += ' Short by ' + r.shortfall + ' — contact the affected customers.';
      closeDialog();
      commit('harvest.harvested', b.id, msg);
    } });

    var gradeSection = gradable
      ? h('section', { class: 'gd-section' },
          h('div', { class: 'gd-section-head' },
            h('div', null, h('h3', { text: 'Grade from photos (optional)' }), aiPill()),
            h('p', { class: 'hint', text: 'Photograph a few bunches. Each photo is checked for yellowing and browning on the leaves, and the share of grades splits the harvest below. It judges looks only, never food safety, and you can change every number.' })),
          h('div', { class: 'actions' },
            h('button', { class: 'btn btn-sm btn-forest', type: 'button', text: 'Add photos', onclick: function () { fileInput.click(); } }),
            h('button', { class: 'btn btn-sm btn-outline', type: 'button', text: 'Use demo photos', onclick: useDemo }),
            h('label', { class: 'toggle' }, showMarks, h('span', { text: 'Show marked areas' })),
            busy, fileInput),
          photoGrid)
      : h('p', { class: 'callout', text: 'Photo grading reads leaf colour, so it is only offered for leafy greens and herbs — not ' + M.CATEGORIES[p.category].label.toLowerCase() + '. Enter the split by hand if needed.' });

    append(dlg,
      h('button', { class: 'pd-close', type: 'button', 'aria-label': 'Close', onclick: closeDialog }, iconCircle(ICONS.x, 'bare')),
      h('div', { class: 'gd-body' },
        h('h2', { id: 'gd-title', text: 'Record harvest — ' + p.title }),
        h('p', { class: 'hint', text: 'Planned for ' + shortWeekday(dayKeyDate(b.harvestDate).toISOString()) + ' · expected ' + b.expectedQty + ' · ' + reserved + ' pre-ordered' }),
        h('label', { class: 'gd-qty' }, 'Harvested quantity', qtyInput),
        gradeSection,
        h('section', { class: 'gd-section' },
          h('h3', { text: 'Split' }),
          splitBar,
          h('div', { class: 'gd-split' },
            h('label', null, h('span', { class: 'gd-dot seg-a' }), 'Grade A', aIn),
            h('label', null, h('span', { class: 'gd-dot seg-c' }), 'Cosmetic', cIn),
            h('label', null, h('span', { class: 'gd-dot seg-k' }), 'Check', kIn)),
          h('label', { class: 'toggle' }, listCosmetic, h('span', { text: 'List cosmetic units on Buy to Clear (30% off, 3 days)' })),
          errorBox,
          h('strong', { class: 'gd-plan-title', text: 'What happens' }),
          planBox)),
      h('div', { class: 'r-actions' },
        h('button', { class: 'btn btn-sm btn-outline', type: 'button', text: 'Cancel', onclick: closeDialog }),
        confirmBtn));

    dlg.addEventListener('close', function () { dlg.remove(); });
    document.body.appendChild(dlg);
    if (gradable) drawPhotos();
    refresh();
    dlg.showModal();
  }

  function harvestView(root) {
    append(root, festiveSowPanel());
    var H = M.harvest;
    var upcoming = H.upcoming();
    var weekKey = M.clearance.dayKey(new Date(Date.now() + 7 * 864e5));
    var dueSoon = upcoming.filter(function (b) { return b.harvestDate <= weekKey; });
    var preordered = 0, preorderValue = 0, capTotal = 0;
    upcoming.forEach(function (b) {
      var n = H.preordered(b);
      preordered += n; preorderValue += n * b.preorderPriceCents; capTotal += b.preorderCap;
    });

    append(root, h('div', { class: 'kpis' },
      kpi('Growing now', String(upcoming.filter(function (b) { return H.stage(b) === 'growing'; }).length), upcoming.length + ' batches planned in total'),
      kpi('Harvests · 7 days', String(dueSoon.length), dueSoon.reduce(function (s, b) { return s + b.expectedQty; }, 0) + ' units expected'),
      kpi('Pre-ordered', String(preordered), money(preorderValue) + ' sold before harvest'),
      kpi('Pre-order fill', (capTotal ? Math.round(preordered / capTotal * 100) : 0) + '%', 'of ' + capTotal + ' spots opened')));

    /* ---- a. Timeline: sow → harvest, with today marked ---- */
    var winStart = new Date(); winStart.setHours(0, 0, 0, 0); winStart = new Date(winStart.getTime() - 42 * 864e5);
    var winEnd = new Date(winStart.getTime() + 63 * 864e5);
    var span = winEnd - winStart;
    var pos = function (t) { return Math.max(0, Math.min(100, (t - winStart) / span * 100)); };
    var todayPct = pos(Date.now());
    var ticks = [];
    for (var t = winStart.getTime(); t < winEnd.getTime(); t += 14 * 864e5) ticks.push(t);
    var timeline = h('div', { class: 'gantt', role: 'img', 'aria-label': 'Growing timeline: each bar runs from sow date to harvest date' },
      h('div', { class: 'gantt-row gantt-axis' }, h('span', { class: 'gantt-label' }),
        h('div', { class: 'gantt-track' }, ticks.map(function (tk) {
          var s = h('span', { class: 'gantt-tick', text: shortDate(new Date(tk).toISOString()) });
          s.style.left = pos(tk) + '%';
          return s;
        }))),
      upcoming.map(function (b) {
        var p = M.byId('products', b.productId);
        var sow = dayKeyDate(b.sowDate).getTime(), harvest = dayKeyDate(b.harvestDate).getTime();
        var bar = h('span', { class: 'gantt-bar st-' + H.stage(b), title: p.title + ': sown ' + shortDate(new Date(sow).toISOString()) + ', harvest ' + shortDate(new Date(harvest).toISOString()) },
          h('span', { class: 'gantt-grown' }));
        bar.style.left = pos(sow) + '%';
        bar.style.width = Math.max(1.5, pos(harvest) - pos(sow)) + '%';
        bar.firstChild.style.width = H.growthPct(b) + '%';
        var today = h('span', { class: 'gantt-today', 'aria-hidden': 'true' });
        today.style.left = todayPct + '%';
        return h('div', { class: 'gantt-row' },
          h('span', { class: 'gantt-label' }, h('strong', { text: p.title }), h('small', { text: shortWeekday(dayKeyDate(b.harvestDate).toISOString()) })),
          h('div', { class: 'gantt-track' }, bar, today));
      }));
    append(root, panel('Growing timeline', 'Each bar runs from sowing to harvest; the darker part has grown so far. The gold line is today.',
      upcoming.length ? timeline : h('p', { class: 'empty', text: 'Nothing planned yet — add a batch below.' })));

    /* ---- b. Upcoming batches with pre-orders and a demand signal ---- */
    function promote(b) {
      var p = M.byId('products', b.productId);
      var id = M.nextId('CP');
      S().campaigns.unshift({
        id: id, kind: 'preorder-push', productId: p.id, title: p.title + ' — Pre-order', language: 'en',
        message: 'Pre-order the next harvest 🌱 Our ' + p.title + ' will be picked on ' + shortWeekday(dayKeyDate(b.harvestDate).toISOString()) +
          ' and delivered the same day. Reserve yours by ' + cutoffText(H.cutoff(b)) + ' — only ' + H.left(b) + ' spots left. Reply STOP to opt out.',
        audience: audienceFor(p.id).eligible, status: 'pending_approval', createdBy: session.email, approvedBy: null, createdAt: new Date().toISOString(), sentCount: 0
      });
      commit('campaign.submitted', id, 'Pre-order promo drafted in Campaign Studio — needs admin approval before it sends.');
    }
    function recordHarvest(b) { openHarvestDialog(b); }
    function cancelBatch(b) {
      var p = M.byId('products', b.productId);
      var lines = H.lines(b.id);
      if (!confirm('Cancel the ' + p.title + ' batch due ' + shortDate(dayKeyDate(b.harvestDate).toISOString()) + '?' +
        (lines.length ? ' ' + lines.length + ' pre-order line(s) will need refunding in Orders.' : ''))) return;
      H.cancel(b.id);
      commit('harvest.cancelled', b.id, p.title + ' batch cancelled.' + (lines.length ? ' Refund ' + lines.length + ' pre-order line(s) in Orders.' : ''));
    }

    append(root, panel(aiTitle('Upcoming batches'), 'Pre-orders reserve part of the expected yield before it is picked. The demand note is rule-based and only advises — it never changes prices or quantities.',
      h('div', { class: 'harvest-table' }, table([
        { label: 'Product', render: function (b) { var p = M.byId('products', b.productId); return h('span', null, h('strong', { text: p.title }), h('br'), h('small', { text: b.id })); } },
        { label: 'Harvest', render: function (b) {
          return h('span', null, h('strong', { text: shortWeekday(dayKeyDate(b.harvestDate).toISOString()) }), h('br'),
            h('small', { text: inDaysText(b.harvestDate) + ' · sown ' + shortDate(dayKeyDate(b.sowDate).toISOString()) }));
        } },
        { label: 'Stage', render: function (b) { return statusBadge(H.stage(b)); } },
        { label: 'Expected', num: true, render: function (b) { return String(b.expectedQty); } },
        { label: 'Pre-orders', render: function (b) {
          var taken = H.preordered(b);
          return h('div', { class: 'po-cell' }, fillBar(taken, b.preorderCap),
            h('small', { text: taken + ' / ' + b.preorderCap + ' · ' + (H.isOpen(b) ? 'closes ' + cutoffText(H.cutoff(b)) : 'closed') }));
        } },
        { label: 'Demand', render: function (b) { var sg = H.signal(b); return h('div', { class: 'signal-cell' }, badge(sg.label, sg.tone), h('small', { text: sg.reason })); } },
        { label: 'Actions', render: function (b) {
          var acts = [];
          if (H.isOpen(b)) acts.push(mini('Promote', function () { promote(b); }, { title: 'Draft a pre-order WhatsApp promo for approval' }));
          acts.push(mini('Record harvest', function () { recordHarvest(b); }));
          acts.push(mini('Cancel', function () { cancelBatch(b); }, { danger: true }));
          return h('div', { class: 'actions' }, acts);
        } }
      ], upcoming, 'No upcoming batches.'))));

    /* ---- c. Plan a new batch ---- */
    var fresh = S().products.filter(function (p) { return p.meodGrown && !p.bagOffer; });
    var productSel = h('select', { name: 'product' }, fresh.map(function (p) { return h('option', { value: p.id, text: p.title }); }));
    var todayKey = M.clearance.dayKey(new Date());
    var sowInput = h('input', { name: 'sow', type: 'date', value: todayKey });
    var harvestInput = h('input', { name: 'harvest', type: 'date', min: todayKey });
    var qtyInput = h('input', { name: 'qty', type: 'number', min: 1, step: 1, value: '50' });
    var capInput = h('input', { name: 'cap', type: 'number', min: 0, step: 1 });
    var priceInput = h('input', { name: 'price', type: 'number', min: 0, step: '0.01' });
    var planHint = h('p', { class: 'callout green', 'aria-live': 'polite' });
    var errorBox = h('p', { class: 'pf-error', 'aria-live': 'polite' });

    function suggestHarvest() {
      var p = M.byId('products', productSel.value);
      var sow = sowInput.value ? dayKeyDate(sowInput.value) : new Date();
      var grow = M.RULES.growDays[p.category] || 30;
      harvestInput.value = M.clearance.dayKey(H.dayOnOrAfter(new Date(sow.getTime() + grow * 864e5)));
    }
    function refreshHint() {
      var p = M.byId('products', productSel.value);
      var wk = H.weeklySales(p.id);
      var hk = harvestInput.value;
      planHint.textContent = p.title + ' usually takes about ' + (M.RULES.growDays[p.category] || 30) + ' days to grow' +
        (hk ? ', so it would be ready ' + shortWeekday(dayKeyDate(hk).toISOString()) : '') + '. ' +
        (wk >= 1 ? 'Recent sales: about ' + Math.round(wk) + ' a week.' : 'Few regular sales in the last 4 weeks.') +
        ' Pre-orders close the night before harvest.';
    }
    function applyDefaults() {
      var p = M.byId('products', productSel.value);
      priceInput.value = centsToDollars(p.priceCents);
      capInput.value = String(Math.round((parseInt(qtyInput.value, 10) || 0) * M.RULES.preorderDefaultShare));
      suggestHarvest();
      refreshHint();
    }
    productSel.addEventListener('change', applyDefaults);
    sowInput.addEventListener('change', function () { suggestHarvest(); refreshHint(); });
    harvestInput.addEventListener('change', refreshHint);
    qtyInput.addEventListener('input', function () { capInput.value = String(Math.round((parseInt(qtyInput.value, 10) || 0) * M.RULES.preorderDefaultShare)); });
    if (fresh.length) applyDefaults();

    var form = h('form', { class: 'form-grid harvest-form', novalidate: true },
      h('label', null, 'Product', productSel),
      h('label', null, 'Sow date', sowInput),
      h('label', null, 'Harvest date', harvestInput),
      h('label', null, 'Expected yield', qtyInput),
      h('label', null, 'Pre-order spots', capInput),
      h('label', null, 'Pre-order price (S$)', priceInput),
      h('div', { style: 'grid-column:1/-1' }, errorBox),
      h('div', { style: 'grid-column:1/-1' }, h('button', { class: 'btn btn-sm btn-forest', type: 'submit', text: 'Add batch' })));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = {
        productId: productSel.value, sowDate: sowInput.value, harvestDate: harvestInput.value,
        expectedQty: parseInt(qtyInput.value, 10), preorderCap: parseInt(capInput.value, 10), preorderPriceCents: dollarsToCents(priceInput.value)
      };
      var r = H.create(data, session.email);
      if (!r.ok) { errorBox.textContent = r.error; return; }
      var p = M.byId('products', data.productId);
      commit('harvest.planned', r.id, p.title + ' batch added — ' + data.preorderCap + ' spots open for pre-order.');
    });
    append(root, panel('Plan a new batch', 'The harvest date is suggested from typical growing time and snapped to a delivery day (Tue, Thu, Sat). Growing times are illustrative — MEOD to confirm.',
      planHint, form));

    /* ---- d. Pre-orders to pack, by harvest day ---- */
    var byDay = {};
    upcoming.forEach(function (b) {
      H.lines(b.id).forEach(function (l) { (byDay[b.harvestDate] = byDay[b.harvestDate] || []).push({ batch: b, order: l.order, item: l.item }); });
    });
    var dayKeys = Object.keys(byDay).sort();
    append(root, panel('Pre-orders to pack', 'Picked and packed on harvest morning, delivered the same day.',
      dayKeys.length ? dayKeys.map(function (k) {
        var rows = byDay[k];
        var units = rows.reduce(function (s, r) { return s + r.item.qty; }, 0);
        return h('div', { class: 'pack-day' },
          h('h3', null, weekdayLongLabel(dayKeyDate(k)), h('small', { text: ' · ' + rows.length + ' line(s), ' + units + ' units' })),
          table([
            { label: 'Order', render: function (r) { return r.order.ref; } },
            { label: 'Customer', render: function (r) { return customerLabel(r.order.customerId); } },
            { label: 'Product', render: function (r) { return M.byId('products', r.batch.productId).title; } },
            { label: 'Qty', num: true, render: function (r) { return String(r.item.qty); } },
            { label: 'Payment', render: function (r) { return statusBadge(r.order.status); } }
          ], rows));
      }) : h('p', { class: 'empty', text: 'No pre-orders yet.' })));

    /* ---- e. Recent harvests ---- */
    var done = S().batches.filter(function (b) { return b.status === 'harvested'; })
      .sort(function (a, b) { return a.harvestDate < b.harvestDate ? 1 : -1; }).slice(0, 8);
    append(root, panel('Recent harvests', null, table([
      { label: 'Product', render: function (b) { return M.byId('products', b.productId).title; } },
      { label: 'Harvested', render: function (b) { return shortDate(b.harvestedAt || dayKeyDate(b.harvestDate).toISOString()); } },
      { label: 'Expected', num: true, render: function (b) { return String(b.expectedQty); } },
      { label: 'Actual', num: true, render: function (b) {
        var diff = b.actualQty - b.expectedQty;
        return h('span', null, String(b.actualQty), ' ', h('small', { class: diff < 0 ? 'bag-value-low' : 'bag-value-ok', text: (diff >= 0 ? '+' : '') + diff }));
      } },
      { label: 'Pre-ordered', num: true, render: function (b) { return String(H.preordered(b)); } },
      { label: 'Sell by', render: function (b) { return b.sellBy ? h('a', { href: '#rescue', text: shortWeekday(M.clearance.parseDayKey(b.sellBy).toISOString()) }) : '—'; } },
      { label: 'Grades', render: function (b) {
        if (!b.grades) return '—';
        return h('span', null, b.grades.A + ' A · ' + b.grades.cosmetic + ' cosmetic · ' + b.grades.check + ' check', h('br'),
          h('small', { text: b.grades.photos ? 'from ' + b.grades.photos + ' photo(s), staff-confirmed' : 'entered by staff' }));
      } }
    ], done, 'No harvests recorded yet.')));
  }

  /* ---------------- Price Advisor + Margin Guard (staff + admin) ----------------
   * Suggestions come from Demand Radar and Harvest Rescue; every one shows its Margin Guard
   * result. Staff send a suggestion for approval; an admin who didn't propose it approves,
   * which turns a discount into a Buy to Clear listing. A checker lets anyone try a price. */
  var PRICE_KIND = { discount: ['Discount', 'amber'], bundle: ['Bundle', 'green'], hold: ['Hold price', 'blue'] };
  function guardBox(g, label) {
    return h('div', { class: 'guard ' + (g.ok ? 'pass' : 'block') },
      h('strong', { text: (g.ok ? '✓ Passes Margin Guard' : '✗ Blocked by Margin Guard') + (label ? ' · ' + label : '') }),
      h('small', { text: g.ok
        ? money(g.marginCents) + ' margin per unit (' + g.marginPct + '%) after ' + money(g.cost.totalCents) + ' cost · floor ' + money(g.floorCents)
        : g.reasons.join('; ') + '. Lowest allowed: ' + money(g.floorCents) + (g.maxDiscountPct != null ? ' (' + g.maxDiscountPct + '% off)' : '') + '.' }));
  }
  function pricingView(root) {
    var sugs = M.pricing.suggestions();
    var proposals = S().priceProposals || [];
    var pending = proposals.filter(function (p) { return p.status === 'pending'; });
    var canApprove = M.auth.can(session, 'pricing.approve');
    var blocked = sugs.filter(function (s) { return s.kind !== 'hold' && !s.guard.ok; }).length;
    var fresh = S().products.filter(function (p) { return p.meodGrown && p.category !== 'farm-more' && !p.bagOffer; });
    var avgMargin = Math.round(fresh.reduce(function (s, p) { return s + M.pricing.guard(p.id, p.priceCents).marginPct; }, 0) / (fresh.length || 1));

    append(root, h('div', { class: 'kpis' },
      kpi('Suggestions', String(sugs.length), sugs.filter(function (s) { return s.kind !== 'hold'; }).length + ' price changes · ' + sugs.filter(function (s) { return s.kind === 'hold'; }).length + ' holds'),
      kpi('Blocked by Margin Guard', String(blocked), 'would go below cost or the minimum price'),
      kpi('Waiting for approval', String(pending.length), canApprove ? 'you can approve others\' proposals' : 'an admin approves'),
      kpi('Average margin', avgMargin + '%', 'fresh produce at normal prices (illustrative costs)')));

    /* ---- Suggestions ---- */
    function sendForApproval(s) {
      var r = M.pricing.propose(s, session.email);
      if (!r.ok) { toast(r.error); return; }
      commit('pricing.proposed', r.id, s.product.title + (s.kind === 'bundle' ? ' + ' + s.partner.title + ' bundle' : '') + ' at ' + money(s.priceCents) + ' sent for approval.');
    }
    append(root, panel(aiTitle('Price suggestions'), 'From Demand Radar and Harvest Rescue. Every price is checked by Margin Guard first; nothing changes until an admin who didn\'t propose it approves.',
      sugs.length ? h('div', { class: 'ops-brief' }, sugs.map(function (s) {
        var k = PRICE_KIND[s.kind];
        var pendingFor = pending.filter(function (pp) { return pp.productId === s.product.id && pp.kind === s.kind; })[0];
        var priceLine = s.kind === 'hold'
          ? h('div', { class: 'price-line' }, h('strong', { text: money(s.priceCents) }), h('small', { text: 'keep normal price' }))
          : h('div', { class: 'price-line' },
              h('span', { class: 'price-was', text: money(s.fullCents || s.product.priceCents) }), h('strong', { text: money(s.priceCents) }), h('span', { class: 'discount-badge', text: '−' + s.pct + '%' }));
        // Every card ends in one same-size pill: an action, a link, or a status.
        var act = s.kind === 'hold' ? h('span', { class: 'pa-act pa-status', text: 'No action needed' })
          : pendingFor ? h('span', { class: 'pa-act pa-status pending', text: 'Waiting for approval' })
          : !s.guard.ok ? h('a', { class: 'pa-act btn btn-sm btn-outline', href: '#rescue', text: 'See rescue options' })
          : h('button', { class: 'pa-act btn btn-sm btn-forest', type: 'button', text: 'Send for approval', onclick: function () { sendForApproval(s); } });
        return h('article', { class: 'ops-card pa-card' + (s.kind === 'hold' ? '' : s.guard.ok ? ' farm' : ' blocked') },
          h('div', { class: 'ops-card-head' }, h('span', { class: 'rw-tier-cell' }, thumbMini(s.product), s.partner ? thumbMini(s.partner) : null), h('span', { class: 'why-wrap' }, whyBtn(s.product.title + ' price', function () { return M.decisions.explainPrice(s); }, pendingFor ? pendingFor.id : null), badge(k[0], k[1]))),
          h('strong', { class: 'ops-title', text: s.kind === 'bundle' ? s.product.title + ' + ' + s.partner.title + ' bundle' : s.product.title }),
          priceLine,
          h('p', { text: s.reason }),
          s.kind !== 'hold' ? guardBox(s.guard) : h('div', { class: 'guard hold' }, h('strong', { text: 'Price stays the same' }), h('small', { text: 'Nothing for Margin Guard to check.' })),
          h('small', { class: 'ops-est', text: s.effect }),
          h('div', { class: 'ops-foot' }, h('small', { text: s.qty && s.kind !== 'hold' ? 'for ' + s.qty + ' unit(s)' : '' }), act));
      })) : h('p', { class: 'empty', text: 'No price changes suggested right now.' })));

    /* ---- Proposals ---- */
    function decide(pp, approve) {
      var r = M.pricing.decide(pp.id, approve, session.email);
      if (!r.ok) { toast(r.error); return; }
      var p = M.byId('products', pp.productId);
      commit('pricing.' + (approve ? 'approved' : 'rejected'), pp.id, approve
        ? (pp.kind === 'discount' ? p.title + ' listed on Buy to Clear at ' + money(pp.toCents) + '.' : 'Bundle approved — publish it in MEOD Fresh.')
        : 'Proposal for ' + p.title + ' rejected.');
    }
    append(root, panel('Price proposals', 'Approved discounts become Buy to Clear listings (checked again by Margin Guard at that moment). Approved bundles are recorded for MEOD Fresh to publish.', table([
      { label: 'Proposal', render: function (pp) {
        var p = M.byId('products', pp.productId), q = pp.partnerId ? M.byId('products', pp.partnerId) : null;
        return h('span', null, h('strong', { text: p.title + (q ? ' + ' + q.title : '') }), h('br'), h('small', { text: pp.reason }));
      } },
      { label: 'Type', render: function (pp) { var k = PRICE_KIND[pp.kind] || [pp.kind, 'grey']; return badge(k[0], k[1]); } },
      { label: 'Price', render: function (pp) { return h('span', { class: 'pp-price' }, h('span', { class: 'price-was', text: money(pp.fromCents) }), h('strong', { text: money(pp.toCents) })); } },
      { label: 'Qty', num: true, render: function (pp) { return String(pp.qty); } },
      { label: 'By', render: function (pp) { return h('span', null, pp.createdBy, pp.decidedBy ? [h('br'), h('small', { text: pp.status + ' by ' + pp.decidedBy })] : null); } },
      { label: 'Status', render: function (pp) { return statusBadge(pp.status); } },
      { label: 'Actions', render: function (pp) {
        if (pp.status !== 'pending') return pp.listingId ? h('a', { class: 'mini', href: '#clearance', text: 'View listing' }) : '—';
        if (!canApprove) return h('small', { text: 'Waiting for admin' });
        var own = pp.createdBy === session.email;
        return h('div', { class: 'actions' },
          mini('Approve', function () { decide(pp, true); }, { disabled: own, title: own ? 'You can\'t approve your own proposal' : null }),
          mini('Reject', function () { decide(pp, false); }, { danger: true }));
      } }
    ], proposals, 'No proposals yet — send a suggestion above for approval.')));

    append(root, promoSimulatorPanel());

    /* ---- Margin Guard checker ---- */
    var sel = h('select', { 'aria-label': 'Product' }, S().products.filter(function (p) { return !p.bagOffer; }).map(function (p) { return h('option', { value: p.id, text: p.title + ' (' + money(p.priceCents) + ')' }); }));
    var priceIn = h('input', { type: 'number', min: 0, step: '0.05', 'aria-label': 'Price to check (S$)' });
    var out = h('div', { class: 'guard-out', 'aria-live': 'polite' });
    var costsOut = h('div', { class: 'guard-cost-box' });
    function check() {
      var p = M.byId('products', sel.value);
      var c = Math.round((parseFloat(priceIn.value) || 0) * 100);
      var g = M.pricing.guard(p.id, c);
      out.textContent = '';
      costsOut.textContent = '';
      append(out, guardBox(g, money(c) + (p.priceCents ? ' (' + Math.round((1 - c / p.priceCents) * 100) + '% off)' : '')));
      append(costsOut,
        h('h3', { text: 'Cost breakdown · ' + p.title }),
        h('ul', { class: 'guard-costs' },
          h('li', null, h('span', { text: 'Growing' }), h('span', { text: money(g.cost.growCents) })),
          h('li', null, h('span', { text: 'Packaging' }), h('span', { text: money(g.cost.packCents) })),
          h('li', null, h('span', { text: 'Handling' }), h('span', { text: money(g.cost.handleCents) })),
          h('li', { class: 'tot' }, h('span', { text: 'Unit cost' }), h('span', { text: money(g.cost.totalCents) })),
          h('li', null, h('span', { text: 'Floor (' + (g.floorBy === 'cost' ? 'cost + ' + Math.round(M.RULES.minMarginRate * 100) + '% margin' : Math.round(M.RULES.clearanceDefaultMinRate * 100) + '% minimum price') + ')' }), h('span', { text: money(g.floorCents) }))));
    }
    sel.addEventListener('change', function () { priceIn.value = (M.byId('products', sel.value).priceCents * 0.8 / 100).toFixed(2); check(); });
    priceIn.addEventListener('input', check);
    priceIn.value = (M.byId('products', sel.value).priceCents * 0.8 / 100).toFixed(2);
    check();
    append(root, panel('Margin Guard checker', 'Try any price before proposing it. Costs are illustrative — MEOD would enter real growing, packaging and handling costs.',
      h('div', { class: 'guard-layout' },
        h('div', { class: 'guard-left' }, h('div', { class: 'form-grid guard-form' }, h('label', null, 'Product', sel), h('label', null, 'Price (S$)', priceIn)), out),
        costsOut)));
  }

  /* ---------------- Feedback intelligence (staff + admin) ----------------
   * Feedback from every channel, tagged by theme and traced to the harvest batch or delivery
   * round it came from. Patterns (2+ reports with the same cause) come first, with a likely
   * cause and next steps: flag the batch, message the people affected (staff send), or mark
   * resolved. A log form tags new feedback as you type. */
  function fbWho(f) {
    if (f.customerId) return customerLabel(f.customerId);
    if (f.accountId) { var a = M.b2b.store().accounts.filter(function (x) { return x.id === f.accountId; })[0]; return a ? a.name : 'Trade buyer'; }
    return f.who || 'Guest';
  }
  function fbThemeBadges(x) {
    return x.themes.map(function (k) { var th = M.feedback.THEMES[k]; return th ? badge(th.label, th.tone) : badge('Other', 'grey'); });
  }
  function fbDay(key) { return M.clearance.parseDayKey(key).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' }); }
  function fbStars(r) { return r == null ? '—' : '★★★★★'.slice(0, r) + '☆☆☆☆☆'.slice(0, 5 - r); }

  function openApology(g) {
    document.querySelectorAll('.fb-dialog').forEach(function (d) { if (d.open) d.close(); d.remove(); });
    var people = [];
    g.items.forEach(function (x) {
      var id = x.f.customerId || x.f.accountId;
      if (id && people.indexOf(id) < 0) people.push(id);
    });
    var names = people.map(function (id) { return id.indexOf('C-') === 0 ? customerLabel(id) : fbWho({ accountId: id }); });
    var what = g.theme === 'late' ? 'your delivery arriving late' : g.theme === 'missing' ? 'the item missing from your order'
      : 'the ' + (g.product ? g.product.title : 'produce') + ' not being up to our usual standard';
    var fix = g.theme === 'late' ? 'We\'re reviewing that delivery round so it doesn\'t happen again.'
      : g.batch ? 'We\'ve traced it to one harvest batch and are checking how it was cooled and packed.' : 'We\'re looking into what went wrong.';
    var body = h('textarea', { rows: 8, 'aria-label': 'Message' });
    body.value = 'Hi {first_name},\n\nSorry about ' + what + ' — thank you for telling us. ' + fix +
      '\n\nWe\'d like to make it right: reply here and we\'ll replace it on your next delivery, free.\n\n— The MEOD Farm team';
    var dlg = h('dialog', { class: 'receipt-dialog reply-dialog fb-dialog', 'aria-labelledby': 'fb-title' });
    function closeDialog() { if (dlg.open) dlg.close(); dlg.remove(); }
    append(dlg,
      h('button', { class: 'pd-close', type: 'button', 'aria-label': 'Close', onclick: closeDialog }, iconCircle(ICONS.x, 'bare')),
      h('div', { class: 'rd-body' },
        h('div', { class: 'rd-head' }, h('h2', { id: 'fb-title', text: 'Message ' + people.length + ' person(s) affected' }), aiPill(), h('small', { class: 'ai-note', text: 'You review and send' })),
        h('div', { class: 'rd-form' },
          h('label', null, 'To', h('input', { value: names.join(', '), readonly: true })),
          h('label', null, 'Message', body),
          h('small', { class: 'pf-hint', text: 'A service reply about their own order, so it goes to everyone affected — not only people who opted in to promotions. {first_name} is filled in per person.' }))),
      h('div', { class: 'r-actions' },
        h('button', { class: 'btn btn-sm btn-outline', type: 'button', text: 'Cancel', onclick: closeDialog }),
        h('button', { class: 'btn btn-sm btn-forest', type: 'button', text: 'Send (simulated)', onclick: function () {
          M.feedback.log(g.key, 'apology', session.email, people.length + ' person(s)');
          closeDialog();
          commit('feedback.apology', g.key, 'Apology sent to ' + people.length + ' person(s) (simulated).');
        } })));
    dlg.addEventListener('close', function () { dlg.remove(); });
    document.body.appendChild(dlg);
    dlg.showModal();
  }

  function feedbackView(root) {
    var all = M.feedback.items();
    var since = Date.now() - 14 * 864e5;
    var recent = all.filter(function (x) { return new Date(x.f.at).getTime() > since; });
    var rated = recent.filter(function (x) { return x.f.rating != null; });
    var avg = rated.length ? (rated.reduce(function (s, x) { return s + x.f.rating; }, 0) / rated.length).toFixed(1) : '—';
    var issues = recent.filter(function (x) { return x.sentiment !== 'pos'; });
    var clusters = M.feedback.clusters(14);
    var patterns = clusters.filter(function (g) { return g.pattern && !g.resolved; });

    append(root, h('div', { class: 'kpis' },
      kpi('Feedback · 14 days', String(recent.length), 'ratings, chats, tickets, trade buyers and visits'),
      kpi('Average rating', avg + (rated.length ? ' / 5' : ''), rated.length + ' delivery rating(s)'),
      kpi('Issues', String(issues.length), recent.length ? Math.round(issues.length / recent.length * 100) + '% of feedback' : 'none'),
      kpi('Patterns found', String(patterns.length), 'issues that share a batch or delivery round')));

    /* ---- Patterns ---- */
    function flag(g) {
      var r = M.feedback.flagBatch(g.batch.id, g.theme, session.email, g.items.length + ' report(s)');
      if (!r.ok) { toast(r.error); return; }
      M.feedback.log(g.key, 'flagged', session.email, g.batch.id);
      commit('feedback.flagged', g.batch.id, g.product.title + ' batch from ' + fbDay(g.batch.harvestDate) + ' flagged for a quality check.');
    }
    function resolve(g) {
      var note = prompt('What was done? (optional)', g.theme === 'late' ? 'Route reviewed with the driver' : g.batch ? 'Cold-room checked; packing step fixed' : '');
      if (note === null) return;
      M.feedback.resolve(g.key, session.email, note, g.title);
      commit('feedback.resolved', g.key, 'Marked as resolved.');
    }
    var active = clusters.filter(function (g) { return !g.resolved; });
    append(root, panel(aiTitle('Issues and likely causes'), 'Last 14 days. Reports that share a harvest batch or delivery round are grouped, with the most likely cause. Staff decide what to do — nothing is sent automatically.',
      active.length ? h('div', { class: 'ops-brief fb-patterns aligned', style: '--rows:6' }, active.map(function (g) {
        var th = M.feedback.THEMES[g.theme];
        var people = g.items.filter(function (x) { return x.f.customerId || x.f.accountId; }).length;
        return h('article', { class: 'ops-card' + (g.pattern ? ' fb-pattern' : '') },
          h('div', { class: 'ops-card-head' },
            g.product ? h('span', { class: 'rw-tier-cell' }, thumbMini(g.product)) : iconCircle(g.theme === 'late' ? ICONS.truck : ICONS.chat, 'soft'),
            h('span', { class: 'fb-tags' }, badge(th.label, th.tone), g.pattern ? badge('Pattern', 'red') : badge('One-off', 'grey'))),
          h('strong', { class: 'ops-title', text: g.title }),
          h('p', { class: 'fb-cause', text: g.cause }),
          h('ul', { class: 'fb-quotes' }, g.items.slice(0, 3).map(function (x) {
            return h('li', null, h('q', { text: x.f.text }), h('small', { text: fbWho(x.f) + ' · ' + M.feedback.SOURCES[x.f.source] + ' · ' + ago(x.f.at) }));
          })),
          h('small', { class: 'ops-est', text: 'Owner: ' + g.owner + (g.batch && g.batch.qualityFlag ? ' · batch flagged by ' + g.batch.qualityFlag.by : '') + (g.apologised ? ' · apology sent' : '') }),
          h('div', { class: 'ops-foot fb-actions' },
            g.batch && !g.batch.qualityFlag ? mini('Flag batch', function () { flag(g); }) : null,
            people && !g.apologised ? mini('Message ' + people + ' affected', function () { openApology(g); }) : null,
            mini('Mark resolved', function () { resolve(g); })));
      })) : h('p', { class: 'empty', text: 'No open issues in the last 14 days. 🌱' })));

    /* ---- Resolved ---- */
    var done = M.feedback.resolvedList();
    append(root, panel('Resolved', 'Issues marked as resolved, with what was done. Reopen one if the problem comes back.', table([
      { label: 'Resolved', render: function (r) { return h('span', null, shortDate(r.at), h('br'), h('small', { text: r.by })); } },
      { label: 'Issue', render: function (r) { var th = M.feedback.THEMES[r.theme]; return h('span', { class: 'fb-cell' }, h('strong', { text: r.title || r.label + ' issue' }), h('span', { class: 'fb-tags' }, badge(r.label, th ? th.tone : 'grey'))); } },
      { label: 'What was done', render: function (r) { return r.note || '—'; } },
      { label: 'Actions', render: function (r) { return mini('Reopen', function () { var x = M.feedback.reopen(r.key, session.email); if (!x.ok) { toast(x.error); return; } commit('feedback.reopened', r.key, 'Issue reopened.'); }); } }
    ], done, 'Nothing resolved yet.')));

    /* ---- Themes + praise ---- */
    var trends = M.feedback.trends().filter(function (t) { return t.now || t.before; });
    var max = Math.max.apply(null, trends.map(function (t) { return Math.max(t.now, t.before); }).concat([1]));
    var praise = recent.filter(function (x) { return x.sentiment === 'pos'; }).slice(0, 4);
    append(root, h('div', { class: 'two-col fb-grid' },
      panel(aiTitle('Themes'), 'Last 14 days compared with the 14 days before.',
        h('ul', { class: 'fb-trends' }, trends.map(function (t) {
          var bar = h('span', { class: 'fb-bar tone-' + t.tone }, h('span'));
          bar.firstChild.style.width = Math.round(t.now / max * 100) + '%';
          var diff = t.now - t.before;
          return h('li', null,
            h('span', { class: 'fb-trend-label', text: t.label }), bar,
            h('strong', { text: String(t.now) }),
            h('small', { class: 'fb-diff ' + (diff === 0 ? '' : (t.theme === 'praise') === (diff > 0) ? 'good' : 'bad'), text: diff === 0 ? 'same' : (diff > 0 ? '▲ ' : '▼ ') + Math.abs(diff) }));
        }))),
      panel('What customers love', 'Worth sharing in posts and on the website — ask the person first before quoting them.',
        praise.length ? h('ul', { class: 'fb-quotes fb-praise' }, praise.map(function (x) {
          return h('li', null, h('q', { text: x.f.text }), h('small', { text: fbWho(x.f) + ' · ' + M.feedback.SOURCES[x.f.source] + (x.product ? ' · ' + x.product.title : '') }));
        })) : h('p', { class: 'empty', text: 'No praise logged in the last 14 days.' }))));

    /* ---- Log feedback ---- */
    var text = h('textarea', { rows: 3, maxlength: 400, placeholder: 'Paste or type what the customer said, e.g. "the kai lan was limp when it arrived"', 'aria-label': 'Feedback' });
    var source = h('select', { 'aria-label': 'Source' }, Object.keys(M.feedback.SOURCES).filter(function (k) { return k !== 'ticket'; }).map(function (k) { return h('option', { value: k, text: M.feedback.SOURCES[k] }); }));
    var who = h('select', { 'aria-label': 'Customer' }, h('option', { value: '', text: 'Not linked' }), S().customers.map(function (c) { return h('option', { value: c.id, text: c.name }); }),
      M.b2b.store().accounts.map(function (a) { return h('option', { value: a.id, text: a.name }); }));
    var prod = h('select', { 'aria-label': 'Product' }, h('option', { value: '', text: 'Not about one product' }), S().products.filter(function (p) { return p.meodGrown && !p.bagOffer; }).map(function (p) { return h('option', { value: p.id, text: p.title }); }));
    var day = h('input', { type: 'date', 'aria-label': 'Delivery date' }); day.value = M.clearance.dayKey(new Date(Date.now() - 864e5));
    var rating = h('select', { 'aria-label': 'Rating' }, h('option', { value: '', text: 'No rating' }), [5, 4, 3, 2, 1].map(function (n) { return h('option', { value: String(n), text: n + ' ★' }); }));
    var preview = h('div', { class: 'fb-preview', 'aria-live': 'polite' });
    function updatePreview() {
      preview.textContent = '';
      if (!text.value.trim()) { append(preview, h('small', { class: 'hint', text: 'AI tags the theme as you type.' })); return; }
      var c = M.feedback.classify(text.value, rating.value ? Number(rating.value) : null);
      var b = M.feedback.batchFor(prod.value, day.value);
      append(preview, aiPill(), c.themes.map(function (k) { var th = M.feedback.THEMES[k]; return th ? badge(th.label, th.tone) : badge('Other', 'grey'); }),
        badge(c.sentiment === 'pos' ? 'Positive' : c.sentiment === 'neg' ? 'Negative' : 'Mixed', c.sentiment === 'pos' ? 'green' : c.sentiment === 'neg' ? 'red' : 'grey'),
        h('small', { text: prod.value ? (b ? 'Links to the batch harvested ' + fbDay(b.harvestDate) : 'No harvested batch found before that date') : '' }));
    }
    [text, rating, prod, day].forEach(function (el) { el.addEventListener('input', updatePreview); el.addEventListener('change', updatePreview); });
    updatePreview();
    var form = h('form', { class: 'fb-form', novalidate: true, onsubmit: function (e) {
      e.preventDefault();
      var isAcc = who.value && who.value.indexOf('C-') !== 0;
      var r = M.feedback.add({ source: source.value, customerId: who.value && !isAcc ? who.value : null, accountId: isAcc ? who.value : null, productId: prod.value || null,
        deliveryKey: day.value || null, rating: rating.value ? Number(rating.value) : null, text: text.value }, session.email);
      if (!r.ok) { toast(r.error); return; }
      commit('feedback.logged', r.id, 'Feedback logged' + (r.batch ? ' and linked to the ' + fbDay(r.batch.harvestDate) + ' batch' : '') + '.');
    } },
      h('label', { class: 'fb-text' }, 'What they said', text),
      h('div', { class: 'form-grid fb-fields' },
        h('label', null, 'Source', source), h('label', null, 'From', who), h('label', null, 'Product', prod),
        h('label', null, 'Delivered', day), h('label', null, 'Rating', rating)),
      preview,
      h('div', { class: 'fb-submit' }, h('button', { class: 'btn btn-sm btn-forest', type: 'submit', text: 'Log feedback' })));
    append(root, panel('Log feedback', 'For comments that come in by phone, WhatsApp or at the farm. Linking a product and delivery date lets the AI trace it to a batch.', form));

    /* ---- All feedback ---- */
    append(root, panel('All feedback', 'Newest first. Support tickets marked as complaints appear here automatically.', table([
      { label: 'When', render: function (x) { return h('span', null, shortDate(x.f.at), h('br'), h('small', { text: M.feedback.SOURCES[x.f.source] + (x.f.ticketId ? ' ' + x.f.ticketId : '') })); } },
      { label: 'From', render: function (x) { return fbWho(x.f); } },
      { label: 'Feedback', render: function (x) { return h('span', { class: 'fb-cell' }, h('span', { text: x.f.text }), h('span', { class: 'fb-tags' }, fbThemeBadges(x))); } },
      { label: 'Batch', render: function (x) { return x.batch ? h('span', null, x.product.title, h('br'), h('small', { text: 'harvested ' + fbDay(x.batch.harvestDate) })) : x.product ? x.product.title : '—'; } },
      { label: 'Rating', render: function (x) { return h('span', { class: 'fb-stars', 'aria-label': x.f.rating != null ? x.f.rating + ' out of 5' : 'No rating', text: fbStars(x.f.rating) }); } }
    ], all.slice(0, 40), 'No feedback yet.')));
  }

  /* ---------------- Content studio (staff + admin) ----------------
   * Weekly post ideas for Instagram, Facebook and the WhatsApp channel, built from Demand
   * Radar, Harvest Planner, recipes, Feedback praise and a "support local / 2035" library.
   * Staff edit a caption and plan it for a day; someone else approves it; staff copy it into
   * the app and mark it posted. Nothing is posted automatically. */
  function csDay(key) { return M.clearance.parseDayKey(key).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' }); }
  function csTypeBadge(type) { var t = M.content.TYPES[type]; return badge(t.label, t.tone); }
  function csChecks(list) {
    return h('ul', { class: 'cs-checks' }, list.map(function (k) {
      return h('li', { class: k.warn ? 'warn' : k.ok ? 'ok' : 'bad', text: (k.warn ? '! ' : k.ok ? '✓ ' : '✗ ') + k.label });
    }));
  }
  function csCopy(caption, tags) {
    var text = caption + (tags && tags.length ? '\n\n' + tags.join(' ') : '');
    var done = function () { toast('Caption copied — paste it into the app.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { toast('Couldn\'t copy — select the text instead.'); });
    else toast('Couldn\'t copy — select the text instead.');
  }
  // Editor for a new idea (x) or an existing planned post (post).
  function openPostEditor(x, post) {
    document.querySelectorAll('.cs-dialog').forEach(function (d) { if (d.open) d.close(); d.remove(); });
    var src = post || x;
    var body = h('textarea', { rows: 11, maxlength: 2200, 'aria-label': 'Caption' }); body.value = src.caption;
    var tags = h('input', { 'aria-label': 'Hashtags' }); tags.value = (src.tags || []).join(' ');
    var day = h('select', { 'aria-label': 'Day' });
    for (var i = 0; i < 7; i++) {
      var k = M.clearance.dayKey(new Date(Date.now() + i * 864e5));
      day.appendChild(h('option', { value: k, text: csDay(k) + (i === 0 ? ' (today)' : '') }));
    }
    day.value = post ? post.dayKey : x.dayKey;
    var checks = h('div', { 'aria-live': 'polite' });
    function recheck() { checks.textContent = ''; append(checks, csChecks(M.content.check(body.value, src))); }
    body.addEventListener('input', recheck); recheck();
    var dlg = h('dialog', { class: 'receipt-dialog reply-dialog cs-dialog', 'aria-labelledby': 'cs-title' });
    function closeDialog() { if (dlg.open) dlg.close(); dlg.remove(); }
    function save() {
      var tagList = tags.value.split(/\s+/).filter(Boolean).map(function (t) { return t.charAt(0) === '#' ? t : '#' + t; });
      if (!body.value.trim()) { toast('Write a caption first.'); return; }
      if (post) {
        var r = M.content.update(post.id, body.value, day.value);
        if (!r.ok) { toast(r.error); return; }
        post.tags = tagList;
        closeDialog();
        commit('content.edited', post.id, 'Post updated' + (r.post.status === 'pending' ? ' — it needs approval again.' : '.'));
      } else {
        var r2 = M.content.plan(Object.assign({}, x, { tags: tagList }), body.value, day.value, session.email);
        closeDialog();
        commit('content.planned', r2.id, '"' + x.title + '" planned for ' + csDay(day.value) + ' — waiting for approval.');
      }
    }
    append(dlg,
      h('button', { class: 'pd-close', type: 'button', 'aria-label': 'Close', onclick: closeDialog }, iconCircle(ICONS.x, 'bare')),
      h('div', { class: 'rd-body' },
        h('div', { class: 'rd-head' }, h('h2', { id: 'cs-title', text: post ? 'Edit post' : src.title }), aiPill(), h('small', { class: 'ai-note', text: 'You edit, someone else approves' })),
        h('div', { class: 'cs-editor' },
          src.image ? h('img', { class: 'cs-editor-img', src: src.image, alt: '' }) : null,
          h('div', { class: 'rd-form' },
            h('div', { class: 'rd-controls' }, h('label', null, 'Post on', day), h('label', null, 'Where', h('input', { value: M.content.CHANNELS[src.channel], readonly: true }))),
            h('label', null, 'Caption', body),
            src.channel === 'whatsapp' ? null : h('label', null, 'Hashtags', tags),
            checks,
            x && x.photoTip ? h('small', { class: 'pf-hint', text: '📷 ' + x.photoTip }) : null))),
      h('div', { class: 'r-actions' },
        h('button', { class: 'btn btn-sm btn-outline', type: 'button', text: 'Cancel', onclick: closeDialog }),
        h('button', { class: 'btn btn-sm btn-forest', type: 'button', text: post ? 'Save changes' : 'Send for approval', onclick: save })));
    dlg.addEventListener('close', function () { dlg.remove(); });
    document.body.appendChild(dlg);
    dlg.showModal();
  }

  function contentView(root) {
    var ideas = M.content.ideas();
    var plan = S().contentPlan || [];
    var week = M.content.upcoming(7);
    var pending = plan.filter(function (c) { return c.status === 'pending'; });
    var monthAgo = Date.now() - 30 * 864e5;
    var posted = plan.filter(function (c) { return c.status === 'posted' && new Date(c.postedAt).getTime() > monthAgo; });
    var canApprove = M.auth.can(session, 'campaigns.approve');

    append(root, h('div', { class: 'kpis' },
      kpi('Post ideas', String(ideas.length), ideas.filter(function (x) { return !x.planned; }).length + ' not planned yet'),
      kpi('Planned · 7 days', String(week.filter(function (c) { return c.status !== 'posted'; }).length), week.length ? 'next: ' + csDay(week.filter(function (c) { return c.status !== 'posted'; }).concat(week)[0].dayKey) : 'nothing planned yet'),
      kpi('Waiting for approval', String(pending.length), canApprove ? 'you can approve others\' posts' : 'an admin approves'),
      kpi('Posted · 30 days', String(posted.length), 'Instagram, Facebook and WhatsApp')));

    /* ---- Ideas ---- */
    append(root, panel(aiTitle('Post ideas for this week'), 'Built from what the farm has right now: crops to push from Demand Radar, batches growing in the Harvest Planner, recipes, customer praise and the support-local library. Edit any caption before planning it.',
      h('div', { class: 'cs-ideas' }, ideas.map(function (x) {
        var preview = x.caption.length > 210 ? x.caption.slice(0, 200).replace(/\s+\S*$/, '') + '…' : x.caption;
        return h('article', { class: 'cs-card' },
          h('div', { class: 'cs-img' }, h('img', { src: x.image, alt: '', loading: 'lazy' }), h('span', { class: 'cs-when', text: csDay(x.dayKey) + ' · ' + x.time })),
          h('div', { class: 'cs-body' },
            h('div', { class: 'cs-tags' }, csTypeBadge(x.type), h('small', { text: M.content.CHANNELS[x.channel] })),
            h('strong', { class: 'ops-title', text: x.title }),
            h('p', { class: 'cs-caption', text: preview }),
            x.tags.length ? h('small', { class: 'cs-hashtags', text: x.tags.join(' ') }) : null,
            h('small', { class: 'cs-why', text: x.why }),
            csChecks(x.checks),
            h('div', { class: 'ops-foot cs-foot' },
              x.planned ? h('small', { class: 'pending-note', text: (x.planned.status === 'posted' ? 'Posted ' : 'Planned for ') + csDay(x.planned.dayKey) })
                : h('button', { class: 'btn btn-sm btn-forest', type: 'button', text: 'Edit & plan', onclick: function () { openPostEditor(x); } }),
              mini('Copy', function () { csCopy(x.caption, x.tags); }))));
      }))));

    /* ---- Week plan ---- */
    function approve(c) { var r = M.content.approve(c.id, session.email); if (!r.ok) { toast(r.error); return; } commit('content.approved', c.id, '"' + c.title + '" approved — post it on ' + csDay(c.dayKey) + '.'); }
    function posted1(c) { var r = M.content.markPosted(c.id, session.email); if (!r.ok) { toast(r.error); return; } commit('content.posted', c.id, '"' + c.title + '" marked as posted.'); }
    function remove1(c) { if (!confirm('Remove "' + c.title + '" from the plan?')) return; M.content.remove(c.id); commit('content.removed', c.id, 'Post removed from the plan.'); }
    var days = [];
    for (var i = 0; i < 7; i++) days.push(M.clearance.dayKey(new Date(Date.now() + i * 864e5)));
    append(root, panel('This week\'s plan', 'Approved posts are copied into Instagram, Facebook or the WhatsApp channel by staff, then marked as posted. Editing an approved post sends it back for approval.',
      h('div', { class: 'cs-week' }, days.map(function (k, di) {
        var items = week.filter(function (c) { return c.dayKey === k; });
        return h('section', { class: 'cs-day' + (items.length ? '' : ' empty') },
          h('h3', { text: di === 0 ? 'Today' : csDay(k) }),
          items.length ? items.map(function (c) {
            var own = c.createdBy === session.email;
            return h('article', { class: 'cs-post st-' + c.status },
              h('div', { class: 'cs-post-head' }, csTypeBadge(c.type), statusBadge(c.status === 'pending' ? 'pending_approval' : c.status)),
              h('strong', { text: c.title }),
              h('small', { text: c.time + ' · ' + M.content.CHANNELS[c.channel] + (c.needsPermission ? ' · ask the customer first' : '') }),
              h('div', { class: 'actions' },
                c.status === 'pending' && canApprove ? mini('Approve', function () { approve(c); }, { disabled: own, title: own ? 'You can\'t approve your own post' : null }) : null,
                c.status === 'pending' && !canApprove ? h('small', { class: 'hint', text: 'Waiting for admin' }) : null,
                c.status === 'approved' ? mini('Mark posted', function () { posted1(c); }) : null,
                mini('Copy', function () { csCopy(c.caption, c.tags); }),
                c.status !== 'posted' ? mini('Edit', function () { openPostEditor(null, c); }) : null,
                c.status !== 'posted' ? mini('Remove', function () { remove1(c); }, { danger: true }) : null));
          }) : h('small', { class: 'hint', text: 'Nothing planned' }));
      }))));

    /* ---- Support-local library ---- */
    append(root, panel(aiTitle('Support local library'), 'Ready-made education posts about why local farms matter and Singapore\'s goal to grow more of its own food by 2035. They only use facts MEOD already states on its website.',
      h('ul', { class: 'cs-library' }, M.content.LEARN.map(function (l) {
        var x = M.content.learnIdea(l);
        x.dayKey = M.content.nextDay(M.content.TYPES.learn.day); x.time = M.content.TYPES.learn.time;
        return h('li', null,
          h('img', { src: l.image, alt: '', loading: 'lazy' }),
          h('span', { class: 'cs-lib-text' }, h('strong', { text: l.title }), h('small', { text: l.caption.split('\n')[0] })),
          mini('Use this', function () { openPostEditor(x); }));
      }))));

    /* ---- Posted ---- */
    append(root, panel('Posted', 'The last 30 days.', table([
      { label: 'Posted', render: function (c) { return h('span', null, shortDate(c.postedAt), h('br'), h('small', { text: c.postedBy || '' })); } },
      { label: 'Post', render: function (c) { return h('span', null, h('strong', { text: c.title }), h('br'), csTypeBadge(c.type)); } },
      { label: 'Where', render: function (c) { return M.content.CHANNELS[c.channel]; } },
      { label: 'Approved by', render: function (c) { return c.approvedBy || '—'; } }
    ], posted, 'Nothing posted in the last 30 days.')));
  }

  /* ---------------- Lost Demand Intelligence (staff + admin) ----------------
   * What people asked for and couldn't get: enquiries we couldn't fill, "Notify me" taps on
   * sold-out products, and crops MEOD doesn't grow. Grouped per crop with a reason and what
   * to do, so a crop that sold out isn't mistaken for one nobody wants. */
  function lostWho(x) {
    if (x.customerId) return customerLabel(x.customerId);
    if (x.accountId) { var a = M.b2b.store().accounts.filter(function (y) { return y.id === x.accountId; })[0]; return a ? a.name : 'Trade buyer'; }
    return x.who || '—';
  }
  function openLostNotify(g) {
    document.querySelectorAll('.ld-dialog').forEach(function (d) { if (d.open) d.close(); d.remove(); });
    var asked = g.items.filter(function (x) { return x.notify && (x.customerId || x.accountId); });
    var body = h('textarea', { rows: 7, 'aria-label': 'Message' });
    body.value = 'Hi {first_name} 🌱\n\nYou asked us about ' + g.product.title + ' — good news, it\'s back' +
      (g.radar && g.radar.openBatch ? ' and you can pre-order it from the ' + shortWeekday(M.clearance.parseDayKey(g.radar.openBatch.harvestDate).toISOString()) + ' harvest' : '') +
      '. Reply here or order on MEOD Fresh.\n\n— The MEOD Farm team';
    var dlg = h('dialog', { class: 'receipt-dialog reply-dialog ld-dialog', 'aria-labelledby': 'ld-title' });
    function closeDialog() { if (dlg.open) dlg.close(); dlg.remove(); }
    append(dlg,
      h('button', { class: 'pd-close', type: 'button', 'aria-label': 'Close', onclick: closeDialog }, iconCircle(ICONS.x, 'bare')),
      h('div', { class: 'rd-body' },
        h('div', { class: 'rd-head' }, h('h2', { id: 'ld-title', text: 'Tell ' + asked.length + ' person(s) it\'s back' }), aiPill(), h('small', { class: 'ai-note', text: 'You review and send' })),
        h('div', { class: 'rd-form' },
          h('label', null, 'To', h('input', { value: asked.map(lostWho).join(', '), readonly: true })),
          h('label', null, 'Message', body),
          h('small', { class: 'pf-hint', text: 'Only people who asked to be told are included. Sending marks their requests as fulfilled.' }))),
      h('div', { class: 'r-actions' },
        h('button', { class: 'btn btn-sm btn-outline', type: 'button', text: 'Cancel', onclick: closeDialog }),
        h('button', { class: 'btn btn-sm btn-forest', type: 'button', text: 'Send (simulated)', onclick: function () {
          asked.forEach(function (x) { M.lost.resolve(x.id, 'fulfilled', session.email); });
          closeDialog();
          commit('lost.notified', g.product.id, asked.length + ' person(s) told ' + g.product.title + ' is back (simulated).');
        } })));
    dlg.addEventListener('close', function () { dlg.remove(); });
    document.body.appendChild(dlg);
    dlg.showModal();
  }
  function lostDemandView(root) {
    var all = M.lost.list(30), open = all.filter(function (x) { return x.status === 'open'; });
    var ins = M.lost.insights(30);
    var units = open.reduce(function (s, x) { return s + x.qty; }, 0);
    var value = ins.reduce(function (s, g) { return s + g.valueCents; }, 0);
    var notGrown = ins.filter(function (g) { return !g.product; });
    append(root, h('div', { class: 'kpis' },
      kpi('Asked for, not sold', String(units), 'units across ' + open.length + ' request(s) · 30 days'),
      kpi('Missed sales', money(value), 'at normal price, MEOD-grown crops'),
      kpi('Top missed crop', ins[0] ? (ins[0].product ? ins[0].product.title : ins[0].name) : '—', ins[0] ? ins[0].units + ' units · ' + ins[0].peopleCount + ' people' : 'nothing yet'),
      kpi('Crops we don\'t grow', String(notGrown.length), notGrown.length ? notGrown.map(function (g) { return g.name; }).slice(0, 2).join(', ') : 'no requests')));

    append(root, panel(aiTitle('What people wanted and couldn\'t get'), 'Grouped per crop. "Demand is there" means the crop sold out or we didn\'t have enough — recorded sales understate how much people want it. Demand Radar shows these numbers beside each crop.',
      ins.length ? h('div', { class: 'ops-brief aligned ld-brief', style: '--rows:5' }, ins.map(function (g) {
        var r = M.lost.REASONS[g.reason] || ['Other', 'grey'];
        var act = !g.product ? h('a', { class: 'btn btn-sm btn-outline', href: '#harvest', text: 'Plan a trial batch' })
          : g.notifyCount && M.stockStatus(g.product).qty > 0 ? h('button', { class: 'btn btn-sm btn-forest', type: 'button', text: 'Tell ' + g.notifyCount + ' it\'s back', onclick: function () { openLostNotify(g); } })
          : h('a', { class: 'btn btn-sm btn-forest', href: '#harvest', text: g.radar && g.radar.openBatch ? 'See pre-orders' : 'Plan a batch' });
        return h('article', { class: 'ops-card' + (g.product ? ' farm' : '') },
          h('div', { class: 'ops-card-head' }, g.product ? h('span', { class: 'rw-tier-cell' }, thumbMini(g.product)) : iconCircle(ICONS.search, 'soft'),
            h('span', { class: 'fb-tags' }, badge(r[0], r[1]), badge(g.verdict, g.product ? 'green' : 'grey'))),
          h('strong', { class: 'ops-title', text: (g.product ? g.product.title : g.name) + ' · ' + g.units + ' unit(s) asked for' }),
          h('p', { text: g.why }),
          h('small', { class: 'ops-est', text: g.requests + ' request(s) from ' + g.peopleCount + ' ' + (g.peopleCount === 1 ? 'person' : 'people') + (g.valueCents ? ' · ' + money(g.valueCents) + ' at normal price' : '') + (substituteFor(g) ? ' · Offer instead: ' + substituteFor(g).title + ' (' + substituteFor(g).stock.qty + ' in stock)' : '') }),
          h('div', { class: 'ops-foot' }, h('small', { text: g.notifyCount ? g.notifyCount + ' want to be told' : '' }), act));
      })) : h('p', { class: 'empty', text: 'No unmet requests in the last 30 days.' })));

    /* ---- Log a request ---- */
    var prod = h('select', { 'aria-label': 'Product' }, h('option', { value: '', text: 'Something we don\'t grow…' }),
      S().products.filter(function (p) { return !p.bagOffer; }).map(function (p) { return h('option', { value: p.id, text: p.title }); }));
    var crop = h('input', { placeholder: 'e.g. Nai Bai', 'aria-label': 'Crop asked for', maxlength: 40 });
    var cropLabel = h('label', null, 'Crop asked for', crop);
    var qty = h('input', { type: 'number', min: 1, value: 1, 'aria-label': 'Quantity' }); qty.value = '1';
    var when = h('input', { type: 'date', 'aria-label': 'Wanted on' });
    var source = h('select', { 'aria-label': 'Source' }, ['enquiry', 'b2b', 'chat', 'phone', 'visit'].map(function (k) { return h('option', { value: k, text: M.lost.SOURCES[k] }); }));
    var who = h('select', { 'aria-label': 'Who' }, h('option', { value: '', text: 'Not linked' }), S().customers.map(function (c) { return h('option', { value: c.id, text: c.name }); }),
      M.b2b.store().accounts.map(function (a) { return h('option', { value: a.id, text: a.name }); }));
    var reason = h('select', { 'aria-label': 'Why not' }, ['ranout', 'quantity', 'timing', 'notgrown'].map(function (k) { return h('option', { value: k, text: M.lost.REASONS[k][0] }); }));
    var notify = h('input', { type: 'checkbox' });
    var note = h('input', { placeholder: 'What they said (optional)', 'aria-label': 'Note', maxlength: 200 });
    var syncCrop = function () { cropLabel.style.display = prod.value ? 'none' : ''; if (!prod.value) reason.value = 'notgrown'; else if (reason.value === 'notgrown') reason.value = M.stockStatus(M.byId('products', prod.value)).qty === 0 ? 'ranout' : 'quantity'; };
    prod.addEventListener('change', syncCrop); syncCrop();
    var form = h('form', { class: 'form-grid ld-form', novalidate: true, onsubmit: function (e) {
      e.preventDefault();
      var isAcc = who.value && who.value.indexOf('C-') !== 0;
      var r = M.lost.add({ source: source.value, reason: reason.value, productId: prod.value || null, cropName: crop.value, qty: qty.value, wantedKey: when.value || null,
        customerId: who.value && !isAcc ? who.value : null, accountId: isAcc ? who.value : null, note: note.value, notify: notify.checked }, session.email);
      if (!r.ok) { toast(r.error); return; }
      commit('lost.logged', r.id, 'Request logged.');
    } },
      h('label', null, 'Product', prod), cropLabel, h('label', null, 'How many', qty), h('label', null, 'Wanted on', when),
      h('label', null, 'Source', source), h('label', null, 'From', who), h('label', null, 'Why we couldn\'t', reason),
      h('label', { class: 'ld-note' }, 'Note', note),
      h('label', { class: 'toggle' }, notify, h('span', { text: 'They want to be told when it\'s available' })),
      h('div', { class: 'ld-submit' }, h('button', { class: 'btn btn-sm btn-forest', type: 'submit', text: 'Log request' })));
    append(root, panel('Log a request we couldn\'t fill', 'For asks that come in by WhatsApp, phone, trade buyers or at the farm. Shop "Notify me" taps on sold-out products are logged automatically.', form));

    append(root, panel('All requests', 'Last 30 days, newest first.', table([
      { label: 'When', render: function (x) { return h('span', null, shortDate(x.at), h('br'), h('small', { text: M.lost.SOURCES[x.source] || x.source })); } },
      { label: 'Asked for', render: function (x) { return h('span', null, h('strong', { text: x.qty + ' × ' + x.cropName }), x.wantedKey ? [h('br'), h('small', { text: 'for ' + shortWeekday(M.clearance.parseDayKey(x.wantedKey).toISOString()) })] : null); } },
      { label: 'From', render: function (x) { return h('span', null, lostWho(x), x.note ? [h('br'), h('small', { text: x.note })] : null); } },
      { label: 'Why not', render: function (x) { var r = M.lost.REASONS[x.reason] || ['Other', 'grey']; return badge(r[0], r[1]); } },
      { label: 'Status', render: function (x) { return statusBadge(x.status === 'open' ? 'open' : x.status === 'fulfilled' ? 'resolved' : 'closed'); } },
      { label: 'Actions', render: function (x) {
        if (x.status !== 'open') return '—';
        return h('div', { class: 'actions stack' },
          mini('Fulfilled', function () { M.lost.resolve(x.id, 'fulfilled', session.email); commit('lost.fulfilled', x.id, 'Marked as fulfilled.'); }),
          mini('Close', function () { M.lost.resolve(x.id, 'closed', session.email); commit('lost.closed', x.id, 'Request closed.'); }, { danger: true }));
      } }
    ], all, 'No requests logged yet.')));
  }

  /* ---------------- Harvest Allocation Advisor (staff + admin) ----------------
   * For each harvest due in the next 10 days: who the yield is already promised to (trade
   * orders, pre-orders), likely group-buy and shop demand until the next harvest, and what's
   * left over — with options to place it at full price before anyone thinks about discounts. */
  var ALLOC_SEGS = [['b2b', 'Trade (confirmed + standing)', 'al-b2b'], ['preorder', 'Pre-orders', 'al-pre'], ['group', 'Group buys', 'al-group'], ['shop', 'Shop (expected)', 'al-shop']];
  function allocationView(root) {
    var plan = M.allocation.plan(10);
    var tot = function (k) { return plan.reduce(function (s, x) { return s + x.alloc[k]; }, 0); };
    var unalloc = plan.reduce(function (s, x) { return s + x.unallocated; }, 0), shorts = plan.filter(function (x) { return x.shortBy > 0; });
    append(root, h('div', { class: 'kpis' },
      kpi('Harvests · 10 days', String(plan.length), plan.reduce(function (s, x) { return s + x.supply; }, 0) + ' units expected'),
      kpi('Already promised', String(tot('b2b') + tot('preorder')), tot('b2b') + ' trade · ' + tot('preorder') + ' pre-orders'),
      kpi('Unallocated', String(unalloc), 'units with no buyer yet — place them before discounting'),
      kpi('Short', String(shorts.length), shorts.length ? shorts.map(function (x) { return x.product.title; }).slice(0, 2).join(', ') : 'every harvest covers its orders')));
    append(root, panel(aiTitle('Where each harvest goes'), 'Expected yield split in priority order: confirmed trade orders, pre-orders, likely group-buy demand, then normal shop sales until the next harvest. Group and shop figures are estimates from the last 4 weeks.',
      h('ul', { class: 'al-legend' }, ALLOC_SEGS.map(function (s) { return h('li', null, h('span', { class: 'al-dot ' + s[2] }), s[1]); }), h('li', null, h('span', { class: 'al-dot al-free' }), 'Unallocated')),
      plan.length ? h('div', { class: 'al-list' }, plan.map(function (x) {
        var bar = h('div', { class: 'al-bar', role: 'img', 'aria-label': ALLOC_SEGS.map(function (s) { return s[1] + ' ' + x.alloc[s[0]]; }).join(', ') + ', unallocated ' + x.unallocated });
        ALLOC_SEGS.forEach(function (s) { if (x.alloc[s[0]]) { var seg = h('span', { class: s[2], title: s[1] + ': ' + x.alloc[s[0]] }); seg.style.width = (x.alloc[s[0]] / x.supply * 100) + '%'; bar.appendChild(seg); } });
        if (x.unallocated) { var free = h('span', { class: 'al-free', title: 'Unallocated: ' + x.unallocated }); free.style.width = (x.unallocated / x.supply * 100) + '%'; bar.appendChild(free); }
        var status = x.shortBy ? badge('Short by ' + x.shortBy, 'red') : x.unallocated ? badge(x.unallocated + ' unallocated', 'amber') : badge('Fully allocated', 'green');
        return h('article', { class: 'al-card' + (x.shortBy ? ' short' : '') },
          h('div', { class: 'al-head' },
            h('span', { class: 'rw-tier-cell' }, thumbMini(x.product), h('span', null, h('strong', { text: x.product.title }), h('br'),
              h('small', { text: 'Harvest ' + shortWeekday(M.clearance.parseDayKey(x.batch.harvestDate).toISOString()) + ' · ' + x.supply + ' expected · covers ' + x.coverDays + ' days' }))),
            h('span', { class: 'why-wrap' }, whyBtn(x.product.title + ' allocation', function () { return explainAlloc(x); }), status)),
          bar,
          h('ul', { class: 'al-nums' }, ALLOC_SEGS.map(function (s) {
            return h('li', null, h('span', { class: 'al-dot ' + s[2] }), h('small', { text: s[1] }), h('strong', { text: String(x.wanted[s[0]]) + (x.wanted[s[0]] > x.alloc[s[0]] ? ' (' + x.alloc[s[0]] + ' covered)' : '') }));
          }), h('li', null, h('span', { class: 'al-dot al-free' }), h('small', { text: 'Unallocated' }), h('strong', { text: String(x.unallocated) }))),
          x.lost ? h('p', { class: 'al-lost', text: '+ ' + x.lost + ' unit(s) of lost demand: people asked for ' + x.product.title + ' while it was sold out.' }) : null,
          x.options.length ? h('ol', { class: 'rescue-opts al-opts' }, x.options.map(function (o, i) {
            var btn = o.key === 'b2b' ? mini('Draft offer', function () { var acc = M.b2b.store().accounts.filter(function (a) { return a.id === o.accountId; })[0]; openB2BMessage('offer', { account: acc, product: x.product }); })
              : o.key === 'lost' ? h('a', { class: 'mini', href: '#lost', text: 'Lost demand' })
              : o.key === 'preorder' ? h('a', { class: 'mini', href: '#campaigns', text: 'Campaigns' })
              : o.key === 'bundle' ? h('a', { class: 'mini', href: '#pricing', text: 'Simulator' })
              : o.key === 'smaller' ? h('a', { class: 'mini', href: '#harvest', text: 'Harvest Planner' }) : null;
            return h('li', { class: i === 0 ? 'best' : '' }, h('span', { class: 'rescue-opt-text' }, h('strong', { text: (i === 0 ? 'Best: ' : '') + o.title }), h('small', { text: o.why })), btn);
          })) : null);
      })) : h('p', { class: 'empty', text: 'No harvests due in the next 10 days.' })));
  }

  /* ---- Promotion Impact Simulator (inside Price Advisor) ----
   * Compare no promotion, a discount, a bundle and a bulk trade offer for one product over the
   * selling window, with every assumption shown. Staff pick one and send it for approval. */
  function promoSimulatorPanel() {
    var crops = M.radar.crops();
    var pick = (crops.filter(function (c) { return c.status === 'surplus'; }).sort(function (a, b) { return b.gap - a.gap; })[0] || crops[0]).product;
    var st = { productId: pick.id, pct: 10, weeks: 2, lift: Math.round(M.RULES.promoLiftPer10 * 100) };
    var sel = h('select', { 'aria-label': 'Product' }, crops.map(function (c) { return h('option', { value: c.product.id, text: c.product.title + (c.status === 'surplus' ? ' · surplus' : c.status === 'short' ? ' · short' : '') }); }));
    sel.value = st.productId;
    var pct = h('select', { 'aria-label': 'Discount' }, [10, 15, 20, 25, 30].map(function (n) { return h('option', { value: String(n), text: n + '% off' }); }));
    var weeks = h('select', { 'aria-label': 'Window' }, [1, 2, 3].map(function (n) { return h('option', { value: String(n), text: n + ' week' + (n > 1 ? 's' : '') }); })); weeks.value = '2';
    var lift = h('input', { type: 'number', min: 0, max: 100, step: 5, 'aria-label': 'Lift per 10% off' }); lift.value = String(st.lift);
    var out = h('div', { class: 'sim-out', 'aria-live': 'polite' });
    function draw() {
      var r = M.promo.simulate(sel.value, { pct: Number(pct.value), weeks: Number(weeks.value), lift: Math.max(0, Number(lift.value) || 0) / 100 });
      out.textContent = '';
      var maxRev = Math.max.apply(null, r.scenarios.map(function (s) { return s.revenue; }).concat([1]));
      append(out,
        h('div', { class: 'sim-grid' }, r.scenarios.map(function (s) {
          var bar = h('span', { class: 'sim-bar' }, h('span')); bar.firstChild.style.width = Math.round(s.revenue / maxRev * 100) + '%';
          var act = s.key === 'none' ? h('span', { class: 'pa-act pa-status', text: 'Keep as is' })
            : s.blocked ? h('span', { class: 'pa-act pa-status', text: 'Blocked by Margin Guard' })
            : s.key === 'bulk' ? h('button', { class: 'pa-act btn btn-sm btn-outline', type: 'button', text: 'Draft trade offer', onclick: function () {
                var acc = M.b2b.store().accounts.filter(function (a) { return (a.usual || []).some(function (u) { var up = M.byId('products', u.productId); return up && up.category === r.product.category; }); })[0] || M.b2b.store().accounts[0];
                openB2BMessage('offer', { account: acc, product: r.product }); } })
            : h('button', { class: 'pa-act btn btn-sm btn-forest', type: 'button', text: 'Send for approval', onclick: function () {
                var sug = s.key === 'bundle'
                  ? { kind: 'bundle', product: r.product, partner: s.partner, priceCents: Math.round((r.product.priceCents + s.partner.priceCents) * 0.9), fullCents: r.product.priceCents + s.partner.priceCents, qty: s.sold - r.base > 0 ? s.sold - r.base : 10, guard: { ok: true }, reason: 'Promotion simulator: ' + s.note + '.' }
                  : { kind: 'discount', product: r.product, priceCents: s.unitPrice, qty: s.sold, guard: s.guard, reason: 'Promotion simulator: ' + s.label + ' sells about ' + s.sold + ' over ' + r.weeks + ' week(s), margin ' + money(s.margin) + '.' };
                var x = M.pricing.propose(sug, session.email);
                if (!x.ok) { toast(x.error); return; }
                commit('pricing.proposed', x.id, s.label + ' for ' + r.product.title + ' sent for approval.');
              } });
          return h('article', { class: 'sim-card' + (s.best ? ' best' : '') + (s.blocked ? ' blocked' : '') },
            h('div', { class: 'sim-head' }, h('strong', { text: s.label }), s.best ? badge('Best margin', 'green') : s.blocked ? badge('Blocked', 'red') : h('span')),
            h('div', { class: 'sim-price' }, s.key === 'none' || s.key === 'bundle' ? h('strong', { text: money(s.unitPrice) }) : [h('span', { class: 'price-was', text: money(r.product.priceCents) }), h('strong', { text: money(s.unitPrice) })]),
            h('ul', { class: 'sim-nums' },
              h('li', null, h('small', { text: 'Sells' }), h('strong', { text: s.sold + ' units' })),
              h('li', null, h('small', { text: 'Revenue' }), h('strong', { text: money(s.revenue) })),
              h('li', { class: 'sim-margin' }, h('small', { text: 'Margin' }), h('strong', { text: money(s.margin) })),
              h('li', { class: s.unsold ? 'sim-left' : '' }, h('small', { text: 'Left unsold' }), h('strong', { text: s.unsold + (s.unsold ? ' (' + money(s.unsoldValue) + ')' : '') }))),
            bar,
            h('small', { class: 'sim-note', text: s.note || (s.blocked ? s.guard.reasons.join('; ') + '.' : s.key === 'none' ? 'Normal price, normal sales.' : 'Same buyers, more of them at the lower price.') }),
            act);
        })),
        h('details', { class: 'sim-assume' }, h('summary', { text: 'Assumptions behind these numbers' }), h('ul', null, r.assumptions.map(function (a) { return h('li', { text: a }); }))));
    }
    [sel, pct, weeks].forEach(function (el) { el.addEventListener('change', draw); });
    lift.addEventListener('input', draw);
    draw();
    return panel(aiTitle('Promotion Impact Simulator'), 'Compare options before running a promotion: what sells, the revenue and margin, and what\'s left unsold. Estimates, not promises — the assumptions are listed underneath.',
      h('div', { class: 'form-grid sim-form' }, h('label', null, 'Product', sel), h('label', null, 'Discount to test', pct), h('label', null, 'Selling window', weeks), h('label', null, 'Sales lift per 10% off (%)', lift)),
      out);
  }

  /* ---------------- Data import (staff + admin) ----------------
   * Upload sales or harvest records from Excel or CSV. Columns and product names are matched
   * automatically; staff see a preview and what didn't match before anything is imported. */
  var XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  function loadXlsx(cb) {
    if (window.XLSX) { cb(null); return; }
    var sc = document.createElement('script');
    sc.src = XLSX_URL; sc.onload = function () { cb(null); }; sc.onerror = function () { cb('Couldn\'t load the Excel reader (offline?). Save the sheet as CSV and upload that instead.'); };
    document.head.appendChild(sc);
  }
  function downloadText(name, text) {
    var a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/csv' })), download: name });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function importView(root) {
    var st = importView.state || (importView.state = { kind: 'sales', preview: null, file: '' });
    var kindSel = h('select', { 'aria-label': 'What are you importing?' }, Object.keys(M.importer.KINDS).map(function (k) { return h('option', { value: k, text: M.importer.KINDS[k].label }); }));
    kindSel.value = st.kind;
    var file = h('input', { type: 'file', accept: '.csv,.tsv,.txt,.xlsx,.xls', 'aria-label': 'Spreadsheet file' });
    var out = h('div', { class: 'im-out' });
    function show() {
      out.textContent = '';
      var p = st.preview;
      if (!p) { append(out, h('p', { class: 'hint', text: 'Pick a file to see a preview. Nothing is imported until you confirm.' })); return; }
      if (!p.ok) { append(out, h('p', { class: 'callout red', text: p.error })); return; }
      var K = M.importer.KINDS[p.kind];
      append(out,
        h('div', { class: 'im-summary' },
          h('span', { class: 'im-chip ok', text: '✓ ' + p.good.length + ' row(s) ready' }),
          p.bad.length ? h('span', { class: 'im-chip bad', text: '✗ ' + p.bad.length + ' row(s) skipped' }) : null,
          h('small', { text: 'Columns matched: ' + Object.keys(p.map).map(function (k) { return k + ' ← "' + p.headers[p.map[k]] + '"'; }).join(' · ') })),
        table(p.kind === 'sales' ? [
          { label: 'Line', num: true, render: function (r) { return String(r.line); } },
          { label: 'Date', render: function (r) { return r.date ? shortDate(M.clearance.parseDayKey(r.date).toISOString()) : '—'; } },
          { label: 'Product', render: function (r) { return r.product ? r.product.title : '—'; } },
          { label: 'Qty', num: true, render: function (r) { return String(r.qty); } },
          { label: 'Channel', render: function (r) { return r.channel; } }
        ] : [
          { label: 'Line', num: true, render: function (r) { return String(r.line); } },
          { label: 'Product', render: function (r) { return r.product ? r.product.title : '—'; } },
          { label: 'Harvest', render: function (r) { return r.harvest ? shortDate(M.clearance.parseDayKey(r.harvest).toISOString()) : '—'; } },
          { label: 'Expected', num: true, render: function (r) { return String(r.expected || '—'); } },
          { label: 'Actual', num: true, render: function (r) { return r.actual != null ? String(r.actual) : '—'; } }
        ], p.good.slice(0, 8), 'No usable rows.'),
        p.good.length > 8 ? h('small', { class: 'hint', text: '…and ' + (p.good.length - 8) + ' more.' }) : null,
        p.bad.length ? h('details', { class: 'im-bad' }, h('summary', { text: 'Skipped rows (' + p.bad.length + ')' }),
          h('ul', null, p.bad.slice(0, 20).map(function (r) { return h('li', { text: 'Line ' + r.line + ': ' + r.error }); }))) : null,
        h('div', { class: 'im-actions' },
          h('small', { text: p.kind === 'sales' ? 'Sales from the last 8 weeks go into the weekly history Demand Radar uses.' : 'Future harvests become planned batches; past ones with an actual quantity are recorded as harvested.' }),
          h('button', { class: 'btn btn-sm btn-forest', type: 'button', disabled: !p.good.length, text: 'Import ' + p.good.length + ' row(s)', onclick: function () {
            var r = M.importer.apply(p, session.email, st.file);
            st.preview = null;
            commit('import.done', st.file, r.rows + ' ' + K.label.toLowerCase() + ' imported from ' + st.file + '.');
          } })));
    }
    function readFile(f) {
      st.file = f.name;
      var finish = function (rows) { st.preview = M.importer.preview(st.kind, rows); show(); };
      if (/\.xlsx?$/i.test(f.name)) {
        loadXlsx(function (err) {
          if (err) { st.preview = { ok: false, error: err }; show(); return; }
          var rd = new FileReader();
          rd.onload = function () {
            try { var wb = window.XLSX.read(new Uint8Array(rd.result), { type: 'array' }); finish(window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' })); }
            catch (e) { st.preview = { ok: false, error: 'Couldn\'t read that workbook. Try saving it as CSV.' }; show(); }
          };
          rd.readAsArrayBuffer(f);
        });
      } else {
        var rd2 = new FileReader();
        rd2.onload = function () { finish(M.importer.parseCsv(rd2.result)); };
        rd2.readAsText(f);
      }
    }
    kindSel.addEventListener('change', function () { st.kind = kindSel.value; st.preview = null; show(); });
    file.addEventListener('change', function () { if (file.files[0]) readFile(file.files[0]); });
    show();
    append(root, panel(aiTitle('Import from Excel'), 'Upload the spreadsheets MEOD already keeps — no new software to learn. Column names and product names are matched for you (including names like "Bok Choy" or "kailan"); dates can be day/month/year.',
      h('div', { class: 'form-grid im-form' },
        h('label', null, 'What are you importing?', kindSel),
        h('label', null, 'File (.xlsx or .csv)', file),
        h('div', { class: 'im-tpl' }, h('small', { text: 'Need a starting point?' }), mini('Download template', function () { downloadText('meod-' + st.kind + '-template.csv', M.importer.template(st.kind)); }))),
      out));
    append(root, panel('Import history', null, table([
      { label: 'When', render: function (r) { return h('span', null, shortDate(r.at), h('br'), h('small', { text: r.by })); } },
      { label: 'File', render: function (r) { return r.file; } },
      { label: 'Type', render: function (r) { return (M.importer.KINDS[r.kind] || {}).label || r.kind; } },
      { label: 'Rows', num: true, render: function (r) { return r.rows + (r.skipped ? ' (' + r.skipped + ' skipped)' : ''); } }
    ], S().imports || [], 'Nothing imported yet.')));
  }

  /* ---------------- Pilot metrics (staff + admin) ----------------
   * What a pilot with MEOD would measure, from the portal's own records, against a recorded
   * baseline. No promises: each number says how it's worked out. */
  function pilotView(root) {
    var m = M.pilot.metrics(30), bl = (S().pilotBaselines || [])[0] || null;
    var pctOrDash = function (v) { return v == null ? '—' : v + '%'; };
    var rows = [
      { key: 'conversion', label: 'Enquiry-to-order rate', fmt: pctOrDash, good: 'up', how: 'Visit enquiries confirmed + lost-demand requests fulfilled, out of all enquiries and requests (' + m.converted + ' of ' + m.enquiries + ').' },
      { key: 'sellThrough', label: 'Sell-through', fmt: pctOrDash, good: 'up', how: 'Share of harvested units sold, processed or donated rather than left past sell-by or composted (' + m.harvestedUnits + ' harvested).' },
      { key: 'unsold', label: 'Unsold units', fmt: function (v) { return String(v); }, good: 'down', how: 'Units past their sell-by date plus units composted, from Harvest Rescue.' },
      { key: 'campMarginCents', label: 'Campaign margin', fmt: function (v) { return money(v || 0); }, good: 'up', how: 'Margin on orders for a campaign\'s product by its recipients within 7 days of sending (' + m.campaigns + ' campaign(s) sent).' },
      { key: 'lostUnits', label: 'Lost demand (open)', fmt: function (v) { return v + ' units'; }, good: 'track', how: 'Units people asked for and couldn\'t get — capturing this is new, so it starts at zero in the baseline.' },
      { key: 'minutesSaved', label: 'Staff time saved', fmt: function (v) { return v >= 60 ? Math.round(v / 6) / 10 + ' h' : v + ' min'; }, good: 'up', how: 'AI drafts used × typical minutes to write one by hand (reply 10, campaign 15, trade message 8, social post 20, briefing 30).' }
    ];
    append(root, h('div', { class: 'kpis' },
      kpi('Enquiry-to-order', pctOrDash(m.conversion), m.converted + ' of ' + m.enquiries + ' · 30 days'),
      kpi('Sell-through', pctOrDash(m.sellThrough), m.unsold + ' unit(s) unsold'),
      kpi('Campaign margin', money(m.campMarginCents), m.campaigns + ' campaign(s) sent'),
      kpi('Time saved', rows[5].fmt(m.minutesSaved), 'by AI drafts · 30 days')));
    append(root, panel('Now vs baseline', bl ? 'Baseline recorded ' + shortDate(bl.at) + ' by ' + bl.by + (bl.note ? ' — ' + bl.note : '') + '. Figures cover the 30 days before each date.' : 'No baseline yet — record one before the pilot starts.',
      table([
        { label: 'Measure', render: function (r) { return h('span', null, h('strong', { text: r.label }), h('br'), h('small', { text: r.how })); } },
        { label: 'Baseline', num: true, render: function (r) { return bl ? r.fmt(bl[r.key]) : '—'; } },
        { label: 'Now', num: true, render: function (r) { return h('strong', { text: r.fmt(m[r.key]) }); } },
        { label: 'Change', num: true, render: function (r) {
          if (!bl || bl[r.key] == null || m[r.key] == null) return '—';
          var d = m[r.key] - bl[r.key];
          if (!d) return h('small', { text: 'same' });
          var better = r.good === 'up' ? d > 0 : r.good === 'down' ? d < 0 : null;
          var txt = (d > 0 ? '▲ ' : '▼ ') + (/conversion|sellThrough/.test(r.key) ? Math.abs(d) + ' pts' : r.fmt(Math.abs(d)));
          return h('span', { class: better === null ? 'pm-flat' : better ? 'pm-good' : 'pm-bad', text: txt });
        } }
      ], rows, ''),
      h('div', { class: 'pm-foot' },
        h('small', { class: 'hint', text: 'Prototype figures from demo data. In a real pilot these come from MEOD\'s own orders, harvests and enquiries over the same weeks.' }),
        h('div', { class: 'actions' },
          mini('Export CSV', function () {
            var csv = 'Measure,Baseline,Now\n' + rows.map(function (r) { return '"' + r.label + '",' + (bl ? bl[r.key] : '') + ',' + m[r.key]; }).join('\n');
            downloadText('meod-pilot-metrics.csv', csv);
          }),
          mini('Record new baseline', function () {
            if (!confirm('Record today\'s figures as the new baseline?')) return;
            M.pilot.recordBaseline(session.email, '');
            commit('pilot.baseline', 'pilot', 'Baseline recorded.');
          })))));
  }

  // Shop: "Notify me" on a sold-out product logs lost demand (and asks to be told when back).
  function notifyListed(p) { return (S().lostDemand || []).some(function (d) { return d.source === 'soldout' && d.status === 'open' && d.productId === p.id && d.customerId === session.customerId; }); }
  function notifyMe(p, after) {
    var r = M.lost.add({ source: 'soldout', reason: 'ranout', productId: p.id, qty: 1, customerId: session.customerId, notify: true }, null);
    if (!r.ok) { toast(r.error); return; }
    if (r.dupe) { toast('You\'re already on the list for ' + p.title + '.'); return; }
    commit('lost.notify_me', p.id, 'We\'ll let you know when ' + p.title + ' is back.');
    if (after) after();
  }
  /* ---------------- "Why?" panels + AI Decision Ledger ----------------
   * Every AI suggestion can show its working: data used, calculation, assumptions, confidence,
   * and — once acted on — who decided and what happened. The ledger lists all of them. */
  var CONF_TONE = { high: 'green', medium: 'amber', low: 'red' };
  function openWhy(title, ex, entry) {
    document.querySelectorAll('.why-dialog').forEach(function (d) { if (d.open) d.close(); d.remove(); });
    var dlg = h('dialog', { class: 'receipt-dialog reply-dialog why-dialog', 'aria-labelledby': 'why-title' });
    function closeDialog() { if (dlg.open) dlg.close(); dlg.remove(); }
    var conf = ex.confidence || { level: 'medium', note: '' };
    var sec = function (label, body) { return h('section', { class: 'why-sec' }, h('h3', { text: label }), body); };
    append(dlg,
      h('button', { class: 'pd-close', type: 'button', 'aria-label': 'Close', onclick: closeDialog }, iconCircle(ICONS.x, 'bare')),
      h('div', { class: 'rd-body why-body' },
        h('div', { class: 'rd-head' }, h('h2', { id: 'why-title', text: 'Why: ' + title }), aiPill()),
        h('p', { class: 'why-lead', text: 'Worked out from MEOD\'s own records with fixed rules — no hidden model. A person decides; the AI only recommends.' }),
        sec('Data used', h('ul', { class: 'why-data' }, (ex.inputs || []).map(function (r) { return h('li', null, h('span', { text: r[0] }), h('strong', { text: String(r[1]) })); }))),
        sec('Calculation', h('ol', { class: 'why-calc' }, (ex.calc || []).map(function (c) { return h('li', { text: c }); }))),
        sec('Assumptions', h('ul', { class: 'why-list' }, (ex.assumptions || []).map(function (a) { return h('li', { text: a }); }))),
        sec('Confidence', h('p', { class: 'why-conf' }, badge(conf.level.charAt(0).toUpperCase() + conf.level.slice(1), CONF_TONE[conf.level] || 'grey'), h('span', { text: ' ' + (conf.note || '') }))),
        sec('Human decision', entry ? h('p', { text: entry.status === 'suggested' ? 'Waiting for a decision (suggested by ' + (entry.createdBy || 'AI') + ', ' + shortDate(entry.createdAt) + ').'
            : (entry.status === 'approved' ? 'Approved' : 'Rejected') + ' by ' + (entry.decidedBy || '—') + (entry.decidedAt ? ', ' + shortDate(entry.decidedAt) : '') + (entry.decisionNote ? ' — ' + entry.decisionNote : '') + '.' })
          : h('p', { class: 'hint', text: 'Not acted on yet. Nothing changes until a person approves it.' })),
        entry ? sec('What happened', h('p', { text: entry.outcome ? entry.outcome.text : 'No result recorded yet.' })) : null),
      h('div', { class: 'r-actions' },
        h('a', { class: 'btn btn-sm btn-outline', href: '#ledger', onclick: closeDialog, text: 'Open the decision ledger' }),
        h('button', { class: 'btn btn-sm btn-forest', type: 'button', text: 'Close', onclick: closeDialog })));
    dlg.addEventListener('close', function () { dlg.remove(); });
    document.body.appendChild(dlg);
    dlg.showModal();
  }
  function whyBtn(title, makeEx, ref) {
    return h('button', { type: 'button', class: 'why-btn', 'aria-label': 'Why this suggestion?', text: 'Why?', onclick: function (e) {
      e.stopPropagation();
      openWhy(title, makeEx(), ref ? M.decisions.find(ref) : null);
    } });
  }
  function explainAdvice(x) {
    var p = x.product, c = p ? M.radar.crops().filter(function (r) { return r.product.id === p.id; })[0] : null;
    var base = c ? M.decisions.explainRadar(c) : { inputs: [], calc: [], assumptions: [], confidence: { level: 'medium', note: 'Based on member history.' } };
    return { inputs: base.inputs.concat([['Opted-in people to message', x.audience]]),
      calc: base.calc.concat(['Ranked ' + ADVISOR_SOURCE[x.source][0] + ': ' + x.why],
        adviceRanking(x).map(function (r) { return RANK_ROLE[r.role] + ': ' + r.label + (r.role === 'suggested' ? '' : ' — ' + r.why); })),
      assumptions: base.assumptions.concat(['Only people who opted in to messages are included.', 'Food at risk of waste ranks above sales nudges.']),
      confidence: base.confidence };
  }
  function explainAlloc(x) {
    return { inputs: [['Expected harvest', x.supply + ' on ' + x.batch.harvestDate], ['Trade orders (confirmed + standing)', x.wanted.b2b], ['Pre-orders', x.wanted.preorder], ['Group buys (est.)', x.wanted.group], ['Shop sales (est.)', x.wanted.shop], ['Lost demand', x.lost]],
      calc: ['Covers ' + x.coverDays + ' days until the next harvest', 'Allocated in priority order: trade → pre-orders → group → shop', 'Unallocated = ' + x.supply + ' − ' + (x.wanted.b2b + x.wanted.preorder + x.wanted.group + x.wanted.shop) + ' = ' + (x.supply - x.wanted.b2b - x.wanted.preorder - x.wanted.group - x.wanted.shop)],
      assumptions: ['Group and shop figures are 4-week averages, scaled to the cover period.', 'The harvest comes in at its expected quantity.'],
      confidence: { level: x.weekly ? 'medium' : 'low', note: 'Trade and pre-order numbers are firm; group and shop numbers are estimates.' } };
  }

  function ledgerView(root) {
    var list = M.decisions.list();
    var decided = list.filter(function (d) { return d.status !== 'suggested'; });
    var approved = list.filter(function (d) { return d.status === 'approved'; });
    append(root, h('div', { class: 'kpis' },
      kpi('AI suggestions acted on', String(list.length), 'each with its data, calculation and assumptions'),
      kpi('Approved', String(approved.length), decided.length ? Math.round(approved.length / decided.length * 100) + '% of decided' : 'none decided yet'),
      kpi('Waiting for a person', String(list.length - decided.length), 'nothing changes until someone decides'),
      kpi('Outcomes tracked', String(list.filter(function (d) { return d.outcome; }).length), 'what happened afterwards')));
    append(root, h('p', { class: 'callout green', text: 'How Tyllage keeps AI accountable: every suggestion is explainable (data, calculation, assumptions, confidence), a person approves before anything changes, and the result is recorded. These follow the explainability and human-oversight principles of Singapore\'s Model AI Governance Framework.' }));
    append(root, panel('Decision ledger', 'Newest first. Open "Why?" to see exactly how a suggestion was worked out.', table([
      { label: 'When', render: function (d) { return h('span', null, shortDate(d.createdAt), h('br'), h('small', { text: d.feature })); } },
      { label: 'Suggestion', render: function (d) { return h('span', null, h('strong', { text: d.title }), d.recommendation ? [h('br'), h('small', { text: d.recommendation })] : null); } },
      { label: 'Confidence', render: function (d) { var c = (d.confidence || {}).level || 'medium'; return badge(c.charAt(0).toUpperCase() + c.slice(1), CONF_TONE[c] || 'grey'); } },
      { label: 'Decision', render: function (d) { return h('span', null, statusBadge(d.status === 'suggested' ? 'pending' : d.status), d.decidedBy ? [h('br'), h('small', { text: d.decidedBy })] : null); } },
      { label: 'Outcome', render: function (d) { return d.outcome ? d.outcome.text : h('small', { class: 'hint', text: 'Not yet' }); } },
      { label: '', render: function (d) { return h('button', { type: 'button', class: 'mini', text: 'Why?', onclick: function () { openWhy(d.title, d, d); } }); } }
    ], list, 'No AI suggestions acted on yet.')));
  }

  /* ---------------- Quotation Copilot + commitments (staff + admin) ---------------- */
  function quotesView(root) {
    var st = quotesView.state || (quotesView.state = { text: 'Hi, can you supply 20kg of bayam weekly at S$6/kg? Delivery every Thursday for the next 3 months.', buyer: '', parsed: null });
    var accounts = M.b2b.store().accounts;
    var quotes = S().quotes || [], commits = (S().commitments || []).filter(function (c) { return c.status === 'active'; });
    append(root, h('div', { class: 'kpis' },
      kpi('Quotes waiting', String(quotes.filter(function (q) { return q.status === 'sent'; }).length), 'sent, no answer yet'),
      kpi('Accepted', String(quotes.filter(function (q) { return q.status === 'accepted'; }).length), 'became recurring commitments'),
      kpi('Committed a week', commits.reduce(function (s, c) { return s + c.unitsPerDelivery * c.days.length; }, 0) + ' units', commits.length + ' active commitment(s)'),
      kpi('Committed revenue', money(commits.reduce(function (s, c) { return s + c.unitsPerDelivery * c.days.length * c.priceCents * c.weeks; }, 0)), 'over the agreed terms')));

    var ta = h('textarea', { rows: 3, maxlength: 600, 'aria-label': 'Buyer\'s enquiry' }); ta.value = st.text;
    var buyerSel = h('select', { 'aria-label': 'Buyer' }, h('option', { value: '', text: 'New buyer…' }), accounts.map(function (a) { return h('option', { value: a.id, text: a.name }); }));
    buyerSel.value = st.buyer;
    var newName = h('input', { placeholder: 'Buyer name', 'aria-label': 'New buyer name', maxlength: 60 }); newName.value = st.newName || '';
    var newLabel = h('label', null, 'Buyer name', newName);
    var syncBuyer = function () { newLabel.style.display = buyerSel.value ? 'none' : ''; };
    buyerSel.addEventListener('change', syncBuyer); syncBuyer();
    var out = h('div', { class: 'qt-out' });
    function draw() {
      out.textContent = '';
      var q = M.quotes.parse(ta.value); q.text = ta.value;
      if (q.missing.length) { append(out, h('p', { class: 'callout', text: 'I couldn\'t find ' + q.missing.join(' or ') + ' in the enquiry. Try something like "60kg of bok choy weekly at S$2.80/kg".' })); return; }
      var kpu = M.quotes.kgPerUnit(q.product);
      var opts = M.quotes.options(q);
      var days = q.days.map(function (d) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]; }).join(', ');
      append(out,
        h('div', { class: 'qt-read' }, aiPill(), h('strong', { text: 'I read this as:' }),
          h('span', { class: 'im-chip ok', text: q.product.title }), h('span', { class: 'im-chip ok', text: q.qty + ' ' + q.unit + ' ' + q.freq }),
          q.price ? h('span', { class: 'im-chip ok', text: money(q.price) + '/' + q.priceUnit }) : h('span', { class: 'im-chip bad', text: 'no price given' }),
          days ? h('span', { class: 'im-chip ok', text: days }) : null, h('span', { class: 'im-chip ok', text: q.termWeeks + ' week(s)' })),
        h('small', { class: 'hint', text: '1 unit of ' + q.product.title + ' ≈ ' + kpu + ' kg (Settings). Spare supply right now: about ' + (opts[0] ? opts[0].spare : 0) + ' units (' + Math.round((opts[0] ? opts[0].spare : 0) * kpu * 10) / 10 + ' kg) a week, from Harvest allocation.' + (opts[0] && opts[0].dayNote ? ' ' + opts[0].dayNote : '') }),
        h('div', { class: 'sim-grid qt-grid' }, opts.map(function (o, i) {
          return h('article', { class: 'sim-card' + (i === 0 ? ' best' : '') + (!o.guardOk ? ' blocked' : '') },
            h('div', { class: 'sim-head' }, h('strong', { text: o.title }), i === 0 ? badge('Recommended', 'green') : h('span')),
            h('div', { class: 'sim-price' }, h('strong', { text: money(o.kgPrice) + '/kg' }), h('small', { text: money(o.unitPrice) + ' a unit' })),
            h('ul', { class: 'sim-nums' },
              h('li', null, h('small', { text: 'Per week' }), h('strong', { text: o.kgWeek + ' kg' })),
              h('li', null, h('small', { text: 'Covers' }), h('strong', { text: o.coverage + '% of ask' })),
              h('li', null, h('small', { text: 'Revenue / week' }), h('strong', { text: money(o.weeklyRevenue) })),
              h('li', { class: 'sim-margin' }, h('small', { text: 'Margin / week' }), h('strong', { text: money(o.weeklyMargin) + ' (' + o.marginPct + '%)' }))),
            h('div', { class: 'qt-checks' },
              h('ul', { class: 'cs-checks' }, h('li', { class: o.guardOk ? 'ok' : 'bad', text: (o.guardOk ? '✓' : '✗') + ' Margin Guard' }), h('li', { class: o.supplyOk ? 'ok' : 'warn', text: (o.supplyOk ? '✓ Supply covered' : '! More than is spare') }))),
            h('small', { class: 'sim-note', text: o.why }),
            h('button', { class: 'pa-act btn btn-sm ' + (i === 0 ? 'btn-forest' : 'btn-outline'), type: 'button', disabled: !o.guardOk, text: 'Draft this quote', onclick: function () { openQuoteDraft(q, o); } }));
        })));
    }
    function openQuoteDraft(q, o) {
      var acc = accounts.filter(function (a) { return a.id === buyerSel.value; })[0];
      var name = acc ? acc.name : (newName.value.trim() || 'New buyer');
      document.querySelectorAll('.qt-dialog').forEach(function (d) { if (d.open) d.close(); d.remove(); });
      var body = h('textarea', { rows: 11, 'aria-label': 'Quote' });
      var first = acc ? firstName(acc.contact) : 'there';
      body.value = 'Hi ' + first + ',\n\nThanks for your enquiry about ' + q.product.title + '. Here\'s what we can offer:\n\n' +
        '• ' + o.kgWeek + ' kg a week' + (o.coverage < 100 ? ' (to start — we can grow into the full ' + q.qty + ' ' + q.unit + ')' : '') + '\n' +
        '• ' + money(o.kgPrice) + ' per kg, delivered ' + (q.days.filter(function (d) { return [2, 4, 6].indexOf(d) > -1; }).length ? q.days.map(function (d) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]; }).join(' & ') : 'Tue, Thu or Sat') + '\n' +
        '• Harvested the same morning in Kranji, pesticide-free\n• ' + q.termWeeks + '-week agreement, payment Net 14\n\nShall we put it in place from next week?\n\n— MEOD Farm (trade sales)';
      var dlg = h('dialog', { class: 'receipt-dialog reply-dialog qt-dialog', 'aria-labelledby': 'qt-title' });
      function closeDialog() { if (dlg.open) dlg.close(); dlg.remove(); }
      append(dlg,
        h('button', { class: 'pd-close', type: 'button', 'aria-label': 'Close', onclick: closeDialog }, iconCircle(ICONS.x, 'bare')),
        h('div', { class: 'rd-body' },
          h('div', { class: 'rd-head' }, h('h2', { id: 'qt-title', text: 'Quote for ' + name }), aiPill(), h('small', { class: 'ai-note', text: 'You review and send' })),
          h('div', { class: 'rd-form' }, h('label', null, 'Message', body))),
        h('div', { class: 'r-actions' },
          h('button', { class: 'btn btn-sm btn-outline', type: 'button', text: 'Cancel', onclick: closeDialog }),
          h('button', { class: 'btn btn-sm btn-forest', type: 'button', text: 'Send quote (simulated)', onclick: function () {
            var r = M.quotes.create(q, o, { accountId: acc ? acc.id : null, name: name }, session.email);
            closeDialog();
            commit('quote.sent', r.id, 'Quote ' + r.id + ' sent to ' + name + ' (simulated).');
          } })));
      dlg.addEventListener('close', function () { dlg.remove(); });
      document.body.appendChild(dlg);
      dlg.showModal();
    }
    ta.addEventListener('input', function () { st.text = ta.value; draw(); });
    buyerSel.addEventListener('change', function () { st.buyer = buyerSel.value; });
    newName.addEventListener('input', function () { st.newName = newName.value; });
    draw();
    append(root, panel(aiTitle('Quotation Copilot'), 'Paste a buyer\'s message. It\'s read into product, quantity, price and days, then checked against Margin Guard and what\'s actually spare each week (Harvest allocation).',
      h('div', { class: 'form-grid qt-form' }, h('label', { class: 'qt-text' }, 'Buyer\'s enquiry', ta), h('label', null, 'Buyer', buyerSel), newLabel),
      out));

    append(root, panel('Quotes sent', 'When the buyer answers, record it. An accepted quote becomes a recurring commitment that Demand Radar and Harvest allocation count as confirmed demand.', table([
      { label: 'Quote', render: function (q) { var p = M.byId('products', q.productId); return h('span', null, h('strong', { text: q.id + ' · ' + q.buyerName }), h('br'), h('small', { text: q.option.kgWeek + ' kg/week ' + p.title + ' at ' + money(q.option.kgPrice) + '/kg · ' + q.termWeeks + ' weeks' })); } },
      { label: 'Option', render: function (q) { return q.option.title; } },
      { label: 'Status', render: function (q) { return statusBadge(q.status === 'sent' ? 'pending' : q.status === 'accepted' ? 'approved' : 'rejected'); } },
      { label: 'Actions', render: function (q) {
        if (q.status !== 'sent') return h('span', { class: 'nowrap' }, h('button', { type: 'button', class: 'mini', text: 'Why?', onclick: function () { var d = M.decisions.find(q.id); if (d) openWhy(d.title, d, d); } }));
        return h('div', { class: 'actions stack' },
          mini('Buyer accepted', function () { var r = M.quotes.decide(q.id, true, session.email); if (!r.ok) { toast(r.error); return; } commit('quote.accepted', q.id, r.text); }),
          mini('Declined', function () { var r = M.quotes.decide(q.id, false, session.email); if (!r.ok) { toast(r.error); return; } commit('quote.declined', q.id, 'Quote marked as declined.'); }, { danger: true }),
          mini('Why?', function () { var d = M.decisions.find(q.id); if (d) openWhy(d.title, d, d); }));
      } }
    ], quotes, 'No quotes yet — paste an enquiry above.')));

    append(root, panel('Recurring commitments', 'Confirmed weekly volumes from accepted quotes. They\'re included in Demand Radar\'s confirmed demand and in Harvest allocation\'s trade orders.', table([
      { label: 'Buyer', render: function (c) { return h('strong', { text: c.buyerName }); } },
      { label: 'Product', render: function (c) { return M.byId('products', c.productId).title; } },
      { label: 'Per delivery', num: true, render: function (c) { return c.unitsPerDelivery + ' units (' + Math.round(c.unitsPerDelivery * M.quotes.kgPerUnit(M.byId('products', c.productId)) * 10) / 10 + ' kg)'; } },
      { label: 'Days', render: function (c) { return c.days.map(function (d) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]; }).join(', '); } },
      { label: 'From', render: function (c) { return shortDate(M.clearance.parseDayKey(c.startKey).toISOString()) + ' · ' + c.weeks + ' wks'; } },
      { label: 'Price', num: true, render: function (c) { return money(c.priceCents) + '/unit'; } }
    ], commits, 'No commitments yet — they appear here when a buyer accepts a quote.')));
  }

  /* ---------------- Farm Decision Twin (staff + admin) ----------------
   * A what-if model of the next 2 weeks for one crop. Change the harvest or demand, lose a
   * trade buyer or a batch, and compare responses side by side — numbers update as you move. */
  function twinView(root) {
    var crops = M.radar.crops();
    var st = twinView.state || (twinView.state = { productId: (crops.filter(function (c) { return c.status === 'surplus'; })[0] || crops[0]).product.id, harvestPct: 0, demandPct: 0, lose: '', cancel: false });
    var sel = h('select', { 'aria-label': 'Crop' }, crops.map(function (c) { return h('option', { value: c.product.id, text: c.product.title }); })); sel.value = st.productId;
    var mkRange = function (min, max, val, label) { var r = h('input', { type: 'range', min: min, max: max, step: 5, 'aria-label': label }); r.value = String(val); return r; };
    var hr = mkRange(-60, 100, st.harvestPct, 'Harvest change'), dr = mkRange(-50, 50, st.demandPct, 'Demand change');
    var hrOut = h('strong'), drOut = h('strong');
    var lose = h('select', { 'aria-label': 'Lose a trade buyer' }, h('option', { value: '', text: 'No — keep all buyers' }), M.b2b.store().accounts.map(function (a) { return h('option', { value: a.id, text: a.name }); })); lose.value = st.lose;
    var cancel = h('input', { type: 'checkbox' }); cancel.checked = st.cancel;
    var out = h('div', { class: 'tw-out', 'aria-live': 'polite' });
    function draw() {
      st.productId = sel.value; st.harvestPct = Number(hr.value); st.demandPct = Number(dr.value); st.lose = lose.value; st.cancel = cancel.checked;
      hrOut.textContent = (st.harvestPct > 0 ? '+' : '') + st.harvestPct + '%'; drOut.textContent = (st.demandPct > 0 ? '+' : '') + st.demandPct + '%';
      var r = M.twin.simulate(st.productId, { harvestPct: st.harvestPct, demandPct: st.demandPct, loseAccountId: st.lose || null, cancelBatch: st.cancel });
      out.textContent = '';
      if (!r) return;
      var maxM = Math.max.apply(null, r.options.map(function (o) { return Math.abs(o.margin); }).concat([1]));
      append(out,
        h('div', { class: 'kpis tw-kpis' },
          kpi('Supply · 2 weeks', String(r.supply), r.stock + ' stock + ' + r.harvest + ' harvest' + (r.cancelled ? ' (' + r.cancelled + ' lost)' : '')),
          kpi('Demand · 2 weeks', String(r.demand), r.confirmed + ' confirmed + ' + r.shop + ' shop' + (r.lostBuyer ? ' · −' + r.lostBuyer + ' from ' + r.buyer.name.replace(/\s*\(demo\)/, '') : '')),
          kpi(r.surplus >= 0 ? 'Surplus' : 'Short', String(Math.abs(r.surplus)), r.surplus >= 0 ? money(r.surplus * r.product.priceCents) + ' at risk' : money(-r.surplus * r.product.priceCents) + ' of sales missed'),
          kpi('Best response', r.best ? r.best.title : '—', r.best ? money(r.best.margin) + ' margin' : '')),
        h('div', { class: 'tw-opts' }, r.options.map(function (o) {
          var bar = h('span', { class: 'sim-bar' + (o.margin < 0 ? ' neg' : '') }, h('span')); bar.firstChild.style.width = Math.round(Math.abs(o.margin) / maxM * 100) + '%';
          return h('article', { class: 'tw-opt' + (o.best ? ' best' : '') + (o.blocked ? ' blocked' : '') },
            h('div', { class: 'sim-head' }, h('strong', { text: o.title }), o.best ? badge('Best', 'green') : o.blocked ? badge('Blocked', 'red') : h('span')),
            h('ul', { class: 'sim-nums' },
              h('li', null, h('small', { text: 'Revenue' }), h('strong', { text: money(o.revenue) })),
              h('li', { class: 'sim-margin' }, h('small', { text: 'Margin' }), h('strong', { text: money(o.margin) })),
              h('li', { class: o.unsold ? 'sim-left' : '' }, h('small', { text: 'Left unsold' }), h('strong', { text: String(o.unsold) })),
              h('li', null, h('small', { text: 'Waste value' }), h('strong', { text: money(o.wasteCents) }))),
            bar, h('small', { class: 'sim-note', text: o.note }));
        })),
        h('details', { class: 'sim-assume' }, h('summary', { text: 'Assumptions behind these numbers' }), h('ul', null, r.assumptions.map(function (a) { return h('li', { text: a }); }))));
    }
    var presets = [['Demand drops 20%', { demandPct: -20 }], ['Bumper harvest +50%', { harvestPct: 50 }], ['Batch fails', { cancel: true }], ['Lose biggest buyer', { lose: true }], ['Reset', {}]];
    var presetBar = h('div', { class: 'tw-presets' }, h('small', { text: 'Stress tests:' }), presets.map(function (pr) {
      return h('button', { type: 'button', class: 'chip', text: pr[0], onclick: function () {
        var v = pr[1];
        hr.value = String(v.harvestPct || 0); dr.value = String(v.demandPct || 0); cancel.checked = !!v.cancel;
        if (v.lose) {
          var big = M.b2b.store().accounts.map(function (a) { var u = (a.usual || []).filter(function (x) { return x.productId === sel.value; })[0]; return { a: a, n: u ? u.qty * (a.standingDays || []).length : 0 }; }).sort(function (a, b) { return b.n - a.n; })[0];
          if (!big || !big.n) { toast('No trade buyer takes ' + M.byId('products', sel.value).title + ' — try a crop like Xiao Bai Cai or Kangkong.'); return; }
          lose.value = big.a.id;
        } else lose.value = '';
        draw();
      } });
    }));
    [sel, lose, cancel].forEach(function (el) { el.addEventListener('change', draw); });
    [hr, dr].forEach(function (el) { el.addEventListener('input', draw); });
    draw();
    append(root, panel(aiTitle('Try a what-if'), 'A model of the next 2 weeks for one crop — MEOD\'s orders, harvests and buyers, not the greenhouse. Move the sliders or run a stress test, and compare what each response would earn.',
      h('div', { class: 'tw-controls' },
        h('label', null, 'Crop', sel),
        h('label', { class: 'tw-range' }, h('span', null, 'Harvest ', hrOut), hr),
        h('label', { class: 'tw-range' }, h('span', null, 'Demand ', drOut), dr),
        h('label', null, 'Lose a trade buyer', lose),
        h('label', { class: 'toggle tw-cancel' }, cancel, h('span', { text: 'Next batch fails' }))),
      presetBar, out));
  }

  /* ---------------- Ask Tyllage: Ops Copilot (staff + admin) ----------------
   * Questions in English or 中文, typed or spoken. Answers are tables of real records, with how
   * they were worked out and links to the pages behind them — or "I can't answer that yet".
   * Laid out like the customer's Ask MEOD chat. */
  var COPILOT_EXAMPLES = ['Which vegetables are selling slower this week?', 'What enquiries haven\'t been answered?', 'What\'s at risk of going to waste?', 'What is waiting for approval?', '哪些询问还没回复？', '哪些蔬菜卖得慢？', 'How is Kai Lan doing?'];
  var MIC_ICON = '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v5"/>';
  var COPILOT_PLACEHOLDER = 'Ask about sales, stock, harvests, enquiries… (English or 中文)';
  function copilotView(root) {
    var st = copilotView.state || (copilotView.state = { history: [
      { who: 'bot', text: 'Hi ' + String(session.name || 'there').split(' ')[0] + '! I\'m Tyllage 🌱 Ask me about sales, stock, harvests, enquiries or approvals, in English or 中文. I answer from MEOD\'s records and show my working.', at: new Date().toISOString() }
    ] });
    var log = h('div', { class: 'chat-log', 'aria-live': 'polite' });
    var input = h('input', { placeholder: COPILOT_PLACEHOLDER, maxlength: 200, 'aria-label': 'Ask Tyllage', autocomplete: 'off' });
    var lang = h('select', { 'aria-label': 'Voice language' }, h('option', { value: 'en-SG', text: 'English' }), h('option', { value: 'zh-CN', text: '中文' }));
    var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    var mic = h('button', { type: 'button', class: 'chat-send cp-mic', 'aria-label': 'Ask by voice', disabled: !Rec, title: Rec ? 'Ask by voice' : 'Voice needs Chrome or Edge' }, iconCircle(MIC_ICON, 'bare'));

    function time(iso) { return new Date(iso).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' }); }
    function bubble(m) {
      if (m.who === 'user') return h('div', { class: 'bubble-row user' }, h('div', { class: 'bubble' }, h('p', { text: m.text }), h('time', { text: time(m.at) })));
      var r = m.r, rich = r && r.ok;
      return h('div', { class: 'bubble-row bot' + (rich ? ' cp-wide' : '') },
        h('span', { class: 'avatar av-bot', 'aria-hidden': 'true', text: 'T' }),
        h('div', { class: 'bubble' },
          h('p', { text: r ? r.answer : m.text }),
          rich && r.rows.length ? h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, r.cols.map(function (c) { return h('th', { text: c }); }))),
            h('tbody', null, r.rows.map(function (row) { return h('tr', null, row.map(function (c, ci) { return h('td', { 'data-label': r.cols[ci], text: c }); })); })))) : null,
          rich ? h('small', { class: 'cp-how', text: (r.zh ? '计算方法：' : 'How I worked this out: ') + r.how }) : null,
          rich && r.links.length ? h('div', { class: 'cp-links' }, r.links.map(function (l) { return h('a', { class: 'msg-link', href: l[1], text: l[0] + ' →' }); })) : null,
          h('time', { text: time(m.at) })));
    }
    function drawLog() { log.textContent = ''; st.history.forEach(function (m) { log.appendChild(bubble(m)); }); log.scrollTop = log.scrollHeight; }
    function ask(q) {
      q = String(q || '').trim();
      if (!q) return;
      st.history.push({ who: 'user', text: q, at: new Date().toISOString() });
      drawLog();
      var typing = h('div', { class: 'bubble-row bot' }, h('span', { class: 'avatar av-bot', 'aria-hidden': 'true', text: 'T' }), h('div', { class: 'bubble typing', 'aria-label': 'Tyllage is working it out' }, h('i'), h('i'), h('i')));
      log.appendChild(typing);
      log.scrollTop = log.scrollHeight;
      var r = M.copilot.ask(q);
      setTimeout(function () {
        st.history.push({ who: 'bot', r: r, at: new Date().toISOString() });
        st.history = st.history.slice(-20);
        drawLog();
      }, 500);
    }
    var form = h('form', { class: 'chat-form' }, mic, input, h('button', { class: 'chat-send', type: 'submit', 'aria-label': 'Ask' }, iconCircle('<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>', 'bare')));
    form.addEventListener('submit', function (e) { e.preventDefault(); var t = input.value; input.value = ''; ask(t); });
    mic.addEventListener('click', function () {
      if (!Rec) return;
      var rec = new Rec(); rec.lang = lang.value; rec.interimResults = false; rec.maxAlternatives = 1;
      mic.classList.add('listening'); mic.disabled = true; input.placeholder = lang.value === 'zh-CN' ? '正在听…' : 'Listening…';
      rec.onresult = function (e) { ask(e.results[0][0].transcript); };
      rec.onerror = function (e) { toast(e.error === 'not-allowed' ? 'Microphone access was blocked.' : 'Didn\'t catch that — try again.'); };
      rec.onend = function () { mic.classList.remove('listening'); mic.disabled = false; input.placeholder = COPILOT_PLACEHOLDER; };
      rec.start();
    });
    var chips = h('div', { class: 'quick-chips' }, COPILOT_EXAMPLES.map(function (q) { return h('button', { type: 'button', text: q, onclick: function () { ask(q); } }); }));

    drawLog();
    append(root, h('div', { class: 'chat-layout' },
      h('section', { class: 'chat-card' },
        h('header', { class: 'chat-header' },
          h('span', { class: 'avatar av-bot big', 'aria-hidden': 'true', text: 'T' }),
          h('div', { class: 'chat-head-text' }, h('strong', { text: 'Ask Tyllage' }),
            h('small', null, h('span', { class: 'status-dot on', text: 'Answers from MEOD\'s records' }), ' · English / 中文')),
          aiPill()),
        log, chips, form),
      h('aside', { class: 'chat-side' },
        h('section', { class: 'panel' },
          h('h2', { text: 'I can answer' }),
          h('ul', { class: 'help-list' },
            [[ICONS.leaf, 'Sales & crops', 'Slow sellers, best sellers, this week\'s sales'], [ICONS.chat, 'Enquiries', 'Tickets, visit requests and feedback waiting'],
             [ICONS.clock, 'Waste & harvests', 'Batches near sell-by, harvests due'], [ICONS.shield, 'Approvals', 'Prices, campaigns and posts waiting'],
             [ICONS.box, 'Any vegetable', 'Try "How is Kai Lan doing?"']]
              .map(function (x) { return h('li', null, iconCircle(x[0], 'soft'), h('span', null, h('strong', { text: x[1] }), h('small', { text: x[2] }))); }))),
        h('section', { class: 'panel' },
          h('h2', { text: 'Ask out loud' }),
          h('p', { class: 'hint', text: Rec ? 'Press the mic beside the message box and speak.' : 'Voice needs Chrome or Edge; typing works everywhere.' }),
          h('label', { class: 'cp-lang' }, h('small', { text: 'Voice language' }), lang)),
        h('section', { class: 'panel human-card' },
          h('h2', { text: 'No guessing' }),
          h('p', { class: 'hint', text: 'Every answer comes from MEOD\'s records, shows how it was worked out and links to the page behind it. If the records can\'t answer, Tyllage says so.' })))));
  }

  /* ---- Small add-ons: substitutes, learning-journey packages, re-invites ---- */
  var SUBSTITUTES = { 'nai bai': 'Xiao Bai Cai', 'baby spinach': 'Bayam', 'spinach': 'Bayam', 'choy sum': 'HK Cai Xin', 'romaine': 'Cos Lettuce', 'rocket': 'Mesclun Mix', 'arugula': 'Mesclun Mix', 'kale': 'Tuscan Kale', 'button mushroom': 'Shiitake Mushroom', 'mint': 'Garden Mint', 'basil': 'Sweet Basil' };
  function substituteFor(g) {
    var name = (g.product ? g.product.title : g.name).toLowerCase();
    var mapped = SUBSTITUTES[name] && S().products.filter(function (p) { return p.title === SUBSTITUTES[name]; })[0];
    var inStock = function (p) { var s = M.stockStatus(p); return s.known && s.qty > 0; };
    if (mapped && inStock(mapped) && (!g.product || mapped.id !== g.product.id)) return mapped;
    if (!g.product) return null;
    return S().products.filter(function (p) { return p.id !== g.product.id && p.category === g.product.category && !p.bagOffer && inStock(p); })
      .sort(function (a, b) { return b.stock.qty - a.stock.qty; })[0] || null;
  }
  function visitPackage(b) {
    var R = M.RULES, type = b.groupType === 'school' ? 'school' : 'other';
    var sessions = M.visits.sessions(b.pax);
    var guides = Math.max(1, Math.ceil(Math.min(b.pax, R.visitSessionMax) / R.visitGuestsPerGuide[type]));
    var per = R.visitPricePerPax[b.experience] || 2000;
    var fit = M.visits.fits(b);
    return { sessions: sessions, guides: guides, per: per, total: per * b.pax, bag: R.visitBagCents, bagTotal: R.visitBagCents * b.pax, fits: fit.fits, free: fit.fits ? [] : M.visits.freeDays(b, 2).map(function (k) { return shortWeekday(M.clearance.parseDayKey(k).toISOString()); }),
      programme: b.groupType === 'school' ? ['Welcome & food-security talk (Singapore imports over 90% of its food)', 'Greenhouse walk: how greens grow without pesticides', 'Hands-on harvest — each child picks a bunch', 'Tasting & Q&A'] :
        b.experience === 'Workshop' ? ['Farm intro', 'Hands-on workshop', 'Harvest & tasting', 'Team photo'] : ['Farm intro', 'Greenhouse tour', 'Harvest your own greens', 'Tasting'] };
  }
  function openVisitPackage(b) {
    document.querySelectorAll('.vp-dialog').forEach(function (d) { if (d.open) d.close(); d.remove(); });
    var pk = visitPackage(b), bag = h('input', { type: 'checkbox' }); bag.checked = true;
    var totalLine = h('strong');
    var upd = function () { totalLine.textContent = money(pk.total + (bag.checked ? pk.bagTotal : 0)) + ' total'; };
    bag.addEventListener('change', upd); upd();
    var dlg = h('dialog', { class: 'receipt-dialog reply-dialog vp-dialog', 'aria-labelledby': 'vp-title' });
    function closeDialog() { if (dlg.open) dlg.close(); dlg.remove(); }
    append(dlg,
      h('button', { class: 'pd-close', type: 'button', 'aria-label': 'Close', onclick: closeDialog }, iconCircle(ICONS.x, 'bare')),
      h('div', { class: 'rd-body' },
        h('div', { class: 'rd-head' }, h('h2', { id: 'vp-title', text: 'Proposed package · ' + (b.org || b.name) }), aiPill(), h('small', { class: 'ai-note', text: 'Staff check before sending' })),
        h('ul', { class: 'why-data' },
          h('li', null, h('span', { text: 'Experience' }), h('strong', { text: b.experience + ' · ' + b.pax + ' guests' })),
          h('li', null, h('span', { text: 'Sessions' }), h('strong', { text: pk.sessions + ' of up to ' + M.RULES.visitSessionMax })),
          h('li', null, h('span', { text: 'Staff needed' }), h('strong', { text: pk.guides + ' guide(s) per session' })),
          h('li', null, h('span', { text: 'Price' }), h('strong', { text: money(pk.per) + ' a guest = ' + money(pk.total) })),
          h('li', null, h('span', { text: 'Date' }), h('strong', { text: pk.fits ? 'Available' : 'Full — offer ' + pk.free.join(' or ') }))),
        h('section', { class: 'why-sec' }, h('h3', { text: 'Programme' }), h('ol', { class: 'why-calc' }, pk.programme.map(function (s) { return h('li', { text: s }); }))),
        h('label', { class: 'toggle' }, bag, h('span', { text: 'Add a take-home harvest bag (' + money(pk.bag) + ' a guest, ' + money(pk.bagTotal) + ')' })),
        h('p', { class: 'vp-total' }, totalLine, h('small', { text: ' · prices are illustrative (Settings)' }))),
      h('div', { class: 'r-actions' },
        h('button', { class: 'btn btn-sm btn-outline', type: 'button', text: 'Cancel', onclick: closeDialog }),
        h('button', { class: 'btn btn-sm btn-forest', type: 'button', text: 'Save proposal', onclick: function () {
          b.proposal = { sessions: pk.sessions, guides: pk.guides, totalCents: pk.total + (bag.checked ? pk.bagTotal : 0), bag: bag.checked, at: new Date().toISOString(), by: session.email };
          M.decisions.log({ kind: 'visit', ref: b.id, feature: 'Learning journeys', title: 'Package for ' + (b.org || b.name) + ': ' + money(b.proposal.totalCents), recommendation: b.experience,
            inputs: [['Guests', b.pax], ['Group type', b.groupType || 'other'], ['Sessions', pk.sessions]], calc: [pk.sessions + ' session(s) of up to ' + M.RULES.visitSessionMax, pk.guides + ' guide(s) at 1 per ' + M.RULES.visitGuestsPerGuide[b.groupType === 'school' ? 'school' : 'other'] + ' guests', money(pk.per) + ' × ' + b.pax + (bag.checked ? ' + bags ' + money(pk.bagTotal) : '')],
            assumptions: ['Prices and staffing ratios are illustrative.'], confidence: { level: 'high', note: 'Fixed rules.' } }, session.email);
          closeDialog();
          commit('booking.package', b.id, 'Proposal saved for ' + (b.org || b.name) + ' — ' + money(b.proposal.totalCents) + '.');
        } })));
    dlg.addEventListener('close', function () { dlg.remove(); });
    document.body.appendChild(dlg);
    dlg.showModal();
  }
  function reinvitePanel() {
    var now = Date.now();
    var past = S().bookings.filter(function (b) { return b.status === 'confirmed' && M.clearance.parseDayKey(String(b.date).slice(0, 10)).getTime() < now - 7 * 864e5; });
    var upcomingOrgs = S().bookings.filter(function (b) { return b.status !== 'declined' && M.clearance.parseDayKey(String(b.date).slice(0, 10)).getTime() >= now; }).map(function (b) { return b.org; });
    var cands = past.filter(function (b) { return upcomingOrgs.indexOf(b.org) < 0; });
    var invited = S().visitInvites || [];
    return panel(aiTitle('Invite past groups back'), 'Organisations that visited before and have nothing booked. Only those who agreed to hear from MEOD again can be invited.',
      cands.length ? table([
        { label: 'Organisation', render: function (b) { return h('span', null, h('strong', { text: b.org || b.name }), h('br'), h('small', { text: b.experience + ' · ' + b.pax + ' guests' })); } },
        { label: 'Last visit', render: function (b) { return shortDate(M.clearance.parseDayKey(String(b.date).slice(0, 10)).toISOString()); } },
        { label: 'Suggestion', render: function (b) { return b.groupType === 'school' ? 'Invite the next class or year group next term' : b.groupType === 'company' ? 'Suggest a team-building workshop next quarter' : 'Invite back for a seasonal harvest day'; } },
        { label: 'Permission', render: function (b) { return b.consentFollowUp ? badge('Agreed to follow-up', 'green') : badge('No permission', 'grey'); } },
        { label: 'Actions', render: function (b) {
          if (!b.consentFollowUp) return h('small', { class: 'hint', text: 'Can\'t contact' });
          if (invited.some(function (x) { return x.bookingId === b.id; })) return h('small', { class: 'pending-note', text: 'Invited' });
          return mini('Draft invite', function () {
            var msg = prompt('Invite message (simulated send):', 'Hi ' + firstName(b.name) + ', thank you for visiting MEOD Farm with ' + (b.org || 'your group') + '! We\'d love to host ' + (b.groupType === 'school' ? 'another class' : 'you') + ' again — new this season: a hands-on harvest session. Reply to pick a date.');
            if (msg === null) return;
            S().visitInvites = invited.concat([{ bookingId: b.id, at: new Date().toISOString(), by: session.email, message: msg }]);
            commit('booking.reinvite', b.id, 'Invite sent to ' + (b.org || b.name) + ' (simulated).');
          });
        } }
      ], cands, '') : h('p', { class: 'empty', text: 'No past groups to invite right now.' }));
  }

  /* ---------------- Harvest Rescue (staff + admin) ----------------
   * Harvested batches nearing (or past) their sell-by date, with unsold units and value at
   * risk, AI-ranked rescue options (trade buyers first — full price — then customer alerts,
   * Buy to Clear within the minimum price, or processing into MEOD products), and a log of
   * what was done. Past the sell-by date, quality and food safety are a staff decision. */
  var RESCUE_LEVEL = {
    expired: ['Past sell-by', 'red'], urgent: ['Sell by tomorrow', 'red'], soon: ['2 days left', 'amber'], ok: ['On track', 'green']
  };
  var RESCUE_ACTION = { clear: 'Listed on Buy to Clear', offer: 'Offered to trade buyer', alert: 'Customer alert drafted', process: 'Processed into MEOD product', donate: 'Donated', compost: 'Composted' };
  function rescueLevelLabel(x) {
    if (x.level === 'ok') return [x.daysLeft + ' days left', 'green'];
    if (x.level === 'urgent' && x.daysLeft === 0) return ['Sell by today', 'red'];
    return RESCUE_LEVEL[x.level];
  }
  function rescueAlert(x) {
    var p = x.product, a = audienceFor(p.id), id = M.nextId('CP');
    S().campaigns.unshift({
      id: id, kind: 'rescue-alert', productId: p.id, title: p.title + ' — fresh harvest offer', language: 'en',
      message: 'Fresh from Kranji 🌱 We harvested extra ' + p.title + ' this week — order by ' + shortWeekday(M.clearance.parseDayKey(x.batch.sellBy).toISOString()) + ' for our next delivery' +
        (x.listing ? ', or grab it on Buy to Clear at ' + money(x.listing.clearancePriceCents) : '') + '. Help us waste nothing! Reply STOP to opt out.',
      audience: a.eligible, status: 'pending_approval', createdBy: session.email, approvedBy: null, createdAt: new Date().toISOString(), sentCount: 0
    });
    M.rescue.log(x.batch.id, 'alert', 0, 0, session.email, a.eligible.length + ' opted-in customer(s)');
    commit('rescue.alert', id, 'Alert for ' + p.title + ' drafted for ' + a.eligible.length + ' opted-in customer(s) — waiting for approval in Campaign Studio.');
  }
  function rescueWriteOff(x, action) {
    var verb = { process: 'turned into ' + (x.product.category === 'herbs' ? 'Farm Pesto' : 'Vege Powder'), donate: 'donated', compost: 'composted' }[action];
    var raw = prompt('How many ' + x.product.title + ' were ' + verb + '? (' + x.unsold + ' unsold)', String(x.unsold));
    if (raw === null) return;
    var q = Math.min(x.unsold, Math.max(0, parseInt(raw, 10) || 0));
    if (!q) { toast('Enter a quantity above 0.'); return; }
    M.rescue.log(x.batch.id, action, q, action === 'process' ? Math.round(q * x.product.priceCents * 0.5) : 0, session.email, '');
    commit('rescue.' + action, x.batch.id, q + ' ' + x.product.title + ' ' + verb + ' — recorded and taken out of sellable stock.');
  }
  function runRescueOption(x, o) {
    if (o.key === 'clear') {
      var r = M.rescue.listOnClear(x, o, session.email);
      if (!r.ok) { toast(r.error); return; }
      commit('rescue.clear', r.id, x.unlisted + ' ' + x.product.title + ' listed on Buy to Clear at ' + money(o.priceCents) + ' until ' + shortDate(M.clearance.parseDayKey(x.batch.sellBy).toISOString()) + '.');
    } else if (o.key === 'b2b') {
      var acc = M.b2b.store().accounts.filter(function (a) { return a.id === o.accountIds[0]; })[0];
      openB2BMessage('offer', { account: acc, product: x.product }, function () { M.rescue.log(x.batch.id, 'offer', 0, 0, session.email, acc.name); M.save(); });
    } else if (o.key === 'alert') rescueAlert(x);
    else if (o.key === 'process') rescueWriteOff(x, 'process');
  }

  function rescueView(root) {
    var list = M.rescue.batches();
    var at = list.filter(function (x) { return x.level !== 'ok'; });
    var log = S().rescueLog || [];
    var monthAgo = Date.now() - 30 * 864e5;
    var recent = log.filter(function (r) { return new Date(r.at).getTime() > monthAgo; });
    var rescuedCents = recent.reduce(function (s, r) { return s + (r.valueCents || 0); }, 0);
    var rescuedUnits = recent.filter(function (r) { return r.action !== 'compost' && r.action !== 'alert' && r.action !== 'offer'; }).reduce(function (s, r) { return s + r.qty; }, 0);
    append(root, h('div', { class: 'kpis' },
      kpi('At risk', String(at.length) + ' batch(es)', 'sell-by within 2 days or passed'),
      kpi('Unsold', String(list.reduce(function (s, x) { return s + x.unsold; }, 0)), 'units from recent harvests'),
      kpi('Value at risk', money(at.reduce(function (s, x) { return s + x.valueCents; }, 0)), 'at normal price, at-risk batches'),
      kpi('Rescued · 30 days', money(rescuedCents), rescuedUnits + ' units sold, processed or donated')));
    append(root, bagDecisionPanel());

    var shelf = M.RULES.shelfDays;
    append(root, panel(aiTitle('Batches to rescue'), 'Recent harvests with unsold stock, soonest sell-by first. Options are ranked: full-price trade sales before discounts. Shelf life (illustrative): ' +
      Object.keys(shelf).map(function (k) { return M.CATEGORIES[k].label.toLowerCase() + ' ' + shelf[k] + ' days'; }).join(', ') + '.',
      list.length ? h('div', { class: 'rescue-list' }, list.map(function (x) {
        var lv = rescueLevelLabel(x);
        var bar = h('span', { class: 'rescue-bar lv-' + x.level }, h('span'));
        bar.firstChild.style.width = x.elapsedPct + '%';
        var opts = M.rescue.options(x);
        return h('article', { class: 'rescue-card lv-' + x.level },
          h('div', { class: 'rescue-head' },
            h('span', { class: 'rw-tier-cell' }, thumbMini(x.product), h('strong', { text: x.product.title })),
            badge(lv[0], lv[1])),
          h('div', { class: 'rescue-meta' },
            h('small', { text: 'Harvested ' + shortDate(x.batch.harvestedAt || M.clearance.parseDayKey(x.batch.harvestDate).toISOString()) + ' · sell by ' + shortWeekday(M.clearance.parseDayKey(x.batch.sellBy).toISOString()) + ' · ' + x.shelf + '-day shelf life' }),
            bar),
          h('div', { class: 'rescue-nums' },
            h('div', null, h('strong', { text: String(x.unsold) }), h('small', { text: 'unsold' })),
            h('div', null, h('strong', { text: money(x.valueCents) }), h('small', { text: 'at normal price' })),
            h('div', null, h('strong', { text: String(x.onClear) }), h('small', { text: 'on Buy to Clear' })),
            h('div', null, h('strong', { text: String(x.sold) }), h('small', { text: 'sold since harvest' }))),
          h('ol', { class: 'rescue-opts' }, opts.map(function (o, i) {
            var btn = null;
            if (o.key === 'clear') btn = mini('List', function () { runRescueOption(x, o); });
            else if (o.key === 'b2b') btn = mini('Draft offer', function () { runRescueOption(x, o); });
            else if (o.key === 'alert') btn = mini('Draft alert', function () { runRescueOption(x, o); });
            else if (o.key === 'process') btn = mini('Record', function () { runRescueOption(x, o); });
            return h('li', { class: i === 0 ? 'best' : '' },
              h('span', { class: 'rescue-opt-text' }, h('strong', { text: (i === 0 ? 'Best: ' : '') + o.title }), h('small', { text: o.why })), btn);
          })),
          x.level === 'expired' ? h('div', { class: 'rescue-writeoff' }, h('small', { text: 'Not fit to sell?' }),
            mini('Donated', function () { rescueWriteOff(x, 'donate'); }), mini('Composted', function () { rescueWriteOff(x, 'compost'); }, { danger: true })) : null);
      })) : h('p', { class: 'empty', text: 'No recent harvests with unsold stock. Nice!' })));

    append(root, panel('Rescue log', 'What was done with at-risk produce. "Recovered" is the sale value for listings and the kitchen value (50%) for processing.', table([
      { label: 'When', render: function (r) { return h('span', null, shortDate(r.at), h('br'), h('small', { text: r.by })); } },
      { label: 'Produce', render: function (r) { var p = M.byId('products', r.productId); return p ? p.title : '—'; } },
      { label: 'Action', render: function (r) { return h('span', null, RESCUE_ACTION[r.action] || r.action, r.note ? [h('br'), h('small', { text: r.note })] : null); } },
      { label: 'Qty', num: true, render: function (r) { return r.qty ? String(r.qty) : '—'; } },
      { label: 'Recovered', num: true, render: function (r) { return r.valueCents ? money(r.valueCents) : '—'; } }
    ], log.slice(0, 30), 'Nothing rescued yet — actions you take above are recorded here.')));
    append(root, bagScorecardPanel());
  }

  /* ---- Surprise Bags, as a Harvest Rescue decision ----
   * Tyllage pools small spare stock across batches and decides whether household bags beat
   * selling items one by one, a trade offer or doing nothing. Proposing sets how many bags are
   * offered that day; a different person approves; stock is reserved later, per order, by the
   * existing "Approve contents" step (which rechecks it). */
  var BAG_OPTION_ROLE = { bag: 'Surprise Bags', clear: 'Buy to Clear', trade: 'Trade offer', none: 'No Surprise Bag' };
  function bagDecisionPanel() {
    var r = M.rescue.bagAdvice(), day = shortWeekday(M.clearance.parseDayKey(r.dayKey).toISOString());
    var plan = r.plan, canApprove = M.auth.can(session, 'campaigns.approve');
    var head = r.best
      ? h('p', { class: 'callout green', text: 'Suggested: ' + r.best.bags + ' ' + r.best.size.label + ' bag(s) for ' + day + ', using ' + r.best.units + ' of the ' + r.totalSpare + ' spare items. The other ' + r.leftover + ' stay in stock for normal sales.' })
      : h('p', { class: 'callout', text: 'No Surprise Bag for ' + day + '. ' + (r.reason || 'There\'s no spare stock to bag.') });
    var planBox = null;
    if (plan && plan.status === 'proposed') {
      planBox = h('div', { class: 'bag-plan pending' }, h('strong', { text: 'Waiting for approval: ' + plan.bags + ' ' + plan.size + ' bag(s) for ' + day }), h('small', { text: 'Proposed by ' + plan.proposedBy + '. Nothing is reserved; approving sets how many bags customers can order that day.' }),
        canApprove ? h('div', { class: 'actions' },
          mini('Approve', function () { var x = M.rescue.bagDecide(r.dayKey, true, session.email); if (!x.ok) { toast(x.error); return; } commit('bag.approved', r.dayKey, plan.bags + ' bag(s) open for ' + day + '. Stock is reserved per order when you approve each bag\'s contents.'); }),
          mini('Reject', function () { var x = M.rescue.bagDecide(r.dayKey, false, session.email); if (!x.ok) { toast(x.error); return; } commit('bag.rejected', r.dayKey, 'Bag plan rejected.'); }, { danger: true })) : h('small', { class: 'hint', text: 'An admin approves it.' }));
    } else if (plan && plan.status === 'approved') {
      planBox = h('div', { class: 'bag-plan' }, h('strong', { text: 'Approved: ' + plan.bags + ' ' + plan.size + ' bag(s) for ' + day + ' (' + M.clearance.bagsLeftForDay(r.dayKey) + ' still open)' }),
        h('small', { text: 'Approved by ' + plan.decidedBy + '. Each order\'s contents come from the planned crops and are reserved when staff approve them in Buy to Clear.' }));
    }
    var rows = r.options.map(function (o) {
      return { o: o, role: o.suggested ? 'Suggested' : o.key === 'none' && r.best ? 'Fallback' : o.expectedCents != null && r.best && o.expectedCents < r.best.expectedCents * 0.7 ? 'Avoid' : 'Alternative' };
    });
    return panel(aiTitle('Surprise Bags: should we?'), 'Spare stock across all harvested batches for the next bag day (' + day + ', orders close ' + cutoffText(new Date(r.cutoff)) + '): unsold stock that stays fresh through that day, minus what normal sales should take. Each bag is filled until it meets its "worth at least" promise, but never beyond a household size (' + M.RULES.bag.maxItemsSmall + ' items small, ' + M.RULES.bag.maxItemsRegular + ' regular, at most ' + M.RULES.bag.maxPerCrop + ' of a crop). Capped at ' + S().harvestBag.limitPerDay + ' bags a day.',
      head,
      r.crops.length ? table([
        { label: 'Crop', render: function (c) { return h('span', { class: 'rw-tier-cell' }, thumbMini(c.product), h('strong', { text: c.product.title })); } },
        { label: 'Unsold', num: true, render: function (c) { return String(c.unsold); } },
        { label: 'Usual sales by then', num: true, render: function (c) { return String(c.usualSales); } },
        { label: 'Spare', num: true, render: function (c) { return h('strong', { text: String(c.spare) }); } },
        { label: 'Sell by', render: function (c) { return shortWeekday(M.clearance.parseDayKey(c.sellBy).toISOString()); } }
      ], r.crops, '') : null,
      r.best ? h('div', { class: 'bag-compose' }, h('small', { text: 'One ' + r.best.size.label + ' bag would hold: ' }),
        r.best.composition.map(function (p) { return h('span', { class: 'mini-chip', text: p.title }); }),
        h('small', { text: ' · normal value ' + money(r.best.econ.worthCents) + ' (promise: worth at least ' + money(r.best.size.worthCents) + ')' })) : null,
      h('h3', { class: 'hist-h', text: 'Options compared (same cost basis)' }),
      table([
        { label: 'Option', render: function (x) { return h('span', null, h('span', { class: 'ptype' }, badge(x.role, x.role === 'Suggested' ? 'green' : x.role === 'Avoid' ? 'red' : 'grey')), ' ', h('strong', { text: x.o.label })); } },
        { label: 'Items', num: true, render: function (x) { return x.o.units ? String(x.o.units) : '—'; } },
        { label: 'Contribution if all sell', num: true, render: function (x) { return money(x.o.contributionCents); } },
        { label: 'Expected', num: true, render: function (x) { return x.o.expectedCents == null ? 'depends' : money(x.o.expectedCents); } },
        { label: 'Why', render: function (x) { return h('small', { text: x.o.note }); } }
      ], rows, ''),
      r.sizes.filter(function (s) { return s.econ; }).length ? h('details', { class: 'cp-vs' }, h('summary', { text: 'Bag maths' }),
        table([
          { label: 'Size', render: function (s) { return h('strong', { text: s.size.label + ' · ' + money(s.size.priceCents) }); } },
          { label: 'Bags', num: true, render: function (s) { return String(s.bags); } },
          { label: 'Produce cost', num: true, render: function (s) { return money(s.econ.produceCents); } },
          { label: 'Pack + handling', num: true, render: function (s) { return money(s.econ.packCents + s.econ.fulfilCents); } },
          { label: 'Contribution / bag', num: true, render: function (s) { return money(s.econ.contributionCents) + ' (' + s.econ.marginPct + '%)'; } },
          { label: 'Checks', render: function (s) { return h('small', { text: [s.econ.guardOk ? 'Margin Guard ✓' : 'Below Margin Guard (needs ' + money(s.econ.floorCents) + ')', s.econ.worthOk ? 'worth promise ✓' : 'under the worth promise'].join(' · ') }); } }
        ], r.sizes.filter(function (s) { return s.econ; }), '')) : null,
      planBox,
      r.best && (!plan || plan.status === 'rejected') ? h('div', { class: 'actions' }, h('button', { class: 'btn btn-sm btn-forest', type: 'button', text: 'Propose ' + r.best.bags + ' bag(s) for ' + day, onclick: function () {
        var x = M.rescue.bagPropose(r, session.email);
        if (!x.ok) { toast(x.error); return; }
        commit('bag.proposed', r.dayKey, 'Bag plan proposed for ' + day + '. Nothing is reserved until each order\'s contents are approved.');
      } })) : null);
  }
  function bagScorecardPanel() {
    var s = M.rescue.bagScorecard(30), B = M.RULES.bag;
    var row = function (label, bag, clear, note) { return { label: label, bag: bag, clear: clear, note: note }; };
    var rows = [
      row('Orders', String(s.bag.orders), String(s.clear.orders), 'Measured'),
      row('Items sold', String(s.bag.units) + (s.bag.unapproved ? ' (+' + s.bag.unapproved + ' bag(s) not packed yet)' : ''), String(s.clear.units), 'Measured'),
      row('Revenue', money(s.bag.revenueCents), money(s.clear.revenueCents), 'Measured'),
      row('Contribution', money(s.bag.contributionCents), money(s.clear.contributionCents), 'After produce cost; bags also after packing and handling'),
      row('Repeat buyers', s.bag.repeat + ' of ' + s.bag.buyerCount, s.clear.repeat + ' of ' + s.clear.buyerCount, 'Measured: bought this way more than once'),
      row('Packing time', Math.round(s.bag.packMinutes) + ' min', '—', 'Estimated at ' + B.packMinutes + ' min a bag')
    ];
    return panel('Surprise Bags vs Buy to Clear · 30 days', 'The experiment the decision needs: how each way of moving surplus actually performs.' +
        (!s.bag.orders && !s.clear.orders ? ' No bag or Buy to Clear orders in the last 30 days yet, so there\'s nothing to compare. It fills in as orders come in.' : ''),
      table([
        { label: 'Measure', render: function (x) { return h('strong', { text: x.label }); } },
        { label: 'Surprise Bags', num: true, render: function (x) { return x.bag; } },
        { label: 'Buy to Clear', num: true, render: function (x) { return x.clear; } },
        { label: 'Basis', render: function (x) { return h('small', { class: 'hint', text: x.note }); } }
      ], rows, ''),
      h('ul', { class: 'waste-basis' },
        h('li', null, h('strong', { text: 'Sold through bags: ' }), s.bag.units + ' items. Measured.'),
        h('li', null, h('strong', { text: 'Would otherwise have gone unsold: ' }), 'about ' + s.estimatedOtherwiseUnsold + ' items across ' + s.plans + ' approved bag plan(s). Estimated, from the spare stock left after usual sales.'),
        h('li', null, h('strong', { text: 'Waste actually avoided: ' }), 'not claimed. It needs a disposal baseline to compare with. In this period ' + s.disposedUnits + ' items were recorded as composted or donated.')));
  }

  /* ---------------- B2B Buyer Growth (staff + admin) ----------------
   * Trade accounts with standing orders, AI-assisted buyer insights (missing standing
   * orders, accounts ordering less, lapsed accounts, surplus to offer, lead follow-ups), a
   * lead pipeline with suggested pitches, and upcoming trade deliveries. Messages are drafted
   * for staff to edit and send (simulated). PROTOTYPE: rule-based; trade prices illustrative. */
  var B2B_KIND = { missing: ['Missing order', 'red'], lapsed: ['Lapsed', 'red'], declining: ['Ordering less', 'amber'], offer: ['Surplus offer', 'green'], lead: ['Lead follow-up', 'blue'] };
  function b2bDay(key) { return M.clearance.parseDayKey(key).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' }); }
  function usualList(a) { return a.usual.map(function (u) { var p = M.byId('products', u.productId); return u.qty + ' ' + (p ? p.title : '?'); }).join(', '); }
  // Greeting name from a contact like "Chef Marcus", "Sarah, owner" or "Ops manager": the
  // person's name if there is one, otherwise "there" for role-only contacts.
  function firstName(n) {
    var s = String(n || '').replace(/\s*\(demo\)\s*/i, '').split(',')[0].trim().replace(/^(chef|mr|ms|mrs|dr)\.?\s+/i, '');
    var w = s.split(/\s+/)[0] || '';
    return !w || /^(ops|hr|team|manager|owner|staff|admin|the|orders|purchasing|kitchen)$/i.test(w) ? 'there' : w;
  }
  // A one-line suggested pitch for a lead, by business type, mentioning what's plentiful now.
  function leadPitch(l) {
    var plenty = M.radar.crops().filter(function (c) { return c.status === 'surplus' || c.status === 'balanced'; }).slice(0, 2).map(function (c) { return c.product.title; }).join(' and ');
    var t = {
      restaurant: 'Same-morning harvested, pesticide-free greens at trade price, delivered Tue/Thu/Sat — a reliable local supply for daily service.',
      cafe: 'Salad greens and herbs in small, regular quantities — no big minimums, and a local-farm story for the menu.',
      office: 'A weekly pantry box of fresh local greens for staff, plus team farm visits.',
      caterer: 'Bulk Asian greens on a fixed schedule, with pre-orders so event quantities are guaranteed.',
      school: 'Canteen greens grown 20 minutes away, linked to a learning journey for students.',
      hotel: 'Local, pesticide-free produce for a sustainability story — helping Singapore grow more of its own food by 2035.'
    }[l.type] || 'Fresh, pesticide-free MEOD produce at trade price.';
    return t + (plenty ? ' In good supply now: ' + plenty + '.' : '');
  }
  function b2bDraft(kind, x) {
    var a = x.account, l = x.lead, name = firstName(a ? a.contact : l ? l.name : '');
    var sign = '\n\nThank you,\nMEOD Farm Trade Team\nWhatsApp +65 8133 0358 · info@meod.com.sg';
    if (kind === 'missing') return { subject: 'Your usual order for ' + b2bDay(x.dayKey), body: 'Hi ' + name + ',\n\nJust checking in on your usual order for ' + b2bDay(x.dayKey) + '. Shall we prepare the same as usual (' + usualList(a) + ')?\n\nReply to confirm, or let us know any changes and we\'ll adjust.' + sign };
    if (kind === 'declining') return { subject: 'How are the greens working for you?', body: 'Hi ' + name + ',\n\nWe noticed your recent orders have been a little lighter, and wanted to check everything is going well — with the produce, deliveries or your menu.\n\nWe\'re happy to adjust quantities, change your delivery days, or suggest what\'s in season.' + sign };
    if (kind === 'lapsed') return { subject: 'We\'ve missed you at MEOD Farm', body: 'Hi ' + name + ',\n\nWe haven\'t seen your order for a few weeks and wanted to check in. Your usual (' + usualList(a) + ') is growing well this week.\n\nWould you like us to restart your standing order, or adjust it?' + sign };
    if (kind === 'offer') {
      var p = x.product, tp = Math.round(p.priceCents * M.RULES.b2bPriceRate), next = M.b2b.stats(a).upcoming[0];
      return { subject: 'Plenty of ' + p.title + ' this week', body: 'Hi ' + name + ',\n\nWe have an excellent harvest of ' + p.title + ' this week — ' + money(tp) + ' per unit at trade price. Would you like us to add some to your next order' + (next ? ' on ' + b2bDay(next.dayKey) : '') + '?\n\nJust reply with the quantity.' + sign };
    }
    if (kind === 'lead') return { subject: 'Fresh local greens for ' + l.name.replace(/\s*\(demo\)\s*/i, ''), body: 'Hi there,\n\nFollowing up on our chat — ' + leadPitch(l) + '\n\nCould we send a free sample box, or arrange a quick farm visit to show you what we grow?' + sign };
    return { subject: 'Hello from MEOD Farm', body: 'Hi ' + name + ',\n\n' + sign };
  }
  function openB2BMessage(kind, x, onSent) {
    document.querySelectorAll('.b2b-dialog').forEach(function (d) { if (d.open) d.close(); d.remove(); });
    var target = x.account || x.lead;
    var d0 = b2bDraft(kind, x);
    var channel = h('select', { 'aria-label': 'Channel' }, h('option', { value: 'email', text: 'Email' }), h('option', { value: 'whatsapp', text: 'WhatsApp' }));
    var subj = h('input', { 'aria-label': 'Subject', value: d0.subject }); subj.value = d0.subject;
    var body = h('textarea', { rows: 12, 'aria-label': 'Message' }); body.value = d0.body;
    var subjLabel = h('label', null, 'Subject', subj);
    channel.addEventListener('change', function () { subjLabel.style.display = channel.value === 'email' ? '' : 'none'; });
    var dlg = h('dialog', { class: 'receipt-dialog reply-dialog b2b-dialog', 'aria-labelledby': 'b2-title' });
    function closeDialog() { if (dlg.open) dlg.close(); dlg.remove(); }
    var to = x.account ? x.account.contact + ' · ' + x.account.email : x.lead.name;
    append(dlg,
      h('button', { class: 'pd-close', type: 'button', 'aria-label': 'Close', onclick: closeDialog }, iconCircle(ICONS.x, 'bare')),
      h('div', { class: 'rd-body' },
        h('div', { class: 'rd-head' }, h('h2', { id: 'b2-title', text: 'Message ' + target.name }), aiPill(), h('small', { class: 'ai-note', text: 'You review and send' })),
        h('div', { class: 'rd-form' },
          h('div', { class: 'rd-controls' }, h('label', null, 'Send by', channel), h('label', null, 'To', h('input', { value: to, readonly: true }))),
          subjLabel, h('label', null, 'Message', body))),
      h('div', { class: 'r-actions' },
        h('button', { class: 'btn btn-sm btn-outline', type: 'button', text: 'Cancel', onclick: closeDialog }),
        h('button', { class: 'btn btn-sm btn-forest', type: 'button', text: 'Send (simulated)', onclick: function () {
          M.b2b.logContact(target, channel.value, body.value, session.email);
          if (onSent) onSent();
          closeDialog();
          commit('b2b.contacted', target.id, 'Message to ' + target.name + ' sent by ' + (channel.value === 'email' ? 'email' : 'WhatsApp') + ' (simulated).');
        } })));
    dlg.addEventListener('close', function () { dlg.remove(); });
    document.body.appendChild(dlg);
    dlg.showModal();
  }
  function createUsual(accountId, dayKey) {
    var r = M.b2b.createUsualOrder(accountId, dayKey);
    if (!r.ok) { toast(r.error); return; }
    commit('b2b.order', r.order.ref, r.order.ref + ' confirmed for ' + b2bDay(dayKey) + ' (' + money(r.order.totalCents) + ') — it\'s on the harvest & pack list.');
  }
  function advanceLead(l) {
    var idx = M.b2b.STAGES.map(function (s) { return s[0]; }).indexOf(l.stage);
    var next = M.b2b.STAGES[Math.min(idx + 1, M.b2b.STAGES.length - 1)];
    M.b2b.moveLead(l.id, next[0], next[0] === 'won' ? 7 : 3);
    commit('b2b.lead', l.id, l.name + ' moved to ' + next[1] + '.');
  }

  function b2bView(root) {
    var st = M.b2b.store();
    var accounts = st.accounts;
    var stats = {};
    accounts.forEach(function (a) { stats[a.id] = M.b2b.stats(a); });
    var weekly = accounts.reduce(function (s, a) { return s + stats[a.id].weeklyCents; }, 0);
    var nextWeek = st.orders.filter(function (o) { var t = M.clearance.parseDayKey(o.deliveryDay).getTime(); return o.status === 'confirmed' && t <= Date.now() + 7 * 864e5; });
    var openLeads = st.leads.filter(function (l) { return l.stage !== 'won' && l.stage !== 'lost'; });
    append(root, h('div', { class: 'kpis' },
      kpi('Trade accounts', String(accounts.filter(function (a) { return a.status === 'active'; }).length), 'restaurants, cafés, offices, caterers'),
      kpi('Trade sales / week', money(weekly), 'average of the last 4 weeks'),
      kpi('Next 7 days', String(nextWeek.length) + ' order(s)', money(nextWeek.reduce(function (s, o) { return s + o.totalCents; }, 0)) + ' confirmed'),
      kpi('Pipeline', String(openLeads.length) + ' lead(s)', 'about ' + money(openLeads.reduce(function (s, l) { return s + l.estWeeklyCents; }, 0)) + ' a week if won')));

    /* ---- Buyer insights ---- */
    var ins = M.b2b.insights();
    append(root, panel(aiTitle('Buyer insights'), 'From each account\'s standing days and order history, plus what the farm has in surplus. You send every message.',
      ins.length ? h('div', { class: 'ops-brief aligned', style: '--rows:4' }, ins.map(function (x) {
        var k = B2B_KIND[x.kind];
        var acts = x.actions.map(function (a) {
          if (a === 'usual') return h('button', { class: 'btn btn-sm btn-forest', type: 'button', text: 'Confirm usual order', onclick: function () { createUsual(x.account.id, x.dayKey); } });
          if (a === 'advance') return h('button', { class: 'btn btn-sm btn-outline', type: 'button', text: 'Next stage →', onclick: function () { advanceLead(x.lead); } });
          return h('button', { class: 'btn btn-sm ' + (x.actions.length > 1 ? 'btn-outline' : 'btn-forest'), type: 'button', text: 'Draft message', onclick: function () { openB2BMessage(x.kind, x); } });
        });
        return h('article', { class: 'ops-card' + (x.kind === 'offer' ? ' farm' : '') },
          h('div', { class: 'ops-card-head' }, iconCircle(x.kind === 'lead' ? ICONS.users : x.kind === 'offer' ? ICONS.leaf : ICONS.truck, 'soft'), badge(k[0], k[1])),
          h('strong', { class: 'ops-title', text: x.title }),
          h('p', { text: x.why }),
          h('div', { class: 'ops-foot b2b-acts' }, acts));
      })) : h('p', { class: 'empty', text: 'All trade accounts are on track.' })));

    /* ---- Accounts ---- */
    append(root, panel('Trade accounts', 'Standing order days, usual order at trade price (' + Math.round(M.RULES.b2bPriceRate * 100) + '% of retail, illustrative) and how ordering is trending.', table([
      { label: 'Account', render: function (a) { return h('span', null, h('strong', { text: a.name }), h('br'), h('small', { text: (M.b2b.TYPES[a.type] || a.type) + ' · ' + a.area + ' · ' + a.contact })); } },
      { label: 'Standing', render: function (a) { return a.standingDays.map(function (d) { return M.b2b.WEEKDAY[d]; }).join(' & '); } },
      { label: 'Usual order', render: function (a) { var s = stats[a.id]; return h('span', null, s.usualUnits + ' units · ' + money(s.usualCents), h('br'), h('small', { text: usualList(a) })); } },
      { label: 'Last 4 weeks', render: function (a) { var s = stats[a.id]; return h('span', null, money(s.weeklyCents) + '/wk', h('br'), h('small', { class: s.trendPct <= -25 ? 'bag-value-low' : '', text: s.trendPct ? (s.trendPct > 0 ? '↑ ' : '↓ ') + Math.abs(s.trendPct) + '% lately' : 'steady' })); } },
      { label: 'Last delivery', render: function (a) { var s = stats[a.id]; return s.lastOrder ? h('span', null, b2bDay(s.lastOrder), h('br'), h('small', { text: s.daysSince + ' days ago' })) : '—'; } },
      { label: 'Next orders', render: function (a) {
        return h('div', { class: 'b2b-next' }, stats[a.id].upcoming.map(function (u) {
          return h('span', { class: 'mini-chip ' + (u.order ? 'ok' : 'miss'), text: b2bDay(u.dayKey) + (u.order ? ' ✓' : ' · not placed') });
        }));
      } },
      { label: 'Actions', render: function (a) {
        var miss = stats[a.id].missing[0];
        return h('div', { class: 'actions' },
          miss ? mini('Usual order', function () { createUsual(a.id, miss.dayKey); }, { title: 'Confirm their usual order for ' + b2bDay(miss.dayKey) }) : null,
          mini('Message', function () { openB2BMessage(miss ? 'missing' : 'general', { account: a, dayKey: miss ? miss.dayKey : null }); }));
      } }
    ], accounts)));

    /* ---- Lead pipeline ---- */
    var todayKey = M.clearance.dayKey(new Date());
    var board = h('div', { class: 'b2b-board' }, M.b2b.STAGES.map(function (sg) {
      var leads = st.leads.filter(function (l) { return l.stage === sg[0]; });
      return h('section', { class: 'b2b-col', 'aria-label': sg[1] },
        h('div', { class: 'b2b-col-head' }, h('strong', { text: sg[1] }), h('span', { class: 'chip-count', text: String(leads.length) })),
        leads.length ? leads.map(function (l) {
          var due = l.nextStepAt <= todayKey && sg[0] !== 'won';
          return h('article', { class: 'b2b-lead' + (due ? ' due' : '') },
            h('strong', { text: l.name }),
            h('small', { text: (M.b2b.TYPES[l.type] || l.type) + (l.area ? ' · ' + l.area : '') + ' · ~' + money(l.estWeeklyCents) + '/wk' }),
            h('small', { class: 'b2b-next-step', text: sg[0] === 'won' ? 'Won — set up as a trade account' : (due ? 'Follow up today' : 'Next step ' + b2bDay(l.nextStepAt)) }),
            sg[0] !== 'won' ? h('p', { class: 'b2b-pitch' }, aiPill(), ' ', leadPitch(l)) : null,
            h('div', { class: 'actions' },
              sg[0] !== 'won' ? mini('Message', function () { openB2BMessage('lead', { lead: l }); }) : null,
              sg[0] !== 'won' ? mini('Next →', function () { advanceLead(l); }) : null));
        }) : h('p', { class: 'empty', text: 'None' }));
    }));
    var lf = h('form', { class: 'form-grid b2b-lead-form', novalidate: true },
      h('label', null, 'Business name', h('input', { name: 'name', maxlength: 80, placeholder: 'e.g. Café Botanica' })),
      h('label', null, 'Type', h('select', { name: 'type' }, Object.keys(M.b2b.TYPES).map(function (k) { return h('option', { value: k, text: M.b2b.TYPES[k] }); }))),
      h('label', null, 'Area', h('input', { name: 'area', maxlength: 40, placeholder: 'e.g. Holland Village' })),
      h('label', null, 'Est. per week (S$)', h('input', { name: 'est', type: 'number', min: 0, step: 10, value: '50' })),
      h('div', { style: 'grid-column:1/-1' }, h('button', { class: 'btn btn-sm btn-forest', type: 'submit', text: 'Add lead' })));
    lf.addEventListener('submit', function (e) {
      e.preventDefault();
      var r = M.b2b.addLead({ name: lf.name.value, type: lf.type.value, area: lf.area.value, estWeeklyCents: Math.round((parseFloat(lf.est.value) || 0) * 100) });
      if (!r.ok) { toast(r.error); return; }
      commit('b2b.lead', r.lead.id, r.lead.name + ' added to the pipeline.');
    });
    append(root, panel('Lead pipeline', 'New trade buyers from enquiries, farm visits and outreach. Each card has a suggested pitch based on the business type and what\'s plentiful now.', board,
      h('details', { class: 'b2b-add' }, h('summary', { text: '+ Add a lead' }), lf)));

    /* ---- Upcoming trade deliveries ---- */
    var upcoming = st.orders.filter(function (o) { return o.status === 'confirmed'; }).sort(function (a, b) { return a.deliveryDay < b.deliveryDay ? -1 : 1; });
    append(root, panel('Upcoming trade deliveries', 'Confirmed B2B orders. They\'re included in Demand Radar and the harvest & pack list.', table([
      { label: 'Delivery', render: function (o) { return b2bDay(o.deliveryDay); } },
      { label: 'Order', render: function (o) { return o.ref; } },
      { label: 'Account', render: function (o) { var a = st.accounts.filter(function (x) { return x.id === o.accountId; })[0]; return a ? a.name : '—'; } },
      { label: 'Items', render: function (o) { return o.items.map(function (i) { return i.qty + '× ' + i.title; }).join(', '); } },
      { label: 'Total', num: true, render: function (o) { return money(o.totalCents); } }
    ], upcoming, 'No confirmed trade orders yet.')));
  }

  /* ---------------- Weekly AI briefing (staff + admin) ----------------
   * One page to open on Monday: ranked priorities across farm ops, sales and customers,
   * the next harvest & pack list, a sales pulse, the week's calendar, and a short digest the
   * manager can copy or "send". Everything is pulled from data already in Tyllage (Demand
   * Radar, Harvest Planner, Buy to Clear, Visits, Campaigns, Inbox, Stock). PROTOTYPE: the
   * ranking is rule-based; a language model could word the digest in the live version. */
  function weekBounds() {
    var d = new Date(); d.setHours(0, 0, 0, 0);
    var monday = new Date(d.getTime() - ((d.getDay() + 6) % 7) * 864e5);
    return { start: monday, end: new Date(monday.getTime() + 6 * 864e5) };
  }
  function briefingPriorities() {
    var out = [];
    var push = function (score, area, icon, title, why, action) { out.push({ score: score, area: area, icon: icon, title: title, why: why, action: action }); };
    var crops = M.radar.crops();
    var shorts = crops.filter(function (c) { return c.status === 'short'; }).sort(function (a, b) { return a.gap - b.gap; });
    var surplus = crops.filter(function (c) { return c.status === 'surplus'; }).sort(function (a, b) { return b.gap - a.gap; });
    if (shorts.length) {
      var s0 = shorts[0];
      push(90 + Math.min(9, Math.abs(s0.gap) / 10), 'Farm ops', ICONS.leaf, s0.product.title + ' is ' + Math.abs(s0.gap) + ' units short over the next ' + M.radar.weeks + ' weeks',
        (shorts.length > 1 ? shorts.length - 1 + ' other crop(s) are short too. ' : '') + (s0.trendPct > 5 ? 'Demand is up ' + s0.trendPct + '%. ' : '') + 'Hold back promotions and consider sowing another batch.',
        { label: 'Open Demand Radar', href: '#radar' });
    }
    if (surplus.length) {
      var u0 = surplus[0];
      push(80 + Math.min(9, u0.gap / 10), 'Farm ops', ICONS.tag, u0.product.title + ' has about ' + u0.gap + ' units more than expected demand',
        (u0.trendPct < -5 ? 'Demand is down ' + Math.abs(u0.trendPct) + '%. ' : '') + 'Promote it this week, push pre-orders, or plan to list extra on Buy to Clear.' + (surplus.length > 1 ? ' ' + (surplus.length - 1) + ' more crop(s) in surplus.' : ''),
        { label: 'See surplus crops', href: '#radar' });
    }
    var ending = M.clearance.listActive().filter(function (l) { return new Date(l.availableUntil).getTime() - Date.now() < 2.5 * 864e5; });
    if (ending.length) {
      var e0 = ending.sort(function (a, b) { return M.clearance.remaining(b) - M.clearance.remaining(a); })[0];
      var ep = M.byId('products', e0.productId);
      push(85, 'Farm ops', ICONS.clock, ending.length + ' Buy to Clear listing(s) end within 2 days',
        M.clearance.remaining(e0) + ' ' + ep.title + ' still unsold, ending ' + shortDate(e0.availableUntil) + '. Send an approved alert or bundle it before it loses value.', { label: 'Buy to Clear', href: '#clearance' });
    }
    var due = M.harvest.upcoming().filter(function (b) { return M.harvest.stage(b) === 'due'; });
    if (due.length) push(88, 'Farm ops', ICONS.box, due.length + ' harvest batch(es) due but not recorded', 'Record the real yield so pre-orders are served first and the rest goes into stock.', { label: 'Harvest Planner', href: '#harvest' });
    var slow = M.harvest.open().filter(function (b) { return M.harvest.signal(b).key === 'slow'; });
    if (slow.length) {
      var sp = M.byId('products', slow[0].productId);
      push(70, 'Sales', ICONS.clock, 'Pre-orders are slow for ' + sp.title + (slow.length > 1 ? ' and ' + (slow.length - 1) + ' more' : ''), M.harvest.signal(slow[0]).reason.split('.')[0] + '. A pre-order nudge to past buyers can fill it.', { label: 'Harvest Planner', href: '#harvest' });
    }
    var enquiries = S().bookings.filter(function (b) { return b.status === 'new'; });
    if (enquiries.length) {
      var oldest = enquiries.slice().sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); })[0];
      var pax = enquiries.reduce(function (s, b) { return s + b.pax; }, 0);
      push(75 + Math.min(10, enquiries.length * 2), 'Sales', ICONS.users, enquiries.length + ' farm-visit enquiry(s) waiting for a reply (' + pax + ' guests)',
        'Oldest: ' + (oldest.org || oldest.name) + ', ' + ago(oldest.createdAt) + '. AI reply drafts are ready to check.', { label: 'Visits', href: '#visits' });
    }
    M.feedback.clusters(14).filter(function (g) { return g.pattern && !g.resolved; }).slice(0, 2).forEach(function (g, i) {
      push(89 - i, 'Customers', g.theme === 'late' ? ICONS.truck : ICONS.chat, g.title, g.cause.split('. ').slice(0, 2).join('. ').replace(/\.?$/, '.'), { label: 'Open Feedback', href: '#feedback' });
    });
    var li = M.lost.insights(14).filter(function (g) { return g.product; })[0];
    if (li && li.units >= 5) push(78, 'Sales', ICONS.search, li.units + ' ' + li.product.title + ' asked for but not sold', li.why.split('. ')[0] + '.', { label: 'Lost demand', href: '#lost' });
    var al = M.allocation.plan(7).filter(function (x) { return x.unallocated >= 10; }).sort(function (a, b) { return b.unallocated - a.unallocated; })[0];
    if (al) push(77, 'Farm ops', ICONS.box, al.unallocated + ' ' + al.product.title + ' from the ' + shortWeekday(M.clearance.parseDayKey(al.batch.harvestDate).toISOString()) + ' harvest have no buyer yet', 'Place them with trade buyers or pre-orders before discounting.', { label: 'Harvest allocation', href: '#allocation' });
    var postsWaiting = (S().contentPlan || []).filter(function (c) { return c.status === 'pending'; });
    if (postsWaiting.length) push(64, 'Sales', ICONS.chat, postsWaiting.length + ' social post(s) waiting for approval', 'Planned in the Content studio. Approve them so staff can post on the day.', { label: 'Content studio', href: '#content' });
    else if (!M.content.upcoming(7).filter(function (c) { return c.status !== 'posted'; }).length) push(62, 'Sales', ICONS.chat, 'No social posts planned this week', 'The Content studio has ' + M.content.ideas().length + ' ready-made ideas from this week\'s harvest, recipes and support-local posts.', { label: 'Content studio', href: '#content' });
    var priceWaiting = (S().priceProposals || []).filter(function (pp) { return pp.status === 'pending'; });
    if (priceWaiting.length) push(67, 'Sales', ICONS.tag, priceWaiting.length + ' price change(s) waiting for approval', 'Checked by Margin Guard. Approving a discount lists it on Buy to Clear.', { label: 'Price Advisor', href: '#pricing' });
    var toApprove = S().campaigns.filter(function (c) { return c.status === 'pending_approval'; });
    if (toApprove.length) push(65, 'Sales', ICONS.chat, toApprove.length + ' campaign(s) waiting for approval', 'Drafts from restock reminders, rewards nudges and Demand Radar. Nothing sends until an admin approves.', { label: 'Campaigns', href: '#campaigns' });
    var tickets = S().tickets.filter(function (t) { return t.status === 'open'; });
    if (tickets.length) push(82, 'Customers', ICONS.shield, tickets.length + ' customer issue(s) need a person', tickets.map(function (t) { return t.intent; }).join(', ') + ' — the bot has stopped handling these.', { label: 'Inbox', href: '#inbox' });
    var bagDays = M.radar.deliveryKeys(2).map(function (k) { return M.radar.pickList(k).pendingBags; }).reduce(function (a, b) { return a + b; }, 0);
    if (bagDays) push(78, 'Farm ops', ICONS.bag, bagDays + ' Surprise Harvest Bag(s) need their contents approved', 'Approve before packing day so stock is reserved.', { label: 'Buy to Clear', href: '#clearance' });
    // Harvest Rescue: batches near or past their sell-by date.
    var risky = M.rescue.batches().filter(function (x) { return x.level !== 'ok'; });
    if (risky.length) {
      var r0 = risky[0];
      push(r0.level === 'expired' ? 94 : 89, 'Farm ops', ICONS.clock, risky.length + ' harvest batch(es) near or past sell-by', r0.product.title + ': ' + r0.unsold + ' unsold (' + money(r0.valueCents) + '), sell by ' + shortWeekday(M.clearance.parseDayKey(r0.batch.sellBy).toISOString()) + '. Trade buyers first, then Buy to Clear.', { label: 'Harvest Rescue', href: '#rescue' });
    }
    // Trade buyers: standing orders not placed yet, lapsed accounts, lead follow-ups due.
    var bi = M.b2b.insights();
    var missing = bi.filter(function (x) { return x.kind === 'missing'; });
    if (missing.length) push(87, 'Sales', ICONS.truck, missing.length + ' B2B standing order(s) not placed yet', missing.map(function (x) { return x.account.name.replace(/\s*\(demo\)/i, ''); }).join(', ') + ' usually order by now. Confirm their usual order or check in.', { label: 'B2B buyers', href: '#b2b' });
    var lapsedB = bi.filter(function (x) { return x.kind === 'lapsed' || x.kind === 'declining'; });
    if (lapsedB.length) push(72, 'Sales', ICONS.users, lapsedB.length + ' trade account(s) ordering less or lapsed', lapsedB[0].title + '. A quick call can catch a problem early.', { label: 'B2B buyers', href: '#b2b' });
    var leadsDue = bi.filter(function (x) { return x.kind === 'lead'; });
    if (leadsDue.length) push(66, 'Sales', ICONS.chat, leadsDue.length + ' trade lead follow-up(s) due', leadsDue.map(function (x) { return x.lead.name.replace(/\s*\(demo\)/i, ''); }).join(', ') + '. Suggested pitches are ready.', { label: 'Lead pipeline', href: '#b2b' });
    var soldOut = S().products.filter(function (p) { var st = M.stockStatus(p); return st.key === 'out' || st.key === 'stale'; });
    if (soldOut.length) push(55, 'Farm ops', ICONS.box, soldOut.length + ' product(s) sold out or not syncing', soldOut.map(function (p) { return p.title; }).slice(0, 3).join(', ') + '. Customers see "Sold out" or "Checking stock".', { label: 'Stock', href: '#inventory' });
    return out.sort(function (a, b) { return b.score - a.score; });
  }
  function salesPulse() {
    var now = Date.now();
    var sum = function (from, to) {
      return S().orders.filter(function (o) { var t = new Date(o.createdAt).getTime(); return o.status !== 'cancelled' && t >= from && t < to; })
        .reduce(function (acc, o) { acc.n++; acc.cents += o.netCents - (o.refundedCents || 0); return acc; }, { n: 0, cents: 0 });
    };
    var thisWk = sum(now - 7 * 864e5, now), lastWk = sum(now - 14 * 864e5, now - 7 * 864e5);
    var rising = M.radar.crops().filter(function (c) { return c.trendPct > 5; }).sort(function (a, b) { return b.trendPct - a.trendPct; }).slice(0, 3);
    var wk = weekBounds();
    var visits = S().bookings.filter(function (b) { if (b.status !== 'confirmed') return false; var t = M.clearance.parseDayKey(b.date).getTime(); return t >= Date.now() - 864e5 && t <= wk.end.getTime() + 7 * 864e5; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    return { thisWk: thisWk, lastWk: lastWk, change: lastWk.cents ? Math.round((thisWk.cents - lastWk.cents) / lastWk.cents * 100) : null, rising: rising, visits: visits };
  }
  function briefingDigest(pr, pulse, pick) {
    var lines = ['🌱 MEOD weekly briefing — ' + weekBounds().start.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })];
    lines.push('');
    lines.push('Top priorities:');
    pr.slice(0, 5).forEach(function (p, i) { lines.push((i + 1) + '. ' + p.title); });
    lines.push('');
    if (pick && pick.rows.length) lines.push('Next delivery (' + shortWeekday(M.clearance.parseDayKey(pick.dayKey).toISOString()) + '): ' + pick.rows.reduce(function (s, r) { return s + r.pick; }, 0) + ' units to harvest & pack for ' + pick.orderCount + ' order(s).');
    lines.push('Sales last 7 days: ' + money(pulse.thisWk.cents) + ' from ' + pulse.thisWk.n + ' order(s)' + (pulse.change !== null ? ' (' + (pulse.change >= 0 ? '+' : '') + pulse.change + '% vs the week before)' : '') + '.');
    if (pulse.rising.length) lines.push('Rising demand: ' + pulse.rising.map(function (c) { return c.product.title + ' +' + c.trendPct + '%'; }).join(', ') + '.');
    if (pulse.visits.length) lines.push('Visits coming up: ' + pulse.visits.map(function (b) { return (b.org || b.name) + ' (' + b.pax + ', ' + shortWeekday(M.clearance.parseDayKey(b.date).toISOString()) + ')'; }).join('; ') + '.');
    lines.push('');
    lines.push('Open Tyllage → Weekly briefing for details.');
    return lines.join('\n');
  }
  function showDigest(text) {
    var ta = h('textarea', { rows: 14, 'aria-label': 'Weekly summary', value: text });
    ta.value = text;
    var dlg = h('dialog', { class: 'receipt-dialog digest-dialog', 'aria-labelledby': 'dg-title' });
    function closeDialog() { if (dlg.open) dlg.close(); dlg.remove(); }
    append(dlg,
      h('button', { class: 'pd-close', type: 'button', 'aria-label': 'Close', onclick: closeDialog }, iconCircle(ICONS.x, 'bare')),
      h('div', { class: 'rd-body' },
        h('div', { class: 'rd-head' }, h('h2', { id: 'dg-title', text: 'Weekly summary' }), aiPill(), h('small', { class: 'ai-note', text: 'Edit before sharing' })),
        h('p', { class: 'hint', text: 'A short version for the team chat or the manager\'s WhatsApp. In production this could be sent automatically every Monday at 8am, to staff only.' }),
        h('label', { class: 'digest-field' }, 'Message', ta)),
      h('div', { class: 'r-actions' },
        h('button', { class: 'btn btn-sm btn-outline', type: 'button', text: 'Copy', onclick: function () {
          (navigator.clipboard ? navigator.clipboard.writeText(ta.value) : Promise.reject()).then(function () { toast('Summary copied.'); }, function () { toast('Copy not available here — select the text instead.'); });
        } }),
        h('button', { class: 'btn btn-sm btn-forest', type: 'button', text: 'Send to me (simulated)', onclick: function () {
          closeDialog(); commit('briefing.sent', session.email, 'Weekly summary sent to ' + session.email + ' (simulated).');
        } })));
    dlg.addEventListener('close', function () { dlg.remove(); });
    document.body.appendChild(dlg);
    dlg.showModal();
  }

  function briefingView(root) {
    var pr = briefingPriorities();
    var pulse = salesPulse();
    var nextDay = M.radar.deliveryKeys(1)[0];
    var pick = M.radar.pickList(nextDay);
    var wk = weekBounds();
    var crops = M.radar.crops();
    var pickUnits = pick.rows.reduce(function (s, r) { return s + r.pick; }, 0);

    append(root, h('section', { class: 'brief-hero' },
      h('div', null,
        h('span', { class: 'picks-eyebrow', text: 'Week of ' + wk.start.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }) + ' – ' + wk.end.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }) }),
        h('h2', { text: 'Good ' + (new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening') + ', ' + session.name }),
        h('p', { text: pr.length ? pr.length + ' thing(s) need attention this week. The most important are at the top.' : 'Nothing urgent this week — the farm is on track.' })),
      h('div', { class: 'brief-actions' },
        h('button', { class: 'btn btn-sm btn-gold', type: 'button', text: 'Share weekly summary', onclick: function () { showDigest(briefingDigest(pr, pulse, pick)); } }))));

    append(root, h('div', { class: 'kpis' },
      kpi('Next delivery', shortWeekday(M.clearance.parseDayKey(nextDay).toISOString()), pickUnits + ' units for ' + pick.orderCount + ' order(s)'),
      kpi('Crops short', String(crops.filter(function (c) { return c.status === 'short'; }).length), 'next ' + M.radar.weeks + ' weeks'),
      kpi('Sales · 7 days', money(pulse.thisWk.cents), pulse.change === null ? pulse.thisWk.n + ' order(s)' : (pulse.change >= 0 ? '+' : '') + pulse.change + '% vs week before'),
      kpi('Waiting on you', String(S().bookings.filter(function (b) { return b.status === 'new'; }).length + S().campaigns.filter(function (c) { return c.status === 'pending_approval'; }).length + S().tickets.filter(function (t) { return t.status === 'open'; }).length),
        'enquiries, approvals and tickets')));

    /* ---- Top priorities ---- */
    var top = pr.slice(0, 6), rest = pr.slice(6);
    append(root, panel(aiTitle('Top priorities this week'), 'Ranked by urgency across farm ops, sales and customers. Each one links to where you act on it.',
      top.length ? h('ol', { class: 'brief-list' }, top.map(function (p, i) {
        return h('li', { class: 'brief-item area-' + p.area.toLowerCase().replace(/\s/g, '-') },
          h('span', { class: 'brief-rank', text: String(i + 1) }),
          iconCircle(p.icon, 'soft'),
          h('div', { class: 'brief-text' },
            h('div', { class: 'brief-title-row' }, h('strong', { text: p.title }), badge(p.area, p.area === 'Farm ops' ? 'green' : p.area === 'Sales' ? 'amber' : 'blue')),
            h('p', { text: p.why })),
          h('a', { class: 'btn btn-sm btn-outline brief-go', href: p.action.href, text: p.action.label + ' →' }));
      })) : h('p', { class: 'empty', text: 'Nothing urgent. Enjoy the quiet week!' }),
      rest.length ? h('details', { class: 'brief-more' }, h('summary', { text: 'Also this week (' + rest.length + ')' }),
        h('ul', null, rest.map(function (p) { return h('li', null, h('a', { href: p.action.href, text: p.title })); }))) : null));

    /* ---- Next delivery + sales pulse ---- */
    var pickPanel = panel('Next harvest & pack · ' + shortWeekday(M.clearance.parseDayKey(nextDay).toISOString()), null,
      pick.rows.length ? h('ul', { class: 'brief-pick' }, pick.rows.slice(0, 5).map(function (r) {
        return h('li', null, h('span', { class: 'rw-tier-cell' }, thumbMini(r.product), r.product.title), h('strong', { text: String(r.pick) }));
      })) : h('p', { class: 'empty', text: 'Nothing to pack for the next delivery yet.' }),
      pick.rows.length > 5 ? h('small', { class: 'hint', text: '+ ' + (pick.rows.length - 5) + ' more item(s)' }) : null,
      h('div', { class: 'panel-foot' }, h('a', { class: 'pill-btn', href: '#radar', text: 'Full pick list →' })));
    var pulsePanel = panel('Sales pulse', null,
      h('div', { class: 'brief-pulse' },
        h('div', null, h('small', { text: 'Last 7 days' }), h('strong', { text: money(pulse.thisWk.cents) }), h('small', { text: pulse.thisWk.n + ' order(s) in Tyllage' })),
        h('div', null, h('small', { text: 'Week before' }), h('strong', { text: money(pulse.lastWk.cents) }), h('small', { text: pulse.lastWk.n + ' order(s)' }))),
      pulse.rising.length ? h('div', { class: 'brief-rising' }, h('small', { text: 'Rising demand (MEOD Fresh history):' }),
        pulse.rising.map(function (c) { return h('span', { class: 'mini-chip', text: c.product.title + ' ↑ ' + c.trendPct + '%' }); })) : null,
      h('div', { class: 'brief-visits' }, h('small', { text: 'Visits coming up' }),
        pulse.visits.length ? h('ul', null, pulse.visits.map(function (b) { return h('li', null, h('strong', { text: b.org || b.name }), ' · ' + b.pax + ' guests · ' + shortWeekday(M.clearance.parseDayKey(b.date).toISOString())); }))
          : h('p', { class: 'empty', text: 'No confirmed visits in the next two weeks.' })));
    append(root, h('div', { class: 'two-col' }, pickPanel, pulsePanel));

    /* ---- This week's calendar ---- */
    // The next 7 days from today (more useful mid-week than a Monday–Sunday grid).
    var days = [], today0 = new Date(); today0.setHours(0, 0, 0, 0);
    for (var i = 0; i < 7; i++) days.push(new Date(today0.getTime() + i * 864e5));
    var todayKey = M.clearance.dayKey(new Date());
    append(root, panel('Next 7 days', 'Delivery days, harvests and farm visits at a glance.',
      h('ol', { class: 'brief-week' }, days.map(function (d) {
        var key = M.clearance.dayKey(d);
        var isDelivery = M.DELIVERY_DAYS.indexOf(d.getDay()) > -1;
        var harvests = S().batches.filter(function (b) { return b.harvestDate === key && b.status !== 'cancelled'; });
        var visits = S().bookings.filter(function (b) { return b.date === key && b.status === 'confirmed'; });
        var pl = isDelivery ? M.radar.pickList(key) : null;
        var items = [];
        if (isDelivery) items.push(h('li', { class: 'ev-delivery', text: 'Delivery · ' + (pl ? pl.orderCount : 0) + ' order(s)' }));
        harvests.forEach(function (b) { items.push(h('li', { class: 'ev-harvest', text: 'Harvest ' + M.byId('products', b.productId).title })); });
        visits.forEach(function (b) { items.push(h('li', { class: 'ev-visit', text: 'Visit · ' + (b.org || b.name) })); });
        return h('li', { class: 'brief-day' + (key === todayKey ? ' today' : '') + (key < todayKey ? ' past' : '') },
          h('div', { class: 'brief-day-head' }, h('strong', { text: d.toLocaleDateString('en-SG', { weekday: 'short' }) }), h('small', { text: d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }) })),
          items.length ? h('ul', null, items) : h('small', { class: 'brief-none', text: '—' }));
      }))));
  }

  /* ---------------- Demand Radar + harvest & pack list (staff + admin) ----------------
   * Radar: per crop, next few weeks of supply (stock + planned harvests) against demand
   * (confirmed pre-orders + expected sales from weekly history), with a plain suggestion and
   * one-click next steps. Pick list: what to harvest and pack for each delivery morning.
   * Suggestions are rule-based and only advise — staff decide what to plant, promote or clear. */
  var RADAR_STATUS = {
    short: { label: 'Short', tone: 'red' }, surplus: { label: 'Surplus', tone: 'amber' },
    balanced: { label: 'Balanced', tone: 'green' }, unknown: { label: 'Can\'t tell', tone: 'grey' }, idle: { label: 'No activity', tone: 'grey' }
  };
  function radarAdvice(c) {
    var a = radarAdviceBase(c), lost = M.lost.unitsFor(c.product.id);
    if (lost) a.text += ' Plus ' + lost + ' unit(s) asked for while it was sold out (Lost demand) — real demand is higher than sales show.';
    return a;
  }
  function radarAdviceBase(c) {
    var p = c.product, pct = c.demand ? Math.round(Math.abs(c.gap) / c.demand * 100) : 0;
    var grow = M.RULES.growDays[p.category] || 30;
    var ready = shortDate(new Date(Date.now() + grow * 864e5).toISOString());
    var trend = c.trendPct > 5 ? ' Demand is up ' + c.trendPct + '% on the previous 4 weeks.' : c.trendPct < -5 ? ' Demand is down ' + Math.abs(c.trendPct) + '% on the previous 4 weeks.' : '';
    if (c.status === 'short') {
      return { text: 'About ' + Math.abs(c.gap) + ' units (' + pct + '%) more demand than supply.' + trend + ' Hold back promotions on ' + p.title + ', and consider sowing another batch — sown today it would be ready around ' + ready + '.',
        actions: [{ label: 'Plan a batch', href: '#harvest' }] };
    }
    if (c.status === 'surplus') {
      var acts = [{ label: 'Draft promo', promo: true }];
      if (c.openBatch) acts.push({ label: 'See pre-orders', href: '#harvest' });
      acts.push({ label: 'Buy to Clear', href: '#clearance' });
      return { text: 'About ' + c.gap + ' units more supply than expected demand.' + trend + ' Promote it now' + (c.openBatch ? ', push pre-orders for the ' + shortWeekday(M.clearance.parseDayKey(c.openBatch.harvestDate).toISOString()) + ' harvest' : '') +
        ', list extra on Buy to Clear before it loses value, and review the next sowing size.', actions: acts };
    }
    if (c.status === 'unknown') return { text: 'Stock sync failed, so stock isn\'t counted. Re-sync before relying on this row.', actions: [{ label: 'Stock', href: '#inventory' }] };
    if (c.status === 'idle') return { text: 'No stock, harvests or sales in this window.', actions: [] };
    return { text: 'Supply and demand are within about 10% of each other.' + trend + ' No action needed.', actions: [] };
  }
  function radarPromo(c) {
    var p = c.product;
    var a = audienceFor(p.id);
    var b = c.openBatch;
    var msg = b
      ? 'Pre-order the next harvest 🌱 Our ' + p.title + ' will be picked on ' + shortWeekday(M.clearance.parseDayKey(b.harvestDate).toISOString()) + ' and delivered the same day — pre-orders earn 2× reward points. Reply STOP to opt out.'
      : DRAFTS.en(p);
    var id = M.nextId('CP');
    S().campaigns.unshift({
      id: id, kind: 'radar-surplus', productId: p.id, title: p.title + ' — Demand Radar promo', language: 'en', message: msg,
      audience: a.eligible, status: 'pending_approval', createdBy: session.email, approvedBy: null, createdAt: new Date().toISOString(), sentCount: 0
    });
    commit('campaign.submitted', id, 'Promo for ' + p.title + ' drafted for ' + a.eligible.length + ' opted-in buyer(s) — waiting for approval in Campaign Studio.');
  }
  function radarBars(c) {
    var max = Math.max(c.supply, c.demand, 1);
    var seg = function (cls, v) { var s = h('span', { class: cls }); s.style.width = (v / max * 100) + '%'; return s; };
    return h('div', { class: 'radar-bars', 'aria-hidden': 'true' },
      h('div', { class: 'radar-bar' }, seg('rb-stock', c.stock), seg('rb-harvest', c.harvest)),
      h('div', { class: 'radar-bar' }, seg('rb-confirmed', c.confirmed), seg('rb-expected', c.expected)));
  }

  function radarView(root) {
    var crops = M.radar.crops();
    var weeks = M.radar.weeks;
    var st = radarView.state || (radarView.state = { filter: 'all', day: null });
    var by = function (s) { return crops.filter(function (c) { return c.status === s; }); };
    var units = function (list) { return list.reduce(function (s, c) { return s + Math.abs(c.gap); }, 0); };
    var confirmed = crops.reduce(function (s, c) { return s + c.confirmed; }, 0);
    append(root, h('div', { class: 'kpis' },
      kpi('Crops tracked', String(crops.length), 'MEOD-grown, next ' + weeks + ' weeks'),
      kpi('Short', String(by('short').length), units(by('short')) + ' units more demand than supply'),
      kpi('Surplus', String(by('surplus').length), units(by('surplus')) + ' units at risk of going unsold'),
      kpi('Pre-orders', String(confirmed), 'already confirmed against planned harvests')));

    /* ---- Supply vs demand ---- */
    var order = { short: 0, surplus: 1, unknown: 2, balanced: 3, idle: 4 };
    var chips = h('div', { class: 'filters', role: 'toolbar', 'aria-label': 'Filter crops' });
    var list = h('div', { class: 'radar-list' });
    function draw() {
      chips.textContent = '';
      [['all', 'All'], ['short', 'Short'], ['surplus', 'Surplus'], ['balanced', 'Balanced']].forEach(function (f) {
        var n = f[0] === 'all' ? crops.length : by(f[0]).length;
        append(chips, h('button', { type: 'button', class: 'chip' + (st.filter === f[0] ? ' active' : ''), 'aria-pressed': String(st.filter === f[0]),
          onclick: function () { st.filter = f[0]; draw(); } }, f[1] + ' ', h('span', { class: 'chip-count', text: String(n) })));
      });
      var rows = crops.filter(function (c) { return st.filter === 'all' || c.status === st.filter; })
        .sort(function (a, b) { return order[a.status] - order[b.status] || Math.abs(b.gap) - Math.abs(a.gap); });
      list.textContent = '';
      if (!rows.length) { append(list, h('p', { class: 'empty', text: 'No crops in this group.' })); return; }
      rows.forEach(function (c) {
        var s = RADAR_STATUS[c.status], adv = radarAdvice(c);
        append(list, h('article', { class: 'radar-row st-' + c.status },
          h('div', { class: 'radar-crop' },
            h('span', { class: 'rw-tier-cell' }, thumbMini(c.product), h('strong', { text: c.product.title })),
            h('div', { class: 'radar-tags' }, badge(s.label, s.tone),
              c.trendPct ? h('span', { class: 'mini-chip', text: (c.trendPct > 0 ? '↑ ' : '↓ ') + Math.abs(c.trendPct) + '% trend' }) : null,
              h('span', { class: 'mini-chip', text: c.confidence + ' confidence' }))),
          h('div', { class: 'radar-numbers' },
            radarBars(c),
            h('small', null, h('b', { text: 'Supply ' + c.supply }), ' = ' + c.stock + ' in stock + ' + c.harvest + ' harvesting'),
            h('small', null, h('b', { text: 'Demand ' + c.demand }), ' = ' + c.preordered + ' pre-ordered' + (c.b2b ? ' + ' + c.b2b + ' B2B' : '') + ' + ~' + c.expected + ' expected (' + c.weekly + '/wk)'),
            h('small', { class: 'radar-gap ' + (c.gap < 0 ? 'neg' : 'pos'), text: (c.gap >= 0 ? '+' : '−') + Math.abs(c.gap) + ' gap' })),
          h('div', { class: 'radar-advice' },
            h('p', { text: adv.text }),
            adv.actions.length ? h('div', { class: 'actions' }, adv.actions.map(function (a) {
              return a.promo ? mini(a.label, function () { radarPromo(c); }) : h('a', { class: 'mini', href: a.href, text: a.label });
            }).concat([whyBtn(c.product.title, function () { return M.decisions.explainRadar(c); })])) : h('div', { class: 'actions' }, whyBtn(c.product.title, function () { return M.decisions.explainRadar(c); })))));
      });
    }
    draw();
    append(root, panel(aiTitle('Supply vs demand · next ' + weeks + ' weeks'),
      'Supply is stock plus planned harvests; demand is confirmed pre-orders plus expected sales from the last 4 weeks (MEOD Fresh history, mock). Estimates, not forecasts — confidence shows how steady sales have been.',
      h('div', { class: 'radar-legend', 'aria-hidden': 'true' },
        h('span', null, h('i', { class: 'rb-stock' }), 'In stock'), h('span', null, h('i', { class: 'rb-harvest' }), 'Harvesting'),
        h('span', null, h('i', { class: 'rb-confirmed' }), 'Pre-ordered'), h('span', null, h('i', { class: 'rb-expected' }), 'Expected')),
      h('div', { class: 'user-toolbar' }, chips), list));

    /* ---- Harvest & pack list ---- */
    var days = M.radar.deliveryKeys(3);
    if (!st.day || days.indexOf(st.day) === -1) st.day = days[0];
    var dayChips = h('div', { class: 'filters', role: 'toolbar', 'aria-label': 'Delivery day' });
    var pickBox = h('div');
    function pickTable(pl) {
      return table([
        { label: 'Produce', render: function (r) { return h('span', { class: 'rw-tier-cell' }, thumbMini(r.product), h('strong', { text: r.product.title })); } },
        { label: 'Orders', num: true, render: function (r) { return r.orders ? String(r.orders) : '—'; } },
        { label: 'Pre-orders', num: true, render: function (r) { return r.preorders ? String(r.preorders) : '—'; } },
        { label: 'Bags', num: true, render: function (r) { return r.bags ? String(r.bags) : '—'; } },
        { label: 'B2B', num: true, render: function (r) { return r.b2b ? String(r.b2b) : '—'; } },
        { label: 'Buffer', num: true, render: function (r) { return '+' + r.buffer; } },
        { label: 'Harvest / pack', num: true, render: function (r) { return h('strong', { text: String(r.pick) }); } },
        { label: 'Awaiting payment', num: true, render: function (r) { return r.awaitingPayment ? String(r.awaitingPayment) : '—'; } }
      ], pl.rows, 'Nothing to harvest or pack for this day yet.');
    }
    function printPick(pl) {
      var dlg = h('dialog', { class: 'receipt-dialog pick-print' });
      var dayText = weekdayLongLabel(M.clearance.parseDayKey(pl.dayKey));
      append(dlg, h('div', { class: 'receipt' },
        h('div', { class: 'r-head' }, h('img', { src: 'assets/img/favicon.png', alt: '', width: 44, height: 44 }),
          h('div', null, h('strong', { text: 'Harvest & pack list' }), h('small', { text: dayText + ' · ' + pl.orderCount + ' order(s)' }))),
        h('table', { class: 'r-items' },
          h('thead', null, h('tr', null, h('th', { text: 'Produce' }), h('th', { class: 'num', text: 'Need' }), h('th', { class: 'num', text: 'Buffer' }), h('th', { class: 'num', text: 'Pick' }), h('th', { text: '✓' }))),
          h('tbody', null, pl.rows.map(function (r) { return h('tr', null, h('td', { text: r.product.title }), h('td', { class: 'num', text: String(r.need) }), h('td', { class: 'num', text: '+' + r.buffer }), h('td', { class: 'num', text: String(r.pick) }), h('td', { text: '☐' })); }))),
        h('p', { class: 'r-foot', text: 'Buffer = 10% (min. 1) for damage and walk-in sales. Generated by Tyllage (prototype).' })),
        h('div', { class: 'r-actions no-print' },
          h('button', { class: 'btn btn-sm btn-outline', type: 'button', text: 'Close', onclick: function () { dlg.close(); } }),
          h('button', { class: 'btn btn-sm btn-forest', type: 'button', text: 'Print', onclick: function () { window.print(); } })));
      dlg.addEventListener('close', function () { dlg.remove(); });
      document.body.appendChild(dlg);
      dlg.showModal();
    }
    function drawPick() {
      dayChips.textContent = '';
      days.forEach(function (k) {
        var n = M.radar.pickList(k).rows.reduce(function (s, r) { return s + r.pick; }, 0);
        append(dayChips, h('button', { type: 'button', class: 'chip' + (st.day === k ? ' active' : ''), 'aria-pressed': String(st.day === k),
          onclick: function () { st.day = k; drawPick(); } }, shortWeekday(M.clearance.parseDayKey(k).toISOString()) + ' ', h('span', { class: 'chip-count', text: String(n) })));
      });
      var pl = M.radar.pickList(st.day);
      var total = pl.rows.reduce(function (s, r) { return s + r.pick; }, 0);
      pickBox.textContent = '';
      append(pickBox,
        h('div', { class: 'pick-summary' },
          h('span', null, h('strong', { text: String(total) }), ' units to harvest & pack · ', h('strong', { text: String(pl.orderCount) }), ' order(s)'),
          pl.rows.length ? h('button', { class: 'btn btn-sm btn-forest', type: 'button', text: 'Print list', onclick: function () { printPick(pl); } }) : null),
        pl.pendingBags ? h('p', { class: 'callout', text: pl.pendingBags + ' Surprise Harvest Bag(s) for this day still need their contents approved in Buy to Clear.' }) : null,
        pickTable(pl));
    }
    drawPick();
    append(root, panel('Harvest & pack list', 'For each delivery morning: paid and awaiting-payment orders, pre-orders harvesting that day, and approved Surprise Harvest Bags. Orders from MEOD Fresh would be added here once Shopify is connected.',
      h('div', { class: 'user-toolbar' }, dayChips), pickBox));
  }
  // Small product thumbnail for list rows.
  function thumbMini(p) { var t = thumb(p); t.classList.add('thumb-mini'); return t; }

  /* ---------------- Visits: learning journeys → farm sales (staff + admin) ---------------- */
  function visitShopUrl(code) { return new URL('visit.html?code=' + encodeURIComponent(code), location.href).href; }
  // QR codes come from qrcodejs (cdnjs), loaded only when a QR is first shown. If it can't
  // load (offline), the dialog still shows the link and code.
  var qrLib = null;
  function loadQrLib() {
    if (window.QRCode) return Promise.resolve(window.QRCode);
    if (qrLib) return qrLib;
    qrLib = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      s.onload = function () { resolve(window.QRCode); };
      s.onerror = function () { qrLib = null; reject(new Error('QR library unavailable')); };
      document.head.appendChild(s);
    });
    return qrLib;
  }
  function showVisitQr(b, ev) {
    var type = M.GROUP_TYPES[b.groupType] || M.GROUP_TYPES.other;
    var url = visitShopUrl(ev.code);
    var qrBox = h('div', { class: 'vq-code', 'aria-label': 'QR code for the visitor farm shop' }, h('small', { text: 'Loading QR code…' }));
    var dlg = h('dialog', { class: 'receipt-dialog visit-qr-dialog', 'aria-labelledby': 'vq-title' });
    append(dlg,
      h('div', { class: 'vq-card' },
        h('img', { src: 'assets/img/favicon.png', alt: '', width: 40, height: 40 }),
        h('h2', { id: 'vq-title', text: 'Take the farm home' }),
        h('p', { text: b.org || b.name }),
        qrBox,
        h('p', { class: 'vq-steps', text: 'Scan to order today\'s harvest · ' + Math.round(M.RULES.groupDiscountRate * 100) + '% off · ' + Math.round(M.RULES.visitFundRate * 100) + '% goes to your ' + type.fund }),
        h('span', { class: 'code-box', text: ev.code }),
        h('small', { class: 'vq-url', text: url })),
      h('div', { class: 'r-actions no-print' },
        h('button', { class: 'btn btn-sm btn-outline', type: 'button', text: 'Copy link', onclick: function () {
          (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast('Link copied.'); }, function () { toast(url); });
        } }),
        h('a', { class: 'btn btn-sm btn-outline', href: url, target: '_blank', rel: 'noopener', text: 'Open shop' }),
        h('button', { class: 'btn btn-sm btn-forest', type: 'button', text: 'Print', onclick: function () { window.print(); } }),
        h('button', { class: 'btn btn-sm btn-outline', type: 'button', text: 'Close', onclick: function () { dlg.close(); } })));
    dlg.addEventListener('close', function () { dlg.remove(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    document.body.appendChild(dlg);
    dlg.showModal();
    loadQrLib().then(function (QR) {
      qrBox.textContent = '';
      new QR(qrBox, { text: url, width: 200, height: 200, colorDark: '#033a0d', colorLight: '#ffffff' });
    }, function () { qrBox.textContent = ''; append(qrBox, h('small', { text: 'QR code needs an internet connection — share the link or code below instead.' })); });
  }

  function visitsView(root) {
    var f = M.visits.funnel();
    var pctOf = function (n) { return f.visitors ? Math.round(n / f.visitors * 100) : 0; };
    append(root, h('div', { class: 'kpis' },
      kpi('Visitors', String(f.visitors), 'across ' + f.visitedGroups + ' visit(s) so far'),
      kpi('Bought on the day', pctOf(f.buyers) + '%', f.buyers + ' of ' + f.visitors + ' visitors'),
      kpi('Opted in', String(f.signups), pctOf(f.signups) + '% now get harvest updates'),
      kpi('Sales from visits', money(f.salesCents), money(f.perVisitorCents) + ' per visitor')));

    // Capacity, next 14 days: confirmed sessions vs the daily limit. Sundays only show when
    // something is booked or requested that day.
    var capDays = [];
    for (var ci = 0; ci < 14; ci++) {
      var cd = new Date(); cd.setHours(0, 0, 0, 0); cd = new Date(cd.getTime() + ci * 864e5);
      var cc = M.visits.capacity(M.clearance.dayKey(cd));
      if (cd.getDay() !== 0 || cc.booked || cc.requested) capDays.push(cc);
    }
    append(root, panel('Visit capacity · next 2 weeks', 'Sessions of up to ' + M.RULES.visitSessionMax + ' guests; the farm hosts ' + M.RULES.visitSessionsPerDay + ' a day (change both in Settings). Confirming a visit on a full day is blocked — the reply draft offers free dates instead.',
      h('ul', { class: 'cap-days' }, capDays.map(function (c) {
        var cls = c.booked >= c.cap ? 'full' : c.booked ? 'some' : 'free';
        var cells = [];
        for (var i = 0; i < c.cap; i++) cells.push(h('span', { class: i < c.booked ? 'on' : '' }));
        return h('li', { class: 'cap-' + cls },
          h('strong', { text: M.clearance.parseDayKey(c.dayKey).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' }) }),
          h('span', { class: 'cap-cells', 'aria-hidden': 'true' }, cells),
          h('small', { text: c.booked >= c.cap ? 'Full' : (c.cap - c.booked) + ' of ' + c.cap + ' free' }),
          c.requested ? h('small', { class: 'cap-req', text: c.requested + ' requested' }) : null);
      }))));

    var steps = [['Visitors', f.visitors], ['Bought on the day', f.buyers], ['Opted in to updates', f.signups], ['Ordered again later', f.repeatBuyers]];
    append(root, panel('From visit to customer', 'Everyone who visited, how many ordered with their group\'s code, how many opted in to messages, and how many came back to order again without the code.',
      h('div', { class: 'visit-funnel' }, steps.map(function (s) {
        var bar = h('span', { class: 'vf-bar' }, h('span', { class: 'vf-fill' }));
        bar.firstChild.style.width = (f.visitors ? Math.max(2, s[1] / f.visitors * 100) : 0) + '%';
        return h('div', { class: 'vf-row' }, h('span', { class: 'vf-label', text: s[0] }), bar,
          h('span', { class: 'vf-num' }, h('strong', { text: String(s[1]) }), h('small', { text: pctOf(s[1]) + '%' })));
      }))));

    var confirmed = S().bookings.filter(function (b) { return b.status === 'confirmed'; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    append(root, panel('Visits', 'Each confirmed visit has its own farm-shop code. Show the QR on the day; ' + Math.round(M.RULES.visitFundRate * 100) + '% of the group\'s orders goes back to its fund (illustrative rate).',
      h('div', { class: 'visits-table' }, table([
        { label: 'Organisation', render: function (b) {
          var type = M.GROUP_TYPES[b.groupType] || M.GROUP_TYPES.other;
          return h('span', null, h('strong', { text: b.org || b.name }), h('br'), h('small', { text: type.label + ' · ' + b.experience }));
        } },
        { label: 'Visit', render: function (b) {
          var st = M.visits.stats(b);
          return h('span', null, shortWeekday(M.clearance.parseDayKey(b.date).toISOString()), h('br'),
            h('small', { text: (st.visited ? 'visited' : inDaysText(b.date)) + (st.sessions > 1 ? ' · ' + st.sessions + ' sessions' : '') }));
        } },
        { label: 'Pax', num: true, render: function (b) { return String(b.pax); } },
        { label: 'Code', render: function (b) {
          var st = M.visits.stats(b);
          return st.event ? h('div', { class: 'actions' }, h('span', { class: 'code-box', text: st.event.code }), mini('QR & link', function () { showVisitQr(b, st.event); })) : '—';
        } },
        { label: 'Bought', num: true, render: function (b) { var st = M.visits.stats(b); return st.visited || st.buyers ? st.buyers + ' / ' + b.pax : '—'; } },
        { label: 'Opted in', num: true, render: function (b) { var st = M.visits.stats(b); return st.visited || st.signups ? String(st.signups) : '—'; } },
        { label: 'Sales', num: true, render: function (b) {
          var st = M.visits.stats(b);
          if (!st.salesCents) return '—';
          return h('span', null, h('strong', { text: money(st.salesCents) }), h('br'),
            h('small', { text: money(st.daySalesCents) + ' on the day' + (st.laterSalesCents ? ' + ' + money(st.laterSalesCents) + ' later' : '') }));
        } },
        { label: 'Per visitor', num: true, render: function (b) { var st = M.visits.stats(b); return st.salesCents ? money(st.perVisitorCents) : '—'; } },
        { label: 'Group fund', num: true, render: function (b) { var st = M.visits.stats(b); return st.fundCents ? money(st.fundCents) : '—'; } }
      ], confirmed, 'No confirmed visits yet.'))));
    append(root, visitVoucherPanel());

    var pending =S().bookings.filter(function (b) { return b.status === 'new'; });
    append(root, panel(aiTitle('Enquiries waiting'), 'Confirming creates the group\'s farm-shop code. In production this also sends an approved WhatsApp template or email.',
      table([
        { label: 'Organisation', render: function (b) { return h('span', null, h('strong', { text: b.org || b.name }), h('br'), h('small', { text: (M.GROUP_TYPES[b.groupType] || { label: 'Individual' }).label + ' · ' + b.email })); } },
        { label: 'Experience', render: function (b) { return b.experience; } },
        { label: 'Date', render: function (b) { return shortWeekday(M.clearance.parseDayKey(b.date).toISOString()); } },
        { label: 'Pax', num: true, render: function (b) { return String(b.pax) + (M.visits.sessions(b.pax) > 1 ? ' (' + M.visits.sessions(b.pax) + ' sessions)' : ''); } },
        { label: 'Message', render: function (b) { return b.message || '—'; } },
        { label: 'Last reply', render: lastReplyCell },
        { label: 'Actions', render: function (b) {
          return h('div', { class: 'actions stack' },
            mini('✨ Draft reply', function () { openReplyDialog(b); }),
            mini(b.proposal ? '✓ Package ' + money(b.proposal.totalCents) : '✨ Package', function () { openVisitPackage(b); }),
            mini('Confirm', function () { confirmVisit(b); }),
            mini('Decline', function () { b.status = 'declined'; commit('booking.declined', b.id, b.id + ' declined.'); }, { danger: true }));
        } }
      ], pending, 'No enquiries waiting.')));
    append(root, reinvitePanel());
  }

  /* ---------------- Rewards (staff + admin): AI for farm ops ----------------
   * 1. AI ops brief — ranked suggestions that connect rewards to the farm: clear surplus with
   *    2× points, fill a slow harvest batch, nudge members near a tier, remind unused points,
   *    win back lapsed members. Each opens the nudge composer.
   * 2. Nudge composer — audience, one editable message per language, an optional "support
   *    local by 2035" line, a personalised preview and a rough estimate. Drafts go to Campaign
   *    Studio for approval; nothing is sent from here.
   * 3. Members — built for a large customer base: plain-English "Ask AI" search, tier chips,
   *    sorting and paging, plus "Nudge these" for the filtered, opted-in group.
   * PROTOTYPE: insights and the search are ranked rules over the demo data; in production
   * they'd run on the server over the full member base (and could be phrased by an LLM). */
  var NUDGE_LANGS = { en: 'English', zh: '中文', ms: 'Melayu' };
  var NUDGE_STOP = { en: 'Reply STOP to opt out.', zh: '回复 STOP 取消订阅。', ms: 'Balas STOP untuk berhenti.' };
  var NUDGE_LOCAL = {
    en: 'Every bunch helps Singapore grow more of its own food by 2035.',
    zh: '每一份都在帮助新加坡在 2035 年前生产更多本地粮食。',
    ms: 'Setiap ikat membantu Singapura menghasilkan lebih banyak makanan sendiri menjelang 2035.'
  };
  function dayShort(d) { return new Date(d).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' }); }
  // Message bodies per nudge kind. {first_name}, {bunches_to_go} and {points} are filled per person.
  var NUDGE_BODY = {
    tier: {
      en: function (x) { return 'Hi {first_name} 🌱 You\'re just {bunches_to_go} bunches of MEOD greens away from ' + x.next.label + (x.next.voucherCents ? ' — and a ' + money(x.next.voucherCents) + ' voucher' : '') + '.'; },
      zh: function (x) { return '{first_name} 您好 🌱 再买 {bunches_to_go} 份 MEOD 蔬菜即可升级为 ' + x.next.label + (x.next.voucherCents ? '，并获得 ' + money(x.next.voucherCents) + ' 优惠券' : '') + '。'; },
      ms: function (x) { return 'Hai {first_name} 🌱 Hanya {bunches_to_go} ikat sayur MEOD lagi untuk ' + x.next.label + (x.next.voucherCents ? ' — dan baucar ' + money(x.next.voucherCents) : '') + '.'; }
    },
    surplus: {
      en: function (x) { return 'Hi {first_name} 🌱 We harvested more ' + x.product.title + ' than expected — it\'s ' + money(x.listing.clearancePriceCents) + ' on Buy to Clear until ' + dayShort(x.listing.availableUntil) + ', with 2× reward points. Help us waste nothing!'; },
      zh: function (x) { return '{first_name} 您好 🌱 本季 ' + x.product.title + ' 丰收！即日起至 ' + dayShort(x.listing.availableUntil) + ' 特价 ' + money(x.listing.clearancePriceCents) + '，并享双倍积分。一起减少浪费！'; },
      ms: function (x) { return 'Hai {first_name} 🌱 Tuaian ' + x.product.title + ' kami melebihi jangkaan — kini ' + money(x.listing.clearancePriceCents) + ' di Buy to Clear sehingga ' + dayShort(x.listing.availableUntil) + ', dengan 2× mata ganjaran.'; }
    },
    preorder: {
      en: function (x) { return 'Hi {first_name} 🌱 Our ' + x.product.title + ' will be picked on ' + dayShort(M.clearance.parseDayKey(x.batch.harvestDate)) + '. Pre-order by ' + dayShort(M.harvest.cutoff(x.batch)) + ' for 2× points — it helps us grow only what gets eaten.'; },
      zh: function (x) { return '{first_name} 您好 🌱 我们的 ' + x.product.title + ' 将于 ' + dayShort(M.clearance.parseDayKey(x.batch.harvestDate)) + ' 采收。' + dayShort(M.harvest.cutoff(x.batch)) + ' 前预订可享双倍积分，帮助我们按需种植。'; },
      ms: function (x) { return 'Hai {first_name} 🌱 ' + x.product.title + ' kami akan dituai pada ' + dayShort(M.clearance.parseDayKey(x.batch.harvestDate)) + '. Pra-pesan sebelum ' + dayShort(M.harvest.cutoff(x.batch)) + ' untuk 2× mata.'; }
    },
    points: {
      en: function () { return 'Hi {first_name} 🌱 You have {points} reward points waiting — swap them for a voucher in your MEOD account and use it on this week\'s harvest.'; },
      zh: function () { return '{first_name} 您好 🌱 您有 {points} 积分未使用 — 在 MEOD 账户中兑换优惠券，用于本周新鲜蔬菜。'; },
      ms: function () { return 'Hai {first_name} 🌱 Anda ada {points} mata ganjaran — tukar kepada baucar dalam akaun MEOD anda untuk tuaian minggu ini.'; }
    },
    winback: {
      en: function () { return 'Hi {first_name} 🌱 It\'s been a while! This week\'s MEOD harvest is in, and your {points} points are still here for you.'; },
      zh: function () { return '{first_name} 您好 🌱 好久不见！本周 MEOD 新鲜蔬菜已上架，您的 {points} 积分仍可使用。'; },
      ms: function () { return 'Hai {first_name} 🌱 Lama tidak berjumpa! Tuaian MEOD minggu ini sudah tiba, dan {points} mata anda masih menanti.'; }
    },
    general: {
      en: function () { return 'Hi {first_name} 🌱 Fresh, pesticide-free MEOD greens are in this week — and you have {points} points to use.'; },
      zh: function () { return '{first_name} 您好 🌱 本周 MEOD 无农药新鲜蔬菜已上架 — 您还有 {points} 积分可用。'; },
      ms: function () { return 'Hai {first_name} 🌱 Sayur MEOD segar tanpa racun perosak sudah tiba minggu ini — dan anda ada {points} mata.'; }
    }
  };
  var NUDGE_KIND_LABEL = { tier: 'Tier nudge', surplus: 'Surplus offer', preorder: 'Pre-order nudge', points: 'Points reminder', winback: 'Win-back', general: 'Member message' };
  function nudgeLang(c) { return NUDGE_LANGS[c.language] ? c.language : 'en'; }
  function optedIn(list) { return list.filter(function (m) { return m.customer.consentMarketing; }); }
  function buyersOf(members, category) { return optedIn(members).filter(function (m) { return (m.categories[category] || 0) > 0; }); }
  function closeToTier(m) {
    if (!m.s.next) return false;
    var span = m.s.next.minBunches - m.s.tier.minBunches;
    return m.s.toNext > 0 && m.s.toNext <= Math.ceil(span * 0.3);
  }

  // Ranked, explainable suggestions. Farm-ops ones (surplus, harvest) come first.
  function rewardsInsights(members) {
    var out = [];
    var listing = M.clearance.listActive().map(function (l) { return { l: l, left: M.clearance.remaining(l), p: M.byId('products', l.productId) }; })
      .filter(function (x) { return x.p && x.p.meodGrown; }).sort(function (a, b) { return b.left - a.left; })[0];
    if (listing) {
      var aud = buyersOf(members, listing.p.category);
      if (aud.length) out.push({ kind: 'surplus', area: 'Farm ops', icon: ICONS.tag, audience: aud, ctx: { product: listing.p, listing: listing.l },
        title: 'Clear ' + listing.left + ' ' + listing.p.title + ' with 2× points',
        why: listing.left + ' left on Buy to Clear until ' + shortDate(listing.l.availableUntil) + '. ' + aud.length + ' opted-in member(s) buy ' + M.CATEGORIES[listing.p.category].label.toLowerCase() + '.',
        estimate: 'If 1 in 4 buy two: about ' + Math.min(listing.left, Math.ceil(aud.length / 4) * 2) + ' bunches saved from waste' });
    }
    var batch = M.harvest.open().map(function (b) { return { b: b, sg: M.harvest.signal(b), p: M.byId('products', b.productId) }; })
      .filter(function (x) { return x.sg.key === 'slow' || x.sg.key === 'steady'; })
      .sort(function (a, b) { return (a.sg.key === 'slow' ? 0 : 1) - (b.sg.key === 'slow' ? 0 : 1) || M.harvest.preordered(a.b) / (a.b.preorderCap || 1) - M.harvest.preordered(b.b) / (b.b.preorderCap || 1); })[0];
    if (batch) {
      var audB = buyersOf(members, batch.p.category);
      var pct = Math.round(M.harvest.preordered(batch.b) / (batch.b.preorderCap || 1) * 100);
      if (audB.length) out.push({ kind: 'preorder', area: 'Farm ops', icon: ICONS.clock, audience: audB, ctx: { product: batch.p, batch: batch.b },
        title: 'Fill the ' + batch.p.title + ' harvest on ' + dayShort(M.clearance.parseDayKey(batch.b.harvestDate)),
        why: 'Only ' + pct + '% of pre-order spots taken; pre-orders close ' + dayShort(M.harvest.cutoff(batch.b)) + '. ' + audB.length + ' opted-in member(s) buy ' + M.CATEGORIES[batch.p.category].label.toLowerCase() + '.',
        estimate: 'About ' + Math.ceil(audB.length / 4) * 2 + ' more pre-orders, so the farm harvests to real demand' });
    }
    var close = optedIn(members).filter(closeToTier).sort(function (a, b) { return a.s.toNext - b.s.toNext; });
    if (close.length) {
      var nextT = close[0].s.next;
      out.push({ kind: 'tier', area: 'Sales', icon: TIER_ICONS[nextT.key], audience: close.filter(function (m) { return m.s.next === nextT; }), ctx: { next: nextT },
        title: close.filter(function (m) { return m.s.next === nextT; }).length + ' member(s) almost at ' + nextT.label,
        why: 'Within ' + close[0].s.toNext + '–' + close[close.length - 1].s.toNext + ' bunches of their next tier' + (nextT.voucherCents ? ', which unlocks a ' + money(nextT.voucherCents) + ' voucher' : '') + '.',
        estimate: 'About ' + Math.max(1, Math.ceil(close.length / 3)) + ' order(s) brought forward' });
    }
    var idle = optedIn(members).filter(function (m) { return m.s.redeemable && (m.daysSinceOrder === null || m.daysSinceOrder >= 14); });
    if (idle.length) {
      var pts = idle.reduce(function (s, m) { return s + m.s.points; }, 0);
      out.push({ kind: 'points', area: 'Sales', icon: ICON_GIFT, audience: idle, ctx: {},
        title: idle.length + ' member(s) sitting on unused points',
        why: pts + ' points (about ' + money(Math.floor(pts / M.RULES.rewards.redeemPoints) * M.RULES.rewards.redeemValueCents) + ' in vouchers) and no order in 14+ days.',
        estimate: 'Points reminders usually bring back the most engaged members first' });
    }
    var lapsed = optedIn(members).filter(function (m) { return m.daysSinceOrder !== null && m.daysSinceOrder >= 30; });
    if (lapsed.length) out.push({ kind: 'winback', area: 'Sales', icon: ICONS.leaf, audience: lapsed, ctx: {},
      title: lapsed.length + ' member(s) haven\'t ordered in 30+ days', why: 'They bought before and opted in to messages.', estimate: 'Win-backs work best paired with what\'s fresh this week' });
    return out;
  }

  // Nudge composer: audience + per-language editable drafts → Campaign Studio (pending approval).
  function openNudgeComposer(opts) {
    document.querySelectorAll('.nudge-dialog').forEach(function (d) { if (d.open) d.close(); d.remove(); });
    var kind = opts.kind, ctx = opts.ctx || {};
    var audience = optedIn(opts.audience);
    var skipped = opts.audience.length - audience.length;
    var byLang = {};
    audience.forEach(function (m) { (byLang[nudgeLang(m.customer)] = byLang[nudgeLang(m.customer)] || []).push(m); });
    var langs = Object.keys(byLang);
    var local = true, current = langs[0], drafts = {}, edited = {};
    // Chinese runs sentences together; English and Malay separate them with a space.
    function sep(lang) { return lang === 'zh' ? '' : ' '; }
    function compose(lang) { return NUDGE_BODY[kind][lang](ctx) + (local ? sep(lang) + NUDGE_LOCAL[lang] : '') + sep(lang) + NUDGE_STOP[lang]; }
    langs.forEach(function (l) { drafts[l] = compose(l); });

    var dlg = h('dialog', { class: 'receipt-dialog reply-dialog nudge-dialog', 'aria-labelledby': 'nd-title' });
    function closeDialog() { if (dlg.open) dlg.close(); dlg.remove(); }
    var tabs = h('div', { class: 'filters', role: 'tablist', 'aria-label': 'Message language' });
    var ta = h('textarea', { rows: 7, 'aria-label': 'Message' });
    var preview = h('p', { class: 'nd-preview' });
    var counter = h('small', { class: 'pf-hint' });
    var localToggle = h('input', { type: 'checkbox', checked: true });
    function personalise(text, m) {
      var first = M.auth.can(session, 'customers.pii') ? m.customer.name.split(' ')[0] : M.maskName(m.customer.name).split(' ')[0];
      return text.replace('{first_name}', first).replace('{bunches_to_go}', String(m.s.toNext)).replace('{points}', String(m.s.points));
    }
    function draw() {
      tabs.textContent = '';
      langs.forEach(function (l) {
        append(tabs, h('button', { type: 'button', role: 'tab', class: 'chip' + (l === current ? ' active' : ''), 'aria-selected': String(l === current),
          onclick: function () { drafts[current] = ta.value; current = l; draw(); } }, NUDGE_LANGS[l] + ' ', h('span', { class: 'chip-count', text: String(byLang[l].length) })));
      });
      ta.value = drafts[current];
      drawPreview();
    }
    function drawPreview() {
      preview.textContent = personalise(ta.value, byLang[current][0]);
      counter.textContent = ta.value.length + ' characters · example for ' + customerLabel(byLang[current][0].customer.id);
    }
    ta.addEventListener('input', function () { drafts[current] = ta.value; edited[current] = true; drawPreview(); });
    localToggle.addEventListener('change', function () {
      local = localToggle.checked;
      drafts[current] = ta.value;
      langs.forEach(function (l) {
        if (!edited[l]) { drafts[l] = compose(l); return; }
        // Keep the user's edits: just add or remove the local-farming line.
        drafts[l] = local ? (drafts[l].indexOf(NUDGE_LOCAL[l]) > -1 ? drafts[l] : drafts[l].replace(NUDGE_STOP[l], NUDGE_LOCAL[l] + sep(l) + NUDGE_STOP[l])) : drafts[l].replace(sep(l) + NUDGE_LOCAL[l], '').replace(NUDGE_LOCAL[l], '');
      });
      draw();
    });
    function send() {
      drafts[current] = ta.value;
      var ids = [];
      langs.forEach(function (l) {
        var id = M.nextId('CP');
        ids.push(id);
        S().campaigns.unshift({
          id: id, kind: 'rewards-' + kind, productId: ctx.product ? ctx.product.id : null, language: l,
          title: (opts.title || NUDGE_KIND_LABEL[kind]) + (langs.length > 1 ? ' (' + NUDGE_LANGS[l] + ')' : ''),
          message: drafts[l], audience: byLang[l].map(function (m) { return m.customer.id; }), status: 'pending_approval',
          createdBy: session.email, approvedBy: null, createdAt: new Date().toISOString(), sentCount: 0
        });
      });
      closeDialog();
      commit('campaign.submitted', ids.join(','), langs.length + ' draft(s) sent to Campaign Studio for approval — ' + audience.length + ' opted-in member(s).');
    }

    var names = audience.slice(0, 6).map(function (m) { return customerLabel(m.customer.id); });
    append(dlg,
      h('button', { class: 'pd-close', type: 'button', 'aria-label': 'Close', onclick: closeDialog }, iconCircle(ICONS.x, 'bare')),
      h('div', { class: 'rd-body' },
        h('div', { class: 'rd-head' }, h('h2', { id: 'nd-title', text: opts.title || NUDGE_KIND_LABEL[kind] }), aiPill(), h('small', { class: 'ai-note', text: 'You review before it goes to approval' })),
        h('div', { class: 'rd-layout' },
          h('aside', { class: 'rd-notes' },
            h('h3', { text: 'Audience' }),
            h('p', { class: 'nd-big' }, h('strong', { text: String(audience.length) }), ' opted-in member' + (audience.length === 1 ? '' : 's')),
            h('ul', { class: 'rd-facts' }, names.map(function (n) { return h('li', { text: n }); }), audience.length > names.length ? h('li', { text: '+ ' + (audience.length - names.length) + ' more' }) : null),
            skipped ? h('small', { text: skipped + ' left out: no marketing consent.' }) : null,
            opts.why ? [h('h3', { text: 'Why now' }), h('p', { text: opts.why })] : null,
            opts.estimate ? [h('h3', { text: 'Rough estimate' }), h('p', { text: opts.estimate })] : null,
            h('small', { class: 'rd-disclaimer', text: 'Consent is checked again when each campaign is sent. Prototype: drafted by rules; estimates are simple assumptions, not forecasts.' })),
          h('div', { class: 'rd-form' },
            tabs,
            h('label', null, 'Message', ta),
            counter,
            h('label', { class: 'toggle nd-local' }, localToggle, h('span', { text: 'Add a line about growing Singapore\'s own food by 2035' })),
            h('div', null, h('small', { class: 'nd-preview-label', text: 'What they\'ll see' }), preview)))),
      h('div', { class: 'r-actions' },
        h('button', { class: 'btn btn-sm btn-outline', type: 'button', text: 'Cancel', onclick: closeDialog }),
        h('button', { class: 'btn btn-sm btn-forest', type: 'button', text: 'Send to Campaign Studio', disabled: !audience.length, onclick: send })));
    dlg.addEventListener('close', function () { dlg.remove(); });
    document.body.appendChild(dlg);
    if (langs.length) draw(); else append(preview, 'Nobody in this group has opted in to messages.');
    dlg.showModal();
  }

  // "Ask AI" member search: turns a plain-English request into filters, and says how it read it.
  var AI_EXAMPLES = ['Seedlings close to Sprout', 'Opted in with 100+ points', 'No order in 30 days', 'Chinese speakers who buy fungi'];
  function parseMemberQuery(q) {
    var f = {}, chips = [];
    var t = String(q || '').toLowerCase();
    M.RULES.rewards.tiers.forEach(function (tier) {
      var name = tier.label.toLowerCase();
      if (new RegExp('\\b' + name.replace(' ', '\\s') + 's?\\b').test(t) && !new RegExp('(to|reach|next)\\s+' + name).test(t)) { f.tier = tier.key; chips.push('Tier: ' + tier.label); }
    });
    if (/close|near|almost|about to|reach|to (sprout|harvester|farm friend)/.test(t)) { f.close = true; chips.push('Close to next tier'); }
    var pm = /(\d+)\s*\+?\s*(points|pts)|points?\s*(over|above|>=?|at least)\s*(\d+)/.exec(t);
    if (pm) { f.minPoints = Number(pm[1] || pm[4]); chips.push(f.minPoints + '+ points'); }
    else if (/unused points|redeem|swap/.test(t)) { f.redeemable = true; chips.push('Can swap points'); }
    var im = /(no order|not ordered|haven'?t ordered|inactive|lapsed|since)\D*(\d+)\s*days?/.exec(t);
    if (im) { f.inactiveDays = Number(im[2]); chips.push('No order in ' + f.inactiveDays + '+ days'); }
    else if (/inactive|lapsed|haven'?t ordered|no order/.test(t)) { f.inactiveDays = 30; chips.push('No order in 30+ days'); }
    if (/opted|consent|can message|marketing/.test(t)) { f.optedIn = true; chips.push('Opted in'); }
    var langMap = [['zh', /chinese|mandarin|中文|zh\b/], ['ms', /malay|melayu|\bms\b/], ['ta', /tamil/], ['en', /english/]];
    langMap.forEach(function (l) { if (l[1].test(t)) { f.lang = l[0]; chips.push('Language: ' + l[0].toUpperCase()); } });
    Object.keys(M.CATEGORIES).forEach(function (k) {
      var words = { 'asian-greens': /asian greens?|bok choy|choy|kangkong|kai lan/, lettuces: /lettuce|salad/, fungi: /fungi|mushroom/, herbs: /herb|basil|mint/, 'farm-more': /gelato|pesto|cracker/ }[k];
      if (words && words.test(t)) { f.category = k; chips.push('Buys ' + M.CATEGORIES[k].label.toLowerCase()); }
    });
    if (/voucher/.test(t)) { f.hasVoucher = true; chips.push('Has an open voucher'); }
    return { filters: f, chips: chips, understood: chips.length > 0 };
  }
  function matchMember(m, f) {
    if (f.tier && m.s.tier.key !== f.tier) return false;
    if (f.close && !closeToTier(m)) return false;
    if (f.minPoints && m.s.points < f.minPoints) return false;
    if (f.redeemable && !m.s.redeemable) return false;
    if (f.inactiveDays && (m.daysSinceOrder === null || m.daysSinceOrder < f.inactiveDays)) return false;
    if (f.optedIn && !m.customer.consentMarketing) return false;
    if (f.lang && (m.customer.language || 'en') !== f.lang) return false;
    if (f.category && !(m.categories[f.category] > 0)) return false;
    if (f.hasVoucher && !M.rewards.vouchers(m.customer.id).some(M.rewards.usable)) return false;
    return true;
  }

  function rewardsAdminView(root) {
    var R = M.RULES.rewards;
    var members = M.rewards.members();
    var unclaimed = members.reduce(function (s, m) { return s + m.s.points; }, 0);
    var vouchers = S().rewardsStore.vouchers;
    var openV = vouchers.filter(M.rewards.usable), usedV = vouchers.filter(function (v) { return v.status === 'used'; });
    var liability = Math.floor(unclaimed / R.redeemPoints) * R.redeemValueCents + openV.reduce(function (s, v) { return s + v.valueCents; }, 0);
    var antiWasteOrders = S().orders.filter(function (o) { return o.status !== 'cancelled' && o.items.some(function (i) { return i.clearanceListingId || i.preorderBatchId; }); }).length;

    append(root, h('div', { class: 'kpis' },
      kpi('Members', String(members.length), optedIn(members).length + ' opted in to messages'),
      kpi('Unclaimed points', String(unclaimed), 'Up to ' + money(liability) + ' in vouchers'),
      kpi('Vouchers', String(openV.length) + ' open', usedV.length + ' used · ' + money(usedV.reduce(function (s, v) { return s + v.valueCents; }, 0)) + ' redeemed'),
      kpi('Anti-waste orders', String(antiWasteOrders), 'Buy to Clear or pre-order · ' + R.antiWasteMultiplier + '× points')));

    /* ---- 1. AI ops brief ---- */
    var insights = rewardsInsights(members);
    append(root, h('section', { class: 'panel' },
      aiTitle('AI ops brief'),
      h('p', { class: 'hint', text: 'What to do with rewards this week, linking what members buy with what the farm needs to sell. Each one opens a draft for you to check.' }),
      insights.length ? h('div', { class: 'ops-brief aligned', style: '--rows:5' }, insights.map(function (x, i) {
        return h('article', { class: 'ops-card' + (x.area === 'Farm ops' ? ' farm' : '') },
          h('div', { class: 'ops-card-head' }, iconCircle(x.icon, 'soft'), h('span', { class: 'badge ' + (x.area === 'Farm ops' ? 'b-green' : 'b-amber'), text: (i + 1) + ' · ' + x.area })),
          h('strong', { class: 'ops-title', text: x.title }),
          h('p', { text: x.why }),
          h('small', { class: 'ops-est', text: x.estimate }),
          h('div', { class: 'ops-foot' },
            h('small', { text: x.audience.length + ' member' + (x.audience.length === 1 ? '' : 's') }),
            h('button', { class: 'btn btn-sm btn-forest', type: 'button', text: 'Review draft', onclick: function () { openNudgeComposer(x); } })));
      })) : h('p', { class: 'empty', text: 'Nothing needs a nudge right now.' })));

    /* ---- 2. Members: AI search, tier chips, sort, pages ---- */
    var st = rewardsAdminView.state || (rewardsAdminView.state = { q: '', parsed: null, tier: 'all', sort: 'bunches', page: 0 });
    var PAGE = 20;
    var counts = { all: members.length };
    R.tiers.forEach(function (t) { counts[t.key] = members.filter(function (m) { return m.s.tier === t; }).length; });

    var ask = h('input', { type: 'search', class: 'user-search ai-ask', placeholder: 'Ask AI — e.g. "Seedlings close to Sprout"', 'aria-label': 'Ask AI to find members', value: st.q });
    var askForm = h('form', { class: 'ai-ask-form' }, iconCircle(ICONS.search, 'bare'), ask, h('button', { class: 'btn btn-sm btn-forest', type: 'submit', text: 'Ask' }));
    askForm.addEventListener('submit', function (e) { e.preventDefault(); st.q = ask.value.trim(); st.parsed = st.q ? parseMemberQuery(st.q) : null; st.page = 0; drawMembers(); });
    var examples = h('div', { class: 'ai-examples' }, h('small', { text: 'Try:' }), AI_EXAMPLES.map(function (ex) {
      return h('button', { type: 'button', class: 'chip', text: ex, onclick: function () { ask.value = ex; st.q = ex; st.parsed = parseMemberQuery(ex); st.page = 0; drawMembers(); } });
    }));
    var tierChips = h('div', { class: 'filters', role: 'toolbar', 'aria-label': 'Filter by tier' });
    var sortSel = h('select', { 'aria-label': 'Sort members', onchange: function (e) { st.sort = e.target.value; st.page = 0; drawMembers(); } },
      [['bunches', 'Most bunches'], ['points', 'Most points'], ['close', 'Closest to next tier'], ['recent', 'Ordered most recently'], ['idle', 'Longest since last order']]
        .map(function (o) { return h('option', { value: o[0], text: o[1], selected: st.sort === o[0] }); }));
    var understood = h('div', { class: 'ai-read', 'aria-live': 'polite' });
    var list = h('div');
    var pager = h('div', { class: 'pager' });

    function filtered() {
      var f = st.parsed && st.parsed.understood ? st.parsed.filters : {};
      var rows = members.filter(function (m) { return (st.tier === 'all' || m.s.tier.key === st.tier) && matchMember(m, f); });
      var by = {
        bunches: function (a, b) { return b.s.bunches - a.s.bunches; },
        points: function (a, b) { return b.s.points - a.s.points; },
        close: function (a, b) { return (a.s.next ? a.s.toNext : 1e9) - (b.s.next ? b.s.toNext : 1e9); },
        recent: function (a, b) { return (a.daysSinceOrder === null ? 1e9 : a.daysSinceOrder) - (b.daysSinceOrder === null ? 1e9 : b.daysSinceOrder); },
        idle: function (a, b) { return (b.daysSinceOrder === null ? -1 : b.daysSinceOrder) - (a.daysSinceOrder === null ? -1 : a.daysSinceOrder); }
      }[st.sort];
      return rows.sort(by);
    }
    function drawMembers() {
      tierChips.textContent = '';
      [['all', 'All tiers']].concat(R.tiers.map(function (t) { return [t.key, t.label]; })).forEach(function (t) {
        append(tierChips, h('button', { type: 'button', class: 'chip' + (st.tier === t[0] ? ' active' : ''), 'aria-pressed': String(st.tier === t[0]),
          onclick: function () { st.tier = t[0]; st.page = 0; drawMembers(); } }, t[1] + ' ', h('span', { class: 'chip-count', text: String(counts[t[0]]) })));
      });
      var rows = filtered();
      var reach = optedIn(rows);
      understood.textContent = '';
      if (st.parsed) {
        append(understood, st.parsed.understood
          ? [h('small', { text: 'AI read this as:' }), st.parsed.chips.map(function (c) { return h('span', { class: 'mini-chip', text: c }); })]
          : h('small', { text: 'Couldn\'t match that to member filters — try one of the examples.' }),
          h('button', { type: 'button', class: 'mini', text: 'Clear', onclick: function () { st.q = ''; st.parsed = null; ask.value = ''; st.page = 0; drawMembers(); } }));
      }
      var pages = Math.max(1, Math.ceil(rows.length / PAGE));
      if (st.page >= pages) st.page = pages - 1;
      var slice = rows.slice(st.page * PAGE, st.page * PAGE + PAGE);
      list.textContent = '';
      append(list, table([
        { label: 'Customer', render: function (m) { return h('span', null, customerLabel(m.customer.id), h('br'), h('small', { text: (m.customer.language || 'en').toUpperCase() + (m.customer.consentMarketing ? ' · opted in' : ' · no consent') })); } },
        { label: 'Tier', render: function (m) { return h('span', { class: 'rw-tier-cell' }, iconCircle(TIER_ICONS[m.s.tier.key], 'soft'), m.s.tier.label); } },
        { label: 'Bunches · 12 mo', num: true, render: function (m) { return String(m.s.bunches); } },
        { label: 'Next tier', render: function (m) { return m.s.next ? m.s.toNext + ' to ' + m.s.next.label : '—'; } },
        { label: 'Points', num: true, render: function (m) { return String(m.s.points) + (m.s.pending ? ' (+' + m.s.pending + ')' : ''); } },
        { label: 'Last order', render: function (m) { return m.daysSinceOrder === null ? '—' : m.daysSinceOrder === 0 ? 'Today' : m.daysSinceOrder + ' d ago'; } }
      ], slice, 'No members match — clear the search or pick another tier.', { paginate: false }));
      pager.textContent = '';
      append(pager,
        h('small', { text: rows.length ? (st.page * PAGE + 1) + '–' + (st.page * PAGE + slice.length) + ' of ' + rows.length + ' member' + (rows.length === 1 ? '' : 's') : '0 members' }),
        h('div', { class: 'actions' },
          mini('← Prev', function () { st.page--; drawMembers(); }, { disabled: st.page === 0 }),
          mini('Next →', function () { st.page++; drawMembers(); }, { disabled: st.page >= pages - 1 }),
          h('button', { class: 'btn btn-sm btn-forest', type: 'button', disabled: !reach.length, text: '✨ Nudge these ' + reach.length,
            onclick: function () {
              var f = st.parsed && st.parsed.understood ? st.parsed.filters : {};
              var kind = f.close ? 'tier' : f.inactiveDays ? 'winback' : (f.minPoints || f.redeemable) ? 'points' : 'general';
              var next = kind === 'tier' ? (reach.filter(function (m) { return m.s.next; })[0] || {}).s : null;
              if (kind === 'tier' && !next) kind = 'general';
              openNudgeComposer({ kind: kind, ctx: kind === 'tier' ? { next: next.next } : {}, audience: rows, title: NUDGE_KIND_LABEL[kind] + (st.q ? ': ' + st.q : ''),
                why: 'Members matching your search' + (st.tier !== 'all' ? ' in ' + st.tier : '') + '.', estimate: null });
            } })));
    }
    drawMembers();
    append(root, h('section', { class: 'panel' },
      aiTitle('Members'),
      h('p', { class: 'hint', text: 'Ask in plain English, or filter by tier. Shows 20 at a time — in production the search runs on the server across every member.' }),
      askForm, examples, understood,
      h('div', { class: 'user-toolbar members-toolbar' }, tierChips, sortSel),
      list, pager));
  }

  function groupBuyAdminView(root) {
    var entries = M.ledger();
    function eventStats(ev) {
      var es = entries.filter(function (e) { return e.eventId === ev.id; });
      return {
        orders: es.length,
        base: es.reduce(function (s, e) { return s + e.baseCents; }, 0),
        payable: es.reduce(function (s, e) { return s + e.payableCents; }, 0)
      };
    }
    var canManage = M.auth.can(session, 'groupbuy.manage');

    append(root, h('p', { class: 'callout', text: 'Example rules, waiting for MEOD to confirm: commission = ' + (M.RULES.commissionRate * 100) +
      '% of net merchandise (subtotal minus group discount, delivery not included). It counts once an order is paid. A refund takes the same amount back. Example: S$60 − S$3 discount = S$57 base → S$2.85.' }));

    append(root, panel('Group-buy events', null,
      table([
        { label: 'Event', render: function (ev) { return h('span', null, h('strong', { text: ev.title }), h('br'), h('small', { text: ev.terms })); } },
        { label: 'Leader', render: function (ev) { var l = M.byId('leaders', ev.leaderId); return l ? l.name + ' · ' + l.area : '—'; } },
        { label: 'Code', render: function (ev) { return h('span', { class: 'code-box', text: ev.code }); } },
        { label: 'Ends', render: function (ev) { return date(ev.endsAt); } },
        { label: 'Orders', num: true, render: function (ev) { return String(eventStats(ev).orders); } },
        { label: 'Eligible base', num: true, render: function (ev) { return money(eventStats(ev).base); } },
        { label: 'Commission', num: true, render: function (ev) { return money(eventStats(ev).payable); } },
        { label: 'Status', render: function (ev) { return statusBadge(ev.status); } },
        { label: '', render: function (ev) {
          if (!canManage) return '';
          return mini(ev.status === 'open' ? 'Close' : 'Reopen', function () {
            ev.status = ev.status === 'open' ? 'closed' : 'open';
            commit('groupbuy.' + ev.status, ev.code, ev.code + ' ' + ev.status + '.');
          });
        } }
      ], S().events)));

    append(root, milestonePanel());

    if (canManage) {
      var f = h('form', { class: 'form-grid', novalidate: true },
        h('label', null, 'Title', h('input', { name: 'title', required: true, maxlength: 60 })),
        h('label', null, 'Leader', h('select', { name: 'leader' }, S().leaders.filter(function (l) { return l.kind !== 'visit'; }).map(function (l) { return h('option', { value: l.id, text: l.name + ' (' + l.area + ')' }); }))),
        h('label', null, 'Code', h('input', { name: 'code', required: true, maxlength: 24, placeholder: 'e.g. TAMPINES-GREENS' })),
        h('label', null, 'Ends on', h('input', { name: 'ends', type: 'date', required: true, min: new Date().toISOString().slice(0, 10) })),
        h('label', { style: 'grid-column:1/-1' }, 'Pickup / terms', h('input', { name: 'terms', maxlength: 140 })),
        h('div', null, h('button', { class: 'btn btn-sm btn-forest', type: 'submit', text: 'Create event' })));
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var code = f.code.value.trim().toUpperCase();
        if (!f.title.value.trim() || !/^[A-Z0-9-]{4,24}$/.test(code) || !f.ends.value) { toast('Fill in a title, a 4–24 character code (letters, numbers, dashes) and an end date.'); return; }
        if (S().events.some(function (ev) { return ev.code === code; })) { toast('That code is already used.'); return; }
        var id = M.nextId('G');
        S().events.push({ id: id, leaderId: f.leader.value, title: f.title.value.trim(), code: code, endsAt: new Date(f.ends.value).toISOString(), terms: f.terms.value.trim() || '—', status: 'open' });
        commit('groupbuy.created', code, 'Group buy ' + code + ' created.');
      });
      append(root, panel('New group buy', 'Leaders see their own events only.', f));
    }

    append(root, leaderFinderPanel());

    append(root, panel('Commission ledger', 'Worked out from the order records each time, so the numbers always match.',
      ledgerTable(entries, true)));
  }

  /* ---- Group-buy milestones: a volume goal that unlocks a voucher for everyone who ordered ----
   * Suggested only when the extra margin from the goal covers the vouchers. The goal is
   * drafted as a campaign, so a different admin approves it; vouchers are issued by a person
   * once the goal is reached. */
  function milestoneBar(pr) {
    var bar = h('span', { class: 'po-bar grow' }, h('span', { class: 'po-fill' + (pr.pct >= 100 ? ' full' : '') }));
    bar.firstChild.style.width = pr.pct + '%';
    return bar;
  }
  var MILESTONE_STATUS = { active: ['On the way', 'blue'], reached: ['Goal reached', 'green'], rewarded: ['Vouchers issued', 'green'], missed: ['Missed', 'grey'] };
  function milestonePanel() {
    var events = S().events.filter(function (ev) { return ev.kind !== 'visit' && (ev.status === 'open' || ev.milestone); });
    var canReward = M.auth.can(session, 'campaigns.approve');
    return panel(aiTitle('Group-buy goals'), 'A goal about ' + Math.round(M.RULES.promo.milestoneLift * 100) + '% above a group\'s usual ' + M.RULES.promo.milestoneDays + '-day volume. If they reach it, everyone who ordered gets a ' + money(M.RULES.promo.milestoneVoucherCents) + ' voucher. More orders arrive on the same drop-off, so Tyllage only suggests a goal when the extra margin covers the vouchers.',
      table([
        { label: 'Group buy', render: function (ev) { return h('span', null, h('strong', { text: ev.title }), h('br'), h('span', { class: 'code-box', text: ev.code })); } },
        { label: 'Goal', render: function (ev) {
          var pr = M.promo.milestoneProgress(ev);
          if (pr) return h('div', { class: 'po-cell' }, h('small', { text: pr.units + ' of ' + pr.target + ' items · ends ' + shortDate(pr.endsAt) }), milestoneBar(pr));
          var m = M.promo.milestoneIdea(ev);
          return h('span', null, h('strong', { text: m.target + ' items in ' + m.days + ' days' }), h('br'), h('small', { text: 'Usually about ' + m.baseline }));
        } },
        { label: 'Worth it?', render: function (ev) {
          if (ev.milestone) { var s = MILESTONE_STATUS[M.promo.milestoneProgress(ev).status]; return h('span', { class: 'ptype' }, badge(s[0], s[1])); }
          var m = M.promo.milestoneIdea(ev);
          return h('span', { class: 'ptype' }, m.worth ? badge('Worth it', 'green') : badge('Not worth it', 'grey'), h('br'),
            h('small', { text: 'About ' + money(m.extraMarginCents) + ' extra margin vs ' + money(m.rewardCostCents) + ' in vouchers (' + m.expectBuyers + ' × ' + money(m.voucherCents) + ')' }));
        } },
        { label: 'Actions', render: function (ev) {
          var pr = M.promo.milestoneProgress(ev);
          if (pr && pr.status === 'reached') {
            return canReward ? mini('Issue ' + pr.buyers.length + ' voucher(s)', function () {
              var r = M.promo.milestoneReward(ev.id);
              if (!r.ok) { toast(r.error); return; }
              commit('groupbuy.milestone', ev.code, r.count + ' voucher(s) of ' + money(pr.voucherCents) + ' issued to ' + ev.title + ' members.');
            }) : h('small', { text: 'Waiting for admin' });
          }
          if (pr && pr.status === 'active') return h('small', { text: 'Members see progress in their portal' });
          if (milestoneDrafted(ev)) return h('a', { class: 'mini', href: '#campaigns', text: 'Waiting for approval' });
          if (ev.status !== 'open') return '—';
          var m = M.promo.milestoneIdea(ev);
          return mini('Draft goal', function () { milestoneDraft(m); }, { disabled: !m.worth, title: m.worth ? null : 'The vouchers would cost more than the extra margin' });
        } }
      ], events, 'No open group buys.'));
  }
  function milestoneNotice(ev) {
    var pr = M.promo.milestoneProgress(ev);
    if (!pr || pr.status === 'missed') return null;
    var text = pr.status === 'rewarded' ? 'Goal reached. Everyone who ordered got a ' + money(pr.voucherCents) + ' voucher.'
      : pr.status === 'reached' ? 'Goal reached! MEOD is adding a ' + money(pr.voucherCents) + ' voucher for everyone who ordered.'
      : (pr.target - pr.units) + ' more items by ' + shortDate(pr.endsAt) + ' and everyone who ordered gets a ' + money(pr.voucherCents) + ' voucher.';
    return h('section', { class: 'panel gb-goal' },
      h('div', { class: 'gb-goal-head' }, h('strong', { text: 'Group goal: ' + pr.units + ' of ' + pr.target + ' items' }), badge(MILESTONE_STATUS[pr.status][0], MILESTONE_STATUS[pr.status][1])),
      milestoneBar(pr), h('small', { text: text }));
  }

  // Learning-journey vouchers: recent visits with opted-in visitors, and how past ones did.
  function visitVoucherPanel() {
    var ideas = M.promo.visitIdeas();
    var done = S().campaigns.filter(function (c) { return c.kind === 'visit-voucher'; });
    var rows = ideas.map(function (x) { return { idea: x, booking: x.booking }; })
      .concat(done.map(function (c) { return { campaign: c, booking: M.byId('bookings', c.bookingId) }; }).filter(function (r) { return r.booking; }));
    return panel(aiTitle('Learning-journey vouchers'), 'A ' + money(M.RULES.promo.visitVoucherCents) + ' thank-you voucher for visitors who opted in to updates, usable on full-price produce. It connects the visit to the farm shop. Drafted to Campaign Studio for approval; vouchers are added to accounts when it\'s sent.',
      table([
        { label: 'Visit', render: function (r) { return h('span', null, h('strong', { text: r.booking.org || r.booking.name }), h('br'), h('small', { text: shortWeekday(M.clearance.parseDayKey(r.booking.date).toISOString()) })); } },
        { label: 'Opted in', num: true, render: function (r) { return String(r.idea ? r.idea.audience.length : r.campaign.audience.length); } },
        { label: 'Status', render: function (r) { return r.idea ? badge('Suggested', 'blue') : statusBadge(r.campaign.status); } },
        { label: 'Result', render: function (r) { return r.campaign ? resultCell(r.campaign) : '—'; } },
        { label: 'Actions', render: function (r) { return r.idea ? mini('Draft voucher', function () { visitVoucherDraft(r.idea); }) : h('a', { class: 'mini', href: '#campaigns', text: 'Campaign Studio' }); } }
      ], rows, 'No recent visits with visitors who opted in.'));
  }

  /* ---- Group-leader finder: neighbourhoods with regular buyers but no leader ---- */
  function openLeaderInvite(a) {
    document.querySelectorAll('.lf-dialog').forEach(function (d) { if (d.open) d.close(); d.remove(); });
    var c = a.candidate.customer;
    var first = M.auth.can(session, 'customers.pii') ? c.name.replace(/\s*\(demo\)/i, '').split(' ')[0] : 'there';
    var channel = h('select', { 'aria-label': 'Channel' }, h('option', { value: 'whatsapp', text: 'WhatsApp' }), h('option', { value: 'email', text: 'Email' }));
    var body = h('textarea', { rows: 10, 'aria-label': 'Message' });
    body.value = 'Hi ' + first + ' 🌱\n\nThank you for being a regular MEOD Fresh customer! ' + (a.active - 1) + ' other neighbours in ' + a.area + ' order from us too, and we\'d love to start a ' + a.area + ' group buy — would you like to lead it?\n\n' +
      'How it works: you share a group code, neighbours get ' + Math.round(M.RULES.groupDiscountRate * 100) + '% off, and you earn ' + Math.round(M.RULES.commissionRate * 100) + '% commission on the group\'s orders. We deliver everything to one pickup point near you.\n\n' +
      'Reply YES and we\'ll call you to set it up, or reply with any questions.\n\n— The MEOD Farm team';
    var dlg = h('dialog', { class: 'receipt-dialog reply-dialog lf-dialog', 'aria-labelledby': 'lf-title' });
    function closeDialog() { if (dlg.open) dlg.close(); dlg.remove(); }
    append(dlg,
      h('button', { class: 'pd-close', type: 'button', 'aria-label': 'Close', onclick: closeDialog }, iconCircle(ICONS.x, 'bare')),
      h('div', { class: 'rd-body' },
        h('div', { class: 'rd-head' }, h('h2', { id: 'lf-title', text: 'Invite a ' + a.area + ' group leader' }), aiPill(), h('small', { class: 'ai-note', text: 'You review and send' })),
        h('div', { class: 'rd-form' },
          h('div', { class: 'rd-controls' }, h('label', null, 'Send by', channel), h('label', null, 'To', h('input', { value: customerLabel(c.id), readonly: true }))),
          h('label', null, 'Message', body))),
      h('div', { class: 'r-actions' },
        h('button', { class: 'btn btn-sm btn-outline', type: 'button', text: 'Cancel', onclick: closeDialog }),
        h('button', { class: 'btn btn-sm btn-forest', type: 'button', text: 'Send (simulated)', onclick: function () {
          var r = M.leaderFinder.invite(c.id, a.area, channel.value, session.email);
          if (!r.ok) { toast(r.error); return; }
          closeDialog();
          commit('groupbuy.invited', c.id, 'Leader invite sent to ' + customerLabel(c.id) + ' for ' + a.area + ' (simulated).');
        } })));
    dlg.addEventListener('close', function () { dlg.remove(); });
    document.body.appendChild(dlg);
    dlg.showModal();
  }
  function leaderFinderPanel() {
    var areas = M.leaderFinder.areas();
    var suggest = areas.filter(function (a) { return a.suggest; });
    var others = areas.filter(function (a) { return !a.suggest; });
    return panel(aiTitle('Find new group-buy leaders'), 'Neighbourhoods with 3+ active customers but no group-buy leader, and the regular who\'d likely make a good one. Only customers who opted in to messages are suggested. Areas come from the delivery postal district.',
      suggest.length ? h('div', { class: 'ops-brief aligned', style: '--rows:6' }, suggest.map(function (a) {
        var x = a.candidate;
        return h('article', { class: 'ops-card farm' },
          h('div', { class: 'ops-card-head' }, iconCircle(ICONS.pin, 'soft'), badge(a.active + ' active customers', 'green')),
          h('strong', { class: 'ops-title', text: a.area + ' has no group buy yet' }),
          h('p', { text: a.active + ' customers ordered in the last 60 days (' + money(a.recentCents) + '). A group buy saves them ' + money(a.estimate.memberSavingCents) + ' a month on delivery-day orders, with one drop-off instead of ' + a.active + '.' }),
          h('div', { class: 'lf-cand' },
            h('small', { text: 'Suggested leader' }),
            h('strong', { text: customerLabel(x.customer.id) }),
            h('small', { text: x.why.join(' · ') })),
          h('small', { class: 'ops-est', text: 'Rough estimate: about ' + money(a.estimate.monthlyCents) + ' a month through the group, ' + money(a.estimate.commissionCents) + ' commission for the leader.' }),
          h('div', { class: 'ops-foot' },
            h('small', { text: LANG_LABEL[x.customer.language] || 'English' }),
            a.invite ? h('small', { class: 'pending-note', text: 'Invited ' + ago(a.invite.at) })
              : h('button', { class: 'btn btn-sm btn-forest', type: 'button', text: 'Draft invite', onclick: function () { openLeaderInvite(a); } })));
      })) : h('p', { class: 'empty', text: 'Every area with 3+ active customers already has a leader.' }),
      others.length ? h('ul', { class: 'lf-areas' }, others.map(function (a) {
        var note = a.covered ? 'Leader: ' + a.covered.leader.name + (a.covered.open ? '' : ' (no open group buy)') : a.active < 3 ? 'Only ' + a.active + ' active — not enough yet' : 'No opted-in regular to suggest';
        return h('li', null, h('strong', { text: a.area }), h('small', { text: a.customers.length + ' customer(s) · ' + a.active + ' active' }), h('small', { class: 'lf-note', text: note }));
      })) : null);
  }

  function ledgerTable(entries, showLeader) {
    var cols = [
      { label: 'Order', render: function (e) { return e.ref; } },
      { label: 'Event', render: function (e) { return h('span', { class: 'code-box', text: M.byId('events', e.eventId).code }); } }
    ];
    if (showLeader) cols.push({ label: 'Leader', render: function (e) { return M.byId('leaders', e.leaderId).name; } });
    cols.push(
      { label: 'Eligible base', num: true, render: function (e) { return money(e.baseCents); } },
      { label: 'Rate', num: true, render: function (e) { return (e.rate * 100).toFixed(1) + '%'; } },
      { label: 'Commission', num: true, render: function (e) { return money(e.amountCents); } },
      { label: 'Adjustment', num: true, render: function (e) { return e.adjustmentCents ? money(e.adjustmentCents) : '—'; } },
      { label: 'Payable', num: true, render: function (e) { return h('strong', { text: money(e.payableCents) }); } },
      { label: 'Status', render: function (e) { return statusBadge(e.status); } });
    return table(cols, entries, 'No group orders yet.');
  }

  var LANG_LABEL = { en: 'English', zh: '中文', ms: 'Bahasa Melayu', ta: 'தமிழ் Tamil' };

  function customersView(root) {
    var pii = M.auth.can(session, 'customers.pii');
    var all = S().customers;
    var state = customersView.state || (customersView.state = { filter: 'all', q: '' });
    var ordersOf = function (c) { return S().orders.filter(function (o) { return o.customerId === c.id; }); };
    var spendOf = function (c) {
      return ordersOf(c).filter(function (o) { return o.status !== 'cancelled'; })
        .reduce(function (s, o) { return s + o.totalCents - (o.refundedCents || 0); }, 0);
    };
    var totalSpend = all.reduce(function (s, c) { return s + spendOf(c); }, 0);
    var optedIn = all.filter(function (c) { return c.consentMarketing; }).length;
    var personalised = all.filter(function (c) { return c.consentPersonalisation; }).length;

    append(root, h('div', { class: 'kpis' },
      kpi('Customers', String(all.length), all.filter(function (c) { return c.groupCode; }).length + ' in a group buy'),
      kpi('Promotions opted in', Math.round(optedIn / (all.length || 1) * 100) + '%', optedIn + ' of ' + all.length + ' customers'),
      kpi('Personalised picks', String(personalised), (all.length - personalised) + ' turned off'),
      kpi('Total spend', money(totalSpend), 'Avg ' + money(Math.round(totalSpend / (all.length || 1))) + ' per customer')));

    var FILTERS = [
      ['all', 'All', function () { return true; }],
      ['promo', 'Promotions on', function (c) { return c.consentMarketing; }],
      ['noconsent', 'No consent', function (c) { return !c.consentMarketing; }],
      ['nopersonal', 'Personalisation off', function (c) { return !c.consentPersonalisation; }],
      ['group', 'In a group buy', function (c) { return Boolean(c.groupCode); }]
    ];
    var chips = h('div', { class: 'filters', role: 'toolbar', 'aria-label': 'Filter customers' });
    var search = h('input', { type: 'search', class: 'user-search', placeholder: pii ? 'Search name, ID or phone' : 'Search ID', 'aria-label': 'Search customers', value: state.q });
    var list = h('div');

    function drawChips() {
      chips.textContent = '';
      FILTERS.forEach(function (f) {
        append(chips, h('button', { type: 'button', class: 'chip' + (state.filter === f[0] ? ' active' : ''), 'aria-pressed': String(state.filter === f[0]),
          onclick: function () { state.filter = f[0]; drawChips(); drawList(); } }, f[1] + ' ', h('span', { class: 'chip-count', text: String(all.filter(f[2]).length) })));
      });
    }

    function drawList() {
      var test = FILTERS.filter(function (f) { return f[0] === state.filter; })[0][2];
      var q = state.q.toLowerCase();
      var rows = all.filter(function (c) {
        if (!test(c)) return false;
        if (!q) return true;
        // Staff can only search by ID, so masked fields can't be probed.
        var hay = pii ? [c.id, c.name, c.phone].join(' ') : c.id;
        return hay.toLowerCase().indexOf(q) > -1;
      });
      list.textContent = '';
      append(list, table([
        { label: 'Customer', render: function (c) {
          return h('div', { class: 'user-cell' },
            h('span', { class: 'avatar av-customer', 'aria-hidden': 'true', text: initials(c.name) }),
            h('span', null, h('strong', { text: pii ? c.name : M.maskName(c.name) }), h('small', { text: c.id + ' · ' + (pii ? c.phone : M.maskPhone(c.phone)) })));
        } },
        { label: 'Language', render: function (c) { return h('span', { class: 'lang-tag', text: LANG_LABEL[c.language] || c.language }); } },
        { label: 'Consent', render: function (c) {
          return h('span', { class: 'consent-stack' },
            h('span', { class: 'status-dot ' + (c.consentMarketing ? 'on' : 'off'), text: 'Promotions' }),
            h('span', { class: 'status-dot ' + (c.consentPersonalisation ? 'on' : 'off'), text: 'Personalised' }));
        } },
        { label: 'Group buy', render: function (c) { return c.groupCode ? h('span', { class: 'code-box', text: c.groupCode }) : '—'; } },
        { label: 'Orders', render: function (c) {
          var os = ordersOf(c);
          var last = os.slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); })[0];
          return h('span', { class: 'when' }, h('strong', { text: os.length + (os.length === 1 ? ' order' : ' orders') }), h('small', { text: last ? 'Last ' + ago(last.createdAt) : 'No orders yet' }));
        } },
        { label: 'Spend', num: true, render: function (c) { return h('strong', { class: 'spend', text: money(spendOf(c)) }); } }
      ], rows, 'No customers match that.'));
    }

    search.addEventListener('input', function () { state.q = search.value.trim(); drawList(); });
    drawChips();
    drawList();

    append(root, h('section', { class: 'panel' },
      h('div', { class: 'user-toolbar' }, chips, search),
      list,
      h('p', { class: 'form-note', style: 'margin-top:12px', text: pii
        ? 'Admin view with full details. Only export what a task actually needs.'
        : 'Names and phone numbers are masked for sales staff. Use the customer ID to follow up.' })));
  }

  var ROLE_META = {
    admin: { label: 'Admin', tone: 'red' },
    staff: { label: 'Sales staff', tone: 'blue' },
    worker: { label: 'Farm worker', tone: 'green' },
    leader: { label: 'Group leader', tone: 'amber' },
    customer: { label: 'Customer', tone: 'green' }
  };

  function initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0].toUpperCase(); }).join('');
  }

  function lastSignIn(email) {
    var hit = S().audit.filter(function (a) { return a.actor === email && a.event === 'auth.sign_in'; })[0];
    return hit ? ago(hit.at) : 'Never';
  }

  function linkedTo(u) {
    if (u.leaderId) { var l = M.byId('leaders', u.leaderId); return l ? l.name + ' · ' + l.area : u.leaderId; }
    if (u.customerId) { var c = customer(u.customerId); return c ? c.name + ' (' + c.id + ')' : u.customerId; }
    return 'MEOD team';
  }

  function usersView(root) {
    var users = S().users;
    var count = function (role) { return users.filter(function (u) { return u.role === role; }).length; };
    var state = usersView.state || (usersView.state = { role: 'all', q: '' });

    append(root, h('div', { class: 'kpis' },
      kpi('Total users', String(users.length), users.filter(function (u) { return u.disabled; }).length + ' disabled'),
      kpi('MEOD team', String(count('admin') + count('staff')), count('admin') + ' admin · ' + count('staff') + ' staff'),
      kpi('Group leaders', String(count('leader'))),
      kpi('Customers', String(count('customer')))));

    var list = h('div');
    var chips = h('div', { class: 'filters', role: 'toolbar', 'aria-label': 'Filter by role' });
    var search = h('input', { type: 'search', class: 'user-search', placeholder: 'Search name or email', 'aria-label': 'Search users', value: state.q });

    function drawChips() {
      chips.textContent = '';
      [['all', 'All', users.length]].concat(Object.keys(ROLE_META).map(function (r) { return [r, ROLE_META[r].label, count(r)]; }))
        .forEach(function (c) {
          append(chips, h('button', { type: 'button', class: 'chip' + (state.role === c[0] ? ' active' : ''), 'aria-pressed': String(state.role === c[0]),
            onclick: function () { state.role = c[0]; drawChips(); drawList(); } }, c[1] + ' ', h('span', { class: 'chip-count', text: String(c[2]) })));
        });
    }

    function drawList() {
      var q = state.q.toLowerCase();
      var rows = users.filter(function (u) {
        return (state.role === 'all' || u.role === state.role) &&
          (!q || (u.name + ' ' + u.email).toLowerCase().indexOf(q) > -1);
      });
      list.textContent = '';
      append(list, table([
        { label: 'User', render: function (u) {
          return h('div', { class: 'user-cell' },
            h('span', { class: 'avatar av-' + u.role, 'aria-hidden': 'true', text: initials(u.name) }),
            h('span', null, h('strong', { text: u.name }), u.email === session.email ? h('span', { class: 'you-tag', text: 'You' }) : null,
              h('small', { text: u.email })));
        } },
        { label: 'Role', render: function (u) { return badge(ROLE_META[u.role].label, ROLE_META[u.role].tone); } },
        { label: 'Linked to', render: linkedTo },
        { label: 'Last sign-in', render: function (u) { return lastSignIn(u.email); } },
        { label: 'Status', render: function (u) {
          return h('span', { class: 'status-dot ' + (u.disabled ? 'off' : 'on'), text: u.disabled ? 'Disabled' : 'Active' });
        } },
        { label: '', render: function (u) {
          if (u.email === session.email) return '';
          return mini(u.disabled ? 'Enable' : 'Disable', function () {
            u.disabled = !u.disabled;
            commit(u.disabled ? 'user.disabled' : 'user.enabled', u.email, u.email + (u.disabled ? ' disabled.' : ' enabled.'));
          }, { danger: !u.disabled });
        } }
      ], rows, 'No users match that.'));
    }

    search.addEventListener('input', function () { state.q = search.value.trim(); drawList(); });
    drawChips();
    drawList();

    append(root, h('section', { class: 'panel' },
      h('div', { class: 'user-toolbar' }, chips, search),
      list,
      h('p', { class: 'form-note', style: 'margin-top:12px', text: 'Disabling an account blocks its next sign-in. You can’t disable your own account.' })));

    // Permissions overview, read from the same matrix the portal enforces.
    var PERMS = [
      ['inventory', 'View stock, orders and inbox'],
      ['orders.update', 'Update order status and refunds'],
      ['campaigns', 'Draft campaigns'],
      ['campaigns.approve', 'Approve campaigns'],
      ['groupbuy.manage', 'Create and close group buys'],
      ['customers.pii', 'See full customer details'],
      ['users', 'Manage users, audit log and settings'],
      ['leader', 'Group leader dashboard'],
      ['customer', 'Shop, orders and preferences']
    ];
    var roles = Object.keys(ROLE_META);
    append(root, panel('What each role can do', null,
      table([{ label: 'Permission', render: function (p) { return p[1]; } }].concat(roles.map(function (r) {
        return { label: ROLE_META[r].label, render: function (p) {
          return M.auth.can({ role: r }, p[0]) ? h('span', { class: 'perm yes', 'aria-label': 'Yes', text: '✓' }) : h('span', { class: 'perm no', 'aria-label': 'No', text: '—' });
        } };
      })), PERMS)));
  }

  // Audit log: readable labels and categories for the raw event codes.
  var AUDIT_CATS = {
    auth: { label: 'Access', tone: 'blue' },
    order: { label: 'Orders', tone: 'green' },
    campaign: { label: 'Campaigns', tone: 'amber' },
    ticket: { label: 'Support', tone: 'red' },
    booking: { label: 'Support', tone: 'red' },
    groupbuy: { label: 'Group buys', tone: 'amber' },
    user: { label: 'Users', tone: 'red' },
    settings: { label: 'Settings', tone: 'red' },
    inventory: { label: 'Stock', tone: 'grey' },
    consent: { label: 'Privacy', tone: 'grey' },
    profile: { label: 'Privacy', tone: 'grey' },
    clearance: { label: 'Buy to Clear', tone: 'amber' },
    harvest: { label: 'Harvest', tone: 'green' },
    rewards: { label: 'Rewards', tone: 'amber' },
    b2b: { label: 'B2B', tone: 'blue' },
    rescue: { label: 'Harvest Rescue', tone: 'amber' },
    pricing: { label: 'Pricing', tone: 'amber' },
    feedback: { label: 'Feedback', tone: 'blue' },
    lost: { label: 'Lost demand', tone: 'amber' },
    quote: { label: 'Quotations', tone: 'blue' },
    import: { label: 'Import', tone: 'grey' },
    pilot: { label: 'Pilot', tone: 'green' },
    content: { label: 'Content', tone: 'green' },
    briefing: { label: 'Briefing', tone: 'green' }
  };
  var AUDIT_LABELS = {
    'auth.sign_in': 'Signed in', 'auth.sign_out': 'Signed out',
    'inspect.saved': 'Inspected a batch', 'inspect.sent': 'Sent a greenhouse round', 'inspect.approved': 'Approved a harvest estimate', 'inspect.kept': 'Kept a harvest plan', 'task.done': 'Closed a sales follow-up', 'market.price': 'Added a market price check', 'signal.tested': 'Recorded a greenhouse signal check', 'bag.proposed': 'Proposed a Surprise Bag plan', 'bag.approved': 'Approved a Surprise Bag plan', 'bag.rejected': 'Rejected a Surprise Bag plan',
    'order.created': 'Placed an order', 'order.paid': 'Marked order paid', 'order.fulfilled': 'Fulfilled order',
    'order.refunded': 'Refunded order', 'order.cancelled': 'Cancelled order',
    'campaign.submitted': 'Submitted a campaign', 'campaign.approved': 'Approved a campaign',
    'campaign.rejected': 'Rejected a campaign', 'campaign.sent': 'Sent a campaign',
    'ticket.created': 'Opened a support ticket', 'ticket.assigned': 'Took a ticket', 'ticket.resolved': 'Resolved a ticket',
    'booking.created': 'New farm-visit booking', 'booking.confirmed': 'Confirmed a booking', 'booking.declined': 'Declined a booking', 'booking.replied': 'Replied to a booking',
    'groupbuy.created': 'Created a group buy', 'groupbuy.open': 'Reopened a group buy', 'groupbuy.closed': 'Closed a group buy',
    'groupbuy.joined': 'Joined a group buy', 'groupbuy.left': 'Left a group buy',
    'user.disabled': 'Disabled a user', 'user.enabled': 'Enabled a user',
    'inventory.synced': 'Synced stock from Shopify', 'profile.language': 'Changed language', 'profile.updated': 'Updated profile', 'profile.photo': 'Changed profile photo',
    'clearance.listed': 'Listed a product for clearance', 'clearance.ended': 'Ended a clearance listing early',
    'clearance.bag_approved': 'Approved a Surprise Harvest Bag’s contents',
    'rewards.redeemed': 'Swapped points for a voucher', 'briefing.sent': 'Sent the weekly summary', 'b2b.contacted': 'Messaged a trade buyer', 'pricing.proposed': 'Proposed a price change', 'feedback.logged': 'Logged customer feedback', 'lost.logged': 'Logged an unmet request', 'lost.notify_me': 'Asked to be told when a product is back', 'lost.notified': 'Told customers a product is back', 'lost.fulfilled': 'Fulfilled an unmet request', 'lost.closed': 'Closed an unmet request', 'import.done': 'Imported a spreadsheet', 'pilot.baseline': 'Recorded a pilot baseline', 'settings.changed': 'Changed an AI assumption', 'quote.sent': 'Sent a quotation', 'quote.accepted': 'Recorded an accepted quote', 'quote.declined': 'Recorded a declined quote', 'booking.package': 'Saved a learning-journey package', 'booking.reinvite': 'Invited a past visit group back', 'review.posted': 'Posted a product review', 'groupbuy.invited': 'Invited a customer to lead a group buy', 'groupbuy.milestone': 'Issued group-goal vouchers', 'settings.reset': 'Reset AI assumptions', 'settings.cost': 'Changed a unit cost', 'content.planned': 'Planned a social post', 'content.edited': 'Edited a social post', 'content.approved': 'Approved a social post', 'content.posted': 'Marked a social post as posted', 'content.removed': 'Removed a social post', 'feedback.flagged': 'Flagged a batch for a quality check', 'feedback.apology': 'Messaged customers about an issue', 'feedback.resolved': 'Resolved a feedback issue', 'feedback.reopened': 'Reopened a feedback issue', 'pricing.approved': 'Approved a price change', 'pricing.rejected': 'Rejected a price change', 'rescue.clear': 'Listed at-risk produce on Buy to Clear', 'rescue.alert': 'Drafted a harvest rescue alert', 'rescue.process': 'Processed at-risk produce', 'rescue.donate': 'Donated at-risk produce', 'rescue.compost': 'Composted at-risk produce', 'b2b.order': 'Confirmed a trade order', 'b2b.lead': 'Updated a trade lead', 'harvest.planned': 'Planned a harvest batch', 'harvest.harvested': 'Marked a batch harvested', 'harvest.cancelled': 'Cancelled a harvest batch'
  };
  function auditCat(event) { return AUDIT_CATS[String(event).split('.')[0]] || { label: 'Other', tone: 'grey' }; }
  function auditLabel(event) {
    if (AUDIT_LABELS[event]) return AUDIT_LABELS[event];
    var m = /^consent\.(\w+)\.(granted|withdrawn)$/.exec(event);
    if (m) return (m[2] === 'granted' ? 'Opted in to ' : 'Opted out of ') + (m[1] === 'consentMarketing' ? 'promotions' : 'personalised picks');
    return event;
  }
  function actorCell(actor) {
    var u = S().users.filter(function (x) { return x.email === actor; })[0];
    var system = !u;
    return h('div', { class: 'user-cell' },
      h('span', { class: 'avatar ' + (system ? 'av-system' : 'av-' + u.role), 'aria-hidden': 'true', text: system ? (actor === 'assist-bot' ? 'AI' : 'WEB') : initials(u.name) }),
      h('span', null,
        h('strong', { text: system ? (actor === 'assist-bot' ? 'Ask MEOD bot' : 'Public website') : u.name }),
        h('small', { text: system ? 'Automated' : actor })));
  }

  function auditView(root) {
    var log = S().audit;
    var state = auditView.state || (auditView.state = { cat: 'all', q: '' });
    var today = new Date().toDateString();
    var isSystem = function (a) { return !S().users.some(function (u) { return u.email === a.actor; }); };

    append(root, h('div', { class: 'kpis' },
      kpi('Events today', String(log.filter(function (a) { return new Date(a.at).toDateString() === today; }).length), log.length + ' in total'),
      kpi('Sign-ins', String(log.filter(function (a) { return a.event === 'auth.sign_in'; }).length)),
      kpi('Changes', String(log.filter(function (a) { return !/^auth\./.test(a.event); }).length), 'Orders, campaigns, users…'),
      kpi('Bot & website', String(log.filter(isSystem).length), 'Automated actions')));

    var cats = [];
    log.forEach(function (a) { var c = auditCat(a.event).label; if (cats.indexOf(c) === -1) cats.push(c); });
    var chips = h('div', { class: 'filters', role: 'toolbar', 'aria-label': 'Filter by category' });
    var search = h('input', { type: 'search', class: 'user-search', placeholder: 'Search person, event or target', 'aria-label': 'Search audit log', value: state.q });
    var list = h('div');

    function drawChips() {
      chips.textContent = '';
      [['all', log.length]].concat(cats.map(function (c) { return [c, log.filter(function (a) { return auditCat(a.event).label === c; }).length]; }))
        .forEach(function (c) {
          append(chips, h('button', { type: 'button', class: 'chip' + (state.cat === c[0] ? ' active' : ''), 'aria-pressed': String(state.cat === c[0]),
            onclick: function () { state.cat = c[0]; drawChips(); drawList(); } }, (c[0] === 'all' ? 'All' : c[0]) + ' ', h('span', { class: 'chip-count', text: String(c[1]) })));
        });
    }

    function drawList() {
      var q = state.q.toLowerCase();
      var rows = log.filter(function (a) {
        if (state.cat !== 'all' && auditCat(a.event).label !== state.cat) return false;
        if (!q) return true;
        return [a.actor, a.event, auditLabel(a.event), a.target].join(' ').toLowerCase().indexOf(q) > -1;
      }).slice(0, 100);
      list.textContent = '';
      append(list, table([
        { label: 'When', render: function (a) {
          return h('span', { class: 'when' }, h('strong', { text: ago(a.at) }), h('small', { text: new Date(a.at).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) }));
        } },
        { label: 'Who', render: function (a) { return actorCell(a.actor); } },
        { label: 'What happened', render: function (a) {
          var c = auditCat(a.event);
          return h('span', { class: 'what' }, badge(c.label, c.tone), h('span', { text: auditLabel(a.event) }));
        } },
        { label: 'On', render: function (a) { return a.target ? h('span', { class: 'code-box', text: a.target }) : '—'; } }
      ], rows, 'No events match that.'));
    }

    search.addEventListener('input', function () { state.q = search.value.trim(); drawList(); });
    drawChips();
    drawList();

    append(root, h('section', { class: 'panel' },
      h('div', { class: 'user-toolbar' }, chips, search),
      list,
      h('p', { class: 'form-note', style: 'margin-top:12px', text: 'Newest first, last 100 events shown. In production this log is append-only and kept on the server.' })));
  }

  var SETTING_ICONS = {
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    truck: '<path d="M10 17h4V5H2v12h3"/><path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    headset: '<path d="M3 14v-2a9 9 0 0 1 18 0v2"/><path d="M21 16a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2z"/><path d="M3 16a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2z"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>'
  };
  function settingIcon(name) {
    var span = h('span', { class: 'icon-circle' });
    span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + SETTING_ICONS[name] + '</svg>';
    return span;
  }
  function settingCard(icon, label, value, note, extra) {
    return h('article', { class: 'setting-card' },
      settingIcon(icon),
      h('div', null,
        h('span', { class: 'setting-label', text: label }),
        h('strong', { class: 'setting-value', text: value }),
        h('p', { text: note }),
        extra || null));
  }

  /* ---- Editable AI assumptions (admin) ----
   * Every number the AI features rely on, with which features use it, the demo value, and
   * a live preview of what changes before it's saved. Every save is audited. */
  function aiSettingsPanel() {
    var list = M.settings.list();
    var changed = list.filter(function (d) { return d.changed; }).length;
    var groups = [];
    list.forEach(function (d) { if (groups.indexOf(d.group) < 0) groups.push(d.group); });
    function row(d) {
      var input = h('input', { type: 'number', min: d.min, max: d.max, step: d.pct ? '0.5' : '1', 'aria-label': d.label, class: 'as-input' });
      input.value = String(d.value);
      var impact = h('small', { class: 'as-impact', 'aria-live': 'polite' });
      var saveBtn = mini('Save', function () {
        var r = M.settings.save(d.key, input.value, session.email);
        if (!r.ok) { toast(r.error); return; }
        commit('settings.changed', d.key, d.label + ' changed from ' + r.from + ' to ' + r.to + ' ' + d.unit + '.');
      }, { disabled: true });
      function preview() {
        impact.textContent = '';
        impact.className = 'as-impact';
        var same = Number(input.value) === d.value;
        saveBtn.disabled = same;
        if (same) return;
        var r = M.settings.impact(d.key, input.value);
        if (!r.ok) { impact.textContent = r.error; impact.classList.add('bad'); saveBtn.disabled = true; return; }
        impact.textContent = r.lines.length ? 'If saved: ' + r.lines.join(' · ') + '.' : 'If saved: no change to this week\'s numbers.';
      }
      input.addEventListener('input', preview);
      return h('li', { class: 'as-row' + (d.changed ? ' changed' : '') },
        h('div', { class: 'as-text' },
          h('strong', { text: d.label }),
          h('small', { text: d.note }),
          h('span', { class: 'as-used' }, d.usedBy.map(function (u) { return h('span', { class: 'as-chip', text: u }); }))),
        h('div', { class: 'as-control' },
          h('label', { class: 'as-field' }, input, h('span', { text: d.unit })),
          h('small', { class: 'as-demo', text: d.changed ? 'Demo value: ' + d.demo : 'Demo value' }),
          saveBtn),
        impact);
    }
    return panel(aiTitle('AI assumptions'), 'The numbers behind Demand Radar, Harvest Rescue, Price Advisor, Margin Guard, B2B and Visits. They\'re demo values until MEOD enters its own. Type a new value to preview what changes before saving.',
      h('div', { class: 'as-groups' }, groups.map(function (g) {
        return h('section', { class: 'as-group' }, h('h3', { text: g }), h('ul', { class: 'as-list' }, list.filter(function (d) { return d.group === g; }).map(row)));
      })),
      h('div', { class: 'as-foot' },
        h('small', { class: 'hint', text: changed ? changed + ' setting(s) changed from the demo values.' : 'All settings are on their demo values.' }),
        changed ? mini('Reset to demo values', function () {
          if (!confirm('Put every AI assumption back to its demo value?')) return;
          M.settings.resetAll();
          commit('settings.reset', 'ai', 'AI assumptions reset to demo values.');
        }, { danger: true }) : null));
  }
  function unitCostPanel() {
    var prods = S().products.filter(function (p) { return !p.bagOffer; });
    var toCents = function (el) { return Math.round((parseFloat(el.value) || 0) * 100); };
    return panel('Unit costs', 'Growing, packaging and handling cost per unit. Margin Guard uses these to stop prices going below cost. Illustrative until MEOD enters real costs.', table([
      { label: 'Product', render: function (p) { return h('span', { class: 'rw-tier-cell' }, thumbMini(p), h('strong', { text: p.title })); } },
      { label: 'Price', num: true, render: function (p) { return money(p.priceCents); } },
      { label: 'Costs (S$)', render: function (p) {
        var c = M.pricing.cost(p.id);
        var mk = function (v, label) { var i = h('input', { type: 'number', min: 0, step: '0.05', class: 'uc-input', 'aria-label': label + ' cost for ' + p.title, title: label }); i.value = (v / 100).toFixed(2); return i; };
        var g = mk(c.growCents, 'Growing'), pk = mk(c.packCents, 'Packaging'), hd = mk(c.handleCents, 'Handling');
        var out = h('small', { class: 'uc-out' });
        var btn = mini('Save', function () {
          var r = M.settings.saveCost(p.id, { growCents: toCents(g), packCents: toCents(pk), handleCents: toCents(hd) });
          if (!r.ok) { toast(r.error); return; }
          commit('settings.cost', p.id, p.title + ' unit cost set to ' + money(r.cost.totalCents) + '.');
        }, { disabled: true });
        function upd() {
          var tot = toCents(g) + toCents(pk) + toCents(hd);
          var m = p.priceCents ? Math.round((p.priceCents - tot) / p.priceCents * 100) : 0;
          out.textContent = money(tot) + ' total · ' + m + '% margin at full price';
          out.className = 'uc-out' + (m < M.RULES.minMarginRate * 100 ? ' bad' : '');
          btn.disabled = tot === c.totalCents;
        }
        [g, pk, hd].forEach(function (i) { i.addEventListener('input', upd); });
        upd(); btn.disabled = true;
        return h('div', { class: 'uc-cell' },
          h('div', { class: 'uc-inputs' }, h('label', null, h('span', { text: 'Grow' }), g), h('label', null, h('span', { text: 'Pack' }), pk), h('label', null, h('span', { text: 'Handle' }), hd), btn),
          out);
      } }
    ], prods, 'No products.'));
  }

  function settingsView(root) {
    var R = M.RULES;
    var fmt = function (h24) { return (h24 % 12 || 12) + (h24 < 12 ? 'am' : 'pm'); };
    var hours = fmt(R.humanHours.start) + ' – ' + fmt(R.humanHours.end);
    var online = M.withinHumanHours();

    append(root, h('p', { class: 'callout', text: 'All values are examples until MEOD confirms them. AI assumptions and unit costs can be changed here (saved in this browser for the demo); in production they live on the server. Every change is audited.' }));
    append(root, aiSettingsPanel());
    append(root, unitCostPanel());

    var groups = [
      ['Pricing & delivery', [
        settingCard('tag', 'Group-buy discount', (R.groupDiscountRate * 100) + '%', 'Taken off the subtotal when a member checks out with a valid group code.'),
        settingCard('truck', 'Free delivery from', money(R.freeDeliveryThresholdCents), 'Orders at or above this (after discounts) ship free.'),
        settingCard('coins', 'Delivery fee', money(R.deliveryFeeCents), 'Charged on orders below the free-delivery threshold.')
      ]],
      ['Group buys', [
        settingCard('users', 'Leader commission', (R.commissionRate * 100) + '%', 'Of net merchandise (subtotal minus discount, delivery excluded). Counts once paid; refunds reverse it.')
      ]],
      ['Stock & support', [
        settingCard('clock', 'Stock goes stale after', (R.stockStaleAfterMinutes / 60) + ' hours', 'Older syncs show as “Checking stock” and can’t be ordered or confirmed by the bot.'),
        settingCard('headset', 'Human support hours · Mon–Sat (SGT)', hours, 'Outside these hours the bot tells customers the team will reply when back.',
          h('span', { class: 'status-dot ' + (online ? 'on' : 'off'), text: online ? 'Team online now' : 'Team offline now' }))
      ]]
    ];
    groups.forEach(function (g) {
      append(root, h('div', { class: 'settings-group' },
        h('h2', { class: 'settings-heading', text: g[0] }),
        h('div', { class: 'setting-grid' }, g[1])));
    });

    var counts = [
      ['Orders', S().orders.length], ['Tickets', S().tickets.length],
      ['Bookings', S().bookings.length], ['Campaigns', S().campaigns.length], ['Audit events', S().audit.length]
    ];
    append(root, h('div', { class: 'settings-group' },
      h('h2', { class: 'settings-heading', text: 'Danger zone' }),
      h('article', { class: 'setting-card danger-card' },
        settingIcon('trash'),
        h('div', null,
          h('span', { class: 'setting-label', text: 'Reset demo data' }),
          h('p', { text: 'Puts everything stored in this browser back to the starting data. Other browsers are not affected.' }),
          h('ul', { class: 'stored-counts' }, counts.map(function (c) { return h('li', null, h('strong', { text: String(c[1]) }), ' ' + c[0]); }))),
        h('button', { class: 'mini danger reset-btn', type: 'button', text: 'Reset demo data', onclick: function () {
          if (!confirm('Reset all demo data in this browser?')) return;
          M.reset();
          toast('Demo data reset.');
          render();
        } }))));
  }

  /* ---------------- leader views ---------------- */
  function leaderEvents() { return S().events.filter(function (e) { return e.leaderId === session.leaderId; }); }
  function leaderOrders() {
    var ids = leaderEvents().map(function (e) { return e.id; });
    return S().orders.filter(function (o) { return ids.indexOf(o.groupEventId) > -1; });
  }

  function shareBox(ev) {
    var url = location.href.replace(/dashboard\.html.*$/, '') + 'portal.html?role=customer&code=' + encodeURIComponent(ev.code);
    return h('div', { class: 'toolbar', style: 'margin:8px 0 4px' },
      h('span', { class: 'code-box', text: ev.code }),
      mini('Copy invite link', function () {
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(
          function () { toast('Invite link copied.'); },
          function () { prompt('Copy this link:', url); });
      }),
      statusBadge(ev.status));
  }

  function leaderOverview(root) {
    var entries = M.ledger(session.leaderId);
    var orders = leaderOrders().filter(function (o) { return o.status !== 'cancelled'; });
    var open = leaderEvents().filter(function (e) { return e.status === 'open'; });
    append(root, overviewBand({ eyebrow: 'Group leader', name: sessionFirstName(),
      summary: open.length ? open.length + ' group buy' + (open.length === 1 ? '' : 's') + ' open. ' + open[0].title + ' ends ' + shortWeekday(open[0].endsAt) + '; share your code to bring more neighbours in.' : 'No group buy is open right now. Ask MEOD to start one.',
      actions: [{ label: 'Group orders', href: '#orders' }, { label: 'Commission', href: '#commission' }] }));
    append(root, h('div', { class: 'kpis' },
      kpi('Active group buys', String(leaderEvents().filter(function (e) { return e.status === 'open'; }).length)),
      kpi('Group orders', String(orders.length)),
      kpi('Group net sales', money(orders.reduce(function (s, o) { return s + o.netCents - (o.refundedCents || 0); }, 0))),
      kpi('Commission payable', money(entries.reduce(function (s, e) { return s + e.payableCents; }, 0)), 'After refunds')));
    leaderEvents().forEach(function (ev) {
      append(root, panel(ev.title, 'Ends ' + date(ev.endsAt) + ' · ' + ev.terms, shareBox(ev)));
      append(root, milestoneNotice(ev));
    });
  }

  function leaderOrdersView(root) {
    append(root, h('p', { class: 'callout', text: 'Members\' names and phone numbers are masked to protect their privacy. If you need contact details for pickup, ask MEOD. They will share them only where members have agreed.' }));
    append(root, panel('Group orders', null,
      table([
        { label: 'Order', render: function (o) { return h('span', null, h('strong', { text: o.ref }), h('br'), h('small', { text: date(o.createdAt) })); } },
        { label: 'Member', render: function (o) { var c = customer(o.customerId); return c ? h('span', null, M.maskName(c.name), h('br'), h('small', { text: M.maskPhone(c.phone) })) : '—'; } },
        { label: 'Event', render: function (o) { return h('span', { class: 'code-box', text: eventFor(o).code }); } },
        { label: 'Items', render: itemsSummary },
        { label: 'Net', num: true, render: function (o) { return money(o.netCents); } },
        { label: 'Status', render: function (o) { return statusBadge(o.status); } }
      ], leaderOrders().slice().reverse(), 'No orders in your group buys yet.')));
  }

  function leaderCommissionView(root) {
    var entries = M.ledger(session.leaderId);
    var first = entries.filter(function (e) { return e.baseCents; })[0];
    if (first) {
      var o = M.byId('orders', first.orderId);
      append(root, h('p', { class: 'callout green', text: 'How ' + first.ref + ' was worked out: subtotal ' + money(o.subtotalCents) + ' − group discount ' + money(o.discountCents) +
        ' = eligible base ' + money(first.baseCents) + ' × ' + (first.rate * 100) + '% = ' + money(first.amountCents) + '. Delivery is not included. A refund takes back the same amount.' }));
    }
    append(root, panel(null, 'Payouts follow the terms agreed with MEOD.', ledgerTable(entries, false)));
  }

  /* ---------------- customer views ---------------- */
  function me() { return customer(session.customerId); }

  function thumb(p) {
    if (p.image) return h('div', { class: 'thumb' + (p.category === 'farm-more' ? ' cover' : '') }, h('img', { src: p.image, alt: '', loading: 'lazy', width: 420, height: 420 }));
    // Same line drawings as the public catalogue (static markup from data.js).
    var t = h('div', { class: 'thumb art', 'aria-hidden': 'true' });
    t.style.setProperty('--tint', M.CATEGORIES[p.category].color);
    t.innerHTML = '<svg viewBox="0 0 64 64">' + (M.CATEGORY_ART[p.category] || '') + '</svg>';
    return t;
  }

  var REC_TYPES = {
    restock: { label: 'Restock', icon: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>' },
    pairs: { label: 'Pairs well', icon: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>' },
    taste: { label: 'Your taste', icon: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.8 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>' },
    fresh: { label: 'Fresh pick', icon: '<path d="M11 20A7 7 0 0 1 4 13c0-5 4-9 16-9 0 12-4 16-9 16z"/><path d="M4 20c4-4 7-7 11-10"/>' }
  };
  function svgIcon(paths) {
    var s = h('span', { class: 'rec-icon', 'aria-hidden': 'true' });
    s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
    return s;
  }

  function recGrid(list) {
    if (!list.length) return h('p', { class: 'empty', text: 'Nothing to suggest right now.' });
    return h('div', { class: 'rec-grid' }, list.map(function (r) {
      var t = REC_TYPES[r.type] || REC_TYPES.fresh;
      var media = h('div', { class: 'rec-media' }, thumb(r.product));
      if (r.match) append(media, h('span', { class: 'rec-match', title: 'How closely this fits your buying pattern' }, h('strong', { text: r.match + '%' }), ' match'));
      var pickOpts = { pick: { match: r.match, reason: r.reason, type: r.type } };
      append(media, h('span', { class: 'shop-peek', 'aria-hidden': 'true', text: 'View details' }));
      var card = h('article', { class: 'rec clickable rec-' + r.type },
        media,
        h('div', { class: 'rec-body' },
          h('span', { class: 'rec-type' }, svgIcon(t.icon), t.label),
          h('button', { type: 'button', class: 'rec-title', text: r.product.title, 'aria-haspopup': 'dialog', 'aria-label': r.product.title + ' — view details', onclick: function () { openProduct(r.product, pickOpts); } }),
          h('p', { class: 'rec-reason', text: r.reason }),
          h('div', { class: 'rec-foot' },
            h('span', { class: 'rec-price', text: money(r.product.priceCents) }),
            h('button', { class: 'btn btn-sm btn-forest rec-add', type: 'button', text: '+ Add', 'aria-label': 'Add ' + r.product.title + ' to cart',
              onclick: function () { addToCart(r.product.id); location.hash = 'shop'; } }))));
      // Clicking anywhere on the card opens details, except its buttons.
      card.addEventListener('click', function (e) { if (!e.target.closest('button')) openProduct(r.product, pickOpts); });
      return card;
    }));
  }

  function picksPanel(c) {
    var personal = c.consentPersonalisation;
    var head = h('div', { class: 'picks-head' },
      h('div', null,
        h('span', { class: 'picks-eyebrow' }, svgIcon('<path d="m12 3 1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'), personal ? 'Smart picks' : 'Fresh this week'),
        personal ? aiTitle('Picked for you, ' + c.name.split(' ')[0]) : h('h2', { text: 'What\'s fresh this week' }),
        h('p', { text: personal
          ? 'Based on what you buy, when you last bought it, and what goes well with your usual basket. Only items in stock.'
          : 'Personalised picks are off. Turn them on in Preferences to get suggestions based on your orders.' })));

    var profile = personal ? M.tasteProfile(c).slice(0, 4) : [];
    if (profile.length) {
      append(head, h('div', { class: 'taste', 'aria-label': 'Your taste profile' },
        h('span', { class: 'taste-title', text: 'Your taste' }),
        profile.map(function (t) {
          var bar = h('span', { class: 'taste-bar' }, h('span', { class: 'taste-fill' }));
          bar.firstChild.style.width = t.pct + '%';
          return h('div', { class: 'taste-row' }, h('span', { class: 'taste-label', text: t.label }), bar, h('span', { class: 'taste-pct', text: t.pct + '%' }));
        })));
    } else if (!personal) {
      append(head, h('a', { class: 'btn btn-sm btn-outline', href: '#preferences', text: 'Turn on smart picks' }));
    }
    return h('section', { class: 'panel picks' }, head, recGrid(M.recommendFor(c, 4)));
  }

  function customerOverview(root) {
    var c = me();
    var mine = S().orders.filter(function (o) { return o.customerId === c.id; });
    var last = mine[mine.length - 1];
    var nextDay = M.nextDeliveryDay(new Date()).toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'short' });
    append(root, overviewBand({ eyebrow: 'MEOD Fresh', name: sessionFirstName(),
      summary: 'Next delivery: ' + nextDay + '.' + (last && ['paid', 'pending_payment'].indexOf(last.status) > -1 ? ' Your order ' + last.ref + ' is on its way.' : ' Fresh greens are picked the morning they\'re delivered.'),
      actions: [{ label: 'Shop the harvest', href: '#shop' }, { label: 'My orders', href: '#orders' }] }));
    append(root, h('div', { class: 'kpis' },
      kpi('Orders', String(mine.length)),
      kpi('Latest order', last ? last.ref : '—', last ? last.status.replace('_', ' ') : null),
      kpi('Group buy', c.groupCode || 'Not joined', c.groupCode ? '5% off applied at checkout' : 'Join with a leader code'),
      rewardsKpi(c)));
    append(root, picksPanel(c));
  }

  /* ---------------- Grow with MEOD (customer rewards) ----------------
   * Built from the portal's own pieces so it matches Home and Group buy: a forest-green
   * membership card (same gradient as Smart picks), a stamp card in a white panel, line icons
   * in soft circles, numbered steps, and the standard table for tiers and history. */
  var TIER_ICONS = {
    seedling: '<path d="M12 21v-8"/><path d="M12 13c0-3.5-2.5-6-6-6 0 3.5 2.5 6 6 6z"/><path d="M12 13c0-3.5 2.5-6 6-6 0 3.5-2.5 6-6 6z"/><path d="M8 21h8"/>',
    sprout: '<path d="M12 21V9"/><path d="M12 14C12 9 8.5 6 4 6c0 5 3.5 8 8 8z"/><path d="M12 9c0-4 3-6 7.5-6 0 4-3 6-7.5 6z"/><path d="M8 21h8"/>',
    harvester: '<path d="M12 21c-4 0-7-3-7-7 0-3 2-6 5-7 0 3 1 5 2 6 1-1 2-3 2-6 3 1 5 4 5 7 0 4-3 7-7 7z"/><path d="M12 21v-8"/>',
    friend: '<path d="M12 22v-6"/><path d="M12 16a5 5 0 0 1-5-5 5 5 0 0 1 2-4 5 5 0 0 1 6-3 5 5 0 0 1 4 5 4 4 0 0 1-2 7z"/><path d="M9 22h6"/>'
  };
  var ICON_GIFT = '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13"/><path d="M3 12h18"/><path d="M12 8c-2 0-4-1-4-3s2-2 4 1c2-3 4-3 4-1s-2 3-4 3z"/>';
  var ICON_STAMP = '<path d="M11 20A7 7 0 0 1 4 13c0-5 4-9 16-9 0 12-4 16-9 16z"/><path d="M4 20c4-4 7-7 11-10"/>';
  function memberId(c) { return 'GROW-' + String(c.id).replace(/\D/g, ''); }

  // Issues any tier-up vouchers the customer has earned but not yet received.
  function syncRewards(c) {
    var issued = M.rewards.syncTierVouchers(c.id);
    if (issued.length) { M.save(); toast(issued.map(function (v) { return v.label + ': ' + money(v.valueCents) + ' voucher'; }).join(', ') + ' added to your vouchers.'); }
  }
  function progressBar(pct, label) {
    var bar = h('span', { class: 'rw-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': label }, h('span', { class: 'rw-fill' }));
    bar.firstChild.style.width = pct + '%';
    return bar;
  }
  // Home: a compact strip in the same card style as the KPIs above it.
  // Home: a Rewards card in the KPI row, same style as Orders / Latest order / Group buy,
  // linking to the Rewards page.
  function rewardsKpi(c) {
    syncRewards(c);
    var s = M.rewards.summary(c.id);
    return h('a', { class: 'kpi kpi-link', href: '#rewards', 'aria-label': 'Rewards: ' + s.points + ' points, ' + s.tier.label + ' member' },
      h('span', { text: 'Rewards' }),
      h('strong', { text: s.points + ' pts' }),
      h('small', { text: s.tier.label + (s.next ? ' · ' + s.toNext + ' to ' + s.next.label : ' · top tier') }),
      progressBar(s.progressPct, 'Progress to next tier'));
  }

  // Stamp card: one stamp per bunch, or one per few bunches when a tier is far away, so the
  // card never has more than 25 stamps. The last stamp is the next tier's reward.
  function stampCard(s) {
    if (!s.next) {
      return h('p', { class: 'rw-top', text: 'You\'ve reached Farm Friend, our top tier. Every bunch still earns ' + s.tier.multiplier + '× points.' });
    }
    var span = s.next.minBunches - s.tier.minBunches;
    var per = Math.ceil(span / 25);
    var total = Math.ceil(span / per);
    var filled = Math.min(total, Math.floor((s.bunches - s.tier.minBunches) / per));
    var cells = [];
    for (var i = 0; i < total; i++) {
      var last = i === total - 1;
      var on = i < filled;
      cells.push(h('li', { class: 'rw-stamp' + (on ? ' on' : '') + (last ? ' reward' : ''), 'aria-hidden': 'true' },
        last ? iconCircle(ICON_GIFT, 'bare') : on ? iconCircle(ICON_STAMP, 'bare') : null));
    }
    // Even rows like a printed card: up to 13 across, so 25 stamps sit in two rows of 13 + 12.
    var grid = h('ol', { class: 'rw-stamps', 'aria-label': filled + ' of ' + total + ' stamps collected' }, cells);
    grid.style.setProperty('--cols', String(total <= 13 ? total : Math.ceil(total / 2)));
    return h('div', { class: 'rw-stampcard' },
      grid,
      h('div', { class: 'rw-stamp-foot' },
        h('span', null, h('strong', { text: s.toNext + ' more bunch' + (s.toNext === 1 ? '' : 'es') }), ' to ' + s.next.label +
          (s.next.voucherCents ? ' — your ' + money(s.next.voucherCents) + ' voucher is on the last stamp' : '')),
        h('small', { text: per > 1 ? '1 stamp = ' + per + ' bunches' : '1 stamp = 1 bunch' })));
  }

  function rewardsView(root) {
    var c = me();
    syncRewards(c);
    var R = M.RULES.rewards;
    var s = M.rewards.summary(c.id);
    var vouchers = M.rewards.vouchers(c.id);
    var openVouchers = vouchers.filter(M.rewards.usable);
    var units = Math.min(s.redeemable, 4);

    function redeem(n) {
      var r = M.rewards.redeem(c.id, n);
      if (!r.ok) { toast(r.error); return; }
      commit('rewards.redeemed', r.voucher.code, money(r.voucher.valueCents) + ' voucher ' + r.voucher.code + ' added — choose it in your cart.');
    }

    /* ---- Membership card (Smart picks gradient) ---- */
    var tierIdx = R.tiers.indexOf(s.tier);
    append(root, h('section', { class: 'rw-card' },
      h('div', { class: 'rw-card-main' },
        h('span', { class: 'picks-eyebrow' }, svgIcon(TIER_ICONS[s.tier.key]), 'Grow with MEOD'),
        h('h2', { text: c.name }),
        h('p', { class: 'rw-card-tier', text: s.tier.label + ' member' }),
        h('div', { class: 'rw-card-meta' },
          h('span', null, h('small', { text: 'Member ID' }), h('strong', { text: memberId(c) })),
          h('span', null, h('small', { text: 'Bunches · 12 months' }), h('strong', { text: String(s.bunches) })),
          h('span', null, h('small', { text: 'Open vouchers' }), h('strong', { text: String(openVouchers.length) }))),
        h('ol', { class: 'tracker rw-tiers', 'aria-label': 'Tiers' }, R.tiers.map(function (t, i) {
          return h('li', { class: (i <= tierIdx ? 'done' : '') + (i === tierIdx ? ' current' : '') }, h('span', { class: 'dot', 'aria-hidden': 'true' }), h('span', { text: t.label }));
        }))),
      h('div', { class: 'rw-card-points' },
        h('span', { text: 'Points' }),
        h('strong', { text: String(s.points) }),
        h('small', { text: (s.pending ? s.pending + ' pending · ' : '') + R.redeemPoints + ' points = ' + money(R.redeemValueCents) }),
        h('button', { class: 'btn btn-sm btn-gold', type: 'button', disabled: !s.redeemable,
          text: s.redeemable ? 'Swap ' + units * R.redeemPoints + ' → ' + money(units * R.redeemValueCents) : (R.redeemPoints - s.points % R.redeemPoints) + ' points to your next voucher',
          onclick: function () { redeem(units); } }))));

    /* ---- Stamp card ---- */
    append(root, panel('Your stamp card', 'Every bunch of MEOD-grown produce earns a stamp. Fill the card to reach the next tier.', stampCard(s)));

    /* ---- Smart tips + vouchers ---- */
    var TIP_ICONS = { tier: TIER_ICONS.sprout, redeem: ICON_GIFT, preorder: ICONS.clock, clearance: ICONS.tag, expiry: ICONS.clock };
    var tips = M.rewards.tips(c);
    var tipsPanel = h('section', { class: 'panel' },
      aiTitle('Smart tips'),
      h('p', { class: 'hint', text: 'From your own orders, what\'s growing and what needs clearing.' }),
      tips.length ? h('ul', { class: 'rw-tips' }, tips.map(function (t) {
        var act = null;
        if (t.action && t.action.productId) act = mini(t.action.label, function () { addToCart(t.action.productId); location.hash = 'shop'; });
        else if (t.action && t.action.redeem) act = mini(t.action.label, function () { redeem(units); });
        else if (t.action && t.action.href) act = h('a', { class: 'mini', href: t.action.href, text: t.action.label });
        return h('li', { class: 'gb-detail rw-tip' }, iconCircle(TIP_ICONS[t.kind] || ICONS.leaf, 'soft'), h('span', { text: t.text }), act);
      })) : h('p', { class: 'empty', text: 'No tips right now — check back after your next order.' }));

    var voucherPanel = panel('Your vouchers', 'Use one in your cart, on orders with at least ' + money(R.voucherMinSpendCents) + ' of full-price items.',
      vouchers.length ? h('div', { class: 'rw-vouchers' }, vouchers.map(function (v) {
        var ok = M.rewards.usable(v);
        return h('article', { class: 'rw-voucher' + (ok ? '' : ' spent') },
          h('div', null, h('strong', { text: money(v.valueCents) }), h('small', { text: v.label })),
          h('div', { class: 'rw-voucher-side' },
            h('span', { class: 'code-box', text: v.code }),
            h('small', { text: v.status === 'used' ? 'Used' + (v.usedAt ? ' ' + shortDate(v.usedAt) : '') : ok ? 'Use by ' + shortDate(v.expiresAt) : 'Expired' })));
      })) : h('p', { class: 'empty', text: 'No vouchers yet. Swap points for one, or fill your stamp card.' }));
    append(root, h('div', { class: 'two-col' }, tipsPanel, voucherPanel));

    /* ---- How it works (numbered steps, like Group buy) ---- */
    append(root, panel('How it works', null, h('ol', { class: 'gb-steps rw-steps' },
      [['Earn points', R.pointsPerDollar + ' point per S$1 on every paid order — the same Store Rewards points as MEOD Fresh.'],
       ['Waste less, earn more', R.antiWasteMultiplier + '× points on Buy to Clear items and harvest pre-orders.'],
       ['Collect stamps', 'Each bunch of MEOD-grown produce is a stamp. More stamps, higher tier, better perks.'],
       ['Swap for vouchers', R.redeemPoints + ' points = ' + money(R.redeemValueCents) + ' off. Refunds take back that order\'s points.']]
        .map(function (st, i) { return h('li', null, h('b', { text: String(i + 1) }), h('span', null, h('strong', { text: st[0] }), h('small', { text: st[1] }))); }))));

    /* ---- Tier perks + history (standard tables) ---- */
    append(root, panel('Tier perks', 'Counted over the last 12 months. Examples for MEOD to confirm.', table([
      { label: 'Tier', render: function (t) { return h('span', { class: 'rw-tier-cell' }, iconCircle(TIER_ICONS[t.key], 'soft'), h('strong', { text: t.label }), t === s.tier ? badge('You', 'green') : null); } },
      { label: 'Bunches a year', num: true, render: function (t) { return t.minBunches ? t.minBunches + '+' : 'Start'; } },
      { label: 'Points', render: function (t) { return t.multiplier > 1 ? t.multiplier + '× on everything' : '1 per S$1'; } },
      { label: 'Voucher', render: function (t) { return t.voucherCents ? money(t.voucherCents) + ' on reaching it' : '—'; } },
      { label: 'Free delivery', render: function (t) { return 'From ' + money(t.freeFromCents != null ? t.freeFromCents : M.RULES.freeDeliveryThresholdCents); } }
    ], R.tiers)));

    var KIND = { earn: ['Earned', 'green'], pending: ['Pending', 'amber'], reversed: ['Reversed', 'red'], redeemed: ['Redeemed', 'blue'] };
    append(root, panel('Points history', null, table([
      { label: 'Date', render: function (r) { return shortDate(r.at); } },
      { label: 'For', render: function (r) { return h('span', null, h('strong', { text: r.ref || '—' }), h('br'), h('small', { text: r.detail })); } },
      { label: 'Type', render: function (r) { return badge(KIND[r.kind][0], KIND[r.kind][1]); } },
      { label: 'Points', num: true, render: function (r) { return h('strong', { class: r.points < 0 ? 'bag-value-low' : 'bag-value-ok', text: (r.points > 0 ? '+' : '') + r.points }); } }
    ], s.ledger, 'No points yet — your first order starts your stamp card.')));
  }

  var cart = {};
  try { cart = JSON.parse(sessionStorage.getItem('meod-cart') || '{}'); } catch (e) { cart = {}; }
  function saveCart() { try { sessionStorage.setItem('meod-cart', JSON.stringify(cart)); } catch (e) { /* ignore */ } }
  function addToCart(id) {
    var p = M.byId('products', id);
    var s = M.stockStatus(p);
    if (!s.known || (cart[id] || 0) >= s.qty) { toast('Can\'t add more — stock not confirmed.'); return; }
    cart[id] = (cart[id] || 0) + 1;
    saveCart();
    toast(p.title + ' added to cart.');
  }

  function iconCircle(paths, cls) {
    var s = h('span', { class: 'icon-circle' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' });
    s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
    return s;
  }
  var ICONS = {
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6"/>',
    truck: '<path d="M10 17h4V5H2v12h3"/><path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    pin: '<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    leaf: '<path d="M11 20A7 7 0 0 1 4 13c0-5 4-9 16-9 0 12-4 16-9 16z"/><path d="M4 20c4-4 7-7 11-10"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    bag: '<path d="M6 7h12l1.5 13.5a2 2 0 0 1-2 2.5H6.5a2 2 0 0 1-2-2.5z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
  };

  // Join a group buy by code; shared by the Shop cart and the Group buy page.
  function joinGroup(code) {
    code = String(code || '').trim().toUpperCase();
    var ev = S().events.filter(function (x) { return x.code === code; })[0];
    if (!ev) { toast('We couldn\'t find that code.'); return false; }
    if (ev.status !== 'open') { toast('That group buy has closed.'); return false; }
    me().groupCode = code;
    try { sessionStorage.removeItem('meod-join-code'); } catch (err) { /* ignore */ }
    commit('groupbuy.joined', code, 'You joined ' + ev.title + '. 5% off is now applied.');
    return true;
  }
  function myEvent() {
    var c = me();
    return c.groupCode ? S().events.filter(function (e) { return e.code === c.groupCode; })[0] || null : null;
  }

  // ---- Product details dialog (used by Shop and Smart picks) ----
  // opts.pick = { match, reason, type } when opened from a recommendation;
  // opts.onCartChange = called after the cart is updated (Shop redraws its grid and cart).
  var CARE_TIPS = {
    'asian-greens': { store: 'Keep refrigerated, loosely wrapped in the crisper. Best within 3–4 days.', cook: 'Quick stir-fry with garlic, blanch with oyster sauce, or add to soups at the end.' },
    lettuces: { store: 'Refrigerate in a breathable bag or box. Best within 4–5 days.', cook: 'Rinse just before eating. Great in salads, wraps and sandwiches.' },
    fungi: { store: 'Refrigerate in a paper bag, not plastic. Best within 5 days.', cook: 'Wipe clean rather than soak. Sauté, grill, or simmer in soups and stews.' },
    herbs: { store: 'Stand stems in a glass of water; keep basil at room temperature, mint in the fridge.', cook: 'Add at the end of cooking, or fresh into salads, drinks and pesto.' },
    'farm-more': { store: 'Follow the storage note on the pack. Gelato stays frozen at −18 °C.', cook: 'Ready to enjoy — made with greens grown on our farm.' }
  };

  function pairsFor(p) {
    // Products that share baskets with this one in past orders; fall back to the same category.
    var counts = {};
    S().orders.forEach(function (o) {
      if (!o.items.some(function (i) { return i.productId === p.id; })) return;
      o.items.forEach(function (i) { if (i.productId !== p.id) counts[i.productId] = (counts[i.productId] || 0) + 1; });
    });
    var inStock = function (x) { var st = M.stockStatus(x); return !x.bagOffer && st.known && x.stock.qty > 0; };
    var list = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })
      .map(function (id) { return M.byId('products', id); }).filter(function (x) { return x && inStock(x); });
    S().products.forEach(function (x) { if (list.length < 3 && x.id !== p.id && x.category === p.category && inStock(x) && list.indexOf(x) === -1) list.push(x); });
    return { items: list.slice(0, 3), fromBaskets: Object.keys(counts).length > 0 };
  }

  // A short recipe idea, collapsed by default so the dialog stays compact.
  function recipeCard(p) {
    var r = M.recipes && M.recipes.forProduct(p);
    if (!r) return null;
    return h('details', { class: 'pd-recipe' },
      h('summary', null, h('span', { class: 'pd-recipe-label', text: 'Recipe idea' }), h('strong', { text: r.name.en }), h('small', { text: r.minutes + ' min' }), aiPill()),
      h('div', { class: 'pd-recipe-body' },
        h('div', null, h('b', { text: 'You need' }), h('ul', null, r.ingredients.map(function (x) { return h('li', { text: x }); }))),
        h('div', null, h('b', { text: 'Steps' }), h('ol', null, r.steps.map(function (x) { return h('li', { text: x }); })))),
      h('small', { class: 'pd-recipe-note', text: 'Recipe ideas are AI-drafted samples in this prototype — MEOD would review them before they go live.' }));
  }

  /* ---- Ratings + reviews (customer shop) ----
   * Average stars on every card, and in the product dialog: the rating breakdown, an
   * AI-written summary of what reviewers say, the reviews themselves, and a form for
   * customers who've received the product to add their own. */
  function starsText(n) { var r = Math.round(n); return '★★★★★'.slice(0, r) + '☆☆☆☆☆'.slice(0, 5 - r); }
  function ratingLine(p) {
    var st = M.reviews.stats(p.id);
    if (!st.count) return null;
    return h('span', { class: 'rating-line', 'aria-label': st.avg + ' out of 5 stars from ' + st.count + ' reviews' },
      h('span', { class: 'rating-stars', 'aria-hidden': 'true', text: '★' }), h('b', { text: st.avg.toFixed(1) }), h('small', { text: '(' + st.count + ')' }));
  }
  function reviewsSection(p, onChange) {
    var st = M.reviews.stats(p.id), sum = M.reviews.summary(p.id), list = M.reviews.list(p.id);
    var can = session.customerId ? M.reviews.canWrite(session.customerId, p.id) : { ok: false };
    var box = h('section', { class: 'pd-reviews', 'aria-labelledby': 'pd-rev-title' });
    var head = h('div', { class: 'rv-head' }, h('h3', { id: 'pd-rev-title', text: 'Ratings & reviews' }));
    append(box, head);
    if (!st.count) append(box, h('p', { class: 'hint', text: 'No reviews yet — be the first once your order arrives.' }));
    else {
      var bars = h('ul', { class: 'rv-dist', 'aria-label': 'Rating breakdown' });
      for (var star = 5; star >= 1; star--) {
        var n = st.dist[star - 1], bar = h('span', { class: 'rv-bar' }, h('span'));
        bar.firstChild.style.width = Math.round(n / st.count * 100) + '%';
        bars.appendChild(h('li', null, h('small', { text: star + '★' }), bar, h('small', { text: String(n) })));
      }
      // Left: the score with its breakdown underneath. Right: the AI summary.
      var overview = h('div', { class: 'rv-overview' },
        h('div', { class: 'rv-score' },
          h('strong', { text: st.avg.toFixed(1) }),
          h('span', null, h('span', { class: 'rv-stars', 'aria-label': st.avg.toFixed(1) + ' out of 5', text: starsText(st.avg) }), h('small', { text: st.count + ' verified review' + (st.count === 1 ? '' : 's') }))),
        bars);
      append(box, h('div', { class: 'rv-top' }, overview,
        sum ? h('div', { class: 'rv-summary' },
          h('div', { class: 'rv-summary-head' }, h('strong', { text: 'What customers say' }), aiPill()),
          h('p', { text: sum.text }),
          sum.pros.length || sum.cons.length ? h('div', { class: 'rv-aspects' },
            sum.pros.map(function (c) { return h('span', { class: 'rv-aspect pro', text: '👍 ' + c.label + ' · ' + c.pos }); }),
            sum.cons.map(function (c) { return h('span', { class: 'rv-aspect con', text: '👎 ' + c.negLabel + ' · ' + c.neg }); })) : null,
          h('small', { class: 'rv-note', text: 'Summarised by AI from ' + sum.basedOn + ' verified reviews. Read them below.' }))
          : h('div', { class: 'rv-summary' }, h('small', { class: 'hint', text: 'A summary appears once there are 3 or more reviews.' }))));
      var listBox = h('ul', { class: 'rv-list' });
      var showAll = false;
      var toggle = list.length > 3 ? h('button', { type: 'button', class: 'mini rv-more' }) : null;
      var drawList = function () {
        listBox.textContent = '';
        (showAll ? list : list.slice(0, 3)).forEach(function (r) {
          listBox.appendChild(h('li', null,
            h('div', { class: 'rv-item-head' }, h('span', { class: 'rv-stars', 'aria-label': r.rating + ' out of 5', text: starsText(r.rating) }),
              h('strong', { text: r.customerId === session.customerId ? 'You' : M.reviews.name(M.byId('customers', r.customerId)) }),
              r.verified ? h('small', { class: 'rv-verified', text: '✓ Verified buyer' }) : null,
              h('small', { text: ago(r.at) })),
            r.text ? h('p', { text: r.text }) : null));
        });
        if (toggle) toggle.textContent = showAll ? 'Show fewer' : 'Show all ' + list.length + ' reviews';
      };
      if (toggle) toggle.addEventListener('click', function () { showAll = !showAll; drawList(); });
      drawList();
      append(box, listBox, toggle);
    }
    if (can.ok) {
      var picked = 0;
      var starsWrap = h('div', { class: 'rv-pick', role: 'radiogroup', 'aria-label': 'Your rating' });
      var btns = [1, 2, 3, 4, 5].map(function (n) {
        return h('button', { type: 'button', role: 'radio', 'aria-checked': 'false', 'aria-label': n + ' star' + (n > 1 ? 's' : ''), text: '★', onclick: function () {
          picked = n;
          btns.forEach(function (b, i) { b.classList.toggle('on', i < n); b.setAttribute('aria-checked', String(i + 1 === n)); });
        } });
      });
      append(starsWrap, btns);
      var txt = h('textarea', { rows: 3, maxlength: 300, placeholder: 'How was it? Freshness, taste, how long it lasted…', 'aria-label': 'Your review' });
      append(box, h('form', { class: 'rv-form', onsubmit: function (e) {
        e.preventDefault();
        var r = M.reviews.add(session.customerId, p.id, picked, txt.value);
        if (!r.ok) { toast(r.error); return; }
        commit('review.posted', r.id, 'Thanks for your review!');
        if (onChange) onChange();
      } }, h('strong', { text: 'You bought this — how was it?' }), starsWrap, txt, h('button', { class: 'btn btn-sm btn-forest', type: 'submit', text: 'Post review' })));
    } else if (can.mine) {
      append(box, h('p', { class: 'hint rv-mine', text: 'You rated this ' + starsText(can.mine.rating) + ' — thank you!' }));
    }
    return box;
  }

  // Buy to Clear listings open the same dialog, priced and limited to the listing.
  var CLEAR_NOTE = { cosmetic: 'Small marks or odd shapes — same taste and freshness.', short_dated: 'Freshly harvested but best eaten within a couple of days.', surplus: 'We harvested more than expected, so it\'s cheaper this week.' };
  function openProduct(p, opts) {
    opts = opts || {};
    // Only one product dialog at a time: close and remove any others right away.
    document.querySelectorAll('.product-dialog').forEach(function (d) { if (d.open) d.close(); d.remove(); });
    var s = M.stockStatus(p);
    var l = opts.listing || null;
    var cartKey = l ? 'CL:' + l.id : p.id;
    var unitCents = l ? l.clearancePriceCents : p.priceCents;
    var inCart = cart[cartKey] || 0;
    var qty = inCart || 1;
    var maxQty = s.known ? (l ? M.clearance.remaining(l) : s.qty) : 0;
    var tips = CARE_TIPS[p.category] || CARE_TIPS['asian-greens'];
    var pairs = pairsFor(p);
    var dlg = h('dialog', { class: 'receipt-dialog product-dialog', 'aria-labelledby': 'pd-title' });
    function closeDialog() { if (dlg.open) dlg.close(); dlg.remove(); }

    var qtyLabel = h('span', { text: String(qty) });
    var minus = h('button', { type: 'button', 'aria-label': 'One less', text: '−' });
    var plus = h('button', { type: 'button', 'aria-label': 'One more', text: '+' });
    var addBtn = h('button', { class: 'btn btn-forest pd-add', type: 'button' });
    function sync() {
      qtyLabel.textContent = String(qty);
      minus.disabled = qty <= 1;
      plus.disabled = qty >= maxQty;
      var canNotify = !maxQty && !l && s.key === 'out' && session.customerId;
      addBtn.disabled = !maxQty && !(canNotify && !notifyListed(p));
      addBtn.textContent = canNotify ? (notifyListed(p) ? '✓ We\'ll tell you when it\'s back' : 'Notify me when it\'s back')
        : !maxQty ? (s.key === 'stale' ? 'Can\'t confirm stock' : 'Sold out')
        : (inCart ? 'Update cart · ' : 'Add to cart · ') + money(unitCents * qty);
    }
    minus.addEventListener('click', function () { if (qty > 1) { qty--; sync(); } });
    plus.addEventListener('click', function () { if (qty < maxQty) { qty++; sync(); } });
    addBtn.addEventListener('click', function () {
      if (!maxQty) { notifyMe(p, function () { if (opts.onCartChange) opts.onCartChange(); closeDialog(); }); return; }
      cart[cartKey] = qty;
      saveCart();
      if (opts.onCartChange) opts.onCartChange();
      toast(qty + ' × ' + p.title + (l ? ' (Buy to Clear)' : '') + (inCart ? ' updated in' : ' added to') + ' your cart.');
      closeDialog();
    });

    var stockLine = l && s.known
      ? (maxQty > 0 ? maxQty + ' left at this price · until ' + shortDate(l.availableUntil) : 'All sold')
      : s.known
      ? (s.qty > 0 ? s.qty + ' available · synced ' + ago(p.stock.updatedAt) : 'Sold out · synced ' + ago(p.stock.updatedAt))
      : 'We can\'t confirm stock right now — last sync ' + ago(p.stock.updatedAt) + '. Try again shortly.';
    var nutrients = String(p.nutrients || '').split('•').map(function (x) { return x.trim(); }).filter(Boolean);

    // Next open harvest batch: lets customers reserve from it (handy when today's stock is sold out).
    var nb = M.harvest.nextFor(p.id);
    var harvestBox = null;
    if (nb) {
      var poKey = 'PO:' + nb.id;
      var poLeft = M.harvest.left(nb) - (cart[poKey] || 0);
      harvestBox = h('div', { class: 'pd-harvest' }, iconCircle(ICONS.leaf, 'soft'),
        h('span', null,
          h('strong', { text: 'Next harvest ' + shortWeekday(M.clearance.parseDayKey(nb.harvestDate).toISOString()) }),
          h('small', { text: M.harvest.growthPct(nb) + '% grown · ' + M.harvest.left(nb) + ' pre-order spots left · order by ' + cutoffText(M.harvest.cutoff(nb)) +
            (cart[poKey] ? ' · ' + cart[poKey] + ' reserved in your cart' : '') })),
        h('button', { class: 'btn btn-sm btn-outline', type: 'button', disabled: poLeft <= 0, text: poLeft > 0 ? 'Pre-order · ' + money(nb.preorderPriceCents) : 'Full',
          onclick: function () {
            cart[poKey] = (cart[poKey] || 0) + 1;
            saveCart();
            if (opts.onCartChange) opts.onCartChange();
            toast(p.title + ' pre-ordered from the ' + shortWeekday(M.clearance.parseDayKey(nb.harvestDate).toISOString()) + ' harvest.');
            closeDialog();
          } }));
    }

    append(dlg,
      h('button', { class: 'pd-close', type: 'button', 'aria-label': 'Close', onclick: closeDialog }, iconCircle(ICONS.x, 'bare')),
      h('div', { class: 'pd-layout' },
        h('div', { class: 'pd-media' }, thumb(p), stockBadge(p)),
        h('div', { class: 'pd-info' },
          h('span', { class: 'tile-cat', text: M.CATEGORIES[p.category].label }),
          h('h2', { id: 'pd-title', text: p.title }),
          h('small', { class: 'pd-sub', text: p.subtitle }),
          l ? h('div', { class: 'pd-price-row' },
                h('span', { class: 'reason-pill', text: M.clearance.reasonLabel(l.reason) }),
                h('span', { class: 'price-was', text: money(l.normalPriceCents) }),
                h('strong', { class: 'pd-price', text: money(l.clearancePriceCents) }),
                h('span', { class: 'discount-badge', text: '−' + M.clearance.discountPct(l) + '%' }))
            : h('strong', { class: 'pd-price', text: money(p.priceCents) }),
          ratingLine(p) ? h('a', { class: 'pd-rating', href: '#pd-rev-title', onclick: function (e) { e.preventDefault(); dlg.querySelector('.pd-reviews').scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, ratingLine(p), h('small', { text: 'Read reviews' })) : null,
          l ? h('p', { class: 'pd-clear-note', text: CLEAR_NOTE[l.reason] || '' }) : null,
          opts.pick ? h('div', { class: 'pd-why' }, svgIcon('<path d="m12 3 1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z"/>'),
            h('span', null, h('strong', { text: 'Picked for you' + (opts.pick.match ? ' · ' + opts.pick.match + '% match' : '') }), h('small', { text: opts.pick.reason }))) : null,
          h('p', { class: 'pd-stock ' + s.key }, iconCircle(ICONS.box, 'bare'), stockLine),
          p.blurb ? h('p', { class: 'pd-blurb', text: p.blurb }) : null,
          h('ul', { class: 'pd-tags' },
            p.meodGrown ? [h('li', { text: '100% pesticide-free' }), h('li', { text: 'Harvested in Kranji' })] : h('li', { text: 'Made by MEOD' }),
            nutrients.map(function (n) { return h('li', { class: 'nutri', text: n }); })),
          h('div', { class: 'pd-buy' },
            h('div', { class: 'qty', 'aria-label': 'Quantity' }, minus, qtyLabel, plus),
            addBtn),
          inCart ? h('small', { class: 'pd-incart', text: inCart + ' already in your cart' }) : null,
          l ? null : harvestBox)),
      h('div', { class: 'pd-extra' },
        h('div', { class: 'pd-tip' }, iconCircle(ICONS.clock, 'soft'), h('span', null, h('strong', { text: 'Storage' }), h('small', { text: tips.store }))),
        h('div', { class: 'pd-tip' }, iconCircle(ICONS.leaf, 'soft'), h('span', null, h('strong', { text: 'How to enjoy' }), h('small', { text: tips.cook })))),
      recipeCard(p),
      reviewsSection(p, function () { if (opts.onCartChange) opts.onCartChange(); openProduct(p, opts); }),
      pairs.items.length ? h('div', { class: 'pd-pairs' },
        h('strong', { text: pairs.fromBaskets ? 'Often bought together' : 'More ' + M.CATEGORIES[p.category].label.toLowerCase() }),
        h('div', { class: 'pd-pair-list' }, pairs.items.map(function (x) {
          return h('button', { type: 'button', class: 'pd-pair', onclick: function () { openProduct(x, { onCartChange: opts.onCartChange }); } },
            h('span', { class: 'cart-thumb' }, thumb(x)), h('span', null, h('b', { text: x.title }), h('small', { text: money(x.priceCents) })));
        }))) : null);

    dlg.addEventListener('close', function () { dlg.remove(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) closeDialog(); });
    document.body.appendChild(dlg);
    sync();
    dlg.showModal();
  }

  function shopView(root) {
    var c = me();
    var state = shopView.state || (shopView.state = { filter: 'all', q: '', inStock: false });
    var gridBox = h('div');
    var cartBox = h('aside', { class: 'cart-card', 'aria-label': 'Your cart' });
    var bagProduct = S().products.filter(function (p) { return p.bagOffer; })[0];
    var bagSelection = shopView.bagSelection || (shopView.bagSelection = (function () {
      // One-time pre-select from the public clearance.html bag card's link, if present.
      var sizeKey = 'small', excludedCategory = '';
      try {
        var prefSize = sessionStorage.getItem('meod-bag-size');
        if (prefSize && S().harvestBag.sizes.some(function (sz) { return sz.key === prefSize; })) sizeKey = prefSize;
        excludedCategory = sessionStorage.getItem('meod-bag-exclude') || '';
        sessionStorage.removeItem('meod-bag-size');
        sessionStorage.removeItem('meod-bag-exclude');
      } catch (e) { /* ignore */ }
      return { sizeKey: sizeKey, excludedCategory: excludedCategory, dayKey: M.clearance.dayKey(M.clearance.nextBagCutoff().deliveryDay) };
    })());

    // Cart keys: a plain productId for regular items, "CL:<listingId>" for a clearance
    // line (priced at the listing's clearance price) and "BAG" for the one Surprise
    // Harvest Bag pre-order (its size/day/exclusion travels on bagSelection).
    function cartItems() {
      return Object.keys(cart).filter(function (key) { return cart[key] > 0; }).map(function (key) {
        if (key === 'BAG') {
          var size = S().harvestBag.sizes.filter(function (sz) { return sz.key === bagSelection.sizeKey; })[0] || S().harvestBag.sizes[0];
          return {
            key: key, productId: bagProduct.id, title: 'Surprise Harvest Bag — ' + size.label, qty: 1, priceCents: size.priceCents,
            bag: true, bagSizeKey: size.key, deliveryDay: bagSelection.dayKey, excludedCategory: bagSelection.excludedCategory || null
          };
        }
        if (key.indexOf('PO:') === 0) {
          var batch = M.byId('batches', key.slice(3));
          var bp = batch && M.byId('products', batch.productId);
          if (!bp) return null;
          return { key: key, productId: bp.id, title: bp.title + ' (pre-order)', qty: cart[key], priceCents: batch.preorderPriceCents,
            preorderBatchId: batch.id, harvestDate: batch.harvestDate };
        }
        if (key.indexOf('CL:') === 0) {
          var listing = M.byId('clearance', key.slice(3));
          var p = listing && M.byId('products', listing.productId);
          if (!p) return null;
          return { key: key, productId: p.id, title: p.title + ' (clearance)', qty: cart[key], priceCents: listing.clearancePriceCents, clearanceListingId: listing.id };
        }
        var p2 = M.byId('products', key);
        if (!p2) return null;
        return { key: key, productId: key, title: p2.title, qty: cart[key], priceCents: p2.priceCents };
      }).filter(Boolean);
    }
    function setQty(key, q) {
      cart[key] = Math.max(0, q);
      if (!cart[key]) delete cart[key];
      saveCart();
      drawGrid();
      drawCart();
      drawClearance();
      drawPreorders();
    }
    // One cart line validation error, or null — checked again right before placing the order.
    function cartLineError(i) {
      if (i.preorderBatchId) {
        var b = M.byId('batches', i.preorderBatchId);
        if (!b || !M.harvest.isOpen(b)) return i.title + ' is no longer open for pre-order.';
        if (M.harvest.left(b) < i.qty) return 'Only ' + M.harvest.left(b) + ' pre-order spots left for ' + i.title.replace(' (pre-order)', '') + '.';
        return null;
      }
      if (i.bag) {
        if (!M.stockStatus(bagProduct).known) return 'Surprise Harvest Bag can\'t be confirmed right now — stock data is being refreshed.';
        if (M.clearance.bagsLeftForDay(i.deliveryDay) <= 0) return 'No bags left for that delivery day — pick another day in Buy to Clear.';
        return null;
      }
      if (i.clearanceListingId) {
        var listing = M.byId('clearance', i.clearanceListingId);
        var p = listing && M.byId('products', listing.productId);
        if (!listing || !p || !M.clearance.isOpen(listing)) return i.title + ' is no longer available at the clearance price.';
        if (!M.stockStatus(p).known) return p.title + ' stock can\'t be confirmed right now.';
        if (M.clearance.remaining(listing) < i.qty) return 'Only ' + M.clearance.remaining(listing) + ' left of ' + p.title + ' at the clearance price.';
        return null;
      }
      var p2 = M.byId('products', i.productId);
      var s2 = p2 && M.stockStatus(p2);
      if (!p2 || !s2.known || s2.qty < i.qty) return 'Stock for ' + (p2 ? p2.title : i.title) + ' could not be confirmed. Please adjust your cart.';
      return null;
    }

    // Toolbar
    var chips = h('div', { class: 'filters', role: 'toolbar', 'aria-label': 'Filter products' });
    function drawChips() {
      chips.textContent = '';
      [['all', 'All']].concat(Object.keys(M.CATEGORIES).map(function (k) { return [k, M.CATEGORIES[k].label]; })).forEach(function (f) {
        var n = S().products.filter(function (p) { return !p.bagOffer && (f[0] === 'all' || p.category === f[0]); }).length;
        append(chips, h('button', { type: 'button', class: 'chip' + (state.filter === f[0] ? ' active' : ''), 'aria-pressed': String(state.filter === f[0]),
          onclick: function () { state.filter = f[0]; drawChips(); drawGrid(); } }, f[1] + ' ', h('span', { class: 'chip-count', text: String(n) })));
      });
    }
    var search = h('input', { type: 'search', placeholder: 'Search the harvest', 'aria-label': 'Search products', value: state.q });
    search.addEventListener('input', function () { state.q = search.value.trim().toLowerCase(); drawGrid(); });
    var stockToggle = h('input', { type: 'checkbox', checked: state.inStock });
    stockToggle.addEventListener('change', function () { state.inStock = stockToggle.checked; drawGrid(); });
    var searchBox = h('label', { class: 'shop-search' }, iconCircle(ICONS.search, 'bare'), search);

    var shopOpts = { onCartChange: function () { drawGrid(); drawCart(); drawPreorders(); } };
    function drawGrid() {
      var list = S().products.filter(function (p) {
        if (p.bagOffer) return false;
        if (state.filter !== 'all' && p.category !== state.filter) return false;
        if (state.inStock && !(M.stockStatus(p).known && p.stock.qty > 0)) return false;
        if (state.q && [p.title, p.subtitle].concat(p.aliases || []).join(' ').toLowerCase().indexOf(state.q) === -1) return false;
        return true;
      });
      gridBox.textContent = '';
      if (!list.length) { append(gridBox, h('p', { class: 'empty', text: 'Nothing matches that — try another name.' })); return; }
      append(gridBox, h('div', { class: 'shop-grid' }, list.map(function (p) {
        var s = M.stockStatus(p);
        var q = cart[p.id] || 0;
        var canAdd = s.known && q < s.qty;
        var media = h('div', { class: 'shop-media' }, thumb(p), stockBadge(p));
        var control = q === 0
          ? (s.key === 'out'
            ? h('button', { class: 'btn btn-sm btn-outline shop-add shop-notify', type: 'button', disabled: notifyListed(p), text: notifyListed(p) ? '✓ On the list' : 'Notify me',
                'aria-label': 'Tell me when ' + p.title + ' is back', onclick: function () { notifyMe(p); } })
            : h('button', { class: 'btn btn-sm btn-forest shop-add', type: 'button', disabled: !canAdd, text: canAdd ? '+ Add' : (s.key === 'stale' ? 'Checking…' : 'Sold out'),
              'aria-label': 'Add ' + p.title + ' to cart', onclick: function () { setQty(p.id, 1); } }))
          : h('div', { class: 'qty' },
              h('button', { type: 'button', 'aria-label': 'Remove one ' + p.title, text: '−', onclick: function () { setQty(p.id, q - 1); } }),
              h('span', { text: String(q) }),
              h('button', { type: 'button', 'aria-label': 'Add one ' + p.title, disabled: !canAdd, text: '+', onclick: function () { setQty(p.id, q + 1); } }));
        append(media, h('span', { class: 'shop-peek', 'aria-hidden': 'true', text: 'View details' }));
        var card = h('article', { class: 'shop-item clickable' + (q ? ' in-cart' : '') + (s.key === 'out' ? ' is-out' : '') },
          media,
          h('div', { class: 'shop-body' },
            h('span', { class: 'tile-cat', text: M.CATEGORIES[p.category].label }),
            h('button', { type: 'button', class: 'shop-title', text: p.title, 'aria-haspopup': 'dialog', 'aria-label': p.title + ' — view details', onclick: function () { openProduct(p, shopOpts); } }),
            h('small', { text: p.subtitle }),
            ratingLine(p),
            h('div', { class: 'shop-foot' }, h('span', { class: 'shop-price', text: money(p.priceCents) }), control)));
        // Clicking anywhere on the card opens details, except its own buttons (+ Add, qty).
        card.addEventListener('click', function (e) { if (!e.target.closest('button')) openProduct(p, shopOpts); });
        return card;
      })));
    }

    function drawCart() {
      var items = cartItems();
      var ev = myEvent();
      var activeEv = ev && ev.status === 'open' ? ev : null;
      // Grow with MEOD: tier free-delivery threshold, an optional voucher (full-price lines only).
      var rs = M.rewards.summary(c.id);
      var usableVouchers = M.rewards.vouchers(c.id).filter(M.rewards.usable);
      var voucherCap = M.rewards.capCents(items, Boolean(activeEv));
      var voucherMin = M.RULES.rewards.voucherMinSpendCents;
      var voucherOk = voucherCap >= voucherMin;
      var chosenVoucher = voucherOk ? usableVouchers.filter(function (v) { return v.id === shopView.voucherId; })[0] || null : null;
      var totals = M.priceOrder(items, Boolean(activeEv), { voucherCents: chosenVoucher ? Math.min(chosenVoucher.valueCents, voucherCap) : 0, freeFromCents: rs.freeFromCents });
      var earn = items.length ? M.rewards.preview(c.id, items, totals) : null;
      var count = items.reduce(function (s, i) { return s + i.qty; }, 0);
      cartBox.textContent = '';

      append(cartBox, h('div', { class: 'cart-head' },
        iconCircle(ICONS.cart),
        h('div', null, h('strong', { text: 'Your cart' }), h('small', { text: count ? count + (count === 1 ? ' item' : ' items') : 'Nothing added yet' }))));

      if (!items.length) {
        append(cartBox, h('div', { class: 'cart-empty' },
          iconCircle(ICONS.leaf, 'soft'),
          h('strong', { text: 'Your basket is empty' }),
          h('span', { text: 'Add fresh greens from the harvest to get started.' })));
      } else {
        append(cartBox, h('ul', { class: 'cart-list' }, items.map(function (i) {
          var p = M.byId('products', i.productId);
          return h('li', null,
            h('span', { class: 'cart-thumb' }, thumb(p)),
            h('span', { class: 'cart-name' }, h('strong', { text: i.title }), h('small', { text: i.qty + ' × ' + money(i.priceCents) +
              (i.harvestDate ? ' · picked & delivered ' + shortWeekday(M.clearance.parseDayKey(i.harvestDate).toISOString()) : '') })),
            h('span', { class: 'cart-amt', text: money(i.qty * i.priceCents) }),
            h('button', { class: 'cart-remove', type: 'button', 'aria-label': 'Remove ' + i.title, onclick: function () { setQty(i.key, 0); } }, iconCircle(ICONS.x, 'bare')));
        })));

        // Free-delivery progress (checked before any voucher, against the customer's tier threshold)
        var beforeVoucher = totals.netCents + totals.voucherCents;
        var need = totals.freeFromCents - beforeVoucher;
        var pct = Math.min(100, Math.round(beforeVoucher / totals.freeFromCents * 100));
        var bar = h('span', { class: 'fd-bar' }, h('span', { class: 'fd-fill' }));
        bar.firstChild.style.width = pct + '%';
        append(cartBox, h('div', { class: 'free-delivery' + (need <= 0 ? ' done' : '') },
          h('span', { class: 'fd-text' }, iconCircle(ICONS.truck, 'bare'),
            need > 0 ? h('span', null, 'Add ', h('strong', { text: money(need) }), ' more for free delivery') : h('span', { text: 'You\'ve unlocked free delivery!' })),
          bar));
      }

      // Group code
      if (activeEv) {
        append(cartBox, h('div', { class: 'cart-code applied' }, iconCircle(ICONS.tag, 'bare'),
          h('span', null, h('strong', { text: activeEv.code }), h('small', { text: '5% group discount applied' }))));
      } else {
        var codeInput = h('input', { placeholder: 'Group code', 'aria-label': 'Group code', maxlength: 24 });
        var form = h('form', { class: 'cart-code' }, iconCircle(ICONS.tag, 'bare'), codeInput, h('button', { class: 'pill-btn', type: 'submit', text: 'Apply' }));
        form.addEventListener('submit', function (e) { e.preventDefault(); joinGroup(codeInput.value); });
        append(cartBox, form);
      }

      // Rewards: pick a voucher, and see the points this order will earn.
      if (items.length) {
        var vSel = null;
        if (usableVouchers.length) {
          vSel = h('select', { 'aria-label': 'Use a rewards voucher', disabled: !voucherOk, onchange: function (e) { shopView.voucherId = e.target.value || null; drawCart(); } },
            h('option', { value: '', text: 'No voucher' }),
            usableVouchers.map(function (v) { return h('option', { value: v.id, selected: chosenVoucher && v.id === chosenVoucher.id, text: money(v.valueCents) + ' · ' + v.label }); }));
        }
        append(cartBox, h('div', { class: 'cart-rewards' },
          h('div', { class: 'cr-head' }, h('span', { class: 'cr-tier', text: rs.tier.label + ' member' }),
            h('span', null, 'You\'ll earn ', h('strong', { text: earn.total + ' points' }), earn.antiWaste ? h('small', { text: ' incl. ' + earn.antiWaste + ' anti-waste bonus' }) : null)),
          vSel ? h('label', { class: 'cr-voucher' }, 'Voucher', vSel) : h('small', { class: 'cr-none', text: rs.redeemable ? 'You have ' + rs.points + ' points — swap them for a voucher in Rewards.' : 'No vouchers yet — ' + rs.points + ' points saved.' }),
          usableVouchers.length && !voucherOk ? h('small', { class: 'cr-note', text: 'Add ' + money(voucherMin - voucherCap) + ' more in full-price items to use a voucher (min. ' + money(voucherMin) + ').' }) : null,
          chosenVoucher && totals.voucherCents < chosenVoucher.valueCents ? h('small', { class: 'cr-note', text: 'Vouchers apply to full-price items only, so ' + money(totals.voucherCents) + ' of it is used here.' }) : null));
      }

      if (items.length) {
        append(cartBox, h('div', { class: 'cart-lines' },
          h('div', null, h('span', { text: 'Subtotal' }), h('span', { text: money(totals.subtotalCents) })),
          activeEv ? h('div', { class: 'saving' }, h('span', { text: 'Group discount' }), h('span', { text: '−' + money(totals.discountCents) })) : null,
          totals.voucherCents ? h('div', { class: 'saving' }, h('span', { text: 'Voucher' }), h('span', { text: '−' + money(totals.voucherCents) })) : null,
          h('div', null, h('span', { text: 'Delivery' }), h('span', { text: totals.deliveryCents ? money(totals.deliveryCents) : 'Free' })),
          h('div', { class: 'cart-total' }, h('span', { text: 'Total' }), h('span', { text: money(totals.totalCents) }))));
      }

      append(cartBox,
        h('button', { class: 'btn btn-forest cart-checkout', type: 'button', disabled: !items.length, text: items.length ? 'Place order · ' + money(totals.totalCents) : 'Place order', onclick: function () {
          // Re-check stock (and clearance / bag availability) at submit time: fail closed if anything changed.
          for (var i = 0; i < items.length; i++) {
            var err = cartLineError(items[i]);
            if (err) { toast(err); drawGrid(); drawCart(); drawClearance(); drawPreorders(); return; }
          }
          items.forEach(function (i) {
            if (i.bag) return; // bag availability is tracked per delivery day, not as product stock
            if (i.preorderBatchId) return; // reserves a spot in its batch (counted from orders), not stock
            if (i.clearanceListingId) { M.clearance.sell(i.clearanceListingId, i.qty); return; }
            M.byId('products', i.productId).stock.qty -= i.qty;
          });
          var id = M.nextId('O');
          var ref = '#MF' + (5000 + S().orders.length + 1);
          var order = Object.assign({ id: id, ref: ref, customerId: c.id, groupEventId: activeEv ? activeEv.id : null, status: 'pending_payment', items: items, refundedCents: 0, createdAt: new Date().toISOString(), source: 'portal' }, totals);
          if (items.some(function (i) { return i.preorderBatchId; })) order.hasPreorder = true;
          var bagLine = items.filter(function (i) { return i.bag; })[0];
          if (bagLine) {
            order.bagSize = bagLine.bagSizeKey;
            order.deliveryDay = bagLine.deliveryDay;
            order.excludedCategory = bagLine.excludedCategory;
            order.bagContentsApproved = false;
            order.bagProposed = M.clearance.proposeBagContents(order);
          }
          if (chosenVoucher && totals.voucherCents) { order.voucherId = chosenVoucher.id; order.voucherCode = chosenVoucher.code; M.rewards.useVoucher(chosenVoucher.id, id); }
          shopView.voucherId = null;
          S().orders.push(order);
          cart = {}; saveCart();
          commit('order.created', ref, 'Order ' + ref + ' placed. You\'ll pay securely on MEOD Fresh.');
          location.hash = 'orders';
        } }),
        h('p', { class: 'cart-note' }, iconCircle(ICONS.clock, 'bare'), 'Delivery on Tue, Thu & Sat · free from ' + money(rs.freeFromCents) +
          (rs.freeFromCents < M.RULES.freeDeliveryThresholdCents ? ' (' + rs.tier.label + ' perk)' : '')));
      var addr = formatAddress(c.address);
      cartBox.insertBefore(h('div', { class: 'cart-address' + (addr ? '' : ' missing') }, iconCircle(ICONS.pin, 'bare'),
        h('span', null, h('small', { text: addr ? 'Deliver to' : 'No delivery address' }), h('strong', { text: addr || 'Add one before you order' })),
        h('a', { href: '#preferences', text: addr ? 'Change' : 'Add' })), cartBox.querySelector('.cart-checkout'));
    }

    /* ---- Buy to Clear: clearance items + the Surprise Harvest Bag pre-order ---- */
    var clearanceBox = h('div');
    var weekdayLong = function (d) { return d.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'short' }); };
    var hourLabel = function (d) { var hh = d.getHours(); return (hh % 12 || 12) + (hh >= 12 ? 'pm' : 'am'); };
    var cutoffShort = function (d) { return d.toLocaleDateString('en-SG', { weekday: 'short' }) + ' ' + hourLabel(d); };

    function drawClearance() {
      clearanceBox.textContent = '';
      var listings = M.clearance.listActive();

      var clearGrid = listings.length ? h('div', { class: 'clearance-strip' }, listings.map(function (l) {
        var p = M.byId('products', l.productId);
        var left = M.clearance.remaining(l);
        var q = cart['CL:' + l.id] || 0;
        var stockOk = M.stockStatus(p).known;
        var canAdd = stockOk && q < left;
        var control = q === 0
          ? h('button', { class: 'btn btn-sm btn-forest shop-add clearance-buy', type: 'button', disabled: !canAdd, text: canAdd ? '+ Add' : (stockOk ? 'Sold out' : 'Checking…'),
              onclick: function () { setQty('CL:' + l.id, 1); } })
          : h('div', { class: 'qty clearance-qty' },
              h('button', { type: 'button', 'aria-label': 'Remove one', text: '−', onclick: function () { setQty('CL:' + l.id, q - 1); } }),
              h('span', { text: String(q) }),
              h('button', { type: 'button', 'aria-label': 'Add one', disabled: !canAdd, text: '+', onclick: function () { setQty('CL:' + l.id, q + 1); } }));
        var clearOpts = { listing: l, onCartChange: function () { drawClearance(); drawCart(); } };
        var cmedia = h('div', { class: 'shop-media' }, thumb(p), h('span', { class: 'shop-peek', 'aria-hidden': 'true', text: 'View details' }));
        var ccard = h('article', { class: 'shop-item clearance-item clickable' + (q ? ' in-cart' : '') },
          cmedia,
          h('div', { class: 'shop-body' },
            h('span', { class: 'reason-pill', text: M.clearance.reasonLabel(l.reason) }),
            h('button', { type: 'button', class: 'shop-title', text: p.title, 'aria-haspopup': 'dialog', 'aria-label': p.title + ' — view details', onclick: function () { openProduct(p, clearOpts); } }),
            ratingLine(p),
            h('div', { class: 'clearance-meta' },
              h('span', { class: 'mini-chip', text: left + ' left' }),
              h('span', { class: 'mini-chip', text: 'Until ' + shortDate(l.availableUntil) })),
            h('div', { class: 'clearance-foot' },
              h('div', { class: 'price-row' },
                h('span', { class: 'price-was', text: money(l.normalPriceCents) }),
                h('span', { class: 'price-now', text: money(l.clearancePriceCents) }),
                h('span', { class: 'discount-badge', text: '−' + M.clearance.discountPct(l) + '%' }),
              ),
              control)));
        // Clicking anywhere on the card opens details, except its own buttons.
        ccard.addEventListener('click', function (e) { if (!e.target.closest('button')) openProduct(p, clearOpts); });
        return ccard;
      })) : h('p', { class: 'empty', text: 'Nothing is on clearance right now — check back soon.' });

      var bag = S().harvestBag;
      var bagDays = []; var from = new Date();
      for (var i = 0; i < 3; i++) {
        var info = M.clearance.nextBagCutoff(from);
        bagDays.push(info);
        from = new Date(info.deliveryDay.getTime() + 36e5);
      }
      var daySelect = h('select', { 'aria-label': 'Delivery day', onchange: function (e) { bagSelection.dayKey = e.target.value; drawClearance(); } },
        bagDays.map(function (info) {
          var key = M.clearance.dayKey(info.deliveryDay);
          var left = M.clearance.bagsLeftForDay(key);
          return h('option', { value: key, selected: key === bagSelection.dayKey, disabled: left <= 0,
            text: weekdayLong(info.deliveryDay) + ' · ' + (left > 0 ? left + ' bags left' : 'fully booked') });
        }));
      var excludeSelect = h('select', { 'aria-label': 'Exclude a category', onchange: function (e) { bagSelection.excludedCategory = e.target.value; drawClearance(); } },
        h('option', { value: '', text: 'No exclusions', selected: !bagSelection.excludedCategory }),
        Object.keys(M.CATEGORIES).map(function (k) { return h('option', { value: k, text: 'No ' + M.CATEGORIES[k].label, selected: bagSelection.excludedCategory === k }); }));

      var cutoffInfo = bagDays.filter(function (info) { return M.clearance.dayKey(info.deliveryDay) === bagSelection.dayKey; })[0];
      if (!cutoffInfo) { cutoffInfo = bagDays[0]; bagSelection.dayKey = M.clearance.dayKey(cutoffInfo.deliveryDay); }
      var selectedDayLeft = M.clearance.bagsLeftForDay(bagSelection.dayKey);
      var likely = M.clearance.likelyInside(bagSelection.excludedCategory, 5);

      var sizeCards = bag.sizes.map(function (sz) {
        var active = bagSelection.sizeKey === sz.key;
        var box = h('button', { type: 'button', class: 'size-box' + (active ? ' active' : ''), 'aria-pressed': String(active),
          onclick: function () { bagSelection.sizeKey = sz.key; drawClearance(); } },
          h('span', { class: 'tick', 'aria-hidden': 'true' }),
          h('strong', { text: sz.label + ' · ' + money(sz.priceCents) }),
          h('span', { class: 'size-save', text: 'Save ' + money(sz.worthCents - sz.priceCents) }),
          h('span', { class: 'size-worth', text: 'Worth at least ' + money(sz.worthCents) }));
        return box;
      });
      var selectedSize = bag.sizes.filter(function (sz) { return sz.key === bagSelection.sizeKey; })[0] || bag.sizes[0];

      var inCart = Boolean(cart.BAG);
      var bagCard = h('article', { class: 'panel bag-card' },
        h('div', { class: 'bag-photo' }, h('img', { src: 'assets/img/farm-flatlay-640.webp', alt: '', loading: 'lazy', width: 320, height: 320 })),
        h('div', { class: 'bag-info' },
          h('h3', { text: 'Surprise Harvest Bag' }),
          h('p', { class: 'hint', text: 'A chef-picked mix of whatever we have the most of this week — mostly from Buy to Clear.' }),
          h('div', { class: 'size-boxes', role: 'group', 'aria-label': 'Choose a bag size' }, sizeCards),
          h('div', null,
            h('p', { class: 'likely-inside-label', text: 'Likely inside' }),
            h('ul', { class: 'likely-inside', 'aria-label': 'Likely inside' }, likely.length
              ? likely.map(function (p) { return h('li', { text: p.title }); })
              : [h('li', { text: 'Fresh seasonal picks' })])),
          h('div', { class: 'bag-fields' },
            h('label', null, 'Delivery day', daySelect),
            h('label', null, 'Exclude a category', excludeSelect)),
          h('div', { class: 'bag-cutoff' }, iconCircle(ICONS.clock),
            h('span', null,
              h('strong', { text: 'Order by ' + cutoffShort(cutoffInfo.cutoff) + ' for ' + shortWeekday(cutoffInfo.deliveryDay) }),
              h('small', { text: selectedDayLeft + (selectedDayLeft === 1 ? ' bag left that day' : ' bags left that day') }))),
          h('button', { class: 'btn btn-sm ' + (inCart ? 'btn-outline' : 'btn-gold'), type: 'button',
            text: inCart ? 'Remove bag from cart' : 'Add bag · ' + money(selectedSize.priceCents),
            disabled: !inCart && selectedDayLeft <= 0, onclick: function () { setQty('BAG', inCart ? 0 : 1); } })));

      append(clearanceBox,
        h('div', { class: 'clearance-top-head' }, h('h2', { text: 'Buy to Clear' }),
          h('p', { class: 'hint', text: 'Fresh produce we have extra of, sold before it goes to waste. Illustrative prices — MEOD to confirm.' })),
        bagCard, clearGrid);
    }

    /* ---- Pre-order the next harvest: open batches, reserved before they're picked ---- */
    var preorderBox = h('div');
    function drawPreorders() {
      preorderBox.textContent = '';
      var open = M.harvest.open();
      if (!open.length) return;
      append(preorderBox,
        h('div', { class: 'clearance-top-head' }, h('h2', { text: 'Pre-order the next harvest' }),
          h('p', { class: 'hint', text: 'Still growing at our Kranji farm. Reserve now and it\'s picked on harvest morning and delivered the same day. Pre-orders help us grow only what gets eaten.' })),
        h('div', { class: 'clearance-strip preorder-strip' }, open.map(function (b) {
          var p = M.byId('products', b.productId);
          var key = 'PO:' + b.id;
          var q = cart[key] || 0;
          var left = M.harvest.left(b);
          var canAdd = q < left;
          var harvestIso = M.clearance.parseDayKey(b.harvestDate).toISOString();
          var grown = M.harvest.growthPct(b);
          var growBar = h('span', { class: 'po-bar grow' }, h('span', { class: 'po-fill' }));
          growBar.firstChild.style.width = grown + '%';
          var control = q === 0
            ? h('button', { class: 'btn btn-sm btn-forest shop-add', type: 'button', disabled: !canAdd, text: canAdd ? '+ Pre-order' : 'Full',
                'aria-label': 'Pre-order ' + p.title, onclick: function () { setQty(key, 1); } })
            : h('div', { class: 'qty clearance-qty' },
                h('button', { type: 'button', 'aria-label': 'One less ' + p.title, text: '−', onclick: function () { setQty(key, q - 1); } }),
                h('span', { text: String(q) }),
                h('button', { type: 'button', 'aria-label': 'One more ' + p.title, disabled: !canAdd, text: '+', onclick: function () { setQty(key, q + 1); } }));
          var card = h('article', { class: 'shop-item preorder-item clickable' + (q ? ' in-cart' : '') },
            h('div', { class: 'shop-media' }, thumb(p), h('span', { class: 'badge b-green', text: (b.drop ? 'Harvest Drop · ' : 'Harvest ') + shortWeekday(harvestIso) })),
            h('div', { class: 'shop-body' },
              h('button', { type: 'button', class: 'shop-title', text: p.title, 'aria-haspopup': 'dialog', onclick: function () { openProduct(p, shopOpts); } }),
              h('div', { class: 'po-line' }, h('small', { text: grown + '% grown · sown ' + shortDate(M.clearance.parseDayKey(b.sowDate).toISOString()) }), growBar),
              h('div', { class: 'clearance-meta' },
                h('span', { class: 'mini-chip', text: left + ' spots left' }),
                h('span', { class: 'mini-chip', text: 'By ' + cutoffText(M.harvest.cutoff(b)) })),
              h('div', { class: 'clearance-foot' },
                h('div', { class: 'price-row' }, b.drop && b.preorderPriceCents < b.drop.normalPriceCents ? h('span', { class: 'price-was', text: money(b.drop.normalPriceCents) }) : null,
                  h('span', { class: 'shop-price', text: money(b.preorderPriceCents) })),
                control)));
          card.addEventListener('click', function (e) { if (!e.target.closest('button')) openProduct(p, shopOpts); });
          return card;
        })),
        h('hr', { class: 'shop-divider' }));
    }

    drawChips();
    drawGrid();
    drawCart();
    drawClearance();
    drawPreorders();
    append(root, h('div', { class: 'shop-layout' },
      h('section', { class: 'panel shop-panel' },
        preorderBox,
        clearanceBox,
        h('hr', { class: 'shop-divider' }),
        h('div', { class: 'shop-toolbar' }, searchBox, h('label', { class: 'toggle' }, stockToggle, h('span', { text: 'In stock only' }))),
        chips,
        gridBox),
      cartBox));
  }

  function pill(label, onclick, icon) {
    var b = h('button', { class: 'pill-btn', type: 'button', onclick: onclick });
    if (icon) {
      var s = h('span', { class: 'rec-icon', 'aria-hidden': 'true' });
      s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' + icon + '</svg>';
      b.appendChild(s);
    }
    append(b, label);
    return b;
  }
  var ICON_RECEIPT = '<path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 1 .7V2l-1 .7-3-2-3 2-3-2-3 2-3-2z"/><path d="M8 8h8M8 12h8M8 16h5"/>';
  var ICON_REORDER = '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>';
  var ICON_HELP = '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>';

  function showReceipt(o) {
    var c = customer(o.customerId);
    var ev = eventFor(o);
    var dlg = h('dialog', { class: 'receipt-dialog', 'aria-label': 'Receipt for ' + o.ref });
    var line = function (label, value, cls) { return h('div', { class: 'r-line' + (cls ? ' ' + cls : '') }, h('span', { text: label }), h('span', { text: value })); };
    var paid = ['paid', 'fulfilled', 'refunded'].indexOf(o.status) > -1;

    append(dlg,
      h('div', { class: 'receipt' },
        h('div', { class: 'r-head' },
          h('img', { src: 'assets/img/favicon.png', alt: '', width: 44, height: 44 }),
          h('div', null, h('strong', { text: 'MEOD Farm' }), h('small', { text: '13 Neo Tiew Harvest Lane, Singapore 719838 · info@meod.com.sg' }))),
        h('div', { class: 'r-meta' },
          h('div', null, h('span', { text: 'Receipt' }), h('strong', { text: o.ref })),
          h('div', null, h('span', { text: 'Date' }), h('strong', { text: date(o.createdAt) })),
          h('div', null, h('span', { text: 'Status' }), statusBadge(o.status))),
        h('div', { class: 'r-to' }, h('span', { text: 'Billed to' }), h('strong', { text: c ? c.name : '—' }), h('small', { text: c ? c.id + (c.email ? ' · ' + c.email : '') : '' })),
        h('table', { class: 'r-items' },
          h('thead', null, h('tr', null, h('th', { text: 'Item' }), h('th', { class: 'num', text: 'Qty' }), h('th', { class: 'num', text: 'Price' }), h('th', { class: 'num', text: 'Amount' }))),
          h('tbody', null, o.items.map(function (i) {
            return h('tr', null, h('td', { text: i.title }), h('td', { class: 'num', text: String(i.qty) }), h('td', { class: 'num', text: money(i.priceCents) }), h('td', { class: 'num', text: money(i.priceCents * i.qty) }));
          }))),
        h('div', { class: 'r-totals' },
          line('Subtotal', money(o.subtotalCents)),
          o.discountCents ? line('Group discount' + (ev ? ' (' + ev.code + ')' : ''), '−' + money(o.discountCents)) : null,
          o.voucherCents ? line('Rewards voucher' + (o.voucherCode ? ' (' + o.voucherCode + ')' : ''), '−' + money(o.voucherCents)) : null,
          line('Delivery', o.deliveryCents ? money(o.deliveryCents) : 'Free'),
          line('Total', money(o.totalCents), 'r-total'),
          o.refundedCents ? line('Refunded', '−' + money(o.refundedCents), 'r-refund') : null),
        h('p', { class: 'r-note', text: paid
          ? 'Thank you for supporting local, pesticide-free farming.'
          : 'Payment pending — complete checkout on MEOD Fresh to confirm this order.' }),
        h('p', { class: 'r-foot', text: 'Generated by the MEOD Portal (prototype).' })),
      h('div', { class: 'r-actions no-print' },
        h('button', { class: 'btn btn-sm btn-outline', type: 'button', text: 'Close', onclick: function () { dlg.close(); } }),
        h('button', { class: 'btn btn-sm btn-forest', type: 'button', text: 'Print / Save as PDF', onclick: function () { window.print(); } })));

    dlg.addEventListener('close', function () { dlg.remove(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); }); // click backdrop to close
    document.body.appendChild(dlg);
    dlg.showModal();
  }

  function reorder(o) {
    var added = 0, skipped = [];
    o.items.forEach(function (i) {
      var p = M.byId('products', i.productId);
      var s = p ? M.stockStatus(p) : { known: false };
      var room = s.known ? Math.max(0, s.qty - (cart[i.productId] || 0)) : 0;
      var n = Math.min(i.qty, room);
      if (n > 0) { cart[i.productId] = (cart[i.productId] || 0) + n; added += n; }
      if (n < i.qty) skipped.push(i.title);
    });
    saveCart();
    toast(added ? added + ' item(s) added to your cart' + (skipped.length ? '. Not available: ' + skipped.join(', ') : '.') : 'Sorry, none of these items are available right now.');
    if (added) location.hash = 'shop';
  }

  /* ----- My orders ----- */
  /* ----- Delivery tracking UI ----- */
  function hm(iso) { return new Date(iso).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' }); }
  function windowText(t) { return t.windowStart ? hm(t.windowStart) + ' – ' + hm(t.windowEnd) : ''; }
  var TRACK_STEPS = [['placed', 'Placed'], ['confirmed', 'Paid'], ['picked_up', 'Packed'], ['out_for_delivery', 'On the way'], ['delivered', 'Delivered']];

  function orderTracker(o) {
    var t = M.trackingFor(o);
    if (t.state === 'closed') {
      return h('div', { class: 'tracker ended' }, iconCircle(ICONS.x, 'bare'),
        h('span', { text: o.status === 'refunded' ? 'Refunded ' + money(o.refundedCents || o.netCents) + ' to your original payment method' : 'This order was cancelled' }));
    }
    var done = {};
    t.events.forEach(function (e) { if (e.at) done[e.status] = true; });
    var lastDone = -1;
    TRACK_STEPS.forEach(function (s, i) { if (done[s[0]]) lastDone = i; });
    return h('ol', { class: 'tracker', 'aria-label': 'Delivery progress' }, TRACK_STEPS.map(function (s, i) {
      return h('li', { class: (done[s[0]] ? 'done' : '') + (i === lastDone && t.state !== 'delivered' ? ' current' : '') }, h('span', { class: 'dot', 'aria-hidden': 'true' }), h('span', { text: s[1] }));
    }));
  }

  // Stylised route: farm -> van -> home. Static SVG markup; position the van once it is in the DOM.
  function routeMap(t) {
    var wrap = h('div', { class: 'route-map ' + t.state });
    wrap.innerHTML =
      '<svg viewBox="0 0 600 230" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Delivery route from MEOD Farm to your address">' +
      '<defs><pattern id="rm-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#d8e8cf" stroke-width="1"/></pattern></defs>' +
      '<rect width="600" height="230" fill="#eef6e8"/><rect width="600" height="230" fill="url(#rm-grid)"/>' +
      '<path d="M0 190 C140 170 220 210 320 175 S520 150 600 165" fill="none" stroke="#cfe2c3" stroke-width="16" stroke-linecap="round"/>' +
      '<path d="M90 0 C120 80 70 150 110 230" fill="none" stroke="#dbe9d2" stroke-width="10"/>' +
      '<path d="M430 0 C410 70 470 140 440 230" fill="none" stroke="#dbe9d2" stroke-width="10"/>' +
      '<ellipse cx="250" cy="70" rx="70" ry="34" fill="#cfe6f2"/>' +
      '<path class="rm-route" d="M70 160 C170 40 300 210 400 110 S520 60 540 70" fill="none" stroke="#9fbf8f" stroke-width="5" stroke-dasharray="2 12" stroke-linecap="round" pathLength="100"/>' +
      '<path class="rm-done" d="M70 160 C170 40 300 210 400 110 S520 60 540 70" fill="none" stroke="#3f8f2f" stroke-width="6" stroke-linecap="round" pathLength="100" stroke-dasharray="100 100" stroke-dashoffset="' + (100 - t.progress * 100) + '"/>' +
      '<g transform="translate(70 160)"><circle r="20" fill="#054f12"/><path d="M-6 6c0-7 4-12 12-12 0 8-5 12-12 12zM-6 6l7-7" stroke="#e6b964" stroke-width="2.4" fill="none" stroke-linecap="round"/></g>' +
      '<text x="70" y="200" text-anchor="middle" class="rm-label">MEOD Farm</text>' +
      '<g transform="translate(540 70)"><circle r="20" fill="#e6b964"/><path d="M-8 2l8-7 8 7v8h-16z" fill="none" stroke="#054f12" stroke-width="2.4" stroke-linejoin="round"/></g>' +
      '<text x="540" y="110" text-anchor="middle" class="rm-label">You</text>' +
      '<g class="rm-van"><circle r="24" class="rm-pulse"/><circle r="17" fill="#fff" stroke="#054f12" stroke-width="2.5"/>' +
      '<path d="M-8 4V-5h9v9M1 -2h4l3 3v5H1" fill="none" stroke="#054f12" stroke-width="2" stroke-linejoin="round"/><circle cx="-4" cy="6" r="2" fill="#054f12"/><circle cx="5" cy="6" r="2" fill="#054f12"/></g>' +
      '</svg>';
    var placed = false;
    function placeVan() {
      if (placed || !wrap.isConnected) return;
      placed = true;
      var path = wrap.querySelector('.rm-route');
      var van = wrap.querySelector('.rm-van');
      if (!path || !van || !path.getTotalLength) return;
      var p = path.getPointAtLength(path.getTotalLength() * t.progress);
      van.setAttribute('transform', 'translate(' + p.x + ' ' + p.y + ')');
      if (t.state !== 'out_for_delivery') van.style.display = t.state === 'delivered' || t.progress < 0.3 ? 'none' : '';
    }
    // Needs the SVG in the DOM to measure the path; rAF can stall in background tabs, so also try a timeout.
    requestAnimationFrame(placeVan);
    setTimeout(placeVan, 30);
    return wrap;
  }

  function trackingPanel(o) {
    var t = M.trackingFor(o);
    var c = customer(o.customerId);
    var addr = c ? formatAddress(c.address) : '';
    var events = t.events.slice();
    var lastDoneIdx = -1;
    events.forEach(function (e, i) { if (e.at) lastDoneIdx = i; });

    var side;
    if (t.state === 'out_for_delivery') {
      side = h('div', { class: 'driver-card' },
        h('span', { class: 'avatar av-staff', 'aria-hidden': 'true', text: initials(t.driver) }),
        h('span', { class: 'driver-text' }, h('strong', { text: t.driver }), h('small', { text: 'Your MEOD driver · ' + t.stopsAway + ' stops away' })),
        h('a', { class: 'pill-btn', href: 'https://wa.me/6581330358', target: '_blank', rel: 'noopener', text: 'Message' }));
    } else if (t.state === 'delivered') {
      side = h('div', { class: 'proof-card' },
        h('div', { class: 'proof-photo', 'aria-hidden': 'true' }, iconCircle('<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/>', 'soft')),
        h('span', null, h('strong', { text: 'Proof of delivery' }), h('small', { text: t.proof.receivedBy + ' · ' + hm(events[events.length - 1].at) + ' · photo on file' })));
    } else {
      side = h('div', { class: 'proof-card' }, iconCircle(ICONS.clock, 'soft'),
        h('span', null, h('strong', { text: t.state === 'awaiting' ? 'Waiting for payment' : 'Delivery window' }),
          h('small', { text: t.state === 'awaiting' ? 'Pay on MEOD Fresh to lock in the next delivery day.' : t.sub })));
    }

    return h('div', { class: 'track-panel' },
      h('div', { class: 'track-head' },
        h('div', null,
          h('span', { class: 'track-state ' + t.state, text: t.headline }),
          h('strong', { class: 'track-eta', text: t.state === 'out_for_delivery' ? 'Arriving ' + windowText(t) : (t.sub || '') })),
        h('small', { class: 'track-no' }, 'Tracking no. ', h('span', { class: 'code-box', text: t.trackingNo }))),
      h('div', { class: 'track-body' },
        h('div', { class: 'track-visual' },
          routeMap(t),
          side,
          h('div', { class: 'track-address' }, iconCircle(ICONS.pin, 'bare'), h('span', { text: addr ? 'Delivering to ' + addr : 'Delivering to the address on your order' }))),
        h('ol', { class: 'timeline' }, events.map(function (e, i) {
          var cls = e.at ? 'done' : 'todo';
          if (i === lastDoneIdx && t.state !== 'delivered') cls += ' current';
          if (i === lastDoneIdx + 1 && t.state === 'out_for_delivery') cls += ' next';
          return h('li', { class: cls },
            h('span', { class: 'tl-dot', 'aria-hidden': 'true' }),
            h('span', { class: 'tl-text' },
              h('strong', { text: e.label }),
              h('small', { text: e.at ? date(e.at) + ', ' + hm(e.at) + (e.detail ? ' · ' + e.detail : '') : (i === lastDoneIdx + 1 && t.state === 'out_for_delivery' ? 'Expected ' + windowText(t) : 'Pending') })));
        }))));
  }

  function customerOrdersView(root) {
    var mine = S().orders.filter(function (o) { return o.customerId === session.customerId; }).slice()
      .sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    var state = customerOrdersView.state || (customerOrdersView.state = { filter: 'all' });
    var spent = mine.filter(function (o) { return o.status !== 'cancelled'; }).reduce(function (s, o) { return s + o.totalCents - (o.refundedCents || 0); }, 0);
    var saved = mine.filter(function (o) { return o.status !== 'cancelled'; }).reduce(function (s, o) { return s + (o.discountCents || 0); }, 0);

    append(root, h('div', { class: 'kpis' },
      kpi('Orders', String(mine.length)),
      kpi('Total spent', money(spent), 'After refunds'),
      kpi('Saved with group buys', money(saved), saved ? 'Thanks to your group code' : 'Join a group buy to save 5%'),
      kpi('Last order', mine[0] ? ago(mine[0].createdAt) : '—', mine[0] ? mine[0].ref : null)));

    var FILTERS = [
      ['all', 'All', function () { return true; }],
      ['active', 'In progress', function (o) { return o.status === 'pending_payment' || o.status === 'paid'; }],
      ['done', 'Delivered', function (o) { return o.status === 'fulfilled'; }],
      ['closed', 'Refunded / cancelled', function (o) { return o.status === 'refunded' || o.status === 'cancelled'; }]
    ];
    var chips = h('div', { class: 'filters', role: 'toolbar', 'aria-label': 'Filter orders' });
    var list = h('div', { class: 'order-list' });
    var live = mine.filter(function (o) { return M.trackingFor(o).state === 'out_for_delivery'; })[0];
    if (state.open === undefined) state.open = live ? live.id : null;
    if (live) {
      var lt = M.trackingFor(live);
      append(root, h('section', { class: 'live-banner' },
        h('span', { class: 'live-van', 'aria-hidden': 'true' }, iconCircle(ICONS.truck, 'bare')),
        h('div', null, h('strong', { text: 'Your order ' + live.ref + ' is on its way!' }), h('small', { text: lt.sub + ' · arriving ' + windowText(lt) })),
        h('button', { class: 'btn btn-sm btn-gold', type: 'button', text: 'Track live', onclick: function () {
          state.open = live.id; state.filter = 'all'; draw();
          var card = list.querySelector('[data-order="' + live.id + '"]'); if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } })));
    }

    function draw() {
      chips.textContent = '';
      FILTERS.forEach(function (f) {
        append(chips, h('button', { type: 'button', class: 'chip' + (state.filter === f[0] ? ' active' : ''), 'aria-pressed': String(state.filter === f[0]),
          onclick: function () { state.filter = f[0]; draw(); } }, f[1] + ' ', h('span', { class: 'chip-count', text: String(mine.filter(f[2]).length) })));
      });
      var test = FILTERS.filter(function (f) { return f[0] === state.filter; })[0][2];
      var rows = mine.filter(test);
      list.textContent = '';
      if (!rows.length) {
        append(list, h('div', { class: 'cart-empty' }, iconCircle(ICONS.box, 'soft'), h('strong', { text: 'No orders here yet' }),
          h('a', { class: 'btn btn-sm btn-forest', href: '#shop', text: 'Shop the harvest' })));
        return;
      }
      rows.forEach(function (o) {
        var ev = eventFor(o);
        var openTrack = state.open === o.id;
        append(list, h('article', { class: 'order-card' + (openTrack ? ' tracking-open' : ''), 'data-order': o.id },
          h('div', { class: 'order-top' },
            h('div', null, h('strong', { class: 'order-ref', text: o.ref }), h('small', { text: date(o.createdAt) + (ev ? ' · ' : '') }), ev ? h('span', { class: 'code-box', text: ev.code }) : null),
            h('div', { class: 'order-total' }, h('strong', { text: money(o.totalCents) }), statusBadge(o.status))),
          h('div', { class: 'order-items' }, o.items.map(function (i) {
            var p = M.byId('products', i.productId);
            if (o.bagSize) {
              return h('span', { class: 'order-item bag-order-item' }, iconCircle(ICONS.bag, 'soft'),
                h('span', null, h('span', { text: i.qty + '× ' + i.title }),
                  h('small', { text: shortWeekday(M.clearance.parseDayKey(o.deliveryDay)) + ' delivery' + (o.excludedCategory ? ' · No ' + M.CATEGORIES[o.excludedCategory].label : '') })));
            }
            if (i.harvestDate) {
              return h('span', { class: 'order-item' }, p ? h('span', { class: 'cart-thumb' }, thumb(p)) : null,
                h('span', null, h('span', { text: i.qty + '× ' + i.title }),
                  h('small', { class: 'po-note', text: 'Picked & delivered ' + shortWeekday(M.clearance.parseDayKey(i.harvestDate).toISOString()) })));
            }
            return h('span', { class: 'order-item' }, p ? h('span', { class: 'cart-thumb' }, thumb(p)) : null, h('span', { text: i.qty + '× ' + i.title }));
          })),
          h('div', { class: 'order-bottom' },
            orderTracker(o),
            h('div', { class: 'pill-row' },
              o.status !== 'cancelled' && o.status !== 'refunded' ? pill(openTrack ? 'Hide tracking' : 'Track', function () { state.open = openTrack ? null : o.id; draw(); }, ICONS.truck) : null,
              pill('Receipt', function () { showReceipt(o); }, ICON_RECEIPT),
              o.status !== 'cancelled' ? pill('Reorder', function () { reorder(o); }, ICON_REORDER) : null,
              pill('Get help', function () { assistantView.prefill = 'Question about order ' + o.ref + ': '; location.hash = 'assistant'; }, ICON_HELP))),
          openTrack ? trackingPanel(o) : null));
      });
    }
    draw();
    append(root, h('section', { class: 'panel' }, h('div', { class: 'user-toolbar' }, chips), list));
  }

  /* ----- Group buy ----- */
  function customerGroupView(root) {
    var c = me();
    var ev = myEvent();
    if (ev) {
      var leader = M.byId('leaders', ev.leaderId);
      var daysLeft = Math.ceil((new Date(ev.endsAt) - Date.now()) / 864e5);
      var myOrders = S().orders.filter(function (o) { return o.customerId === c.id && o.groupEventId === ev.id && o.status !== 'cancelled'; });
      var saved = myOrders.reduce(function (s, o) { return s + (o.discountCents || 0); }, 0);
      var members = {};
      S().orders.forEach(function (o) { if (o.groupEventId === ev.id) members[o.customerId] = true; });
      append(root, h('section', { class: 'gb-hero joined' },
        h('div', { class: 'gb-hero-text' },
          h('span', { class: 'picks-eyebrow' }, svgIcon(ICONS.users), 'You\'re in'),
          h('h2', { text: ev.title }),
          h('p', { text: 'Your 5% group discount is applied automatically at checkout.' }),
          h('div', { class: 'gb-actions' },
            h('a', { class: 'btn btn-gold', href: '#shop', text: 'Shop with my discount' }),
            h('button', { class: 'btn btn-ghost', type: 'button', text: 'Leave group buy', onclick: function () {
              if (!confirm('Leave ' + ev.title + '? You\'ll lose the group discount on new orders.')) return;
              c.groupCode = null; commit('groupbuy.left', ev.code, 'You left the group buy.');
            } }))),
        h('div', { class: 'gb-code' }, h('span', { text: 'Your code' }), h('strong', { text: ev.code }), statusBadge(ev.status))));

      append(root, h('div', { class: 'kpis' },
        kpi('Closes in', ev.status === 'open' ? (daysLeft > 0 ? daysLeft + (daysLeft === 1 ? ' day' : ' days') : 'Today') : 'Closed', date(ev.endsAt)),
        kpi('You\'ve saved', money(saved), myOrders.length + ' group order' + (myOrders.length === 1 ? '' : 's')),
        kpi('Members ordering', String(Object.keys(members).length), 'In this group buy')));
      append(root, milestoneNotice(ev));

      append(root, h('div', { class: 'two-col' },
        h('section', { class: 'panel gb-info' },
          h('div', { class: 'user-cell' }, h('span', { class: 'avatar av-leader', 'aria-hidden': 'true', text: initials(leader.name) }),
            h('span', null, h('strong', { text: leader.name }), h('small', { text: 'Your group leader · ' + leader.area }))),
          h('div', { class: 'gb-detail' }, iconCircle(ICONS.pin, 'soft'), h('span', null, h('strong', { text: 'Pickup & terms' }), h('small', { text: ev.terms })))),
        h('section', { class: 'panel gb-info' },
          h('div', { class: 'gb-detail' }, iconCircle(ICONS.shield, 'soft'),
            h('span', null, h('strong', { text: 'Your privacy' }),
              h('small', { text: 'Your leader sees a masked version of your name and what you ordered. They never see your phone number or address unless you agree.' }))))));
      return;
    }

    var pending = '';
    try { pending = sessionStorage.getItem('meod-join-code') || ''; } catch (e) { /* ignore */ }
    var input = h('input', { name: 'code', placeholder: 'e.g. PUNGGOL-GREENS', value: pending, maxlength: 24, 'aria-label': 'Group code', autocomplete: 'off' });
    var f = h('form', { class: 'gb-form' }, input, h('button', { class: 'btn btn-forest', type: 'submit', text: 'Join group buy' }));
    f.addEventListener('submit', function (e) { e.preventDefault(); joinGroup(input.value); });

    append(root, h('section', { class: 'gb-hero' },
      h('div', { class: 'gb-hero-text' },
        h('span', { class: 'picks-eyebrow' }, svgIcon(ICONS.users), 'Community group buys'),
        h('h2', { text: 'Buy together, save 5%' }),
        h('p', { text: 'Got a code from your group leader? Enter it below and the discount is applied to every order while the group buy is open.' }),
        f),
      h('ol', { class: 'gb-steps' },
        [['Get a code', 'Your estate or office leader shares a group code.'], ['Order as usual', 'Shop here or on WhatsApp — 5% off at checkout.'], ['Collect together', 'Pick up on the agreed day with your group.']]
          .map(function (s, i) { return h('li', null, h('b', { text: String(i + 1) }), h('span', null, h('strong', { text: s[0] }), h('small', { text: s[1] }))); }))));

    // Visit farm-shop codes are handed to visitors on the day, so they aren't listed here.
    var open = S().events.filter(function (e) { return e.status === 'open' && e.kind !== 'visit' && new Date(e.endsAt).getTime() > Date.now(); });
    append(root, h('section', { class: 'panel' },
      h('h2', { text: 'Open group buys' }),
      h('p', { class: 'hint', text: 'Codes are shared by each group\'s leader. Ask yours, or start one with MEOD.' }),
      open.length ? h('div', { class: 'gb-list' }, open.map(function (e) {
        var l = M.byId('leaders', e.leaderId);
        var d = Math.ceil((new Date(e.endsAt) - Date.now()) / 864e5);
        return h('article', { class: 'gb-card' },
          h('div', { class: 'user-cell' }, h('span', { class: 'avatar av-leader', 'aria-hidden': 'true', text: initials(l.name) }),
            h('span', null, h('strong', { text: e.title }), h('small', { text: 'Led by ' + l.name + ' · ' + l.area }))),
          h('div', { class: 'gb-meta' },
            h('span', null, iconCircle(ICONS.clock, 'bare'), d > 0 ? 'Closes in ' + d + ' day' + (d === 1 ? '' : 's') : 'Closes today'),
            h('span', null, iconCircle(ICONS.pin, 'bare'), e.terms)));
      })) : h('p', { class: 'empty', text: 'No group buys are open right now.' })));
  }

  /* ----- Profile: photo, contact details and delivery address ----- */
  function avatarFor(c, extraClass) {
    var cls = 'avatar av-customer' + (extraClass ? ' ' + extraClass : '');
    if (c.photo) return h('img', { class: cls + ' has-photo', src: c.photo, alt: '' });
    return h('span', { class: cls, 'aria-hidden': 'true', text: initials(c.name) });
  }
  function formatAddress(a) {
    if (!a || !a.street) return '';
    return a.street + (a.unit ? ', ' + a.unit : '') + ', Singapore ' + a.postal;
  }

  // Shrink an uploaded image to a 192px square JPEG so it fits comfortably in browser storage.
  function readPhoto(file, done) {
    if (!/^image\//.test(file.type)) { toast('Please choose an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { toast('That image is over 5 MB — please pick a smaller one.'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var size = 192, side = Math.min(img.width, img.height);
        var canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        canvas.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        done(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = function () { toast('We couldn\'t read that image.'); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function editProfile(c) {
    var draftPhoto = c.photo || null;
    var addr = c.address || {};
    var dlg = h('dialog', { class: 'receipt-dialog profile-dialog', 'aria-labelledby': 'profile-dialog-title' });

    var preview = h('div', { class: 'photo-preview' });
    function drawPreview() {
      preview.textContent = '';
      append(preview, draftPhoto ? h('img', { src: draftPhoto, alt: 'Your profile photo' }) : h('span', { text: initials(c.name) }));
      removeBtn.hidden = !draftPhoto;
    }
    var fileInput = h('input', { type: 'file', accept: 'image/*', class: 'sr-only', id: 'profile-photo-input' });
    fileInput.addEventListener('change', function () {
      if (fileInput.files[0]) readPhoto(fileInput.files[0], function (data) { draftPhoto = data; drawPreview(); });
      fileInput.value = '';
    });
    var removeBtn = h('button', { type: 'button', class: 'pill-btn danger-pill', text: 'Remove', onclick: function () { draftPhoto = null; drawPreview(); } });

    function field(label, input, hint) {
      return h('label', { class: 'pf-field' }, h('span', { text: label }), input, hint ? h('small', { class: 'pf-hint', text: hint }) : null, h('small', { class: 'pf-error', 'aria-live': 'polite' }));
    }
    var email = h('input', { type: 'email', name: 'email', value: c.email || '', autocomplete: 'email', required: true });
    var phone = h('input', { type: 'tel', name: 'phone', value: c.phone || '', autocomplete: 'tel', required: true, placeholder: '+65 8123 4567' });
    var street = h('input', { name: 'street', value: addr.street || '', autocomplete: 'address-line1', placeholder: 'Blk 123 Punggol Field' });
    var unit = h('input', { name: 'unit', value: addr.unit || '', autocomplete: 'address-line2', placeholder: '#05-12' });
    var postal = h('input', { name: 'postal', value: addr.postal || '', autocomplete: 'postal-code', inputmode: 'numeric', maxlength: 6, placeholder: '820123' });

    var form = h('form', { class: 'profile-form', novalidate: true },
      h('div', { class: 'pf-photo' }, preview,
        h('div', null,
          h('strong', { text: 'Profile photo' }),
          h('small', { text: 'JPG or PNG, up to 5 MB. We crop it to a square.' }),
          h('div', { class: 'pill-row' },
            h('label', { class: 'pill-btn', for: 'profile-photo-input', tabindex: '0', text: 'Upload photo',
              onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } } }),
            removeBtn),
          fileInput)),
      h('fieldset', { class: 'pf-group' }, h('legend', { text: 'Contact details' }),
        field('Email', email, 'For receipts and order updates. Your sign-in email stays the same.'),
        field('Mobile number', phone, 'Singapore mobile, used for WhatsApp updates.')),
      h('fieldset', { class: 'pf-group' }, h('legend', { text: 'Delivery address' }),
        field('Street & block', street),
        h('div', { class: 'pf-row' }, field('Unit (optional)', unit), field('Postal code', postal))),
      h('div', { class: 'r-actions' },
        h('button', { class: 'btn btn-sm btn-outline', type: 'button', text: 'Cancel', onclick: function () { dlg.close(); } }),
        h('button', { class: 'btn btn-sm btn-forest', type: 'submit', text: 'Save changes' })));

    function setError(input, msg) {
      var box = input.closest('.pf-field').querySelector('.pf-error');
      box.textContent = msg || '';
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      return !msg;
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var digits = phone.value.replace(/\D/g, '').replace(/^65(?=\d{8}$)/, '');
      var hasAddress = street.value.trim() || unit.value.trim() || postal.value.trim();
      var ok = [
        setError(email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()) ? '' : 'Enter a valid email address.'),
        setError(phone, /^[89]\d{7}$/.test(digits) ? '' : 'Enter an 8-digit Singapore mobile starting with 8 or 9.'),
        setError(street, !hasAddress || street.value.trim().length >= 4 ? '' : 'Enter your block and street.'),
        setError(unit, !unit.value.trim() || /^#?\d{1,3}-\d{1,5}[A-Za-z]?$/.test(unit.value.trim()) ? '' : 'Use a format like #05-12.'),
        setError(postal, !hasAddress || /^\d{6}$/.test(postal.value.trim()) ? '' : 'Singapore postal codes have 6 digits.')
      ].every(Boolean);
      if (!ok) { var bad = form.querySelector('[aria-invalid="true"]'); if (bad) bad.focus(); return; }

      c.email = email.value.trim();
      c.phone = '+65 ' + digits.slice(0, 4) + ' ' + digits.slice(4);
      c.address = hasAddress ? { street: street.value.trim(), unit: unit.value.trim() ? '#' + unit.value.trim().replace(/^#/, '') : '', postal: postal.value.trim() } : null;
      var photoChanged = (c.photo || null) !== draftPhoto;
      c.photo = draftPhoto;
      dlg.close();
      if (photoChanged) M.audit(session.email, 'profile.photo', c.id);
      commit('profile.updated', c.id, 'Profile saved.');
    });

    append(dlg, h('div', { class: 'receipt' }, h('h2', { id: 'profile-dialog-title', class: 'pf-title', text: 'Edit profile' }), form));
    dlg.addEventListener('close', function () { dlg.remove(); });
    document.body.appendChild(dlg);
    drawPreview();
    dlg.showModal();
  }

  function profileCard(c) {
    var address = formatAddress(c.address);
    return h('section', { class: 'profile-card' },
      h('button', { type: 'button', class: 'avatar-edit', 'aria-label': 'Change profile photo', onclick: function () { editProfile(c); } },
        avatarFor(c, 'profile-avatar'), h('span', { class: 'avatar-cam', 'aria-hidden': 'true' }, iconCircle('<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>', 'bare'))),
      h('div', { class: 'profile-main' },
        h('strong', { text: c.name }),
        h('small', { text: c.id + ' · Member' }),
        h('div', { class: 'profile-meta' },
          h('span', null, iconCircle(ICONS.chat, 'bare'), c.phone),
          c.email ? h('span', null, iconCircle(ICONS.globe, 'bare'), c.email) : null,
          h('span', null, iconCircle(ICONS.pin, 'bare'), address || 'No delivery address yet'))),
      h('button', { type: 'button', class: 'btn btn-sm btn-gold profile-edit', text: 'Edit profile', onclick: function () { editProfile(c); } }));
  }

  /* ----- Preferences ----- */
  function preferencesView(root) {
    var c = me();
    function switchRow(field, icon, label, note) {
      var input = h('input', { type: 'checkbox', role: 'switch', checked: c[field], 'aria-label': label });
      input.addEventListener('change', function () {
        c[field] = input.checked;
        c.consentTimestamp = new Date().toISOString();
        commit('consent.' + field + '.' + (input.checked ? 'granted' : 'withdrawn'), c.id, label + (input.checked ? ' turned on.' : ' turned off.'));
      });
      return h('label', { class: 'pref-row' }, iconCircle(icon, 'soft'),
        h('span', { class: 'pref-text' }, h('strong', { text: label }), h('small', { text: note })),
        h('span', { class: 'switch-ui' }, input, h('span', { class: 'switch-track', 'aria-hidden': 'true' })));
    }
    var LANGS = [['en', 'English'], ['zh', '中文'], ['ms', 'Bahasa Melayu'], ['ta', 'தமிழ்']];

    append(root, profileCard(c));

    append(root, h('div', { class: 'two-col prefs-layout' },
      h('section', { class: 'panel' },
        h('h2', { text: 'Messages & privacy' }),
        h('p', { class: 'hint', text: 'Change these any time. Each change is saved with the time you made it.' }),
        switchRow('consentMarketing', ICONS.chat, 'WhatsApp promotions', 'Harvest updates and offers. Reply STOP to any message to opt out.'),
        switchRow('consentPersonalisation', ICONS.leaf, 'Personalised picks', 'Use your past orders to suggest products. We never guess sensitive things about you.'),
        h('div', { class: 'pref-row' }, iconCircle(ICONS.globe, 'soft'),
          h('span', { class: 'pref-text' }, h('strong', { text: 'Preferred language' }), h('small', { text: 'Used by Ask MEOD and for messages' })),
          h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Preferred language' }, LANGS.map(function (l) {
            return h('button', { type: 'button', role: 'radio', class: c.language === l[0] ? 'on' : '', 'aria-checked': String(c.language === l[0]), text: l[1],
              onclick: function () { if (c.language === l[0]) return; c.language = l[0]; commit('profile.language', c.id, 'Language set to ' + l[1] + '.'); } });
          })))),
      h('section', { class: 'panel privacy-card' },
        h('h2', { text: 'Your privacy at a glance' }),
        h('ul', { class: 'privacy-list' },
          h('li', null, h('span', { class: 'status-dot ' + (c.consentMarketing ? 'on' : 'off'), text: c.consentMarketing ? 'Promotions on' : 'Promotions off' })),
          h('li', null, h('span', { class: 'status-dot ' + (c.consentPersonalisation ? 'on' : 'off'), text: c.consentPersonalisation ? 'Personalised picks on' : 'Personalised picks off' })),
          h('li', null, h('span', { class: 'status-dot on', text: 'Group leaders only see your masked name' }))),
        h('p', { class: 'form-note', text: c.consentTimestamp ? 'Last changed ' + new Date(c.consentTimestamp).toLocaleString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'You haven\'t changed these yet.' }))));
  }

  /* ----- Ask MEOD ----- */
  function assistantView(root) {
    var c = me();
    var history = assistantView.history || (assistantView.history = [
      { who: 'bot', text: 'Hi ' + c.name.split(' ')[0] + '! I\'m Ask MEOD 🌱 You\'re signed in, so I can check your orders as well as stock, prices and delivery.', at: new Date().toISOString() }
    ]);
    var online = M.withinHumanHours();
    var log = h('div', { class: 'chat-log', 'aria-live': 'polite' });
    var input = h('input', { placeholder: 'Type a message…', maxlength: 300, 'aria-label': 'Message', autocomplete: 'off' });
    if (assistantView.prefill) { input.value = assistantView.prefill; assistantView.prefill = ''; setTimeout(function () { input.focus(); }, 0); }

    function time(iso) { return new Date(iso).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' }); }
    function bubble(m) {
      return h('div', { class: 'bubble-row ' + m.who },
        m.who === 'bot' ? h('span', { class: 'avatar av-bot', 'aria-hidden': 'true', text: 'M' }) : null,
        h('div', { class: 'bubble' + (m.handover ? ' handover' : '') }, h('p', { text: m.text }),
          m.showClearanceLink ? h('a', { class: 'msg-link', href: '#shop', text: 'Go to Buy to Clear →' }) : null,
          h('time', { text: time(m.at) })));
    }
    function drawLog() { log.textContent = ''; history.forEach(function (m) { log.appendChild(bubble(m)); }); log.scrollTop = log.scrollHeight; }
    function send(text) {
      text = String(text || '').trim();
      if (!text) return;
      history.push({ who: 'user', text: text, at: new Date().toISOString() });
      drawLog();
      var typing = h('div', { class: 'bubble-row bot' }, h('span', { class: 'avatar av-bot', 'aria-hidden': 'true', text: 'M' }), h('div', { class: 'bubble typing', 'aria-label': 'Ask MEOD is typing' }, h('i'), h('i'), h('i')));
      log.appendChild(typing);
      log.scrollTop = log.scrollHeight;
      var r = M.assist.reply(text, { channel: 'portal', customerId: session.customerId });
      setTimeout(function () {
        history.push({ who: 'bot', text: r.text, handover: r.handover, showClearanceLink: r.showClearanceLink, at: new Date().toISOString() });
        drawLog();
        if (r.handover) M.save();
      }, 650);
    }
    var form = h('form', { class: 'chat-form' }, input, h('button', { class: 'chat-send', type: 'submit', 'aria-label': 'Send' }, iconCircle('<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>', 'bare')));
    form.addEventListener('submit', function (e) { e.preventDefault(); var t = input.value; input.value = ''; send(t); });

    var mine = S().orders.filter(function (o) { return o.customerId === c.id; });
    var lastRef = mine.length ? mine[mine.length - 1].ref : null;
    var quick = ['Where is my order?', 'Do you have kai lan?', 'Delivery days?', 'What\'s the surprise bag?', '菜心有货吗？', 'Any promotions?'];
    var chips = h('div', { class: 'quick-chips' }, quick.map(function (q) { return h('button', { type: 'button', text: q, onclick: function () { send(q); } }); }));

    drawLog();
    append(root, h('div', { class: 'chat-layout' },
      h('section', { class: 'chat-card' },
        h('header', { class: 'chat-header' },
          h('span', { class: 'avatar av-bot big', 'aria-hidden': 'true', text: 'M' }),
          h('div', { class: 'chat-head-text' }, h('strong', { text: 'Ask MEOD' }),
            h('small', null, h('span', { class: 'status-dot on', text: 'Bot online 24/7' }), ' · ', online ? 'Team online now' : 'Team back Mon–Sat 9am')),
          aiPill()),
        log, chips, form),
      h('aside', { class: 'chat-side' },
        h('section', { class: 'panel' },
          h('h2', { text: 'I can help with' }),
          h('ul', { class: 'help-list' },
            [[ICONS.leaf, 'Stock & prices', 'Live availability, never guessed'], [ICONS.truck, 'Delivery', 'Days, fees and free-delivery threshold'],
             [ICONS.box, 'Your orders', lastRef ? 'Latest: ' + lastRef : 'Status of anything you\'ve ordered'], [ICONS.users, 'Group buys', 'Codes and discounts'],
             [ICONS.globe, '3 languages', 'English, 中文 and Bahasa Melayu']]
              .map(function (x) { return h('li', null, iconCircle(x[0], 'soft'), h('span', null, h('strong', { text: x[1] }), h('small', { text: x[2] }))); }))),
        h('section', { class: 'panel human-card' },
          h('h2', { text: 'Need a person?' }),
          h('p', { class: 'hint', text: 'Complaints, refunds and payment questions go straight to our team. ' + (online ? 'We\'re online now.' : 'We\'ll reply when we\'re back (Mon–Sat, 9am–6pm).') }),
          h('a', { class: 'btn btn-sm btn-forest', href: 'https://wa.me/6581330358', target: '_blank', rel: 'noopener', text: 'WhatsApp the team' })))));
  }

  /* ---------------- routing ---------------- */
  /* ---------------- Greenhouse rounds (farm workers, staff, admin) ----------------
   * Workers keep doing their normal inspection walk; the phone just records it. For each
   * growing batch: a photo (leafy crops get the leaf-colour check from grade.js, looks only),
   * the condition and an estimated harvest. "Save & next" moves through the round, and the
   * last batch sends it: small changes update the harvest plan at once, big ones wait for the
   * farm manager here. Everything downstream (Demand Radar, Harvest Drops, Campaign Advisor)
   * reads the batch's expected quantity, so it recalculates by itself. */
  var NOTE_CHIPS = ['Pests seen', 'Wilting', 'Uneven growth', 'Ready early', 'Ready late', 'Watering issue'];
  function harvestInText(b) {
    var n = Math.round((M.clearance.parseDayKey(b.harvestDate) - new Date().setHours(0, 0, 0, 0)) / 864e5);
    return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : 'in ' + n + ' days';
  }
  function kgText(p, qty) { return '≈' + Math.round(qty * M.quotes.kgPerUnit(p) * 10) / 10 + ' kg'; }
  function conditionBadge(key) { var c = M.inspect.CONDITIONS[key]; return h('span', { class: 'ptype' }, badge(c.label, c.tone)); }
  // What Campaign Advisor says about a batch now (after any estimate change).
  function promoNow(batchId) {
    var d = M.promo.drops().filter(function (x) { return x.batch.id === batchId; })[0];
    if (!d) return 'Harvest is more than 2 weeks away';
    return d.ranking[0].label + (d.shortBy ? ' · short by ' + d.shortBy : d.uncommitted ? ' · ' + d.uncommitted + ' uncommitted' : ' · fully covered');
  }
  function thumbFrom(source) {
    var side = M.RULES.inspect.thumbSide, w = source.naturalWidth || source.width, hh = source.naturalHeight || source.height, s = Math.min(1, side / Math.max(w, hh));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(hh * s));
    c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.7);
  }

  function openInspect(row, onDone) {
    document.querySelectorAll('.insp-dialog').forEach(function (d) { if (d.open) d.close(); d.remove(); });
    var b = row.batch, p = row.product, prev = row.inspection;
    var gradable = Boolean(M.grade) && M.grade.canGrade(p);
    var st = { condition: prev ? prev.condition : null, photo: prev ? prev.photo : null, grade: prev && prev.photo ? prev.photo.grade : null, est: prev ? prev.estQty : b.expectedQty };
    var dlg = h('dialog', { class: 'receipt-dialog insp-dialog', 'aria-labelledby': 'in-title' });
    function closeDialog() { if (dlg.open) dlg.close(); dlg.remove(); }
    var photoBox = h('div', { class: 'insp-photo' });
    var condBox = h('div', { class: 'cond-pick', role: 'radiogroup', 'aria-label': 'Crop condition' });
    var qty = h('input', { type: 'number', min: 0, step: 1, inputmode: 'numeric', value: String(st.est), 'aria-label': 'Estimated harvest' });
    var qtyNote = h('small', { class: 'qty-note', 'aria-live': 'polite' });
    var notes = h('textarea', { rows: 2, maxlength: 280, placeholder: 'Anything the manager should know (optional)', 'aria-label': 'Notes' });
    notes.value = prev ? prev.notes : '';
    var inTemp = h('input', { type: 'number', min: 10, max: 50, step: 0.1, inputmode: 'decimal', placeholder: 'e.g. 31.5', 'aria-label': 'Temperature inside the greenhouse' });
    var inHum = h('input', { type: 'number', min: 1, max: 100, step: 1, inputmode: 'numeric', placeholder: 'e.g. 78', 'aria-label': 'Humidity inside the greenhouse' });
    if (prev && prev.indoor) { inTemp.value = prev.indoor.tempC == null ? '' : String(prev.indoor.tempC); inHum.value = prev.indoor.humidity == null ? '' : String(prev.indoor.humidity); }
    var err = h('p', { class: 'pf-error', 'aria-live': 'polite' });
    var file = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'visually-hidden', 'aria-label': 'Take a photo' });

    function drawPhoto() {
      photoBox.textContent = '';
      if (!st.photo) {
        append(photoBox, h('div', { class: 'insp-empty' }, iconCircle(ICONS.leaf, 'soft'),
          h('small', { text: gradable ? 'Take a photo of a few plants. Tyllage checks leaf colour and suggests a condition.' : 'Take a photo for the record. The colour check works on leafy greens only, so choose the condition yourself.' })));
        return;
      }
      var g = st.photo.grade ? M.grade.GRADES[st.photo.grade] : null;
      append(photoBox, h('figure', { class: 'insp-fig' },
        h('div', { class: 'gd-img' }, h('img', { src: st.photo.url, alt: 'Inspection photo' }), st.photo.overlay ? h('img', { class: 'gd-mark', src: st.photo.overlay, alt: '' }) : null),
        h('figcaption', null,
          g ? badge(g.label, g.tone) : badge('No colour check', 'grey'),
          h('small', { text: st.photo.reason || 'Recorded with the inspection.' }),
          st.photo.simulated ? h('small', { class: 'gd-sim', text: 'Demo photo (simulated)' }) : null,
          g && M.inspect.GRADE_CONDITION[st.photo.grade] ? h('small', { class: 'insp-suggest', text: 'Suggests: ' + M.inspect.CONDITIONS[M.inspect.GRADE_CONDITION[st.photo.grade]].label + '. You decide.' }) : null)));
    }
    function useSource(source, label, simulated) {
      var r = gradable ? M.grade.analyze(source) : null;
      st.photo = { url: thumbFrom(source), overlay: r ? r.overlayUrl : null, grade: r ? r.grade : null, reason: r ? r.reason : null, simulated: simulated, label: label };
      // Retake on an unclear photo; otherwise preselect the suggested condition (the worker can change it).
      if (r && M.inspect.GRADE_CONDITION[r.grade]) st.condition = M.inspect.GRADE_CONDITION[r.grade];
      drawPhoto(); drawCond();
    }
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      var u = URL.createObjectURL(f);
      M.grade.loadImage(u).then(function (img) { useSource(img, f.name, false); }, function () { toast('That file couldn\'t be read as a photo.'); })
        .then(function () { URL.revokeObjectURL(u); file.value = ''; });
    });
    function demo(i) {
      M.grade.demoSamples(gradable ? p.category : 'asian-greens').then(function (s) { useSource(s[i].source, s[i].label, s[i].simulated); });
    }
    function drawCond() {
      condBox.textContent = '';
      Object.keys(M.inspect.CONDITIONS).forEach(function (k) {
        var c = M.inspect.CONDITIONS[k];
        append(condBox, h('button', { type: 'button', role: 'radio', 'aria-checked': String(st.condition === k), class: 'cond-btn c-' + c.tone + (st.condition === k ? ' on' : ''),
          onclick: function () { st.condition = k; drawCond(); drawQty(); } }, h('strong', { text: c.label }), h('small', { text: c.note })));
      });
    }
    function drawQty() {
      var v = parseInt(qty.value, 10); if (isNaN(v)) v = 0;
      var d = v - b.expectedQty, pct = b.expectedQty ? Math.round(d / b.expectedQty * 100) : 0;
      var big = Math.abs(pct) > M.RULES.inspect.autoApplyPct * 100 || st.condition === 'review';
      qtyNote.textContent = kgText(p, v) + ' · plan was ' + b.expectedQty + (d ? ' (' + (d > 0 ? '+' : '') + d + ', ' + (pct > 0 ? '+' : '') + pct + '%)' : ' (no change)') +
        (big ? '. The farm manager will confirm this one.' : '. Updates the harvest plan when the round is sent.');
      qtyNote.classList.toggle('warn', big);
      // Learned from past harvests: this crop's estimates usually run high or low.
      var cor = M.inspect.corrected(p.id, v);
      learnNote.textContent = '';
      if (cor && cor.value !== v) {
        append(learnNote, h('span', { text: p.title + ' estimates have run ' + Math.abs(cor.bias.biasPct) + '% ' + (cor.bias.biasPct > 0 ? 'high' : 'low') + ' over ' + cor.bias.n + ' past harvests, so about ' + cor.value + ' is likelier. ' }),
          h('button', { type: 'button', class: 'mini', text: 'Use ' + cor.value, onclick: function () { qty.value = String(cor.value); drawQty(); } }));
      }
    }
    var learnNote = h('small', { class: 'learn-note', 'aria-live': 'polite' });
    var step = function (n) { return h('button', { type: 'button', class: 'qty-btn', 'aria-label': (n > 0 ? 'Add ' : 'Take away ') + Math.abs(n), text: (n > 0 ? '+' : '−') + Math.abs(n),
      onclick: function () { qty.value = String(Math.max(0, (parseInt(qty.value, 10) || 0) + n)); drawQty(); } }); };
    qty.addEventListener('input', drawQty);

    append(dlg,
      h('button', { class: 'pd-close', type: 'button', 'aria-label': 'Close', onclick: closeDialog }, iconCircle(ICONS.x, 'bare')),
      h('div', { class: 'rd-body insp-body' },
        h('div', { class: 'rd-head' }, h('h2', { id: 'in-title', text: row.greenhouse + ' · ' + p.title }), badge('Harvest ' + harvestInText(b), 'green')),
        h('small', { class: 'hint', text: 'Batch ' + b.id + ' · sown ' + shortDate(M.clearance.parseDayKey(b.sowDate).toISOString()) + ' · plan ' + b.expectedQty + ' (' + kgText(p, b.expectedQty) + ')' }),
        h('section', { class: 'insp-step' }, h('h3', { text: '1. Photo' }), photoBox,
          h('div', { class: 'insp-photo-actions' },
            h('label', { class: 'btn btn-sm btn-forest insp-cam' }, file, svgIcon(ICONS.leaf), st.photo ? 'Retake photo' : 'Take photo'),
            h('span', { class: 'insp-demo' }, h('small', { text: 'No plants nearby? Demo photo:' }),
              mini('Fresh', function () { demo(0); }), mini('Yellowing', function () { demo(2); }), mini('Brown spots', function () { demo(3); })))),
        h('section', { class: 'insp-step' }, h('h3', { text: '2. Condition' }), condBox),
        h('section', { class: 'insp-step' }, h('h3', { text: '3. Estimated harvest' }),
          h('div', { class: 'qty-step' }, step(-5), step(-1), qty, step(1), step(5)), qtyNote, learnNote),
        h('section', { class: 'insp-step' }, h('h3', { text: '4. Greenhouse reading (optional)' }),
          h('div', { class: 'gh-reading' },
            h('label', null, 'Temperature inside (°C)', inTemp), h('label', null, 'Humidity inside (%)', inHum)),
          h('small', { class: 'hint', text: 'From the thermometer in ' + row.greenhouse + ', if there is one. Saved separately from NEA\'s outdoor forecast, which is attached automatically' + (weatherNow ? ' (' + (weatherNow.source === 'live' ? 'live' : 'demo') + ': ' + weatherNow.day.text.toLowerCase() + ', ' + weatherNow.day.low + '–' + weatherNow.day.high + '°C).' : '.') })),
        h('section', { class: 'insp-step' }, h('h3', { text: '5. Notes' }),
          h('div', { class: 'filters note-chips' }, NOTE_CHIPS.map(function (t) {
            return h('button', { type: 'button', class: 'chip', text: t, onclick: function () { notes.value = (notes.value ? notes.value.replace(/\s*$/, '') + ', ' : '') + t.toLowerCase(); } });
          })), notes),
        err),
      h('div', { class: 'r-actions' },
        h('button', { class: 'btn btn-sm btn-outline', type: 'button', text: 'Cancel', onclick: closeDialog }),
        h('button', { class: 'btn btn-sm btn-forest', type: 'button', text: 'Save & next', onclick: function () {
          if (!st.condition) { err.textContent = 'Choose the condition first.'; return; }
          var r = M.inspect.save({ batchId: b.id, condition: st.condition, estQty: qty.value, notes: notes.value,
            photo: st.photo ? { url: st.photo.url, grade: st.photo.grade, reason: st.photo.reason, simulated: st.photo.simulated } : null,
            indoor: { tempC: inTemp.value, humidity: inHum.value }, weather: weatherNow }, session.email);
          if (!r.ok) { err.textContent = r.error; return; }
          closeDialog();
          M.audit(session.email, 'inspect.saved', b.id);
          M.save();
          render();
          // Saved on the device; uploading (and sending the round) happens only on a receipt.
          trySync();
          // Straight on to the next batch that hasn't been checked.
          var next = M.inspect.status(M.inspect.openRound()).rows.filter(function (x) { return !x.inspection; })[0];
          if (next && onDone !== false) openInspect(next);
        } })));
    dlg.addEventListener('close', function () { dlg.remove(); });
    document.body.appendChild(dlg);
    dlg.showModal();
    drawPhoto(); drawCond(); drawQty();
  }

  // The round, as greenhouse cards. Shared by the worker's page and the staff page:
  // a hero with a progress ring and the next batch, filter chips, then one card per greenhouse.
  function daysToHarvest(b) { return Math.round((M.clearance.parseDayKey(b.harvestDate) - new Date().setHours(0, 0, 0, 0)) / 864e5); }
  function progressRing(done, total) {
    var r = 42, c = 2 * Math.PI * r, pct = total ? done / total : 0;
    var el = h('div', { class: 'rnd-ring', role: 'img', 'aria-label': done + ' of ' + total + ' batches checked' });
    el.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="' + r + '" class="ring-bg"/>' +
      '<circle cx="50" cy="50" r="' + r + '" class="ring-fg" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - pct)).toFixed(1) + '"/></svg>';
    append(el, h('span', { class: 'ring-num' }, h('strong', { text: String(done) }), h('small', { text: 'of ' + total })));
    return el;
  }
  var ROUND_FILTERS = [['all', 'All'], ['todo', 'To check'], ['done', 'Checked'], ['soon', 'Harvest ≤ 2 days']];
  // opts.kpis: the worker's Overview shows the standard KPI row under the hero (the staff page
  // has its own KPI row, so there the hero keeps its small stats instead).
  function roundChecklist(opts) {
    opts = opts || {};
    var s = M.inspect.status(M.inspect.openRound());
    var st = roundChecklist.state || (roundChecklist.state = { filter: 'all' });
    var next = s.rows.filter(function (r) { return !r.inspection; })[0];
    var soon = s.rows.filter(function (r) { return daysToHarvest(r.batch) <= 2; });
    var flagged = s.rows.filter(function (r) { return r.inspection && r.inspection.condition !== 'healthy'; });
    var notReceived = s.rows.filter(function (r) { return r.inspection && M.inspect.syncStatus(r.inspection.id) !== 'received'; }).length;
    var hour = new Date().getHours();
    var hello = (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening') + (session.role === 'worker' ? ', ' + session.name.split(' ')[0] : '');
    var start = function () { if (next) openInspect(next); };

    var hero = h('section', { class: 'rnd-hero2' + (s.complete ? ' done' : '') },
      progressRing(s.checked, s.total),
      h('div', { class: 'rnd-hero-text' },
        h('span', { class: 'rnd-eyebrow', text: new Date().toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long' }) + ' · Greenhouse round' }),
        h('h2', { text: hello + ' 🌱' }),
        next ? h('p', { class: 'rnd-next' }, h('span', { text: s.checked ? 'Next up: ' : 'First up: ' }), h('strong', { text: next.greenhouse + ' · ' + next.product.title }), h('span', { text: ', harvest ' + harvestInText(next.batch) }))
          : h('p', { class: 'rnd-next', text: !s.total ? 'Nothing is growing right now.' : notReceived ? 'Every batch is checked. ' + notReceived + ' still to upload before the round is sent.' : 'Every batch is checked. Nice work!' }),
        opts.kpis ? null : h('ul', { class: 'rnd-stats' },
          h('li', null, h('strong', { text: String(s.total) }), h('span', { text: ' batches' })),
          h('li', null, h('strong', { text: String(Object.keys(s.rows.reduce(function (o, r) { o[r.greenhouse] = 1; return o; }, {})).length) }), h('span', { text: ' greenhouses' })),
          h('li', { class: soon.length ? 'warm' : '' }, h('strong', { text: String(soon.length) }), h('span', { text: ' harvest within 2 days' })),
          flagged.length ? h('li', { class: 'alert' }, h('strong', { text: String(flagged.length) }), h('span', { text: flagged.length === 1 ? ' needs attention' : ' need attention' })) : null),
        h('div', { class: 'rnd-actions' },
          next ? h('button', { class: 'btn btn-gold rnd-cta', type: 'button', onclick: start }, s.checked ? 'Continue round' : 'Start round', h('span', { 'aria-hidden': 'true', text: ' →' })) : null,
          // A part-finished round can be sent only once everything checked so far has been received.
          s.checked && !s.complete ? h('button', { class: 'btn btn-ghost rnd-send', type: 'button', disabled: notReceived > 0, text: notReceived ? 'Send now (' + notReceived + ' still uploading)' : 'Send now',
            title: (s.total - s.checked) + ' not checked keep their plan', onclick: function () {
            if (!confirm('Send the round now? ' + (s.total - s.checked) + ' batch(es) not checked will keep their current plan.')) return;
            var r = M.inspect.submit(s.round.id, session.email);
            if (!r.ok) { toast(r.error); return; }
            commit('inspect.sent', s.round.id, 'Round sent: ' + r.applied + ' estimate(s) updated' + (r.held ? ', ' + r.held + ' waiting for the farm manager' : '') + '.');
          } }) : null),
        syncStrip(),
        h('small', { class: 'rnd-rule', text: 'Each check is saved on this phone first. The round is sent once every batch is checked and received by Tyllage. Changes within ±' + Math.round(M.RULES.inspect.autoApplyPct * 100) + '% go straight into the harvest plan; bigger ones go to the farm manager.' })));

    var count = { all: s.rows.length, todo: s.total - s.checked, done: s.checked, soon: soon.length };
    var keep = function (r) { return st.filter === 'all' || (st.filter === 'todo' ? !r.inspection : st.filter === 'done' ? Boolean(r.inspection) : daysToHarvest(r.batch) <= 2); };
    var grid = h('div', { class: 'gh-grid' });
    function drawGrid() {
      grid.textContent = '';
      var groups = {};
      s.rows.filter(keep).forEach(function (r) { (groups[r.greenhouse] = groups[r.greenhouse] || []).push(r); });
      var keys = Object.keys(groups).sort();
      if (!keys.length) { append(grid, h('p', { class: 'empty', text: st.filter === 'todo' ? 'Nothing left to check. 🎉' : 'Nothing here.' })); return; }
      keys.forEach(function (g) {
        var all = s.rows.filter(function (r) { return r.greenhouse === g; }), doneN = all.filter(function (r) { return r.inspection; }).length;
        append(grid, h('section', { class: 'gh-card' + (doneN === all.length ? ' complete' : '') },
          h('header', { class: 'gh-card-head' },
            h('span', { class: 'gh-name' }, h('small', { text: 'Greenhouse' }), h('strong', { text: g })),
            h('span', { class: 'gh-dots', 'aria-label': doneN + ' of ' + all.length + ' checked' }, all.map(function (r) { return h('i', { class: r.inspection ? 'on' : '' }); })),
            doneN === all.length ? h('span', { class: 'gh-done', text: '✓ Done' }) : h('span', { class: 'gh-count', text: doneN + '/' + all.length })),
          groups[g].map(function (r) {
            var i = r.inspection, d = daysToHarvest(r.batch);
            var when = h('span', { class: 'gh-when' + (d <= 0 ? ' now' : d <= 2 ? ' soon' : '') }, h('small', { text: 'Harvest' }), h('strong', { text: d <= 0 ? 'Today' : d === 1 ? '1 day' : d + ' days' }));
            return h('button', { type: 'button', class: 'gh-batch' + (i ? ' checked' : ''), 'aria-label': (i ? 'Redo ' : 'Check ') + r.product.title + ' in ' + g, onclick: function () { openInspect(r); } },
              h('span', { class: 'gh-pic' }, i && i.photo ? h('img', { src: i.photo.url, alt: '' }) : thumb(r.product), i ? h('span', { class: 'gh-tick', 'aria-hidden': 'true', text: '✓' }) : null),
              h('span', { class: 'gh-info' },
                h('strong', { text: r.product.title }),
                h('small', { text: 'Plan ' + r.batch.expectedQty + ' · ' + kgText(r.product, r.batch.expectedQty) }),
                i ? h('span', { class: 'gh-result' }, conditionBadge(i.condition), h('small', { text: i.estQty === r.batch.expectedQty ? 'On plan' : 'Estimate ' + i.estQty }), syncBadge(i.id)) : null),
              when,
              h('span', { class: 'gh-go' + (i ? ' redo' : ''), text: i ? 'Redo' : 'Check' }));
          })));
      });
    }
    var chips = h('div', { class: 'filters rnd-filters', role: 'toolbar', 'aria-label': 'Filter batches' });
    function drawChips() {
      chips.textContent = '';
      ROUND_FILTERS.forEach(function (f) {
        append(chips, h('button', { type: 'button', class: 'chip' + (st.filter === f[0] ? ' active' : ''), 'aria-pressed': String(st.filter === f[0]),
          onclick: function () { st.filter = f[0]; drawChips(); drawGrid(); } }, f[1] + ' ', h('span', { class: 'chip-count', text: String(count[f[0]]) })));
      });
    }
    drawChips(); drawGrid();
    // Phones: the next step stays in reach at the bottom of the screen.
    var dock = next ? h('div', { class: 'rnd-dock' }, h('span', null, h('strong', { text: s.checked + ' of ' + s.total }), h('small', { text: ' checked' })),
      h('button', { class: 'btn btn-gold', type: 'button', text: s.checked ? 'Continue →' : 'Start round →', onclick: start })) : null;
    var kpiRow = opts.kpis ? h('div', { class: 'kpis' },
      kpi('Checked today', s.checked + ' of ' + s.total, 'batches in this round'),
      kpi('Harvest ≤ 2 days', String(soon.length), 'check these first'),
      kpi('Need attention', String(flagged.length), 'marked Monitor or Needs review'),
      kpi('Not yet received', String(M.inspect.outbox().unsynced), 'saved on this phone')) : null;
    return h('div', { class: 'rnd' }, hero, kpiRow, weatherCard(), s.total ? chips : null, s.total ? grid : null, dock);
  }
  function roundSummary(r, showImpact) {
    var items = (r.items || []).filter(function (x) { return x.status !== 'unchecked'; });
    var count = function (k) { return items.filter(function (x) { return x.status === k; }).length; };
    // The callout counts unchanged batches; the table lists only what changed or needs a decision.
    var listed = items.filter(function (x) { return x.status !== 'same' || x.condition !== 'healthy'; });
    var STATUS = { applied: ['Updated', 'green'], same: ['No change', 'grey'], held: ['Waiting for manager', 'amber'], approved: ['Approved', 'green'], kept: ['Kept old plan', 'grey'] };
    return h('div', { class: 'rnd-summary' },
      h('p', { class: 'callout green', text: 'Sent ' + ago(r.submittedAt) + ' by ' + r.submittedBy + ': ' + count('applied') + ' updated, ' + count('same') + ' unchanged, ' + count('held') + ' waiting for the farm manager' +
        ((r.items || []).length - items.length ? ', ' + ((r.items || []).length - items.length) + ' not checked' : '') + '.' }),
      table([
        { label: 'Batch', render: function (x) { var b = M.byId('batches', x.batchId), p = b && M.byId('products', b.productId); return h('span', null, h('strong', { text: p ? p.title : x.batchId }), h('br'), h('small', { text: (b ? M.inspect.greenhouse(b) : '') + ' · ' + x.batchId }),
          showImpact && b ? [h('br'), mini('History', function () { openBatchHistory(b); })] : null); } },
        { label: 'Condition', render: function (x) { return conditionBadge(x.condition); } },
        { label: 'Estimate', num: true, render: function (x) { return x.from === x.to ? String(x.to) : x.from + ' → ' + x.to + ' (' + (x.changePct > 0 ? '+' : '') + x.changePct + '%)'; } },
        { label: 'Status', render: function (x) { return h('span', { class: 'ptype' }, badge(STATUS[x.status][0], STATUS[x.status][1]), x.shortfall ? h('small', { class: 'bag-value-low', text: ' short ' + x.shortfall + ' of confirmed orders' }) : null); } },
        showImpact ? { label: 'Campaign Advisor now', render: function (x) { return h('small', { text: promoNow(x.batchId) }); } } : null
      ].filter(Boolean), listed, items.length ? 'Every batch checked was healthy and on plan.' : 'No batches were checked in this round.'));
  }

  // Farm worker: today's round, and what happened to the last one.
  function roundView(root) {
    var last = (S().rounds || []).filter(function (r) { return r.status === 'submitted'; })[0];
    if (last && !M.inspect.openRound() && M.clearance.dayKey(new Date(last.submittedAt)) === M.clearance.dayKey(new Date())) {
      append(root, panel('Today\'s round is sent', 'Thanks! The harvest plan and sales planning now use your numbers. Start another round if you check the greenhouses again today.',
        roundSummary(last, false)));
    }
    append(root, roundChecklist({ kpis: true }));
    append(root, deviceStorageCard());
  }
  function pastRoundsView(root) {
    var rounds = (S().rounds || []).filter(function (r) { return r.status === 'submitted'; }).slice(0, 10);
    if (!rounds.length) { append(root, panel(null, null, h('p', { class: 'empty', text: 'No rounds sent yet.' }))); return; }
    rounds.forEach(function (r) { append(root, panel(shortWeekday(r.submittedAt), null, roundSummary(r, false))); });
  }

  // Staff / admin: estimates waiting for review, today's round, and recent rounds with their effect on sales.
  function roundsAdminView(root) {
    var s = M.inspect.status(M.inspect.openRound()), held = M.inspect.held();
    var canReview = M.auth.can(session, 'inspect.review');
    var lastSent = (S().rounds || []).filter(function (r) { return r.status === 'submitted'; })[0];
    var risks = M.inspect.risks(), tasks = (S().tasks || []).filter(function (t) { return t.status === 'open'; });
    append(root, h('div', { class: 'kpis' },
      kpi('Today\'s round', s.checked + ' of ' + s.total, 'batches checked'),
      kpi('Waiting for review', String(held.length), 'estimate changes'),
      kpi('Commitment risks', String(risks.length), risks.filter(function (r) { return r.pending; }).length + ' potential · ' + risks.filter(function (r) { return !r.pending; }).length + ' confirmed'),
      kpi('Sales follow-ups', String(tasks.length), 'open tasks')));
    append(root, healthMap());
    if (risks.length) append(root, panel(aiTitle('Harvest commitment risk'), 'Batches whose estimate is below what\'s already been promised: confirmed trade orders and the batch\'s own pre-orders, each counted once. Usual shop sales are estimates, so they\'re left out. A worker\'s estimate that\'s still waiting for review is shown as a potential shortfall, not a fact.',
      h('div', { class: 'risk-list' }, risks.map(riskCard))));
    append(root, tasksPanel(tasks));
    append(root, panel('Waiting for your review', 'Estimates that change a batch by more than ±' + Math.round(M.RULES.inspect.autoApplyPct * 100) + '%, or that the worker marked "Needs review". Approving updates the harvest plan, and Demand Radar, Harvest Drops and Campaign Advisor follow.',
      table([
        { label: 'Batch', render: function (x) { var p = M.byId('products', x.batch.productId); return h('span', null, h('strong', { text: p.title }), h('br'), h('small', { text: M.inspect.greenhouse(x.batch) + ' · harvest ' + harvestInText(x.batch) }), h('br'), mini('History', function () { openBatchHistory(x.batch); })); } },
        { label: 'Inspection', render: function (x) {
          var i = x.inspection;
          return h('span', { class: 'rv-insp' }, i && i.photo ? h('img', { class: 'gh-thumb', src: i.photo.url, alt: 'Inspection photo' }) : null,
            h('span', null, conditionBadge(x.item.condition), h('br'), h('small', { text: (i && i.photo && i.photo.reason ? i.photo.reason + ' ' : '') + (i && i.notes ? '“' + i.notes + '”' : '') })));
        } },
        { label: 'Change', num: true, render: function (x) { return h('span', null, h('strong', { text: x.item.from + ' → ' + x.item.to }), h('br'), h('small', { text: (x.item.changePct > 0 ? '+' : '') + x.item.changePct + '% · ' + x.item.reason })); } },
        { label: 'If approved', render: function (x) { return h('small', { text: impactIfApproved(x) }); } },
        { label: 'Actions', render: function (x) {
          if (!canReview) return h('small', { text: 'Waiting for the farm manager' });
          return h('div', { class: 'actions' },
            mini('Approve', function () { decideEstimate(x, true); }),
            mini('Keep old plan', function () { decideEstimate(x, false); }));
        } }
      ], held, 'Nothing waiting. Every estimate from the last round is in the plan.')));
    append(root, panel('Today\'s round', 'Workers do this on their phones (worker@meod.test). Staff can check a batch here too.', roundChecklist()));
    append(root, learningPanel());
    append(root, deadZonePanel());
    if (!canReview) append(root, h('p', { class: 'callout', text: 'Only the farm manager (admin) approves estimate changes. You can see them, their effect on orders, and the follow-up tasks.' }));
    var recent = (S().rounds || []).filter(function (r) { return r.status === 'submitted'; }).slice(0, 3);
    recent.forEach(function (r, idx) {
      append(root, panel(idx ? 'Round ' + shortWeekday(r.submittedAt) : 'Last round', 'What the workers found, and what Campaign Advisor suggests for each harvest now.', roundSummary(r, true)));
    });
  }
  // A held estimate's effect on confirmed orders, before anyone approves it.
  function impactIfApproved(x) {
    var r = M.inspect.risk(x.batch, x.item.to, true);
    var conf = 'Confirmed orders ' + r.confirmed + ' (trade ' + r.trade + ', pre-orders ' + r.preorder + ')';
    if (r.shortfall) return conf + '. Potential shortfall ' + r.shortfall + ' across ' + r.affected.length + ' order(s); approving creates follow-up tasks for sales.';
    var d = M.promo.drops().filter(function (y) { return y.batch.id === x.batch.id; })[0];
    return conf + ', all covered.' + (d ? ' Uncommitted after usual sales: ' + d.uncommitted + ' → ' + Math.max(0, d.uncommitted + x.item.to - x.item.from) + '.' : '');
  }
  // Approve or keep, with an optional reason saved as the decision record.
  function decideEstimate(x, approve) {
    var reason = prompt(approve ? 'Approve ' + x.item.from + ' → ' + x.item.to + '. Reason (optional):' : 'Keep the plan of ' + x.item.from + '. Reason (optional):', '');
    if (reason === null) return;
    var r = M.inspect.review(x.round.id, x.batch.id, approve, session.email, reason);
    if (!r.ok) { toast(r.error); return; }
    commit(approve ? 'inspect.approved' : 'inspect.kept', x.batch.id, approve
      ? 'Estimate updated to ' + x.item.to + (r.risk && r.risk.shortfall ? '. Short ' + r.risk.shortfall + ' of confirmed orders: ' + r.tasksCreated + ' follow-up task(s) created for sales.' : '.')
      : 'Kept the plan of ' + x.item.from + '. Harvest Drop offers for this batch can resume.');
  }
  var RISK_ROW = { covered: ['Covered', 'green'], partial: ['Partly at risk', 'amber'], 'at-risk': ['At risk', 'red'] };
  function riskCard(r) {
    var b = r.batch, p = M.byId('products', b.productId);
    var cell = function (label, v, cls) { return h('li', { class: cls || '' }, h('small', { text: label }), h('strong', { text: String(v) })); };
    var steps = r.pending
      ? ['New Harvest Drop offers for this batch are paused.', 'Check the batch (History has the photos), then approve or keep the estimate.', 'Approving creates a follow-up task for each affected order. Nothing is sent to customers.']
      : ['Harvest Drop offers and promotions for this batch are off.', 'Sales follow up each affected order (tasks below): a smaller quantity, a substitute or a later delivery.', 'Availability opens again only if a later round raises the estimate.'];
    return h('article', { class: 'risk-card' + (r.pending ? ' pending' : '') },
      h('div', { class: 'risk-head' },
        h('span', null, h('strong', { text: p.title + ' · ' + M.inspect.greenhouse(b) }), h('small', { text: ' batch ' + b.id + ' · harvest ' + harvestInText(b) })),
        h('span', { class: 'ptype' }, badge(r.pending ? 'Potential shortfall · manager review' : 'Confirmed shortfall', r.pending ? 'amber' : 'red'))),
      h('ul', { class: 'drop-stats wide' },
        cell(r.pending ? 'Proposed estimate' : 'Approved estimate', r.estimate + (r.pending ? ' (plan ' + b.expectedQty + ')' : '')),
        cell('Confirmed trade orders', r.trade), cell('Batch pre-orders', r.preorder), cell(r.pending ? 'Potential shortfall' : 'Shortfall', r.shortfall, 'hl')),
      h('ul', { class: 'risk-steps' }, steps.map(function (t) { return h('li', { text: t }); })),
      h('details', { class: 'cp-vs' }, h('summary', { text: r.affected.length + ' affected order(s) of ' + r.rows.length }),
        table([
          { label: 'Order', render: function (x) { return h('span', null, h('strong', { text: x.ref }), h('br'), h('small', { text: (x.kind === 'trade' ? 'Trade · ' : 'Pre-order · ') + (x.kind === 'trade' ? x.who : customerLabel(x.customerId)) })); } },
          { label: 'When', render: function (x) { return x.dayKey ? shortWeekday(M.clearance.parseDayKey(x.dayKey).toISOString()) : 'Harvest day'; } },
          { label: 'Qty', num: true, render: function (x) { return String(x.qty); } },
          { label: 'Covered', num: true, render: function (x) { return String(x.covered); } },
          { label: 'Status', render: function (x) { return h('span', { class: 'ptype' }, badge(RISK_ROW[x.status][0], RISK_ROW[x.status][1])); } }
        ], r.rows, '')),
      h('div', { class: 'actions' }, mini('History', function () { openBatchHistory(b); })));
  }
  function tasksPanel(open) {
    var done = (S().tasks || []).filter(function (t) { return t.status !== 'open'; }).slice(0, 5);
    return panel('Sales follow-ups', 'Internal tasks, one per order that a lower harvest may not cover. Tyllage never contacts customers on its own; staff agree a smaller quantity, a substitute or a later delivery, and any message still goes through the usual approval and consent checks.',
      table([
        { label: 'Task', render: function (t) { return h('span', null, h('strong', { text: t.title }), t.customerId ? h('small', { text: ' · ' + customerLabel(t.customerId) }) : null, h('br'), h('small', { text: t.detail })); } },
        { label: 'Due', render: function (t) { return shortWeekday(M.clearance.parseDayKey(t.dueKey).toISOString()); } },
        { label: 'Status', render: function (t) { return h('span', { class: 'ptype' }, badge(t.status === 'open' ? 'Open' : t.status === 'done' ? 'Done' : 'Resolved', t.status === 'open' ? 'amber' : 'green'), t.note ? h('small', { text: ' ' + t.note }) : null); } },
        { label: 'Actions', render: function (t) {
          if (t.status !== 'open') return '—';
          return mini('Mark done', function () {
            var note = prompt('What was agreed with the customer? (optional)', '');
            if (note === null) return;
            var r = M.inspect.closeTask(t.id, session.email, note);
            if (!r.ok) { toast(r.error); return; }
            commit('task.done', t.id, 'Task closed.');
          });
        } }
      ], open.concat(done), 'No follow-ups. Every confirmed order is covered by its harvest estimate.'));
  }
  var TREND_ICON = { improving: '↗', stable: '→', worsening: '↘', insufficient: '·' };
  // Outdoor forecast (NEA or demo) and the worker's indoor reading, kept visibly apart.
  function conditionsCell(i) {
    var w = i.weather, r = i.indoor;
    if (!w && !r) return h('small', { class: 'hint', text: 'Not recorded' });
    return h('span', { class: 'cond-cell' },
      w ? h('small', null, h('strong', { text: 'Outside (forecast): ' }), (w.now ? w.now + ' · ' : '') + w.lowC + '–' + w.highC + '°C, humidity up to ' + w.humidityHigh + '%',
        h('br'), h('span', { class: 'hint', text: w.source + (w.issuedAt ? ', issued ' + new Date(w.issuedAt).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' }) : '') + ' · ' + w.area })) : null,
      r ? h('small', null, h('strong', { text: 'Inside (thermometer): ' }), [r.tempC != null ? r.tempC + '°C' : null, r.humidity != null ? r.humidity + '% humidity' : null].filter(Boolean).join(', ')) : null);
  }
  // One batch's evidence: latest vs previous photo side by side, every inspection exactly as
  // the worker sent it, the manager's decisions and every change to the estimate.
  function openBatchHistory(b) {
    document.querySelectorAll('.hist-dialog').forEach(function (d) { if (d.open) d.close(); d.remove(); });
    var p = M.byId('products', b.productId), hist = M.inspect.history(b.id);
    var withPhoto = hist.inspections.filter(function (x) { return x.inspection.photo; });
    var dlg = h('dialog', { class: 'receipt-dialog reply-dialog hist-dialog', 'aria-labelledby': 'hi-title' });
    function closeDialog() { if (dlg.open) dlg.close(); dlg.remove(); }
    var fig = function (x, label) {
      var i = x.inspection;
      return h('figure', { class: 'hist-fig' }, h('img', { src: i.photo.url, alt: label + ' inspection photo' }),
        h('figcaption', null, h('strong', { text: label }), h('small', { text: shortWeekday(i.at) + ' · ' + i.by }), conditionBadge(i.condition),
          h('small', { text: 'Estimate ' + i.estQty + ' (plan then ' + i.expectedBefore + ')' })));
    };
    append(dlg,
      h('button', { class: 'pd-close', type: 'button', 'aria-label': 'Close', onclick: closeDialog }, iconCircle(ICONS.x, 'bare')),
      h('div', { class: 'rd-body' },
        h('div', { class: 'rd-head' }, h('h2', { id: 'hi-title', text: p.title + ' · ' + M.inspect.greenhouse(b) }), badge('Batch ' + b.id, 'grey')),
        h('small', { class: 'hint', text: 'Harvest ' + harvestInText(b) + ' · plan now ' + b.expectedQty + ' · ' + hist.inspections.length + ' inspection(s). Inspections are kept exactly as the worker sent them; decisions are added beside them.' }),
        (function () {
          var t = M.inspect.trend(b.id);
          return h('div', { class: 'hist-trend' }, h('span', { class: 'ptype' }, badge(TREND_ICON[t.key] + ' ' + t.label, t.tone)), h('small', { text: t.note + ' Based on what workers confirmed, not the photo check.' }));
        })(),
        withPhoto.length ? h('div', { class: 'hist-compare' }, withPhoto[1] ? fig(withPhoto[1], 'Previous') : h('div', { class: 'hist-none' }, h('small', { text: 'No earlier photo yet.' })), fig(withPhoto[0], 'Latest')) : null,
        h('h3', { class: 'hist-h', text: 'Inspections' }),
        table([
          { label: 'When', render: function (x) { return h('span', null, h('strong', { text: shortWeekday(x.inspection.at) }), h('br'), h('small', { text: x.inspection.by })); } },
          { label: 'Photo', render: function (x) { return x.inspection.photo ? h('img', { class: 'gh-thumb', src: x.inspection.photo.url, alt: '' }) : h('small', { text: 'None' }); } },
          { label: 'Condition', render: function (x) { return h('span', null, conditionBadge(x.inspection.condition), x.inspection.photo && x.inspection.photo.reason ? [h('br'), h('small', { text: 'Photo check: ' + x.inspection.photo.reason })] : null, x.inspection.notes ? [h('br'), h('small', { text: '“' + x.inspection.notes + '”' })] : null); } },
          { label: 'Conditions at the time', render: function (x) { return conditionsCell(x.inspection); } },
          { label: 'Estimate', num: true, render: function (x) { return x.inspection.expectedBefore + ' → ' + x.inspection.estQty; } },
          { label: 'Status', render: function (x) { return h('span', { class: 'ptype' }, badge(x.status[0], x.status[1])); } },
          { label: 'Decision', render: function (x) { var it = x.item; return it && it.reviewedBy ? h('small', { text: it.reviewedBy + ', ' + shortDate(it.reviewedAt) + (it.decisionReason ? ': “' + it.decisionReason + '”' : '') }) : '—'; } }
        ], hist.inspections, 'No inspections for this batch yet.'),
        h('h3', { class: 'hist-h', text: 'Estimate changes' }),
        table([
          { label: 'When', render: function (e) { return h('span', null, h('strong', { text: shortWeekday(e.at) }), h('br'), h('small', { text: e.by || '—' })); } },
          { label: 'Change', num: true, render: function (e) { return e.from + ' → ' + e.to; } },
          { label: 'How', render: function (e) { return h('span', null, e.source || '—', e.reason ? [h('br'), h('small', { text: '“' + e.reason + '”' })] : null); } }
        ], hist.log, 'The estimate hasn\'t changed since the batch was planned.')),
      h('div', { class: 'r-actions' }, h('button', { class: 'btn btn-sm btn-outline', type: 'button', text: 'Close', onclick: closeDialog })));
    dlg.addEventListener('close', function () { dlg.remove(); });
    document.body.appendChild(dlg);
    dlg.showModal();
  }

  /* ---------------- Weather (NEA, data.gov.sg) ----------------
   * The live public forecast for MEOD's area (Lim Chu Kang, west region). Only a GET to
   * data.gov.sg: nothing about MEOD or its customers is sent. Kept for 30 minutes; if it
   * can't be reached, a clearly labelled demo forecast is used instead. */
  var WEATHER_KEY = 'meod-weather', WEATHER_AREA = 'Lim Chu Kang';
  var weatherNow = null, weatherLoading = false;
  try { var wc = JSON.parse(sessionStorage.getItem(WEATHER_KEY) || 'null'); if (wc && Date.now() - wc.fetchedAt < 30 * 60e3) weatherNow = wc; } catch (e) { /* ignore */ }
  function demoWeather() {
    var d = new Date(); d.setHours(12, 0, 0, 0);
    return { source: 'demo', area: WEATHER_AREA, fetchedAt: Date.now(), now: { text: 'Partly Cloudy', until: 'next 2 hours' },
      day: { text: 'Thundery Showers', high: 33, low: 24, humHigh: 95 },
      periods: [{ text: 'Thundery Showers', label: 'Midday to 6 pm today', start: d.toISOString(), end: new Date(d.getTime() + 6 * 3600e3).toISOString() }] };
  }
  function fetchJson(url) {
    var ctl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 6000);
    return fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) { clearTimeout(t); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  var WEATHER_LAST_KEY = 'meod-weather-last';
  function lastSavedWeather() { try { var x = JSON.parse(localStorage.getItem(WEATHER_LAST_KEY) || 'null'); if (x) x.offline = true; return x; } catch (e) { return null; } }
  function loadWeather() {
    // No signal: show the last forecast saved on this phone (labelled), or demo weather.
    if (!canUpload()) { if (!weatherNow || !weatherNow.offline) weatherNow = lastSavedWeather() || demoWeather(); return; }
    if (weatherNow && weatherNow.offline) weatherNow = null;
    if (weatherNow || weatherLoading) return;
    weatherLoading = true;
    Promise.all([fetchJson('https://api-open.data.gov.sg/v2/real-time/api/twenty-four-hr-forecast'), fetchJson('https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast')])
      .then(function (res) {
        var rec = res[0].data.records[0], g = rec.general, two = res[1].data.items[0];
        var here = two.forecasts.filter(function (f) { return f.area === WEATHER_AREA; })[0];
        return { source: 'live', area: WEATHER_AREA, fetchedAt: Date.now(), updated: rec.updatedTimestamp,
          now: here ? { text: here.forecast, until: two.valid_period.text } : null,
          day: { text: g.forecast.text, high: g.temperature.high, low: g.temperature.low, humHigh: g.relativeHumidity.high },
          periods: rec.periods.map(function (p) { return { text: p.regions.west.text, label: p.timePeriod.text, start: p.timePeriod.start, end: p.timePeriod.end }; }) };
      })
      .catch(function () { return demoWeather(); })
      .then(function (w) {
        weatherNow = w; weatherLoading = false;
        try { sessionStorage.setItem(WEATHER_KEY, JSON.stringify(w)); if (w.source === 'live') localStorage.setItem(WEATHER_LAST_KEY, JSON.stringify(w)); } catch (e) { /* ignore */ }
        document.querySelectorAll('[data-weather]').forEach(function (el) { fillWeather(el); });
      });
  }
  function weatherIcon(text) { return /thunder/i.test(text) ? '⛈️' : /rain|shower/i.test(text) ? '🌧️' : /cloud|overcast/i.test(text) ? '⛅' : /haz/i.test(text) ? '🌫️' : '☀️'; }
  var ADVICE_ICON = { heat: '🌡️', rain: '☔', humid: '💧', fair: '✅', visit: '🧑‍🌾' };
  function fillWeather(el) {
    el.textContent = '';
    var w = weatherNow;
    if (!w) { append(el, h('p', { class: 'wx-loading', text: 'Getting today\'s forecast for Lim Chu Kang…' })); return; }
    var advice = M.inspect.weatherAdvice(w);
    append(el,
      h('div', { class: 'wx-now' },
        h('span', { class: 'wx-icon', 'aria-hidden': 'true', text: weatherIcon(w.now ? w.now.text : w.day.text) }),
        h('span', { class: 'wx-main' },
          h('small', { text: 'Outdoor forecast · ' + w.area }),
          h('strong', { text: w.now ? w.now.text + ' now' : w.day.text }),
          h('span', { class: 'wx-temps', text: w.day.low + '–' + w.day.high + '°C · humidity up to ' + w.day.humHigh + '% · ' + w.day.text.toLowerCase() + ' later' })),
        h('span', { class: 'ptype wx-src' }, badge(w.offline ? 'Last saved · offline' : w.source === 'live' ? 'Live · NEA' : 'Demo weather', w.offline ? 'amber' : w.source === 'live' ? 'green' : 'grey'))),
      h('ul', { class: 'wx-advice' }, advice.map(function (a) {
        return h('li', { class: 'wx-' + a.tone }, h('span', { class: 'wx-a-icon', 'aria-hidden': 'true', text: ADVICE_ICON[a.key] || '•' }),
          h('span', null, h('strong', { text: a.title }), h('small', { text: a.text })));
      })),
      h('small', { class: 'wx-foot', text: w.offline
        ? 'No signal: this is the last NEA forecast saved on this phone (issued ' + new Date(w.updated).toLocaleString('en-SG', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) + '). It may be out of date.'
        : w.source === 'live'
        ? 'Outdoor forecast from NEA via data.gov.sg (west region), issued ' + new Date(w.updated).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' }) + '. It isn\'t a reading inside the greenhouses or an official warning; staff follow NEA\'s guidance and decide. The advice is rules, not a prediction.'
        : 'data.gov.sg couldn\'t be reached, so this is simulated demo weather. The advice rules are the same.' }));
  }
  function weatherCard() {
    var el = h('section', { class: 'wx-card', 'data-weather': '', 'aria-label': 'Today\'s weather and advice' });
    loadWeather();
    fillWeather(el);
    return el;
  }

  /* ---------------- Greenhouse health map ---------------- */
  var HEALTH_LABEL = { healthy: 'Healthy', monitor: 'Monitor', review: 'Needs review' };
  function healthMap() {
    var tiles = M.inspect.health();
    return panel(aiTitle('Greenhouse health map'), 'Each greenhouse takes the colour of its most serious latest inspection. A greenhouse not checked for ' + M.RULES.inspect.staleDays + '+ days fades. Tap a crop to see its history.',
      h('div', { class: 'hm-legend' }, ['healthy', 'monitor', 'review'].map(function (k) { return h('span', { class: 'hm-key hm-' + k }, h('i'), HEALTH_LABEL[k]); }),
        h('span', { class: 'hm-key hm-stale' }, h('i'), 'Not checked recently')),
      h('div', { class: 'hm-grid' }, tiles.map(function (t) {
        var state = t.condition || 'none';
        return h('article', { class: 'hm-tile hm-' + state + (t.stale ? ' stale' : '') },
          h('header', null, h('strong', { text: t.name }), h('span', { class: 'hm-status', text: t.condition ? HEALTH_LABEL[t.condition] : 'No check yet' })),
          h('small', { class: 'hm-when', text: t.lastAt ? 'Checked ' + ago(t.lastAt) + (t.unchecked ? ' · ' + t.unchecked + ' not checked' : '') : 'Never checked' }),
          t.rows.length ? h('div', { class: 'hm-crops' }, t.rows.map(function (r) {
            var c = r.inspection ? r.inspection.condition : 'none';
            var t = M.inspect.trend(r.batch.id);
            return h('button', { type: 'button', class: 'hm-crop', title: 'History for ' + r.product.title + ' · ' + t.label, onclick: function () { openBatchHistory(r.batch); } }, h('i', { class: 'hm-dot hm-' + c }), r.product.title,
              t.key !== 'insufficient' ? h('span', { class: 'hm-trend hm-t-' + t.key, 'aria-label': t.label, text: TREND_ICON[t.key] }) : null);
          })) : h('small', { class: 'hm-empty', text: 'Nothing growing' }));
      })));
  }

  /* ---------------- Learning from inspections ---------------- */
  function learningPanel() {
    var L = M.inspect.learning(), C = M.inspect.CONDITIONS, keys = Object.keys(C);
    var minN = M.RULES.inspect.minHarvestsForBias;
    return panel(aiTitle('What Tyllage is learning'), 'Measured, not claimed. Every time a worker confirms or overrides the photo check, it becomes a labelled example. Every harvest is compared with the last worker estimate. This is the dataset a trained model would need later.',
      h('div', { class: 'kpis lr-kpis' },
        kpi('Labelled photo examples', String(L.examples), L.fromDemoHistory + ' from demo history · ' + L.fromDemoPhotos + ' from demo photos'),
        kpi('Photo check agrees with workers', L.agreementPct == null ? '—' : L.agreementPct + '%', L.agree + ' of ' + L.examples),
        kpi('Flagged too much / too little', L.overflags + ' / ' + L.underflags, 'photo suggested worse / better than the worker'),
        kpi('Harvests compared', String(L.harvests), 'worker estimate vs real yield')),
      h('div', { class: 'lr-grid' },
        h('div', null, h('h3', { class: 'hist-h', text: 'Photo suggestion vs worker decision' }),
          h('div', { class: 'table-wrap' }, h('table', { class: 'lr-matrix' },
            h('thead', null, h('tr', null, h('th', { text: 'Photo suggested ↓ · worker chose →' }), keys.map(function (k) { return h('th', { class: 'num', text: C[k].label }); }))),
            h('tbody', null, keys.map(function (s) {
              return h('tr', null, h('th', { text: C[s].label }), keys.map(function (c) { var n = L.matrix[s][c]; return h('td', { class: 'num' + (s === c ? ' lr-agree' : n ? ' lr-miss' : ''), text: String(n) }); }));
            })))),
          h('small', { class: 'hint', text: L.overflags > L.underflags ? 'The check flags healthy crops more often than it misses problems (e.g. strong light or purple leaves read as yellowing). Safer that way round, but workers should keep the final say.' : 'Disagreements are balanced. Keep collecting before trusting it more.' })),
        h('div', null, h('h3', { class: 'hist-h', text: 'Estimate accuracy by crop' }),
          table([
            { label: 'Crop', render: function (b) { return h('strong', { text: b.product.title }); } },
            { label: 'Harvests', num: true, render: function (b) { return String(b.n); } },
            { label: 'Estimates run', num: true, render: function (b) { return b.biasPct === 0 ? 'on target' : Math.abs(b.biasPct) + '% ' + (b.biasPct > 0 ? 'high' : 'low'); } },
            { label: 'Suggestion', render: function (b) {
              return b.ok ? h('small', { text: 'Workers see a corrected figure (×' + (Math.round(b.factor * 100) / 100) + ')' })
                : h('small', { class: 'hint', text: b.n < minN ? 'Needs ' + minN + '+ harvests' : 'Within ±5%, no correction' });
            } }
          ], L.crops, 'No harvests with an inspection yet.'),
          h('small', { class: 'hint', text: 'Includes 12 weeks of demo history. Real harvests are added automatically when a batch with an inspection is marked harvested.' }))));
  }

  /* ---------------- Seasonal and festive demand ---------------- */
  var SEASON_ACTION = { covered: ['Covered', 'green'], sow: ['Sow more', 'amber'], late: ['Too late to sow', 'red'] };
  function festiveCropsTable(o) {
    return table([
      { label: 'Crop', render: function (c) { return h('span', { class: 'rw-tier-cell' }, thumbMini(c.product), h('strong', { text: c.product.title })); } },
      { label: 'Usual / week', num: true, render: function (c) { return String(Math.round(c.weekly)); } },
      { label: 'Festive demand', num: true, render: function (c) { return String(c.demand); } },
      { label: 'Planned harvest', num: true, render: function (c) { return String(c.supply); } },
      { label: 'Gap', num: true, render: function (c) { return c.gap > 0 ? h('strong', { class: 'bag-value-low', text: '−' + c.gap }) : '—'; } },
      { label: 'What to do', render: function (c) {
        var a = SEASON_ACTION[c.action];
        return h('span', null, h('span', { class: 'ptype' }, badge(a[0], a[1])), h('br'), h('small', { text: c.action === 'sow' ? 'Sow ' + c.gap + ' more by ' + shortWeekday(M.clearance.parseDayKey(c.sowBy).toISOString()) + ' (' + c.growDays + ' days to grow)'
          : c.action === 'late' ? 'Lean on pre-orders and other crops' : 'Planned harvests cover it' }));
      } }
    ], o.crops, '');
  }
  function seasonsView(root) {
    var list = M.seasons.outlook(160);
    append(root, h('p', { class: 'callout', text: 'Festival dates follow Singapore\'s public holidays (Hari Raya dates depend on the moon sighting). The demand uplifts are illustrative until MEOD\'s own sales from past festivals replace them.' }));
    append(root, panel(aiTitle('Festive demand ahead'), 'For each festival: how much more of each crop people usually buy in the ' + M.seasons.WINDOW_DAYS + ' days before, what\'s planned to be harvested then, and when to sow to close the gap. Campaign Advisor suggests a festive pre-order message 3 weeks before.',
      list.length ? h('div', { class: 'fest-list' }, list.map(function (o) {
        var f = o.festival;
        return h('article', { class: 'fest-card' + (o.daysAway <= 21 ? ' soon' : '') },
          h('header', { class: 'fest-head' },
            h('span', { class: 'fest-date' }, h('strong', { text: String(M.clearance.parseDayKey(f.date).getDate()) }), h('small', { text: M.clearance.parseDayKey(f.date).toLocaleDateString('en-SG', { month: 'short' }) })),
            h('span', { class: 'fest-name' }, h('strong', { text: f.name + (f.approx ? ' (approx.)' : '') }), h('small', { text: 'In ' + o.daysAway + ' days · usually +' + Math.round(f.uplift * 100) + '% · ' + f.why })),
            o.short.length ? h('span', { class: 'ptype' }, badge(o.short.length + ' crop(s) short', 'amber')) : h('span', { class: 'ptype' }, badge('Covered', 'green'))),
          festiveCropsTable(o));
      })) : h('p', { class: 'empty', text: 'No festivals in the next few months.' })));
    append(root, marketPricePanel());
  }
  // Supermarket price checks: where MEOD's price sits.
  var POSITION = { premium: ['Premium', 'blue'], at: ['At market', 'green'], below: ['Below market', 'amber'] };
  function marketPricePanel() {
    var rows = M.seasons.compare(30);
    var prod = h('select', { 'aria-label': 'Product' }, S().products.filter(function (p) { return p.category !== 'farm-more'; }).map(function (p) { return h('option', { value: p.id, text: p.title }); }));
    var store = h('select', { 'aria-label': 'Store' }, M.seasons.STORES.map(function (s) { return h('option', { value: s, text: s }); }));
    var price = h('input', { type: 'number', min: 0.01, step: 0.05, placeholder: '3.20', 'aria-label': 'Price in S$' });
    var note = h('input', { maxlength: 80, placeholder: 'e.g. 300 g pack, imported', 'aria-label': 'Note' });
    var f = h('form', { class: 'form-grid mp-form', novalidate: true },
      h('label', null, 'Product', prod), h('label', null, 'Store', store), h('label', null, 'Price (S$, similar pack)', price), h('label', null, 'Note', note),
      h('div', null, h('button', { class: 'btn btn-sm btn-forest', type: 'submit', text: 'Add price check' })));
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var r = M.seasons.addPrice({ productId: prod.value, store: store.value, priceCents: Math.round(parseFloat(price.value) * 100), note: note.value }, session.email);
      if (!r.ok) { toast(r.error); return; }
      commit('market.price', r.record.productId, 'Price check saved.');
    });
    return panel('Market price check', 'Prices staff spot at supermarkets and markets for a similar pack, from the last 30 days, against MEOD\'s own price. MEOD sells fresher and pesticide-free, so a premium can be fine; use this with Price Advisor, not instead of it.',
      table([
        { label: 'Product', render: function (x) { return h('strong', { text: x.product.title }); } },
        { label: 'MEOD', num: true, render: function (x) { return money(x.product.priceCents); } },
        { label: 'Market (avg)', num: true, render: function (x) { return h('span', null, money(x.avgCents), h('br'), h('small', { text: money(x.minCents) + '–' + money(x.maxCents) + ' · ' + x.checks.length + ' check(s)' })); } },
        { label: 'Difference', num: true, render: function (x) { return (x.diffPct > 0 ? '+' : '') + x.diffPct + '%'; } },
        { label: 'Position', render: function (x) { var p = POSITION[x.position]; return h('span', { class: 'ptype' }, badge(p[0], p[1])); } },
        { label: 'Stores', render: function (x) { return h('small', { text: x.checks.map(function (m) { return m.store + ' ' + money(m.priceCents) + (m.demo ? ' (demo)' : ''); }).join(' · ') }); } }
      ], rows, 'No price checks in the last 30 days.'),
      f);
  }
  // Harvest Planner: festivals whose sowing deadline is in the next 3 weeks.
  function festiveSowPanel() {
    var due = [];
    M.seasons.outlook(160).forEach(function (o) { o.crops.forEach(function (c) { if (c.action === 'sow' && c.daysToSow <= 21) due.push({ o: o, c: c }); }); });
    if (!due.length) return null;
    return panel(aiTitle('Sow now for the festivals'), 'Crops whose festive demand isn\'t covered by planned harvests, with the last day to sow so they\'re ready in time.',
      h('ul', { class: 'fest-sow' }, due.map(function (x) {
        return h('li', null, h('strong', { text: x.c.product.title + ': sow ' + x.c.gap + ' more by ' + shortWeekday(M.clearance.parseDayKey(x.c.sowBy).toISOString()) }),
          h('small', { text: ' for ' + x.o.festival.name + ' (' + shortWeekday(M.clearance.parseDayKey(x.o.festival.date).toISOString()) + '), ' + (x.c.daysToSow <= 0 ? 'today is the last day' : x.c.daysToSow + ' days left to sow') }));
      })),
      h('a', { class: 'mini', href: '#seasons', text: 'Seasonal calendar' }));
  }
  function festiveAudience(crops) {
    var ids = {};
    crops.forEach(function (c) { audienceFor(c.product.id).eligible.forEach(function (id) { ids[id] = true; }); });
    return Object.keys(ids);
  }
  function festiveDraft(o, crops) {
    var f = o.festival, id = M.nextId('CP');
    var names = crops.map(function (c) { return c.product.title; });
    var list = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
    S().campaigns.unshift({
      id: id, kind: 'festive', festival: f.key, productId: crops[0].product.id, title: f.name + ' — festive pre-orders', language: 'en',
      message: f.name + ' is coming 🌱 Fresh ' + list + ' from MEOD for your festive cooking. Pre-order in your MEOD account for delivery on Tue, Thu or Sat before ' + shortWeekday(M.clearance.parseDayKey(f.date).toISOString()) + '. Reply STOP to opt out.',
      audience: festiveAudience(crops), status: 'pending_approval', createdBy: session.email, approvedBy: null, createdAt: new Date().toISOString(), sentCount: 0
    });
    commit('campaign.submitted', id, f.name + ' message drafted for ' + festiveAudience(crops).length + ' opted-in buyer(s) — waiting for admin approval.');
  }

  /* ---------------- Offline-first rounds: upload queue (simulated server) ----------------
   * Every inspection is saved on the phone first. It uploads only when there's a connection,
   * and counts as received only when the (simulated) server acknowledges its own ID. Being
   * "online" is never taken as proof of receipt. A demo switch fakes a dead zone so the
   * whole cycle can be shown anywhere. Nothing is deleted from the phone after a receipt. */
  var SIM_OFFLINE_KEY = 'meod-sim-offline', syncing = false;
  function simOffline() { try { return sessionStorage.getItem(SIM_OFFLINE_KEY) === '1'; } catch (e) { return false; } }
  function setSimOffline(on) { try { if (on) sessionStorage.setItem(SIM_OFFLINE_KEY, '1'); else sessionStorage.removeItem(SIM_OFFLINE_KEY); } catch (e) { /* ignore */ } }
  function deviceOnline() { return navigator.onLine !== false; }
  function canUpload() { return deviceOnline() && !simOffline(); }
  function trySync(quiet) {
    if (syncing || !M.inspect.outbox().unsynced) return;
    if (!canUpload()) {
      if (M.inspect.wait()) { M.save(); render(); }
      if (!quiet) toast('Saved on this phone. No signal, so it will upload when the connection is back.');
      return;
    }
    syncing = true;
    // A short pause stands in for the upload; the signal can drop during it.
    setTimeout(function () {
      syncing = false;
      if (!canUpload()) { M.inspect.wait(); M.save(); render(); return; }
      var r = M.inspect.upload(session.email);
      var msg = r.received ? r.received + ' inspection(s) received by Tyllage (simulated server receipt).' : '';
      if (r.sent) {
        M.audit(session.email, 'inspect.sent', r.sent.round.id);
        msg += ' Round sent: ' + r.sent.applied + ' estimate(s) updated' + (r.sent.held ? ', ' + r.sent.held + ' waiting for the farm manager' : '') + '.';
      }
      M.save();
      if (msg) toast(msg);
      render();
    }, 700);
  }
  window.addEventListener('online', function () { trySync(true); render(); });
  window.addEventListener('offline', function () { M.inspect.wait(); M.save(); render(); });
  setInterval(function () { if (canUpload() && M.inspect.outbox().unsynced) trySync(true); }, 30000);

  var SYNC_LABEL = { saved: ['Saved on device', 'grey'], waiting: ['Waiting to upload', 'amber'], received: ['Received · simulated', 'green'] };
  function syncBadge(inspectionId) {
    if (!M.inspect.outboxEntry(inspectionId)) return null;
    var s = SYNC_LABEL[M.inspect.syncStatus(inspectionId)];
    return h('span', { class: 'ptype sync-badge' }, badge(s[0], s[1]));
  }
  function syncStrip() {
    var sum = M.inspect.outbox(), up = canUpload();
    var sw = h('input', { type: 'checkbox', checked: simOffline(), 'aria-label': 'Simulate no signal' });
    sw.addEventListener('change', function () {
      setSimOffline(sw.checked);
      if (sw.checked) { M.inspect.wait(); M.save(); toast('Demo: no signal. New inspections stay on this phone.'); render(); }
      else { toast('Demo: signal back. Uploading anything waiting…'); render(); trySync(true); }
    });
    return h('div', { class: 'sync-strip' },
      h('span', { class: 'sig ' + (up ? 'on' : 'off') }, up ? '📶 Signal' : simOffline() ? '📵 No signal (demo)' : '📵 No signal'),
      h('span', { class: 'sync-counts' },
        h('span', { text: sum.saved + sum.waiting + ' on phone, not yet received' }), h('span', { text: sum.received + ' received (simulated)' })),
      sum.unsynced && up ? h('button', { class: 'btn btn-sm btn-gold', type: 'button', text: 'Upload now', onclick: function () { trySync(); } }) : null,
      h('label', { class: 'sim-switch' }, sw, h('span', { text: 'Simulate no signal' })));
  }

  // What's on this phone, and the risk of losing it.
  function deviceStorageCard() {
    var ins = S().inspections || [], sum = M.inspect.outbox();
    var photoBytes = ins.reduce(function (s, i) { return s + (i.photo && i.photo.url ? i.photo.url.length : 0); }, 0);
    var stateBytes = 0;
    try { stateBytes = (localStorage.getItem('meod-demo-state-v2') || '').length; } catch (e) { /* ignore */ }
    var quota = h('small', { class: 'hint' });
    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (e) { if (e.quota) quota.textContent = 'The browser allows this app about ' + Math.round(e.quota / 1048576) + ' MB; it uses ' + kb(e.usage || 0) + ' (including the saved app files).'; });
    var kb = function (n) { return !n ? '0 KB' : n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (Math.round(n / 104857.6) / 10) + ' MB'; };
    return h('section', { class: 'dev-card' + (sum.unsynced ? ' warn' : '') },
      h('header', null, h('strong', { text: '📱 On this phone' }), installButton()),
      h('ul', { class: 'dev-stats' },
        h('li', null, h('strong', { text: String(ins.filter(function (i) { return i.by === session.email; }).length) }), h('small', { text: 'inspections by you' })),
        h('li', null, h('strong', { text: kb(photoBytes) }), h('small', { text: 'photo thumbnails' })),
        h('li', null, h('strong', { text: kb(stateBytes) }), h('small', { text: 'all app data' })),
        h('li', { class: sum.unsynced ? 'hot' : '' }, h('strong', { text: String(sum.unsynced) }), h('small', { text: 'not yet received' }))),
      h('small', { text: sum.unsynced
        ? 'Keep this phone\'s browser data until these show "Received". Don\'t clear browsing data or use a private window.'
        : 'Nothing waiting. In this prototype the phone is still the only copy, so nothing is deleted after a receipt.' }),
      quota,
      h('small', { class: 'hint', text: 'Before real use: a shared server, secure sign-in, a screen lock on work phones, and a way to wipe a lost phone.' }));
  }
  function installButton() {
    var P = window.MEOD_PWA;
    if (!P) return null;
    if (P.installed()) return h('span', { class: 'ptype' }, badge('Installed as an app', 'green'));
    if (!P.canInstall()) return h('small', { class: 'hint', text: P.isIOS() ? 'To install: Share → Add to Home Screen' : '' });
    return h('button', { class: 'btn btn-sm btn-forest', type: 'button', text: 'Install app', onclick: function () { P.install().then(render); } });
  }

  /* ---------------- Signal check (dead-zone log) ----------------
   * Walk the greenhouses and test the connection in each. The test times a small request to
   * data.gov.sg (standing in for Tyllage's server). With no signal at all, the page still
   * opens from the phone's cache and the worker can record "No signal" by hand. */
  var DZ_VERDICT = { untested: ['Not enough tests', 'grey'], good: ['Good signal', 'green'], patchy: ['Patchy', 'amber'], dead: ['Dead zone', 'red'] };
  function runSignalTest(gh) {
    var net = navigator.connection && navigator.connection.effectiveType ? navigator.connection.effectiveType : null;
    var save = function (result, ms, method) {
      var r = M.inspect.addSignal({ greenhouse: gh, result: result, latencyMs: ms, method: method, simulated: simOffline(), network: net }, session.email);
      if (!r.ok) { toast(r.error); return; }
      commit('signal.tested', gh, gh + ': ' + M.inspect.SIGNAL[result][0] + (ms != null ? ' (' + ms + ' ms)' : '') + (simOffline() ? ' — demo, not counted' : '') + '.');
    };
    if (simOffline() || !deviceOnline()) { save('none', null, 'auto'); return; }
    toast('Testing the connection in ' + gh + '…');
    var t0 = performance.now(), ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 8000);
    fetch('https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast?_=' + Date.now(), { cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { clearTimeout(timer); if (!r.ok) throw new Error(); var ms = Math.round(performance.now() - t0); save(ms < 1500 ? 'good' : 'slow', ms, 'auto'); })
      .catch(function () { clearTimeout(timer); save('none', null, 'auto'); });
  }
  function signalView(root) {
    var zones = M.inspect.deadZones();
    append(root, h('p', { class: 'callout', text: 'Stand inside each greenhouse and tap "Test here". It times a small request over your mobile data. If nothing loads, tap "No signal". Test each greenhouse a few times on different days; demo-mode tests are kept separately and don\'t count.' }));
    append(root, h('div', { class: 'dz-grid' }, zones.map(function (z) {
      var v = DZ_VERDICT[z.verdict];
      return h('article', { class: 'dz-card dz-' + z.verdict },
        h('header', null, h('strong', { text: z.greenhouse }), h('span', { class: 'ptype' }, badge(v[0], v[1]))),
        h('small', { text: z.tests ? z.tests + ' test(s)' + (z.avgLatencyMs != null ? ' · avg ' + z.avgLatencyMs + ' ms' : '') + ' · last ' + ago(z.last.at) + ': ' + M.inspect.SIGNAL[z.last.result][0] : 'Not tested yet' }),
        h('div', { class: 'dz-actions' },
          h('button', { class: 'btn btn-sm btn-forest', type: 'button', text: 'Test here', onclick: function () { runSignalTest(z.greenhouse); } }),
          h('button', { class: 'btn btn-sm btn-outline', type: 'button', text: 'No signal', onclick: function () {
            var r = M.inspect.addSignal({ greenhouse: z.greenhouse, result: 'none', method: 'manual', simulated: simOffline() }, session.email);
            if (r.ok) commit('signal.tested', z.greenhouse, z.greenhouse + ': no signal recorded.');
          } })));
    })));
    append(root, panel('Recent tests', null, signalTestsTable((S().signalTests || []).slice(0, 15))));
  }
  function signalTestsTable(list) {
    return table([
      { label: 'When', render: function (t) { return h('span', null, h('strong', { text: t.greenhouse }), h('br'), h('small', { text: ago(t.at) + ' · ' + t.by })); } },
      { label: 'Result', render: function (t) { var s = M.inspect.SIGNAL[t.result]; return h('span', { class: 'ptype' }, badge(s[0], s[1]), t.simulated ? h('small', { text: ' demo' }) : null); } },
      { label: 'Speed', num: true, render: function (t) { return t.latencyMs != null ? t.latencyMs + ' ms' : '—'; } },
      { label: 'How', render: function (t) { return h('small', { text: (t.method === 'manual' ? 'Marked by hand' : 'Automatic test') + (t.network ? ' · ' + t.network : '') }); } }
    ], list, 'No signal tests yet.');
  }
  // Staff: where the dead zones are, from the workers' tests.
  function deadZonePanel() {
    var zones = M.inspect.deadZones(), tested = zones.filter(function (z) { return z.tests; }).length;
    return panel('Signal by greenhouse', 'From workers\' signal checks (demo-mode tests excluded). Greenhouses marked Dead zone or Patchy are where offline saving matters most. ' + tested + ' of ' + zones.length + ' greenhouses tested so far.',
      table([
        { label: 'Greenhouse', render: function (z) { return h('strong', { text: z.greenhouse }); } },
        { label: 'Verdict', render: function (z) { var v = DZ_VERDICT[z.verdict]; return h('span', { class: 'ptype' }, badge(v[0], v[1])); } },
        { label: 'Tests', num: true, render: function (z) { return String(z.tests) + (z.simulatedTests ? ' (+' + z.simulatedTests + ' demo)' : ''); } },
        { label: 'No signal', num: true, render: function (z) { return z.tests ? z.noneCount + ' of ' + z.tests : '—'; } },
        { label: 'Avg speed', num: true, render: function (z) { return z.avgLatencyMs != null ? z.avgLatencyMs + ' ms' : '—'; } }
      ], zones, ''));
  }

  var NAV = {
    staff: [
      { id: 'overview', group: 'Today', label: 'Overview', title: 'SalesDesk', sub: 'Today across stock, orders, support and group buys.', render: staffOverview },
      { id: 'copilot', group: 'Today', label: 'Ask Tyllage', perm: 'copilot', title: 'Ask Tyllage', sub: 'Questions about the farm in English or 中文 — answered from MEOD\'s records.', render: copilotView },
      { id: 'briefing', group: 'Today', label: 'Weekly briefing', perm: 'radar', title: 'Weekly briefing', sub: 'What matters on the farm this week, ranked by AI.', render: briefingView },
      { id: 'pilot', group: 'Today', label: 'Pilot metrics', perm: 'pilot', title: 'Pilot metrics', sub: 'What a pilot with MEOD would measure, compared with a recorded baseline.', render: pilotView },
      { id: 'ledger', group: 'Today', label: 'AI decision ledger', perm: 'ledger', title: 'AI decision ledger', sub: 'Every AI suggestion acted on: its data, calculation, who decided and what happened.', render: ledgerView },
      { id: 'lost', group: 'Farm ops', label: 'Lost demand', perm: 'lost', title: 'Lost demand', sub: 'What people asked for and couldn\'t get — so a sold-out crop isn\'t mistaken for weak demand.', render: lostDemandView },
      { id: 'radar', group: 'Farm ops', label: 'Demand Radar', perm: 'radar', title: 'Demand Radar', sub: 'Supply vs demand per crop, and what to harvest each morning.', render: radarView },
      { id: 'allocation', group: 'Farm ops', label: 'Harvest allocation', perm: 'allocation', title: 'Harvest allocation', sub: 'Where each upcoming harvest goes — trade orders, pre-orders, group buys, the shop — and what\'s left over.', render: allocationView },
      { id: 'twin', group: 'Farm ops', label: 'Decision twin', perm: 'allocation', title: 'Farm Decision Twin', sub: 'What if the harvest, demand or buyers change? Compare responses before deciding.', render: twinView },
      { id: 'rounds', group: 'Farm ops', label: 'Greenhouse rounds', perm: 'inspect', title: 'Greenhouse rounds', sub: 'Workers\' inspections, straight into the harvest plan. Big changes wait for you.', render: roundsAdminView, count: function () { return M.inspect.held().length + (S().tasks || []).filter(function (t) { return t.status === 'open'; }).length; } },
      { id: 'seasons', group: 'Farm ops', label: 'Seasonal calendar', perm: 'harvest', title: 'Seasonal calendar', sub: 'Singapore festivals ahead, the greens they lift, when to sow, and how MEOD\'s prices compare.', render: seasonsView,
        count: function () { return M.seasons.outlook(160).reduce(function (n, o) { return n + o.crops.filter(function (c) { return c.action === 'sow' && c.daysToSow <= 21; }).length; }, 0); } },
      { id: 'harvest', group: 'Farm ops', label: 'Harvest Planner', perm: 'harvest', title: 'Harvest Planner', sub: 'What is growing, when it is ready, and how much is already pre-ordered.', render: harvestView },
      { id: 'rescue', group: 'Farm ops', label: 'Harvest Rescue', perm: 'rescue', title: 'Harvest Rescue', sub: 'Sell harvests before their sell-by date — trade buyers first, discounts last.', render: rescueView },
      { id: 'inventory', group: 'Farm ops', label: 'Stock', title: 'Stock & catalogue', sub: 'Synced from Shopify (mock).', render: inventoryView },
      { id: 'orders', group: 'Sales', label: 'Orders', title: 'Orders', sub: 'Move orders through payment, fulfilment and refunds.', render: ordersView },
      { id: 'content', group: 'Sales', label: 'Content studio', perm: 'content', title: 'Content studio', sub: 'Weekly social and WhatsApp posts from what the farm has right now — staff edit, someone else approves.', render: contentView, count: function () { return (S().contentPlan || []).filter(function (c) { return c.status === 'pending'; }).length; } },
      { id: 'b2b', group: 'Sales', label: 'B2B buyers', perm: 'b2b', title: 'B2B buyers', sub: 'Trade accounts, standing orders and new buyer leads.', render: b2bView },
      { id: 'quotes', group: 'Sales', label: 'Quotations', perm: 'quotes', title: 'Quotations', sub: 'Turn a buyer\'s enquiry into a checked counter-offer — and an accepted one into recurring demand.', render: quotesView },
      { id: 'campaigns', group: 'Sales', label: 'Campaigns', title: 'Campaign Studio', sub: 'Messages only go to people who opted in, after approval.', render: campaignsView },
      { id: 'pricing', group: 'Sales', label: 'Price Advisor', perm: 'pricing', title: 'Price Advisor', sub: 'Price suggestions checked by Margin Guard — an admin approves every change.', render: pricingView },
      { id: 'clearance', group: 'Sales', label: 'Buy to Clear', perm: 'clearance', title: 'Buy to Clear', sub: 'Candidates, listings and the Surprise Harvest Bag.', render: clearanceView },
      { id: 'rewards', group: 'Sales', label: 'Rewards', perm: 'rewards', title: 'Rewards', sub: 'Grow with MEOD: tiers, points and vouchers.', render: rewardsAdminView },
      { id: 'groupbuy', group: 'Sales', label: 'Group buys', title: 'GroupBuy', sub: 'Events, codes and leader commission.', render: groupBuyAdminView },
      { id: 'visits', group: 'Sales', label: 'Visits', perm: 'visits', title: 'Visits', sub: 'Learning journeys, their farm-shop codes, and the sales they bring in.', render: visitsView },
      { id: 'inbox', group: 'Customers', label: 'Inbox', title: 'Inbox', sub: 'Human handovers and farm-visit requests.', render: inboxView, count: function () { return S().tickets.filter(function (t) { return t.status === 'open'; }).length + S().bookings.filter(function (b) { return b.status === 'new'; }).length; } },
      { id: 'feedback', group: 'Customers', label: 'Feedback', perm: 'feedback', title: 'Feedback', sub: 'What customers and buyers say, grouped by theme and traced to the batch it came from.', render: feedbackView, count: function () { return M.feedback.clusters(14).filter(function (g) { return g.pattern && !g.resolved; }).length; } },
      { id: 'customers', group: 'Customers', label: 'Customers', title: 'Customers', sub: 'Consent and order history.', render: customersView },
      { id: 'import', group: 'Admin', label: 'Data import', perm: 'pilot', title: 'Data import', sub: 'Bring in sales and harvest records from Excel — no new software needed.', render: importView },
      { id: 'users', group: 'Admin', label: 'Users', perm: 'users', title: 'Users & roles', sub: 'Who can access the portal.', render: usersView },
      { id: 'audit', group: 'Admin', label: 'Audit log', perm: 'audit', title: 'Audit log', sub: 'Who did what, and when.', render: auditView },
      { id: 'settings', group: 'Admin', label: 'Settings', perm: 'settings', title: 'Settings', sub: 'Rules and demo controls.', render: settingsView }
    ],
    worker: [
      { id: 'overview', label: 'Today\'s round', title: 'Greenhouse round', sub: 'Photo, condition and harvest estimate for each batch. It sends itself when you finish.', render: roundView },
      { id: 'past', label: 'Past rounds', title: 'Past rounds', sub: 'What you sent, and what the farm manager did with it.', render: pastRoundsView },
      { id: 'signal', label: 'Signal check', title: 'Signal check', sub: 'Find the greenhouses where mobile data drops, so MEOD knows where offline saving matters.', render: signalView }
    ],
    leader: [
      { id: 'overview', label: 'Overview', title: 'My group buys', sub: 'Share your code and see how your group is doing.', render: leaderOverview },
      { id: 'orders', label: 'Group orders', title: 'Group orders', sub: 'Members\' details are masked.', render: leaderOrdersView },
      { id: 'commission', label: 'Commission', title: 'Commission', sub: 'Every figure can be traced back to an order.', render: leaderCommissionView }
    ],
    customer: [
      { id: 'overview', label: 'Home', title: 'Welcome back', sub: 'Your orders, picks and group buy.', render: customerOverview },
      { id: 'shop', label: 'Shop', title: 'Shop the harvest', sub: 'Fresh from Kranji, delivered Tue, Thu & Sat.', render: shopView },
      { id: 'orders', label: 'My orders', title: 'My orders', sub: 'Track, reorder and get receipts.', render: customerOrdersView },
      { id: 'rewards', label: 'Rewards', title: 'Rewards', sub: 'Points, tiers and vouchers for supporting local farming.', render: rewardsView },
      { id: 'group', label: 'Group buy', title: 'Group buy', sub: 'Buy together and save.', render: customerGroupView },
      { id: 'preferences', label: 'Preferences', title: 'Preferences', sub: 'Messages, privacy and language.', render: preferencesView },
      { id: 'assistant', label: 'Ask MEOD', title: 'Ask MEOD', sub: 'Help in English, 中文 and Bahasa Melayu.', render: assistantView }
    ]
  };

  var area = M.auth.ROLE_HOME[session.role];
  var items = NAV[area].filter(function (v) { return !v.perm || M.auth.can(session, v.perm); });

  function render() {
    var id = location.hash.slice(1) || 'overview';
    var view = items.filter(function (v) { return v.id === id; })[0] || items[0];

    var side = $('[data-side-nav]'), mob = $('[data-mobile-nav]');
    side.textContent = ''; mob.textContent = '';
    var lastGroup = null;
    items.forEach(function (v) {
      var n = v.count ? v.count() : 0;
      var current = v === view ? 'page' : null;
      // Staff links are grouped under headings (Today, Farm ops, Sales, Customers, Admin).
      if (v.group && v.group !== lastGroup) {
        side.appendChild(h('span', { class: 'side-group', text: v.group }));
        mob.appendChild(h('span', { class: 'mob-group', text: v.group }));
        lastGroup = v.group;
      }
      side.appendChild(h('a', { class: 'side-link', href: '#' + v.id, 'aria-current': current }, v.label, n ? h('span', { class: 'count', text: String(n) }) : null));
      mob.appendChild(h('a', { href: '#' + v.id, 'aria-current': current, text: v.label }));
    });
    mob.appendChild(h('a', { href: 'portal.html', text: 'Sign out', onclick: function (e) { e.preventDefault(); signOut(); } }));

    $('[data-role-badge]').textContent = { admin: 'Admin', staff: 'Sales staff', worker: 'Farm worker', leader: 'Group leader', customer: 'Customer' }[session.role];
    $('[data-user-name]').textContent = session.name;
    currentTitle = view.title;
    $('[data-title]').textContent = view.title;
    $('[data-subtitle]').textContent = view.sub || '';
    document.title = view.title + ' — MEOD Portal';

    var root = $('[data-view]');
    root.textContent = '';
    view.render(root);
    collapseLists(root);
    fitTables();
  }

  // Card lists that grow with the farm's data show the first few, then "Show more". How far
  // you've expanded a list is kept while you stay on the page (actions redraw it). Fixed-size
  // lists (7 days, 8 greenhouses) aren't touched.
  var COLLAPSE = [['.radar-list', 6], ['.al-list', 5], ['.ld-brief', 6], ['.gantt', 8], ['.rescue-list', 5], ['.ops-brief:not(.adv-list)', 6], ['.risk-list', 4], ['.fest-list', 3]];
  var collapseState = {};
  function collapseLists(root) {
    COLLAPSE.forEach(function (c) {
      root.querySelectorAll(c[0]).forEach(function (list, n) {
        var items = Array.prototype.filter.call(list.children, function (el) { return !el.classList.contains('gantt-axis'); });
        if (items.length <= c[1] + 2) return; // not worth hiding one or two
        var key = currentTitle + c[0] + n, step = c[1];
        var more = h('div', { class: 'list-more' });
        function apply() {
          var shown = Math.min(items.length, collapseState[key] || step);
          items.forEach(function (el, i) { el.hidden = i >= shown; });
          more.textContent = '';
          var left = items.length - shown;
          append(more,
            h('small', { text: 'Showing ' + shown + ' of ' + items.length }),
            left ? h('button', { type: 'button', class: 'btn btn-sm btn-outline', text: 'Show ' + Math.min(step, left) + ' more', onclick: function () { collapseState[key] = shown + step; apply(); } }) : null,
            left > step ? h('button', { type: 'button', class: 'mini', text: 'Show all ' + items.length, onclick: function () { collapseState[key] = items.length; apply(); } }) : null,
            shown > step ? h('button', { type: 'button', class: 'mini', text: 'Show less', onclick: function () { collapseState[key] = step; apply(); list.scrollIntoView({ block: 'start', behavior: 'smooth' }); } }) : null);
        }
        list.insertAdjacentElement('afterend', more);
        apply();
      });
    });
  }

  // Tables that don't fit their panel switch to stacked cards (.as-cards). Phones always get
  // cards from CSS; this covers tablets and narrow desktop windows. Re-checked on resize and
  // whenever a view redraws part of itself (filters, search, approvals).
  function fitTables() {
    if (window.innerWidth <= 640) return;
    document.querySelectorAll('[data-view] .table-wrap').forEach(function (wrap) {
      var table = wrap.querySelector('table');
      if (!table) return;
      wrap.classList.remove('as-cards');
      if (table.scrollWidth > wrap.clientWidth + 1) wrap.classList.add('as-cards');
    });
  }
  var fitQueued = false;
  function queueFit() {
    if (fitQueued) return;
    fitQueued = true;
    requestAnimationFrame(function () { fitQueued = false; fitTables(); });
  }
  window.addEventListener('resize', queueFit);
  // childList only: toggling .as-cards changes an attribute, so it can't retrigger this.
  new MutationObserver(queueFit).observe($('[data-view]'), { childList: true, subtree: true });

  function signOut() {
    M.auth.signOut();
    try { sessionStorage.removeItem('meod-cart'); } catch (e) { /* ignore */ }
    location.href = 'portal.html';
  }
  $('[data-sign-out]').addEventListener('click', signOut);
  window.addEventListener('hashchange', function () { render(); window.scrollTo(0, 0); });

  // Scroll-to-top for every portal role (same look as the public site's button).
  (function () {
    var btn = h('button', { class: 'to-top solo portal-top', type: 'button', 'aria-label': 'Scroll to top', title: 'Back to top' });
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 15l-6-6-6 6"/></svg>';
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      var main = $('#main'); if (main) { main.setAttribute('tabindex', '-1'); main.focus({ preventScroll: true }); }
    });
    document.body.appendChild(btn);
    function update() { btn.classList.toggle('show', window.scrollY > 400); }
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('hashchange', function () { setTimeout(update, 0); });
    update();
  })();
  // Pick up changes made in another tab (e.g. a booking on the public site).
  window.addEventListener('storage', function (e) {
    if (e.key === 'meod-demo-state-v2' && e.newValue) {
      try { Object.assign(M.state, JSON.parse(e.newValue)); render(); } catch (err) { /* ignore */ }
    }
  });
  if (session.role === 'customer' && sessionStorage.getItem('meod-join-code') && !location.hash) location.hash = 'group';
  else if (session.role === 'customer' && sessionStorage.getItem('meod-bag-size') && !location.hash) location.hash = 'shop';
  render();
})();
