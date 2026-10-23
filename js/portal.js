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
    draft: 'grey', pending_approval: 'amber', approved: 'blue', sent: 'green', rejected: 'red',
    accrued: 'green', pending: 'amber', reversed: 'red', void: 'grey', active: 'green', ended: 'grey',
    planned: 'grey', growing: 'blue', due: 'amber', harvested: 'green'
  };
  function statusBadge(s) { return badge(s, STATUS_TONE[s] || 'grey'); }
  function stockBadge(p) {
    var s = M.stockStatus(p);
    return badge(s.label, { ok: 'green', low: 'amber', out: 'red', stale: 'grey' }[s.key]);
  }

  function table(columns, rows, emptyText) {
    if (!rows.length) return h('p', { class: 'empty', text: emptyText || 'Nothing here yet.' });
    return h('div', { class: 'table-wrap' },
      h('table', null,
        h('thead', null, h('tr', null, columns.map(function (c) { return h('th', { class: c.num ? 'num' : null, scope: 'col', text: c.label }); }))),
        h('tbody', null, rows.map(function (r) {
          return h('tr', null, columns.map(function (c) { return h('td', { class: c.num ? 'num' : null, 'data-label': c.label }, c.render(r)); }));
        }))));
  }
  function kpi(label, value, note) { return h('div', { class: 'kpi' }, h('span', { text: label }), h('strong', { text: value }), note ? h('small', { text: note }) : null); }
  var currentTitle = '';
  function panel(title, hint) {
    var rest = Array.prototype.slice.call(arguments, 2);
    // Skip the heading when it would just repeat the page title above it.
    if (title && title.toLowerCase() === currentTitle.toLowerCase()) title = null;
    return h('section', { class: 'panel' }, title ? h('h2', { text: title }) : null, hint ? h('p', { class: 'hint', text: hint }) : null, rest);
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

    append(root, h('div', { class: 'kpis' },
      kpi('Orders · 7 days', String(recent.length), money(revenue) + ' net of refunds'),
      kpi('Open tickets', String(openTickets.length), 'Human handover queue'),
      kpi('New bookings', String(newBookings.length), 'Farm tours & workshops'),
      kpi('Stock alerts', String(alerts.length), 'Low, sold out or stale'),
      kpi('Commission owed', money(payable), 'All group leaders')));

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
    var kind = b.status === 'confirmed' ? 'details' : 'confirm', tone = 'warm', edited = false;
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
          h('span', { class: 'badge b-blue', text: 'AI draft · you review and send' })),
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

    append(root, panel('Farm visit bookings', 'From the Experiences page. In production, confirming sends an approved WhatsApp template or an email.',
      table([
        { label: 'Ref', render: function (b) { return h('span', null, h('strong', { text: b.id }), h('br'), h('small', { text: ago(b.createdAt) })); } },
        { label: 'Contact', render: function (b) { return h('span', null, b.org ? h('strong', { text: b.org }) : null, b.org ? h('br') : null, b.name, h('br'), h('small', { text: b.email })); } },
        { label: 'Experience', render: function (b) { return b.experience + ' · ' + b.pax + ' pax' + (M.visits.sessions(b.pax) > 1 ? ' (' + M.visits.sessions(b.pax) + ' sessions)' : ''); } },
        { label: 'Date', render: function (b) { return date(b.date); } },
        { label: 'Message', render: function (b) { return b.message || '—'; } },
        { label: 'Status', render: function (b) { return statusBadge(b.status); } },
        { label: 'Actions', render: function (b) {
          if (b.status !== 'new') return '—';
          return h('div', { class: 'actions' },
            mini('✨ Draft reply', function () { openReplyDialog(b); }),
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
  function restockPanel() {
    var groups = M.restockDue();
    var next = M.nextDeliveryDay(new Date()).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' });
    function draft(g) {
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
    return panel('Restock reminders', 'Opted-in customers who bought an item ' + M.RULES.restockAfterDays + '–' + M.RULES.restockWindowDays + ' days ago and haven\'t bought it since. Suggested from order history; drafting creates one message per language, and an admin still has to approve it.',
      h('div', { class: 'restock-table' }, rows));
  }

  function campaignsView(root) {
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

    append(root, panel('New campaign', 'Pick a product. The system finds past buyers who agreed to marketing, and AI drafts the message. An admin who did not write it must approve before it can be sent.',
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
        { label: 'Product', render: function (c) { var p = M.byId('products', c.productId); return p ? p.title : '—'; } },
        { label: 'Lang', render: function (c) { return c.language.toUpperCase(); } },
        { label: 'Audience', num: true, render: function (c) { return String(c.audience.length); } },
        { label: 'By', render: function (c) { return h('span', null, c.createdBy, c.approvedBy ? h('br') : null, c.approvedBy ? h('small', { text: 'approved: ' + c.approvedBy }) : null); } },
        { label: 'Status', render: function (c) { return h('span', { class: 'status-cell' }, statusBadge(c.status), c.status === 'sent' ? h('small', { text: c.sentCount + ' sent' }) : null); } },
        { label: 'Actions', render: function (c) {
          if (c.status === 'pending_approval') {
            if (!canApprove) return h('small', { text: 'Waiting for admin' });
            var own = c.createdBy === session.email;
            return h('div', { class: 'actions' },
              mini('Approve', function () { c.status = 'approved'; c.approvedBy = session.email; commit('campaign.approved', c.id, 'Campaign approved.'); }, { disabled: own, title: own ? 'You can\'t approve your own campaign' : null }),
              mini('Reject', function () { c.status = 'rejected'; commit('campaign.rejected', c.id, 'Campaign rejected.'); }, { danger: true }));
          }
          if (c.status === 'approved') {
            return mini('Send (simulated)', function () {
              // Re-check consent at send time — people may have opted out since approval.
              var recipients = c.audience.filter(function (id) { var cu = customer(id); return cu && cu.consentMarketing; });
              c.status = 'sent'; c.sentCount = recipients.length;
              commit('campaign.sent', c.id, 'Sent to ' + recipients.length + ' opted-in customer(s) (mock WhatsApp).');
            });
          }
          return '—';
        } }
      ], rows, cState.filter === 'all' ? 'No campaigns yet.' : 'No campaigns with this status.'));
    }
    drawCampaigns();
    append(root, h('section', { class: 'panel' }, h('div', { class: 'user-toolbar' }, cChips), cList));
  }

  /* ---------------- Buy to Clear (staff + admin) ---------------- */
  function dollarsToCents(v) { var n = Math.round(parseFloat(v) * 100); return isNaN(n) ? NaN : n; }
  function centsToDollars(c) { return (c / 100).toFixed(2); }

  function clearanceView(root) {
    var canEditMin = M.auth.can(session, 'clearance.minprice');

    /* ---- a. Candidates ---- */
    var candidates = M.clearance.candidates();
    append(root, panel('Clearance candidates', 'High stock, low recent sales — a plain-English reason for each.',
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
        id: id, productId: p.id, title: p.title + ' — Buy to Clear', language: 'en',
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
            h('div', null, h('h3', { text: 'Grade from photos' }), h('span', { class: 'badge b-blue', text: 'Optional · AI-assisted' })),
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
        id: id, productId: p.id, title: p.title + ' — Pre-order', language: 'en',
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

    append(root, panel('Upcoming batches', 'Pre-orders reserve part of the expected yield before it is picked. The demand note is rule-based and only advises — it never changes prices or quantities.',
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
      { label: 'Grades', render: function (b) {
        if (!b.grades) return '—';
        return h('span', null, b.grades.A + ' A · ' + b.grades.cosmetic + ' cosmetic · ' + b.grades.check + ' check', h('br'),
          h('small', { text: b.grades.photos ? 'from ' + b.grades.photos + ' photo(s), staff-confirmed' : 'entered by staff' }));
      } }
    ], done, 'No harvests recorded yet.')));
  }

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

    var pending = S().bookings.filter(function (b) { return b.status === 'new'; });
    append(root, panel('Enquiries waiting', 'Confirming creates the group\'s farm-shop code. In production this also sends an approved WhatsApp template or email.',
      table([
        { label: 'Organisation', render: function (b) { return h('span', null, h('strong', { text: b.org || b.name }), h('br'), h('small', { text: (M.GROUP_TYPES[b.groupType] || { label: 'Individual' }).label + ' · ' + b.email })); } },
        { label: 'Experience', render: function (b) { return b.experience; } },
        { label: 'Date', render: function (b) { return shortWeekday(M.clearance.parseDayKey(b.date).toISOString()); } },
        { label: 'Pax', num: true, render: function (b) { return String(b.pax) + (M.visits.sessions(b.pax) > 1 ? ' (' + M.visits.sessions(b.pax) + ' sessions)' : ''); } },
        { label: 'Message', render: function (b) { return b.message || '—'; } },
        { label: 'Last reply', render: lastReplyCell },
        { label: 'Actions', render: function (b) {
          return h('div', { class: 'actions' },
            mini('✨ Draft reply', function () { openReplyDialog(b); }),
            mini('Confirm', function () { confirmVisit(b); }),
            mini('Decline', function () { b.status = 'declined'; commit('booking.declined', b.id, b.id + ' declined.'); }, { danger: true }));
        } }
      ], pending, 'No enquiries waiting.')));
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
        h('div', { class: 'rd-head' }, h('h2', { id: 'nd-title', text: opts.title || NUDGE_KIND_LABEL[kind] }), h('span', { class: 'badge b-blue', text: 'AI draft · you review' })),
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
      h('div', { class: 'rw-head' }, h('h2', { text: 'AI ops brief' }), h('span', { class: 'badge b-blue', text: 'AI-assisted' })),
      h('p', { class: 'hint', text: 'What to do with rewards this week, linking what members buy with what the farm needs to sell. Each one opens a draft for you to check.' }),
      insights.length ? h('div', { class: 'ops-brief' }, insights.map(function (x, i) {
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
      ], slice, 'No members match — clear the search or pick another tier.'));
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
      h('div', { class: 'rw-head' }, h('h2', { text: 'Members' }), h('span', { class: 'badge b-blue', text: 'AI search' })),
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

    append(root, panel('Commission ledger', 'Worked out from the order records each time, so the numbers always match.',
      ledgerTable(entries, true)));
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
    inventory: { label: 'Stock', tone: 'grey' },
    consent: { label: 'Privacy', tone: 'grey' },
    profile: { label: 'Privacy', tone: 'grey' },
    clearance: { label: 'Buy to Clear', tone: 'amber' },
    harvest: { label: 'Harvest', tone: 'green' },
    rewards: { label: 'Rewards', tone: 'amber' }
  };
  var AUDIT_LABELS = {
    'auth.sign_in': 'Signed in', 'auth.sign_out': 'Signed out',
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
    'rewards.redeemed': 'Swapped points for a voucher', 'harvest.planned': 'Planned a harvest batch', 'harvest.harvested': 'Marked a batch harvested', 'harvest.cancelled': 'Cancelled a harvest batch'
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

  function settingsView(root) {
    var R = M.RULES;
    var fmt = function (h24) { return (h24 % 12 || 12) + (h24 < 12 ? 'am' : 'pm'); };
    var hours = fmt(R.humanHours.start) + ' – ' + fmt(R.humanHours.end);
    var online = M.withinHumanHours();

    append(root, h('p', { class: 'callout', text: 'These are example values kept in js/data.js. MEOD needs to confirm each one; in production they live on the server and changes are audited.' }));

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
    append(root, h('div', { class: 'kpis' },
      kpi('Active group buys', String(leaderEvents().filter(function (e) { return e.status === 'open'; }).length)),
      kpi('Group orders', String(orders.length)),
      kpi('Group net sales', money(orders.reduce(function (s, o) { return s + o.netCents - (o.refundedCents || 0); }, 0))),
      kpi('Commission payable', money(entries.reduce(function (s, e) { return s + e.payableCents; }, 0)), 'After refunds')));
    leaderEvents().forEach(function (ev) {
      append(root, panel(ev.title, 'Ends ' + date(ev.endsAt) + ' · ' + ev.terms, shareBox(ev)));
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
        h('h2', { text: personal ? 'Picked for you, ' + c.name.split(' ')[0] : 'What\'s fresh this week' }),
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
      h('div', { class: 'rw-head' }, h('h2', { text: 'Smart tips' }), h('span', { class: 'badge b-blue', text: 'AI-assisted' })),
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
      h('summary', null, h('span', { class: 'pd-recipe-label', text: 'Recipe idea' }), h('strong', { text: r.name.en }), h('small', { text: r.minutes + ' min' })),
      h('div', { class: 'pd-recipe-body' },
        h('div', null, h('b', { text: 'You need' }), h('ul', null, r.ingredients.map(function (x) { return h('li', { text: x }); }))),
        h('div', null, h('b', { text: 'Steps' }), h('ol', null, r.steps.map(function (x) { return h('li', { text: x }); })))),
      h('small', { class: 'pd-recipe-note', text: 'Recipe ideas are AI-drafted samples in this prototype — MEOD would review them before they go live.' }));
  }

  function openProduct(p, opts) {
    opts = opts || {};
    // Only one product dialog at a time: close and remove any others right away.
    document.querySelectorAll('.product-dialog').forEach(function (d) { if (d.open) d.close(); d.remove(); });
    var s = M.stockStatus(p);
    var inCart = cart[p.id] || 0;
    var qty = inCart || 1;
    var maxQty = s.known ? s.qty : 0;
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
      addBtn.disabled = !maxQty;
      addBtn.textContent = !maxQty ? (s.key === 'stale' ? 'Can\'t confirm stock' : 'Sold out')
        : (inCart ? 'Update cart · ' : 'Add to cart · ') + money(p.priceCents * qty);
    }
    minus.addEventListener('click', function () { if (qty > 1) { qty--; sync(); } });
    plus.addEventListener('click', function () { if (qty < maxQty) { qty++; sync(); } });
    addBtn.addEventListener('click', function () {
      cart[p.id] = qty;
      saveCart();
      if (opts.onCartChange) opts.onCartChange();
      toast(qty + ' × ' + p.title + (inCart ? ' updated in' : ' added to') + ' your cart.');
      closeDialog();
    });

    var stockLine = s.known
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
          h('strong', { class: 'pd-price', text: money(p.priceCents) }),
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
          harvestBox)),
      h('div', { class: 'pd-extra' },
        h('div', { class: 'pd-tip' }, iconCircle(ICONS.clock, 'soft'), h('span', null, h('strong', { text: 'Storage' }), h('small', { text: tips.store }))),
        h('div', { class: 'pd-tip' }, iconCircle(ICONS.leaf, 'soft'), h('span', null, h('strong', { text: 'How to enjoy' }), h('small', { text: tips.cook })))),
      recipeCard(p),
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
          ? h('button', { class: 'btn btn-sm btn-forest shop-add', type: 'button', disabled: !canAdd, text: canAdd ? '+ Add' : (s.key === 'stale' ? 'Checking…' : 'Sold out'),
              'aria-label': 'Add ' + p.title + ' to cart', onclick: function () { setQty(p.id, 1); } })
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
        return h('article', { class: 'shop-item clearance-item' + (q ? ' in-cart' : '') },
          h('div', { class: 'shop-media' }, thumb(p)),
          h('div', { class: 'shop-body' },
            h('span', { class: 'reason-pill', text: M.clearance.reasonLabel(l.reason) }),
            h('strong', { class: 'shop-title', text: p.title }),
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
            h('div', { class: 'shop-media' }, thumb(p), h('span', { class: 'badge b-green', text: 'Harvest ' + shortWeekday(harvestIso) })),
            h('div', { class: 'shop-body' },
              h('button', { type: 'button', class: 'shop-title', text: p.title, 'aria-haspopup': 'dialog', onclick: function () { openProduct(p, shopOpts); } }),
              h('div', { class: 'po-line' }, h('small', { text: grown + '% grown · sown ' + shortDate(M.clearance.parseDayKey(b.sowDate).toISOString()) }), growBar),
              h('div', { class: 'clearance-meta' },
                h('span', { class: 'mini-chip', text: left + ' spots left' }),
                h('span', { class: 'mini-chip', text: 'By ' + cutoffText(M.harvest.cutoff(b)) })),
              h('div', { class: 'clearance-foot' },
                h('div', { class: 'price-row' }, h('span', { class: 'shop-price', text: money(b.preorderPriceCents) })),
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
          h('div', null, h('strong', { text: 'Ask MEOD' }),
            h('small', null, h('span', { class: 'status-dot on', text: 'Bot online 24/7' }), ' · ', online ? 'Team online now' : 'Team back Mon–Sat 9am'))),
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
  var NAV = {
    staff: [
      { id: 'overview', label: 'Overview', title: 'SalesDesk', sub: 'Today across stock, orders, support and group buys.', render: staffOverview },
      { id: 'inventory', label: 'Stock', title: 'Stock & catalogue', sub: 'Synced from Shopify (mock).', render: inventoryView },
      { id: 'orders', label: 'Orders', title: 'Orders', sub: 'Move orders through payment, fulfilment and refunds.', render: ordersView },
      { id: 'inbox', label: 'Inbox', title: 'Inbox', sub: 'Human handovers and farm-visit requests.', render: inboxView, count: function () { return S().tickets.filter(function (t) { return t.status === 'open'; }).length + S().bookings.filter(function (b) { return b.status === 'new'; }).length; } },
      { id: 'campaigns', label: 'Campaigns', title: 'Campaign Studio', sub: 'Messages only go to people who opted in, after approval.', render: campaignsView },
      { id: 'visits', label: 'Visits', perm: 'visits', title: 'Visits', sub: 'Learning journeys, their farm-shop codes, and the sales they bring in.', render: visitsView },
      { id: 'harvest', label: 'Harvest Planner', perm: 'harvest', title: 'Harvest Planner', sub: 'What is growing, when it is ready, and how much is already pre-ordered.', render: harvestView },
      { id: 'clearance', label: 'Buy to Clear', perm: 'clearance', title: 'Buy to Clear', sub: 'Candidates, listings and the Surprise Harvest Bag.', render: clearanceView },
      { id: 'rewards', label: 'Rewards', perm: 'rewards', title: 'Rewards', sub: 'Grow with MEOD: tiers, points and vouchers.', render: rewardsAdminView },
      { id: 'groupbuy', label: 'Group buys', title: 'GroupBuy', sub: 'Events, codes and leader commission.', render: groupBuyAdminView },
      { id: 'customers', label: 'Customers', title: 'Customers', sub: 'Consent and order history.', render: customersView },
      { id: 'users', label: 'Users', perm: 'users', title: 'Users & roles', sub: 'Who can access the portal.', render: usersView },
      { id: 'audit', label: 'Audit log', perm: 'audit', title: 'Audit log', sub: 'Who did what, and when.', render: auditView },
      { id: 'settings', label: 'Settings', perm: 'settings', title: 'Settings', sub: 'Rules and demo controls.', render: settingsView }
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
    items.forEach(function (v) {
      var n = v.count ? v.count() : 0;
      var current = v === view ? 'page' : null;
      side.appendChild(h('a', { class: 'side-link', href: '#' + v.id, 'aria-current': current }, v.label, n ? h('span', { class: 'count', text: String(n) }) : null));
      mob.appendChild(h('a', { href: '#' + v.id, 'aria-current': current, text: v.label }));
    });
    mob.appendChild(h('a', { href: 'portal.html', text: 'Sign out', onclick: function (e) { e.preventDefault(); signOut(); } }));

    $('[data-role-badge]').textContent = { admin: 'Admin', staff: 'Sales staff', leader: 'Group leader', customer: 'Customer' }[session.role];
    $('[data-user-name]').textContent = session.name;
    currentTitle = view.title;
    $('[data-title]').textContent = view.title;
    $('[data-subtitle]').textContent = view.sub || '';
    document.title = view.title + ' — MEOD Portal';

    var root = $('[data-view]');
    root.textContent = '';
    view.render(root);
    fitTables();
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
