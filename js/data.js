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
    minMarginRate: 0.15,            // Margin Guard: keep at least 15% margin after unit cost (illustrative)
    // Grow with MEOD rewards. Points per dollar and redeem-for-discount mirror MEOD Fresh's
    // existing Store Rewards (Smile.io) — real rates to be confirmed. Tiers, anti-waste
    // bonuses and tier perks are Tyllage additions. All values illustrative.
    rewards: {
      pointsPerDollar: 1,
      redeemPoints: 100, redeemValueCents: 500,  // 100 points → S$5 voucher
      antiWasteMultiplier: 2,                    // Buy to Clear and harvest pre-order lines
      voucherDays: 90,
      voucherMinSpendCents: 2000,                // vouchers apply once full-price items reach S$20
      tierWindowDays: 365,
      tiers: [
        { key: 'seedling', label: 'Seedling', emoji: '🌱', minBunches: 0, multiplier: 1, freeFromCents: null, voucherCents: 0 },
        { key: 'sprout', label: 'Sprout', emoji: '🌿', minBunches: 25, multiplier: 1.1, freeFromCents: null, voucherCents: 300 },
        { key: 'harvester', label: 'Harvester', emoji: '🥬', minBunches: 60, multiplier: 1.25, freeFromCents: 4500, voucherCents: 500 },
        { key: 'friend', label: 'Farm Friend', emoji: '🌳', minBunches: 150, multiplier: 1.5, freeFromCents: 3000, voucherCents: 1000 }
      ]
    },
    b2bPriceRate: 0.8,              // trade (B2B) price = 80% of retail, illustrative
    visitSessionMax: 40,            // guests per farm-visit session; bigger groups split into sessions
    visitSessionsPerDay: 3,         // visit sessions the farm can host in one day (illustrative)
    radarTolerance: 0.1,            // Demand Radar: a gap within this share of demand counts as balanced
    promoLiftPer10: 0.2,            // Promotion simulator: each 10% off lifts sales by about 20% (illustrative)
    visitMaxPax: 200,               // largest group the booking form accepts
    visitFundRate: 0.05,            // share of a visit group's orders paid back to the group's fund
    visitCodeDays: 7,               // a visit's farm-shop code stays open this long after the visit
    restockAfterDays: 7,            // a buyer is "due" this many days after they last bought an item...
    restockWindowDays: 45,          // ...until this many days (after that they're lapsed, not due)
    restockCooldownDays: 14,        // don't suggest the same reminder to someone again within this
    preorderCutoffHour: 22,         // harvest pre-orders close 10pm the day before harvest
    preorderDefaultShare: 0.6,      // share of a batch's expected yield opened to pre-order
    // Typical sow-to-harvest days per category (illustrative — MEOD's growers to confirm).
    growDays: { 'asian-greens': 30, lettuces: 40, fungi: 14, herbs: 45 },
    // Days a harvest stays at its best for sale (Harvest Rescue sell-by). Illustrative — MEOD to set.
    shelfDays: { 'asian-greens': 4, lettuces: 5, fungi: 7, herbs: 6 }
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

  // Who books learning journeys, and what their share of group orders goes towards.
  var GROUP_TYPES = {
    school: { label: 'School', fund: 'class or eco-club fund' },
    company: { label: 'Company', fund: 'team or CSR fund' },
    community: { label: 'Community group', fund: 'community fund' },
    other: { label: 'Other group', fund: 'group fund' }
  };

  function minutesAgo(m) { return new Date(Date.now() - m * 60000).toISOString(); }
  function daysFromNow(d) { return new Date(Date.now() + d * 864e5).toISOString(); }

  // opts (optional): voucherCents — a rewards voucher taken off after the group discount;
  // freeFromCents — the customer's free-delivery threshold (higher reward tiers get a lower one).
  // The threshold is checked before the voucher, so using a voucher never adds a delivery fee.
  function priceOrder(items, groupDiscount, opts) {
    opts = opts || {};
    var subtotal = items.reduce(function (s, i) { return s + i.priceCents * i.qty; }, 0);
    var discount = groupDiscount ? Math.round(subtotal * RULES.groupDiscountRate) : 0;
    var beforeVoucher = subtotal - discount;
    var voucher = Math.max(0, Math.min(opts.voucherCents || 0, beforeVoucher));
    var net = beforeVoucher - voucher;
    var freeFrom = opts.freeFromCents != null ? opts.freeFromCents : RULES.freeDeliveryThresholdCents;
    var delivery = beforeVoucher === 0 || beforeVoucher >= freeFrom ? 0 : RULES.deliveryFeeCents;
    return { subtotalCents: subtotal, discountCents: discount, voucherCents: voucher, netCents: net, deliveryCents: delivery, totalCents: net + delivery, freeFromCents: freeFrom };
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
    if (!s.migrations.restockSeedV1) {
      // A little more past-order history so restock reminders have a realistic mix:
      // several regular shiitake buyers across languages, and a second basil buyer.
      [
        ['C-1002', [['Shiitake Mushroom', 2], ['HK Cai Xin', 1]], 12],
        ['C-1005', [['Shiitake Mushroom', 1], ['Sweet Basil', 2]], 16]
      ].forEach(function (r) {
        var items = r[1].map(function (line) {
          var p = s.products.filter(function (x) { return x.title === line[0]; })[0];
          return p ? { productId: p.id, title: p.title, qty: line[1], priceCents: p.priceCents } : null;
        }).filter(Boolean);
        s.seq += 1;
        s.orders.push(Object.assign({
          id: 'O-' + s.seq, ref: '#MF' + (5000 + s.orders.length + 1), customerId: r[0], groupEventId: null,
          status: 'fulfilled', items: items, refundedCents: 0, createdAt: new Date(Date.now() - r[2] * 864e5).toISOString(), source: 'shopify-mock'
        }, priceOrder(items, false)));
      });
      s.migrations.restockSeedV1 = true;
    }
    if (!s.migrations.visitsV1) {
      // Demo learning journeys: two past visits with visitor orders (and some repeat orders
      // afterwards), one large upcoming community visit, and the existing new enquiry.
      // Organisation and visitor names are fictional and marked (demo).
      var old = s.bookings.filter(function (b) { return b.id === 'B-1001'; })[0];
      if (old) { old.org = old.org || 'Demo Primary School'; old.groupType = old.groupType || 'school'; }
      var prodByTitle = function (title) { return s.products.filter(function (x) { return x.title === title; })[0]; };
      var dayKeyAgo = function (n) { return bagDayKey(new Date(Date.now() - n * 864e5)); };
      var addBooking = function (b) {
        s.seq += 1;
        var booking = Object.assign({ id: 'B-' + s.seq, status: 'new', message: '', createdAt: new Date(parseDayKey(b.date).getTime() - 21 * 864e5).toISOString() }, b);
        s.bookings.push(booking);
        return booking;
      };
      var visitorOrders = function (booking, ev, visitors) {
        visitors.forEach(function (v, idx) {
          s.seq += 1;
          var cust = { id: 'C-' + s.seq, name: v[0], phone: '+65 8000 ' + (2100 + s.seq % 900), email: '', language: v[1], consentMarketing: v[2], consentPersonalisation: v[2],
            source: 'visit', bookingId: booking.id, groupCode: ev.code, joinedAt: parseDayKey(booking.date).toISOString() };
          s.customers.push(cust);
          var mk = function (lines, at, groupEventId) {
            var items = lines.map(function (l) { var p = prodByTitle(l[0]); return p ? { productId: p.id, title: p.title, qty: l[1], priceCents: p.priceCents } : null; }).filter(Boolean);
            s.seq += 1;
            var fulfil = groupEventId ? (idx % 2 ? 'delivery' : 'collect') : undefined;
            s.orders.push(Object.assign({
              id: 'O-' + s.seq, ref: '#MF' + (5000 + s.orders.length + 1), customerId: cust.id, groupEventId: groupEventId, status: 'fulfilled',
              items: items, refundedCents: 0, createdAt: at.toISOString(), source: groupEventId ? 'visit' : 'shopify-mock', fulfilment: fulfil
            }, groupEventId ? visitTotals(items, fulfil) : priceOrder(items, false)));
          };
          var visitAt = atTime(parseDayKey(booking.date), 11, 10 + idx * 4);
          mk(v[3], visitAt, ev.id);
          if (v[4]) mk(v[4][0], new Date(Date.now() - v[4][1] * 864e5), null);
        });
      };
      var school = addBooking({ name: 'Ms Tan (demo)', email: 'teacher@sunrise-demo.test', phone: '+65 8000 0201', org: 'Sunrise Primary School (demo)', groupType: 'school',
        experience: 'School Visit', pax: 36, date: dayKeyAgo(12), message: 'Primary 5 science — food security.' });
      var schoolEv = createVisitGroup(s, school);
      visitorOrders(school, schoolEv, [
        // [name, language, opted in, visit-day order, [later order, days ago]]
        ['Parent Lim (demo)', 'en', true, [['Xiao Bai Cai', 2], ['Farm Pesto', 1]], [[['Xiao Bai Cai', 2], ['Kai Lan', 2]], 4]],
        ['Parent Wong (demo)', 'zh', true, [['Kai Lan', 2], ['Shiitake Mushroom', 1]], null],
        ['Teacher Ng (demo)', 'en', true, [['Goodness Gracious Gelato', 2]], [[['Goodness Gracious Gelato', 1], ['Mesclun Mix', 1]], 3]],
        ['Parent Aziz (demo)', 'ms', false, [['Kangkong', 3]], null],
        ['Parent Chua (demo)', 'zh', true, [['Cos Lettuce', 2], ['Veggie Crackers', 1]], null],
        ['Parent Raj (demo)', 'en', false, [['Tuscan Kale', 1]], null]
      ]);
      var company = addBooking({ name: 'HR team (demo)', email: 'hr@acme-demo.test', phone: '+65 8000 0202', org: 'Acme Logistics (demo)', groupType: 'company',
        experience: 'Workshop', pax: 24, date: dayKeyAgo(26), message: 'Sustainability day for staff.' });
      var companyEv = createVisitGroup(s, company);
      visitorOrders(company, companyEv, [
        ['Staff Ho (demo)', 'en', true, [['Shiitake Mushroom', 2], ['Farm Pesto', 1]], [[['Shiitake Mushroom', 2]], 9]],
        ['Staff Devi (demo)', 'en', true, [['Mesclun Mix', 2], ['Vege Powder', 1]], null],
        ['Staff Goh (demo)', 'zh', false, [['HK Cai Xin', 2]], null],
        ['Staff Iskandar (demo)', 'ms', true, [['Veggie Crackers', 2], ['Kai Lan', 1]], null]
      ]);
      var rc = addBooking({ name: 'Mr Lee (demo)', email: 'rc@maplegrove-demo.test', phone: '+65 8000 0203', org: 'Maple Grove RC (demo)', groupType: 'community',
        experience: 'Farm Tour', pax: 85, date: bagDayKey(new Date(Date.now() + 9 * 864e5)), message: 'Residents and seniors — morning slots, please.' });
      createVisitGroup(s, rc);
      s.migrations.visitsV1 = true;
    }
    if (!s.migrations.radarHistoryV1) {
      // 8 weeks of weekly unit sales per crop across all channels, standing in for MEOD
      // Fresh (Shopify) order history — the portal's own demo orders are only a small slice.
      // [title, typical units a week, trend per week (+/−)]. Synthetic, deterministic.
      s.salesHistory = { source: 'shopify-mock', weeks: 8, byProduct: {} };
      var hist = [
        ['Xiao Bai Cai', 46, 1.5], ['HK Cai Xin', 26, 0], ['Red Pak Choy', 11, -0.5], ['Kai Lan', 34, 1],
        ['Kangkong', 31, 0.5], ['Bayam', 14, -1], ['Cos Lettuce', 27, 0], ['Mizuna', 9, 0],
        ['Tuscan Kale', 17, 1], ['Mesclun Mix', 21, 0.5], ['Shiitake Mushroom', 23, 0], ['Oyster Mushroom', 19, 1.5],
        ['Sweet Basil', 9, -0.5], ['Garden Mint', 6, 0]
      ];
      var seed = 11;
      var noise = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 - 0.5; };
      hist.forEach(function (r) {
        var p = s.products.filter(function (x) { return x.title === r[0]; })[0];
        if (!p) return;
        var weeks = [];
        for (var w = 0; w < 8; w++) weeks.push(Math.max(0, Math.round(r[1] + r[2] * (w - 4) + noise() * r[1] * 0.25)));
        s.salesHistory.byProduct[p.id] = weeks; // oldest → newest
      });
      // Planned batches for the staple crops too, so the radar has a realistic mix of
      // short / balanced / surplus. [title, harvest on the Nth upcoming delivery day, expected]
      [['Xiao Bai Cai', 2, 80], ['Kai Lan', 3, 62], ['Kangkong', 2, 48], ['HK Cai Xin', 4, 50], ['Mesclun Mix', 3, 30], ['Shiitake Mushroom', 1, 44]].forEach(function (r) {
        var p = s.products.filter(function (x) { return x.title === r[0]; })[0];
        if (!p) return;
        var harvest = nextDeliveryDay(new Date());
        for (var k = 1; k < r[1]; k++) harvest = nextDeliveryDay(harvest);
        var sow = new Date(harvest.getTime() - (RULES.growDays[p.category] || 30) * 864e5);
        s.seq += 1;
        s.batches.push({
          id: 'HB-' + s.seq, productId: p.id, sowDate: bagDayKey(sow), harvestDate: bagDayKey(harvest),
          expectedQty: r[2], preorderCap: Math.round(r[2] * RULES.preorderDefaultShare), preorderPriceCents: p.priceCents,
          status: 'planned', createdBy: 'admin@meod.test', createdAt: new Date(sow.getTime() - 864e5).toISOString()
        });
      });
      s.migrations.radarHistoryV1 = true;
    }
    if (!s.migrations.b2bV1) {
      // B2B demo: four trade accounts with standing orders and 6 weeks of history, each
      // showing a different situation (steady, a missing order, ordering less, lapsed), and
      // a small lead pipeline. All names are fictional and marked (demo).
      var pT = function (title) { return s.products.filter(function (x) { return x.title === title; })[0]; };
      var today0 = new Date(); today0.setHours(0, 0, 0, 0);
      var occurrences = function (weekday, fromDaysAgo, toDaysAhead) {
        var out = [];
        for (var d = -fromDaysAgo; d <= toDaysAhead; d++) { var day = new Date(today0.getTime() + d * 864e5); if (day.getDay() === weekday) out.push(day); }
        return out;
      };
      s.b2b = { accounts: [], orders: [], leads: [] };
      var accounts = [
        // name, type, area, contact, standing days, usual [title, qty], pattern
        ['Green Fork Bistro (demo)', 'restaurant', 'Tanjong Pagar', 'Chef Marcus (demo)', [2, 6], [['Xiao Bai Cai', 10], ['Kai Lan', 8], ['Cos Lettuce', 6]], 'missing'],
        ['Kopi & Kale Café (demo)', 'cafe', 'Tiong Bahru', 'Sarah, owner (demo)', [4], [['Mesclun Mix', 8], ['Tuscan Kale', 5], ['Sweet Basil', 3]], 'declining'],
        ['Acme Logistics pantry (demo)', 'office', 'Jurong East', 'HR team (demo)', [2], [['Cos Lettuce', 6], ['Mesclun Mix', 4], ['Xiao Bai Cai', 4]], 'steady'],
        ['Harbour Catering (demo)', 'caterer', 'Bukit Merah', 'Ops manager (demo)', [6], [['Kangkong', 15], ['HK Cai Xin', 12], ['Shiitake Mushroom', 6]], 'lapsed']
      ];
      accounts.forEach(function (a, ai) {
        s.seq += 1;
        var acc = { id: 'BA-' + s.seq, name: a[0], type: a[1], area: a[2], contact: a[3], email: 'orders@' + a[0].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, '-').replace(/-demo-?$/, '') + '.test',
          phone: '+65 8000 03' + (10 + ai), standingDays: a[4], usual: a[5].map(function (u) { var p = pT(u[0]); return p ? { productId: p.id, qty: u[1] } : null; }).filter(Boolean),
          paymentTerms: 'Net 14', status: 'active', since: new Date(today0.getTime() - (200 + ai * 40) * 864e5).toISOString(), contacts: [] };
        s.b2b.accounts.push(acc);
        a[4].forEach(function (wd) {
          occurrences(wd, 42, 7).forEach(function (day, idx, all) {
            var future = day.getTime() > today0.getTime();
            var daysAgo = Math.round((today0.getTime() - day.getTime()) / 864e5);
            if (a[6] === 'lapsed' && daysAgo < 24) return;                       // stopped ~3 weeks ago
            if (a[6] === 'missing' && future && wd === 2) return;                 // next Tuesday not placed yet
            if (future && a[6] !== 'steady' && a[6] !== 'missing') return;        // only steady + Bistro have future orders
            var scale = a[6] === 'declining' && daysAgo < 15 ? 0.55 : 1;
            var items = acc.usual.map(function (u, k) {
              var p = s.products.filter(function (x) { return x.id === u.productId; })[0];
              var q = Math.max(1, Math.round(u.qty * scale + ((idx + k) % 3) - 1));
              return { productId: p.id, title: p.title, qty: q, priceCents: Math.round(p.priceCents * RULES.b2bPriceRate) };
            });
            s.seq += 1;
            s.b2b.orders.push({ id: 'BO-' + s.seq, ref: 'B2B-' + s.seq, accountId: acc.id, deliveryDay: bagDayKey(day), items: items,
              totalCents: items.reduce(function (t, i) { return t + i.qty * i.priceCents; }, 0), status: future ? 'confirmed' : 'delivered',
              createdAt: new Date(day.getTime() - 3 * 864e5).toISOString(), source: 'b2b' });
          });
        });
      });
      [
        ['Sunrise Primary canteen (demo)', 'school', 'Woodlands', 'contacted', 0, 9000, 'Met at their farm visit; canteen vendor interested in weekly greens.'],
        ['Bloom Juice Bar (demo)', 'cafe', 'Novena', 'sampling', 2, 6000, 'Sample of kale and mint sent last week.'],
        ['Fernvale Hawker Stall (demo)', 'restaurant', 'Sengkang', 'new', 3, 4500, 'Asked about bulk kangkong on WhatsApp.'],
        ['Hotel Verde (demo)', 'hotel', 'Marina', 'new', 5, 25000, 'Sustainability team looking for local suppliers.']
      ].forEach(function (l) {
        s.seq += 1;
        s.b2b.leads.push({ id: 'BL-' + s.seq, name: l[0], type: l[1], area: l[2], stage: l[3], nextStepAt: bagDayKey(new Date(today0.getTime() + l[4] * 864e5)),
          estWeeklyCents: l[5], notes: l[6], createdAt: new Date(today0.getTime() - 10 * 864e5).toISOString(), contacts: [] });
      });
      s.migrations.b2bV1 = true;
    }
    if (!s.migrations.rescueV1) {
      // Recently harvested batches with sell-by dates, so Harvest Rescue has a realistic mix:
      // one past its sell-by, one due tomorrow (partly on Buy to Clear), two with a few days left.
      s.rescueLog = s.rescueLog || [];
      var pR = function (title) { return s.products.filter(function (x) { return x.title === title; })[0]; };
      var today = new Date(); today.setHours(0, 0, 0, 0);
      s.batches.forEach(function (b) {
        if (b.status !== 'harvested' || b.sellBy) return;
        var p = s.products.filter(function (x) { return x.id === b.productId; })[0];
        b.toStock = b.toStock != null ? b.toStock : Math.max(0, (b.actualQty || b.expectedQty) - 0);
        var hv = new Date(b.harvestedAt || parseDayKey(b.harvestDate));
        b.sellBy = bagDayKey(new Date(hv.getTime() + ((p && RULES.shelfDays[p.category]) || 4) * 864e5));
      });
      // [title, harvested N days ago, qty into stock]
      [['Bayam', 5, 30], ['Mesclun Mix', 4, 22], ['Sweet Basil', 2, 18], ['Kangkong', 1, 40]].forEach(function (r) {
        var p = pR(r[0]);
        if (!p) return;
        var hv = new Date(today.getTime() - r[1] * 864e5 + 7 * 36e5);
        s.seq += 1;
        s.batches.push({
          id: 'HB-' + s.seq, productId: p.id, sowDate: bagDayKey(new Date(hv.getTime() - (RULES.growDays[p.category] || 30) * 864e5)), harvestDate: bagDayKey(hv),
          expectedQty: r[2] + 4, preorderCap: 0, preorderPriceCents: p.priceCents, status: 'harvested', actualQty: r[2], toStock: r[2],
          harvestedAt: hv.toISOString(), sellBy: bagDayKey(new Date(hv.getTime() + (RULES.shelfDays[p.category] || 4) * 864e5)),
          createdBy: 'admin@meod.test', createdAt: new Date(hv.getTime() - 40 * 864e5).toISOString()
        });
      });
      s.migrations.rescueV1 = true;
    }
    if (!s.migrations.pricingV1) {
      // Illustrative unit costs for Margin Guard (MEOD to enter real figures): growing cost as a
      // share of price, plus packaging and handling per unit. Plus one pending price proposal
      // from sales staff so the admin approval step can be shown.
      s.costs = {};
      s.products.forEach(function (p) {
        var growShare = p.category === 'farm-more' ? 0.45 : p.category === 'fungi' ? 0.4 : 0.34;
        s.costs[p.id] = { growCents: Math.round(p.priceCents * growShare), packCents: p.category === 'farm-more' ? 45 : 22, handleCents: 30 };
      });
      var basil = s.products.filter(function (x) { return x.title === 'Sweet Basil'; })[0];
      s.seq += 1;
      s.priceProposals = basil ? [{ id: 'PP-' + s.seq, kind: 'discount', productId: basil.id, fromCents: basil.priceCents, toCents: Math.round(basil.priceCents * 0.8),
        qty: 12, untilKey: bagDayKey(new Date(Date.now() + 4 * 864e5)), reason: 'Sweet Basil supply is well above demand (demand down 21%).', status: 'pending',
        createdBy: 'sales@meod.test', createdAt: new Date(Date.now() - 3 * 36e5).toISOString(), decidedBy: null }] : [];
      s.migrations.pricingV1 = true;
    }
    if (!s.migrations.feedbackV1) {
      // Four weeks of customer feedback from every channel, so Feedback intelligence has real
      // patterns to find: three freshness complaints from one Kai Lan batch, two late
      // deliveries on the same Thursday round, a few one-offs and plenty of praise.
      var pF = function (title) { var x = s.products.filter(function (y) { return y.title === title; })[0]; return x ? x.id : null; };
      var t0 = new Date(); t0.setHours(0, 0, 0, 0);
      var dk = function (n) { return bagDayKey(new Date(t0.getTime() - n * 864e5)); };
      var at = function (n, hr) { return new Date(t0.getTime() - n * 864e5 + (hr || 19) * 36e5).toISOString(); };
      var lastThu = 1; while (new Date(t0.getTime() - lastThu * 864e5).getDay() !== 4) lastThu += 1;
      // The Kai Lan batch the complaints trace back to (all sold, so it's not in Harvest Rescue).
      var kl = s.products.filter(function (y) { return y.title === 'Kai Lan'; })[0];
      var klBatch = null;
      if (kl) {
        s.seq += 1;
        klBatch = { id: 'HB-' + s.seq, productId: kl.id, sowDate: dk(6 + (RULES.growDays[kl.category] || 30)), harvestDate: dk(6), expectedQty: 30, preorderCap: 0, preorderPriceCents: kl.priceCents,
          status: 'harvested', actualQty: 28, toStock: 0, harvestedAt: at(6, 7), sellBy: dk(6 - (RULES.shelfDays[kl.category] || 4)), createdBy: 'admin@meod.test', createdAt: at(50, 10) };
        s.batches.push(klBatch);
      }
      var gf = (s.b2b && s.b2b.accounts || []).filter(function (a) { return /Green Fork/.test(a.name); })[0];
      var kk = (s.b2b && s.b2b.accounts || []).filter(function (a) { return /Kopi/.test(a.name); })[0];
      // [source, customerId, accountId, who, product, delivered N days ago, rating, text, received N days ago, ticketId]
      var rows = [
        ['ticket', 'C-1003', null, null, 'Kai Lan', 4, 2, 'Kai Lan leaves were wilted and yellowing when the box arrived.', 0, 'T-1001'],
        ['rating', 'C-1006', null, null, 'Kai Lan', 5, 2, 'Kai Lan looked limp, had to throw some of it away.', 4],
        ['b2b', null, gf && gf.id, null, 'Kai Lan', 4, null, 'Kai Lan this week was soggy at the stems — couldn\'t use about a third for service.', 3],
        ['rating', 'C-1005', null, null, null, lastThu, 2, 'Delivery came really late, after 9pm instead of the 6–9pm slot.', lastThu],
        ['chat', 'C-1002', null, null, null, lastThu, null, 'Our order was late again, the veggies sat outside the door.', lastThu - 1 > 0 ? lastThu - 1 : 0],
        ['rating', 'C-1001', null, null, 'Sweet Basil', 2, 3, 'The basil was missing from my order, the rest was fine.', 2],
        ['chat', 'C-1004', null, null, null, 9, null, 'Love the veg but there is so much plastic packaging.', 8],
        ['rating', 'C-1005', null, null, null, 10, 3, 'A bit pricey compared to the supermarket.', 10],
        ['rating', 'C-1001', null, null, 'Shiitake Mushroom', 4, 5, 'Shiitake was so fresh and meaty, best we have had.', 4],
        ['rating', 'C-1002', null, null, 'Cos Lettuce', 3, 5, 'Love how crunchy the Cos lettuce is.', 3],
        ['visit', null, null, 'Primary school teacher', null, null, 5, 'The kids loved the farm tour and finally learnt where their food comes from. Thank you!', 6],
        ['rating', 'C-1003', null, null, 'Mesclun Mix', 7, 5, 'Mesclun lasted a whole week in the fridge.', 6],
        ['b2b', null, kk && kk.id, null, 'Xiao Bai Cai', 5, null, 'Xiao Bai Cai has been consistently great, customers notice.', 5],
        ['rating', 'C-1006', null, null, 'Bayam', 19, 2, 'Bayam leaves were going brown.', 18],
        ['chat', 'C-1001', null, null, null, 16, null, 'Delivery was late and nobody told us.', 16],
        ['rating', 'C-1004', null, null, 'Kangkong', 20, 5, 'Kangkong is delicious, thank you!', 20],
        ['visit', null, null, 'Corporate team', null, null, 4, 'Great hands-on session, the team enjoyed harvesting.', 22]
      ];
      s.feedback = rows.map(function (r) {
        s.seq += 1;
        var pid = r[4] ? pF(r[4]) : null;
        return { id: 'FB-' + s.seq, source: r[0], customerId: r[1], accountId: r[2] || null, who: r[3], productId: pid, deliveryKey: r[5] != null ? dk(r[5]) : null,
          batchId: r[4] === 'Kai Lan' && klBatch ? klBatch.id : null, rating: r[6], text: r[7], at: r[9] ? s.tickets.filter(function (t) { return t.id === r[9]; }).map(function (t) { return t.createdAt; })[0] || at(r[8]) : at(r[8]),
          ticketId: r[9] || null, loggedBy: r[0] === 'chat' || r[0] === 'b2b' ? 'sales@meod.test' : null };
      });
      s.feedbackActions = [];
      s.feedbackResolved = {};
      s.migrations.feedbackV1 = true;
    }
    if (!s.migrations.contentV1) {
      // Content studio: one post already out this week, and one from sales staff waiting for
      // approval, so the plan and the approval step can be shown.
      var c0 = new Date(); c0.setHours(0, 0, 0, 0);
      var shi = s.products.filter(function (x) { return x.title === 'Shiitake Mushroom'; })[0];
      s.seq += 2;
      s.contentPlan = [
        { id: 'PO-' + (s.seq - 1), ideaKey: 'learn|sgfresh', type: 'learn', channel: 'social', title: 'Look for the SG Fresh mark',
          caption: 'Spot this mark? 🔍 SG Fresh Produce means it was grown right here in Singapore, to a quality standard.\n\nOur greens are SG Fresh certified — harvested in Kranji, at your door within a day. Order on MEOD Fresh 🌱',
          tags: ['#MEODFarm', '#SGFreshProduce', '#SupportLocal'], image: 'assets/img/fresh-produce.webp', productId: null, dayKey: bagDayKey(new Date(c0.getTime() - 3 * 864e5)), time: '10:00am',
          status: 'posted', createdBy: 'sales@meod.test', createdAt: new Date(c0.getTime() - 5 * 864e5).toISOString(), approvedBy: 'admin@meod.test', postedAt: new Date(c0.getTime() - 3 * 864e5 + 10 * 36e5).toISOString(), postedBy: 'sales@meod.test' },
        shi ? { id: 'PO-' + s.seq, ideaKey: 'fresh|' + shi.id, type: 'fresh', channel: 'social', title: 'Fresh Shiitake Mushroom this week',
          caption: 'Fresh from Kranji 🍄 Our shiitake are meaty, earthy and harvested this week.\n\nSlice and pan-fry with butter and garlic, or drop them into your next soup.\n\nOrder on MEOD Fresh — delivered Tue, Thu & Sat 🚚',
          tags: ['#MEODFarm', '#SGFresh', '#Shiitake'], image: shi.image, productId: shi.id, dayKey: bagDayKey(new Date(c0.getTime() + 2 * 864e5)), time: '7:30pm',
          status: 'pending', createdBy: 'sales@meod.test', createdAt: new Date(Date.now() - 2 * 36e5).toISOString(), approvedBy: null, postedAt: null } : null
      ].filter(Boolean);
      s.migrations.contentV1 = true;
    }
    if (!s.migrations.leaderFinderV1) {
      // Neighbourhoods for the demo customers (in production: postal district only), plus a
      // few Tampines regulars, so the group-leader finder has one clear area with buyers but
      // no leader. Names are fictional and marked (demo).
      var AREAS = ['Punggol', 'Tampines', 'Jurong West', 'Tampines', 'Sengkang', 'Punggol', 'Jurong West', 'Bukit Batok', 'Sengkang', 'Tampines', 'Woodlands', 'Jurong West'];
      s.customers.forEach(function (c, i) { if (!c.area) c.area = AREAS[i % AREAS.length]; });
      var pT = function (title) { return s.products.filter(function (x) { return x.title === title; })[0]; };
      [['Mei Ling Koh (demo)', 'zh', true, [[['Xiao Bai Cai', 2], ['Kai Lan', 2]], 6], [[['Cos Lettuce', 1], ['HK Cai Xin', 2]], 20], [[['Shiitake Mushroom', 1]], 41]],
       ['Farid Ismail (demo)', 'ms', true, [[['Kangkong', 3], ['Bayam', 2]], 4], [[['Kangkong', 2]], 18]],
       ['Rachel Ng (demo)', 'en', true, [[['Mesclun Mix', 2]], 9], [[['Mesclun Mix', 1], ['Sweet Basil', 1]], 27]],
       ['Kumar Pillai (demo)', 'en', false, [[['Tuscan Kale', 1]], 12]]
      ].forEach(function (r) {
        s.seq += 1;
        var cust = { id: 'C-' + s.seq, name: r[0], phone: '+65 8000 ' + (3100 + s.seq % 900), email: '', language: r[1], consentMarketing: r[2], consentPersonalisation: r[2], area: 'Tampines', source: 'shopify-mock' };
        s.customers.push(cust);
        r.slice(3).forEach(function (o) {
          var items = o[0].map(function (l) { var p = pT(l[0]); return p ? { productId: p.id, title: p.title, qty: l[1], priceCents: p.priceCents } : null; }).filter(Boolean);
          s.seq += 1;
          s.orders.push(Object.assign({ id: 'O-' + s.seq, ref: '#MF' + (5000 + s.orders.length + 1), customerId: cust.id, groupEventId: null, status: 'fulfilled', items: items, refundedCents: 0,
            createdAt: new Date(Date.now() - o[1] * 864e5).toISOString(), source: 'shopify-mock' }, priceOrder(items, false)));
        });
      });
      s.leaderInvites = [];
      s.migrations.leaderFinderV1 = true;
    }
    if (!s.migrations.capacityV1) {
      // A new enquiry on the same day as the big community visit, so the capacity check has
      // something to catch (that day's 3 sessions are already taken).
      var rcB = s.bookings.filter(function (b) { return /Maple Grove/.test(b.org || ''); })[0];
      if (rcB) {
        s.seq += 1;
        s.bookings.push({ id: 'B-' + s.seq, name: 'Ms Rani (demo)', email: 'hello@brightkids-demo.test', phone: '+65 8000 0204', org: 'Bright Kids Childcare (demo)', groupType: 'school',
          experience: 'Farm Tour', pax: 25, date: String(rcB.date).slice(0, 10), message: 'Preschoolers aged 5-6, mornings preferred.', status: 'new', createdAt: new Date(Date.now() - 5 * 36e5).toISOString() });
      }
      s.migrations.capacityV1 = true;
    }
    if (!s.migrations.reviewsV1) {
      // Demo reviews: for each product, a few customers who bought it leave a rating and a
      // short review from the category's sample bank. Deterministic, so every reset matches.
      s.reviews = [];
      // The signed-in demo customer (C-1001) is left out so they can write their own reviews.
      var reviewers = s.customers.filter(function (c) { return c.id !== 'C-1001' && !/^(Parent|Staff|Teacher|Resident|Mr|Ms)\b/.test(c.name); });
      s.products.forEach(function (p, pi) {
        if (p.bagOffer) return;
        var bank = REVIEW_BANK[p.category] || REVIEW_BANK['asian-greens'];
        var n = Math.min(bank.length, 3 + (pi * 7) % 5);
        for (var i = 0; i < n; i++) {
          var r = bank[(pi + i) % bank.length], c = reviewers[(pi * 3 + i * 5) % reviewers.length];
          if (s.reviews.some(function (x) { return x.productId === p.id && x.customerId === c.id; })) continue;
          s.seq += 1;
          s.reviews.push({ id: 'RV-' + s.seq, productId: p.id, customerId: c.id, rating: r[0], text: r[1].replace(/\bit is\b/, 'it\'s'),
            at: new Date(Date.now() - (3 + ((pi * 5 + i * 11) % 50)) * 864e5).toISOString(), verified: true, status: 'published' });
        }
      });
      s.migrations.reviewsV1 = true;
    }
    if (!s.migrations.lostDemandV1) {
      // Demo lost demand from the last few weeks: trade enquiries MEOD couldn't fill,
      // "Notify me" taps on sold-out products, and requests for crops MEOD doesn't grow.
      var lp = function (title) { return s.products.filter(function (x) { return x.title === title; })[0]; };
      var acct = function (re) { return ((s.b2b && s.b2b.accounts) || []).filter(function (a) { return re.test(a.name); })[0]; };
      var t1 = new Date(); t1.setHours(0, 0, 0, 0);
      var gf = acct(/Green Fork/), kk = acct(/Kopi/), hc = acct(/Harbour/);
      // [source, reason, product title or crop name, qty, days ago, wanted in N days, customerId, account, who, note, notify]
      var LD = [
        ['b2b', 'quantity', 'Sweet Basil', 20, 2, 4, null, gf, null, 'Wanted 20 bunches for a Tuesday event; we had 6.', true],
        ['soldout', 'ranout', 'Garden Mint', 1, 1, null, 'C-1002', null, null, '', true],
        ['soldout', 'ranout', 'Garden Mint', 2, 3, null, 'C-1005', null, null, '', true],
        ['soldout', 'ranout', 'Garden Mint', 1, 6, null, 'C-1003', null, null, '', true],
        ['chat', 'ranout', 'Oyster Mushroom', 3, 2, null, 'C-1001', null, null, 'Asked on WhatsApp if more oyster mushrooms are coming.', true],
        ['b2b', 'quantity', 'Oyster Mushroom', 10, 5, 2, null, hc, null, 'Catering order for 10 packs, we could do 4.', true],
        ['soldout', 'ranout', 'Red Pak Choy', 2, 4, null, 'C-1006', null, null, '', true],
        ['enquiry', 'ranout', 'Red Pak Choy', 6, 9, null, null, null, 'Walk-in customer (farm shop)', 'Wanted 6 for a dinner party.', false],
        ['b2b', 'timing', 'Mesclun Mix', 8, 7, 1, null, kk, null, 'Asked for Wednesday delivery; we deliver Tue/Thu/Sat.', false],
        ['chat', 'notgrown', 'Nai Bai', 4, 3, null, 'C-1004', null, null, 'Do you grow nai bai?', false],
        ['phone', 'notgrown', 'Nai Bai', 10, 8, null, null, gf, null, 'Chef asked about baby nai bai for soup.', false],
        ['enquiry', 'notgrown', 'Nai Bai', 3, 12, null, 'C-1005', null, null, '', false],
        ['chat', 'notgrown', 'Cherry tomatoes', 2, 5, null, 'C-1002', null, null, '', false],
        ['visit', 'notgrown', 'Baby spinach', 5, 14, null, null, null, 'Visitor at the farm shop', '', false]
      ];
      s.lostDemand = LD.map(function (r) {
        var p = s.products.filter(function (x) { return x.title === r[2]; })[0] || null;
        s.seq += 1;
        return { id: 'LD-' + s.seq, source: r[0], reason: r[1], productId: p ? p.id : null, cropName: r[2], qty: r[3], wantedKey: r[5] != null ? bagDayKey(new Date(t1.getTime() + r[5] * 864e5)) : null,
          customerId: r[6], accountId: r[7] ? r[7].id : null, who: r[8], note: r[9], notify: r[10], status: 'open',
          at: new Date(t1.getTime() - r[4] * 864e5 + 11 * 36e5).toISOString(), by: r[0] === 'soldout' ? null : 'sales@meod.test' };
      });
      // Two fulfilled ones, so the conversion rate has a starting point.
      [['Kai Lan', 8, 18, gf], ['Xiao Bai Cai', 12, 20, hc]].forEach(function (r) {
        var p = lp(r[0]); if (!p) return;
        s.seq += 1;
        s.lostDemand.push({ id: 'LD-' + s.seq, source: 'b2b', reason: 'quantity', productId: p.id, cropName: p.title, qty: r[1], wantedKey: null, customerId: null, accountId: r[3] ? r[3].id : null,
          who: null, note: 'Filled from the next harvest.', notify: true, status: 'fulfilled', at: new Date(t1.getTime() - r[2] * 864e5).toISOString(), by: 'sales@meod.test', resolvedBy: 'sales@meod.test' });
      });
      s.migrations.lostDemandV1 = true;
    }
    if (!s.migrations.pilotV1) {
      // A baseline recorded four weeks ago (before Tyllage's features were in use, demo values),
      // so the pilot page can show change since then.
      s.pilotBaselines = [{ at: new Date(Date.now() - 28 * 864e5).toISOString(), by: 'admin@meod.test', note: 'Before the pilot (demo values)', days: 30,
        conversion: 22, enquiries: 9, converted: 2, sellThrough: 78, harvestedUnits: 410, unsold: 90, campaigns: 1, campRevenueCents: 1300, campMarginCents: 600, lostUnits: 0, minutesSaved: 0 }];
      s.imports = [];
      // Recent demo activity, so "time saved" and campaign results aren't empty on a fresh demo:
      // drafts staff used over the last few weeks, and a reorder after the Mushroom Monday campaign.
      [['booking.replied', 'B-1001', 11], ['booking.replied', 'B-2058', 15], ['b2b.contacted', 'Green Fork Bistro (demo)', 6], ['b2b.contacted', 'Harbour Catering (demo)', 9],
       ['campaign.submitted', 'Kai Lan', 12], ['rescue.alert', 'Bayam', 5], ['pricing.proposed', 'Sweet Basil', 0.2], ['briefing.sent', 'weekly', 7]].forEach(function (a) {
        s.audit.push({ at: new Date(Date.now() - a[2] * 864e5).toISOString(), actor: 'sales@meod.test', event: a[0], target: a[1] });
      });
      var cp = s.campaigns.filter(function (c) { return c.id === 'CP-1001'; })[0];
      var shiP = cp && s.products.filter(function (x) { return x.id === cp.productId; })[0];
      if (shiP) {
        var reItems = [{ productId: shiP.id, title: shiP.title, qty: 2, priceCents: shiP.priceCents }];
        s.seq += 1;
        s.orders.push(Object.assign({ id: 'O-' + s.seq, ref: '#MF' + (5000 + s.orders.length + 1), customerId: 'C-1003', groupEventId: null, status: 'fulfilled', items: reItems,
          refundedCents: 0, createdAt: new Date(new Date(cp.createdAt).getTime() + 864e5).toISOString(), source: 'shopify-mock' }, priceOrder(reItems, false)));
      }
      s.migrations.pilotV1 = true;
    }
    if (!s.migrations.rewardsV1) {
      // Rewards store (vouchers + point redemptions). Points themselves are derived from orders.
      s.rewardsStore = s.rewardsStore || { vouchers: [], redemptions: [] };
      // Older order history so the demo has customers in several tiers: Bee Ling is a regular
      // (Harvester), Ethan is mid-way (Sprout); Aster stays a Seedling close to Sprout.
      var prodT = function (title) { return s.products.filter(function (x) { return x.title === title; })[0]; };
      [
        ['C-1002', [['Xiao Bai Cai', 6], ['HK Cai Xin', 5], ['Kangkong', 4]], 40],
        ['C-1002', [['Kai Lan', 5], ['Bayam', 4], ['Xiao Bai Cai', 5]], 85],
        ['C-1002', [['HK Cai Xin', 6], ['Kangkong', 5], ['Red Pak Choy', 3]], 150],
        ['C-1002', [['Xiao Bai Cai', 4], ['Kai Lan', 4], ['Sweet Basil', 2]], 230],
        ['C-1005', [['Cos Lettuce', 4], ['Mesclun Mix', 3], ['Tuscan Kale', 2]], 60],
        ['C-1005', [['Cos Lettuce', 3], ['Mizuna', 3], ['Sweet Basil', 2]], 130]
      ].forEach(function (r) {
        var items = r[1].map(function (l) { var p = prodT(l[0]); return p ? { productId: p.id, title: p.title, qty: l[1], priceCents: p.priceCents } : null; }).filter(Boolean);
        s.seq += 1;
        s.orders.push(Object.assign({
          id: 'O-' + s.seq, ref: '#MF' + (5000 + s.orders.length + 1), customerId: r[0], groupEventId: null, status: 'fulfilled',
          items: items, refundedCents: 0, createdAt: new Date(Date.now() - r[2] * 864e5).toISOString(), source: 'shopify-mock'
        }, priceOrder(items, false)));
      });
      s.migrations.rewardsV1 = true;
    }
    return s;
  }

  /* ---------- Product reviews + AI review summary ----------
   * Star ratings and short reviews from customers who bought the product (verified by their
   * orders). The summary is rule-based and explainable: it counts which aspects reviewers
   * mention (freshness, taste, how long it lasts, cleanliness, value, size, wilting, marks)
   * and whether each mention is positive or negative, then writes a short overview. In
   * production a language model could write the overview from the same counts; it never
   * invents an aspect nobody mentioned. Reviewer names are shown as first name + initial.
   */
  var REVIEW_ASPECTS = [
    { key: 'fresh', label: 'Fresh and crisp', says: 'how fresh and crisp it is', negLabel: 'Not fresh', re: /\b(fresh|crisp|crunchy|crunch)\b/, neg: /\bnot (very )?(fresh|crisp)\b/ },
    { key: 'taste', label: 'Great taste', says: 'the taste', negLabel: 'Bland or bitter', re: /\b(sweet|flavou?r|tasty|delicious|fragrant|aroma|earthy|meaty|peppery|nutty)\b/, neg: /\b(bitter|bland|no taste)\b/ },
    { key: 'lasts', label: 'Lasts long', says: 'how long it keeps', negLabel: 'Didn\'t last', re: /\b(lasted|lasts|keeps well|whole week|still good)\b/, neg: /\b(went bad|didn.?t last|spoiled)\b/ },
    { key: 'clean', label: 'Clean, easy to prep', says: 'how clean it arrives', negLabel: 'Sandy or gritty', re: /\b(clean|no sand|no grit|easy to wash|pesticide)\b/, neg: /\b(sandy|gritty|dirty)\b/ },
    { key: 'value', label: 'Good value', says: 'the value', negLabel: 'A bit pricey', re: /\b(value|worth|good price|great deal|bargain)\b/, neg: /\b(pricey|expensive|costly|overpriced)\b/ },
    { key: 'size', label: 'Generous bunch', says: 'the generous bunches', negLabel: 'Small bunch', re: /\b(generous|big bunch|plenty)\b/, neg: /\b(small bunch|smaller|tiny|not much)\b/ },
    { key: 'wilt', label: 'Wilting', neg: /\b(wilt|wilted|limp|yellow|yellowing|soggy|slimy|brown)\b/ },
    { key: 'marks', label: 'Small marks or holes', neg: /\b(holes|marks|spots|bruised|blemish)/ }
  ];
  var REVIEW_BANK = {
    'asian-greens': [
      [5, 'So fresh and crunchy, you can taste the difference from the supermarket.'], [5, 'Sweet stems, perfect with garlic. Stayed crisp for days.'],
      [4, 'Very clean leaves, hardly any washing needed. Bunch was a bit small.'], [5, 'Lasted a whole week in the fridge. Will buy again.'],
      [4, 'Good value for pesticide-free veg. Tasty in soup.'], [3, 'A few leaves were yellowing but the rest was fine.'],
      [5, 'Kids actually eat their greens now! Sweet and tender.'], [4, 'Fresh and generous bunch, slightly bitter when overcooked.']
    ],
    lettuces: [
      [5, 'Crisp and fresh, great for salads.'], [5, 'Lasted over a week in the fridge, still crunchy.'],
      [4, 'Lovely peppery flavour. A bit pricey but worth it.'], [3, 'Some leaves were limp on arrival.'],
      [5, 'So clean, no grit at all. Easy to prep.'], [4, 'Fresh, though the bunch was smaller than I expected.']
    ],
    fungi: [
      [5, 'Meaty and fragrant, best mushrooms I have bought locally.'], [5, 'Fresh, firm and lasted the week.'],
      [4, 'Earthy flavour, great in stir-fry. Slightly pricey.'], [5, 'Clean and dry, no sliminess at all.'], [4, 'Good value for the quality.']
    ],
    herbs: [
      [5, 'So fragrant, the whole kitchen smelled amazing.'], [4, 'Fresh and aromatic. Bunch was a bit small.'],
      [3, 'Leaves had some brown spots, flavour still good.'], [5, 'Lasted much longer than supermarket herbs.']
    ],
    'farm-more': [
      [5, 'Delicious and you can tell it is made with real greens.'], [4, 'Tasty, a little pricey for the size.'], [5, 'Great value gift, everyone loved it.']
    ]
  };
  function reviewerName(c) {
    if (!c) return 'MEOD customer';
    var parts = String(c.name).replace(/\s*\(demo\)\s*/i, '').trim().split(/\s+/);
    return parts[0] + (parts.length > 1 ? ' ' + parts[parts.length - 1].charAt(0) + '.' : '');
  }
  function reviewsFor(productId) {
    return (state.reviews || []).filter(function (r) { return r.productId === productId && r.status !== 'hidden'; })
      .sort(function (a, b) { return a.at < b.at ? 1 : -1; });
  }
  function reviewStats(productId) {
    var list = reviewsFor(productId), dist = [0, 0, 0, 0, 0];
    list.forEach(function (r) { dist[r.rating - 1] += 1; });
    var avg = list.length ? list.reduce(function (s, r) { return s + r.rating; }, 0) / list.length : 0;
    return { count: list.length, avg: Math.round(avg * 10) / 10, dist: dist };
  }
  function reviewSummary(productId) {
    var list = reviewsFor(productId), st = reviewStats(productId);
    if (list.length < 3) return null; // too few to summarise fairly
    var counts = REVIEW_ASPECTS.map(function (a) {
      var pos = 0, neg = 0;
      list.forEach(function (r) {
        var t = r.text.toLowerCase();
        if (a.neg && a.neg.test(t)) neg += 1;
        else if (a.re && a.re.test(t)) pos += 1;
      });
      return { key: a.key, label: a.label, says: a.says || a.label.toLowerCase(), negLabel: a.negLabel || a.label, pos: pos, neg: neg };
    });
    var pros = counts.filter(function (c) { return c.pos >= 2 && c.pos > c.neg; }).sort(function (a, b) { return b.pos - a.pos; }).slice(0, 3);
    var cons = counts.filter(function (c) { return c.neg >= 1; }).sort(function (a, b) { return b.neg - a.neg; }).slice(0, 2);
    var happy = list.filter(function (r) { return r.rating >= 4; }).length;
    var lower = function (s) { return s.charAt(0).toLowerCase() + s.slice(1); };
    var join = function (xs) { return xs.length > 1 ? xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1] : xs[0]; };
    var text = happy + ' of ' + list.length + ' reviewers rate it 4 stars or more.';
    if (pros.length) text += ' They most often praise ' + join(pros.map(function (c) { return c.says; })) + '.';
    if (cons.length) text += ' ' + (cons[0].neg === 1 ? 'One reviewer' : cons[0].neg + ' reviewers') + ' mentioned: ' + lower(cons[0].negLabel) + (cons[1] ? '; ' + (cons[1].neg === 1 ? 'one' : cons[1].neg) + ' said ' + lower(cons[1].negLabel) : '') + '.';
    return { text: text, pros: pros, cons: cons, stats: st, basedOn: list.length };
  }
  // A customer may review a product once they have a fulfilled order containing it.
  function reviewCanWrite(customerId, productId) {
    if (!customerId) return { ok: false };
    var bought = state.orders.some(function (o) { return o.customerId === customerId && o.status === 'fulfilled' && o.items.some(function (i) { return i.productId === productId; }); });
    var mine = (state.reviews || []).filter(function (r) { return r.customerId === customerId && r.productId === productId; })[0];
    return { ok: bought && !mine, bought: bought, mine: mine || null };
  }
  function reviewAdd(customerId, productId, rating, text) {
    var can = reviewCanWrite(customerId, productId);
    if (!can.bought) return { ok: false, error: 'You can review products you\'ve received.' };
    if (can.mine) return { ok: false, error: 'You\'ve already reviewed this.' };
    rating = Math.round(Number(rating));
    if (!(rating >= 1 && rating <= 5)) return { ok: false, error: 'Pick a star rating.' };
    text = String(text || '').trim().slice(0, 300);
    state.reviews = state.reviews || [];
    var id = nextId('RV');
    state.reviews.unshift({ id: id, productId: productId, customerId: customerId, rating: rating, text: text, at: new Date().toISOString(), verified: true, status: 'published' });
    // Reviews also feed staff Feedback intelligence (themes, batch tracing).
    state.feedback = state.feedback || [];
    state.feedback.unshift({ id: nextId('FB'), source: 'review', customerId: customerId, accountId: null, who: null, productId: productId, deliveryKey: null, batchId: null,
      rating: rating, text: text || (rating + '-star review'), at: new Date().toISOString(), loggedBy: null });
    return { ok: true, id: id };
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
    applySettings();
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
    // Harvest Rescue: how much went into stock, and when it should be sold by.
    b.toStock = toStock;
    b.sellBy = bagDayKey(new Date(Date.now() + ((p && RULES.shelfDays[p.category]) || 4) * 864e5));
    return { ok: true, reserved: reserved, served: Math.min(reserved, sellable), toStock: toStock, shortfall: Math.max(0, reserved - sellable), held: grades ? grades.check : 0 };
  }
  function batchCancel(id) {
    var b = byId('batches', id);
    if (b) b.status = 'cancelled';
  }

  /* ---------- Tyllage Visits: learning journeys that turn into farm sales ----------
   * Confirming a group booking gives that organisation its own group-buy code (reusing
   * GroupBuy): visitors scan a QR on the day, order from the visitor shop with the group
   * discount, and RULES.visitFundRate of the group's orders accrues to the group's fund
   * through the normal commission ledger. Visitors can opt in to future messages, which is
   * how a one-off visit becomes repeat customers. All rates are illustrative.
   */
  function visitSessions(pax) { return Math.max(1, Math.ceil(pax / RULES.visitSessionMax)); }
  function visitCodeFor(st, booking) {
    var words = String(booking.org || booking.name || 'GROUP').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(function (w) { return w && w !== 'DEMO'; });
    var d = parseDayKey(booking.date);
    var base = (words.slice(0, 2).map(function (w) { return w.slice(0, 8); }).join('-') || 'GROUP') + '-' + pad2(d.getDate()) + pad2(d.getMonth() + 1);
    var code = base.slice(0, 22), n = 2;
    while (st.events.some(function (e) { return e.code === code; })) code = base.slice(0, 20) + '-' + n++;
    return code;
  }
  // Works on any state object so the seed migration can use it before `state` exists.
  function createVisitGroup(st, booking) {
    var type = GROUP_TYPES[booking.groupType] || GROUP_TYPES.other;
    st.seq += 1;
    var leader = { id: 'L-' + st.seq, name: booking.org || booking.name, area: type.label + ' visit', commissionRate: RULES.visitFundRate, kind: 'visit', bookingId: booking.id };
    st.seq += 1;
    var code = visitCodeFor(st, booking);
    var visitDay = parseDayKey(booking.date);
    var event = {
      id: 'G-' + st.seq, leaderId: leader.id, title: 'Farm visit — ' + (booking.org || booking.name), code: code,
      endsAt: new Date(visitDay.getTime() + (RULES.visitCodeDays + 1) * 864e5).toISOString(),
      terms: 'Visitor farm shop for the ' + booking.date + ' visit. Collect at the farm or get it delivered. ' + Math.round(RULES.visitFundRate * 100) + '% of orders go to the ' + type.fund + '.',
      status: 'open', bookingId: booking.id, kind: 'visit'
    };
    st.leaders.push(leader);
    st.events.push(event);
    booking.status = 'confirmed';
    booking.eventId = event.id;
    return event;
  }
  // Visits capacity: the farm hosts RULES.visitSessionsPerDay sessions a day. Confirmed
  // bookings use sessions; new enquiries are shown as requested but don't hold a slot.
  function visitDayKey(d) { return String(d || '').slice(0, 10); }
  function visitCapacity(dayKey, excludeId) {
    var cap = RULES.visitSessionsPerDay, booked = 0, requested = 0;
    state.bookings.forEach(function (b) {
      if (b.id === excludeId || visitDayKey(b.date) !== dayKey) return;
      if (b.status === 'confirmed') booked += visitSessions(b.pax);
      else if (b.status === 'new') requested += visitSessions(b.pax);
    });
    return { dayKey: dayKey, cap: cap, booked: booked, requested: requested, left: Math.max(0, cap - booked) };
  }
  function visitFits(b) {
    var c = visitCapacity(visitDayKey(b.date), b.id), need = visitSessions(b.pax);
    return Object.assign({ need: need, fits: c.booked + need <= c.cap }, c);
  }
  // The next days (not Sundays) after a booking's date with room for the whole group.
  function visitFreeDays(b, n) {
    var need = visitSessions(b.pax), out = [];
    var d = parseDayKey(visitDayKey(b.date));
    var today = new Date(); today.setHours(0, 0, 0, 0);
    if (d < today) d = today;
    for (var i = 1; i <= 30 && out.length < (n || 3); i++) {
      var x = new Date(d.getTime() + i * 864e5);
      if (x.getDay() === 0) continue;
      var c = visitCapacity(bagDayKey(x), b.id);
      if (c.booked + need <= c.cap) out.push(bagDayKey(x));
    }
    return out;
  }
  function visitConfirm(bookingId) {
    var b = byId('bookings', bookingId);
    if (!b) return { ok: false, error: 'Booking not found.' };
    if (b.eventId) return { ok: true, event: byId('events', b.eventId) };
    var f = visitFits(b);
    if (!f.fits) return { ok: false, full: true, error: 'Fully booked: ' + f.booked + ' of ' + f.cap + ' sessions are taken that day and this group needs ' + f.need + '. Offer other dates instead.' };
    return { ok: true, event: createVisitGroup(state, b) };
  }
  // Group discount always applies; collecting at the farm has no delivery fee.
  function visitTotals(items, fulfilment) {
    var t = priceOrder(items, true);
    if (fulfilment !== 'delivery') { t.deliveryCents = 0; t.totalCents = t.netCents; }
    return t;
  }
  function visitEventByCode(code) {
    code = String(code || '').trim().toUpperCase();
    return state.events.filter(function (e) { return e.kind === 'visit' && e.code === code; })[0] || null;
  }
  // Visitor shop checkout. Fails closed on stale or short stock; reuses a customer with the
  // same phone number, otherwise creates one tagged with the visit it came from.
  function visitOrder(code, contact, lines, fulfilment) {
    var ev = visitEventByCode(code);
    if (!ev || ev.status !== 'open' || new Date(ev.endsAt).getTime() < Date.now()) return { ok: false, error: 'This visit code has closed.' };
    if (!String(contact.name || '').trim()) return { ok: false, error: 'Please enter your name.' };
    var phone = String(contact.phone || '').replace(/[^\d+ ]/g, '').trim();
    if (phone.replace(/\D/g, '').length < 8) return { ok: false, error: 'Please enter a phone number with at least 8 digits.' };
    var items = [];
    for (var i = 0; i < lines.length; i++) {
      var p = byId('products', lines[i].productId);
      var s = p && stockStatus(p);
      if (!p || !s.known) return { ok: false, error: (p ? p.title : 'An item') + '\'s stock can\'t be confirmed right now.' };
      if (p.stock.qty < lines[i].qty) return { ok: false, error: 'Only ' + p.stock.qty + ' ' + p.title + ' left.' };
      items.push({ productId: p.id, title: p.title, qty: lines[i].qty, priceCents: p.priceCents });
    }
    if (!items.length) return { ok: false, error: 'Add something to your order first.' };
    var booking = byId('bookings', ev.bookingId);
    var c = state.customers.filter(function (x) { return x.phone && x.phone.replace(/\D/g, '') === phone.replace(/\D/g, ''); })[0];
    if (!c) {
      c = { id: nextId('C'), name: String(contact.name).trim().slice(0, 60), phone: phone, email: '', language: contact.language || 'en',
        consentMarketing: Boolean(contact.consentMarketing), consentPersonalisation: Boolean(contact.consentMarketing),
        source: 'visit', bookingId: ev.bookingId, groupCode: ev.code, joinedAt: new Date().toISOString() };
      state.customers.push(c);
    } else if (contact.consentMarketing && !c.consentMarketing) {
      c.consentMarketing = true;
    }
    items.forEach(function (it) { byId('products', it.productId).stock.qty -= it.qty; });
    var id = nextId('O');
    var order = Object.assign({
      id: id, ref: '#MF' + (5000 + state.orders.length + 1), customerId: c.id, groupEventId: ev.id, status: 'pending_payment',
      items: items, refundedCents: 0, createdAt: new Date().toISOString(), source: 'visit', fulfilment: fulfilment === 'delivery' ? 'delivery' : 'collect'
    }, visitTotals(items, fulfilment));
    state.orders.push(order);
    return { ok: true, order: order, customer: c, booking: booking };
  }
  // Everything that came out of one visit: on-the-day orders (with the visit code), how many
  // visitors opted in, and orders those visitors placed later without the code.
  function visitStats(booking) {
    var ev = booking.eventId ? byId('events', booking.eventId) : null;
    var live = function (o) { return o.status !== 'cancelled'; };
    var codeOrders = ev ? state.orders.filter(function (o) { return o.groupEventId === ev.id && live(o); }) : [];
    var fromVisit = state.customers.filter(function (c) { return c.bookingId === booking.id; });
    var fromIds = {};
    fromVisit.forEach(function (c) { fromIds[c.id] = true; });
    var later = state.orders.filter(function (o) { return fromIds[o.customerId] && live(o) && (!ev || o.groupEventId !== ev.id); });
    var net = function (list) { return list.reduce(function (s, o) { return s + o.netCents - (o.refundedCents || 0); }, 0); };
    var buyers = {};
    codeOrders.forEach(function (o) { buyers[o.customerId] = true; });
    var repeatBuyers = {};
    later.forEach(function (o) { repeatBuyers[o.customerId] = true; });
    var salesCents = net(codeOrders) + net(later);
    var fund = ev ? ledger(ev.leaderId).reduce(function (s, e) { return s + e.payableCents; }, 0) : 0;
    var visited = parseDayKey(booking.date).getTime() <= Date.now();
    return {
      event: ev, visited: visited, sessions: visitSessions(booking.pax),
      buyers: Object.keys(buyers).length, orders: codeOrders.length, signups: fromVisit.filter(function (c) { return c.consentMarketing; }).length,
      repeatBuyers: Object.keys(repeatBuyers).length, laterOrders: later.length,
      daySalesCents: net(codeOrders), laterSalesCents: net(later), salesCents: salesCents,
      perVisitorCents: booking.pax ? Math.round(salesCents / booking.pax) : 0, fundCents: fund
    };
  }
  function visitFunnel() {
    var f = { enquiries: state.bookings.length, confirmed: 0, visitedGroups: 0, visitors: 0, buyers: 0, signups: 0, repeatBuyers: 0, salesCents: 0 };
    state.bookings.forEach(function (b) {
      if (b.status === 'confirmed') f.confirmed++;
      if (b.status !== 'confirmed') return;
      var st = visitStats(b);
      if (!st.visited) return;
      f.visitedGroups++; f.visitors += b.pax; f.buyers += st.buyers; f.signups += st.signups;
      f.repeatBuyers += st.repeatBuyers; f.salesCents += st.salesCents;
    });
    f.perVisitorCents = f.visitors ? Math.round(f.salesCents / f.visitors) : 0;
    return f;
  }

  /* ---------- Grow with MEOD: rewards tiers, points and vouchers ----------
   * Keeps MEOD Fresh's Store Rewards model (points per dollar, redeem for a discount) and
   * adds what it doesn't have: growth-stage tiers counted in bunches of MEOD-grown produce
   * (like a bubble-tea "cups" card, but for local veg), 2× points on anti-waste buys
   * (Buy to Clear, harvest pre-orders), a voucher on reaching each tier, and a lower
   * free-delivery threshold for the top tiers. Points are derived from orders every time
   * (paid/fulfilled earn, refunds reverse), so the balance always matches the order history.
   * In production the balance would sync with Smile.io; Tyllage would add the bonuses.
   */
  var RW = RULES.rewards;
  var EARNING = ['paid', 'fulfilled', 'refunded'];
  function isBunch(item) {
    var p = byId('products', item.productId);
    return Boolean(p && p.meodGrown && p.category !== 'farm-more' && !p.bagOffer && !item.bag);
  }
  function isAntiWaste(item) { return Boolean(item.clearanceListingId || item.preorderBatchId || item.bag); }
  function tierForBunches(n) {
    var t = RW.tiers[0];
    RW.tiers.forEach(function (x) { if (n >= x.minBunches) t = x; });
    return t;
  }
  function nextTier(t) { var i = RW.tiers.indexOf(t); return RW.tiers[i + 1] || null; }
  function customerOrders(customerId) {
    return state.orders.filter(function (o) { return o.customerId === customerId; })
      .sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });
  }
  // Bunches counted towards a tier: MEOD-grown items in paid/fulfilled orders within the window.
  function bunchesAt(customerId, atMs, excludeOrderId) {
    var from = atMs - RW.tierWindowDays * 864e5, n = 0;
    state.orders.forEach(function (o) {
      if (o.customerId !== customerId || o.id === excludeOrderId) return;
      if (o.status !== 'paid' && o.status !== 'fulfilled') return;
      var t = new Date(o.createdAt).getTime();
      if (t <= from || t > atMs) return;
      o.items.forEach(function (i) { if (isBunch(i)) n += i.qty; });
    });
    return n;
  }
  // Points for one order: 1 per S$1 actually paid on each line (group discount and voucher
  // shared out across lines), doubled on anti-waste lines, times the tier multiplier the
  // customer had when they ordered.
  function pointsForOrder(order, tier) {
    var sub = order.subtotalCents || 0;
    var ratio = sub ? order.netCents / sub : 0;
    var base = 0, bonus = 0;
    order.items.forEach(function (i) {
      var pts = Math.floor(i.priceCents * i.qty * ratio / 100 * RW.pointsPerDollar);
      base += pts;
      if (isAntiWaste(i)) bonus += pts * (RW.antiWasteMultiplier - 1);
    });
    var tierBonus = Math.floor((base + bonus) * (tier.multiplier - 1));
    return { base: base, antiWaste: bonus, tierBonus: tierBonus, total: base + bonus + tierBonus };
  }
  function rewardsLedger(customerId) {
    var rows = [];
    customerOrders(customerId).forEach(function (o) {
      if (o.status === 'cancelled') return;
      var at = new Date(o.createdAt).getTime();
      var tier = tierForBunches(bunchesAt(customerId, at - 1, o.id));
      var p = pointsForOrder(o, tier);
      var detail = [p.base + ' base'];
      if (p.antiWaste) detail.push('+' + p.antiWaste + ' anti-waste (' + RW.antiWasteMultiplier + '×)');
      if (p.tierBonus) detail.push('+' + p.tierBonus + ' ' + tier.label + ' bonus');
      if (o.status === 'pending_payment') {
        rows.push({ at: o.createdAt, kind: 'pending', points: p.total, ref: o.ref, detail: 'Pending until paid · ' + detail.join(', ') });
        return;
      }
      if (EARNING.indexOf(o.status) === -1) return;
      rows.push({ at: o.createdAt, kind: 'earn', points: p.total, ref: o.ref, detail: detail.join(', ') });
      if (o.status === 'refunded') rows.push({ at: o.createdAt, kind: 'reversed', points: -p.total, ref: o.ref, detail: 'Order refunded' });
    });
    state.rewardsStore.redemptions.forEach(function (r) {
      if (r.customerId === customerId) rows.push({ at: r.at, kind: 'redeemed', points: -r.points, ref: r.voucherCode, detail: 'Swapped for a ' + money(r.valueCents) + ' voucher' });
    });
    return rows.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  }
  function rewardsSummary(customerId) {
    var now = Date.now();
    var bunches = bunchesAt(customerId, now);
    var tier = tierForBunches(bunches), next = nextTier(tier);
    var rows = rewardsLedger(customerId);
    var points = 0, pending = 0, lifetime = 0;
    rows.forEach(function (r) {
      if (r.kind === 'pending') pending += r.points;
      else points += r.points;
      if (r.kind === 'earn') lifetime += r.points;
    });
    var span = next ? next.minBunches - tier.minBunches : 1;
    return {
      tier: tier, next: next, bunches: bunches, toNext: next ? Math.max(0, next.minBunches - bunches) : 0,
      progressPct: next ? Math.min(100, Math.round((bunches - tier.minBunches) / span * 100)) : 100,
      points: Math.max(0, points), pending: pending, lifetime: lifetime,
      redeemable: Math.floor(Math.max(0, points) / RW.redeemPoints),
      freeFromCents: tier.freeFromCents != null ? tier.freeFromCents : RULES.freeDeliveryThresholdCents,
      ledger: rows
    };
  }
  function voucherCode() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = 'GROW-';
    for (var i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }
  function issueVoucher(customerId, valueCents, source, label) {
    var v = {
      id: nextId('V'), customerId: customerId, code: voucherCode(), valueCents: valueCents, source: source, label: label,
      status: 'active', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + RW.voucherDays * 864e5).toISOString(), orderId: null
    };
    state.rewardsStore.vouchers.push(v);
    return v;
  }
  // One voucher per tier reached (Sprout and up), issued the first time the tier is seen.
  function syncTierVouchers(customerId) {
    var s = rewardsSummary(customerId), issued = [];
    RW.tiers.forEach(function (t) {
      if (!t.voucherCents || t.minBunches > s.bunches) return;
      var src = 'tier:' + t.key;
      if (state.rewardsStore.vouchers.some(function (v) { return v.customerId === customerId && v.source === src; })) return;
      issued.push(issueVoucher(customerId, t.voucherCents, src, 'Welcome to ' + t.label));
    });
    return issued;
  }
  function redeemPoints(customerId, units) {
    units = Math.floor(units);
    var s = rewardsSummary(customerId);
    if (!(units >= 1)) return { ok: false, error: 'Choose how many vouchers to swap for.' };
    if (units > s.redeemable) return { ok: false, error: 'You need ' + units * RW.redeemPoints + ' points — you have ' + s.points + '.' };
    var value = units * RW.redeemValueCents;
    var v = issueVoucher(customerId, value, 'points', money(value) + ' from points');
    state.rewardsStore.redemptions.push({ id: nextId('RD'), customerId: customerId, points: units * RW.redeemPoints, valueCents: value, voucherCode: v.code, at: new Date().toISOString() });
    return { ok: true, voucher: v };
  }
  function voucherUsable(v) { return v.status === 'active' && new Date(v.expiresAt).getTime() > Date.now(); }
  function customerVouchers(customerId) {
    return state.rewardsStore.vouchers.filter(function (v) { return v.customerId === customerId; })
      .sort(function (a, b) { return (voucherUsable(b) - voucherUsable(a)) || new Date(a.expiresAt) - new Date(b.expiresAt); });
  }
  // Vouchers only come off full-price lines, so they never undercut a clearance minimum
  // price or a pre-order / bag price.
  function voucherCapCents(items, groupDiscount) {
    var full = items.filter(function (i) { return !isAntiWaste(i); }).reduce(function (s, i) { return s + i.priceCents * i.qty; }, 0);
    return groupDiscount ? Math.round(full * (1 - RULES.groupDiscountRate)) : full;
  }
  function previewPoints(customerId, items, totals) {
    var tier = tierForBunches(bunchesAt(customerId, Date.now()));
    return pointsForOrder({ items: items, subtotalCents: totals.subtotalCents, netCents: totals.netCents }, tier);
  }
  function useVoucher(voucherId, orderId) {
    var v = state.rewardsStore.vouchers.filter(function (x) { return x.id === voucherId; })[0];
    if (v) { v.status = 'used'; v.orderId = orderId; v.usedAt = new Date().toISOString(); }
  }

  /* Smart tips: short, personalised nudges built from the customer's own orders, taste
   * profile, open pre-orders, clearance stock, points and vouchers. PROTOTYPE: ranked rules;
   * the live version could have a language model phrase them. Never changes a price. */
  function rewardsTips(customer) {
    var s = rewardsSummary(customer.id), tips = [];
    var tasteCats = {};
    (customer.consentPersonalisation ? tasteProfile(customer) : []).forEach(function (t) { tasteCats[t.category] = t.pct; });
    var usual = {};
    customerOrders(customer.id).forEach(function (o) { if (o.status !== 'cancelled') o.items.forEach(function (i) { if (isBunch(i)) usual[i.productId] = (usual[i.productId] || 0) + i.qty; }); });
    var fav = Object.keys(usual).map(function (id) { return byId('products', id); })
      .filter(function (p) { var st = p && stockStatus(p); return st && st.known && st.qty > 0; })
      .sort(function (a, b) { return usual[b.id] - usual[a.id]; })[0];
    if (s.next && s.toNext <= 10) {
      tips.push({ score: 90 - s.toNext, kind: 'tier', text: 'You\'re ' + s.toNext + ' bunch' + (s.toNext === 1 ? '' : 'es') + ' from ' + s.next.label +
        (s.next.voucherCents ? ' and a ' + money(s.next.voucherCents) + ' voucher' : '') + '.' + (fav ? ' Your usual ' + fav.title + ' counts.' : ''), action: fav ? { label: 'Add ' + fav.title, productId: fav.id } : null });
    }
    var po = batchesOpen().filter(function (b) { var p = byId('products', b.productId); return p && (!Object.keys(tasteCats).length || tasteCats[p.category]); })[0] || batchesOpen()[0];
    if (po) {
      var pp = byId('products', po.productId);
      tips.push({ score: 70, kind: 'preorder', text: 'Pre-order ' + pp.title + ' from the ' + parseDayKey(po.harvestDate).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' }) + ' harvest for ' + RW.antiWasteMultiplier + '× points — it helps the farm grow only what gets eaten.', action: { label: 'See pre-orders', href: '#shop' } });
    }
    var cl = clearanceListActive().filter(function (l) { var p = byId('products', l.productId); return p && (!Object.keys(tasteCats).length || tasteCats[p.category]); })[0];
    if (cl) {
      var cp = byId('products', cl.productId);
      tips.push({ score: 60, kind: 'clearance', text: cp.title + ' is on Buy to Clear at ' + money(cl.clearancePriceCents) + ' — ' + RW.antiWasteMultiplier + '× points and less food waste.', action: { label: 'Buy to Clear', href: '#shop' } });
    }
    if (s.redeemable) {
      tips.push({ score: 80, kind: 'redeem', text: 'You have ' + s.points + ' points — enough for ' + money(s.redeemable * RW.redeemValueCents) + ' in vouchers.', action: { label: 'Swap points', redeem: true } });
    }
    var soon = customerVouchers(customer.id).filter(function (v) { return voucherUsable(v) && new Date(v.expiresAt).getTime() - Date.now() < 14 * 864e5; })[0];
    if (soon) tips.push({ score: 95, kind: 'expiry', text: 'Your ' + money(soon.valueCents) + ' voucher expires on ' + new Date(soon.expiresAt).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }) + ' — use it on your next order.', action: { label: 'Shop now', href: '#shop' } });
    return tips.sort(function (a, b) { return b.score - a.score; }).slice(0, 3);
  }
  // Staff view: every customer's tier, bunches, points and how close they are to the next tier.
  // One row per customer with what farm ops segments on: tier/points, when they last ordered,
  // and which categories they buy (from their own orders — used for opted-in campaigns only).
  function rewardsMembers() {
    var now = Date.now();
    return state.customers.map(function (c) {
      var last = 0, cats = {};
      state.orders.forEach(function (o) {
        if (o.customerId !== c.id || o.status === 'cancelled') return;
        var t = new Date(o.createdAt).getTime();
        if (t > last) last = t;
        o.items.forEach(function (i) { var p = byId('products', i.productId); if (p) cats[p.category] = (cats[p.category] || 0) + i.qty; });
      });
      return {
        customer: c, s: rewardsSummary(c.id),
        lastOrderAt: last ? new Date(last).toISOString() : null,
        daysSinceOrder: last ? Math.floor((now - last) / 864e5) : null,
        categories: cats
      };
    });
  }

  /* ---------- Tyllage Price Advisor + Margin Guard ----------
   * Margin Guard: every suggested price is checked against a floor — the higher of MEOD's
   * minimum price rule (60% of normal) and unit cost plus the minimum margin. Price Advisor:
   * rule-based suggestions from Demand Radar and Harvest Rescue (discount surplus, bundle a
   * surplus crop with a rising one, hold the price on short crops). Nothing changes a price
   * by itself: staff propose, an admin who didn't propose approves. Costs are illustrative.
   */
  function unitCost(productId) {
    var c = (state.costs || {})[productId];
    if (!c) {
      var p = byId('products', productId), grow = p ? Math.round(p.priceCents * 0.35) : 0;
      return { growCents: grow, packCents: 22, handleCents: 30, totalCents: grow + 52 };
    }
    return { growCents: c.growCents, packCents: c.packCents, handleCents: c.handleCents, totalCents: c.growCents + c.packCents + c.handleCents };
  }
  function marginGuard(productId, priceCents, qty) {
    qty = qty || 1;
    var p = byId('products', productId);
    var cost = unitCost(productId);
    var costFloor = Math.ceil(cost.totalCents / (1 - RULES.minMarginRate));
    var ruleFloor = p ? Math.round(p.priceCents * RULES.clearanceDefaultMinRate) : 0;
    var floor = Math.max(costFloor, ruleFloor);
    var margin = priceCents - cost.totalCents;
    var reasons = [];
    if (priceCents < ruleFloor) reasons.push('below MEOD\'s minimum price (' + money(ruleFloor) + ', 60% of normal)');
    if (priceCents < costFloor) reasons.push('margin under ' + Math.round(RULES.minMarginRate * 100) + '% after the ' + money(cost.totalCents) + ' unit cost');
    return {
      ok: reasons.length === 0, priceCents: priceCents, cost: cost, marginCents: margin, marginPct: priceCents ? Math.round(margin / priceCents * 100) : 0,
      floorCents: floor, floorBy: costFloor >= ruleFloor ? 'cost' : 'rule', maxDiscountPct: p ? Math.max(0, Math.floor((1 - floor / p.priceCents) * 100)) : 0,
      reasons: reasons, totalMarginCents: margin * qty
    };
  }
  function shortDayLabel(key) { return parseDayKey(key).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' }); }
  function priceSuggestions() {
    var out = [];
    var crops = radarCrops();
    var rescue = rescueBatches();
    var weeks = RADAR_WEEKS;
    // 1. Surplus crops: a discount sized to the gap, checked by Margin Guard.
    crops.filter(function (c) { return c.status === 'surplus'; }).forEach(function (c) {
      var p = c.product, share = c.supply ? c.gap / c.supply : 0;
      var pct = share > 0.4 ? 30 : share > 0.25 ? 20 : 10;
      var price = Math.round(p.priceCents * (1 - pct / 100));
      var extra = Math.round(c.weekly * weeks * (pct / 100) * 2);
      out.push({ kind: 'discount', product: p, pct: pct, priceCents: price, qty: Math.min(c.gap, Math.max(5, extra * 2)), guard: marginGuard(p.id, price, c.gap), score: 60 + pct,
        reason: 'About ' + c.gap + ' more ' + p.title + ' than expected demand over ' + weeks + ' weeks' + (c.trendPct < -5 ? ', and demand is down ' + Math.abs(c.trendPct) + '%' : '') + '.',
        effect: 'Rough estimate: ' + pct + '% off could sell about ' + extra + ' extra units (assumes each 10% off lifts sales ~20%).' });
    });
    // 2. At-risk harvests (Harvest Rescue): a deeper discount, which often hits the floor.
    rescue.filter(function (x) { return x.level === 'urgent' || x.level === 'soon'; }).forEach(function (x) {
      var p = x.product, pct = x.level === 'urgent' ? 45 : 30;
      if (out.some(function (o) { return o.product.id === p.id && o.kind === 'discount'; })) return;
      var price = Math.round(p.priceCents * (1 - pct / 100));
      var g = marginGuard(p.id, price, x.unsold);
      out.push({ kind: 'discount', product: p, pct: pct, priceCents: price, qty: x.unlisted || x.unsold, guard: g, score: 85, untilKey: x.batch.sellBy,
        reason: x.unsold + ' unsold from the ' + shortDayLabel(x.batch.harvestDate) + ' harvest; sell by ' + shortDayLabel(x.batch.sellBy) + '.',
        effect: g.ok ? 'Clears stock before it loses value.' : 'Margin Guard blocks ' + pct + '% off — the most it allows is ' + g.maxDiscountPct + '% (' + money(g.floorCents) + '). Offer it to trade buyers instead, or list at the floor.' });
    });
    // 3. Bundle: biggest surplus crop + fastest-rising crop in stock, 10% off the pair.
    var sur = crops.filter(function (c) { return c.status === 'surplus'; }).sort(function (a, b) { return b.gap - a.gap; })[0];
    var rise = crops.filter(function (c) { return c.trendPct > 10 && c.stockKnown && c.stock > 0 && (!sur || c.product.id !== sur.product.id); })
      .sort(function (a, b) { return b.trendPct - a.trendPct; })[0];
    if (sur && rise) {
      var full = sur.product.priceCents + rise.product.priceCents, bundle = Math.round(full * 0.9);
      var cost = unitCost(sur.product.id).totalCents + unitCost(rise.product.id).totalCents;
      var floorB = Math.max(Math.ceil(cost / (1 - RULES.minMarginRate)), Math.round(full * RULES.clearanceDefaultMinRate));
      var gB = { ok: bundle >= floorB, priceCents: bundle, cost: { totalCents: cost }, marginCents: bundle - cost, marginPct: Math.round((bundle - cost) / bundle * 100),
        floorCents: floorB, maxDiscountPct: Math.max(0, Math.floor((1 - floorB / full) * 100)), reasons: bundle >= floorB ? [] : ['below the bundle floor'] };
      out.push({ kind: 'bundle', product: sur.product, partner: rise.product, pct: 10, priceCents: bundle, fullCents: full, qty: 20, guard: gB, score: 72,
        reason: 'Pairs surplus ' + sur.product.title + ' with ' + rise.product.title + ', whose demand is up ' + rise.trendPct + '% — the popular item carries the slow one.',
        effect: 'Moves ' + sur.product.title + ' without discounting it on its own.' });
    }
    // 4. Short crops: hold the price and pause promotions — no surge pricing.
    crops.filter(function (c) { return c.status === 'short'; }).slice(0, 3).forEach(function (c) {
      out.push({ kind: 'hold', product: c.product, pct: 0, priceCents: c.product.priceCents, guard: marginGuard(c.product.id, c.product.priceCents, 1), score: 40,
        reason: 'Demand is about ' + Math.abs(c.gap) + ' units above supply' + (c.trendPct > 5 ? ' (up ' + c.trendPct + '%)' : '') + '.',
        effect: 'Keep the normal price and pause discounts. Tyllage never raises prices on short supply.' });
    });
    return out.sort(function (a, b) { return b.score - a.score; });
  }
  function proposePrice(sug, actor) {
    if (sug.kind === 'hold') return { ok: false, error: 'Nothing to approve — this keeps the normal price.' };
    if (!sug.guard.ok) return { ok: false, error: 'Margin Guard blocks this price: ' + sug.guard.reasons.join('; ') + '.' };
    state.priceProposals = state.priceProposals || [];
    var dupe = state.priceProposals.some(function (pp) { return pp.status === 'pending' && pp.productId === sug.product.id && pp.kind === sug.kind; });
    if (dupe) return { ok: false, error: 'There\'s already a pending proposal for ' + sug.product.title + '.' };
    var id = nextId('PP');
    state.priceProposals.unshift({ id: id, kind: sug.kind, productId: sug.product.id, partnerId: sug.partner ? sug.partner.id : null, fromCents: sug.fullCents || sug.product.priceCents,
      toCents: sug.priceCents, qty: sug.qty || 10, untilKey: sug.untilKey || bagDayKey(new Date(Date.now() + 5 * 864e5)), reason: sug.reason, status: 'pending',
      createdBy: actor, createdAt: new Date().toISOString(), decidedBy: null });
    return { ok: true, id: id };
  }
  // Approve or reject. An approved single-item discount becomes a Buy to Clear listing (re-checked
  // by Margin Guard at that moment); bundles are recorded as approved for MEOD Fresh to publish.
  function decidePrice(id, approve, actor) {
    var pp = (state.priceProposals || []).filter(function (x) { return x.id === id; })[0];
    if (!pp || pp.status !== 'pending') return { ok: false, error: 'That proposal is no longer pending.' };
    if (pp.createdBy === actor) return { ok: false, error: 'Someone other than the proposer must approve it.' };
    if (!approve) { pp.status = 'rejected'; pp.decidedBy = actor; pp.decidedAt = new Date().toISOString(); return { ok: true, proposal: pp }; }
    if (pp.kind === 'discount') {
      var g = marginGuard(pp.productId, pp.toCents, pp.qty);
      if (!g.ok) return { ok: false, error: 'Margin Guard now blocks this price: ' + g.reasons.join('; ') + '.' };
      var p = byId('products', pp.productId);
      var qty = Math.min(pp.qty, p ? p.stock.qty : 0);
      if (!(qty > 0)) return { ok: false, error: 'No stock left to list.' };
      var r = clearanceCreate({ productId: pp.productId, qty: qty, clearancePriceCents: pp.toCents, minPriceCents: g.floorCents, reason: 'surplus', availableUntil: pp.untilKey }, actor);
      if (!r.ok) return r;
      pp.listingId = r.id;
      pp.qty = qty;
    }
    pp.status = 'approved'; pp.decidedBy = actor; pp.decidedAt = new Date().toISOString();
    return { ok: true, proposal: pp };
  }

  /* ---------- Tyllage Feedback intelligence: complaint themes traced to batches ----------
   * Every piece of feedback (delivery ratings, WhatsApp chats, support tickets, trade buyers,
   * visit surveys) is tagged with a theme by keyword rules, and linked to the harvest batch it
   * most likely came from (latest harvest of that crop on or before the delivery day). Issues
   * that share a batch — or a delivery day, for late deliveries — are grouped into patterns
   * with a likely cause. Staff decide what to do; nothing is sent automatically.
   */
  var FEEDBACK_THEMES = {
    freshness: { label: 'Freshness', owner: 'Farm & packing', tone: 'red', re: /wilt|limp|yellow|soggy|slimy|brown|rott|mushy|spoil|not fresh|bruis|went bad/ },
    late: { label: 'Late delivery', owner: 'Delivery', tone: 'amber', re: /\blate\b|delay|didn.?t arrive|never arrived|waited|after \d+ ?pm|missed (the|my) slot/ },
    missing: { label: 'Wrong or missing item', owner: 'Packing', tone: 'amber', re: /missing|wrong item|forgot|left out|not in (my|the) (order|bag|box)/ },
    packaging: { label: 'Packaging', owner: 'Packing', tone: 'blue', re: /plastic|packag|crushed|squashed|leak|torn/ },
    price: { label: 'Price', owner: 'Sales', tone: 'blue', re: /pric|expensive|cheaper|supermarket|costly/ },
    praise: { label: 'Praise', owner: 'Sales', tone: 'green', re: /fresh|love|great|delicious|crunchy|tasty|amazing|thank|best|lasted|meaty|enjoy|consistent/ }
  };
  var FEEDBACK_SOURCES = { rating: 'Delivery rating', chat: 'WhatsApp chat', ticket: 'Support ticket', b2b: 'Trade buyer', visit: 'Visit survey', call: 'Phone call', review: 'Product review' };
  var NEG_WORDS = /bad|disappoint|unhappy|poor|throw|threw|refund|not happy|complain/;
  function feedbackClassify(text, rating) {
    var t = String(text || '').toLowerCase();
    var themes = Object.keys(FEEDBACK_THEMES).filter(function (k) { return k !== 'praise' && FEEDBACK_THEMES[k].re.test(t); });
    var sentiment = rating != null ? (rating <= 2 ? 'neg' : rating >= 4 ? 'pos' : 'mixed')
      : themes.length || NEG_WORDS.test(t) ? 'neg' : FEEDBACK_THEMES.praise.re.test(t) ? 'pos' : 'mixed';
    if (!themes.length && sentiment !== 'neg' && FEEDBACK_THEMES.praise.re.test(t)) themes = ['praise'];
    if (themes.length > 1 && sentiment === 'pos') themes = themes.filter(function (k) { return k === 'price' || k === 'packaging'; }).concat(['praise']).slice(0, 2);
    return { themes: themes.length ? themes : ['other'], sentiment: sentiment };
  }
  // The batch a delivery most likely came from: the latest harvest of that crop on or before it.
  function feedbackBatchFor(productId, deliveryKey) {
    if (!productId || !deliveryKey) return null;
    return (state.batches || []).filter(function (b) { return b.productId === productId && b.status === 'harvested' && b.harvestDate <= deliveryKey; })
      .sort(function (a, b) { return a.harvestDate < b.harvestDate ? 1 : -1; })[0] || null;
  }
  function feedbackItems() {
    return (state.feedback || []).map(function (f) {
      var c = feedbackClassify(f.text, f.rating);
      var batch = f.batchId ? byId('batches', f.batchId) : feedbackBatchFor(f.productId, f.deliveryKey);
      return { f: f, themes: c.themes, theme: c.themes[0], sentiment: c.sentiment, product: f.productId ? byId('products', f.productId) : null, batch: batch };
    }).sort(function (a, b) { return a.f.at < b.f.at ? 1 : -1; });
  }
  function feedbackClusters(days) {
    var since = Date.now() - (days || 14) * 864e5;
    var groups = {};
    feedbackItems().forEach(function (x) {
      if (new Date(x.f.at).getTime() < since || x.sentiment === 'pos') return;
      x.themes.filter(function (k) { return k !== 'praise' && k !== 'other'; }).forEach(function (k) {
        var key = k === 'late' ? 'late|' + (x.f.deliveryKey || 'unknown')
          : (k === 'freshness' || k === 'missing') && x.batch ? k + '|' + x.batch.id
          : x.product && k !== 'price' && k !== 'packaging' ? k + '|p' + x.product.id : k;
        (groups[key] = groups[key] || { key: key, theme: k, items: [] }).items.push(x);
      });
    });
    var resolved = state.feedbackResolved || {};
    return Object.keys(groups).map(function (key) {
      var g = groups[key], th = FEEDBACK_THEMES[g.theme], n = g.items.length;
      var first = g.items[0];
      g.batch = first.batch && key === g.theme + '|' + first.batch.id ? first.batch : null;
      g.product = first.product;
      g.deliveryKey = g.theme === 'late' ? first.f.deliveryKey : null;
      g.pattern = n >= 2;
      g.resolved = resolved[key] || null;
      g.apologised = (state.feedbackActions || []).some(function (a) { return a.key === key && a.action === 'apology'; });
      g.owner = th.owner;
      var days = g.items.map(function (x) { return x.f.deliveryKey; }).filter(Boolean).sort();
      var dayLabel = function (k) { return parseDayKey(k).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' }); };
      if (g.theme === 'late') {
        g.title = n + ' late-delivery report' + (n > 1 ? 's' : '') + (g.deliveryKey && g.deliveryKey !== 'unknown' ? ' · ' + dayLabel(g.deliveryKey) + ' round' : '');
        g.cause = n > 1 ? 'All on the same delivery round, so it\'s likely the route or the number of drops that day rather than one driver\'s mistake. Check the route plan and slot capacity for that day.'
          : 'One report so far. Check the delivery record for that order.';
      } else if (g.batch) {
        var others = feedbackItems().filter(function (x) { return x.product && x.product.id === g.product.id && (!x.batch || x.batch.id !== g.batch.id) && x.sentiment === 'neg' && x.themes.indexOf(g.theme) > -1; }).length;
        g.title = n + ' ' + th.label.toLowerCase() + ' report' + (n > 1 ? 's' : '') + ' · ' + g.product.title + ' batch harvested ' + dayLabel(g.batch.harvestDate);
        g.cause = (n > 1 ? 'All ' + n + ' came from the same batch' : 'Traced to one batch') +
          (days.length ? ', delivered ' + (days[0] === days[days.length - 1] ? dayLabel(days[0]) : dayLabel(days[0]) + '–' + dayLabel(days[days.length - 1])) : '') + '. ' +
          (g.theme === 'freshness'
            ? (others ? others + ' other ' + g.product.title + ' complaint(s) from other batches, so check the crop too.' : 'No similar complaints about ' + g.product.title + ' from other batches, so it\'s likely how this batch was cooled, washed or packed, not the crop itself.') + ' Check the cold-room log and pack times for that harvest.'
            : 'Check the pack list for that day.');
      } else {
        g.title = n + ' ' + th.label.toLowerCase() + ' report' + (n > 1 ? 's' : '') + (g.product ? ' · ' + g.product.title : '');
        g.cause = g.theme === 'price' ? 'Customers comparing with supermarket prices. Explain what local, pesticide-free and same-day harvest means — and how buying local helps Singapore grow more of its own food by 2035 — rather than discounting.'
          : g.theme === 'packaging' ? 'Customers care about waste. Consider a plastic-free option or a "bring back your box" note.'
          : n > 1 ? 'Repeated for the same product — check how it is picked and packed.' : 'One report so far — watch for more.';
      }
      g.score = (g.pattern ? 50 : 0) + n * 10 + (g.theme === 'freshness' ? 15 : g.theme === 'late' || g.theme === 'missing' ? 10 : 0);
      return g;
    }).sort(function (a, b) { return (a.resolved ? 1 : 0) - (b.resolved ? 1 : 0) || b.score - a.score; });
  }
  // Theme counts: the last 14 days vs the 14 days before.
  function feedbackTrends() {
    var now = Date.now(), out = {};
    Object.keys(FEEDBACK_THEMES).forEach(function (k) { out[k] = { theme: k, label: FEEDBACK_THEMES[k].label, tone: FEEDBACK_THEMES[k].tone, now: 0, before: 0 }; });
    feedbackItems().forEach(function (x) {
      var age = now - new Date(x.f.at).getTime();
      x.themes.forEach(function (k) { if (!out[k]) return; if (age < 14 * 864e5) out[k].now += 1; else if (age < 28 * 864e5) out[k].before += 1; });
    });
    return Object.keys(out).map(function (k) { return out[k]; });
  }
  function feedbackAdd(f, actor) {
    if (!String(f.text || '').trim()) return { ok: false, error: 'Enter what the customer said.' };
    state.feedback = state.feedback || [];
    var batch = feedbackBatchFor(f.productId, f.deliveryKey);
    var id = nextId('FB');
    state.feedback.unshift({ id: id, source: f.source || 'chat', customerId: f.customerId || null, accountId: f.accountId || null, who: f.who || null, productId: f.productId || null,
      deliveryKey: f.deliveryKey || null, batchId: batch ? batch.id : null, rating: f.rating != null ? f.rating : null, text: String(f.text).trim().slice(0, 400), at: new Date().toISOString(), loggedBy: actor });
    return { ok: true, id: id, batch: batch };
  }
  function feedbackLog(key, action, actor, note) {
    state.feedbackActions = state.feedbackActions || [];
    state.feedbackActions.unshift({ key: key, action: action, by: actor, at: new Date().toISOString(), note: note || '' });
  }
  function feedbackResolve(key, actor, note, title) {
    state.feedbackResolved = state.feedbackResolved || {};
    state.feedbackResolved[key] = { by: actor, at: new Date().toISOString(), note: note || '', title: title || '' };
    feedbackLog(key, 'resolved', actor, note);
  }
  // Resolved issues, newest first. Reopening puts the issue back in the active list.
  function feedbackResolvedList() {
    var r = state.feedbackResolved || {};
    return Object.keys(r).map(function (k) {
      var th = FEEDBACK_THEMES[k.split('|')[0]];
      return Object.assign({ key: k, theme: k.split('|')[0], label: th ? th.label : 'Other' }, r[k]);
    }).sort(function (a, b) { return a.at < b.at ? 1 : -1; });
  }
  function feedbackReopen(key, actor) {
    if (!state.feedbackResolved || !state.feedbackResolved[key]) return { ok: false, error: 'That issue isn\'t resolved.' };
    delete state.feedbackResolved[key];
    feedbackLog(key, 'reopened', actor, '');
    return { ok: true };
  }
  function feedbackFlagBatch(batchId, theme, actor, note) {
    var b = byId('batches', batchId);
    if (!b) return { ok: false, error: 'Batch not found.' };
    b.qualityFlag = { theme: theme, by: actor, at: new Date().toISOString(), note: note || '' };
    return { ok: true, batch: b };
  }

  /* ---------- Editable AI assumptions ----------
   * The numbers the AI features rely on, editable by an admin on the Settings page. Saved
   * values live in state.aiSettings and are laid over the demo defaults in RULES whenever
   * the state loads, so every feature reads them the same way it always has. A change can
   * be previewed first: settingsImpact() applies it temporarily, measures what moves
   * (batches at risk, prices blocked, crops short or in surplus), then puts it back.
   */
  var CAT_LABELS = { 'asian-greens': 'Asian greens', lettuces: 'Lettuces', fungi: 'Mushrooms', herbs: 'Herbs' };
  var AI_SETTINGS = [
    { key: 'minMarginRate', group: 'Pricing & margins', label: 'Minimum margin', unit: '%', min: 0, max: 60, pct: true, usedBy: ['Margin Guard', 'Price Advisor'], note: 'Margin Guard blocks any price that leaves less than this after the unit cost.' },
    { key: 'clearanceDefaultMinRate', group: 'Pricing & margins', label: 'Lowest discounted price', unit: '% of normal', min: 30, max: 95, pct: true, usedBy: ['Margin Guard', 'Buy to Clear', 'Harvest Rescue'], note: 'No discount may go below this share of the normal price.' },
    { key: 'b2bPriceRate', group: 'Pricing & margins', label: 'Trade price', unit: '% of retail', min: 50, max: 100, pct: true, usedBy: ['B2B buyers'], note: 'What restaurants, cafés and offices pay for standing orders.' },
    { key: 'radarTolerance', group: 'Demand', label: 'Balanced band', unit: '± % of demand', min: 0, max: 30, pct: true, usedBy: ['Demand Radar', 'Price Advisor', 'Weekly briefing'], note: 'A gap between supply and demand within this band counts as balanced, not short or surplus.' },
    { key: 'promoLiftPer10', group: 'Demand', label: 'Sales lift per 10% off', unit: '% more sales', min: 0, max: 100, pct: true, usedBy: ['Promotion simulator', 'Price Advisor'], note: 'How much extra a 10% discount is assumed to sell. Compare with real campaign results over time.' }
  ].concat(Object.keys(CAT_LABELS).map(function (c) {
    return { key: 'shelfDays.' + c, group: 'Harvest & freshness', label: CAT_LABELS[c] + ' shelf life', unit: 'days', min: 1, max: 21, usedBy: ['Harvest Rescue', 'Price Advisor'], note: 'Days after harvest a batch should be sold by.' };
  })).concat(Object.keys(CAT_LABELS).map(function (c) {
    return { key: 'growDays.' + c, group: 'Harvest & freshness', label: CAT_LABELS[c] + ' grow time', unit: 'days', min: 5, max: 120, usedBy: ['Harvest Planner'], note: 'Typical days from sowing to harvest, used when planning new batches.' };
  })).concat([
    { key: 'visitSessionMax', group: 'Visits', label: 'Guests per session', unit: 'guests', min: 10, max: 100, usedBy: ['Visits', 'Booking form'], note: 'Bigger groups are split into several sessions.' },
    { key: 'visitSessionsPerDay', group: 'Visits', label: 'Sessions per day', unit: 'sessions', min: 1, max: 10, usedBy: ['Visits', 'Inbox'], note: 'How many visit sessions the farm can host in one day.' },
    { key: 'visitFundRate', group: 'Visits', label: 'Visit group fund', unit: '% of orders', min: 0, max: 20, pct: true, usedBy: ['Visits'], note: 'Share of a visit group\'s farm-shop orders paid back to its fund.' }
  ]);
  function rulePath(key) { var parts = key.split('.'); return parts.length === 2 ? [RULES[parts[0]], parts[1]] : [RULES, key]; }
  function ruleGet(key) { var p = rulePath(key); return p[0][p[1]]; }
  function ruleSet(key, v) { var p = rulePath(key); p[0][p[1]] = v; }
  var RULE_DEFAULTS = {};
  AI_SETTINGS.forEach(function (d) { RULE_DEFAULTS[d.key] = ruleGet(d.key); });
  function applySettings() {
    var saved = state.aiSettings || {};
    AI_SETTINGS.forEach(function (d) { ruleSet(d.key, saved[d.key] != null ? saved[d.key] : RULE_DEFAULTS[d.key]); });
    refreshSellBy();
  }
  // Sell-by dates follow the current shelf-life setting: harvest day + shelf days.
  function refreshSellBy() {
    (state.batches || []).forEach(function (b) {
      if (b.status !== 'harvested' || !b.sellBy || !b.harvestDate) return;
      var p = byId('products', b.productId);
      b.sellBy = bagDayKey(new Date(parseDayKey(b.harvestDate).getTime() + ((p && RULES.shelfDays[p.category]) || 4) * 864e5 + 12 * 36e5));
    });
  }
  // Display value (percent settings shown as whole percents) <-> stored value.
  function settingShown(d, v) { return d.pct ? Math.round(v * 1000) / 10 : v; }
  function settingStored(d, shown) { return d.pct ? Math.round(shown * 10) / 1000 : Math.round(shown); }
  function settingsList() {
    return AI_SETTINGS.map(function (d) {
      var saved = (state.aiSettings || {})[d.key];
      return Object.assign({}, d, { value: settingShown(d, ruleGet(d.key)), demo: settingShown(d, RULE_DEFAULTS[d.key]), changed: saved != null && saved !== RULE_DEFAULTS[d.key] });
    });
  }
  function settingDef(key) { return AI_SETTINGS.filter(function (d) { return d.key === key; })[0]; }
  function settingValidate(key, shown) {
    var d = settingDef(key), n = Number(shown);
    if (!d) return { ok: false, error: 'Unknown setting.' };
    if (shown === '' || shown == null || !isFinite(n)) return { ok: false, error: 'Enter a number.' };
    if (n < d.min || n > d.max) return { ok: false, error: d.label + ' must be between ' + d.min + ' and ' + d.max + '.' };
    if (!d.pct && n !== Math.round(n)) return { ok: false, error: 'Use a whole number.' };
    return { ok: true, def: d, stored: settingStored(d, n) };
  }
  function settingsMetrics() {
    var crops = radarCrops(), rescue = rescueBatches(), sugs = priceSuggestions();
    var fresh = state.products.filter(function (p) { return p.meodGrown && p.category !== 'farm-more' && !p.bagOffer; });
    return {
      atRisk: rescue.filter(function (x) { return x.level !== 'ok'; }).length,
      short: crops.filter(function (c) { return c.status === 'short'; }).length,
      surplus: crops.filter(function (c) { return c.status === 'surplus'; }).length,
      blocked: sugs.filter(function (s) { return s.kind !== 'hold' && !s.guard.ok; }).length,
      lowMargin: fresh.filter(function (p) { return !marginGuard(p.id, Math.round(p.priceCents * 0.8)).ok; }).length
    };
  }
  var METRIC_LABELS = { atRisk: ['batch at risk', 'batches at risk'], short: ['crop short', 'crops short'], surplus: ['crop in surplus', 'crops in surplus'], blocked: ['price suggestion blocked', 'price suggestions blocked'], lowMargin: ['product that can\'t take 20% off', 'products that can\'t take 20% off'] };
  // What would change if this setting were saved: measured, then rolled back.
  function settingsImpact(key, shown) {
    var v = settingValidate(key, shown);
    if (!v.ok) return { ok: false, error: v.error, lines: [] };
    var before = settingsMetrics(), old = ruleGet(key), after;
    ruleSet(key, v.stored); refreshSellBy();
    try { after = settingsMetrics(); } finally { ruleSet(key, old); refreshSellBy(); }
    var lines = Object.keys(before).filter(function (k) { return before[k] !== after[k]; }).map(function (k) {
      var d = after[k] - before[k], n = Math.abs(d);
      return (d > 0 ? n + ' more ' : n + ' fewer ') + METRIC_LABELS[k][n === 1 ? 0 : 1];
    });
    return { ok: true, lines: lines };
  }
  function settingSave(key, shown, actor) {
    var v = settingValidate(key, shown);
    if (!v.ok) return v;
    var from = ruleGet(key);
    state.aiSettings = state.aiSettings || {};
    if (v.stored === RULE_DEFAULTS[key]) delete state.aiSettings[key]; else state.aiSettings[key] = v.stored;
    applySettings();
    return { ok: true, from: settingShown(v.def, from), to: settingShown(v.def, v.stored), def: v.def };
  }
  function settingsResetAll() { state.aiSettings = {}; applySettings(); }
  function costSave(productId, c) {
    var vals = [c.growCents, c.packCents, c.handleCents];
    if (vals.some(function (x) { return !(x >= 0) || x > 100000; })) return { ok: false, error: 'Costs must be between S$0 and S$1,000.' };
    state.costs = state.costs || {};
    state.costs[productId] = { growCents: Math.round(c.growCents), packCents: Math.round(c.packCents), handleCents: Math.round(c.handleCents) };
    return { ok: true, cost: unitCost(productId) };
  }
  applySettings();

  /* ---------- Group-leader finder ----------
   * Groups customers by neighbourhood and finds areas with several regular buyers but no
   * group-buy leader. For each, it suggests the customer most likely to make a good leader:
   * opted in to messages, orders often, and has bought through a group buy before. Staff send
   * the invite; nothing is sent automatically. Areas are demo values (in production: the
   * postal district from the delivery address, never the full address).
   */
  function leaderFinder() {
    var since = Date.now() - 60 * 864e5;
    var covered = {};
    state.leaders.filter(function (l) { return l.kind !== 'visit'; }).forEach(function (l) {
      var open = state.events.some(function (e) { return e.leaderId === l.id && e.status === 'open'; });
      covered[l.area] = { leader: l, open: open };
    });
    var areas = {};
    state.customers.forEach(function (c) {
      if (!c.area) return;
      var orders = state.orders.filter(function (o) { return o.customerId === c.id && o.status !== 'cancelled' && o.status !== 'refunded'; });
      var recent = orders.filter(function (o) { return new Date(o.createdAt).getTime() > since; });
      var a = areas[c.area] = areas[c.area] || { area: c.area, customers: [], recentCents: 0, recentOrders: 0 };
      var spend = recent.reduce(function (s, o) { return s + (o.totalCents || 0); }, 0);
      a.customers.push({ customer: c, orders: orders.length, recent: recent.length, spendCents: spend, groupOrders: orders.filter(function (o) { return o.groupEventId; }).length });
      a.recentCents += spend; a.recentOrders += recent.length;
    });
    var invites = state.leaderInvites || [];
    return Object.keys(areas).map(function (k) {
      var a = areas[k];
      a.covered = covered[k] || null;
      a.active = a.customers.filter(function (x) { return x.recent > 0; }).length;
      var cands = a.customers.filter(function (x) { return x.customer.consentMarketing && x.orders >= 2; }).map(function (x) {
        var why = [x.orders + ' orders'];
        if (x.groupOrders) why.push('has joined a group buy before');
        if (x.recent >= 2) why.push('ordered ' + x.recent + ' times in 60 days');
        return Object.assign({ score: x.orders * 2 + x.recent * 2 + x.groupOrders * 3 + x.spendCents / 2000, why: why }, x);
      }).sort(function (p, q) { return q.score - p.score; });
      a.candidate = cands[0] || null;
      a.invite = a.candidate ? invites.filter(function (i) { return i.customerId === a.candidate.customer.id; })[0] || null : null;
      // Rough monthly estimate: neighbours' spend over 60 days, halved, with the group discount
      // for members and the leader's commission on it.
      var monthly = Math.round(a.recentCents / 2);
      a.estimate = { monthlyCents: monthly, memberSavingCents: Math.round(monthly * RULES.groupDiscountRate), commissionCents: Math.round(monthly * (1 - RULES.groupDiscountRate) * RULES.commissionRate) };
      a.suggest = !a.covered && a.active >= 3 && !!a.candidate;
      return a;
    }).sort(function (p, q) { return (q.suggest ? 1 : 0) - (p.suggest ? 1 : 0) || q.active - p.active || q.recentCents - p.recentCents; });
  }
  function leaderInvite(customerId, area, channel, actor) {
    state.leaderInvites = state.leaderInvites || [];
    if (state.leaderInvites.some(function (i) { return i.customerId === customerId; })) return { ok: false, error: 'Already invited.' };
    state.leaderInvites.unshift({ customerId: customerId, area: area, channel: channel, by: actor, at: new Date().toISOString(), status: 'invited' });
    return { ok: true };
  }

  /* ---------- Tyllage Lost Demand Intelligence ----------
   * Demand that never became a sale: enquiries MEOD couldn't fill ("20 bunches of basil on
   * Tuesday?"), "Notify me" taps on sold-out products, and requests for crops MEOD doesn't
   * grow. Grouped per crop with a reason, so staff can tell weak demand from "we ran out".
   * Quantities are what the person asked for; nothing here is counted as a sale.
   */
  var LOST_SOURCES = { enquiry: 'Enquiry', soldout: 'Sold-out tap', b2b: 'Trade buyer', chat: 'WhatsApp / chat', phone: 'Phone', visit: 'At the farm' };
  var LOST_REASONS = { ranout: ['Ran out', 'red'], notgrown: ['Not grown', 'blue'], quantity: ['More than we had', 'amber'], timing: ['Wrong day', 'amber'] };
  function lostList(days) {
    var since = Date.now() - (days || 30) * 864e5;
    return (state.lostDemand || []).filter(function (x) { return new Date(x.at).getTime() > since; })
      .sort(function (a, b) { return a.at < b.at ? 1 : -1; });
  }
  function lostAdd(x, actor) {
    var qty = Math.round(Number(x.qty) || 1);
    if (!x.productId && !String(x.cropName || '').trim()) return { ok: false, error: 'Pick a product or type the crop they asked for.' };
    if (qty < 1 || qty > 10000) return { ok: false, error: 'Enter how many they wanted.' };
    state.lostDemand = state.lostDemand || [];
    // One "Notify me" per customer per product is enough.
    if (x.source === 'soldout' && state.lostDemand.some(function (d) { return d.source === 'soldout' && d.status === 'open' && d.productId === x.productId && d.customerId && d.customerId === x.customerId; })) {
      return { ok: true, dupe: true };
    }
    var p = x.productId ? byId('products', x.productId) : null;
    var id = nextId('LD');
    state.lostDemand.unshift({ id: id, source: x.source || 'enquiry', reason: x.reason || (p ? (stockStatus(p).qty === 0 ? 'ranout' : 'quantity') : 'notgrown'),
      productId: p ? p.id : null, cropName: p ? p.title : String(x.cropName).trim().slice(0, 40), qty: qty, wantedKey: x.wantedKey || null,
      customerId: x.customerId || null, accountId: x.accountId || null, who: x.who || null, note: String(x.note || '').slice(0, 200),
      notify: !!x.notify, status: 'open', at: new Date().toISOString(), by: actor || null });
    return { ok: true, id: id };
  }
  function lostResolve(id, status, actor) {
    var x = (state.lostDemand || []).filter(function (d) { return d.id === id; })[0];
    if (!x) return { ok: false, error: 'Not found.' };
    x.status = status; x.resolvedBy = actor; x.resolvedAt = new Date().toISOString();
    return { ok: true };
  }
  // Per crop: how much was asked for and not sold, why, and what to do about it.
  function lostInsights(days) {
    var open = lostList(days || 30).filter(function (x) { return x.status === 'open'; });
    var groups = {};
    open.forEach(function (x) {
      var key = x.productId || 'name:' + x.cropName.toLowerCase();
      var g = groups[key] = groups[key] || { key: key, product: x.productId ? byId('products', x.productId) : null, name: x.cropName, items: [], units: 0, reasons: {}, people: {} };
      g.items.push(x); g.units += x.qty; g.reasons[x.reason] = (g.reasons[x.reason] || 0) + 1;
      g.people[x.customerId || x.accountId || x.who || x.id] = true;
    });
    var crops = radarCrops();
    return Object.keys(groups).map(function (k) {
      var g = groups[k];
      g.requests = g.items.length; g.peopleCount = Object.keys(g.people).length;
      g.reason = Object.keys(g.reasons).sort(function (a, b) { return g.reasons[b] - g.reasons[a]; })[0];
      g.valueCents = g.product ? g.units * g.product.priceCents : 0;
      g.notifyCount = g.items.filter(function (x) { return x.notify && (x.customerId || x.accountId); }).length;
      var c = g.product ? crops.filter(function (r) { return r.product.id === g.product.id; })[0] : null;
      g.radar = c || null;
      if (!g.product) {
        g.verdict = g.peopleCount >= 3 ? 'Worth a trial' : 'Keep watching';
        g.why = g.peopleCount + ' different ' + (g.peopleCount === 1 ? 'person' : 'people') + ' asked for ' + g.name + ', which MEOD doesn\'t grow. ' +
          (g.peopleCount >= 3 ? 'Enough interest to consider a small trial batch.' : 'Not enough yet to plan around.');
      } else if (g.reason === 'ranout' || g.reason === 'quantity') {
        var weekly = c ? c.weekly : 0;
        g.verdict = 'Demand is there';
        g.why = g.units + ' ' + g.product.title + ' asked for while ' + (g.reason === 'ranout' ? 'sold out' : 'we didn\'t have enough') + ' — that\'s ' +
          (weekly ? Math.round(g.units / weekly * 100) + '% on top of normal weekly sales' : 'on top of recorded sales') + '. ' +
          (c && c.status === 'short' ? 'Demand Radar already shows it short: sow another batch.' : 'Recorded sales understate demand: plan a bigger batch or open pre-orders.');
      } else {
        g.verdict = 'Timing';
        g.why = 'Wanted on days MEOD couldn\'t deliver or harvest. Consider pre-orders for those dates or a standing order.';
      }
      g.score = g.units + g.peopleCount * 5 + (g.product ? 10 : 0);
      return g;
    }).sort(function (a, b) { return b.score - a.score; });
  }
  function lostUnitsFor(productId, days) {
    return lostList(days || 28).filter(function (x) { return x.status === 'open' && x.productId === productId; }).reduce(function (s, x) { return s + x.qty; }, 0);
  }

  /* ---------- Tyllage Harvest Allocation Advisor ----------
   * For each harvest due in the next 10 days: split the expected yield across confirmed trade
   * orders, pre-orders, likely group-buy demand and normal shop sales until the next harvest,
   * and show what's left unallocated (or short) — before anything is discounted. Priority when
   * short: confirmed trade orders, then pre-orders, then group buys, then the shop.
   */
  function allocationPlan(days) {
    var until = Date.now() + (days || 10) * 864e5;
    var crops = radarCrops();
    var since28 = Date.now() - 28 * 864e5;
    return batchesUpcoming().filter(function (b) { return parseDayKey(b.harvestDate).getTime() <= until; }).map(function (b) {
      var p = byId('products', b.productId);
      var c = crops.filter(function (r) { return r.product.id === b.productId; })[0] || {};
      var next = batchesUpcoming().filter(function (x) { return x.productId === b.productId && x.harvestDate > b.harvestDate; })[0];
      var coverDays = next ? Math.max(2, Math.round((parseDayKey(next.harvestDate) - parseDayKey(b.harvestDate)) / 864e5)) : 7;
      var hk = b.harvestDate, endKey = bagDayKey(new Date(parseDayKey(hk).getTime() + coverDays * 864e5));
      var inWindow = b2bStore().orders.filter(function (o) { return o.status !== 'cancelled' && o.deliveryDay >= hk && o.deliveryDay < endKey; });
      var b2b = inWindow.filter(function (o) { return o.status === 'confirmed'; })
        .reduce(function (s, o) { return s + o.items.reduce(function (t, i) { return t + (i.productId === b.productId ? i.qty : 0); }, 0); }, 0);
      // Plus standing orders not placed yet, from active accounts (delivered in the last 3 weeks).
      var recentCut = bagDayKey(new Date(Date.now() - 21 * 864e5));
      b2bStore().accounts.forEach(function (a) {
        var active = b2bStore().orders.some(function (o) { return o.accountId === a.id && o.status === 'delivered' && o.deliveryDay >= recentCut; });
        var usual = (a.usual || []).filter(function (u) { return u.productId === b.productId; })[0];
        if (!active || !usual) return;
        for (var d = parseDayKey(hk); bagDayKey(d) < endKey; d = new Date(d.getTime() + 864e5)) {
          var key = bagDayKey(d);
          if ((a.standingDays || []).indexOf(d.getDay()) > -1 && !inWindow.some(function (o) { return o.accountId === a.id && o.deliveryDay === key; })) b2b += usual.qty;
        }
      });
      var pre = batchPreordered(b);
      var groupWeekly = state.orders.filter(function (o) { return o.groupEventId && o.status !== 'cancelled' && new Date(o.createdAt).getTime() > since28; })
        .reduce(function (s, o) { return s + o.items.reduce(function (t, i) { return t + (i.productId === b.productId ? i.qty : 0); }, 0); }, 0) / 4;
      var openGroups = state.events.filter(function (e) { return e.status === 'open' && e.kind !== 'visit'; }).length;
      var group = openGroups ? Math.round(groupWeekly * coverDays / 7) : 0;
      var shop = Math.round((c.weekly || 0) * coverDays / 7);
      var supply = b.expectedQty;
      // Allocate in priority order; anything left is unallocated, anything missing is short.
      var left = supply, alloc = {};
      [['b2b', b2b], ['preorder', pre], ['group', group], ['shop', shop]].forEach(function (x) { alloc[x[0]] = Math.min(left, x[1]); left -= alloc[x[0]]; });
      var wanted = b2b + pre + group + shop;
      var unallocated = Math.max(0, supply - wanted), shortBy = Math.max(0, wanted - supply);
      var lost = lostUnitsFor(b.productId);
      var buyers = b2bStore().accounts.filter(function (a) { return (a.usual || []).some(function (u) { var up = byId('products', u.productId); return up && p && up.category === p.category; }); });
      var options = [];
      if (unallocated > 0) {
        if (lost) options.push({ key: 'lost', title: 'Tell the ' + lost + ' unit(s) of lost demand', why: 'People asked for ' + p.title + ' while it was sold out — offer it to them first, at full price.' });
        if (buyers.length) options.push({ key: 'b2b', title: 'Offer to ' + buyers.length + ' trade buyer(s)', why: 'Restaurants and cafés that already buy ' + CATEGORIES[p.category].label.toLowerCase() + ' — trade price, one delivery.', accountId: buyers[0].id });
        if (batchOpen(b)) options.push({ key: 'preorder', title: 'Push pre-orders', why: 'Pre-orders are still open until the night before harvest.' });
        options.push({ key: 'bundle', title: 'Bundle or promote', why: 'Compare options in the Promotion Impact Simulator before discounting.' });
        if (unallocated > supply * 0.25) options.push({ key: 'smaller', title: 'Harvest less, leave the rest growing', why: 'If the crop can wait, pick only what\'s needed.' });
      } else if (shortBy > 0) {
        options.push({ key: 'short', title: 'Short by ' + shortBy + ': serve in priority order', why: 'Confirmed trade orders and pre-orders first, then group buys, then the shop. Pause promotions on ' + p.title + '.' });
      }
      return { batch: b, product: p, supply: supply, coverDays: coverDays, alloc: alloc, wanted: { b2b: b2b, preorder: pre, group: group, shop: shop },
        unallocated: unallocated, shortBy: shortBy, lost: lost, options: options, weekly: c.weekly || 0 };
    }).sort(function (a, b) { return a.batch.harvestDate < b.batch.harvestDate ? -1 : 1; });
  }

  /* ---------- Tyllage Promotion Impact Simulator ----------
   * Before MEOD runs a promotion, compare options side by side over the selling window:
   * units sold, revenue, contribution margin (revenue minus unit cost of what sells), what's
   * left unsold and its value. Simple, stated assumptions — each 10% off lifts sales by
   * RULES.promoLiftPer10 — so staff can see why one option beats another, and change them.
   */
  function promoSimulate(productId, opts) {
    opts = opts || {};
    var p = byId('products', productId);
    if (!p) return null;
    var c = radarCrops().filter(function (r) { return r.product.id === productId; })[0] || { weekly: weeklySales(productId), stock: p.stock.qty, supply: p.stock.qty, trendPct: 0 };
    var weeks = opts.weeks || 2;
    var avail = opts.units != null ? opts.units : Math.max(0, Math.round(c.stock + (c.harvest || 0) * weeks / RADAR_WEEKS));
    var base = Math.max(0.5, c.weekly) * weeks;
    var lift = opts.lift != null ? opts.lift : RULES.promoLiftPer10;
    var cost = unitCost(productId).totalCents;
    var price = p.priceCents;
    function scenario(key, label, unitPrice, demand, extra) {
      var sold = Math.min(avail, Math.round(demand));
      var revenue = sold * unitPrice + (extra ? extra.revenue : 0);
      var soldAll = sold + (extra ? extra.units : 0);
      var margin = revenue - soldAll * cost - (extra ? extra.costCents || 0 : 0);
      var guard = unitPrice < price ? marginGuard(productId, unitPrice) : { ok: true };
      return { key: key, label: label, unitPrice: unitPrice, sold: soldAll, revenue: revenue, margin: margin, unsold: Math.max(0, avail - soldAll), unsoldValue: Math.max(0, avail - soldAll) * price,
        blocked: !guard.ok, guard: guard, note: extra && extra.note };
    }
    var out = [];
    out.push(scenario('none', 'No promotion', price, base, null));
    var pct = opts.pct || 10;
    out.push(scenario('discount', pct + '% off', Math.round(price * (1 - pct / 100)), base * (1 + lift * pct / 10), null));
    // Bundle: pair with the fastest-rising crop; a share of its buyers take the bundle.
    var rise = radarCrops().filter(function (r) { return r.product.id !== productId && r.trendPct > 0 && r.stock > 0; }).sort(function (a, b) { return b.trendPct - a.trendPct; })[0];
    if (rise) {
      var take = Math.round(rise.weekly * weeks * (opts.bundleTake != null ? opts.bundleTake : 0.3));
      var bundlePrice = Math.round((price + rise.product.priceCents) * 0.9);
      var bundleUnits = Math.min(take, Math.max(0, avail - Math.round(base)));
      var s = scenario('bundle', 'Bundle with ' + rise.product.title, price, base, {
        units: bundleUnits, revenue: bundleUnits * bundlePrice - bundleUnits * rise.product.priceCents, costCents: 0,
        note: bundleUnits + ' bundles at ' + money(bundlePrice) + ' (10% off the pair); ' + rise.product.title + ' sells at full price inside the bundle' });
      s.partner = rise.product;
      out.push(s);
    }
    // Bulk buyer: one trade buyer takes a block at the trade price.
    var bulkQty = Math.min(avail, opts.bulkQty != null ? opts.bulkQty : Math.max(5, Math.round((avail - base) * 0.6)));
    var tradePrice = Math.round(price * RULES.b2bPriceRate);
    out.push(scenario('bulk', 'Bulk trade offer', price, Math.min(base, avail - bulkQty), {
      units: bulkQty, revenue: bulkQty * tradePrice, costCents: -bulkQty * 22, // no retail packaging for a bulk crate
      note: bulkQty + ' units to one trade buyer at ' + money(tradePrice) + ' (' + Math.round(RULES.b2bPriceRate * 100) + '% of retail), no retail packaging' }));
    // Best = highest margin that Margin Guard allows; fewer units left unsold breaks a tie.
    var best = out.filter(function (x) { return !x.blocked; }).sort(function (a, b) { return b.margin - a.margin || a.unsold - b.unsold; })[0];
    out.forEach(function (x) { x.best = x === best; });
    return { product: p, avail: avail, base: Math.round(base), weeks: weeks, lift: lift, cost: cost, scenarios: out,
      assumptions: [
        'Normal sales: ' + (Math.round(c.weekly * 10) / 10) + ' a week (Demand Radar), so about ' + Math.round(base) + ' over ' + weeks + ' weeks.',
        'Available to sell: ' + avail + ' (stock plus the share of upcoming harvests in this window).',
        'Each 10% off lifts sales by about ' + Math.round(lift * 100) + '% (illustrative — MEOD can change it in Settings).',
        'Unit cost ' + money(cost) + ' (Settings → Unit costs). Margin = revenue − unit cost of everything sold.',
        'Anything unsold at the end is shown at its full-price value — the cost of doing nothing.'
      ] };
  }

  /* ---------- Data import (Excel / CSV) ----------
   * MEOD keeps sales and harvest records in spreadsheets. Staff upload one (CSV, or .xlsx
   * read in the browser), the columns are matched by name ("Item", "Product", "SKU" →
   * product; "Qty", "Units" → quantity…) and product names are matched to the catalogue,
   * including aliases. Staff see a preview and what didn't match before importing.
   */
  var IMPORT_KINDS = {
    sales: { label: 'Sales records', cols: { date: /^(date|day|order date|sold on)/, product: /^(product|item|sku|vegetable|crop|name)/, qty: /^(qty|quantity|units|bunches|packs|sold)/, price: /^(price|unit price|amount|total)/, channel: /^(channel|source|store)/ }, need: ['date', 'product', 'qty'] },
    harvest: { label: 'Harvest records', cols: { product: /^(product|item|crop|vegetable|name)/, sow: /^(sow|sown|planted|seed)/, harvest: /^(harvest|harvested|ready|pick)/, expected: /^(expected|plan|planned|forecast)/, actual: /^(actual|yield|harvested qty|picked)/ }, need: ['product', 'harvest'] }
  };
  function parseCsv(text) {
    var rows = [], row = [], cell = '', q = false;
    text = String(text || '').replace(/^﻿/, '');
    var delim = (text.split('\n')[0].match(/\t/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? '\t' : ',';
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim(); }); });
  }
  function matchProduct(name) {
    var n = String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!n) return null;
    return state.products.filter(function (p) {
      return p.title.toLowerCase() === n || (p.subtitle || '').toLowerCase() === n || (p.aliases || []).some(function (a) { return a.toLowerCase() === n; });
    })[0] || state.products.filter(function (p) { return n.indexOf(p.title.toLowerCase()) > -1 || p.title.toLowerCase().indexOf(n) > -1; })[0] || null;
  }
  function parseDateCell(v) {
    var s = String(v || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/); // Singapore style: day/month/year
    if (m) { var y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2); }
    if (/^\d{5}$/.test(s)) return bagDayKey(new Date(Date.UTC(1899, 11, 30) + Number(s) * 864e5)); // Excel serial date
    var d = new Date(s);
    return isNaN(d) ? null : bagDayKey(d);
  }
  function importPreview(kind, rows) {
    var K = IMPORT_KINDS[kind];
    if (!rows.length) return { ok: false, error: 'The file is empty.' };
    var head = rows[0].map(function (h) { return String(h).toLowerCase().trim(); });
    var map = {};
    Object.keys(K.cols).forEach(function (k) { var i = head.findIndex(function (h) { return K.cols[k].test(h); }); if (i > -1) map[k] = i; });
    var missing = K.need.filter(function (k) { return map[k] == null; });
    if (missing.length) return { ok: false, error: 'Couldn\'t find a column for: ' + missing.join(', ') + '. Headers found: ' + rows[0].join(', ') + '.', map: map };
    var good = [], bad = [];
    rows.slice(1).forEach(function (r, idx) {
      var get = function (k) { return map[k] != null ? r[map[k]] : ''; };
      var p = matchProduct(get('product'));
      var rec = { line: idx + 2, raw: r, product: p };
      if (kind === 'sales') {
        rec.date = parseDateCell(get('date')); rec.qty = Math.round(Number(String(get('qty')).replace(/[^\d.\-]/g, '')));
        rec.priceCents = map.price != null ? Math.round(Number(String(get('price')).replace(/[^\d.]/g, '')) * 100) || null : null; rec.channel = get('channel') || 'import';
        rec.error = !p ? 'Unknown product "' + get('product') + '"' : !rec.date ? 'Bad date' : !(rec.qty > 0) ? 'Bad quantity' : null;
      } else {
        rec.harvest = parseDateCell(get('harvest')); rec.sow = map.sow != null ? parseDateCell(get('sow')) : null;
        rec.expected = Math.round(Number(get('expected')) || 0); rec.actual = map.actual != null && String(get('actual')).trim() !== '' ? Math.round(Number(get('actual'))) : null;
        rec.error = !p ? 'Unknown product "' + get('product') + '"' : !rec.harvest ? 'Bad harvest date' : !(rec.expected > 0 || rec.actual > 0) ? 'No quantity' : null;
      }
      (rec.error ? bad : good).push(rec);
    });
    return { ok: true, kind: kind, map: map, headers: rows[0], good: good, bad: bad };
  }
  function importApply(preview, actor, fileName) {
    var n = 0;
    if (preview.kind === 'sales') {
      // Imported sales go into the weekly history Demand Radar reads (last 8 weeks).
      state.salesHistory = state.salesHistory || { source: 'import', weeks: 8, byProduct: {} };
      var now = new Date(); now.setHours(0, 0, 0, 0);
      preview.good.forEach(function (r) {
        var ago = Math.floor((now - parseDayKey(r.date)) / (7 * 864e5));
        if (ago < 0 || ago > 7) return;
        var arr = state.salesHistory.byProduct[r.product.id] = state.salesHistory.byProduct[r.product.id] || [0, 0, 0, 0, 0, 0, 0, 0];
        arr[7 - ago] += r.qty; n++;
      });
    } else {
      preview.good.forEach(function (r) {
        var p = r.product, id = nextId('HB');
        var done = r.actual != null && parseDayKey(r.harvest) <= new Date();
        state.batches.push({ id: id, productId: p.id, sowDate: r.sow || bagDayKey(new Date(parseDayKey(r.harvest).getTime() - (RULES.growDays[p.category] || 30) * 864e5)), harvestDate: r.harvest,
          expectedQty: r.expected || r.actual, preorderCap: done ? 0 : Math.round((r.expected || 0) * RULES.preorderDefaultShare), preorderPriceCents: p.priceCents,
          status: done ? 'harvested' : 'planned', actualQty: done ? r.actual : undefined, toStock: done ? 0 : undefined, harvestedAt: done ? parseDayKey(r.harvest).toISOString() : undefined,
          createdBy: actor, createdAt: new Date().toISOString(), source: 'import' });
        n++;
      });
    }
    state.imports = state.imports || [];
    state.imports.unshift({ kind: preview.kind, file: fileName || 'upload', rows: n, skipped: preview.bad.length, by: actor, at: new Date().toISOString() });
    return { ok: true, rows: n };
  }
  function importTemplate(kind) {
    var today = new Date();
    var d = function (n) { var x = new Date(today.getTime() - n * 864e5); return ('0' + x.getDate()).slice(-2) + '/' + ('0' + (x.getMonth() + 1)).slice(-2) + '/' + x.getFullYear(); };
    return kind === 'sales'
      ? 'Date,Product,Qty,Price,Channel\n' + d(3) + ',Xiao Bai Cai,12,3.50,Farm shop\n' + d(3) + ',Kai Lan,8,4.00,Farm shop\n' + d(10) + ',Bok Choy,15,3.50,Market\n'
      : 'Product,Sow date,Harvest date,Expected qty,Actual qty\nKangkong,' + d(20) + ',' + d(-10) + ',40,\nCos Lettuce,' + d(45) + ',' + d(5) + ',30,27\n';
  }

  /* ---------- Pilot baseline metrics ----------
   * The numbers a real pilot with MEOD would track, measured from the prototype's own
   * records: enquiry-to-order conversion, sell-through, unsold units, campaign margin, lost
   * demand and staff time saved by drafts. "Record baseline" stores today's figures, so later
   * figures can be compared against them.
   */
  var DRAFT_MINUTES = { 'campaign.submitted': 15, 'booking.replied': 10, 'b2b.contacted': 8, 'content.planned': 20, 'feedback.apology': 8, 'briefing.sent': 30, 'groupbuy.invited': 8, 'rescue.alert': 12, 'pricing.proposed': 10 };
  function pilotMetrics(days) {
    days = days || 30;
    var since = Date.now() - days * 864e5;
    var inWin = function (iso) { return new Date(iso).getTime() > since; };
    var bookings = state.bookings.filter(function (b) { return inWin(b.createdAt); });
    var lost = (state.lostDemand || []).filter(function (x) { return inWin(x.at); });
    // Enquiries = visit requests plus asks a person made to staff; sold-out taps and requests
    // for crops MEOD doesn't grow aren't enquiries staff could convert.
    var asks = lost.filter(function (x) { return x.source !== 'soldout' && x.reason !== 'notgrown'; });
    var enquiries = bookings.length + asks.length;
    var converted = bookings.filter(function (b) { return b.status === 'confirmed'; }).length + asks.filter(function (x) { return x.status === 'fulfilled'; }).length;
    var harvested = state.batches.filter(function (b) { return b.status === 'harvested' && b.harvestedAt && inWin(b.harvestedAt); });
    var harvestedUnits = harvested.reduce(function (s, b) { return s + (b.actualQty || 0); }, 0);
    var unsold = rescueBatches().reduce(function (s, x) { return s + (x.level === 'expired' ? x.unsold : 0); }, 0) +
      (state.rescueLog || []).filter(function (r) { return inWin(r.at) && r.action === 'compost'; }).reduce(function (s, r) { return s + r.qty; }, 0);
    var sellThrough = harvestedUnits ? Math.max(0, Math.round((harvestedUnits - unsold) / harvestedUnits * 100)) : null;
    // Campaign margin: orders for the campaign's product by its recipients within 7 days of sending.
    var camps = state.campaigns.filter(function (c) { return c.status === 'sent' && inWin(c.sentAt || c.createdAt); });
    var campRevenue = 0, campMargin = 0;
    camps.forEach(function (c) {
      var t0 = new Date(c.sentAt || c.createdAt).getTime();
      state.orders.forEach(function (o) {
        var t = new Date(o.createdAt).getTime();
        if (t < t0 || t > t0 + 7 * 864e5 || (c.audience || []).indexOf(o.customerId) < 0) return;
        o.items.forEach(function (i) { if (i.productId === c.productId) { campRevenue += i.qty * i.priceCents; campMargin += i.qty * (i.priceCents - unitCost(i.productId).totalCents); } });
      });
    });
    var minutes = state.audit.filter(function (a) { return inWin(a.at) && DRAFT_MINUTES[a.event]; }).reduce(function (s, a) { return s + DRAFT_MINUTES[a.event]; }, 0);
    var lostUnits = lost.filter(function (x) { return x.status === 'open'; }).reduce(function (s, x) { return s + x.qty; }, 0);
    return {
      days: days,
      conversion: enquiries ? Math.round(converted / enquiries * 100) : null, enquiries: enquiries, converted: converted,
      sellThrough: sellThrough, harvestedUnits: harvestedUnits, unsold: unsold,
      campaigns: camps.length, campRevenueCents: campRevenue, campMarginCents: campMargin,
      lostUnits: lostUnits, minutesSaved: minutes
    };
  }
  function pilotRecordBaseline(actor, note) {
    state.pilotBaselines = state.pilotBaselines || [];
    var m = pilotMetrics(30);
    state.pilotBaselines.unshift(Object.assign({ at: new Date().toISOString(), by: actor, note: note || '' }, m));
    return { ok: true, baseline: state.pilotBaselines[0] };
  }

  /* ---------- Tyllage Harvest Rescue: sell-by deadlines per harvested batch ----------
   * Each recorded harvest gets a sell-by date (harvest day + the category's shelf days). Unsold
   * units are estimated first-in-first-out: what went into stock, minus regular sales of that
   * product since the harvest, capped by stock on hand. Anything already on Buy to Clear is
   * shown separately. Rescue actions are suggestions; MEOD staff decide what's fit to sell,
   * and every outcome (listed, offered, alerted, processed, donated, composted) is logged.
   */
  function rescueBatches() {
    var now = Date.now();
    return state.batches.filter(function (b) { return b.status === 'harvested' && b.sellBy && (b.toStock || 0) > 0; }).map(function (b) {
      var p = byId('products', b.productId);
      if (!p) return null;
      var harvested = new Date(b.harvestedAt || parseDayKey(b.harvestDate)).getTime();
      var sold = 0;
      state.orders.forEach(function (o) {
        if (o.status === 'cancelled' || new Date(o.createdAt).getTime() < harvested) return;
        o.items.forEach(function (i) { if (i.productId === p.id && !i.preorderBatchId) sold += i.qty; });
      });
      var logged = (state.rescueLog || []).filter(function (r) { return r.batchId === b.id && r.removesStock; }).reduce(function (s, r) { return s + r.qty; }, 0);
      // Every active Buy to Clear listing for this product counts (there can be more than one).
      var listings = clearanceListActive().filter(function (l) { return l.productId === p.id; });
      var listing = listings[0] || null;
      var onClear = listings.reduce(function (s, l) { return s + clearanceRemaining(l); }, 0);
      var st = stockStatus(p);
      var stock = st.known ? Math.max(0, p.stock.qty) : 0;
      var unsold = Math.max(0, Math.min(stock, b.toStock - sold - logged));
      var sellBy = parseDayKey(b.sellBy).getTime();
      var today0 = new Date(); today0.setHours(0, 0, 0, 0);
      var daysLeft = Math.round((sellBy - today0.getTime()) / 864e5);
      var shelf = Math.max(1, Math.round((sellBy - harvested) / 864e5));
      var level = unsold <= 0 ? 'clear' : daysLeft < 0 ? 'expired' : daysLeft <= 1 ? 'urgent' : daysLeft <= 2 ? 'soon' : 'ok';
      return {
        batch: b, product: p, unsold: unsold, sold: sold, onClear: onClear, unlisted: Math.max(0, unsold - onClear), listing: listing,
        daysLeft: daysLeft, shelf: shelf, elapsedPct: Math.max(0, Math.min(100, Math.round((now - harvested) / (sellBy + 864e5 - harvested) * 100))),
        valueCents: unsold * p.priceCents, level: level, stockKnown: st.known
      };
    }).filter(function (x) { return x && x.level !== 'clear' && x.daysLeft >= -3; })
      .sort(function (a, b) { return a.daysLeft - b.daysLeft || b.valueCents - a.valueCents; });
  }
  // Ranked rescue options for one at-risk batch, with a reason for each.
  var PROCESS_INTO = { herbs: 'Farm Pesto', 'asian-greens': 'Vege Powder', lettuces: null, fungi: 'Vege Powder' };
  function rescueOptions(x) {
    var opts = [];
    var buyers = b2bStore().accounts.filter(function (a) {
      return a.status === 'active' && a.usual.some(function (u) { var p = byId('products', u.productId); return p && p.category === x.product.category; });
    });
    var optedBuyers = 0, seen = {};
    state.orders.forEach(function (o) { o.items.forEach(function (i) { var p = byId('products', i.productId); if (p && p.category === x.product.category) seen[o.customerId] = true; }); });
    Object.keys(seen).forEach(function (id) { var c = byId('customers', id); if (c && c.consentMarketing) optedBuyers++; });
    if (x.level === 'expired') {
      opts.push({ key: 'check', score: 100, title: 'Check quality before selling', why: 'Past its sell-by date. MEOD staff decide if it\'s still fit to sell; if not, record it as donated or composted.' });
    }
    if (buyers.length && x.daysLeft >= 1) {
      opts.push({ key: 'b2b', score: 80 + x.daysLeft * 4, title: 'Offer to ' + buyers.length + ' trade buyer(s)', why: buyers.map(function (a) { return a.name.replace(/\s*\(demo\)/i, ''); }).slice(0, 2).join(', ') + ' already buy ' + CATEGORIES[x.product.category].label.toLowerCase() + ' — a full-price sale, no discount needed.', accountIds: buyers.map(function (a) { return a.id; }) });
    }
    if (x.unlisted > 0 && x.daysLeft >= 0) {
      var price = Math.round(x.product.priceCents * 0.7), min = Math.round(x.product.priceCents * RULES.clearanceDefaultMinRate);
      opts.push({ key: 'clear', score: x.daysLeft <= 1 ? 90 : 60, title: 'List ' + x.unlisted + ' on Buy to Clear at ' + money(price), why: '30% off, above the ' + money(min) + ' minimum, until the sell-by date. It also goes into Surprise Harvest Bags.', priceCents: price, minCents: min });
    }
    if (optedBuyers && x.daysLeft >= 0) {
      opts.push({ key: 'alert', score: 70 - x.daysLeft, title: 'Alert ' + optedBuyers + ' opted-in customer(s)', why: 'People who bought ' + CATEGORIES[x.product.category].label.toLowerCase() + ' before and agreed to messages. Drafted for admin approval.' });
    }
    if (PROCESS_INTO[x.product.category] && x.unsold >= 8) {
      opts.push({ key: 'process', score: 50, title: 'Turn into ' + PROCESS_INTO[x.product.category], why: 'Larger leftovers can go into the kitchen for MEOD\'s own products instead of discounting.' });
    }
    return opts.sort(function (a, b) { return b.score - a.score; });
  }
  function rescueLogOutcome(batchId, action, qty, valueCents, actor, note) {
    state.rescueLog = state.rescueLog || [];
    // Processed / donated / composted take units out of sellable stock; offers and alerts don't.
    var removes = ['process', 'donate', 'compost'].indexOf(action) > -1;
    var b = byId('batches', batchId), p = b && byId('products', b.productId);
    if (removes && p) p.stock.qty = Math.max(0, p.stock.qty - qty);
    state.rescueLog.unshift({ id: nextId('RS'), batchId: batchId, productId: b ? b.productId : null, action: action, qty: qty, valueCents: valueCents || 0,
      removesStock: removes, by: actor, note: note || '', at: new Date().toISOString() });
  }
  function rescueListOnClear(x, opt, actor) {
    var r = clearanceCreate({ productId: x.product.id, qty: x.unlisted, clearancePriceCents: opt.priceCents, minPriceCents: opt.minCents, reason: 'short_dated', availableUntil: x.batch.sellBy }, actor);
    if (r.ok) rescueLogOutcome(x.batch.id, 'clear', x.unlisted, x.unlisted * opt.priceCents, actor, 'until ' + parseDayKey(x.batch.sellBy).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }));
    return r;
  }

  /* ---------- Tyllage Buyer Growth: B2B accounts, standing orders, insights, leads ----------
   * Trade buyers (restaurants, cafés, office pantries, caterers) order on standing days at a
   * trade price. Insights are rule-based and explainable: a standing order that hasn't been
   * placed, an account ordering less, a lapsed account, surplus crops worth offering to the
   * buyers who use that category, and lead follow-ups that are due. Staff send every message.
   * Confirmed B2B orders also feed Demand Radar and the harvest & pack list.
   */
  var B2B_TYPES = { restaurant: 'Restaurant', cafe: 'Café', office: 'Office pantry', caterer: 'Caterer', school: 'School canteen', hotel: 'Hotel' };
  var LEAD_STAGES = [['new', 'New'], ['contacted', 'Contacted'], ['sampling', 'Sampling'], ['won', 'Won']];
  var WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function b2bStore() { return state.b2b || (state.b2b = { accounts: [], orders: [], leads: [] }); }
  function b2bOrdersOf(accountId) { return b2bStore().orders.filter(function (o) { return o.accountId === accountId && o.status !== 'cancelled'; }); }
  function nextWeekdayKey(wd) {
    var d = new Date(); d.setHours(0, 0, 0, 0);
    for (var i = 1; i <= 7; i++) { var x = new Date(d.getTime() + i * 864e5); if (x.getDay() === wd) return bagDayKey(x); }
    return bagDayKey(d);
  }
  function b2bAccountStats(a) {
    var now = Date.now();
    var orders = b2bOrdersOf(a.id);
    var delivered = orders.filter(function (o) { return o.status === 'delivered'; });
    var inRange = function (from, to) { return delivered.filter(function (o) { var t = parseDayKey(o.deliveryDay).getTime(); return t > now - to * 864e5 && t <= now - from * 864e5; }); };
    var units = function (list) { return list.reduce(function (s, o) { return s + o.items.reduce(function (t, i) { return t + i.qty; }, 0); }, 0); };
    var cents = function (list) { return list.reduce(function (s, o) { return s + o.totalCents; }, 0); };
    var last4 = inRange(0, 28), prev4 = inRange(28, 56);
    var last2 = inRange(0, 14), prior = inRange(14, 42);
    var recentRate = units(last2) / 2, priorRate = units(prior) / 4;
    var lastOrder = delivered.map(function (o) { return o.deliveryDay; }).sort().pop() || null;
    var upcoming = a.standingDays.map(function (wd) {
      var key = nextWeekdayKey(wd);
      return { weekday: wd, dayKey: key, order: orders.filter(function (o) { return o.deliveryDay === key && o.status === 'confirmed'; })[0] || null };
    }).sort(function (x, y) { return x.dayKey < y.dayKey ? -1 : 1; });
    var usualUnits = a.usual.reduce(function (s, u) { return s + u.qty; }, 0);
    var usualCents = a.usual.reduce(function (s, u) { var p = byId('products', u.productId); return s + (p ? Math.round(p.priceCents * RULES.b2bPriceRate) * u.qty : 0); }, 0);
    return {
      weeklyUnits: Math.round(units(last4) / 4), weeklyCents: Math.round(cents(last4) / 4), prevWeeklyCents: Math.round(cents(prev4) / 4),
      trendPct: priorRate ? Math.round((recentRate - priorRate) / priorRate * 100) : 0,
      lastOrder: lastOrder, daysSince: lastOrder ? Math.round((now - parseDayKey(lastOrder).getTime()) / 864e5) : null,
      upcoming: upcoming, missing: upcoming.filter(function (u) { return !u.order; }), usualUnits: usualUnits, usualCents: usualCents, orders: orders.length
    };
  }
  function b2bInsights() {
    var out = [], st = b2bStore();
    var crops = radarCrops();
    var surplus = crops.filter(function (c) { return c.status === 'surplus'; }).sort(function (a, b) { return b.gap - a.gap; });
    st.accounts.filter(function (a) { return a.status === 'active'; }).forEach(function (a) {
      var s = b2bAccountStats(a);
      if (s.daysSince !== null && s.daysSince >= 21) {
        out.push({ score: 90, kind: 'lapsed', account: a, title: a.name + ' hasn\'t ordered in ' + s.daysSince + ' days',
          why: 'Used to order about ' + s.usualUnits + ' units each ' + a.standingDays.map(function (d) { return WEEKDAY[d]; }).join(' & ') + ' (' + money(s.usualCents) + '). Worth a friendly check-in before they switch supplier.', actions: ['message'] });
        return;
      }
      s.missing.forEach(function (m) {
        out.push({ score: 95 - Math.round((parseDayKey(m.dayKey).getTime() - Date.now()) / 864e5), kind: 'missing', account: a, dayKey: m.dayKey,
          title: a.name + ' has no order for ' + parseDayKey(m.dayKey).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' }),
          why: 'They usually order on ' + WEEKDAY[m.weekday] + ' (about ' + s.usualUnits + ' units, ' + money(s.usualCents) + '). Confirm their usual order, or ask if anything has changed.', actions: ['usual', 'message'] });
      });
      if (s.trendPct <= -25) {
        out.push({ score: 80, kind: 'declining', account: a, title: a.name + ' is ordering ' + Math.abs(s.trendPct) + '% less',
          why: 'The last 2 weeks are well below their usual. A quick call can catch a quality issue, a menu change or a competitor early.', actions: ['message'] });
      }
      // Surplus crop in a category they already buy, but not in their usual basket.
      var cats = {};
      a.usual.forEach(function (u) { var p = byId('products', u.productId); if (p) cats[p.category] = true; });
      var offer = surplus.filter(function (c) { return cats[c.product.category] && !a.usual.some(function (u) { return u.productId === c.product.id; }); })[0];
      if (offer) {
        out.push({ score: 70, kind: 'offer', account: a, product: offer.product, title: 'Offer ' + offer.product.title + ' to ' + a.name,
          why: 'The farm expects about ' + offer.gap + ' more ' + offer.product.title + ' than demand. They already buy ' + CATEGORIES[offer.product.category].label.toLowerCase() + '.', actions: ['message'] });
      }
    });
    var todayKey = bagDayKey(new Date());
    st.leads.filter(function (l) { return l.stage !== 'won' && l.stage !== 'lost' && l.nextStepAt <= todayKey; }).forEach(function (l) {
      out.push({ score: 75, kind: 'lead', lead: l, title: 'Follow up with ' + l.name + ' (' + (LEAD_STAGES.filter(function (x) { return x[0] === l.stage; })[0] || [0, l.stage])[1].toLowerCase() + ')',
        why: l.notes + ' Could be worth about ' + money(l.estWeeklyCents) + ' a week.', actions: ['message', 'advance'] });
    });
    return out.sort(function (a, b) { return b.score - a.score; });
  }
  // Confirmed order built from the account's usual basket at trade price. Fails closed on stock
  // that can't be confirmed; B2B produce is harvested to order, so stock isn't deducted here.
  function b2bCreateUsualOrder(accountId, dayKey) {
    var a = b2bStore().accounts.filter(function (x) { return x.id === accountId; })[0];
    if (!a) return { ok: false, error: 'Account not found.' };
    if (b2bOrdersOf(a.id).some(function (o) { return o.deliveryDay === dayKey && o.status === 'confirmed'; })) return { ok: false, error: 'There is already an order for that day.' };
    var items = a.usual.map(function (u) { var p = byId('products', u.productId); return p ? { productId: p.id, title: p.title, qty: u.qty, priceCents: Math.round(p.priceCents * RULES.b2bPriceRate) } : null; }).filter(Boolean);
    var id = nextId('BO');
    var o = { id: id, ref: 'B2B-' + id.split('-')[1], accountId: a.id, deliveryDay: dayKey, items: items, totalCents: items.reduce(function (t, i) { return t + i.qty * i.priceCents; }, 0),
      status: 'confirmed', createdAt: new Date().toISOString(), source: 'b2b' };
    b2bStore().orders.push(o);
    return { ok: true, order: o };
  }
  function b2bLogContact(target, channel, text, actor) {
    target.contacts = target.contacts || [];
    target.contacts.push({ at: new Date().toISOString(), by: actor, channel: channel, text: text });
    target.lastContactAt = new Date().toISOString();
  }
  function b2bMoveLead(leadId, stage, nextInDays) {
    var l = b2bStore().leads.filter(function (x) { return x.id === leadId; })[0];
    if (!l) return null;
    l.stage = stage;
    l.nextStepAt = bagDayKey(new Date(Date.now() + (nextInDays || 3) * 864e5));
    return l;
  }
  function b2bAddLead(data) {
    if (!String(data.name || '').trim()) return { ok: false, error: 'Enter the business name.' };
    var id = nextId('BL');
    var l = { id: id, name: String(data.name).trim().slice(0, 80), type: data.type || 'restaurant', area: String(data.area || '').trim(), stage: 'new',
      nextStepAt: bagDayKey(new Date()), estWeeklyCents: Math.max(0, data.estWeeklyCents || 0), notes: String(data.notes || '').trim().slice(0, 200) || 'New lead.', createdAt: new Date().toISOString(), contacts: [] };
    b2bStore().leads.push(l);
    return { ok: true, lead: l };
  }
  // Confirmed B2B lines for one delivery day (used by the pick list and Demand Radar).
  function b2bLinesFor(dayKey) {
    var lines = [];
    b2bStore().orders.forEach(function (o) { if (o.status === 'confirmed' && o.deliveryDay === dayKey) o.items.forEach(function (i) { lines.push({ order: o, item: i }); }); });
    return lines;
  }

  /* ---------- Tyllage Demand Radar: supply vs demand per crop, plus the daily pick list ----------
   * For each MEOD-grown crop over the next few weeks:
   *   supply    = stock on hand + expected yield of batches harvesting in the window
   *   confirmed = pre-orders already placed against those batches
   *   expected  = recent regular sales (28-day weekly average) × weeks in the window
   *   gap       = supply − (confirmed + expected)  → surplus / balanced / short
   * Confidence reflects how much order history there is. PROTOTYPE: simple, explainable
   * arithmetic — not a trained forecast — so every number can be traced. MEOD staff decide.
   */
  var RADAR_WEEKS = 3;
  function radarCrops() {
    var now = Date.now(), until = now + RADAR_WEEKS * 7 * 864e5;
    return state.products.filter(function (p) { return p.meodGrown && p.category !== 'farm-more' && !p.bagOffer; }).map(function (p) {
      var st = stockStatus(p);
      var stock = st.known ? Math.max(0, p.stock.qty) : 0;
      var batches = batchesUpcoming().filter(function (b) {
        return b.productId === p.id && parseDayKey(b.harvestDate).getTime() <= until;
      });
      var harvest = batches.reduce(function (s, b) { return s + b.expectedQty; }, 0);
      var preordered = batches.reduce(function (s, b) { return s + batchPreordered(b); }, 0);
      // Confirmed trade (B2B) orders delivering in the window count as confirmed demand too.
      var b2bUnits = b2bStore().orders.reduce(function (s, o) {
        if (o.status !== 'confirmed' || parseDayKey(o.deliveryDay).getTime() > until) return s;
        return s + o.items.reduce(function (t, i) { return t + (i.productId === p.id ? i.qty : 0); }, 0);
      }, 0);
      var confirmed = preordered + b2bUnits;
      // Weekly sales history (MEOD Fresh / Shopify mock): last 4 weeks set the pace, the 4
      // before give the trend, and week-to-week wobble sets the confidence.
      var weeks = (state.salesHistory && state.salesHistory.byProduct[p.id]) || [];
      var avg = function (a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : 0; };
      var recent = weeks.slice(-4), before = weeks.slice(-8, -4);
      var weekly = weeks.length ? avg(recent) : weeklySales(p.id);
      var trendPct = before.length && avg(before) ? Math.round((avg(recent) - avg(before)) / avg(before) * 100) : 0;
      var sd = recent.length ? Math.sqrt(avg(recent.map(function (x) { return (x - weekly) * (x - weekly); }))) : 0;
      var cv = weekly ? sd / weekly : 1;
      var expected = Math.round(weekly * RADAR_WEEKS);
      var supply = stock + harvest;
      var demand = confirmed + expected;
      var gap = supply - demand;
      // A gap within RULES.radarTolerance of demand (at least 3 units) counts as balanced.
      var tolerance = Math.max(3, Math.round(demand * RULES.radarTolerance));
      var status = !st.known ? 'unknown' : supply === 0 && demand === 0 ? 'idle'
        : gap < -tolerance ? 'short' : gap > Math.max(tolerance, supply * 0.25) ? 'surplus' : 'balanced';
      return {
        product: p, stockKnown: st.known, stock: stock, harvest: harvest, batches: batches,
        supply: supply, confirmed: confirmed, preordered: preordered, b2b: b2bUnits, expected: expected, weekly: Math.round(weekly * 10) / 10, demand: demand, gap: gap,
        trendPct: trendPct, history: weeks,
        status: status, confidence: !weeks.length ? 'low' : cv < 0.12 ? 'high' : cv < 0.25 ? 'medium' : 'low',
        openBatch: batches.filter(batchOpen)[0] || null,
        clearance: clearanceListActive().filter(function (l) { return l.productId === p.id; })[0] || null
      };
    });
  }

  // Delivery day an order goes out on (pre-order lines go on their own harvest day).
  function orderDeliveryKey(o) {
    if (o.bagSize && o.deliveryDay) return o.deliveryDay;
    var d = nextDeliveryDay(Math.max(new Date(o.createdAt).getTime(), Date.now() - 864e5));
    return bagDayKey(d);
  }
  // What to harvest and pack for one delivery morning: paid and awaiting-payment orders,
  // pre-orders harvesting that day, and approved Surprise Harvest Bag contents. A small
  // buffer (10%, at least 1) covers damage and walk-in sales — staff can ignore it.
  function pickList(dayKey) {
    var rows = {}, ordersSeen = {}, pendingBags = 0;
    function add(pid, qty, kind, ref, paid) {
      var p = byId('products', pid);
      if (!p || !qty) return;
      var r = rows[pid] || (rows[pid] = { product: p, orders: 0, preorders: 0, bags: 0, b2b: 0, awaitingPayment: 0, refs: [] });
      r[kind] += qty;
      if (!paid) r.awaitingPayment += qty;
      if (r.refs.indexOf(ref) === -1) r.refs.push(ref);
    }
    state.orders.forEach(function (o) {
      if (o.status !== 'paid' && o.status !== 'pending_payment') return;
      var paid = o.status === 'paid';
      o.items.forEach(function (i) {
        if (i.preorderBatchId) {
          if (i.harvestDate === dayKey) { add(i.productId, i.qty, 'preorders', o.ref, paid); ordersSeen[o.id] = true; }
          return;
        }
        if (i.bag) return;
        if (orderDeliveryKey(o) === dayKey) { add(i.productId, i.qty, 'orders', o.ref, paid); ordersSeen[o.id] = true; }
      });
      if (o.bagSize && o.deliveryDay === dayKey) {
        ordersSeen[o.id] = true;
        if (o.bagContentsApproved) (o.bagContents || []).forEach(function (it) { add(it.productId, it.qty, 'bags', o.ref, paid); });
        else pendingBags++;
      }
    });
    b2bLinesFor(dayKey).forEach(function (l) { add(l.item.productId, l.item.qty, 'b2b', l.order.ref, true); ordersSeen[l.order.id] = true; });
    var list = Object.keys(rows).map(function (k) {
      var r = rows[k];
      r.need = r.orders + r.preorders + r.bags + r.b2b;
      r.buffer = Math.max(1, Math.ceil(r.need * 0.1));
      r.pick = r.need + r.buffer;
      r.meodGrown = r.product.meodGrown && r.product.category !== 'farm-more';
      return r;
    }).sort(function (a, b) { return (b.meodGrown - a.meodGrown) || b.pick - a.pick; });
    return { dayKey: dayKey, rows: list, orderCount: Object.keys(ordersSeen).length, pendingBags: pendingBags };
  }
  function nextDeliveryKeys(n) {
    var out = [], d = new Date();
    for (var i = 0; i < n; i++) { d = nextDeliveryDay(d); out.push(bagDayKey(d)); }
    return out;
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

  // Restock reminders: opted-in customers who bought an in-stock item 7–45 days ago and
  // haven't bought it since, grouped by product. Skips items they already have on pre-order,
  // refunded/cancelled orders, and anyone a restock campaign for that item already covered
  // in the last 14 days. Only suggests — staff draft the message and an admin approves it.
  function restockDue() {
    var now = Date.now();
    var covered = {};
    state.campaigns.forEach(function (cp) {
      if (cp.kind !== 'restock' || cp.status === 'rejected') return;
      if (now - new Date(cp.createdAt).getTime() > RULES.restockCooldownDays * DAY) return;
      cp.audience.forEach(function (cid) { covered[cp.productId + '|' + cid] = true; });
    });
    var groups = {};
    state.customers.forEach(function (c) {
      if (!c.consentMarketing) return;
      var last = {}, onPreorder = {};
      state.orders.forEach(function (o) {
        if (o.customerId !== c.id || o.status === 'cancelled' || o.status === 'refunded') return;
        o.items.forEach(function (i) {
          if (i.preorderBatchId) { onPreorder[i.productId] = true; return; }
          var t = new Date(o.createdAt).getTime();
          if (!last[i.productId] || t > last[i.productId]) last[i.productId] = t;
        });
      });
      Object.keys(last).forEach(function (pid) {
        var days = Math.floor((now - last[pid]) / DAY);
        if (days < RULES.restockAfterDays || days > RULES.restockWindowDays) return;
        if (onPreorder[pid] || covered[pid + '|' + c.id]) return;
        var p = byId('products', pid);
        var s = p && stockStatus(p);
        if (!p || p.bagOffer || !s.known || s.qty <= 0) return;
        var g = groups[pid] || (groups[pid] = { product: p, customers: [] });
        g.customers.push({ customer: c, days: days });
      });
    });
    return Object.keys(groups).map(function (k) {
      var g = groups[k];
      var ds = g.customers.map(function (x) { return x.days; });
      g.minDays = Math.min.apply(null, ds);
      g.maxDays = Math.max.apply(null, ds);
      return g;
    }).sort(function (a, b) { return b.customers.length - a.customers.length || b.maxDays - a.maxDays; });
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
    ledger: ledger, ledgerEntry: ledgerEntry, recommendFor: recommendFor, restockDue: restockDue, trackingFor: trackingFor, tasteProfile: tasteProfile, CATEGORY_ART: CATEGORY_ART,
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
    GROUP_TYPES: GROUP_TYPES,
    settings: { list: settingsList, validate: settingValidate, impact: settingsImpact, save: settingSave, resetAll: settingsResetAll, saveCost: costSave, CATS: CAT_LABELS },
    leaderFinder: { areas: leaderFinder, invite: leaderInvite },
    reviews: { list: reviewsFor, stats: reviewStats, summary: reviewSummary, canWrite: reviewCanWrite, add: reviewAdd, name: reviewerName },
    lost: { SOURCES: LOST_SOURCES, REASONS: LOST_REASONS, list: lostList, add: lostAdd, resolve: lostResolve, insights: lostInsights, unitsFor: lostUnitsFor },
    allocation: { plan: allocationPlan },
    promo: { simulate: promoSimulate },
    importer: { KINDS: IMPORT_KINDS, parseCsv: parseCsv, preview: importPreview, apply: importApply, template: importTemplate },
    pilot: { metrics: pilotMetrics, recordBaseline: pilotRecordBaseline, DRAFT_MINUTES: DRAFT_MINUTES },
    pricing: { cost: unitCost, guard: marginGuard, suggestions: priceSuggestions, propose: proposePrice, decide: decidePrice },
    feedback: { THEMES: FEEDBACK_THEMES, SOURCES: FEEDBACK_SOURCES, classify: feedbackClassify, batchFor: feedbackBatchFor, items: feedbackItems, clusters: feedbackClusters, trends: feedbackTrends, add: feedbackAdd, log: feedbackLog, resolve: feedbackResolve, resolvedList: feedbackResolvedList, reopen: feedbackReopen, flagBatch: feedbackFlagBatch },
    rescue: { batches: rescueBatches, options: rescueOptions, log: rescueLogOutcome, listOnClear: rescueListOnClear },
    b2b: {
      TYPES: B2B_TYPES, STAGES: LEAD_STAGES, WEEKDAY: WEEKDAY, store: b2bStore, stats: b2bAccountStats, insights: b2bInsights,
      createUsualOrder: b2bCreateUsualOrder, logContact: b2bLogContact, moveLead: b2bMoveLead, addLead: b2bAddLead, ordersOf: b2bOrdersOf
    },
    radar: { weeks: RADAR_WEEKS, crops: radarCrops, pickList: pickList, deliveryKeys: nextDeliveryKeys, orderDeliveryKey: orderDeliveryKey },
    rewards: {
      summary: rewardsSummary, ledger: rewardsLedger, tiers: RW.tiers, tierFor: tierForBunches, nextTier: nextTier,
      syncTierVouchers: syncTierVouchers, redeem: redeemPoints, vouchers: customerVouchers, usable: voucherUsable,
      capCents: voucherCapCents, preview: previewPoints, useVoucher: useVoucher, tips: rewardsTips, members: rewardsMembers
    },
    visits: {
      sessions: visitSessions, confirm: visitConfirm, capacity: visitCapacity, fits: visitFits, freeDays: visitFreeDays, byCode: visitEventByCode, order: visitOrder, totals: visitTotals,
      stats: visitStats, funnel: visitFunnel
    },
    harvest: {
      dayOnOrAfter: harvestDayOnOrAfter, lines: batchLines, preordered: batchPreordered, left: batchLeft,
      cutoff: batchCutoff, stage: batchStage, isOpen: batchOpen, growthPct: batchGrowthPct,
      upcoming: batchesUpcoming, open: batchesOpen, nextFor: nextOpenBatch, signal: batchSignal, weeklySales: weeklySales,
      validate: batchValidate, create: batchCreate, markHarvested: batchHarvest, cancel: batchCancel
    }
  };
})();
