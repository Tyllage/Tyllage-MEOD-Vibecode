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
    // Promotion Intelligence: when a harvest needs an incentive, and how big it is. Illustrative.
    promo: {
      dropBundleShare: 0.25,        // uncommitted above this share of a harvest → suggest a bundle
      dropDiscountShare: 0.5,       // ...above this (and selling slowly) → a small pre-order discount
      dropDiscountPct: 10,          // the Harvest Drop discount, always checked by Margin Guard
      milestoneVoucherCents: 300,   // per member when a group buy reaches its goal
      milestoneLift: 0.25,          // group-buy goal = usual volume + 25%
      milestoneDays: 14,
      visitVoucherCents: 500,       // thank-you voucher for visitors who opted in
      resultDays: 7,                // orders within this many days of sending count towards a campaign
      assumedResponse: 0.25         // share of people messaged assumed to order (saved with each draft, compared with results)
    },
    preorderConvert: 0.3,           // Decision twin: share of extra supply pre-orders typically sell
    // Quotation Copilot: kg per sold unit (bunch or pack), to convert buyers' kg requests. Illustrative.
    kgPerUnit: { 'asian-greens': 0.25, lettuces: 0.2, fungi: 0.2, herbs: 0.05, 'farm-more': 0.2 },
    // Learning-journey packages: price per guest, guests per guide, take-home bag. Illustrative.
    visitPricePerPax: { 'School Visit': 1500, 'Farm Tour': 2000, 'Workshop': 3500 },
    visitGuestsPerGuide: { school: 15, other: 20 },
    visitBagCents: 800,
    visitMaxPax: 200,               // largest group the booking form accepts
    visitFundRate: 0.05,            // share of a visit group's orders paid back to the group's fund
    visitCodeDays: 7,               // a visit's farm-shop code stays open this long after the visit
    restockAfterDays: 7,            // a buyer is "due" this many days after they last bought an item...
    restockWindowDays: 45,          // ...until this many days (after that they're lapsed, not due)
    restockCooldownDays: 14,        // don't suggest the same reminder to someone again within this
    preorderCutoffHour: 22,         // harvest pre-orders close 10pm the day before harvest
    preorderDefaultShare: 0.6,      // share of a batch's expected yield opened to pre-order
    // Greenhouse rounds: workers inspect each growing batch and estimate its harvest. Small
    // changes update the batch straight away; big ones wait for the farm manager. Illustrative.
    inspect: {
      greenhouses: 8,               // demo greenhouses GH-01 … GH-08
      autoApplyPct: 0.2,            // estimate changes within ±20% apply automatically
      staleDays: 3,                 // health map: a greenhouse not inspected for this long fades
      minHarvestsForBias: 3,        // learning: harvests needed before suggesting a corrected estimate
      thumbSide: 96                 // photos are kept as a small thumbnail only
    },
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
    if (!s.migrations.ledgerV1) {
      // Decision ledger history: the seeded Sweet Basil price proposal, plus two past decisions
      // with known outcomes, so the ledger shows the full loop (suggested → decided → result).
      var dNow = Date.now();
      var basilPP = (s.priceProposals || [])[0];
      s.decisions = [];
      if (basilPP) {
        s.seq += 1;
        s.decisions.push({ id: 'DL-' + s.seq, kind: 'price', ref: basilPP.id, feature: 'Price Advisor', title: 'Sweet Basil 20% off (S$3.00 → S$2.40)', recommendation: 'Discount',
          inputs: [['Supply over 3 weeks', 'about 40 more than demand'], ['Trend', '−21% vs the 4 weeks before'], ['Unit cost', 'S$1.32'], ['Normal price', 'S$3.00']],
          calc: ['Gap = supply − demand ≈ +40', 'Suggested 20% off → S$2.40', 'Margin Guard floor = S$1.82 → passes (S$1.08 margin a unit)'],
          assumptions: ['Each 10% off lifts sales by about 20%.', 'Unit costs are illustrative.'], confidence: { level: 'medium', note: 'Weekly sales move around somewhat.' },
          status: 'suggested', createdAt: basilPP.createdAt, createdBy: basilPP.createdBy, decidedBy: null, decidedAt: null, outcome: null });
      }
      s.seq += 1;
      s.decisions.push({ id: 'DL-' + s.seq, kind: 'campaign', feature: 'Campaign Advisor', title: 'Mushroom Monday — shiitake promo to past buyers', recommendation: 'Draft promo',
        inputs: [['Shiitake supply', 'surplus of about 18'], ['Opted-in past buyers', '2']], calc: ['Promote a surplus crop to people who bought mushrooms before'],
        assumptions: ['Only opted-in customers are messaged.'], confidence: { level: 'medium', note: 'Small audience.' },
        status: 'approved', createdAt: new Date(dNow - 3.2 * 864e5).toISOString(), createdBy: 'sales@meod.test', decidedBy: 'admin@meod.test', decidedAt: new Date(dNow - 3 * 864e5).toISOString(),
        campaignId: 'CP-1001', outcome: { text: 'Sent to 2 people; 1 reorder within a day (2 × Shiitake).', at: new Date(dNow - 2 * 864e5).toISOString() } });
      s.seq += 1;
      s.decisions.push({ id: 'DL-' + s.seq, kind: 'price', feature: 'Price Advisor', title: 'Mesclun Mix 45% off', recommendation: 'Discount',
        inputs: [['Unsold from harvest', '19'], ['Sell by', '2 days']], calc: ['45% off → S$3.25', 'Margin Guard floor S$3.54 → blocked'],
        assumptions: ['Floor = 60% of normal price.'], confidence: { level: 'high', note: 'The floor is a fixed rule.' },
        status: 'rejected', createdAt: new Date(dNow - 6 * 864e5).toISOString(), createdBy: 'sales@meod.test', decidedBy: 'Margin Guard', decidedAt: new Date(dNow - 6 * 864e5).toISOString(),
        decisionNote: 'Blocked automatically; listed at the floor price instead', outcome: { text: 'Listed on Buy to Clear at the S$3.54 floor; offered to a trade buyer.', at: new Date(dNow - 5 * 864e5).toISOString() } });
      s.quotes = []; s.commitments = [];
      // Visits: which past organisers agreed to hear from MEOD again (for re-invites).
      s.bookings.forEach(function (b) { if (b.consentFollowUp == null) b.consentFollowUp = /Sunrise|Acme/.test(b.org || ''); });
      s.migrations.ledgerV1 = true;
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
    if (!s.migrations.inspectV1) {
      // Greenhouse rounds: every batch gets a greenhouse, and there's a farm-worker account.
      var gh = 0;
      s.batches.forEach(function (b) { if (!b.greenhouse) b.greenhouse = greenhouseName(gh++); });
      if (!s.users.some(function (u) { return u.email === 'worker@meod.test'; })) s.users.push({ email: 'worker@meod.test', name: 'Siti Aminah', role: 'worker' });
      s.inspections = s.inspections || [];
      s.rounds = s.rounds || [];
      s.migrations.inspectV1 = true;
    }
    // The demo farm worker gets a person's name (the greeting reads "Good morning, Siti").
    s.users.forEach(function (u) { if (u.email === 'worker@meod.test' && u.name === 'Farm Worker') u.name = 'Siti Aminah'; });
    // Commitment-risk follow-up tasks and the log of every estimate change.
    s.tasks = s.tasks || [];
    s.estimateLog = s.estimateLog || [];
    if (!s.migrations.learningV1) {
      // Demo history for "learning from inspections": 12 weeks of past harvests, each with the
      // last worker estimate before picking and the photo check's suggestion. Each crop has a
      // typical estimating habit (Kai Lan usually 12% high, Red Pak Choy 8% low…), and the photo
      // check over-flags some healthy crops, so agreement isn't perfect.
      var habit = { 'Kai Lan': 0.12, 'Xiao Bai Cai': 0.05, 'Red Pak Choy': -0.08, 'Cos Lettuce': 0.03, 'Kangkong': 0.15, 'Tuscan Kale': -0.04, 'Oyster Mushroom': 0, 'Bayam': 0.09, 'HK Cai Xin': 0.06 };
      var dayMs = 864e5, k = 0;
      s.harvestRecords = s.harvestRecords || [];
      Object.keys(habit).forEach(function (title, ci) {
        var p = s.products.filter(function (x) { return x.title === title; })[0];
        if (!p) return;
        for (var w = 0; w < 4; w++) {
          k++;
          var actual = 35 + (hashOf(title + w) % 30), noise = ((hashOf(title + 'n' + w) % 9) - 4) / 100;
          var est = Math.max(1, Math.round(actual * (1 + habit[title] + noise)));
          // Photo suggestion vs worker: about 1 in 5 disagree (strong light or purple leaves read as yellowing).
          var cond = k % 7 === 0 ? 'monitor' : 'healthy';
          var grade = p.category === 'fungi' ? null : k % 5 === 0 ? 'cosmetic' : cond === 'monitor' ? (k % 2 ? 'cosmetic' : 'A') : 'A';
          s.harvestRecords.push({ productId: p.id, batchId: null, greenhouse: greenhouseName(ci), harvestedAt: new Date(Date.now() - (14 + w * 18 + ci) * dayMs).toISOString(),
            estimate: est, actual: actual, condition: cond, photoGrade: grade, demo: true });
        }
      });
      s.marketPrices = s.marketPrices || [];
      [['Xiao Bai Cai', 'FairPrice', 295], ['Xiao Bai Cai', 'Cold Storage', 340], ['Xiao Bai Cai', 'Sheng Siong', 260], ['Kai Lan', 'FairPrice', 310], ['Kai Lan', 'Wet market', 250],
       ['Cos Lettuce', 'FairPrice', 395], ['Cos Lettuce', 'Cold Storage', 480], ['Shiitake Mushroom', 'FairPrice', 550], ['Tuscan Kale', 'Cold Storage', 690], ['Sweet Basil', 'Cold Storage', 350]].forEach(function (m, i) {
        var p = s.products.filter(function (x) { return x.title === m[0]; })[0];
        if (p) s.marketPrices.push({ id: 'MP-' + (900 + i), productId: p.id, store: m[1], priceCents: m[2], note: 'Similar pack size (demo)', at: new Date(Date.now() - (2 + i) * dayMs).toISOString(), by: 'sales@meod.test', demo: true });
      });
      s.migrations.learningV1 = true;
    }
    return s;
  }
  function greenhouseName(i) { var n = i % RULES.inspect.greenhouses + 1; return 'GH-' + (n < 10 ? '0' : '') + n; }

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
      greenhouse: data.greenhouse || greenhouseName(state.batches.length),
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
    archiveHarvest(b);
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
    ledgerLog(Object.assign({ kind: 'price', ref: id, feature: 'Price Advisor', recommendation: sug.kind === 'bundle' ? 'Bundle' : 'Discount',
      title: sug.product.title + (sug.partner ? ' + ' + sug.partner.title + ' bundle' : '') + ' at ' + money(sug.priceCents) + (sug.pct ? ' (' + sug.pct + '% off)' : '') }, explainPrice(sug)), actor);
    return { ok: true, id: id };
  }
  // Approve or reject. An approved single-item discount becomes a Buy to Clear listing (re-checked
  // by Margin Guard at that moment); bundles are recorded as approved for MEOD Fresh to publish.
  function decidePrice(id, approve, actor) {
    var pp = (state.priceProposals || []).filter(function (x) { return x.id === id; })[0];
    if (!pp || pp.status !== 'pending') return { ok: false, error: 'That proposal is no longer pending.' };
    if (pp.createdBy === actor) return { ok: false, error: 'Someone other than the proposer must approve it.' };
    if (!approve) { pp.status = 'rejected'; pp.decidedBy = actor; pp.decidedAt = new Date().toISOString(); ledgerDecide(id, 'rejected', actor); return { ok: true, proposal: pp }; }
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
    ledgerDecide(id, 'approved', actor);
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
    { key: 'promoLiftPer10', group: 'Demand', label: 'Sales lift per 10% off', unit: '% more sales', min: 0, max: 100, pct: true, usedBy: ['Promotion simulator', 'Price Advisor'], note: 'How much extra a 10% discount is assumed to sell. Compare with real campaign results over time.' },
    { key: 'promo.assumedResponse', group: 'Demand', label: 'Expected campaign response', unit: '% of people messaged', min: 1, max: 100, pct: true, usedBy: ['Campaign Studio', 'Campaign results'], note: 'Saved with each campaign when it\'s drafted, then compared with how many people actually ordered.' }
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
      b2b += commitmentUnits(b.productId, hk, endKey);
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

  /* ---------- Promotion Intelligence ----------
   * Tyllage is MEOD's commercial partner, not a reseller: it works out *whether* a promotion
   * is worth running, which kind fits the problem, and how much of a harvest to offer. MEOD
   * approves every offer, sells through its own channels and keeps its prices and customers.
   * 1. Harvest Drops: per upcoming batch, expected vs committed vs uncommitted, and three
   *    options (normal-price pre-order, bundle, small discount) with the maths shown.
   * 2. Group-buy milestones: a volume goal that unlocks a voucher, only if the extra margin
   *    covers the vouchers.
   * 3. Learning-journey vouchers: a thank-you voucher for visitors who opted in.
   * 4. Results: what each sent campaign led to, and a summary per promotion type.
   * PROTOTYPE: rules, not a trained model. Results start the history a model would need. */
  // Each type also says what to try instead (alt) and what not to do (avoid), so every
  // recommendation reads as Suggested / Alternative / Avoid with a reason for each.
  var PROMO_TYPES = {
    drop: { label: 'Harvest Drop', tone: 'green', when: 'A harvest has supply nobody has committed to yet. Offer it as a pre-order before it\'s picked.',
      alt: ['Smart bundle', 'If pre-orders are still slow a few days before the cutoff.'], avoid: ['Broad discount', 'Cuts the price for people who would buy anyway, before a normal-price pre-order has been tried.'] },
    bundle: { label: 'Smart bundle', tone: 'green', when: 'One crop is slow and another sells well. A pair at a small saving moves the slow one without cutting its own price.',
      alt: ['Normal-price pre-order', 'If MEOD would rather not publish a bundle in MEOD Fresh.'], avoid: ['Broad discount', 'A shop-wide price cut gives margin away on every sale, not just the extra ones.'] },
    rescue: { label: 'Rescue offer', tone: 'red', when: 'Produce that\'s already harvested is near its sell-by date. Alert past buyers first, and only then list it on Buy to Clear.',
      alt: ['Buy to Clear listing', 'If the alert hasn\'t sold it within a day. Never below the minimum price.'], avoid: ['Waiting', 'Each day closer to the sell-by date lowers what it can sell for.'] },
    group: { label: 'Group-buy milestone', tone: 'blue', when: 'A group buy orders regularly. A volume goal combines orders into one drop-off, and the reward has to cost less than the extra margin.',
      alt: ['Normal group-buy reminder', 'If the group\'s orders are already growing without a goal.'], avoid: ['A bigger group discount', 'It lowers the price of every group order, including the usual ones.'] },
    visit: { label: 'Learning-journey voucher', tone: 'blue', when: 'A group visited recently and some visitors opted in. A thank-you voucher turns a visit into produce orders.',
      alt: ['Harvest updates only', 'If MEOD prefers no voucher. Visitors who opted in still hear about fresh harvests.'], avoid: ['Messaging visitors who didn\'t opt in', 'Not allowed: marketing needs their consent.'] },
    repeat: { label: 'Repeat-buyer reward', tone: 'amber', when: 'Members are close to a tier or have points they haven\'t used. Use the rewards they already have; no new discount.',
      alt: ['Points reminder', 'Remind them what their points are worth instead.'], avoid: ['A new voucher on top', 'They already have rewards to use; another discount only costs margin.'] },
    reactivate: { label: 'Reactivation', tone: 'amber', when: 'Past buyers who opted in haven\'t ordered for 30+ days. Tell them what\'s fresh this week.',
      alt: ['What\'s-fresh message', 'Show this week\'s harvest with no offer at all.'], avoid: ['A big win-back discount', 'It teaches customers to wait for offers.'] },
    normal: { label: 'Normal-price promo', tone: 'blue', when: 'Demand just needs a reminder: a restock nudge or a surplus crop at its usual price.',
      alt: ['Add a recipe idea', 'Gives people a reason to buy without changing the price.'], avoid: ['A discount', 'These buyers are due to buy anyway; a discount only gives margin away.'] },
    none: { label: 'No promotion needed', tone: 'grey', when: 'Demand already covers the harvest, or the crop is short. A promotion would only give margin away or disappoint people.',
      alt: ['Normal-price pre-order', 'Only if commitments fall before the cutoff.'], avoid: ['Any discount', 'Demand already covers it, or there isn\'t enough to sell.'] }
  };
  // Suggested / Alternative / Avoid for a promotion type, with an optional override per role.
  function promoRanking(type, why, over) {
    var T = PROMO_TYPES[type] || PROMO_TYPES.normal;
    over = over || {};
    return [
      { role: 'suggested', label: T.label, why: why || T.when },
      { role: 'alternative', label: (over.alt || T.alt)[0], why: (over.alt || T.alt)[1] },
      { role: 'avoid', label: (over.avoid || T.avoid)[0], why: (over.avoid || T.avoid)[1] }
    ];
  }
  var CAMPAIGN_TYPE = { 'harvest-drop': 'drop', 'rewards-preorder': 'drop', 'rescue-alert': 'rescue', 'rewards-surplus': 'rescue', 'clear-alert': 'rescue',
    'preorder-push': 'drop', 'group-milestone': 'group', 'visit-voucher': 'visit', 'rewards-tier': 'repeat', 'rewards-points': 'repeat', 'tier-nudge': 'repeat', 'rewards-winback': 'reactivate', bundle: 'bundle' };
  function campaignType(c) { return CAMPAIGN_TYPE[c.kind] || (c.drop && 'drop') || 'normal'; }

  // Anything left in a batch that can still take pre-orders: before the cutoff, not yet harvested.
  function dropOpenable(b) {
    var st = batchStage(b);
    return (st === 'planned' || st === 'growing') && Date.now() < batchCutoff(b).getTime();
  }
  // A partner for a bundle: an in-stock crop that isn't in surplus, rising demand first.
  function bundlePartner(productId) {
    return radarCrops().filter(function (c) { return c.product.id !== productId && c.status !== 'surplus' && c.product.meodGrown && stockStatus(c.product).qty > 0; })
      .sort(function (a, b) { return b.trendPct - a.trendPct; }).map(function (c) { return c.product; })[0] || null;
  }
  function dropOptions(p, qty) {
    var P = RULES.promo, cost = unitCost(p.id).totalCents, out = [];
    function opt(key, label, priceCents, unitMarginCents, extra) {
      return Object.assign({ key: key, label: label, priceCents: priceCents, contributionCents: unitMarginCents,
        potentialRevenueCents: priceCents * qty, potentialContributionCents: unitMarginCents * qty }, extra);
    }
    out.push(opt('normal', 'Normal-price pre-order', p.priceCents, p.priceCents - cost, { guard: marginGuard(p.id, p.priceCents, qty), note: 'Keeps the normal price. Pre-orders already earn 2× reward points.' }));
    var partner = bundlePartner(p.id);
    if (partner) {
      var pair = Math.round((p.priceCents + partner.priceCents) * 0.9);
      // The partner sells at full price inside the bundle, so the whole saving comes off this crop.
      var eff = pair - partner.priceCents, g = marginGuard(p.id, eff, qty);
      out.push(opt('bundle', 'Bundle with ' + partner.title, eff, eff - cost, { partner: partner, bundlePriceCents: pair, guard: g,
        note: p.title + ' + ' + partner.title + ' for ' + money(pair) + ' (10% off the pair). ' + partner.title + ' keeps its full price.' }));
    }
    var dPrice = Math.round(p.priceCents * (1 - P.dropDiscountPct / 100)), dg = marginGuard(p.id, dPrice, qty);
    out.push(opt('discount', P.dropDiscountPct + '% off pre-orders', dPrice, dPrice - cost, { pct: P.dropDiscountPct, guard: dg,
      note: 'Only for the ' + qty + ' Harvest Drop spots and only until pre-orders close. The shop price doesn\'t change.' }));
    return out;
  }
  // One card per upcoming batch (next 14 days): what's committed, what isn't, and what to do.
  function harvestDrops() {
    var P = RULES.promo;
    return allocationPlan(14).map(function (x) {
      var b = x.batch, p = x.product;
      var committed = x.wanted.b2b + x.wanted.preorder, expected = x.wanted.group + x.wanted.shop;
      var qty = x.unallocated, share = x.supply ? qty / x.supply : 0;
      var sg = batchSignal(b), openable = dropOpenable(b);
      // A drop never opens more than the batch's pre-order limit (60% of expected yield by
      // default). Raising that limit is a separate Harvest Planner decision.
      var spots = openable ? batchLeft(b) : 0, dropQty = Math.min(qty, spots), overLimit = qty - dropQty;
      var live = (state.campaigns || []).filter(function (c) { return c.drop && c.drop.batchId === b.id && c.status !== 'rejected'; })[0] || null;
      var options = dropQty > 0 ? dropOptions(p, dropQty) : [];
      var rec, reason, capped = false, flagged = false, pend = pendingEstimate(b);
      if (x.shortBy > 0) { rec = 'none'; reason = 'Demand is already ' + x.shortBy + ' more than this harvest. Keep the normal price and don\'t promote it.'; }
      else if (!qty) { rec = 'none'; reason = 'Trade orders, pre-orders and usual sales already cover the harvest. A promotion would only give margin away.'; }
      else if (!openable) { rec = 'none'; reason = 'Pre-orders for this harvest have closed. Use Harvest Rescue after picking if any is left.'; }
      else if (pend && pend.item.to < b.expectedQty) {
        // Treat the worker's lower number as a warning, not a fact, until the manager decides.
        var pr = commitmentRisk(b, pend.item.to, true);
        rec = 'none'; flagged = true; reason = 'A worker\'s lower estimate (' + pend.item.to + ', plan ' + b.expectedQty + ') is waiting for the farm manager. New Harvest Drop offers are paused until it\'s decided.' +
          (pr.shortfall ? ' Confirmed orders total ' + pr.confirmed + ', so the potential shortfall is ' + pr.shortfall + '.' : '');
      }
      else if (b.health && b.health.condition === 'review' && !b.health.reviewed) { rec = 'none'; flagged = true; reason = 'A worker flagged this batch for review in ' + batchGreenhouse(b) + '. Hold promotions until the farm manager has looked at it in Greenhouse rounds.'; }
      else if (!dropQty) { rec = 'none'; capped = true; reason = qty + ' uncommitted, but all ' + b.preorderCap + ' pre-order spots are taken. Opening more is a Harvest Planner decision; otherwise plan Harvest Rescue after picking.'; }
      else if (sg.key === 'strong' || sg.key === 'sold_out' || share <= P.dropBundleShare) { rec = 'normal'; reason = 'Only ' + Math.round(share * 100) + '% of the harvest is uncommitted' + (sg.key === 'strong' ? ' and pre-orders are filling fast' : '') + ', so a normal-price pre-order should be enough. No discount needed.'; }
      else {
        var bun = options.filter(function (o) { return o.key === 'bundle' && o.guard.ok; })[0], dis = options.filter(function (o) { return o.key === 'discount' && o.guard.ok; })[0];
        if (share > P.dropDiscountShare && sg.key === 'slow' && dis) { rec = 'discount'; reason = Math.round(share * 100) + '% uncommitted and pre-orders are slow. A small discount on the drop spots only, inside Margin Guard. It gives up ' + money(p.priceCents - dis.priceCents) + ' a unit, so it only pays if it sells noticeably more than the normal price would.'; }
        else if (bun) { rec = 'bundle'; reason = Math.round(share * 100) + '% uncommitted. A bundle with a crop that sells well moves it without a general price cut.'; }
        else { rec = 'normal'; reason = 'No bundle or discount passes Margin Guard, so offer it at the normal price.'; }
      }
      if (rec !== 'none' && overLimit > 0) reason += ' The drop is sized to the ' + dropQty + ' pre-order spots left; the other ' + overLimit + ' would need the pre-order limit raised in Harvest Planner.';
      options.forEach(function (o) { o.recommended = o.key === rec; });
      return { batch: b, product: p, supply: x.supply, committed: committed, b2b: x.wanted.b2b, preordered: x.wanted.preorder, expectedSales: expected,
        uncommitted: qty, dropQty: dropQty, spotsLeft: spots, overLimit: overLimit, capped: capped, flagged: flagged, shortBy: x.shortBy, sharePct: Math.round(share * 100),
        kg: Math.round(qty * kgPerUnit(p) * 10) / 10, signal: sg, openable: openable, options: options, recommended: rec, reason: reason,
        ranking: flagged ? flaggedRanking(reason) : dropRanking(rec, reason, options, p, x, capped), campaign: live };
    });
  }
  // Suggested / Alternative / Avoid for one harvest, built from its own options.
  function dropRanking(rec, reason, options, p, x, capped) {
    var by = function (k) { return options.filter(function (o) { return o.key === k; })[0]; };
    var dis = by('discount'), bun = by('bundle');
    var cut = dis ? money(p.priceCents - dis.priceCents) + ' a unit' : 'margin';
    if (capped) return promoRanking('none', reason, { alt: ['Raise the pre-order limit', 'In Harvest Planner, if the farm is confident in the yield. A separate decision.'], avoid: ['Opening spots from here', 'Campaigns don\'t change pre-order limits.'] });
    if (rec === 'none') return promoRanking('none', reason, x.shortBy > 0 ? { alt: ['Sow another batch', 'Demand Radar shows when one would be ready.'], avoid: ['Any promotion', 'It would sell stock the farm doesn\'t have.'] } : null);
    if (rec === 'normal') return promoRanking('drop', reason, { alt: bun && bun.guard.ok ? ['Smart bundle with ' + bun.partner.title, 'If pre-orders are still slow a few days before the cutoff.'] : ['Harvest Rescue after picking', 'If pre-orders don\'t fill.'],
      avoid: ['Discount', 'Nothing suggests demand needs a lower price; it would give up ' + cut + '.'] });
    if (rec === 'bundle') return promoRanking('bundle', reason, { alt: ['Normal-price pre-order', 'If MEOD would rather not publish a bundle in MEOD Fresh.'], avoid: ['Broad discount', 'Cutting the shop price gives up ' + cut + ' on every sale, not just the extra ones.'] });
    return promoRanking('drop', reason, { alt: bun && bun.guard.ok ? ['Smart bundle with ' + bun.partner.title, 'Keeps this crop\'s own price if the pair appeals.'] : ['Normal-price pre-order', 'If MEOD would rather keep the price.'],
      avoid: ['A shop-wide discount', 'Keep the lower price to the drop spots only, until pre-orders close.'] });
  }
  // Approving a Harvest Drop never opens extra pre-order spots: it must fit in the spots
  // left under the batch's pre-order limit. For a discount it sets the drop price (checked by
  // Margin Guard again at that moment). Fails closed.
  function dropApply(c) {
    var d = c.drop, b = d && byId('batches', d.batchId);
    if (!b || !dropOpenable(b)) return { ok: false, error: 'That harvest no longer takes pre-orders.' };
    var pend = pendingEstimate(b);
    if (pend && pend.item.to < b.expectedQty) return { ok: false, error: 'New Harvest Drop offers for this harvest are paused: a lower estimate (' + pend.item.to + ') is waiting for the farm manager in Greenhouse rounds.' };
    if (d.qty > batchLeft(b)) return { ok: false, error: 'Only ' + batchLeft(b) + ' pre-order spots are left on this harvest, and this drop needs ' + d.qty + '. Raise the limit in Harvest Planner or redraft the drop.' };
    if (d.option === 'discount' || d.option === 'bundle') {
      var g = marginGuard(b.productId, d.priceCents, d.qty);
      if (!g.ok) return { ok: false, error: 'Margin Guard blocked it: ' + g.reasons.join('; ') + '.' };
    }
    b.drop = { campaignId: c.id, option: d.option, qty: d.qty, normalPriceCents: b.drop ? b.drop.normalPriceCents : b.preorderPriceCents,
      partnerId: d.partnerId || null, bundlePriceCents: d.bundlePriceCents || null, takenAtStart: batchPreordered(b), startedAt: new Date().toISOString() };
    if (d.option === 'discount') b.preorderPriceCents = d.priceCents;
    return { ok: true, batch: b };
  }

  // Group-buy milestones: usual weekly volume (last 4 weeks) → a goal 25% above it.
  function groupUnits(evId, sinceMs, untilMs) {
    var units = 0, buyers = {};
    state.orders.forEach(function (o) {
      var t = new Date(o.createdAt).getTime();
      if (o.groupEventId !== evId || o.status === 'cancelled' || o.status === 'refunded' || t < sinceMs || (untilMs && t > untilMs)) return;
      buyers[o.customerId] = true;
      o.items.forEach(function (i) { units += i.qty; });
    });
    return { units: units, buyers: Object.keys(buyers) };
  }
  function groupMembers(ev) {
    var ids = {};
    state.customers.forEach(function (c) { if (c.groupCode === ev.code) ids[c.id] = true; });
    state.orders.forEach(function (o) { if (o.groupEventId === ev.id) ids[o.customerId] = true; });
    return Object.keys(ids);
  }
  function milestoneIdea(ev) {
    // The goal ends when the group buy closes, if that's sooner; under 3 days isn't worth starting.
    var P = RULES.promo, now = Date.now();
    var days = Math.min(P.milestoneDays, Math.floor((new Date(ev.endsAt).getTime() - now) / 864e5));
    var hist = groupUnits(ev.id, now - 28 * 864e5);
    var margin = 0, units = 0;
    state.orders.forEach(function (o) {
      if (o.groupEventId !== ev.id || o.status === 'cancelled') return;
      o.items.forEach(function (i) { units += i.qty; margin += i.qty * (Math.round(i.priceCents * (1 - RULES.groupDiscountRate)) - unitCost(i.productId).totalCents); });
    });
    var unitMargin = units ? Math.round(margin / units) : 100;
    var baseline = Math.round(hist.units / 4 * days / 7);
    var target = Math.max(baseline + 5, Math.ceil(baseline * (1 + P.milestoneLift) / 5) * 5);
    var members = groupMembers(ev);
    var expectBuyers = Math.max(1, hist.buyers.length, Math.round(members.length / 2));
    var rewardCost = expectBuyers * P.milestoneVoucherCents, extra = (target - baseline) * unitMargin;
    return { event: ev, days: days, baseline: baseline, target: target, unitMarginCents: unitMargin, members: members, expectBuyers: expectBuyers,
      voucherCents: P.milestoneVoucherCents, rewardCostCents: rewardCost, extraMarginCents: extra, worth: extra >= rewardCost && ev.status === 'open' && days >= 3 };
  }
  function milestoneProgress(ev) {
    var m = ev.milestone;
    if (!m) return null;
    var start = new Date(m.startedAt).getTime(), end = start + m.days * 864e5;
    var g = groupUnits(ev.id, start, end);
    var state2 = m.status === 'rewarded' ? 'rewarded' : g.units >= m.target ? 'reached' : Date.now() > end ? 'missed' : 'active';
    return { target: m.target, units: g.units, buyers: g.buyers, pct: Math.min(100, Math.round(g.units / m.target * 100)), endsAt: new Date(end).toISOString(), status: state2, voucherCents: m.voucherCents };
  }
  function milestoneApply(c) {
    var ev = byId('events', c.milestone.eventId);
    if (!ev || ev.status !== 'open') return { ok: false, error: 'That group buy is closed.' };
    ev.milestone = { campaignId: c.id, target: c.milestone.target, days: c.milestone.days, voucherCents: c.milestone.voucherCents, startedAt: new Date().toISOString(), status: 'active' };
    return { ok: true };
  }
  function milestoneReward(evId) {
    var ev = byId('events', evId), pr = ev && milestoneProgress(ev);
    if (!pr || pr.status !== 'reached') return { ok: false, error: 'The goal hasn\'t been reached yet.' };
    pr.buyers.forEach(function (cid) { issueVoucher(cid, pr.voucherCents, 'campaign:' + ev.milestone.campaignId, 'Group goal reached: ' + ev.title); });
    ev.milestone.status = 'rewarded';
    ev.milestone.rewardedAt = new Date().toISOString();
    return { ok: true, count: pr.buyers.length };
  }

  // Learning-journey vouchers: recent visits (last 30 days) with visitors who opted in.
  function visitVoucherIdeas() {
    var now = Date.now();
    return state.bookings.filter(function (b) {
      var t = parseDayKey(b.date).getTime();
      return b.status === 'confirmed' && t <= now && t > now - 30 * 864e5 &&
        !(state.campaigns || []).some(function (c) { return c.kind === 'visit-voucher' && c.bookingId === b.id && c.status !== 'rejected'; });
    }).map(function (b) {
      return { booking: b, audience: state.customers.filter(function (c) { return c.bookingId === b.id && c.consentMarketing; }).map(function (c) { return c.id; }), voucherCents: RULES.promo.visitVoucherCents };
    }).filter(function (x) { return x.audience.length; });
  }

  // What Tyllage expected when a campaign was drafted, saved with it so the results can be
  // compared with the assumption rather than with hindsight. extra adds type-specific figures.
  function promoAssume(c, extra) {
    var n = (c.audience || []).length, rate = RULES.promo.assumedResponse;
    c.assumed = Object.assign({ at: new Date().toISOString(), recipients: n, buyers: Math.round(n * rate), rate: rate,
      basis: 'About ' + Math.round(rate * 100) + '% of the ' + n + ' people messaged order within ' + RULES.promo.resultDays + ' days (Settings).' }, extra || {});
    return c.assumed;
  }
  // Approve and send hooks for the promotion kinds that change something besides a message.
  // Campaigns drafted before assumptions were saved get them now, before any result exists.
  function promoOnApprove(c) {
    var r = c.kind === 'harvest-drop' ? dropApply(c) : c.kind === 'group-milestone' ? milestoneApply(c) : { ok: true };
    if (r.ok && !c.assumed) promoAssume(c, { savedAt: 'approval' });
    return r;
  }
  // Assumed vs actual, one row per figure the campaign was expected to move. "lower" rows are
  // costs, where coming in under the assumption is good.
  function assumedVsActual(c, r) {
    var a = c.assumed;
    if (!a) return [];
    var rows = [{ label: 'People who ordered', assumed: a.buyers, actual: r.buyers }];
    if (a.units != null) rows.push({ label: a.unitsLabel || 'Units', assumed: a.units, actual: a.unitsActual === 'group' ? (r.groupUnits || 0) : (r.dropTaken != null ? r.dropTaken : r.units) });
    if (a.marginCents != null) rows.push({ label: a.marginLabel || 'Margin', assumed: a.marginCents, actual: r.marginCents, money: true });
    if (a.voucherCostCents != null) rows.push({ label: 'Voucher cost', assumed: a.voucherCostCents, actual: r.voucherCostCents, money: true, lower: true });
    rows.forEach(function (x) {
      x.verdict = (x.lower ? x.actual <= x.assumed : x.actual >= x.assumed) ? 'met' : r.open ? 'counting' : 'below';
    });
    return rows;
  }
  function promoOnSend(c, recipients) {
    c.sentAt = new Date().toISOString();
    c.recipients = recipients.slice();
    if (c.kind === 'visit-voucher') recipients.forEach(function (id) { issueVoucher(id, c.voucherCents, 'campaign:' + c.id, 'Thanks for visiting MEOD'); });
  }

  // What a sent campaign led to: orders by its recipients within RULES.promo.resultDays.
  // Product campaigns count the promoted product; group, visit and win-back ones count any order.
  function campaignResult(c) {
    if (c.status !== 'sent') return null;
    var t0 = new Date(c.sentAt || c.createdAt).getTime(), t1 = t0 + RULES.promo.resultDays * 864e5;
    var type = campaignType(c), anyProduct = !c.productId || type === 'group' || type === 'visit' || type === 'reactivate';
    var who = c.recipients || c.audience || [], set = {};
    who.forEach(function (id) { set[id] = true; });
    var buyers = {}, orders = 0, units = 0, revenue = 0, margin = 0;
    state.orders.forEach(function (o) {
      var t = new Date(o.createdAt).getTime();
      if (t < t0 || t > t1 || !set[o.customerId] || o.status === 'cancelled') return;
      var hit = false;
      o.items.forEach(function (i) {
        if (!anyProduct && i.productId !== c.productId) return;
        hit = true; units += i.qty; revenue += i.qty * i.priceCents; margin += i.qty * (i.priceCents - unitCost(i.productId).totalCents);
      });
      if (hit) { orders++; buyers[o.customerId] = true; }
    });
    var vouchers = state.rewardsStore.vouchers.filter(function (v) { return v.source === 'campaign:' + c.id; });
    var used = vouchers.filter(function (v) { return v.status === 'used'; });
    var r = { type: type, recipients: who.length, buyers: Object.keys(buyers).length, orders: orders, units: units, revenueCents: revenue, marginCents: margin,
      conversionPct: who.length ? Math.round(Object.keys(buyers).length / who.length * 100) : 0, vouchersIssued: vouchers.length, vouchersUsed: used.length,
      voucherCostCents: used.reduce(function (s, v) { return s + v.valueCents; }, 0), open: Date.now() < t1 };
    if (c.drop) {
      var b = byId('batches', c.drop.batchId);
      if (b) { r.dropTaken = Math.max(0, batchPreordered(b) - (b.drop && b.drop.campaignId === c.id ? b.drop.takenAtStart : 0)); r.dropQty = c.drop.qty; }
    }
    if (c.milestone) {
      var ev = byId('events', c.milestone.eventId), pr = ev && ev.milestone && ev.milestone.campaignId === c.id ? milestoneProgress(ev) : null;
      r.groupUnits = pr ? pr.units : 0;
    }
    r.assumed = c.assumed || null;
    r.vsAssumed = assumedVsActual(c, r);
    return r;
  }
  function promoResultsByType() {
    var by = {};
    state.campaigns.forEach(function (c) {
      var r = campaignResult(c);
      if (!r) return;
      var x = by[r.type] || (by[r.type] = { type: r.type, campaigns: 0, recipients: 0, buyers: 0, revenueCents: 0, marginCents: 0, voucherCostCents: 0, assumedBuyers: 0, withAssumed: 0, met: 0, settled: 0 });
      x.campaigns++; x.recipients += r.recipients; x.buyers += r.buyers; x.revenueCents += r.revenueCents; x.marginCents += r.marginCents; x.voucherCostCents += r.voucherCostCents;
      if (r.assumed) {
        x.withAssumed++; x.assumedBuyers += r.assumed.buyers;
        // A campaign "met" its assumption when every row did; only finished ones count.
        if (!r.open) { x.settled++; if (r.vsAssumed.every(function (v) { return v.verdict === 'met'; })) x.met++; }
      }
    });
    return Object.keys(by).map(function (k) {
      var x = by[k];
      x.conversionPct = x.recipients ? Math.round(x.buyers / x.recipients * 100) : 0;
      x.netCents = x.marginCents - x.voucherCostCents;
      x.enough = x.campaigns >= 3;
      return x;
    }).sort(function (a, b) { return b.netCents - a.netCents; });
  }

  /* ---------- Greenhouse rounds (worker inspections) ----------
   * Workers keep walking their usual rounds; there's no drone. For each growing batch they
   * take a photo (leafy crops get the leaf-colour check from grade.js), confirm its condition
   * and estimate the harvest. When every batch is checked, the round is sent automatically:
   * estimates within ±RULES.inspect.autoApplyPct update the batch straight away, so Demand
   * Radar, Harvest Drops and Campaign Advisor recalculate. Bigger changes, and anything
   * marked "Needs review", wait for the farm manager. The photo check judges looks only. */
  var CONDITIONS = {
    healthy: { label: 'Healthy', tone: 'green', note: 'Normal growth.' },
    monitor: { label: 'Monitor', tone: 'amber', note: 'Possible stress. Check again next round.' },
    review: { label: 'Needs review', tone: 'red', note: 'The farm manager should look at it.' }
  };
  var GRADE_CONDITION = { A: 'healthy', cosmetic: 'monitor', check: 'review' };
  function batchGreenhouse(b) { return b.greenhouse || greenhouseName(state.batches.indexOf(b)); }
  // Growing batches only: planned ones aren't sown yet, and due ones are being harvested.
  function inspectableBatches() {
    return state.batches.filter(function (b) { return batchStage(b) === 'growing'; }).sort(function (a, b) {
      var ga = batchGreenhouse(a), gb = batchGreenhouse(b);
      return ga < gb ? -1 : ga > gb ? 1 : a.harvestDate < b.harvestDate ? -1 : 1;
    });
  }
  function openRound() { return (state.rounds || []).filter(function (r) { return r.status === 'open'; })[0] || null; }
  function roundInspections(roundId) {
    var latest = {};
    (state.inspections || []).forEach(function (i) { if (i.roundId === roundId) latest[i.batchId] = i; });
    return latest;
  }
  // Today's checklist: every growing batch, with this round's inspection if there is one.
  function roundStatus(round) {
    var done = round ? roundInspections(round.id) : {};
    var rows = inspectableBatches().map(function (b) { return { batch: b, product: byId('products', b.productId), greenhouse: batchGreenhouse(b), inspection: done[b.id] || null }; });
    var checked = rows.filter(function (r) { return r.inspection; }).length;
    return { round: round, rows: rows, checked: checked, total: rows.length, complete: rows.length > 0 && checked === rows.length };
  }
  function inspectionSave(data, actor) {
    var b = byId('batches', data.batchId);
    if (!b || batchStage(b) !== 'growing') return { ok: false, error: 'That batch isn\'t growing any more.' };
    if (!CONDITIONS[data.condition]) return { ok: false, error: 'Choose the crop\'s condition.' };
    var est = Math.round(Number(data.estQty));
    if (!(est >= 0) || est > b.expectedQty * 3 + 20) return { ok: false, error: 'Enter an estimated harvest between 0 and ' + (b.expectedQty * 3 + 20) + '.' };
    state.inspections = state.inspections || []; state.rounds = state.rounds || [];
    var round = openRound();
    if (!round) { round = { id: nextId('GR'), dayKey: bagDayKey(new Date()), status: 'open', startedAt: new Date().toISOString(), startedBy: actor }; state.rounds.unshift(round); }
    // Optional reading from a thermometer inside the greenhouse: kept apart from NEA's outdoor forecast.
    var indoor = null;
    if (data.indoor && (data.indoor.tempC !== '' && data.indoor.tempC != null || data.indoor.humidity !== '' && data.indoor.humidity != null)) {
      var tc = data.indoor.tempC === '' || data.indoor.tempC == null ? null : Number(data.indoor.tempC);
      var hu = data.indoor.humidity === '' || data.indoor.humidity == null ? null : Number(data.indoor.humidity);
      if (tc != null && !(tc >= 10 && tc <= 50)) return { ok: false, error: 'Greenhouse temperature should be between 10 and 50°C.' };
      if (hu != null && !(hu >= 1 && hu <= 100)) return { ok: false, error: 'Greenhouse humidity should be between 1 and 100%.' };
      indoor = { tempC: tc == null ? null : Math.round(tc * 10) / 10, humidity: hu == null ? null : Math.round(hu), source: 'Worker reading (greenhouse thermometer)' };
    }
    var rec = { id: nextId('IN'), roundId: round.id, batchId: b.id, greenhouse: batchGreenhouse(b), at: new Date().toISOString(), by: actor,
      condition: data.condition, estQty: est, expectedBefore: b.expectedQty, notes: String(data.notes || '').trim().slice(0, 280),
      photo: data.photo || null, indoor: indoor, weather: weatherSnapshot(data.weather) };
    state.inspections.push(rec);
    var st = roundStatus(round);
    // The last batch checked sends the whole round.
    var sent = st.complete ? roundSubmit(round.id, actor) : null;
    return { ok: true, inspection: rec, round: round, status: st, sent: sent };
  }
  // Every change to a batch's estimate is logged (worker inspections themselves are never
  // edited). A confirmed shortfall creates follow-up tasks for sales; a recovery closes them.
  // The outdoor forecast in force when the inspection was saved: what it said, for where,
  // when NEA issued it, and whether it was live or demo weather. A forecast, not a reading.
  function weatherSnapshot(w) {
    if (!w || !w.day) return null;
    return { kind: 'Outdoor forecast', source: w.source === 'live' ? 'NEA via data.gov.sg' : 'Demo weather (simulated)', live: w.source === 'live', area: w.area,
      issuedAt: w.updated || null, capturedAt: new Date().toISOString(), now: w.now ? w.now.text : null, nowValid: w.now ? w.now.until : null,
      forecast: w.day.text, lowC: w.day.low, highC: w.day.high, humidityHigh: w.day.humHigh };
  }
  // Is a batch getting better or worse? Worker-confirmed conditions only (never the photo's
  // suggestion), one per round, last 21 days. Fewer than 2 rounds → "Insufficient history".
  function batchTrend(batchId) {
    var since = Date.now() - 21 * 864e5, perRound = {};
    (state.inspections || []).forEach(function (i) {
      if (i.batchId !== batchId || new Date(i.at).getTime() < since) return;
      if (!perRound[i.roundId] || perRound[i.roundId].at < i.at) perRound[i.roundId] = i;
    });
    var list = Object.keys(perRound).map(function (k) { return perRound[k]; }).sort(function (a, b) { return a.at < b.at ? -1 : 1; });
    if (list.length < 2) return { key: 'insufficient', label: 'Insufficient history', tone: 'grey', points: list, note: list.length ? 'Only one round has checked this batch so far.' : 'Not inspected yet.' };
    var last = CONDITION_RANK[list[list.length - 1].condition], prev = CONDITION_RANK[list[list.length - 2].condition];
    var key = last < prev ? 'improving' : last > prev ? 'worsening' : 'stable';
    var LBL = { improving: ['Improving', 'green'], stable: ['Stable', 'blue'], worsening: ['Worsening', 'red'] };
    return { key: key, label: LBL[key][0], tone: LBL[key][1], points: list,
      note: 'Worker-confirmed condition over the last ' + list.length + ' rounds: ' + list.map(function (i) { return CONDITIONS[i.condition].label; }).join(' → ') + '.' };
  }
  function applyEstimate(b, qty, meta) {
    var pre = batchPreordered(b), from = b.expectedQty;
    b.expectedQty = qty;
    // Pre-order spots never exceed the new estimate, and never drop below what's already taken.
    b.preorderCap = Math.max(pre, Math.min(b.preorderCap, qty));
    state.estimateLog = state.estimateLog || [];
    state.estimateLog.push(Object.assign({ batchId: b.id, at: new Date().toISOString(), from: from, to: qty }, meta || {}));
    var risk = commitmentRisk(b, qty, false);
    var tasks = syncRiskTasks(b, risk, meta && meta.by);
    return { risk: risk, tasksCreated: tasks.created, tasksClosed: tasks.closed };
  }

  /* ---- Harvest commitment risk ----
   * What a batch has actually promised: confirmed trade orders and accepted-quote deliveries
   * in the batch's window (its harvest day up to the next batch of the same crop), plus the
   * batch's own pre-orders. Usual shop sales are estimates, so they're left out. Each
   * commitment is keyed by its underlying order or reservation, so the same order can't be
   * counted twice (a pre-order turned into a trade order carries fromOrderId). */
  function batchWindow(b) {
    var next = batchesUpcoming().filter(function (x) { return x.productId === b.productId && x.harvestDate > b.harvestDate; })[0];
    var days = next ? Math.max(2, Math.round((parseDayKey(next.harvestDate) - parseDayKey(b.harvestDate)) / 864e5)) : 7;
    return { from: b.harvestDate, to: bagDayKey(new Date(parseDayKey(b.harvestDate).getTime() + days * 864e5)), days: days };
  }
  function batchCommitments(b) {
    var w = batchWindow(b), byKey = {}, rows = [];
    function add(key, row) {
      if (byKey[key]) { byKey[key].qty += row.qty; return; }
      row.key = key; byKey[key] = row; rows.push(row);
    }
    b2bStore().orders.forEach(function (o) {
      if (o.status !== 'confirmed' || o.deliveryDay < w.from || o.deliveryDay >= w.to) return;
      var qty = o.items.reduce(function (t, i) { return t + (i.productId === b.productId ? i.qty : 0); }, 0);
      var acc = byId_safe(b2bStore().accounts, o.accountId);
      if (qty) add('order:' + (o.fromOrderId || o.id), { kind: 'trade', ref: o.ref, who: acc ? acc.name : 'Trade buyer', qty: qty, dayKey: o.deliveryDay, orderId: o.id });
    });
    (state.commitments || []).filter(function (c) { return c.status === 'active' && c.productId === b.productId; }).forEach(function (c) {
      var end = bagDayKey(new Date(parseDayKey(c.startKey).getTime() + c.weeks * 7 * 864e5));
      for (var d = parseDayKey(w.from > c.startKey ? w.from : c.startKey); bagDayKey(d) < w.to && bagDayKey(d) < end; d = new Date(d.getTime() + 864e5)) {
        if (c.days.indexOf(d.getDay()) > -1) add('commitment:' + c.id + ':' + bagDayKey(d), { kind: 'trade', ref: c.id + ' (standing)', who: c.buyerName, qty: c.unitsPerDelivery, dayKey: bagDayKey(d) });
      }
    });
    batchLines(b.id).forEach(function (l) {
      var cu = byId('customers', l.order.customerId);
      add('order:' + l.order.id, { kind: 'preorder', ref: l.order.ref, who: cu ? cu.name : 'Customer', customerId: l.order.customerId, qty: l.item.qty, at: l.order.createdAt, orderId: l.order.id });
    });
    return rows;
  }
  function byId_safe(list, id) { return (list || []).filter(function (x) { return x.id === id; })[0] || null; }
  // Serve commitments in the farm's usual priority: trade orders by delivery day, then
  // pre-orders oldest first. Whatever the estimate can't cover is at risk.
  function commitmentRisk(b, estimate, pending) {
    var rows = batchCommitments(b).sort(function (x, y) {
      if (x.kind !== y.kind) return x.kind === 'trade' ? -1 : 1;
      return x.kind === 'trade' ? (x.dayKey < y.dayKey ? -1 : 1) : (x.at < y.at ? -1 : 1);
    });
    var left = estimate;
    rows.forEach(function (r) { r.covered = Math.max(0, Math.min(r.qty, left)); left -= r.covered; r.short = r.qty - r.covered; r.status = !r.short ? 'covered' : r.covered ? 'partial' : 'at-risk'; });
    var trade = rows.filter(function (r) { return r.kind === 'trade'; }).reduce(function (s, r) { return s + r.qty; }, 0);
    var preorder = rows.filter(function (r) { return r.kind === 'preorder'; }).reduce(function (s, r) { return s + r.qty; }, 0);
    return { batch: b, estimate: estimate, planned: b.expectedQty, trade: trade, preorder: preorder, confirmed: trade + preorder,
      shortfall: Math.max(0, trade + preorder - estimate), pending: Boolean(pending), rows: rows, affected: rows.filter(function (r) { return r.short; }) };
  }
  // A held (unapproved) estimate for this batch, if any.
  function pendingEstimate(b) {
    var out = null;
    (state.rounds || []).forEach(function (r) { (r.items || []).forEach(function (it) { if (it.batchId === b.id && it.status === 'held') out = { round: r, item: it }; }); });
    return out;
  }
  // Potential risks (a lower estimate waiting for review) and confirmed ones (the plan itself
  // is below what's been promised), across growing batches.
  function commitmentRisks() {
    var out = [];
    inspectableBatches().forEach(function (b) {
      var p = pendingEstimate(b);
      var r = p ? commitmentRisk(b, p.item.to, true) : commitmentRisk(b, b.expectedQty, false);
      if (r.shortfall > 0) { r.held = p; out.push(r); }
    });
    return out.sort(function (a, b) { return (a.pending ? 1 : 0) - (b.pending ? 1 : 0) || b.shortfall - a.shortfall; });
  }
  // Internal follow-up tasks for sales: one per affected order, never a customer message.
  function syncRiskTasks(b, risk, actor) {
    state.tasks = state.tasks || [];
    var created = 0, closed = 0, keys = {};
    risk.affected.forEach(function (r) {
      var key = b.id + '|' + r.key;
      keys[key] = true;
      // One task per order: an open one stands, and one sales already dealt with isn't reopened.
      if (state.tasks.some(function (t) { return t.key === key && (t.status === 'open' || t.status === 'done'); })) return;
      var p = byId('products', b.productId);
      state.tasks.unshift({ id: nextId('TK'), key: key, kind: 'commitment-risk', batchId: b.id, status: 'open', createdAt: new Date().toISOString(), createdBy: actor || 'Tyllage',
        // Customer names aren't stored in the task: the portal shows them masked or not, by role.
        title: (r.kind === 'trade' ? 'Trade order ' + r.ref + ' (' + r.who + ')' : 'Pre-order ' + r.ref) + ': ' + r.short + ' of ' + r.qty + ' ' + p.title + ' may not be covered', customerId: r.customerId || null,
        detail: 'The ' + p.title + ' estimate for ' + batchGreenhouse(b) + ' (harvest ' + shortDayLabel(b.harvestDate) + ') is now ' + risk.estimate + ' against ' + risk.confirmed + ' confirmed. Agree a smaller quantity, a substitute or a later delivery with the customer.',
        dueKey: r.dayKey || b.harvestDate, orderRef: r.ref });
      created++;
    });
    state.tasks.forEach(function (t) {
      if (t.batchId === b.id && t.kind === 'commitment-risk' && t.status === 'open' && !keys[t.key]) { t.status = 'resolved'; t.closedAt = new Date().toISOString(); t.note = 'The estimate now covers this order.'; closed++; }
    });
    return { created: created, closed: closed };
  }
  function taskClose(id, actor, note) {
    var t = byId('tasks', id);
    if (!t || t.status !== 'open') return { ok: false, error: 'That task is already closed.' };
    t.status = 'done'; t.closedAt = new Date().toISOString(); t.closedBy = actor; t.note = String(note || '').trim().slice(0, 200);
    return { ok: true, task: t };
  }

  // One batch's evidence: every inspection (as the worker sent it), what happened to it,
  // the manager's decisions and every change to the estimate.
  var INSPECTION_STATUS = { draft: ['Draft (round not sent)', 'grey'], replaced: ['Replaced by a later check', 'grey'], same: ['Accepted · no change', 'green'],
    applied: ['Accepted automatically', 'green'], held: ['Review required', 'amber'], approved: ['Accepted by manager', 'green'], kept: ['Not accepted · plan kept', 'grey'] };
  function batchHistory(batchId) {
    var list = (state.inspections || []).filter(function (i) { return i.batchId === batchId; }).sort(function (a, b) { return a.at < b.at ? 1 : -1; });
    var rows = list.map(function (i) {
      var r = byId('rounds', i.roundId), key;
      if (!r || r.status === 'open') key = roundInspections(i.roundId)[batchId] === i ? 'draft' : 'replaced';
      else { var it = (r.items || []).filter(function (x) { return x.inspectionId === i.id; })[0]; key = it ? it.status : 'replaced'; }
      var item = r && (r.items || []).filter(function (x) { return x.inspectionId === i.id; })[0] || null;
      return { inspection: i, round: r, item: item, statusKey: key, status: INSPECTION_STATUS[key] };
    });
    return { inspections: rows, log: (state.estimateLog || []).filter(function (e) { return e.batchId === batchId; }).sort(function (a, b) { return a.at < b.at ? 1 : -1; }) };
  }
  function roundSubmit(roundId, actor) {
    var round = byId('rounds', roundId);
    if (!round || round.status !== 'open') return { ok: false, error: 'This round has already been sent.' };
    var latest = roundInspections(roundId), items = [];
    inspectableBatches().forEach(function (b) {
      var i = latest[b.id];
      if (!i) { items.push({ batchId: b.id, status: 'unchecked', from: b.expectedQty, to: b.expectedQty }); return; }
      var from = b.expectedQty, change = from ? Math.abs(i.estQty - from) / from : 1;
      var held = i.condition === 'review' || change > RULES.inspect.autoApplyPct;
      var it = { batchId: b.id, inspectionId: i.id, condition: i.condition, from: from, to: i.estQty, changePct: Math.round((i.estQty - from) / (from || 1) * 100),
        status: held ? 'held' : i.estQty === from ? 'same' : 'applied', reason: i.condition === 'review' ? 'Marked "Needs review"' : held ? 'Changes the estimate by more than ' + Math.round(RULES.inspect.autoApplyPct * 100) + '%' : null };
      if (!held && i.estQty !== from) {
        var ap = applyEstimate(b, i.estQty, { by: actor, source: 'Round update (within ±' + Math.round(RULES.inspect.autoApplyPct * 100) + '%)', roundId: roundId, inspectionId: i.id });
        it.shortfall = ap.risk.shortfall; it.tasksCreated = ap.tasksCreated;
      }
      b.health = { condition: i.condition, at: i.at, by: i.by, inspectionId: i.id };
      items.push(it);
    });
    round.status = 'submitted'; round.submittedAt = new Date().toISOString(); round.submittedBy = actor; round.items = items;
    return { ok: true, round: round, applied: items.filter(function (x) { return x.status === 'applied'; }).length, held: items.filter(function (x) { return x.status === 'held'; }).length };
  }
  // The farm manager approves a held estimate (it updates the batch) or keeps the old one.
  // The decision is recorded on the round item; the worker's inspection stays as it was sent.
  function roundReview(roundId, batchId, approve, actor, reason) {
    var round = byId('rounds', roundId), it = round && (round.items || []).filter(function (x) { return x.batchId === batchId && x.status === 'held'; })[0];
    var b = byId('batches', batchId);
    if (!it || !b) return { ok: false, error: 'Nothing waiting for review here.' };
    reason = String(reason || '').trim().slice(0, 200);
    var ap = null;
    if (approve) {
      ap = applyEstimate(b, it.to, { by: actor, source: 'Approved by the farm manager', roundId: roundId, inspectionId: it.inspectionId, reason: reason });
      it.shortfall = ap.risk.shortfall; it.tasksCreated = ap.tasksCreated;
    }
    if (b.health) b.health.reviewed = true;
    it.status = approve ? 'approved' : 'kept'; it.reviewedBy = actor; it.reviewedAt = new Date().toISOString(); it.decisionReason = reason;
    return { ok: true, item: it, batch: b, risk: ap && ap.risk, tasksCreated: ap ? ap.tasksCreated : 0 };
  }
  // A flagged batch's suggestion reads "Hold promotions" rather than "No promotion needed".
  function flaggedRanking(reason) {
    var r = promoRanking('none', reason, { alt: ['Review it in Greenhouse rounds', 'Approve or keep the worker\'s estimate; Tyllage then re-ranks this harvest.'], avoid: ['Promoting it now', 'If the crop has a problem, a promotion would sell produce that may not be up to standard.'] });
    r[0].label = 'Hold promotions';
    return r;
  }
  function heldEstimates() {
    var out = [];
    (state.rounds || []).forEach(function (r) { (r.items || []).forEach(function (it) { if (it.status === 'held') out.push({ round: r, item: it, batch: byId('batches', it.batchId), inspection: byId('inspections', it.inspectionId) }); }); });
    return out.filter(function (x) { return x.batch && batchStage(x.batch) === 'growing'; });
  }

  /* ---------- Greenhouse health map ----------
   * One tile per greenhouse: the worst latest condition of its growing batches, and how long
   * since anyone checked. Not checked for RULES.inspect.staleDays → the tile fades. */
  var CONDITION_RANK = { healthy: 1, monitor: 2, review: 3 };
  function greenhouseHealth() {
    var latest = {};
    (state.inspections || []).forEach(function (i) { if (!latest[i.batchId] || latest[i.batchId].at < i.at) latest[i.batchId] = i; });
    var out = [];
    for (var n = 0; n < RULES.inspect.greenhouses; n++) {
      var name = greenhouseName(n);
      var rows = inspectableBatches().filter(function (b) { return batchGreenhouse(b) === name; }).map(function (b) { return { batch: b, product: byId('products', b.productId), inspection: latest[b.id] || null }; });
      var worst = null, lastAt = null;
      rows.forEach(function (r) {
        if (!r.inspection) return;
        if (!worst || CONDITION_RANK[r.inspection.condition] > CONDITION_RANK[worst]) worst = r.inspection.condition;
        if (!lastAt || r.inspection.at > lastAt) lastAt = r.inspection.at;
      });
      var age = lastAt ? (Date.now() - new Date(lastAt).getTime()) / 864e5 : null;
      out.push({ name: name, rows: rows, condition: worst, lastAt: lastAt, ageDays: age, stale: !lastAt || age > RULES.inspect.staleDays,
        unchecked: rows.filter(function (r) { return !r.inspection; }).length });
    }
    return out;
  }

  /* ---------- Weather-aware advice ----------
   * The weather itself is NEA's public forecast (data.gov.sg, fetched by the portal); these
   * rules only turn it into farm advice: which greenhouses to check first on a hot day,
   * when showers will hit deliveries, and when humidity means checking for rot. */
  function weatherAdvice(w) {
    var out = [];
    if (!w) return out;
    var leafy = greenhouseHealth().filter(function (g) { return g.rows.some(function (r) { return ['asian-greens', 'lettuces', 'herbs'].indexOf(r.product.category) > -1; }); });
    // Greenhouses with a crop already under watch go first.
    leafy.sort(function (a, b) { return (CONDITION_RANK[b.condition] || 0) - (CONDITION_RANK[a.condition] || 0); });
    var fungi = greenhouseHealth().filter(function (g) { return g.rows.some(function (r) { return r.product.category === 'fungi' || r.product.category === 'lettuces'; }); });
    var wet = /shower|rain|thunder/i, thunder = /thunder/i;
    var rainy = (w.periods || []).filter(function (p) { return wet.test(p.text); });
    // Everything below is a forecast risk, never a report that it's happening at the farm.
    if (w.day && w.day.high >= 33) {
      out.push({ key: 'heat', tone: 'amber', title: 'Forecast: hot, up to ' + w.day.high + '°C outdoors',
        text: 'Check the leafy greens in ' + leafy.slice(0, 3).map(function (g) { return g.name; }).join(', ') + ' first for wilting, ideally before noon. Inside the greenhouses can differ; a thermometer reading tells you.', greenhouses: leafy.slice(0, 3).map(function (g) { return g.name; }) });
    }
    if (rainy.length) {
      var first = rainy[0], days = [], visits = [];
      rainy.forEach(function (p) {
        for (var d = new Date(p.start); d < new Date(p.end); d = new Date(d.getTime() + 3600e3)) {
          var key = bagDayKey(d);
          if (DELIVERY_DAYS.indexOf(d.getDay()) > -1 && d.getHours() >= 8 && d.getHours() < 20 && days.indexOf(key) < 0) days.push(key);
          // Learning journeys run in the daytime (9am–5pm) and are partly outdoors.
          if (d.getHours() >= 9 && d.getHours() < 17) state.bookings.forEach(function (b) { if (b.status === 'confirmed' && b.date === key && visits.indexOf(b) < 0) visits.push(b); });
        }
      });
      out.push({ key: 'rain', tone: 'blue', title: 'Forecast: ' + first.text.toLowerCase() + ', ' + first.label.charAt(0).toLowerCase() + first.label.slice(1),
        text: (thunder.test(first.text) ? 'Plan moves between greenhouses around it. If you hear thunder or NEA issues a warning, follow official safety guidance and stay out of open ground. ' : 'Plan outdoor work around it. ') +
          (days.length ? days.map(function (k) { return shortDayLabel(k); }).join(' and ') + ' deliveries may run late: pack early and warn the drivers.' : 'No delivery runs fall in that window.') });
      visits.forEach(function (b) {
        out.push({ key: 'visit', tone: 'amber', title: 'Farm visit in the forecast window: ' + (b.org || b.name),
          text: shortDayLabel(b.date) + ', ' + b.pax + ' guests (' + b.experience + '). Review the outdoor parts of the route and have an indoor alternative ready. The farm manager decides on the day.', bookingId: b.id });
      });
    }
    if (w.day && w.day.humHigh >= 90 && rainy.length) {
      out.push({ key: 'humid', tone: 'amber', title: 'Forecast: very humid, up to ' + w.day.humHigh + '%',
        text: 'Look for mould or soft rot on mushrooms and lettuces in ' + fungi.slice(0, 3).map(function (g) { return g.name; }).join(', ') + '.' });
    }
    if (!out.length) out.push({ key: 'fair', tone: 'green', title: w.day ? w.day.text + ', ' + w.day.low + '–' + w.day.high + '°C' : 'Fair weather', text: 'Nothing unusual. A normal round.' });
    return out;
  }

  /* ---------- Learning from inspections ----------
   * Two measured things, not claims:
   * 1. Labelled examples: each time a worker confirms or overrides the photo check, that's a
   *    label. Agreement shows whether the colour check can be trusted.
   * 2. Estimate accuracy: when a batch is harvested, its last worker estimate is compared with
   *    the real yield. A steady bias per crop becomes a suggested correction.
   * This is the dataset a trained model would need later. */
  function archiveHarvest(b) {
    var ins = (state.inspections || []).filter(function (i) {
      var r = byId('rounds', i.roundId);
      return i.batchId === b.id && r && r.status === 'submitted';
    }).sort(function (x, y) { return x.at < y.at ? 1 : -1; })[0];
    if (!ins) return;
    state.harvestRecords = state.harvestRecords || [];
    state.harvestRecords.push({ productId: b.productId, batchId: b.id, greenhouse: batchGreenhouse(b), harvestedAt: b.harvestedAt, estimate: ins.estQty, actual: b.actualQty,
      condition: ins.condition, photoGrade: ins.photo ? ins.photo.grade : null, demo: false });
  }
  function learningExamples() {
    var ex = [];
    (state.inspections || []).forEach(function (i) {
      if (i.photo && GRADE_CONDITION[i.photo.grade]) ex.push({ suggested: GRADE_CONDITION[i.photo.grade], chosen: i.condition, simulated: Boolean(i.photo.simulated), demo: false, at: i.at });
    });
    (state.harvestRecords || []).forEach(function (r) {
      if (GRADE_CONDITION[r.photoGrade]) ex.push({ suggested: GRADE_CONDITION[r.photoGrade], chosen: r.condition, simulated: false, demo: Boolean(r.demo), at: r.harvestedAt });
    });
    return ex;
  }
  function estimateBias(productId) {
    var recs = (state.harvestRecords || []).filter(function (r) { return r.productId === productId && r.actual > 0; });
    var n = recs.length;
    var mean = n ? recs.reduce(function (s, r) { return s + (r.estimate - r.actual) / r.actual; }, 0) / n : 0;
    var ok = n >= RULES.inspect.minHarvestsForBias && Math.abs(mean) >= 0.05;
    return { productId: productId, n: n, biasPct: Math.round(mean * 100), factor: 1 / (1 + mean), ok: ok, demo: recs.some(function (r) { return r.demo; }) };
  }
  // A worker's estimate adjusted by that crop's measured habit (only once there's enough history).
  function correctedEstimate(productId, est) {
    var b = estimateBias(productId);
    return b.ok ? { value: Math.round(est * b.factor), bias: b } : null;
  }
  function learningStats() {
    var ex = learningExamples();
    var agree = ex.filter(function (e) { return e.suggested === e.chosen; }).length;
    var matrix = {};
    Object.keys(CONDITIONS).forEach(function (s) { matrix[s] = {}; Object.keys(CONDITIONS).forEach(function (c) { matrix[s][c] = 0; }); });
    ex.forEach(function (e) { matrix[e.suggested][e.chosen]++; });
    var ids = {};
    (state.harvestRecords || []).forEach(function (r) { ids[r.productId] = true; });
    var crops = Object.keys(ids).map(function (id) { var b = estimateBias(id); b.product = byId('products', id); return b; })
      .filter(function (b) { return b.product; }).sort(function (a, b) { return Math.abs(b.biasPct) - Math.abs(a.biasPct); });
    return { examples: ex.length, agree: agree, agreementPct: ex.length ? Math.round(agree / ex.length * 100) : null,
      fromDemoPhotos: ex.filter(function (e) { return e.simulated; }).length, fromDemoHistory: ex.filter(function (e) { return e.demo; }).length,
      overflags: ex.filter(function (e) { return CONDITION_RANK[e.suggested] > CONDITION_RANK[e.chosen]; }).length,
      underflags: ex.filter(function (e) { return CONDITION_RANK[e.suggested] < CONDITION_RANK[e.chosen]; }).length,
      matrix: matrix, crops: crops, harvests: (state.harvestRecords || []).length };
  }

  /* ---------- Seasonal and festive demand ----------
   * Singapore's festivals move demand for particular greens (steamboat for Dongzhi and the
   * Chinese New Year reunion dinner, salads at Christmas, sayur for Hari Raya…). Dates are
   * Singapore's public-holiday calendar where there is one; demand uplifts are illustrative
   * until MEOD's own sales history replaces them. */
  var FESTIVALS = [
    { key: 'deepavali-26', name: 'Deepavali', date: '2026-11-08', uplift: 0.25, crops: ['Bayam', 'Garden Mint', 'Kangkong'], why: 'Home cooking for family visits (spinach dishes, mint chutney).' },
    { key: 'dongzhi-26', name: 'Dongzhi (Winter Solstice)', date: '2026-12-22', uplift: 0.2, crops: ['Xiao Bai Cai', 'HK Cai Xin', 'Shiitake Mushroom'], why: 'Family steamboat dinners.' },
    { key: 'christmas-26', name: 'Christmas', date: '2026-12-25', uplift: 0.3, crops: ['Cos Lettuce', 'Mesclun Mix', 'Mizuna', 'Sweet Basil'], why: 'Salads and party platters.' },
    { key: 'cny-27', name: 'Chinese New Year', date: '2027-02-06', uplift: 0.4, crops: ['Xiao Bai Cai', 'HK Cai Xin', 'Kai Lan', 'Shiitake Mushroom', 'Oyster Mushroom'], why: 'Reunion-dinner steamboat on the eve (5 Feb) and visiting meals.' },
    { key: 'hrp-27', name: 'Hari Raya Puasa', date: '2027-03-10', approx: true, uplift: 0.25, crops: ['Kangkong', 'Bayam'], why: 'Sayur lodeh and festive cooking. The date depends on the moon sighting.' },
    { key: 'hrh-27', name: 'Hari Raya Haji', date: '2027-05-17', approx: true, uplift: 0.15, crops: ['Kangkong', 'Bayam'], why: 'Festive meals. The date depends on the moon sighting.' }
  ];
  var FESTIVE_WINDOW_DAYS = 10;   // demand builds over the 10 days before a festival
  function festiveOutlook(days) {
    var now = new Date(); now.setHours(0, 0, 0, 0);
    var until = now.getTime() + (days || 150) * 864e5;
    return FESTIVALS.filter(function (f) { var t = parseDayKey(f.date).getTime(); return t >= now.getTime() && t <= until; }).map(function (f) {
      var day = parseDayKey(f.date), daysAway = Math.round((day - now) / 864e5);
      var from = bagDayKey(new Date(day.getTime() - FESTIVE_WINDOW_DAYS * 864e5));
      var crops = f.crops.map(function (title) {
        var p = state.products.filter(function (x) { return x.title === title; })[0];
        if (!p) return null;
        var weekly = Math.max(1, weeklySales(p.id));
        var demand = Math.round(weekly * FESTIVE_WINDOW_DAYS / 7 * (1 + f.uplift));
        var supply = state.batches.filter(function (b) { return b.productId === p.id && b.status !== 'cancelled' && b.harvestDate >= from && b.harvestDate <= f.date; })
          .reduce(function (s, b) { return s + (b.status === 'harvested' ? b.actualQty || 0 : b.expectedQty); }, 0);
        var grow = RULES.growDays[p.category] || 30;
        var sowBy = new Date(day.getTime() - (grow + 3) * 864e5), toSow = Math.round((sowBy - now) / 864e5);
        var gap = demand - supply;
        return { product: p, weekly: weekly, demand: demand, supply: supply, gap: gap, growDays: grow, sowBy: bagDayKey(sowBy), daysToSow: toSow,
          action: gap <= 0 ? 'covered' : toSow >= 0 ? 'sow' : 'late' };
      }).filter(Boolean);
      return { festival: f, day: f.date, daysAway: daysAway, crops: crops, short: crops.filter(function (c) { return c.gap > 0; }) };
    });
  }

  // Supermarket price checks entered by staff, compared with MEOD's own price.
  var MARKET_STORES = ['FairPrice', 'Cold Storage', 'Sheng Siong', 'Giant', 'Wet market', 'Other'];
  function marketPriceAdd(x, actor) {
    var p = byId('products', x.productId);
    if (!p) return { ok: false, error: 'Choose a product.' };
    if (MARKET_STORES.indexOf(x.store) < 0) return { ok: false, error: 'Choose a store.' };
    if (!(x.priceCents > 0) || x.priceCents > 10000) return { ok: false, error: 'Enter the price for a similar pack, between S$0.01 and S$100.' };
    state.marketPrices = state.marketPrices || [];
    var rec = { id: nextId('MP'), productId: p.id, store: x.store, priceCents: Math.round(x.priceCents), note: String(x.note || '').trim().slice(0, 80), at: new Date().toISOString(), by: actor };
    state.marketPrices.unshift(rec);
    return { ok: true, record: rec };
  }
  function marketCompare(days) {
    var since = Date.now() - (days || 30) * 864e5, by = {};
    (state.marketPrices || []).forEach(function (m) { if (new Date(m.at).getTime() >= since) (by[m.productId] = by[m.productId] || []).push(m); });
    return Object.keys(by).map(function (id) {
      var p = byId('products', id), list = by[id];
      var avg = Math.round(list.reduce(function (s, m) { return s + m.priceCents; }, 0) / list.length);
      var diff = Math.round((p.priceCents - avg) / avg * 100);
      return { product: p, checks: list, avgCents: avg, minCents: Math.min.apply(null, list.map(function (m) { return m.priceCents; })), maxCents: Math.max.apply(null, list.map(function (m) { return m.priceCents; })),
        diffPct: diff, position: diff > 15 ? 'premium' : diff < -15 ? 'below' : 'at' };
    }).sort(function (a, b) { return b.diffPct - a.diffPct; });
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

  /* ---------- Tyllage AI Decision Ledger ----------
   * Every AI suggestion staff act on is recorded with its explanation: the data it used, the
   * calculation, the assumptions, how confident it is (and why), who decided, and — later —
   * what happened. Explanations are built from the same numbers the suggestion used, so they
   * can always be traced. Follows the explainability and human-oversight principles of
   * Singapore's Model AI Governance Framework: the AI recommends, a person decides.
   */
  function ledgerLog(e, actor) {
    state.decisions = state.decisions || [];
    var id = nextId('DL');
    state.decisions.unshift(Object.assign({ id: id, status: 'suggested', createdAt: new Date().toISOString(), createdBy: actor || null, decidedBy: null, decidedAt: null, outcome: null }, e));
    return id;
  }
  function ledgerFind(ref) { return (state.decisions || []).filter(function (d) { return d.id === ref || (d.ref && d.ref === ref); })[0] || null; }
  function ledgerDecide(ref, status, actor, note) {
    var d = ledgerFind(ref);
    if (!d) return null;
    d.status = status; d.decidedBy = actor; d.decidedAt = new Date().toISOString(); if (note) d.decisionNote = note;
    return d;
  }
  function ledgerOutcome(ref, text) { var d = ledgerFind(ref); if (d) d.outcome = { text: text, at: new Date().toISOString() }; return d; }
  // Outcomes that can be read off the records later (a listing's sales, a quote's status).
  function ledgerRefresh() {
    (state.decisions || []).forEach(function (d) {
      if (d.kind === 'price' && d.status === 'approved') {
        var pp = (state.priceProposals || []).filter(function (x) { return x.id === d.ref; })[0];
        var l = pp && pp.listingId ? byId('clearance', pp.listingId) : null;
        if (l) d.outcome = { text: l.qtySold + ' of ' + l.qty + ' sold at ' + money(l.clearancePriceCents) + (clearanceOpen(l) ? ' so far' : ''), at: new Date().toISOString() };
      }
      if (d.kind === 'campaign' && d.campaignId) {
        var c = state.campaigns.filter(function (x) { return x.id === d.campaignId; })[0];
        if (c) d.outcome = { text: c.status === 'sent' ? 'Sent to ' + (c.sentCount || c.audience.length) + ' people' : c.status === 'rejected' ? 'Rejected at approval' : 'Waiting for approval', at: new Date().toISOString() };
        if (c && (c.status === 'sent' || c.status === 'approved') && d.status === 'suggested') { d.status = 'approved'; d.decidedBy = c.approvedBy; }
        if (c && c.status === 'rejected' && d.status === 'suggested') { d.status = 'rejected'; d.decidedBy = c.approvedBy; }
      }
    });
    return state.decisions || [];
  }
  function explainRadar(c) {
    return {
      inputs: [['Stock now', c.stock], ['Harvests due in ' + RADAR_WEEKS + ' weeks', c.harvest], ['Pre-orders + trade orders', c.confirmed], ['Usual weekly sales', c.weekly], ['Trend vs 4 weeks before', (c.trendPct > 0 ? '+' : '') + c.trendPct + '%']],
      calc: ['Supply = stock ' + c.stock + ' + harvests ' + c.harvest + ' = ' + c.supply, 'Demand = confirmed ' + c.confirmed + ' + ' + c.weekly + ' a week × ' + RADAR_WEEKS + ' weeks = ' + c.demand,
        'Gap = supply − demand = ' + (c.gap > 0 ? '+' : '') + c.gap + ' (balanced within ±' + Math.round(RULES.radarTolerance * 100) + '% of demand)'],
      assumptions: ['Weekly sales are the average of the last 4 weeks of MEOD Fresh history.', 'Harvests come in at their expected quantity.'],
      confidence: { level: c.confidence, note: c.confidence === 'high' ? 'Weekly sales have been steady.' : c.confidence === 'medium' ? 'Weekly sales move around somewhat.' : 'Sales vary a lot week to week, or there is little history.' }
    };
  }
  function explainPrice(s) {
    var g = s.guard, c = radarCrops().filter(function (r) { return r.product.id === s.product.id; })[0];
    var base = c ? explainRadar(c) : { inputs: [], calc: [], assumptions: [], confidence: { level: 'medium', note: '' } };
    return {
      inputs: base.inputs.concat([['Normal price', money(s.fullCents || s.product.priceCents)], ['Unit cost', g.cost ? money(g.cost.totalCents) : '—']]),
      calc: base.calc.concat(s.kind === 'hold' ? ['Short supply → keep the normal price, pause promotions.'] : [
        'Suggested price ' + money(s.priceCents) + ' (' + s.pct + '% off)',
        'Margin Guard floor = higher of cost + ' + Math.round(RULES.minMarginRate * 100) + '% margin and ' + Math.round(RULES.clearanceDefaultMinRate * 100) + '% of normal = ' + money(g.floorCents || 0),
        g.ok ? 'Passes: ' + money(g.marginCents) + ' margin per unit (' + g.marginPct + '%)' : 'Blocked: ' + (g.reasons || []).join('; ')]),
      assumptions: base.assumptions.concat(['Each 10% off lifts sales by about ' + Math.round(RULES.promoLiftPer10 * 100) + '%.', 'Unit costs are the ones in Settings (illustrative until MEOD enters real costs).']),
      confidence: base.confidence
    };
  }

  /* ---------- Tyllage Quotation Copilot + demand commitments ----------
   * Paste a buyer's enquiry ("Can you supply 60kg of bok choy weekly at S$2.80/kg?"). It's read
   * into product, quantity, unit, price, frequency and day; then 2–3 options are worked out
   * against Margin Guard (price floor) and Harvest allocation (what's actually spare each
   * week). An accepted quote becomes a recurring commitment that counts as confirmed demand in
   * Demand Radar and Harvest allocation, so the uncovered gap shrinks straight away.
   */
  var WEEKDAYS_EN = { sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6 };
  function quoteParse(text) {
    var t = String(text || ''), low = t.toLowerCase();
    var product = null;
    state.products.filter(function (p) { return !p.bagOffer; }).forEach(function (p) {
      [p.title, p.subtitle].concat(p.aliases || []).forEach(function (n) { if (n && !product && low.indexOf(String(n).toLowerCase()) > -1) product = p; });
    });
    var qm = low.match(/(\d+(?:\.\d+)?)\s*(kg|kilo|kilos|kilograms|g\b|grams|bunch(?:es)?|packs?|units?|boxes?|pcs)/);
    var qty = qm ? Number(qm[1]) : null, unit = qm ? qm[2] : null;
    if (unit) unit = /^k/.test(unit) ? 'kg' : /^g/.test(unit) ? 'g' : /^bunch/.test(unit) ? 'bunch' : /^pack|^box/.test(unit) ? 'pack' : 'unit';
    if (unit === 'g') { qty = qty / 1000; unit = 'kg'; }
    var pm = t.match(/s?\$\s*(\d+(?:\.\d{1,2})?)\s*(?:\/|per|a)?\s*(kg|kilo|bunch|pack|unit)?/i);
    var price = pm ? Math.round(Number(pm[1]) * 100) : null, priceUnit = pm && pm[2] ? (/^k/i.test(pm[2]) ? 'kg' : pm[2].toLowerCase()) : unit;
    var freq = /weekly|every week|each week|per week|a week|every (mon|tue|wed|thu|fri|sat|sun)/.test(low) ? 'weekly' : /fortnight|every two weeks|biweekly/.test(low) ? 'fortnightly' : /monthly|every month|per month/.test(low) ? 'monthly' : 'once';
    var days = [];
    Object.keys(WEEKDAYS_EN).forEach(function (k) { if (new RegExp('\\b' + k + '\\b').test(low) && days.indexOf(WEEKDAYS_EN[k]) < 0) days.push(WEEKDAYS_EN[k]); });
    var weeksM = low.match(/(\d+)\s*(weeks|months)/);
    var term = weeksM ? Number(weeksM[1]) * (weeksM[2] === 'months' ? 4 : 1) : (freq === 'once' ? 1 : 12);
    var missing = [];
    if (!product) missing.push('which vegetable'); if (!qty) missing.push('how much');
    return { product: product, qty: qty, unit: unit || 'unit', price: price, priceUnit: priceUnit || unit || 'unit', freq: freq, days: days, termWeeks: term, missing: missing };
  }
  function kgPerUnit(p) { return (RULES.kgPerUnit && RULES.kgPerUnit[p.category]) || 0.25; }
  // Spare units a week: unallocated harvest over the next 14 days (Harvest allocation), plus
  // stock above two weeks of normal sales.
  function spareWeekly(productId) {
    var plan = allocationPlan(14).filter(function (x) { return x.product.id === productId; });
    var unalloc = plan.reduce(function (s, x) { return s + x.unallocated; }, 0);
    var c = radarCrops().filter(function (r) { return r.product.id === productId; })[0];
    var spareStock = c ? Math.max(0, c.stock - Math.round(c.weekly * 2)) : 0;
    return Math.max(0, Math.round((unalloc + spareStock) / 2));
  }
  function quoteOptions(q) {
    var p = q.product;
    if (!p) return [];
    var kpu = kgPerUnit(p);
    var unitsAsked = q.unit === 'kg' ? Math.round(q.qty / kpu) : Math.round(q.qty);
    var perWeek = q.freq === 'monthly' ? unitsAsked / 4 : q.freq === 'fortnightly' ? unitsAsked / 2 : unitsAsked;
    var spare = spareWeekly(p.id);
    var cost = unitCost(p.id).totalCents - 22; // bulk crates: no retail packaging
    var guard = function (unitPrice) { return marginGuard(p.id, unitPrice); };
    var askedUnitPrice = q.price ? (q.priceUnit === 'kg' ? Math.round(q.price * kpu) : q.price) : null;
    var trade = Math.round(p.priceCents * RULES.b2bPriceRate);
    var floor = guard(1).floorCents;
    var deliver = q.days.filter(function (d) { return [2, 4, 6].indexOf(d) > -1; });
    var dayNote = q.days.length && deliver.length < q.days.length ? 'MEOD delivers Tue, Thu & Sat — offer the nearest of those.' : '';
    function opt(key, title, unitsWk, unitPrice, why) {
      var g = guard(unitPrice);
      var weeklyRevenue = Math.round(unitsWk * unitPrice);
      return { key: key, title: title, unitsWeek: Math.round(unitsWk), kgWeek: Math.round(unitsWk * kpu * 10) / 10, unitPrice: unitPrice, kgPrice: Math.round(unitPrice / kpu),
        weeklyRevenue: weeklyRevenue, weeklyMargin: Math.round(unitsWk * (unitPrice - cost)), marginPct: unitPrice ? Math.round((unitPrice - cost) / unitPrice * 100) : 0,
        coverage: perWeek ? Math.min(100, Math.round(Math.min(unitsWk, spare) / perWeek * 100)) : 0, supplyOk: unitsWk <= spare, guardOk: g.ok, guard: g, why: why };
    }
    var out = [];
    var priceOk = askedUnitPrice != null && askedUnitPrice >= floor;
    if (askedUnitPrice != null && priceOk && perWeek <= spare) out.push(opt('accept', 'Accept as asked', perWeek, askedUnitPrice, 'Their price clears Margin Guard and there\'s enough spare each week.'));
    var counterPrice = Math.max(floor, askedUnitPrice != null && askedUnitPrice > trade ? askedUnitPrice : trade);
    if (!priceOk || askedUnitPrice == null) out.push(opt('price', 'Counter on price', Math.min(perWeek, Math.max(spare, 0)) || perWeek, counterPrice,
      askedUnitPrice == null ? 'No price given — quote the trade price.' : 'Their ' + money(q.price) + (q.priceUnit === 'kg' ? '/kg' : '') + ' is below MEOD\'s floor of ' + money(Math.round(floor / kpu)) + '/kg — counter at ' + money(Math.round(counterPrice / kpu)) + '/kg.'));
    if (perWeek > spare) {
      out.push(opt('volume', 'Counter on volume', spare, priceOk ? askedUnitPrice : counterPrice, 'Only about ' + spare + ' units (' + Math.round(spare * kpu * 10) / 10 + ' kg) are spare a week right now — offer that, and grow into the rest.'));
      out.push(opt('phased', 'Start smaller, then grow', Math.round(spare * 0.8), counterPrice, 'Supply ' + Math.round(spare * 0.8 * kpu) + ' kg a week for 4 weeks while a bigger batch is sown, then step up to the full ' + q.qty + (q.unit === 'kg' ? ' kg' : '') + '.'));
    } else if (out.length < 3) {
      out.push(opt('longer', 'Lock in a longer term', perWeek, Math.max(floor, Math.round(counterPrice * 0.97)), 'Offer 3% off for a 12-week commitment — steady demand is worth more than the discount.'));
    }
    // When supply is the real limit, lead with the volume counter.
    if (perWeek > spare) out.sort(function (a, b) { return (b.key === 'volume') - (a.key === 'volume'); });
    return out.slice(0, 3).map(function (o) { o.dayNote = dayNote; o.unitsAsked = Math.round(perWeek); o.spare = spare; return o; });
  }
  function quoteCreate(q, option, buyer, actor) {
    state.quotes = state.quotes || [];
    var id = nextId('QT');
    state.quotes.unshift({ id: id, productId: q.product.id, accountId: buyer.accountId || null, buyerName: buyer.name, text: q.text || '', freq: q.freq, days: q.days.length ? q.days : [2],
      termWeeks: q.termWeeks, option: option, status: 'sent', createdBy: actor, createdAt: new Date().toISOString() });
    ledgerLog({ kind: 'quote', ref: id, feature: 'Quotation Copilot', title: 'Quote ' + buyer.name + ': ' + option.kgWeek + ' kg/week ' + q.product.title + ' at ' + money(option.kgPrice) + '/kg',
      inputs: [['Asked', q.qty + ' ' + q.unit + ' ' + q.freq + (q.price ? ' at ' + money(q.price) + '/' + q.priceUnit : '')], ['Spare a week', option.spare + ' units'], ['Margin Guard floor', money(option.guard.floorCents) + ' a unit'], ['Unit cost (bulk)', money(unitCost(q.product.id).totalCents - 22)]],
      calc: ['Units a week = ' + option.unitsWeek + ' (' + option.kgWeek + ' kg at ' + kgPerUnit(q.product) + ' kg a unit)', 'Weekly revenue = ' + money(option.weeklyRevenue) + ', margin ' + money(option.weeklyMargin) + ' (' + option.marginPct + '%)', 'Covers ' + option.coverage + '% of what they asked'],
      assumptions: ['Spare supply = unallocated harvest over 14 days plus stock above 2 weeks of sales, ÷ 2.', 'Weight per unit is illustrative (Settings).', 'Bulk crates skip retail packaging.'],
      confidence: { level: option.supplyOk ? 'medium' : 'low', note: option.supplyOk ? 'Within spare supply for the next 2 weeks; later weeks depend on future sowing.' : 'More than is spare right now.' },
      recommendation: option.title }, actor);
    return { ok: true, id: id };
  }
  function quoteDecide(id, accepted, actor) {
    var qt = (state.quotes || []).filter(function (x) { return x.id === id; })[0];
    if (!qt || qt.status !== 'sent') return { ok: false, error: 'That quote isn\'t waiting for an answer.' };
    qt.status = accepted ? 'accepted' : 'declined'; qt.decidedAt = new Date().toISOString();
    ledgerDecide(id, accepted ? 'approved' : 'rejected', actor, accepted ? 'Buyer accepted' : 'Buyer declined');
    if (!accepted) { ledgerOutcome(id, 'Buyer declined the quote.'); return { ok: true }; }
    var before = radarCrops().filter(function (r) { return r.product.id === qt.productId; })[0];
    state.commitments = state.commitments || [];
    var cid = nextId('CM');
    state.commitments.unshift({ id: cid, quoteId: id, productId: qt.productId, accountId: qt.accountId, buyerName: qt.buyerName, unitsPerDelivery: Math.max(1, Math.round(qt.option.unitsWeek / qt.days.length)),
      days: qt.days, priceCents: qt.option.unitPrice, startKey: nextDeliveryKey(), weeks: qt.termWeeks, status: 'active', createdAt: new Date().toISOString(), by: actor });
    var after = radarCrops().filter(function (r) { return r.product.id === qt.productId; })[0];
    var pt = byId('products', qt.productId).title;
    var txt = 'Commitment ' + cid + ' started. ' + pt + ': confirmed demand ' + before.confirmed + ' → ' + after.confirmed + ' over 3 weeks; ' +
      (before.gap > 0 ? 'supply with no buyer ' + before.gap + ' → ' + Math.max(0, after.gap) : 'shortfall ' + (-before.gap) + ' → ' + (-after.gap) + ' (sow more to cover it)') + '.';
    ledgerOutcome(id, txt);
    return { ok: true, commitmentId: cid, before: before, after: after, text: txt };
  }
  function nextDeliveryKey() { var d = new Date(); d.setHours(0, 0, 0, 0); for (var i = 1; i < 8; i++) { var x = new Date(d.getTime() + i * 864e5); if ([2, 4, 6].indexOf(x.getDay()) > -1) return bagDayKey(x); } return bagDayKey(d); }
  // Units a product's active commitments need between two day keys (inclusive start, exclusive end).
  function commitmentUnits(productId, fromKey, toKey) {
    return (state.commitments || []).filter(function (c) { return c.status === 'active' && c.productId === productId; }).reduce(function (s, c) {
      var endKey = bagDayKey(new Date(parseDayKey(c.startKey).getTime() + c.weeks * 7 * 864e5));
      var n = 0;
      for (var d = parseDayKey(fromKey > c.startKey ? fromKey : c.startKey); bagDayKey(d) < toKey && bagDayKey(d) < endKey; d = new Date(d.getTime() + 864e5)) if (c.days.indexOf(d.getDay()) > -1) n += c.unitsPerDelivery;
      return s + n;
    }, 0);
  }

  /* ---------- Tyllage Farm Decision Twin ----------
   * A model of MEOD's commercial position for one crop over the next 2 weeks — not the
   * greenhouse. Change the harvest, demand, lose a trade buyer or a batch, and compare what
   * each response (do nothing, pre-orders, bulk trade offer, promotion, process) would earn.
   */
  function twinSimulate(productId, sc) {
    sc = sc || {};
    var p = byId('products', productId);
    var c = radarCrops().filter(function (r) { return r.product.id === productId; })[0];
    if (!p || !c) return null;
    var weeks = 2, share = weeks / RADAR_WEEKS;
    var harvest = Math.round(c.harvest * share * (1 + (sc.harvestPct || 0) / 100));
    var cancelled = 0;
    if (sc.cancelBatch && c.batches[0]) { cancelled = Math.round(c.batches[0].expectedQty * (1 + (sc.harvestPct || 0) / 100)); harvest = Math.max(0, harvest - cancelled); }
    var supply = c.stock + harvest;
    var lostBuyer = 0, buyer = null;
    if (sc.loseAccountId) {
      buyer = b2bStore().accounts.filter(function (a) { return a.id === sc.loseAccountId; })[0];
      var u = buyer && (buyer.usual || []).filter(function (x) { return x.productId === productId; })[0];
      lostBuyer = u ? u.qty * (buyer.standingDays || []).length * weeks : 0;
      lostBuyer += (state.commitments || []).filter(function (m) { return m.status === 'active' && m.accountId === sc.loseAccountId && m.productId === productId; }).reduce(function (s, m) { return s + m.unitsPerDelivery * m.days.length * weeks; }, 0);
    }
    // A lost buyer's volume comes off confirmed orders first, then off the sales history it was part of.
    var confirmedBase = Math.round(c.confirmed * share);
    var confirmed = Math.max(0, confirmedBase - lostBuyer);
    var leftover = lostBuyer - (confirmedBase - confirmed);
    var shop = Math.max(0, Math.round(c.weekly * weeks * (1 + (sc.demandPct || 0) / 100)) - leftover);
    var demand = confirmed + shop;
    var surplus = supply - demand;
    var price = p.priceCents, cost = unitCost(productId).totalCents;
    var sold = Math.min(supply, demand);
    var base = { revenue: sold * price, margin: sold * (price - cost), unsold: Math.max(0, surplus) };
    var opts = [];
    var add = function (key, title, extraSold, extraRevenue, extraMargin, note) {
      var unsold = Math.max(0, surplus - extraSold);
      opts.push({ key: key, title: title, revenue: base.revenue + extraRevenue, margin: base.margin + extraMargin, unsold: unsold, wasteCents: unsold * price, note: note });
    };
    add('none', 'Do nothing', 0, 0, 0, surplus > 0 ? surplus + ' unit(s) left to rescue or compost.' : 'Everything sells.');
    if (surplus > 0) {
      var pre = Math.round(surplus * RULES.preorderConvert);
      add('preorder', 'Open pre-orders', pre, pre * price, pre * (price - cost), 'About ' + Math.round(RULES.preorderConvert * 100) + '% of the extra sells ahead at full price.');
      var bulk = Math.round(surplus * 0.6), trade = Math.round(price * RULES.b2bPriceRate);
      add('bulk', 'Bulk trade offer', bulk, bulk * trade, bulk * (trade - cost + 22), bulk + ' to a trade buyer at ' + money(trade) + ' (no retail packaging).');
      var promoPrice = Math.round(price * 0.85), lift = Math.min(surplus, Math.round(c.weekly * weeks * RULES.promoLiftPer10 * 1.5));
      var g = marginGuard(productId, promoPrice);
      add('promo', '15% off promotion', lift, lift * promoPrice - sold * 0, lift * (promoPrice - cost), g.ok ? lift + ' more sold at ' + money(promoPrice) + '.' : 'Blocked by Margin Guard.');
      if (!g.ok) opts[opts.length - 1].blocked = true;
      var proc = surplus;
      add('process', 'Process into ' + (p.category === 'herbs' ? 'pesto' : 'vege powder'), proc, Math.round(proc * price * 0.5), Math.round(proc * price * 0.5) - proc * cost, 'Kitchen value about 50% of the fresh price.');
    } else if (surplus < 0) {
      opts[0].note = 'Short by ' + (-surplus) + ': ' + money(-surplus * price) + ' of sales missed.';
      add('priority', 'Serve trade + pre-orders first', 0, 0, 0, 'Confirmed orders are covered; shop customers see "Notify me" instead.');
      opts[1].unsold = 0; opts[1].wasteCents = 0;
    }
    var best = surplus < 0 ? opts[1] : opts.filter(function (o) { return !o.blocked; }).sort(function (a, b) { return b.margin - a.margin || a.unsold - b.unsold; })[0];
    opts.forEach(function (o) { o.best = o === best; });
    return { product: p, weeks: weeks, supply: supply, harvest: harvest, cancelled: cancelled, stock: c.stock, demand: demand, confirmed: confirmed, shop: shop, lostBuyer: lostBuyer, buyer: buyer,
      surplus: surplus, options: opts, best: best,
      assumptions: ['Next ' + weeks + ' weeks: stock plus ' + Math.round(share * 100) + '% of the harvests Demand Radar expects in 3 weeks.', 'Shop demand = ' + c.weekly + ' a week × ' + weeks + (sc.demandPct ? ' × ' + (100 + sc.demandPct) + '%' : '') + '.',
        'Pre-orders sell ' + Math.round(RULES.preorderConvert * 100) + '% of the extra; a bulk buyer takes 60% at the trade price; a 15% promotion lifts sales by ' + Math.round(RULES.promoLiftPer10 * 150) + '%.', 'Margin = revenue − unit cost (Settings).'] };
  }

  /* ---------- Tyllage Ops Copilot ----------
   * Answers staff questions in English or 中文 from the portal's own records: every answer is
   * a table of real rows, a line on how it was worked out, and links to the pages behind it.
   * Questions it can't answer from the data get "I can't answer that yet" — never a guess.
   */
  var COPILOT_INTENTS = [
    { key: 'slow', re: /slow|selling slower|not selling|weak demand|卖得慢|滞销|卖不动|销量下降/ },
    { key: 'unanswered', re: /unanswer|not replied|haven.?t (been )?(answered|replied)|no reply|pending enquir|open enquir|未回复|没回复|还没回|待回复|询问/ },
    { key: 'short', re: /short|run(ning)? out|sold out|out of stock|not enough|缺货|不够|卖完|短缺/ },
    { key: 'surplus', re: /surplus|too much|waste|at risk|sell.?by|expir|过剩|浪费|过期|太多/ },
    { key: 'top', re: /best|top|fastest|popular|selling well|畅销|卖得最好|最受欢迎/ },
    { key: 'approvals', re: /approv|waiting for|pending|待批准|审批|等批/ },
    { key: 'sales', re: /revenue|sales this week|how much (did )?we sell|takings|销售额|营业额|卖了多少/ },
    { key: 'harvest', re: /harvest|pick this week|收成|采收|收割/ },
    { key: 'feedback', re: /complain|feedback|review|unhappy|投诉|反馈|评价/ },
    { key: 'trade', re: /trade|b2b|restaurant|caf[eé]|wholesale|standing order|餐厅|商家|批发/ }
  ];
  function copilotProduct(q) {
    var low = q.toLowerCase();
    return state.products.filter(function (p) { return !p.bagOffer; }).filter(function (p) {
      return [p.title, p.subtitle].concat(p.aliases || []).some(function (n) { return n && String(n).length > 1 && low.indexOf(String(n).toLowerCase()) > -1; });
    })[0] || null;
  }
  function copilotAsk(question) {
    var q = String(question || '').trim();
    var zh = /[一-鿿]/.test(q);
    var L = function (en, cn) { return zh ? cn : en; };
    var intent = COPILOT_INTENTS.filter(function (i) { return i.re.test(q.toLowerCase()); })[0];
    var prod = copilotProduct(q);
    var crops = radarCrops();
    var weekAgo = Date.now() - 7 * 864e5;
    var res = { zh: zh, question: q };
    if (!q) return Object.assign(res, { ok: false, answer: L('Ask me about sales, stock, harvests, enquiries or approvals.', '可以问我销售、库存、采收、询问或待批准事项。') });
    if (!intent && !prod && /^(hi|hello|hey|yo|hiya|good (morning|afternoon|evening)|你好|您好|嗨)\b|^(你好|您好|嗨)/i.test(q)) return Object.assign(res, { ok: false, answer: L('Hi! Ask me about sales, stock, harvests, enquiries or approvals — or tap one of the suggestions below.', '你好！可以问我销售、库存、采收、询问或待批准事项，也可以点下面的建议问题。') });
    if (prod && (!intent || intent.key === 'slow' || intent.key === 'top')) intent = { key: 'product' };
    if (!intent) return Object.assign(res, { ok: false, answer: L('I can\'t answer that from the farm\'s records yet. Try: "Which vegetables are selling slower this week?", "What enquiries haven\'t been answered?", "What\'s at risk of going to waste?"', '我暂时无法用农场的记录回答这个问题。可以试试：「哪些蔬菜这周卖得慢？」「哪些询问还没回复？」「哪些可能浪费？」') });
    var r = { ok: true, intent: intent.key, rows: [], cols: [], links: [] };
    if (intent.key === 'slow') {
      var slow = crops.filter(function (c) { return c.trendPct < 0 || c.status === 'surplus'; }).sort(function (a, b) { return a.trendPct - b.trendPct; }).slice(0, 6);
      r.answer = slow.length ? L(slow.length + ' crops are selling slower than the previous 4 weeks or have more supply than demand. Slowest: ' + slow[0].product.title + ' (' + slow[0].trendPct + '%).', '有 ' + slow.length + ' 种蔬菜比前4周卖得慢或供过于求。最慢的是 ' + slow[0].product.title + '（' + slow[0].trendPct + '%）。') : L('Nothing is selling slower than usual.', '没有比平时卖得慢的蔬菜。');
      r.cols = [L('Crop', '蔬菜'), L('Weekly sales', '每周销量'), L('Trend', '趋势'), L('Supply vs demand', '供需差')];
      r.rows = slow.map(function (c) { return [c.product.title, String(c.weekly), (c.trendPct > 0 ? '+' : '') + c.trendPct + '%', (c.gap > 0 ? '+' : '') + c.gap]; });
      r.how = L('Average of the last 4 weeks vs the 4 before (MEOD Fresh history), and Demand Radar\'s 3-week supply minus demand.', '比较最近4周与之前4周的平均销量（MEOD Fresh 记录），以及需求雷达未来3周的供需差。');
      r.links = [['Demand Radar', '#radar'], ['Price Advisor', '#pricing']];
    } else if (intent.key === 'unanswered') {
      var tickets = state.tickets.filter(function (t) { return t.status === 'open'; });
      var bookings = state.bookings.filter(function (b) { return b.status === 'new'; });
      var asks = (state.lostDemand || []).filter(function (x) { return x.status === 'open' && x.source !== 'soldout'; });
      r.answer = L((tickets.length + bookings.length) + ' enquiries are waiting for a reply: ' + tickets.length + ' support ticket(s) and ' + bookings.length + ' visit request(s). ' + asks.length + ' product request(s) we couldn\'t fill are still open.',
        '有 ' + (tickets.length + bookings.length) + ' 个询问等待回复：' + tickets.length + ' 个客服工单，' + bookings.length + ' 个参观申请。另有 ' + asks.length + ' 个未能满足的产品需求仍未处理。');
      r.cols = [L('Type', '类型'), L('Ref', '编号'), L('Summary', '内容'), L('Waiting', '等待')];
      var agoTxt = function (iso) { var hrs = Math.round((Date.now() - new Date(iso)) / 36e5); return hrs < 24 ? hrs + 'h' : Math.round(hrs / 24) + 'd'; };
      r.rows = tickets.map(function (t) { return [L('Ticket', '工单'), t.id, t.summary, agoTxt(t.createdAt)]; })
        .concat(bookings.map(function (b) { return [L('Visit', '参观'), b.id, (b.org || b.name) + ' · ' + b.pax + ' pax', agoTxt(b.createdAt)]; }))
        .concat(asks.slice(0, 4).map(function (x) { return [L('Request', '需求'), x.id, x.qty + ' × ' + x.cropName, agoTxt(x.at)]; }));
      r.how = L('Open support tickets, new visit bookings and open lost-demand requests.', '未关闭的客服工单、新的参观预约和未处理的需求记录。');
      r.links = [['Inbox', '#inbox'], ['Lost demand', '#lost']];
    } else if (intent.key === 'short') {
      var sh = crops.filter(function (c) { return c.status === 'short' || (c.stockKnown && c.stock === 0); });
      r.answer = sh.length ? L(sh.length + ' crop(s) are short or sold out.', '有 ' + sh.length + ' 种蔬菜缺货或供不应求。') : L('Nothing is short right now.', '目前没有缺货。');
      r.cols = [L('Crop', '蔬菜'), L('Stock', '库存'), L('Short by', '缺口'), L('Asked for, not sold', '未满足需求')];
      r.rows = sh.map(function (c) { return [c.product.title, String(c.stock), c.gap < 0 ? String(-c.gap) : '—', String(lostUnitsFor(c.product.id))]; });
      r.how = L('Demand Radar supply minus demand over 3 weeks, plus Lost demand requests in the last 28 days.', '需求雷达3周供需差，加上过去28天的未满足需求。');
      r.links = [['Demand Radar', '#radar'], ['Lost demand', '#lost']];
    } else if (intent.key === 'surplus') {
      var risk = rescueBatches().filter(function (x) { return x.level !== 'ok'; });
      var sur = crops.filter(function (c) { return c.status === 'surplus'; });
      r.answer = L(risk.length + ' harvested batch(es) are near or past their sell-by date, and ' + sur.length + ' crop(s) have more supply than demand.', '有 ' + risk.length + ' 批收成接近或已过最佳售卖日期，' + sur.length + ' 种蔬菜供过于求。');
      r.cols = [L('Crop', '蔬菜'), L('Why', '原因'), L('Units', '数量'), L('Value', '价值')];
      r.rows = risk.map(function (x) { return [x.product.title, L('Sell by ', '售卖截止 ') + x.batch.sellBy, String(x.unsold), money(x.valueCents)]; })
        .concat(sur.map(function (c) { return [c.product.title, L('Surplus', '过剩'), String(c.gap), money(c.gap * c.product.priceCents)]; }));
      r.how = L('Harvest Rescue (unsold units vs shelf life) and Demand Radar surplus.', '收成救援（未售数量与保鲜期）和需求雷达过剩数据。');
      r.links = [['Harvest Rescue', '#rescue'], ['Harvest allocation', '#allocation']];
    } else if (intent.key === 'top') {
      var top = crops.slice().sort(function (a, b) { return b.weekly - a.weekly; }).slice(0, 5);
      r.answer = L('Best sellers by weekly units: ' + top.map(function (c) { return c.product.title; }).slice(0, 3).join(', ') + '.', '每周销量最高：' + top.map(function (c) { return c.product.title; }).slice(0, 3).join('、') + '。');
      r.cols = [L('Crop', '蔬菜'), L('Weekly sales', '每周销量'), L('Trend', '趋势')];
      r.rows = top.map(function (c) { return [c.product.title, String(c.weekly), (c.trendPct > 0 ? '+' : '') + c.trendPct + '%']; });
      r.how = L('Average weekly units over the last 4 weeks.', '最近4周平均每周销量。');
      r.links = [['Demand Radar', '#radar']];
    } else if (intent.key === 'approvals') {
      var pp = (state.priceProposals || []).filter(function (x) { return x.status === 'pending'; });
      var cps = state.campaigns.filter(function (c) { return c.status === 'pending_approval'; });
      var posts = (state.contentPlan || []).filter(function (c) { return c.status === 'pending'; });
      r.answer = L((pp.length + cps.length + posts.length) + ' item(s) are waiting for approval.', '有 ' + (pp.length + cps.length + posts.length) + ' 项等待批准。');
      r.cols = [L('Type', '类型'), L('Item', '事项'), L('By', '提交人')];
      r.rows = pp.map(function (x) { return [L('Price', '价格'), byId('products', x.productId).title + ' ' + money(x.toCents), x.createdBy]; })
        .concat(cps.map(function (c) { return [L('Campaign', '推广'), c.title, c.createdBy]; })).concat(posts.map(function (c) { return [L('Social post', '社媒'), c.title, c.createdBy]; }));
      r.how = L('Pending price proposals, campaigns and social posts.', '待批准的价格、推广和社媒帖子。');
      r.links = [['Price Advisor', '#pricing'], ['Campaigns', '#campaigns'], ['Content studio', '#content']];
    } else if (intent.key === 'sales') {
      var orders = state.orders.filter(function (o) { return new Date(o.createdAt).getTime() > weekAgo && o.status !== 'cancelled' && o.status !== 'refunded'; });
      var tot = orders.reduce(function (s, o) { return s + (o.netCents || 0); }, 0);
      var b2bWeek = b2bStore().orders.filter(function (o) { return o.status === 'delivered' && parseDayKey(o.deliveryDay).getTime() > weekAgo; });
      var b2bTot = b2bWeek.reduce(function (s, o) { return s + o.totalCents; }, 0);
      r.answer = L('Last 7 days: ' + money(tot + b2bTot) + ' — ' + money(tot) + ' from ' + orders.length + ' shop order(s) and ' + money(b2bTot) + ' from ' + b2bWeek.length + ' trade delivery(ies).', '过去7天：' + money(tot + b2bTot) + '——' + orders.length + ' 笔网店订单 ' + money(tot) + '，' + b2bWeek.length + ' 笔商家订单 ' + money(b2bTot) + '。');
      r.cols = [L('Channel', '渠道'), L('Orders', '订单'), L('Net sales', '净销售额')];
      r.rows = [[L('Shop (MEOD Fresh)', '网店'), String(orders.length), money(tot)], [L('Trade', '商家'), String(b2bWeek.length), money(b2bTot)]];
      r.how = L('Shop orders (not cancelled or refunded) created in the last 7 days, plus trade orders delivered.', '过去7天的网店订单（不含取消或退款）加上已送达的商家订单。');
      r.links = [['Orders', '#orders'], ['B2B buyers', '#b2b']];
    } else if (intent.key === 'harvest') {
      var soon = batchesUpcoming().filter(function (b) { return parseDayKey(b.harvestDate).getTime() < Date.now() + 7 * 864e5; });
      r.answer = L(soon.length + ' batch(es) are due in the next 7 days.', '未来7天有 ' + soon.length + ' 批待采收。');
      r.cols = [L('Crop', '蔬菜'), L('Harvest', '采收日'), L('Expected', '预计'), L('Pre-ordered', '已预订')];
      r.rows = soon.map(function (b) { return [byId('products', b.productId).title, b.harvestDate, String(b.expectedQty), String(batchPreordered(b))]; });
      r.how = L('Harvest Planner batches not yet harvested.', '采收计划中尚未采收的批次。');
      r.links = [['Harvest Planner', '#harvest'], ['Harvest allocation', '#allocation']];
    } else if (intent.key === 'feedback') {
      var cl = feedbackClusters(14).filter(function (g) { return !g.resolved; });
      r.answer = L(cl.filter(function (g) { return g.pattern; }).length + ' pattern(s) and ' + cl.filter(function (g) { return !g.pattern; }).length + ' one-off issue(s) in the last 14 days.', '过去14天有 ' + cl.filter(function (g) { return g.pattern; }).length + ' 个重复问题和 ' + cl.filter(function (g) { return !g.pattern; }).length + ' 个单独问题。');
      r.cols = [L('Issue', '问题'), L('Reports', '次数'), L('Likely cause', '可能原因')];
      r.rows = cl.map(function (g) { return [g.title, String(g.items.length), g.cause.split('. ')[0] + '.']; });
      r.how = L('Feedback from ratings, chats, tickets and reviews, grouped by theme and batch.', '来自评分、聊天、工单和评价的反馈，按主题和批次归类。');
      r.links = [['Feedback', '#feedback']];
    } else if (intent.key === 'trade') {
      var ins = b2bInsights();
      r.answer = L(ins.length + ' trade account(s) or lead(s) need attention.', '有 ' + ins.length + ' 个商家客户或潜在客户需要跟进。');
      r.cols = [L('Account', '客户'), L('What', '情况')];
      r.rows = ins.map(function (x) { return [(x.account || x.lead).name, x.title]; });
      r.how = L('B2B buyers: missing standing orders, declining or lapsed accounts, and leads due.', '商家买家：缺少的固定订单、下降或流失的客户，以及待跟进的潜在客户。');
      r.links = [['B2B buyers', '#b2b'], ['Quotations', '#quotes']];
    } else if (intent.key === 'product') {
      var c = crops.filter(function (x) { return x.product.id === prod.id; })[0];
      var st = reviewStats(prod.id);
      r.answer = c ? L(prod.title + ': ' + c.stock + ' in stock, selling ' + c.weekly + ' a week (' + (c.trendPct > 0 ? '+' : '') + c.trendPct + '%), Demand Radar says ' + c.status + '.', prod.title + '：库存 ' + c.stock + '，每周卖 ' + c.weekly + '（' + (c.trendPct > 0 ? '+' : '') + c.trendPct + '%），需求雷达显示：' + ({ short: '缺货', surplus: '过剩', balanced: '平衡' }[c.status] || c.status) + '。')
        : L(prod.title + ': ' + prod.stock.qty + ' in stock.', prod.title + '：库存 ' + prod.stock.qty + '。');
      r.cols = [L('Measure', '指标'), L('Value', '数值')];
      r.rows = [[L('Stock', '库存'), String(prod.stock.qty)], [L('Weekly sales', '每周销量'), c ? String(c.weekly) : '—'], [L('Next 3 weeks supply − demand', '未来3周供需差'), c ? (c.gap > 0 ? '+' : '') + c.gap : '—'],
        [L('Asked for, not sold', '未满足需求'), String(lostUnitsFor(prod.id))], [L('Rating', '评分'), st.count ? st.avg + ' ★ (' + st.count + ')' : '—']];
      r.how = L('Stock sync, Demand Radar, Lost demand and reviews for this product.', '该产品的库存、需求雷达、未满足需求和评价。');
      r.links = [['Demand Radar', '#radar'], ['Stock', '#inventory']];
    }
    return Object.assign(res, r);
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
      // Recurring commitments from accepted quotes are confirmed demand as well.
      b2bUnits += commitmentUnits(p.id, bagDayKey(new Date()), bagDayKey(new Date(until)));
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
    promo: {
      simulate: promoSimulate, TYPES: PROMO_TYPES, typeOf: campaignType, drops: harvestDrops, onApprove: promoOnApprove, onSend: promoOnSend,
      milestoneIdea: milestoneIdea, milestoneProgress: milestoneProgress, milestoneReward: milestoneReward, groupMembers: groupMembers,
      visitIdeas: visitVoucherIdeas, result: campaignResult, resultsByType: promoResultsByType, ranking: promoRanking, assume: promoAssume
    },
    importer: { KINDS: IMPORT_KINDS, parseCsv: parseCsv, preview: importPreview, apply: importApply, template: importTemplate },
    pilot: { metrics: pilotMetrics, recordBaseline: pilotRecordBaseline, DRAFT_MINUTES: DRAFT_MINUTES },
    decisions: { log: ledgerLog, decide: ledgerDecide, outcome: ledgerOutcome, list: ledgerRefresh, find: ledgerFind, explainRadar: explainRadar, explainPrice: explainPrice },
    quotes: { parse: quoteParse, options: quoteOptions, create: quoteCreate, decide: quoteDecide, spare: spareWeekly, kgPerUnit: kgPerUnit, commitmentUnits: commitmentUnits },
    twin: { simulate: twinSimulate },
    inspect: {
      CONDITIONS: CONDITIONS, GRADE_CONDITION: GRADE_CONDITION, greenhouse: batchGreenhouse, batches: inspectableBatches, openRound: openRound,
      status: roundStatus, save: inspectionSave, submit: roundSubmit, review: roundReview, held: heldEstimates,
      risk: commitmentRisk, risks: commitmentRisks, pending: pendingEstimate, closeTask: taskClose, history: batchHistory, STATUS: INSPECTION_STATUS,
      health: greenhouseHealth, weatherAdvice: weatherAdvice, trend: batchTrend, learning: learningStats, bias: estimateBias, corrected: correctedEstimate
    },
    seasons: {
      FESTIVALS: FESTIVALS, WINDOW_DAYS: FESTIVE_WINDOW_DAYS, outlook: festiveOutlook, STORES: MARKET_STORES, addPrice: marketPriceAdd, compare: marketCompare
    },
    copilot: { ask: copilotAsk },
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
