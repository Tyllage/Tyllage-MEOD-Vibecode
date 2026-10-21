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
  function badge(text, tone) { return h('span', { class: 'badge b-' + tone, text: String(text).replace(/_/g, ' ') }); }
  var STATUS_TONE = {
    pending_payment: 'amber', paid: 'blue', fulfilled: 'green', refunded: 'red', cancelled: 'grey',
    open: 'amber', resolved: 'green', new: 'amber', confirmed: 'green', declined: 'grey', closed: 'grey',
    draft: 'grey', pending_approval: 'amber', approved: 'blue', sent: 'green', rejected: 'red',
    accrued: 'green', pending: 'amber', reversed: 'red', void: 'grey'
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
  function panel(title, hint) {
    var rest = Array.prototype.slice.call(arguments, 2);
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
    var alerts = S().products.filter(function (p) { return M.stockStatus(p).key !== 'ok'; });
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
        ], openTickets.slice(0, 5), 'No open tickets 🎉'),
        h('p', null, h('a', { class: 'card-link', href: '#inbox', text: 'Open inbox →' }))),
      panel('Stock alerts', 'Stale syncs are shown as unknown, never as available.',
        table([
          { label: 'Product', render: function (p) { return p.title; } },
          { label: 'Status', render: stockBadge },
          { label: 'Last sync', render: function (p) { return ago(p.stock.updatedAt); } }
        ], alerts, 'All stock is fresh.'))));
  }

  function inventoryView(root) {
    var filter = inventoryView.filter || 'all';
    var sel = h('select', { 'aria-label': 'Category', onchange: function (e) { inventoryView.filter = e.target.value; render(); } },
      h('option', { value: 'all', text: 'All categories' }),
      Object.keys(M.CATEGORIES).map(function (k) { return h('option', { value: k, text: M.CATEGORIES[k].label, selected: filter === k }); }));
    var rows = S().products.filter(function (p) { return filter === 'all' || p.category === filter; });
    append(root, panel('Catalogue & stock', 'Shopify is the master for products, prices and stock. This view is read-only; run a sync to refresh it.',
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
        { label: 'Status', render: stockBadge },
        { label: 'Last synced', render: function (p) { return ago(p.stock.updatedAt); } }
      ], rows)));
  }

  var TRANSITIONS = { pending_payment: ['paid', 'cancelled'], paid: ['fulfilled', 'refunded'], fulfilled: ['refunded'] };
  function setOrderStatus(o, next) {
    if ((TRANSITIONS[o.status] || []).indexOf(next) === -1) return;
    if (next === 'refunded' && !confirm('Refund ' + o.ref + ' (' + money(o.netCents) + ' merchandise)? Any group commission will be reversed.')) return;
    if (next === 'cancelled') {
      o.items.forEach(function (i) { var p = M.byId('products', i.productId); if (p) p.stock.qty += i.qty; });
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
        { label: 'Contact', render: function (b) { return h('span', null, b.name, h('br'), h('small', { text: b.email })); } },
        { label: 'Experience', render: function (b) { return b.experience + ' · ' + b.pax + ' pax'; } },
        { label: 'Date', render: function (b) { return date(b.date); } },
        { label: 'Message', render: function (b) { return b.message || '—'; } },
        { label: 'Status', render: function (b) { return statusBadge(b.status); } },
        { label: 'Actions', render: function (b) {
          if (b.status !== 'new') return '—';
          return h('div', { class: 'actions' },
            mini('Confirm', function () { b.status = 'confirmed'; commit('booking.confirmed', b.id, b.id + ' confirmed (WhatsApp mock).'); }),
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

  function campaignsView(root) {
    var inStock = S().products.filter(function (p) { var s = M.stockStatus(p); return s.known && s.qty > 0; });
    var form = h('form', { class: 'form-grid', novalidate: true });
    var productSel = h('select', { name: 'product', required: true }, inStock.map(function (p) { return h('option', { value: p.id, text: p.title }); }));
    var langSel = h('select', { name: 'language' }, h('option', { value: 'en', text: 'English' }), h('option', { value: 'zh', text: '中文' }), h('option', { value: 'ms', text: 'Bahasa Melayu' }));
    var title = h('input', { name: 'title', placeholder: 'e.g. Kai Lan Weekend', maxlength: 60 });
    var msg = h('textarea', { name: 'message', rows: 4, maxlength: 500, placeholder: 'Write a message or draft one with AI' });
    var audienceBox = h('p', { class: 'callout green' });

    function refreshAudience() {
      var a = audienceFor(productSel.value);
      audienceBox.textContent = 'Audience: ' + a.eligible.length + ' customer(s) who bought ' +
        M.CATEGORIES[M.byId('products', productSel.value).category].label.toLowerCase() + ' and agreed to marketing (' +
        (a.eligible.join(', ') || 'none') + '). ' + a.excluded + ' past buyer(s) left out because they have not given consent.';
    }
    productSel.addEventListener('change', refreshAudience);
    if (inStock.length) refreshAudience();

    append(form,
      h('label', null, 'Promoted product', productSel),
      h('label', null, 'Language', langSel),
      h('label', null, 'Campaign title', title),
      h('label', { style: 'grid-column:1/-1' }, 'Message', msg),
      h('div', { class: 'actions', style: 'grid-column:1/-1' },
        h('button', { class: 'btn btn-sm btn-outline', type: 'button', text: '✨ Draft with AI (mock)', onclick: function () {
          var p = M.byId('products', productSel.value);
          msg.value = DRAFTS[langSel.value](p);
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

    append(root, panel('Campaign Studio', 'Pick a product. The system finds past buyers who agreed to marketing, and AI drafts the message. An admin who did not write it must approve before it can be sent.',
      audienceBox, form));

    var canApprove = M.auth.can(session, 'campaigns.approve');
    append(root, panel('Campaigns', null,
      table([
        { label: 'Campaign', render: function (c) { return h('span', null, h('strong', { text: c.title }), h('br'), h('small', { text: c.message.slice(0, 90) + (c.message.length > 90 ? '…' : '') })); } },
        { label: 'Product', render: function (c) { var p = M.byId('products', c.productId); return p ? p.title : '—'; } },
        { label: 'Lang', render: function (c) { return c.language.toUpperCase(); } },
        { label: 'Audience', num: true, render: function (c) { return String(c.audience.length); } },
        { label: 'By', render: function (c) { return h('span', null, c.createdBy, c.approvedBy ? h('br') : null, c.approvedBy ? h('small', { text: 'approved: ' + c.approvedBy }) : null); } },
        { label: 'Status', render: function (c) { return h('span', null, statusBadge(c.status), c.status === 'sent' ? h('small', { text: ' ' + c.sentCount + ' sent' }) : null); } },
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
      ], S().campaigns, 'No campaigns yet.')));
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
        h('label', null, 'Leader', h('select', { name: 'leader' }, S().leaders.map(function (l) { return h('option', { value: l.id, text: l.name + ' (' + l.area + ')' }); }))),
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

  function customersView(root) {
    var pii = M.auth.can(session, 'customers.pii');
    append(root, panel('Customers', pii ? 'Admin view, with full details. Only export what a task actually needs.' : 'Names and phone numbers are masked for sales staff.',
      table([
        { label: 'ID', render: function (c) { return c.id; } },
        { label: 'Name', render: function (c) { return pii ? c.name : M.maskName(c.name); } },
        { label: 'Phone', render: function (c) { return pii ? c.phone : M.maskPhone(c.phone); } },
        { label: 'Lang', render: function (c) { return c.language.toUpperCase(); } },
        { label: 'Marketing', render: function (c) { return c.consentMarketing ? badge('opted in', 'green') : badge('no consent', 'grey'); } },
        { label: 'Personalised', render: function (c) { return c.consentPersonalisation ? badge('yes', 'green') : badge('off', 'grey'); } },
        { label: 'Orders', num: true, render: function (c) { return String(S().orders.filter(function (o) { return o.customerId === c.id; }).length); } },
        { label: 'Spend', num: true, render: function (c) {
          return money(S().orders.filter(function (o) { return o.customerId === c.id && o.status !== 'cancelled'; })
            .reduce(function (s, o) { return s + o.totalCents - (o.refundedCents || 0); }, 0));
        } }
      ], S().customers)));
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

  function auditView(root) {
    append(root, panel('Audit log', 'Every sign-in and every change, with who made it. In production this would be append-only and kept on the server.',
      table([
        { label: 'When', render: function (a) { return new Date(a.at).toLocaleString('en-SG'); } },
        { label: 'Actor', render: function (a) { return a.actor; } },
        { label: 'Event', render: function (a) { return h('code', { text: a.event }); } },
        { label: 'Target', render: function (a) { return a.target || '—'; } }
      ], S().audit.slice(0, 100))));
  }

  function settingsView(root) {
    var R = M.RULES;
    append(root, panel('Commercial rules', 'Example values only, kept in js/data.js. MEOD must confirm each one, and in production they live on the server.',
      table([{ label: 'Rule', render: function (r) { return r[0]; } }, { label: 'Value', render: function (r) { return h('strong', { text: r[1] }); } }], [
        ['Group-leader commission', (R.commissionRate * 100) + '% of net merchandise'],
        ['Group-buy discount', (R.groupDiscountRate * 100) + '%'],
        ['Free delivery from', money(R.freeDeliveryThresholdCents)],
        ['Delivery fee below threshold', money(R.deliveryFeeCents)],
        ['Stock treated as stale after', R.stockStaleAfterMinutes / 60 + ' hours'],
        ['Human support hours', 'Mon–Sat ' + R.humanHours.start + ':00–' + R.humanHours.end + ':00 SGT']
      ])));
    append(root, panel('Demo data', 'Puts every order, ticket, booking and campaign in this browser back to the starting data.',
      h('button', { class: 'btn btn-sm btn-outline', type: 'button', text: 'Reset demo data', onclick: function () {
        if (!confirm('Reset all demo data in this browser?')) return;
        M.reset();
        toast('Demo data reset.');
        render();
      } })));
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
    append(root, panel('My commission', 'Payouts follow the terms agreed with MEOD.', ledgerTable(entries, false)));
  }

  /* ---------------- customer views ---------------- */
  function me() { return customer(session.customerId); }

  function thumb(p) {
    if (!p.image) return h('div', { class: 'thumb', 'aria-hidden': 'true', text: M.CATEGORIES[p.category].emoji });
    return h('div', { class: 'thumb' + (p.category === 'farm-more' ? ' cover' : '') }, h('img', { src: p.image, alt: '', loading: 'lazy', width: 420, height: 420 }));
  }

  function recGrid(list) {
    if (!list.length) return h('p', { class: 'empty', text: 'Nothing to suggest right now.' });
    return h('div', { class: 'rec-grid' }, list.map(function (r) {
      return h('div', { class: 'rec' },
        thumb(r.product),
        h('strong', { text: r.product.title }),
        h('small', { text: r.reason }),
        h('div', { class: 'row', style: 'display:flex;justify-content:space-between;align-items:center' },
          h('span', { text: money(r.product.priceCents) }),
          mini('Add to cart', function () { addToCart(r.product.id); location.hash = 'shop'; })));
    }));
  }

  function customerOverview(root) {
    var c = me();
    var mine = S().orders.filter(function (o) { return o.customerId === c.id; });
    var last = mine[mine.length - 1];
    append(root, h('div', { class: 'kpis' },
      kpi('Orders', String(mine.length)),
      kpi('Latest order', last ? last.ref : '—', last ? last.status.replace('_', ' ') : null),
      kpi('Group buy', c.groupCode || 'Not joined', c.groupCode ? '5% off applied at checkout' : 'Join with a leader code'),
      kpi('Messages', c.consentMarketing ? 'On' : 'Off', 'Change in Preferences')));
    append(root, panel('Picked for you', c.consentPersonalisation ? 'Based on what you have bought before. Only items in stock are shown.' : 'Personalised picks are off, so here is what\'s fresh this week.',
      recGrid(M.recommendFor(c, 4))));
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

  function shopView(root) {
    var c = me();
    var ev = c.groupCode ? S().events.filter(function (e) { return e.code === c.groupCode && e.status === 'open'; })[0] : null;
    var items = Object.keys(cart).filter(function (id) { return cart[id] > 0; }).map(function (id) {
      var p = M.byId('products', id);
      return { productId: id, title: p.title, qty: cart[id], priceCents: p.priceCents };
    });
    var totals = M.priceOrder(items, Boolean(ev));

    var grid = h('div', { class: 'shop-grid' }, S().products.map(function (p) {
      var s = M.stockStatus(p);
      var q = cart[p.id] || 0;
      return h('div', { class: 'shop-item' },
        thumb(p),
        h('div', { class: 'row' }, h('strong', { text: p.title }), stockBadge(p)),
        h('small', { text: p.subtitle }),
        h('div', { class: 'row' },
          h('span', { text: money(p.priceCents) }),
          h('div', { class: 'qty' },
            h('button', { type: 'button', 'aria-label': 'Remove one ' + p.title, disabled: q === 0, text: '−', onclick: function () { cart[p.id] = q - 1; saveCart(); render(); } }),
            h('span', { text: String(q) }),
            h('button', { type: 'button', 'aria-label': 'Add one ' + p.title, disabled: !s.known || q >= s.qty, text: '+', onclick: function () { cart[p.id] = q + 1; saveCart(); render(); } }))));
    }));

    var summary = h('div', { class: 'cart-lines' },
      items.map(function (i) { return h('div', null, h('span', { text: i.qty + '× ' + i.title }), h('span', { text: money(i.qty * i.priceCents) })); }),
      h('div', null, h('span', { text: 'Subtotal' }), h('span', { text: money(totals.subtotalCents) })),
      ev ? h('div', null, h('span', { text: 'Group discount (' + ev.code + ')' }), h('span', { text: '−' + money(totals.discountCents) })) : null,
      h('div', null, h('span', { text: 'Delivery' }), h('span', { text: totals.deliveryCents ? money(totals.deliveryCents) : 'Free' })),
      h('div', { class: 'cart-total' }, h('span', { text: 'Total' }), h('span', { text: money(totals.totalCents) })));

    var checkout = h('button', { class: 'btn btn-forest', type: 'button', style: 'margin-top:14px;width:100%;justify-content:center', disabled: !items.length, text: 'Place order', onclick: function () {
      // Re-check stock at submit time: fail closed if anything changed.
      for (var i = 0; i < items.length; i++) {
        var p = M.byId('products', items[i].productId);
        var s = M.stockStatus(p);
        if (!s.known || s.qty < items[i].qty) { toast('Stock for ' + p.title + ' could not be confirmed. Please adjust your cart.'); render(); return; }
      }
      items.forEach(function (i) { M.byId('products', i.productId).stock.qty -= i.qty; });
      var id = M.nextId('O');
      var ref = '#MF' + (5000 + S().orders.length + 1);
      S().orders.push(Object.assign({ id: id, ref: ref, customerId: c.id, groupEventId: ev ? ev.id : null, status: 'pending_payment', items: items, refundedCents: 0, createdAt: new Date().toISOString(), source: 'portal' }, totals));
      cart = {}; saveCart();
      commit('order.created', ref, 'Order ' + ref + ' created. In production you\'d pay through MEOD Fresh (Shopify checkout).');
      location.hash = 'orders';
    } });

    append(root, h('div', { class: 'two-col shop-layout' },
      panel('This week\'s harvest', 'Prices are examples. You can\'t add items whose stock we can\'t confirm.', grid),
      panel('Your cart', ev ? 'Group buy ' + ev.code + ': 5% off.' : 'No group code yet. Join one under Group buy.',
        items.length ? summary : h('p', { class: 'empty', text: 'Your cart is empty.' }),
        h('p', { class: 'form-note', text: 'Orders from ' + money(M.RULES.freeDeliveryThresholdCents) + ' get free delivery. Delivery days are Tue, Thu and Sat.' }),
        checkout)));
  }

  function customerOrdersView(root) {
    var mine = S().orders.filter(function (o) { return o.customerId === session.customerId; }).slice().reverse();
    append(root, panel('My orders', null,
      table([
        { label: 'Order', render: function (o) { return h('span', null, h('strong', { text: o.ref }), h('br'), h('small', { text: date(o.createdAt) })); } },
        { label: 'Items', render: itemsSummary },
        { label: 'Group', render: function (o) { var e = eventFor(o); return e ? e.code : '—'; } },
        { label: 'Total', num: true, render: function (o) { return money(o.totalCents); } },
        { label: 'Status', render: function (o) { return statusBadge(o.status); } }
      ], mine, 'No orders yet — visit the shop.')));
  }

  function customerGroupView(root) {
    var c = me();
    var pending = '';
    try { pending = sessionStorage.getItem('meod-join-code') || ''; } catch (e) { /* ignore */ }
    var input = h('input', { name: 'code', placeholder: 'e.g. PUNGGOL-GREENS', value: pending, maxlength: 24 });
    var f = h('form', { class: 'toolbar' }, input, h('button', { class: 'btn btn-sm btn-forest', type: 'submit', text: 'Join group buy' }));
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var code = input.value.trim().toUpperCase();
      var ev = S().events.filter(function (x) { return x.code === code; })[0];
      if (!ev) { toast('We couldn\'t find that code.'); return; }
      if (ev.status !== 'open') { toast('That group buy has closed.'); return; }
      c.groupCode = code;
      try { sessionStorage.removeItem('meod-join-code'); } catch (err) { /* ignore */ }
      commit('groupbuy.joined', code, 'You joined ' + ev.title + '.');
    });
    append(root, panel('Join a group buy', 'Got a code from your group leader? Enter it to get the group discount at checkout.', f));
    var ev = c.groupCode ? S().events.filter(function (x) { return x.code === c.groupCode; })[0] : null;
    if (ev) {
      var leader = M.byId('leaders', ev.leaderId);
      append(root, panel(ev.title, null,
        h('p', null, 'Leader: ', h('strong', { text: leader.name }), ' · ' + leader.area),
        h('p', null, 'Pickup & terms: ' + ev.terms),
        h('p', null, 'Closes ', h('strong', { text: date(ev.endsAt) }), ' · ', statusBadge(ev.status)),
        h('p', { class: 'form-note', text: 'Your leader sees your masked name and what you ordered. They don\'t see your phone number or address unless you agree.' }),
        mini('Leave group buy', function () { c.groupCode = null; commit('groupbuy.left', ev.code, 'You left the group buy.'); }, { danger: true })));
    }
  }

  function preferencesView(root) {
    var c = me();
    function toggle(field, label, note) {
      return h('label', { class: 'switch' },
        h('span', null, label, h('small', { text: note })),
        h('input', { type: 'checkbox', checked: c[field], onchange: function (e) {
          c[field] = e.target.checked;
          c.consentTimestamp = new Date().toISOString();
          commit('consent.' + field + '.' + (e.target.checked ? 'granted' : 'withdrawn'), c.id, 'Preference saved.');
        } }));
    }
    append(root, panel('Messages & privacy', 'You can change these any time. Each change is saved with the time you made it.',
      toggle('consentMarketing', 'WhatsApp promotions', 'Harvest updates and offers. Reply STOP to any message to opt out.'),
      toggle('consentPersonalisation', 'Personalised picks', 'Use your past orders to suggest products. We never guess sensitive things about you.'),
      h('label', { class: 'switch' },
        h('span', null, 'Preferred language', h('small', { text: 'Used by the assistant and for messages' })),
        h('select', { style: 'width:auto', onchange: function (e) { c.language = e.target.value; commit('profile.language', c.id, 'Language saved.'); } },
          [['en', 'English'], ['zh', '中文'], ['ms', 'Bahasa Melayu'], ['ta', 'தமிழ்']].map(function (l) { return h('option', { value: l[0], text: l[1], selected: c.language === l[0] }); }))),
      c.consentTimestamp ? h('p', { class: 'form-note', text: 'Last updated ' + new Date(c.consentTimestamp).toLocaleString('en-SG') }) : null));
  }

  function assistantView(root) {
    var log = h('div', { class: 'assist-log', 'aria-live': 'polite' });
    var input = h('input', { placeholder: 'Ask about stock, delivery or your order', maxlength: 300, 'aria-label': 'Message' });
    function push(text, who, extra) { log.appendChild(h('div', { class: 'msg ' + who + (extra ? ' ' + extra : ''), text: text })); log.scrollTop = log.scrollHeight; }
    var f = h('form', null, input, h('button', { class: 'btn btn-sm btn-forest', type: 'submit', text: 'Send' }));
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var t = input.value.trim();
      if (!t) return;
      input.value = '';
      push(t, 'user');
      var r = M.assist.reply(t, { channel: 'portal', customerId: session.customerId });
      setTimeout(function () { push(r.text, 'bot', r.handover ? 'handover' : ''); }, 300);
    });
    push('Hi ' + me().name.split(' ')[0] + '! You\'re signed in, so I can check your orders too. Try "where is my order?"', 'bot');
    append(root, panel('Ask MEOD', 'This is the same assistant used on WhatsApp. Because you are signed in, it can look up your own orders.',
      h('div', { class: 'chat' }, log, f)));
  }

  /* ---------------- routing ---------------- */
  var NAV = {
    staff: [
      { id: 'overview', label: 'Overview', title: 'SalesDesk', sub: 'Today across stock, orders, support and group buys.', render: staffOverview },
      { id: 'inventory', label: 'Stock', title: 'Stock & catalogue', sub: 'Synced from Shopify (mock).', render: inventoryView },
      { id: 'orders', label: 'Orders', title: 'Orders', sub: 'Move orders through payment, fulfilment and refunds.', render: ordersView },
      { id: 'inbox', label: 'Inbox', title: 'Inbox', sub: 'Human handovers and farm-visit requests.', render: inboxView, count: function () { return S().tickets.filter(function (t) { return t.status === 'open'; }).length + S().bookings.filter(function (b) { return b.status === 'new'; }).length; } },
      { id: 'campaigns', label: 'Campaigns', title: 'Campaign Studio', sub: 'Messages only go to people who opted in, after approval.', render: campaignsView },
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
      { id: 'shop', label: 'Shop', title: 'Shop the harvest', sub: 'Stock is checked live; prices are examples.', render: shopView },
      { id: 'orders', label: 'My orders', title: 'My orders', sub: null, render: customerOrdersView },
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
    $('[data-title]').textContent = view.title;
    $('[data-subtitle]').textContent = view.sub || '';
    document.title = view.title + ' — MEOD Portal';

    var root = $('[data-view]');
    root.textContent = '';
    view.render(root);
  }

  function signOut() {
    M.auth.signOut();
    try { sessionStorage.removeItem('meod-cart'); } catch (e) { /* ignore */ }
    location.href = 'portal.html';
  }
  $('[data-sign-out]').addEventListener('click', signOut);
  window.addEventListener('hashchange', function () { render(); window.scrollTo(0, 0); });
  // Pick up changes made in another tab (e.g. a booking on the public site).
  window.addEventListener('storage', function (e) {
    if (e.key === 'meod-demo-state-v2' && e.newValue) {
      try { Object.assign(M.state, JSON.parse(e.newValue)); render(); } catch (err) { /* ignore */ }
    }
  });
  if (session.role === 'customer' && sessionStorage.getItem('meod-join-code') && !location.hash) location.hash = 'group';
  render();
})();
