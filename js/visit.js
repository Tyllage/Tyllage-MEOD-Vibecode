/* Visitor farm shop (visit.html?code=…) — opened from the QR code a guide shows a visiting
 * group. Visitors order today's produce with the group's discount; part of the group's
 * orders goes back to its fund (see M.visits in data.js). No account needed.
 * PROTOTYPE: orders and contact details are saved in this browser only. */
(function () {
  'use strict';
  var M = window.MEOD;
  var root = document.querySelector('[data-visit-root]');
  if (!root || !M.visits) return;

  function el(tag, props) {
    var node = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) add(node, arguments[i]);
    return node;
  }
  function add(node) {
    for (var i = 1; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      if (Array.isArray(c)) { c.forEach(function (x) { add(node, x); }); continue; }
      node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
  }
  var money = M.money;
  function longDate(key) { return M.clearance.parseDayKey(key).toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long' }); }
  function shortDate(iso) { return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }); }
  function thumb(p) {
    if (p.image) return el('div', { class: 'vs-thumb' + (p.category === 'farm-more' ? ' cover' : '') }, el('img', { src: p.image, alt: '', loading: 'lazy', width: 200, height: 200 }));
    var t = el('div', { class: 'vs-thumb art', 'aria-hidden': 'true' });
    t.style.background = M.CATEGORIES[p.category].color;
    t.innerHTML = '<svg viewBox="0 0 64 64">' + (M.CATEGORY_ART[p.category] || '') + '</svg>';
    return t;
  }

  var code = (new URLSearchParams(location.search).get('code') || '').trim().toUpperCase();

  function codeEntry(message) {
    root.textContent = '';
    var input = el('input', { name: 'code', maxlength: 24, placeholder: 'e.g. SUNRISE-PRIMARY-1110', 'aria-label': 'Visit code', value: code });
    var form = el('form', { class: 'form vs-code-form' },
      el('h1', { class: 'section-title', text: 'Visitor farm shop' }),
      message ? el('p', { class: 'form-error', text: message }) : null,
      el('p', { class: 'lead', text: 'Visiting MEOD Farm with a school, company or community group? Enter the code your guide gave you, or scan the QR code.' }),
      el('label', null, 'Visit code', input),
      el('button', { class: 'btn btn-forest', type: 'submit', text: 'Open my group\'s shop' }));
    form.addEventListener('submit', function (e) { e.preventDefault(); location.search = '?code=' + encodeURIComponent(input.value.trim().toUpperCase()); });
    add(root, form);
  }

  if (!code) { codeEntry(); return; }
  var ev = M.visits.byCode(code);
  if (!ev) { codeEntry('We couldn\'t find the code "' + code + '". Check it with your guide.'); return; }
  var booking = M.byId('bookings', ev.bookingId);
  var type = M.GROUP_TYPES[booking && booking.groupType] || M.GROUP_TYPES.other;
  var open = ev.status === 'open' && new Date(ev.endsAt).getTime() > Date.now();
  var pct = Math.round(M.RULES.visitFundRate * 100);
  var orgName = booking ? (booking.org || booking.name) : ev.title;

  var head = el('header', { class: 'vs-head' },
    el('span', { class: 'eyebrow dark', text: 'Visitor farm shop' }),
    el('h1', { class: 'section-title', text: 'Welcome, ' + orgName }),
    el('p', { class: 'lead', text: !booking ? 'Take the farm home with your group\'s code.'
      : (M.clearance.parseDayKey(booking.date).getTime() > Date.now() ? 'See you at MEOD Farm on ' + longDate(booking.date) + '. ' : 'Thanks for visiting MEOD Farm on ' + longDate(booking.date) + '. ') +
        'Take the farm home: everything here was grown pesticide-free in Kranji.' }),
    el('ul', { class: 'vs-chips' },
      el('li', null, el('strong', { text: Math.round(M.RULES.groupDiscountRate * 100) + '% off' }), ' with code ', el('code', { text: ev.code })),
      el('li', null, el('strong', { text: pct + '%' }), ' of your order goes to the ' + type.fund),
      el('li', { text: open ? 'Open until ' + shortDate(ev.endsAt) : 'This shop has closed' })));

  if (!open) {
    root.textContent = '';
    add(root, head, el('div', { class: 'form' },
      el('p', { class: 'lead', text: 'Your group\'s farm shop has closed, but you can still buy MEOD produce any time.' }),
      el('a', { class: 'btn btn-forest', href: 'produce.html', text: 'See our produce' })));
    return;
  }

  /* ---- Shop ---- */
  var qty = {};
  var products = M.state.products.filter(function (p) { var s = M.stockStatus(p); return !p.bagOffer && s.known && s.qty > 0; });
  var grid = el('div', { class: 'vs-grid' });
  var summary = el('aside', { class: 'vs-summary', 'aria-label': 'Your order' });
  var errorBox = el('p', { class: 'form-error', hidden: true, 'aria-live': 'polite' });

  function lines() {
    return Object.keys(qty).filter(function (id) { return qty[id] > 0; }).map(function (id) {
      var p = M.byId('products', id);
      return { productId: id, qty: qty[id], priceCents: p.priceCents, title: p.title };
    });
  }
  function drawGrid() {
    grid.textContent = '';
    products.forEach(function (p) {
      var q = qty[p.id] || 0;
      var max = p.stock.qty;
      add(grid, el('article', { class: 'vs-item' + (q ? ' in-cart' : '') },
        thumb(p),
        el('div', { class: 'vs-item-body' },
          el('strong', { text: p.title }),
          el('small', { text: p.subtitle }),
          el('div', { class: 'vs-item-foot' },
            el('span', { class: 'vs-price', text: money(p.priceCents) }),
            q === 0
              ? el('button', { class: 'btn btn-sm btn-forest', type: 'button', text: '+ Add', 'aria-label': 'Add ' + p.title, onclick: function () { qty[p.id] = 1; draw(); } })
              : el('div', { class: 'vs-qty' },
                  el('button', { type: 'button', text: '−', 'aria-label': 'One less ' + p.title, onclick: function () { qty[p.id] = q - 1; draw(); } }),
                  el('span', { text: String(q) }),
                  el('button', { type: 'button', text: '+', 'aria-label': 'One more ' + p.title, disabled: q >= max, onclick: function () { qty[p.id] = q + 1; draw(); } }))))));
    });
  }

  var nameIn = el('input', { name: 'name', autocomplete: 'name', maxlength: 60 });
  var phoneIn = el('input', { name: 'phone', type: 'tel', autocomplete: 'tel', placeholder: '+65 …' });
  var langSel = el('select', { name: 'language' },
    el('option', { value: 'en', text: 'English' }), el('option', { value: 'zh', text: '中文' }), el('option', { value: 'ms', text: 'Bahasa Melayu' }), el('option', { value: 'ta', text: 'தமிழ்' }));
  var collect = el('input', { type: 'radio', name: 'fulfilment', value: 'collect', checked: true });
  var deliver = el('input', { type: 'radio', name: 'fulfilment', value: 'delivery' });
  var consent = el('input', { type: 'checkbox', name: 'consent' });
  [collect, deliver].forEach(function (r) { r.addEventListener('change', drawSummary); });

  function drawSummary() {
    var ls = lines();
    var fulfil = deliver.checked ? 'delivery' : 'collect';
    var t = M.visits.totals(ls, fulfil);
    var count = ls.reduce(function (s, l) { return s + l.qty; }, 0);
    var fund = Math.round(t.netCents * M.RULES.visitFundRate);
    summary.textContent = '';
    add(summary,
      el('h2', { text: 'Your order' }),
      ls.length ? el('ul', { class: 'vs-lines' }, ls.map(function (l) { return el('li', null, el('span', { text: l.qty + ' × ' + l.title }), el('span', { text: money(l.qty * l.priceCents) })); }))
        : el('p', { class: 'form-note', text: 'Nothing added yet.' }),
      ls.length ? el('div', { class: 'vs-totals' },
        el('div', null, el('span', { text: 'Subtotal' }), el('span', { text: money(t.subtotalCents) })),
        el('div', { class: 'vs-saving' }, el('span', { text: 'Group discount' }), el('span', { text: '−' + money(t.discountCents) })),
        el('div', null, el('span', { text: fulfil === 'delivery' ? 'Delivery' : 'Collect at the farm' }), el('span', { text: t.deliveryCents ? money(t.deliveryCents) : 'Free' })),
        el('div', { class: 'vs-total' }, el('span', { text: 'Total' }), el('span', { text: money(t.totalCents) })),
        el('p', { class: 'vs-fund', text: money(fund) + ' of this goes to the ' + type.fund + '.' })) : null,
      el('fieldset', { class: 'vs-fieldset' },
        el('legend', { text: 'How do you want it?' }),
        el('label', { class: 'vs-radio' }, collect, el('span', null, el('strong', { text: 'Collect at the farm' }), el('small', { text: 'Packed for you before you leave.' }))),
        el('label', { class: 'vs-radio' }, deliver, el('span', null, el('strong', { text: 'Deliver to me' }), el('small', { text: 'Next delivery: ' + M.nextDeliveryDay(new Date()).toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'short' }) + '. Free from ' + money(M.RULES.freeDeliveryThresholdCents) + '.' })))),
      el('label', null, 'Your name', nameIn),
      el('label', null, 'WhatsApp / phone', phoneIn),
      el('label', null, 'Preferred language', langSel),
      el('label', { class: 'vs-consent' }, consent, el('span', { text: 'Send me harvest updates, recipes and offers from MEOD on WhatsApp. I can stop anytime by replying STOP.' })),
      errorBox,
      el('button', { class: 'btn btn-forest vs-submit', type: 'button', disabled: !ls.length, text: ls.length ? 'Place order · ' + money(t.totalCents) : 'Place order', onclick: submit }),
      el('p', { class: 'form-note', text: 'Prototype: your order and details are saved in this browser only. In the live version you\'d pay securely on MEOD Fresh.' }));
  }
  function draw() { drawGrid(); drawSummary(); }

  function submit() {
    var r = M.visits.order(ev.code, { name: nameIn.value, phone: phoneIn.value, language: langSel.value, consentMarketing: consent.checked }, lines(), deliver.checked ? 'delivery' : 'collect');
    if (!r.ok) { errorBox.textContent = r.error; errorBox.hidden = false; return; }
    M.audit('visit-shop', 'order.created', r.order.ref);
    M.save();
    root.textContent = '';
    add(root, head, el('div', { class: 'form vs-done' },
      el('h2', { text: 'Thank you, ' + r.customer.name.split(' ')[0] + '!' }),
      el('p', { class: 'lead', text: 'Order ' + r.order.ref + ' is in. ' + (r.order.fulfilment === 'delivery'
        ? 'We\'ll deliver it on ' + M.nextDeliveryDay(new Date()).toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'short' }) + '.'
        : 'Collect it at the farm shop before you leave.') }),
      el('p', { text: money(Math.round(r.order.netCents * M.RULES.visitFundRate)) + ' from your order goes to the ' + type.fund + '. ' +
        (r.customer.consentMarketing ? 'You\'re signed up for harvest updates — reply STOP anytime.' : 'Want harvest updates later? Just message us on WhatsApp.') }),
      el('a', { class: 'btn btn-outline', href: location.pathname + '?code=' + encodeURIComponent(ev.code), text: 'Place another order' })));
    window.scrollTo(0, 0);
  }

  root.textContent = '';
  add(root, head, el('div', { class: 'vs-layout' }, el('section', { class: 'vs-products', 'aria-label': 'Today\'s produce' }, grid), summary));
  draw();
})();
