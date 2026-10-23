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
    humanHours: { days: [1, 2, 3, 4, 5, 6], start: 9, end: 18 }, // Mon–Sat 9am–6pm SGT
    clearanceCutoffHour: 22,        // bag pre-orders close 10pm the day before delivery
    clearanceCandidateQty: 20,      // flag as a clearance candidate above this stock level
    clearanceCandidateSoldRatio: 0.25, // ...and sold less than this share of stock in 14 days
    clearanceDefaultMinRate: 0.6,   // staff default minimum price = 60% of normal price
    preorderCutoffHour: 22,         // harvest pre-orders close 10pm the day before harvest
    preorderDefaultShare: 0.6,      // share of a batch's expected yield opened to pre-order
    // Typical sow-to-harvest days per category (illustrative — MEOD's growers to confirm).
    growDays: { 'asian-greens': 30, lettuces: 40, fungi: 14, herbs: 45 }
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

  // Line illustrations for products without a photo (static markup, no data).
  var CATEGORY_ART = {
    'asian-greens': '<path d="M32 58V30"/><path d="M32 40c-10-2-16-10-16-22 9 1 15 7 16 16"/><path d="M32 36c9-3 14-11 13-22-8 2-13 8-13 17"/><path d="M32 48c-7-1-12-5-14-11"/><path d="M32 46c6-1 11-5 13-10"/>',
    lettuces: '<path d="M14 40c0-12 8-22 18-22s18 10 18 22"/><path d="M10 42c4 10 12 16 22 16s18-6 22-16"/><path d="M22 30c3 5 3 12 0 18"/><path d="M42 30c-3 5-3 12 0 18"/><path d="M32 22v34"/>',
    fungi: '<path d="M10 32c0-12 10-20 22-20s22 8 22 20H10z"/><path d="M25 32v16a7 7 0 0 0 14 0V32"/><circle cx="22" cy="24" r="2"/><circle cx="36" cy="20" r="2"/><circle cx="44" cy="27" r="1.5"/>',
    herbs: '<path d="M32 58V14"/><path d="M32 22c-6 0-10-4-10-9 6 0 10 4 10 9z"/><path d="M32 22c6 0 10-4 10-9-6 0-10 4-10 9z"/><path d="M32 36c-8 0-13-5-13-11 8 0 13 5 13 11z"/><path d="M32 36c8 0 13-5 13-11-8 0-13 5-13 11z"/><path d="M32 50c-8 0-13-5-13-11 8 0 13 5 13 11z"/><path d="M32 50c8 0 13-5 13-11-8 0-13 5-13 11z"/>',
    'farm-more': '<rect x="18" y="22" width="28" height="34" rx="5"/><path d="M20 14h24v8H20z"/><path d="M18 34h28"/>'
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
        // The flat-price bag product stays for old orders/receipts, but is now sold only
        // through the Buy to Clear bag flow (sizes, cutoff, excluded category) — see M.clearance.
        bagOffer: r[0] === 'Surprise Harvest Bag',
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

  /* ---------- Delivery tracking (mock adapter) ----------
   * Stand-in for a real tracking source. Event statuses follow Shopify's
   * fulfillment event names (confirmed, picked_up, out_for_delivery,
   * delivered …) so this function can later read Shopify fulfillment
   * webhooks, or a courier / driver app such as Detrack, without the UI
   * changing. Everything here is derived from the order — nothing is stored.
   */
  var DELIVERY_DAYS = [2, 4, 6]; // Tue, Thu, Sat
  var DRIVERS = ['Rahman', 'Wei Jie', 'Suresh', 'Kok Leong'];

  function atTime(day, h, m) { var d = new Date(day); d.setHours(h, m, 0, 0); return d; }
  function nextDeliveryDay(from) {
    var d = new Date(from);
    d.setHours(0, 0, 0, 0);
    for (var i = 1; i <= 7; i++) {
      d.setDate(d.getDate() + 1);
      if (DELIVERY_DAYS.indexOf(d.getDay()) > -1) return d;
    }
    return d;
  }
  function hashOf(s) { var x = 0; for (var i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) % 9973; return x; }

  function trackingFor(order) {
    var seed = hashOf(order.id);
    var driver = DRIVERS[seed % DRIVERS.length];
    var trackingNo = 'MF-TRK-' + (100000 + seed * 7).toString().slice(-6);
    var placed = new Date(order.createdAt);
    var now = Date.now();
    var ev = function (status, label, at, detail) { return { status: status, label: label, at: at ? new Date(at).toISOString() : null, detail: detail || '' }; };
    var base = { trackingNo: trackingNo, carrier: 'MEOD delivery', driver: null, stopsAway: null, windowStart: null, windowEnd: null, proof: null, progress: 0 };

    if (order.status === 'cancelled' || order.status === 'refunded') {
      return Object.assign(base, { state: 'closed', headline: order.status === 'refunded' ? 'Refunded' : 'Cancelled', events: [] });
    }
    if (order.status === 'pending_payment') {
      return Object.assign(base, {
        state: 'awaiting', headline: 'Awaiting payment', sub: 'We\'ll schedule your delivery as soon as payment is confirmed.', progress: 0.05,
        events: [ev('placed', 'Order placed', placed), ev('confirmed', 'Payment confirmed', null), ev('picked_up', 'Packed at the farm', null), ev('out_for_delivery', 'Out for delivery', null), ev('delivered', 'Delivered', null)]
      });
    }

    var day, packed, out, delivered, winStart, winEnd;
    if (order.trackingDemo === 'live') {
      // Demo order: always mid-route relative to "now".
      packed = new Date(now - 5.5 * 36e5);
      out = new Date(now - 48 * 6e4);
      winStart = new Date(now + 10 * 6e4);
      winEnd = new Date(now + 40 * 6e4);
      return Object.assign(base, {
        state: 'out_for_delivery', headline: 'Out for delivery', driver: driver, stopsAway: 2, progress: 0.68,
        windowStart: winStart.toISOString(), windowEnd: winEnd.toISOString(),
        sub: driver + ' is 2 stops away',
        events: [ev('placed', 'Order placed', placed.getTime() - 864e5), ev('confirmed', 'Payment confirmed', placed.getTime() - 864e5 + 3e5),
          ev('picked_up', 'Packed at the farm', packed, 'Harvested and packed in Kranji'), ev('out_for_delivery', 'Out for delivery', out, 'With ' + driver),
          ev('delivered', 'Delivered', null)]
      });
    }

    day = nextDeliveryDay(placed);
    if (order.status === 'fulfilled') {
      delivered = atTime(day, 14 + (seed % 3), 5 + (seed % 50));
      if (delivered.getTime() > now) delivered = new Date(Math.max(placed.getTime() + 864e5, now - 36e5));
      day = new Date(delivered);
      return Object.assign(base, {
        state: 'delivered', headline: 'Delivered', driver: driver, progress: 1,
        sub: 'Delivered ' + day.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' + delivered.toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' }),
        proof: { receivedBy: seed % 2 ? 'Left at door' : 'Received by customer', photo: true },
        events: [ev('placed', 'Order placed', placed), ev('confirmed', 'Payment confirmed', placed.getTime() + 3e5),
          ev('picked_up', 'Packed at the farm', atTime(day, 6, 40), 'Harvested and packed in Kranji'),
          ev('out_for_delivery', 'Out for delivery', atTime(day, 13, 20), 'With ' + driver),
          ev('delivered', 'Delivered', delivered, seed % 2 ? 'Left at door' : 'Received by customer')]
      });
    }

    // Paid: scheduled for the next delivery day after today — or, for a pre-order, its
    // (latest) harvest day, since pre-ordered produce is picked and delivered that morning.
    day = nextDeliveryDay(Math.max(placed.getTime(), now - 864e5));
    order.items.forEach(function (i) {
      if (!i.harvestDate) return;
      var hd = parseDayKey(i.harvestDate);
      if (hd.getTime() > day.getTime()) day = hd;
    });
    winStart = atTime(day, 14, 0);
    winEnd = atTime(day, 18, 0);
    return Object.assign(base, {
      state: 'scheduled', headline: 'Scheduled', progress: 0.25,
      windowStart: winStart.toISOString(), windowEnd: winEnd.toISOString(),
      sub: 'Arriving ' + day.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'short' }) + ', 2–6pm',
      events: [ev('placed', 'Order placed', placed), ev('confirmed', 'Payment confirmed', placed.getTime() + 3e5),
        ev('picked_up', 'Packed at the farm', null), ev('out_for_delivery', 'Out for delivery', null), ev('delivered', 'Delivered', null)]
    });
  }

  // One-time additive data updates for browsers that already hold demo data.
  // Simulated background Shopify sync: in production stock syncs every few minutes, so
  // products that synced fine get a recent timestamp on each load. Without this, demo data
  // saved hours ago would all turn stale after RULES.stockStaleAfterMinutes.
  // Products whose sync failed (syncStatus !== 'ok', e.g. Mizuna) stay stale on purpose.
  function autoSync(s) {
    var now = Date.now();
    s.products.forEach(function (p, i) {
      if (p.stock.syncStatus !== 'ok') return;
      if (now - new Date(p.stock.updatedAt).getTime() > 15 * 60000) {
        p.stock.updatedAt = new Date(now - (2 + (i * 3) % 12) * 60000).toISOString();
      }
    });
    return s;
  }

  function migrate(s) {
    autoSync(s);
    s.migrations = s.migrations || {};
    if (!s.migrations.liveTracking) {
      var pick = function (title, qty) {
        var p = s.products.filter(function (x) { return x.title === title; })[0];
        return p ? { productId: p.id, title: p.title, qty: qty, priceCents: p.priceCents } : null;
      };
      var items = [pick('Xiao Bai Cai', 3), pick('Mesclun Mix', 2), pick('Tuscan Kale', 1)].filter(Boolean);
      var totals = priceOrder(items, false);
      s.seq = (s.seq || 2000) + 1;
      s.orders.push(Object.assign({
        id: 'O-' + s.seq, ref: '#MF' + (5000 + s.orders.length + 1), customerId: 'C-1001', groupEventId: null,
        status: 'paid', items: items, refundedCents: 0, createdAt: new Date(Date.now() - 864e5).toISOString(),
        source: 'shopify-mock', trackingDemo: 'live'
      }, totals));
      s.migrations.liveTracking = true;
    }
    if (!s.migrations.clearanceV1) {
      var byTitle = function (title) { return s.products.filter(function (x) { return x.title === title; })[0]; };
      s.clearance = s.clearance || [];
      var seedListing = function (title, qty, clearancePriceCents, minPriceCents, reason, untilDays) {
        var p = byTitle(title);
        if (!p) return;
        s.seq += 1;
        s.clearance.push({
          id: 'CL-' + s.seq, productId: p.id, qty: qty, qtySold: Math.max(0, Math.round(qty * 0.3)),
          normalPriceCents: p.priceCents, clearancePriceCents: clearancePriceCents, minPriceCents: minPriceCents,
          reason: reason, availableUntil: daysFromNow(untilDays), status: 'active',
          createdBy: 'sales@meod.test', createdAt: minutesAgo(180)
        });
      };
      seedListing('HK Cai Xin', 20, 250, 220, 'surplus', 3);
      seedListing('Kai Lan', 18, 260, 240, 'surplus', 2);
      seedListing('Mesclun Mix', 14, 390, 350, 'short_dated', 1);
      seedListing('Tuscan Kale', 10, 380, 330, 'cosmetic', 4);
      seedListing('Garden Mint', 4, 200, 180, 'short_dated', 2);

      s.harvestBag = {
        sizes: [
          { key: 'small', label: 'Small', priceCents: 1200, worthCents: 1800 },
          { key: 'regular', label: 'Regular', priceCents: 1800, worthCents: 2800 }
        ],
        limitPerDay: 15
      };
      s.migrations.clearanceV1 = true;
    }
    if (!s.migrations.clearanceDayKeyFix) {
      // Bug fix: bag orders saved with the old UTC-based day key can land one day early
      // (e.g. a Saturday bag keyed as Friday). Move any non-Tue/Thu/Sat deliveryDay forward a day.
      s.orders.forEach(function (o) {
        if (!o.bagSize || !o.deliveryDay) return;
        var d = parseDayKey(o.deliveryDay);
        if (DELIVERY_DAYS.indexOf(d.getDay()) === -1) {
          d.setDate(d.getDate() + 1);
          o.deliveryDay = bagDayKey(d);
        }
      });
      s.migrations.clearanceDayKeyFix = true;
    }
    if (!s.migrations.clearancePhotosV1) {
      // Swap the 3 seeded listings that had no product photo (leaf placeholder) for
      // photographed products, so the clearance grid always shows a real picture.
      var byTitle2 = function (title) { return s.products.filter(function (x) { return x.title === title; })[0]; };
      var reswap = function (oldTitle, newTitle, clearancePriceCents, minPriceCents) {
        var oldP = byTitle2(oldTitle), newP = byTitle2(newTitle);
        if (!oldP || !newP) return;
        var listing = s.clearance.filter(function (l) { return l.productId === oldP.id; })[0];
        if (!listing) return;
        listing.productId = newP.id;
        listing.normalPriceCents = newP.priceCents;
        listing.clearancePriceCents = clearancePriceCents;
        listing.minPriceCents = minPriceCents;
      };
      reswap('HK Cai Xin', 'Xiao Bai Cai', 230, 200);
      reswap('Kai Lan', 'Shiitake Mushroom', 450, 400);
      reswap('Garden Mint', 'Veggie Crackers', 600, 550);
      s.migrations.clearancePhotosV1 = true;
    }
    if (!s.migrations.harvestBatchesV1) {
      // Seed a few weeks of harvest batches plus pre-orders against them, so the Harvest
      // Planner and the shop's "pre-order the next harvest" row have something to show.
      var byTitle3 = function (title) { return s.products.filter(function (x) { return x.title === title; })[0]; };
      s.batches = s.batches || [];
      var batchIds = {};
      // [title, harvest on the Nth upcoming delivery day (0 = the last one before today), expected qty, status]
      [
        ['Xiao Bai Cai', 0, 60, 'harvested'],
        ['Oyster Mushroom', 2, 40],
        ['Tuscan Kale', 2, 50],
        ['Red Pak Choy', 3, 45],
        ['Bayam', 4, 60],
        ['Cos Lettuce', 5, 70],
        ['Sweet Basil', 6, 40],
        ['Mizuna', 8, 45]
      ].forEach(function (r) {
        var p = byTitle3(r[0]);
        if (!p) return;
        var harvest;
        if (r[1] === 0) {
          harvest = new Date(); harvest.setHours(0, 0, 0, 0);
          do { harvest.setDate(harvest.getDate() - 1); } while (DELIVERY_DAYS.indexOf(harvest.getDay()) === -1);
        } else {
          harvest = nextDeliveryDay(new Date());
          for (var k = 1; k < r[1]; k++) harvest = nextDeliveryDay(harvest);
        }
        var sow = new Date(harvest.getTime() - (RULES.growDays[p.category] || 30) * 864e5);
        s.seq += 1;
        var b = {
          id: 'HB-' + s.seq, productId: p.id, sowDate: bagDayKey(sow), harvestDate: bagDayKey(harvest),
          expectedQty: r[2], preorderCap: Math.round(r[2] * RULES.preorderDefaultShare), preorderPriceCents: p.priceCents,
          status: r[3] || 'planned', createdBy: 'admin@meod.test', createdAt: new Date(sow.getTime() - 864e5).toISOString()
        };
        if (b.status === 'harvested') { b.actualQty = 56; b.harvestedAt = harvest.toISOString(); }
        s.batches.push(b);
        batchIds[r[0]] = b;
      });
      // [customerId, [[title, qty]], status, daysAgo]
      [
        ['C-1001', [['Oyster Mushroom', 2], ['Tuscan Kale', 3]], 'paid', 1],
        ['C-1002', [['Oyster Mushroom', 3], ['Tuscan Kale', 5], ['Bayam', 1]], 'paid', 2],
        ['C-1003', [['Oyster Mushroom', 4], ['Tuscan Kale', 4], ['Cos Lettuce', 4]], 'paid', 2],
        ['C-1004', [['Tuscan Kale', 4], ['Red Pak Choy', 2]], 'paid', 3],
        ['C-1005', [['Oyster Mushroom', 3], ['Tuscan Kale', 6], ['Red Pak Choy', 3], ['Cos Lettuce', 4]], 'paid', 1],
        ['C-1006', [['Oyster Mushroom', 2], ['Tuscan Kale', 4], ['Bayam', 2]], 'pending_payment', 0]
      ].forEach(function (r) {
        var items = r[1].map(function (line) {
          var b = batchIds[line[0]];
          var p = b && s.products.filter(function (x) { return x.id === b.productId; })[0];
          return p ? { productId: p.id, title: p.title + ' (pre-order)', qty: line[1], priceCents: b.preorderPriceCents, preorderBatchId: b.id, harvestDate: b.harvestDate } : null;
        }).filter(Boolean);
        if (!items.length) return;
        s.seq += 1;
        s.orders.push(Object.assign({
          id: 'O-' + s.seq, ref: '#MF' + (5000 + s.orders.length + 1), customerId: r[0], groupEventId: null,
          status: r[2], items: items, refundedCents: 0, createdAt: new Date(Date.now() - (r[3] * 24 + 3) * 36e5).toISOString(),
          source: 'portal', hasPreorder: true
        }, priceOrder(items, false)));
      });
      s.migrations.harvestBatchesV1 = true;
    }
    return s;
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.version === 2) return migrate(parsed);
      }
    } catch (e) { /* storage blocked or corrupt — fall back to seed */ }
    return migrate(buildSeed());
  }

  var state = load();

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  function reset() {
    state = migrate(buildSeed());
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

  /* ---------- Tyllage Buy to Clear: clearance listings + Surprise Harvest Bag ----------
   * Clearance stock is a discounted slice of a product's own stock.qty (not a separate
   * pool): selling a clearance line or an approved bag item decrements the real stock too,
   * so the Stock page stays the single source of truth. All prices here are illustrative —
   * MEOD to confirm real costs before anything goes live.
   */
  var CLEARANCE_REASONS = { surplus: 'Surplus', short_dated: 'Short-dated', cosmetic: 'Cosmetic' };
  function clearanceReasonLabel(reason) { return CLEARANCE_REASONS[reason] || reason; }
  function clearanceDiscountPct(listing) {
    return Math.round((1 - listing.clearancePriceCents / listing.normalPriceCents) * 100);
  }
  function clearanceRemaining(listing) { return Math.max(0, listing.qty - listing.qtySold); }
  function clearanceOpen(listing) {
    return listing.status === 'active' && clearanceRemaining(listing) > 0 && new Date(listing.availableUntil).getTime() >= Date.now();
  }
  function clearanceListActive() { return state.clearance.filter(clearanceOpen); }
  function clearanceSold14(productId) {
    var cutoff = Date.now() - 14 * DAY;
    var sum = 0;
    state.orders.forEach(function (o) {
      if (o.status === 'cancelled' || new Date(o.createdAt).getTime() < cutoff) return;
      o.items.forEach(function (i) { if (i.productId === productId) sum += i.qty; });
    });
    return sum;
  }
  // Products with a lot of stock and few recent sales — plain-English reason for staff.
  function clearanceCandidates() {
    var listedIds = {};
    state.clearance.filter(clearanceOpen).forEach(function (l) { listedIds[l.productId] = true; });
    return state.products.filter(function (p) {
      if (p.bagOffer || listedIds[p.id]) return false;
      var s = stockStatus(p);
      if (!s.known || s.qty < RULES.clearanceCandidateQty) return false;
      var sold14 = clearanceSold14(p.id);
      return sold14 <= s.qty * RULES.clearanceCandidateSoldRatio;
    }).map(function (p) {
      var sold14 = clearanceSold14(p.id);
      var soldPhrase = sold14 === 0 ? 'none sold' : 'only ' + sold14 + ' sold';
      return { product: p, qty: p.stock.qty, sold14: sold14, reason: p.stock.qty + ' in stock, ' + soldPhrase + ' in the last 14 days.' };
    }).sort(function (a, b) { return b.qty - a.qty; });
  }
  function clearanceValidate(data) {
    var p = byId('products', data.productId);
    if (!p) return { ok: false, error: 'Choose a product.' };
    if (!(data.qty > 0)) return { ok: false, error: 'Quantity must be at least 1.' };
    if (data.qty > p.stock.qty) return { ok: false, error: 'Only ' + p.stock.qty + ' ' + p.title + ' in stock — reduce the quantity.' };
    if (!(data.clearancePriceCents > 0)) return { ok: false, error: 'Enter a clearance price.' };
    if (!(data.minPriceCents >= 0)) return { ok: false, error: 'Enter a minimum price.' };
    if (data.clearancePriceCents < data.minPriceCents) {
      return { ok: false, error: 'Clearance price (' + money(data.clearancePriceCents) + ') can\'t be below the minimum of ' + money(data.minPriceCents) + '.' };
    }
    if (!data.availableUntil || new Date(data.availableUntil).getTime() < Date.now() - DAY) return { ok: false, error: 'Pick a date in the future.' };
    return { ok: true };
  }
  function clearanceCreate(data, actorEmail) {
    var v = clearanceValidate(data);
    if (!v.ok) return v;
    var p = byId('products', data.productId);
    var id = nextId('CL');
    state.clearance.unshift({
      id: id, productId: p.id, qty: data.qty, qtySold: 0, normalPriceCents: p.priceCents,
      clearancePriceCents: data.clearancePriceCents, minPriceCents: data.minPriceCents, reason: data.reason,
      availableUntil: data.availableUntil, status: 'active', createdBy: actorEmail, createdAt: new Date().toISOString()
    });
    return { ok: true, id: id };
  }
  function clearanceEndEarly(id) {
    var l = byId('clearance', id);
    if (l) l.status = 'ended';
  }
  // Sells qty off a listing and the product's real stock together, or fails closed.
  function clearanceSell(listingId, qty) {
    var l = byId('clearance', listingId);
    if (!l) return { ok: false, error: 'That clearance listing no longer exists.' };
    var p = byId('products', l.productId);
    var s = stockStatus(p);
    if (!s.known) return { ok: false, error: p.title + ' stock can\'t be confirmed right now.' };
    if (!clearanceOpen(l) || clearanceRemaining(l) < qty || p.stock.qty < qty) {
      return { ok: false, error: 'Only ' + Math.min(clearanceRemaining(l), p.stock.qty) + ' left of ' + p.title + ' at the clearance price.' };
    }
    l.qtySold += qty;
    p.stock.qty -= qty;
    return { ok: true };
  }

  function nextBagCutoff(from) {
    var now = from || new Date();
    var day = nextDeliveryDay(now);
    var cutoff = atTime(new Date(day.getTime() - DAY), RULES.clearanceCutoffHour, 0);
    while (cutoff.getTime() <= now.getTime()) {
      day = nextDeliveryDay(day);
      cutoff = atTime(new Date(day.getTime() - DAY), RULES.clearanceCutoffHour, 0);
    }
    return { deliveryDay: day, cutoff: cutoff };
  }
  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  // Local calendar date, not UTC: toISOString() would shift SGT (UTC+8) evenings/midnights
  // onto the previous UTC day, so a Saturday bag would key itself as Friday.
  function bagDayKey(day) {
    var d = new Date(day);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  // The inverse of bagDayKey: parse "YYYY-MM-DD" as local midnight, never with
  // `new Date("YYYY-MM-DD")`, which parses as UTC midnight and can land a day early/late.
  function parseDayKey(key) {
    var parts = key.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  function bagOrdersForDay(dayKey) {
    return state.orders.filter(function (o) { return o.bagSize && o.deliveryDay === dayKey && o.status !== 'cancelled'; });
  }
  function bagsLeftForDay(dayKey) {
    return Math.max(0, state.harvestBag.limitPerDay - bagOrdersForDay(dayKey).length);
  }
  // Likely-inside preview: active clearance stock, skipping the customer's excluded category.
  function clearanceLikelyInside(excludeCategory, limit) {
    limit = limit || 5;
    return clearanceListActive()
      .map(function (l) { return byId('products', l.productId); })
      .filter(function (p) { return p && p.category !== excludeCategory; })
      .slice(0, limit);
  }
  // Rule-based proposal for one bag order's contents: clearance stock first, topped up with
  // in-stock fresh produce, always skipping the customer's excluded category.
  function proposeBagContents(order) {
    var exclude = order.excludedCategory;
    var picked = [], seen = {};
    clearanceListActive().forEach(function (l) {
      if (picked.length >= 4) return;
      var p = byId('products', l.productId);
      if (!p || p.category === exclude || seen[p.id]) return;
      seen[p.id] = true; picked.push({ productId: p.id, title: p.title, qty: 1 });
    });
    state.products.forEach(function (p) {
      if (picked.length >= 4 || p.bagOffer || p.category === exclude || seen[p.id]) return;
      var s = stockStatus(p);
      if (!s.known || s.qty <= 0) return;
      seen[p.id] = true; picked.push({ productId: p.id, title: p.title, qty: 1 });
    });
    return picked;
  }
  // Reserves the approved items against real stock (and any matching clearance listing),
  // or fails closed with a clear reason — nothing is deducted unless every line has stock.
  function approveBagContents(orderId, items) {
    var order = byId('orders', orderId);
    if (!order) return { ok: false, error: 'Order not found.' };
    for (var i = 0; i < items.length; i++) {
      var p = byId('products', items[i].productId);
      var s = p ? stockStatus(p) : { known: false };
      if (!p || !s.known) return { ok: false, error: (p ? p.title : 'That item') + '\'s stock can\'t be confirmed.' };
      if (p.stock.qty < items[i].qty) return { ok: false, error: 'Only ' + p.stock.qty + ' ' + p.title + ' left in stock.' };
    }
    items.forEach(function (it) {
      var p = byId('products', it.productId);
      p.stock.qty -= it.qty;
      var listing = state.clearance.filter(function (l) { return l.productId === it.productId && clearanceOpen(l); })[0];
      if (listing) listing.qtySold = Math.min(listing.qty, listing.qtySold + it.qty);
    });
    order.bagContents = items;
    order.bagContentsApproved = true;
    order.bagContentsApprovedAt = new Date().toISOString();
    return { ok: true };
  }

  /* ---------- Tyllage Harvest: planned batches + pre-order by harvest date ----------
   * A batch is one sowing of one product with an expected harvest day and yield. Staff open
   * part of that yield to pre-order (preorderCap); customers reserve against it before it is
   * harvested. Pre-ordered counts are derived from order lines (never stored), so cancelling
   * or refunding an order frees the spot automatically. Pre-orders don't touch product stock:
   * when staff mark a batch harvested, only the un-reserved part of the actual yield is added
   * to stock. Harvest days are snapped to delivery days (picked that morning, delivered same day).
   */
  function harvestDayOnOrAfter(from) {
    var d = new Date(from);
    d.setHours(0, 0, 0, 0);
    for (var i = 0; i < 7 && DELIVERY_DAYS.indexOf(d.getDay()) === -1; i++) d.setDate(d.getDate() + 1);
    return d;
  }
  var PREORDER_LIVE = ['pending_payment', 'paid', 'fulfilled'];
  function batchLines(batchId) {
    var lines = [];
    state.orders.forEach(function (o) {
      if (PREORDER_LIVE.indexOf(o.status) === -1) return;
      o.items.forEach(function (i) { if (i.preorderBatchId === batchId) lines.push({ order: o, item: i }); });
    });
    return lines;
  }
  function batchPreordered(b) { return batchLines(b.id).reduce(function (s, l) { return s + l.item.qty; }, 0); }
  function batchLeft(b) { return Math.max(0, b.preorderCap - batchPreordered(b)); }
  function batchCutoff(b) {
    return atTime(new Date(parseDayKey(b.harvestDate).getTime() - 864e5), RULES.preorderCutoffHour, 0);
  }
  // planned (not sown yet) → growing → due (harvest day reached, not marked yet) → harvested; or cancelled.
  function batchStage(b) {
    if (b.status === 'harvested' || b.status === 'cancelled') return b.status;
    var now = Date.now();
    if (now < parseDayKey(b.sowDate).getTime()) return 'planned';
    if (now < parseDayKey(b.harvestDate).getTime()) return 'growing';
    return 'due';
  }
  function batchOpen(b) {
    var st = batchStage(b);
    return (st === 'planned' || st === 'growing') && Date.now() < batchCutoff(b).getTime() && batchLeft(b) > 0;
  }
  function batchGrowthPct(b) {
    var sow = parseDayKey(b.sowDate).getTime(), harvest = parseDayKey(b.harvestDate).getTime();
    return Math.max(0, Math.min(100, Math.round((Date.now() - sow) / (harvest - sow) * 100)));
  }
  function batchesUpcoming() {
    return state.batches.filter(function (b) { var st = batchStage(b); return st !== 'harvested' && st !== 'cancelled'; })
      .sort(function (a, b) { return a.harvestDate < b.harvestDate ? -1 : a.harvestDate > b.harvestDate ? 1 : 0; });
  }
  function batchesOpen() { return batchesUpcoming().filter(batchOpen); }
  function nextOpenBatch(productId) { return batchesOpen().filter(function (b) { return b.productId === productId; })[0] || null; }
  // Regular (non pre-order) units of a product sold over the last 28 days, as a weekly average.
  function weeklySales(productId) {
    var cutoff = Date.now() - 28 * 864e5, sum = 0;
    state.orders.forEach(function (o) {
      if (o.status === 'cancelled' || new Date(o.createdAt).getTime() < cutoff) return;
      o.items.forEach(function (i) { if (i.productId === productId && !i.preorderBatchId) sum += i.qty; });
    });
    return Math.round(sum / 4 * 10) / 10;
  }
  // Rule-based, explainable demand signal for staff. Never changes a price or a quantity.
  function batchSignal(b) {
    var taken = batchPreordered(b);
    var fill = b.preorderCap ? taken / b.preorderCap : 0;
    var daysLeft = Math.max(0, Math.ceil((batchCutoff(b).getTime() - Date.now()) / 864e5));
    var pct = Math.round(fill * 100);
    var dl = daysLeft + (daysLeft === 1 ? ' day' : ' days');
    var wk = weeklySales(b.productId);
    var usual = wk >= 1 ? ' Usually sells about ' + Math.round(wk) + ' a week.' : '';
    var prod = byId('products', b.productId);
    if (prod && prod.stock.qty <= 0) usual += ' Sold out in the shop now, so pre-orders are the only way to buy it.';
    if (b.preorderCap && taken >= b.preorderCap) {
      return { key: 'sold_out', label: 'Pre-orders full', tone: 'green', reason: 'All ' + b.preorderCap + ' pre-order spots taken. Demand is ahead of supply — consider sowing more next round.' + usual };
    }
    if (fill >= 0.7) {
      return { key: 'strong', label: 'Strong demand', tone: 'green', reason: pct + '% pre-ordered with ' + dl + ' to go — likely to fill. Consider a bigger next sowing.' + usual };
    }
    if (fill < 0.25 && daysLeft <= 7) {
      return { key: 'slow', label: 'Slow', tone: 'amber', reason: 'Only ' + pct + '% pre-ordered and pre-orders close in ' + dl + '. Promote it, or plan to list extra on Buy to Clear.' + usual };
    }
    return { key: 'steady', label: 'Steady', tone: 'blue', reason: pct + '% pre-ordered so far, ' + dl + ' until pre-orders close.' + usual };
  }
  function batchValidate(data) {
    var p = byId('products', data.productId);
    if (!p) return { ok: false, error: 'Choose a product.' };
    if (!data.sowDate || !data.harvestDate) return { ok: false, error: 'Pick a sow date and a harvest date.' };
    var harvest = parseDayKey(data.harvestDate);
    if (DELIVERY_DAYS.indexOf(harvest.getDay()) === -1) return { ok: false, error: 'Harvest on a delivery day (Tue, Thu or Sat) so pre-orders go out fresh.' };
    if (harvest.getTime() <= parseDayKey(data.sowDate).getTime()) return { ok: false, error: 'Harvest date must be after the sow date.' };
    if (harvest.getTime() < Date.now()) return { ok: false, error: 'Pick a harvest date in the future.' };
    if (!(data.expectedQty > 0)) return { ok: false, error: 'Expected yield must be at least 1.' };
    if (!(data.preorderCap >= 0) || data.preorderCap > data.expectedQty) return { ok: false, error: 'Pre-order spots must be between 0 and the expected yield (' + data.expectedQty + ').' };
    if (!(data.preorderPriceCents > 0)) return { ok: false, error: 'Enter a pre-order price.' };
    return { ok: true };
  }
  function batchCreate(data, actorEmail) {
    var v = batchValidate(data);
    if (!v.ok) return v;
    var id = nextId('HB');
    state.batches.push({
      id: id, productId: data.productId, sowDate: data.sowDate, harvestDate: data.harvestDate,
      expectedQty: data.expectedQty, preorderCap: data.preorderCap, preorderPriceCents: data.preorderPriceCents,
      status: 'planned', createdBy: actorEmail, createdAt: new Date().toISOString()
    });
    return { ok: true, id: id };
  }
  // Records the real yield. Pre-orders are served first; only the rest goes into stock.
  // Optional grades { A, cosmetic, check } (staff-confirmed, e.g. from Tyllage Grade):
  // "check" units are held back for inspection and never reach stock.
  function batchHarvest(id, actualQty, grades) {
    var b = byId('batches', id);
    if (!b) return { ok: false, error: 'Batch not found.' };
    if (!(actualQty >= 0)) return { ok: false, error: 'Enter the harvested quantity.' };
    if (grades && grades.A + grades.cosmetic + grades.check !== actualQty) {
      return { ok: false, error: 'Grade A + Cosmetic + Check must add up to ' + actualQty + '.' };
    }
    var reserved = batchPreordered(b);
    var sellable = grades ? grades.A + grades.cosmetic : actualQty;
    var toStock = Math.max(0, sellable - reserved);
    if (grades) b.grades = { A: grades.A, cosmetic: grades.cosmetic, check: grades.check, photos: grades.photos || 0 };
    var p = byId('products', b.productId);
    if (p) p.stock.qty += toStock;
    b.status = 'harvested';
    b.actualQty = actualQty;
    b.harvestedAt = new Date().toISOString();
    return { ok: true, reserved: reserved, served: Math.min(reserved, sellable), toStock: toStock, shortfall: Math.max(0, reserved - sellable), held: grades ? grades.check : 0 };
  }
  function batchCancel(id) {
    var b = byId('batches', id);
    if (b) b.status = 'cancelled';
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

  // Tyllage Recommend: score in-stock products from the customer's own buying
  // behaviour. Signals (all explainable, no sensitive-trait inference):
  //   restock  - bought before and not reordered for a while
  //   pairs    - often in the same basket as their items (other customers' orders)
  //   taste    - category affinity, recent orders weighted more
  //   fresh    - small boost for farm-grown produce
  // Personalisation off -> generic fresh picks only.
  var DAY = 864e5;
  function liveOrders(customerId) {
    return state.orders.filter(function (o) { return o.status !== 'cancelled' && (!customerId || o.customerId === customerId); });
  }

  function tasteProfile(customer) {
    var weights = {}, total = 0;
    liveOrders(customer.id).forEach(function (o) {
      var recency = Math.exp(-(Date.now() - new Date(o.createdAt).getTime()) / (30 * DAY));
      o.items.forEach(function (i) {
        var p = byId('products', i.productId);
        if (!p) return;
        var w = i.qty * (0.4 + recency);
        weights[p.category] = (weights[p.category] || 0) + w;
        total += w;
      });
    });
    return Object.keys(weights)
      .map(function (k) { return { category: k, label: CATEGORIES[k].label, pct: Math.round(weights[k] / total * 100) }; })
      .sort(function (a, b) { return b.pct - a.pct; });
  }

  function recommendFor(customer, limit) {
    limit = limit || 4;
    var available = state.products.filter(function (p) { var s = stockStatus(p); return !p.bagOffer && s.known && s.qty > 0; });
    if (!customer || !customer.consentPersonalisation) {
      return available.filter(function (p) { return p.meodGrown; }).slice(0, limit)
        .map(function (p, i) { return { product: p, type: 'fresh', reason: 'Freshly harvested this week', match: null, rank: i }; });
    }

    var mine = liveOrders(customer.id);
    var lastBought = {}, boughtTitle = {};
    mine.forEach(function (o) {
      o.items.forEach(function (i) {
        var t = new Date(o.createdAt).getTime();
        if (!lastBought[i.productId] || t > lastBought[i.productId]) lastBought[i.productId] = t;
        boughtTitle[i.productId] = i.title;
      });
    });

    // Co-purchase: other customers' baskets that share an item with this customer.
    var pairs = {};
    liveOrders().forEach(function (o) {
      if (o.customerId === customer.id) return;
      var shared = o.items.filter(function (i) { return lastBought[i.productId]; });
      if (!shared.length) return;
      o.items.forEach(function (i) {
        if (lastBought[i.productId]) return;
        var entry = pairs[i.productId] || (pairs[i.productId] = { count: 0, with: shared[0].title });
        entry.count += 1;
      });
    });

    var taste = {};
    tasteProfile(customer).forEach(function (t) { taste[t.category] = t.pct; });

    var scored = available.map(function (p) {
      var signals = [];
      var days = lastBought[p.id] ? Math.round((Date.now() - lastBought[p.id]) / DAY) : null;
      if (days !== null && days >= 5) {
        signals.push({ type: 'restock', score: 40 + Math.min(days, 30), reason: 'You last bought this ' + days + ' days ago — time to restock?' });
      }
      if (pairs[p.id]) {
        signals.push({ type: 'pairs', score: 28 + pairs[p.id].count * 8, reason: 'Often bought with ' + pairs[p.id].with });
      }
      if (taste[p.category] && days === null) {
        signals.push({ type: 'taste', score: taste[p.category] * 0.6, reason: 'You love ' + CATEGORIES[p.category].label.toLowerCase() + ' — ' + taste[p.category] + '% of your basket' });
      }
      var score = signals.reduce(function (s, x) { return s + x.score; }, 0) + (p.meodGrown ? 4 : 0);
      var best = signals.sort(function (a, b) { return b.score - a.score; })[0];
      return {
        product: p,
        type: best ? best.type : 'fresh',
        reason: best ? best.reason : 'Freshly harvested this week',
        score: score
      };
    }).filter(function (r) { return r.score > 4; });

    scored.sort(function (a, b) { return b.score - a.score; });
    var top = scored.length ? scored[0].score : 1;
    // Keep variety: at most two picks per reason type in the first slots.
    var picked = [], perType = {};
    scored.forEach(function (r) {
      if (picked.length >= limit) return;
      if ((perType[r.type] || 0) >= 2) return;
      perType[r.type] = (perType[r.type] || 0) + 1;
      picked.push(r);
    });
    scored.forEach(function (r) { if (picked.length < limit && picked.indexOf(r) === -1) picked.push(r); });
    // Top up with fresh farm-grown items so the row is always full.
    available.forEach(function (p) {
      if (picked.length >= limit || !p.meodGrown || lastBought[p.id]) return;
      if (picked.some(function (r) { return r.product.id === p.id; })) return;
      picked.push({ product: p, type: 'fresh', reason: 'Freshly harvested this week', score: 4 });
    });
    return picked.map(function (r, i) {
      // Rank nudges ties apart so equal scores don't all read the same.
      r.match = Math.max(60, Math.min(98, Math.round(60 + (r.score / top) * 38) - i * 2));
      r.rank = i;
      return r;
    });
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
    ledger: ledger, ledgerEntry: ledgerEntry, recommendFor: recommendFor, trackingFor: trackingFor, tasteProfile: tasteProfile, CATEGORY_ART: CATEGORY_ART,
    withinHumanHours: withinHumanHours, audit: audit,
    money: money, maskName: maskName, maskPhone: maskPhone,
    DELIVERY_DAYS: DELIVERY_DAYS, nextDeliveryDay: nextDeliveryDay,
    clearance: {
      remaining: clearanceRemaining, isOpen: clearanceOpen, listActive: clearanceListActive,
      candidates: clearanceCandidates, validate: clearanceValidate, create: clearanceCreate,
      endEarly: clearanceEndEarly, sell: clearanceSell, likelyInside: clearanceLikelyInside,
      nextBagCutoff: nextBagCutoff, dayKey: bagDayKey, parseDayKey: parseDayKey, bagOrdersForDay: bagOrdersForDay, bagsLeftForDay: bagsLeftForDay,
      proposeBagContents: proposeBagContents, approveBagContents: approveBagContents,
      reasonLabel: clearanceReasonLabel, reasons: CLEARANCE_REASONS, discountPct: clearanceDiscountPct
    },
    harvest: {
      dayOnOrAfter: harvestDayOnOrAfter, lines: batchLines, preordered: batchPreordered, left: batchLeft,
      cutoff: batchCutoff, stage: batchStage, isOpen: batchOpen, growthPct: batchGrowthPct,
      upcoming: batchesUpcoming, open: batchesOpen, nextFor: nextOpenBatch, signal: batchSignal, weeklySales: weeklySales,
      validate: batchValidate, create: batchCreate, markHarvested: batchHarvest, cancel: batchCancel
    }
  };
})();
