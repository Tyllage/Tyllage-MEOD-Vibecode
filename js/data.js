/* Tyllage x MEOD Farm — demo data + business rules.
 *
 * PROTOTYPE ONLY. Everything here is synthetic: names, phone numbers and
 * prices are made up. Live products, prices and stock would come from MEOD's
 * Shopify store through a backend; nothing here talks to a server.
 *
 * State lives in the visitor's localStorage so changes (orders, bookings,
 * campaign approvals) survive a page reload. "Reset demo data" in the portal
 * puts everything back.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'meod-demo-state-v2';

  // Illustrative commercial rules — MEOD must confirm the real values.
  var RULES = {
    commissionRate: 0.05,          // group leader commission on net merchandise
    groupDiscountRate: 0.05,       // discount when a group-buy code is used
    freeDeliveryThresholdCents: 6000,
    deliveryFeeCents: 800,
    stockStaleAfterMinutes: 360,   // older syncs are treated as unknown
    lowStockQty: 10,
    humanHours: { days: [1, 2, 3, 4, 5, 6], start: 9, end: 18 } // Mon–Sat 9am–6pm SGT
  };

  // Demo sign-in. The password is shared by every demo account and is NOT a
  // secret: the portal is client-side only and must never hold real data.
  var DEMO_PASSWORD = 'meod-demo-2026';

  var CATEGORIES = {
    'asian-greens': { label: 'Asian Greens', emoji: '🥬', color: '#d9ecd0' },
    lettuces: { label: 'Lettuces & Salads', emoji: '🥗', color: '#e4f2d5' },
    fungi: { label: 'Fungi', emoji: '🍄', color: '#efe5d8' },
    herbs: { label: 'Herbs', emoji: '🌿', color: '#dcefe3' },
    'farm-more': { label: 'Farm & More', emoji: '🍨', color: '#f6e7c8' }
  };

  // [title, subtitle, category, priceCents, qty, nutrients, blurb, aliases]
  var PRODUCT_ROWS = [
    ['Xiao Bai Cai', 'Bok Choy', 'asian-greens', 350, 48, 'Vitamins A, C, K • Calcium, Iron', 'Mild and slightly sweet. Stir-fry with garlic or add to soups.', ['bok choy', 'pak choy', '小白菜']],
    ['HK Cai Xin', 'Choy Sum', 'asian-greens', 380, 36, 'Vitamins K, C, A • Folate', 'The "heart" of vegetables. Sweet and less bitter — a family favourite.', ['choy sum', 'cai xin', 'sawi', '菜心']],
    ['Red Pak Choy', 'Red Bok Choy', 'asian-greens', 420, 8, 'Vitamins A, C, K • Antioxidants', 'Deep violet leaves rich in antioxidant red pigments.', ['red bok choy', '红小白菜']],
    ['Kai Lan', 'Chinese Broccoli', 'asian-greens', 400, 40, 'Vitamins A, C, K • Calcium', 'Glossy stems, earthy flavour — perfect with oyster sauce.', ['kailan', 'kai lan', '芥兰']],
    ['Kangkong', 'Water Spinach', 'asian-greens', 300, 55, 'Vitamins A, C • Iron, Fibre', 'Hawker favourite — wok-fry with sambal belacan.', ['kangkung', 'water spinach', '空心菜']],
    ['Bayam', 'Red Spinach', 'asian-greens', 320, 30, 'Vitamins A, C, K • Iron', 'Vibrant amaranth leaves packed with iron.', ['red spinach', 'amaranth', '苋菜']],
    ['Cos Lettuce', 'Romaine', 'lettuces', 450, 42, 'Vitamins A, K • Folate, Fibre', 'Crisp and sturdy — the king of salads.', ['romaine', 'cos', 'lettuce', '生菜']],
    ['Mizuna', 'Japanese Mustard Greens', 'lettuces', 480, 22, 'Vitamins A, C, K • Iron', 'Feathery leaves with a mild peppery kick.', ['mizuna']],
    ['Tuscan Kale', 'Lacinato Kale', 'lettuces', 550, 18, 'Vitamins A, C, K • Manganese', 'Deep earthy superfood for salads, smoothies and bakes.', ['kale', 'tuscan', '羽衣甘蓝']],
    ['Mesclun Mix', 'Mixed Salad Greens', 'lettuces', 590, 26, 'Vitamins A, C, K • Folate', 'Baby rocket, mizuna, red coral and more. Ready to dress.', ['salad', 'mesclun', '沙拉']],
    ['Shiitake Mushroom', 'Indoor-grown', 'fungi', 650, 33, 'Vitamins B, D • Zinc, Selenium', 'Rich umami and meaty texture. Grill, stir-fry or simmer.', ['shiitake', 'mushroom', 'cendawan', '香菇']],
    ['Oyster Mushroom', 'Delicate & velvety', 'fungi', 580, 0, 'Vitamins B, D • Potassium', 'Silky texture, gentle flavour. Great in soups.', ['oyster', '平菇']],
    ['Sweet Basil', 'Aromatic herb', 'herbs', 300, 25, 'Vitamin K • Antioxidants', 'Fragrant leaves for pasta, pesto and Thai stir-fries.', ['basil', '罗勒']],
    ['Garden Mint', 'Aromatic herb', 'herbs', 300, 6, 'Vitamin A • Iron', 'Cooling and fresh — teas, salads and desserts.', ['mint', 'pudina', '薄荷']],
    ['Goodness Gracious Gelato', 'Kale Macadamia · Kale Banana · Mango', 'farm-more', 1290, 14, 'Ready-to-eat', 'Small-batch gelato made with greens from our farm.', ['gelato', 'ice cream', '冰淇淋', 'aiskrim']],
    ['Surprise Harvest Bag', 'Chef-picked seasonal mix', 'farm-more', 1800, 12, 'Seasonal selection', 'A surprise mix of whatever is best this week.', ['surprise', 'harvest bag', '惊喜']],
    ['Farm Pesto', 'Basil & greens', 'farm-more', 1150, 20, 'Ready-to-eat', 'Fresh pesto blended from our basil and leafy greens.', ['pesto']],
    ['Veggie Crackers', 'Baked with farm greens', 'farm-more', 890, 24, 'Ready-to-eat', 'Crunchy wholesome crackers with greens baked in.', ['cracker', 'crackers', '饼干']],
    ['Vege Powder', 'Mushroom & greens seasoning', 'farm-more', 1490, 9, 'Ready-to-eat', 'Dried farm veg and mushrooms ground into an everyday seasoning.', ['powder', 'seasoning', '蔬菜粉']]
  ];

  // Product photos supplied by MEOD (optimised copies in assets/img).
  var IMAGES = {
    'Xiao Bai Cai': 'assets/img/veg-xiao-bai-cai.webp',
    'Tuscan Kale': 'assets/img/veg-tuscan-kale.webp',
    'Mesclun Mix': 'assets/img/veg-mesclun.webp',
    'Shiitake Mushroom': 'assets/img/veg-shiitake.webp',
    'Goodness Gracious Gelato': 'assets/img/product-gelato.webp',
    'Farm Pesto': 'assets/img/product-pesto.webp',
    'Veggie Crackers': 'assets/img/product-crackers.webp',
    'Vege Powder': 'assets/img/product-vegepowder.webp'
  };

  function minutesAgo(m) { return new Date(Date.now() - m * 60000).toISOString(); }
  function daysFromNow(d) { return new Date(Date.now() + d * 864e5).toISOString(); }

  function priceOrder(items, groupDiscount) {
    var subtotal = items.reduce(function (s, i) { return s + i.priceCents * i.qty; }, 0);
    var discount = groupDiscount ? Math.round(subtotal * RULES.groupDiscountRate) : 0;
    var net = subtotal - discount;
    var delivery = net === 0 || net >= RULES.freeDeliveryThresholdCents ? 0 : RULES.deliveryFeeCents;
    return { subtotalCents: subtotal, discountCents: discount, netCents: net, deliveryCents: delivery, totalCents: net + delivery };
  }

  function buildSeed() {
    var products = PRODUCT_ROWS.map(function (r, idx) {
      var id = 'P-' + (1001 + idx);
      var stale = r[0] === 'Mizuna'; // one stale sync so fail-closed behaviour is visible
      return {
        id: id, title: r[0], subtitle: r[1], category: r[2], priceCents: r[3],
        nutrients: r[5], blurb: r[6], aliases: r[7], image: IMAGES[r[0]] || null,
        meodGrown: r[2] !== 'farm-more' || r[0].indexOf('Bag') > -1,
        stock: { qty: r[4], syncStatus: stale ? 'stale' : 'ok', updatedAt: minutesAgo(stale ? 900 : 12), source: 'shopify-mock' }
      };
    });
    function p(title) { return products.filter(function (x) { return x.title === title; })[0]; }

    var customers = [
      { id: 'C-1001', name: 'Aster Lim', phone: '+65 8000 0001', email: 'customer@meod.test', language: 'en', consentMarketing: true, consentPersonalisation: true },
      { id: 'C-1002', name: 'Bee Ling Tan', phone: '+65 8000 0002', email: 'beeling@example.test', language: 'zh', consentMarketing: true, consentPersonalisation: true },
      { id: 'C-1003', name: 'Citra Rahman', phone: '+65 8000 0003', email: 'citra@example.test', language: 'ms', consentMarketing: true, consentPersonalisation: true },
      { id: 'C-1004', name: 'Devi Kumar', phone: '+65 8000 0004', email: 'devi@example.test', language: 'ta', consentMarketing: false, consentPersonalisation: false },
      { id: 'C-1005', name: 'Ethan Goh', phone: '+65 8000 0005', email: 'ethan@example.test', language: 'en', consentMarketing: true, consentPersonalisation: true },
      { id: 'C-1006', name: 'Fang Wu', phone: '+65 8000 0006', email: 'fang@example.test', language: 'zh', consentMarketing: false, consentPersonalisation: true }
    ];

    var leaders = [
      { id: 'L-1001', name: 'Grace Ong', area: 'Punggol', commissionRate: RULES.commissionRate },
      { id: 'L-1002', name: 'Hari Singh', area: 'Bukit Batok', commissionRate: RULES.commissionRate }
    ];

    var events = [
      { id: 'G-1001', leaderId: 'L-1001', title: 'Punggol Weekend Greens', code: 'PUNGGOL-GREENS', endsAt: daysFromNow(5), terms: 'Pickup at Blk 2xx void deck, Sat 10am.', status: 'open' },
      { id: 'G-1002', leaderId: 'L-1002', title: 'Bukit Batok Mushroom Run', code: 'BB-FUNGI', endsAt: daysFromNow(-6), terms: 'Delivered to leader on Thursday.', status: 'closed' }
    ];

    // [customerId, [[title, qty]], status, groupEventId, daysAgo]
    var history = [
      ['C-1001', [['Cos Lettuce', 2], ['Mesclun Mix', 1], ['Sweet Basil', 1]], 'fulfilled', null, 21],
      ['C-1001', [['Shiitake Mushroom', 2], ['Kai Lan', 3]], 'fulfilled', 'G-1001', 4],
      ['C-1002', [['Xiao Bai Cai', 4], ['HK Cai Xin', 3], ['Kangkong', 2]], 'paid', 'G-1001', 3],
      ['C-1003', [['Shiitake Mushroom', 3], ['Oyster Mushroom', 2]], 'fulfilled', 'G-1002', 10],
      ['C-1004', [['Tuscan Kale', 2], ['Goodness Gracious Gelato', 1]], 'fulfilled', null, 14],
      ['C-1005', [['Surprise Harvest Bag', 2], ['Bayam', 2]], 'refunded', 'G-1002', 9],
      ['C-1006', [['Kai Lan', 2], ['Red Pak Choy', 2]], 'pending_payment', 'G-1001', 1],
      ['C-1005', [['Cos Lettuce', 1], ['Garden Mint', 2]], 'paid', null, 2]
    ];
    var orders = history.map(function (h, idx) {
      var items = h[1].map(function (line) {
        var prod = p(line[0]);
        return { productId: prod.id, title: prod.title, qty: line[1], priceCents: prod.priceCents };
      });
      var totals = priceOrder(items, Boolean(h[3]));
      return Object.assign({
        id: 'O-' + (1001 + idx), ref: '#MF' + (5001 + idx), customerId: h[0], groupEventId: h[3],
        status: h[2], items: items, refundedCents: h[2] === 'refunded' ? totals.netCents : 0,
        createdAt: minutesAgo(h[4] * 1440), source: 'shopify-mock'
      }, totals);
    });

    var users = [
      { email: 'admin@meod.test', name: 'MEOD Admin', role: 'admin' },
      { email: 'sales@meod.test', name: 'Sales Staff', role: 'staff' },
      { email: 'leader@meod.test', name: 'Grace Ong', role: 'leader', leaderId: 'L-1001' },
      { email: 'leader2@meod.test', name: 'Hari Singh', role: 'leader', leaderId: 'L-1002' },
      { email: 'customer@meod.test', name: 'Aster Lim', role: 'customer', customerId: 'C-1001' }
    ];

    return {
      version: 2,
      products: products,
      customers: customers,
      leaders: leaders,
      events: events,
      orders: orders,
      users: users,
      tickets: [
        { id: 'T-1001', customerId: 'C-1003', channel: 'whatsapp', intent: 'complaint', summary: 'Reports wilted leaves in last delivery.', status: 'open', assignee: null, createdAt: minutesAgo(95) },
        { id: 'T-1002', customerId: 'C-1006', channel: 'web', intent: 'payment', summary: 'Asks why payment link expired.', status: 'open', assignee: 'sales@meod.test', createdAt: minutesAgo(40) }
      ],
      bookings: [
        { id: 'B-1001', name: 'Demo School Group', email: 'teacher@example.test', phone: '+65 8000 0099', experience: 'School Visit', pax: 30, date: daysFromNow(14).slice(0, 10), message: 'Primary 4 science trip.', status: 'new', createdAt: minutesAgo(300) }
      ],
      campaigns: [
        { id: 'CP-1001', productId: p('Shiitake Mushroom').id, title: 'Mushroom Monday', message: 'Fresh shiitake harvested this morning — 5% off with your group code this week!', language: 'en', audience: ['C-1003', 'C-1001'], status: 'sent', createdBy: 'sales@meod.test', approvedBy: 'admin@meod.test', createdAt: minutesAgo(4320), sentCount: 2 }
      ],
      audit: [
        { at: minutesAgo(4300), actor: 'admin@meod.test', event: 'campaign.approved', target: 'CP-1001' }
      ],
      seq: 2000
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.version === 2) return parsed;
      }
    } catch (e) { /* storage blocked or corrupt — fall back to seed */ }
    return buildSeed();
  }

  var state = load();

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  function reset() {
    state = buildSeed();
    save();
    window.MEOD.state = state;
  }

  function nextId(prefix) { state.seq += 1; return prefix + '-' + state.seq; }

  function byId(collection, id) {
    return state[collection].filter(function (x) { return x.id === id; })[0] || null;
  }

  // Fail closed: stale or failed syncs never claim availability.
  function stockStatus(product) {
    var s = product.stock;
    var ageMin = (Date.now() - new Date(s.updatedAt).getTime()) / 60000;
    if (s.syncStatus !== 'ok' || ageMin > RULES.stockStaleAfterMinutes) {
      return { key: 'stale', label: 'Checking stock', known: false, qty: null };
    }
    if (s.qty <= 0) return { key: 'out', label: 'Sold out', known: true, qty: 0 };
    if (s.qty <= RULES.lowStockQty) return { key: 'low', label: 'Only ' + s.qty + ' left', known: true, qty: s.qty };
    return { key: 'ok', label: 'In stock', known: true, qty: s.qty };
  }

  function findProduct(text) {
    var q = text.toLowerCase();
    var hit = state.products.filter(function (p) { return q.indexOf(p.title.toLowerCase()) > -1; })[0];
    if (hit) return hit;
    return state.products.filter(function (p) {
      return p.aliases.some(function (a) { return q.indexOf(a.toLowerCase()) > -1; });
    })[0] || null;
  }

  // Commission ledger derived from orders so every figure is reproducible.
  // Basis: net merchandise (subtotal − discount), delivery excluded; accrues
  // once paid/fulfilled; refunds post a matching negative adjustment.
  function ledgerEntry(order) {
    var event = byId('events', order.groupEventId);
    if (!event) return null;
    var leader = byId('leaders', event.leaderId);
    var rate = leader ? leader.commissionRate : 0;
    var eligible = ['paid', 'fulfilled', 'refunded'].indexOf(order.status) > -1;
    var base = eligible ? order.netCents : 0;
    var amount = Math.round(base * rate);
    var adjustment = -Math.round((order.refundedCents || 0) * rate);
    var status = order.status === 'cancelled' ? 'void'
      : order.status === 'refunded' ? 'reversed'
      : eligible ? 'accrued' : 'pending';
    return {
      orderId: order.id, ref: order.ref, eventId: event.id, leaderId: event.leaderId, customerId: order.customerId,
      baseCents: base, rate: rate, amountCents: amount, adjustmentCents: adjustment,
      payableCents: amount + adjustment, status: status
    };
  }

  function ledger(leaderId) {
    return state.orders
      .filter(function (o) { return o.groupEventId; })
      .map(ledgerEntry)
      .filter(function (e) { return e && (!leaderId || e.leaderId === leaderId); });
  }

  function recommendFor(customer, limit) {
    limit = limit || 4;
    var available = state.products.filter(function (p) { var s = stockStatus(p); return s.known && s.qty > 0; });
    if (!customer || !customer.consentPersonalisation) {
      return available.filter(function (p) { return p.meodGrown; }).slice(0, limit)
        .map(function (p) { return { product: p, reason: 'Freshly harvested this week' }; });
    }
    var bought = {}, seedByCategory = {};
    state.orders.filter(function (o) { return o.customerId === customer.id; }).forEach(function (o) {
      o.items.forEach(function (i) {
        bought[i.productId] = true;
        var prod = byId('products', i.productId);
        if (prod && !seedByCategory[prod.category]) seedByCategory[prod.category] = prod.title;
      });
    });
    var picks = [];
    available.forEach(function (p) {
      if (!bought[p.id] && seedByCategory[p.category]) {
        picks.push({ product: p, reason: 'You bought ' + seedByCategory[p.category] + ' before — try more ' + CATEGORIES[p.category].label.toLowerCase() });
      }
    });
    available.forEach(function (p) {
      if (bought[p.id]) picks.push({ product: p, reason: 'One of your past picks — in stock now' });
    });
    return picks.slice(0, limit);
  }

  function withinHumanHours(date) {
    // Convert to Singapore time (UTC+8, no DST).
    var sg = new Date((date || new Date()).getTime() + (8 * 60 + (date || new Date()).getTimezoneOffset()) * 60000);
    var h = RULES.humanHours;
    return h.days.indexOf(sg.getDay()) > -1 && sg.getHours() >= h.start && sg.getHours() < h.end;
  }

  function audit(actor, event, target) {
    state.audit.unshift({ at: new Date().toISOString(), actor: actor, event: event, target: target });
    state.audit = state.audit.slice(0, 300);
  }

  function money(cents) { return 'S$' + (cents / 100).toFixed(2); }

  function maskName(name) {
    return String(name || '').split(/\s+/).filter(Boolean)
      .map(function (w) { return w[0] + '***'; }).join(' ');
  }
  function maskPhone(phone) {
    var d = String(phone || '').replace(/\D/g, '');
    return d.length >= 4 ? '**** ' + d.slice(-4) : '****';
  }

  window.MEOD = {
    state: state, RULES: RULES, CATEGORIES: CATEGORIES, DEMO_PASSWORD: DEMO_PASSWORD,
    save: save, reset: reset, nextId: nextId, byId: byId,
    stockStatus: stockStatus, findProduct: findProduct, priceOrder: priceOrder,
    ledger: ledger, ledgerEntry: ledgerEntry, recommendFor: recommendFor,
    withinHumanHours: withinHumanHours, audit: audit,
    money: money, maskName: maskName, maskPhone: maskPhone
  };
})();
