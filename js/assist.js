/* Tyllage Assist — rule-based stand-in for the WhatsApp assistant.
 *
 * In production an LLM would only handle language (detect, classify,
 * phrase replies); stock, prices and order data come from the backend.
 * This mock follows the same contract: it never invents availability,
 * and complaints / refunds / food safety / payment go to a human.
 */
(function () {
  'use strict';
  var M = window.MEOD;

  var INTENTS = [
    ['food_safety', /sick|food poison|allerg|mould|mold|insect|worm|食物中毒|过敏|发霉|sakit|keracunan/i],
    ['refund', /refund|money back|退款|退钱|bayar balik|pulangkan/i],
    ['complaint', /complain|wilted|rotten|spoil|bad quality|damaged|wrong item|missing|投诉|烂|坏了|不新鲜|aduan|rosak|busuk/i],
    ['payment', /payment|paid|pay |card|paynow|付款|付钱|bayaran/i],
    ['order', /order|track|where is my|my delivery status|订单|pesanan/i],
    ['clearance', /buy to clear|clearance|surprise bag|harvest bag|清仓|惊喜袋|特价|beg kejutan|jualan murah/i],
    ['delivery', /deliver|shipping|when.*arrive|送货|配送|运费|hantar|penghantaran/i],
    ['promotion', /promo|discount|deal|offer|coupon|group ?buy|优惠|折扣|团购|diskaun|tawaran/i],
    ['visit', /visit|tour|workshop|farm trip|参观|lawatan/i],
    ['price', /price|how much|cost|价格|多少钱|harga|berapa/i],
    ['stock', /stock|available|have any|got any|in stock|有货|有没有|库存|ada (tak|tidak)?|stok/i],
    ['greeting', /^(hi|hello|hey|good (morning|afternoon|evening))\b|你好|哈喽|^hai\b|selamat|vanakkam|வணக்கம்/i]
  ];
  var HUMAN_INTENTS = ['food_safety', 'refund', 'complaint', 'payment'];

  function detectLanguage(text) {
    if (/[一-鿿]/.test(text)) return 'zh';
    if (/[஀-௿]/.test(text) || /vanakkam/i.test(text)) return 'ta';
    if (/\b(berapa|ada|sayur|harga|hantar|boleh|terima kasih|saya|nak|tak|cendawan|selamat)\b/i.test(text)) return 'ms';
    return 'en';
  }

  function classify(text) {
    for (var i = 0; i < INTENTS.length; i++) if (INTENTS[i][1].test(text)) return INTENTS[i][0];
    return M.findProduct(text) ? 'stock' : 'unknown';
  }

  // Short phrasebook. Tamil falls back to English with a greeting, and the
  // bot offers a human — matches the "fallback to human if low confidence" rule.
  var T = {
    en: {
      hi: 'Hi! I\'m Ask MEOD 🌱 I can check stock, prices, delivery and group-buy codes. What would you like?',
      inStock: function (p, q, when) { return p.title + ' (' + p.subtitle + ') is in stock — ' + q + ' available at ' + M.money(p.priceCents) + '. Last synced ' + when + '.'; },
      out: function (p) { return 'Sorry, ' + p.title + ' is sold out right now. Want me to suggest something similar?'; },
      stale: function (p) { return 'I can\'t confirm ' + p.title + ' availability right now — our stock data is being refreshed. A team member can check for you.'; },
      price: function (p) { return p.title + ' is ' + M.money(p.priceCents) + ' (illustrative price — final price is confirmed at checkout).'; },
      which: 'Which vegetable are you looking for? e.g. "Do you have kai lan?"',
      delivery: 'We deliver on Tue, Thu and Sat. Orders from S$60 get free delivery; below that a S$8 fee applies (illustrative — confirm on meodfresh.com).',
      promo: 'Group-buy members get 5% off with their leader\'s code. Ask your group leader, or sign in to the portal to join a group buy.',
      order: 'For your privacy I can only share order details after you sign in. Please use the Portal (top right) to see your orders.',
      visit: 'Farm tours and workshops are by appointment at 13 Neo Tiew Harvest Lane. You can book on our Experiences page.',
      clearance: function (bag, when) { return 'Our Surprise Harvest Bag comes in two sizes: Small ' + M.money(bag.small.priceCents) + ' (worth at least ' + M.money(bag.small.worthCents) + ') and Regular ' + M.money(bag.regular.priceCents) + ' (worth at least ' + M.money(bag.regular.worthCents) + '). Pre-order by ' + when + '. See everything on our Buy to Clear page — prices are illustrative.'; },
      clearanceStale: 'I can\'t confirm Surprise Harvest Bag availability right now — stock data is being refreshed. Check our Buy to Clear page shortly, or a team member can help.',
      handoverOpen: 'I\'m sorry about this. I\'ve created ticket {id} and a MEOD team member will reply shortly. I won\'t try to resolve this myself.',
      handoverClosed: 'I\'m sorry about this. I\'ve created ticket {id}. Our team is offline now (Mon–Sat 9am–6pm) and will reply when they\'re back.',
      unknown: 'I\'m not sure I understood. I can help with stock, prices, delivery, group buys or farm visits — or connect you to a person.'
    },
    zh: {
      hi: '您好！我是 MEOD 小助手 🌱 可以帮您查库存、价格、配送和团购。',
      inStock: function (p, q, when) { return p.title + '（' + p.subtitle + '）有货，现有 ' + q + ' 份，价格 ' + M.money(p.priceCents) + '。库存更新于 ' + when + '。'; },
      out: function (p) { return '抱歉，' + p.title + ' 目前已售完。需要我推荐类似的蔬菜吗？'; },
      stale: function (p) { return '目前无法确认 ' + p.title + ' 的库存，数据正在更新中。我们的同事可以帮您确认。'; },
      price: function (p) { return p.title + ' 价格为 ' + M.money(p.priceCents) + '（示例价格，以结账为准）。'; },
      which: '请问您想找哪种蔬菜？例如：“有芥兰吗？”',
      delivery: '我们在周二、周四和周六配送。满 S$60 免运费，否则收取 S$8（示例）。',
      promo: '团购成员使用团长的优惠码可享 5% 折扣。请登录会员门户加入团购。',
      order: '为保护您的隐私，请先登录门户再查看订单详情。',
      visit: '农场参观需预约，地址：13 Neo Tiew Harvest Lane。可在”Experiences”页面预约。',
      clearance: function (bag, when) { return '惊喜丰收袋有两种尺寸：小份 ' + M.money(bag.small.priceCents) + '（价值至少 ' + M.money(bag.small.worthCents) + '）和标准份 ' + M.money(bag.regular.priceCents) + '（价值至少 ' + M.money(bag.regular.worthCents) + '）。请在 ' + when + ' 前预订。详情请见 Buy to Clear 页面，价格仅供参考。'; },
      clearanceStale: '目前无法确认惊喜丰收袋的库存，数据正在更新中。请稍后查看 Buy to Clear 页面，或联系我们的同事。',
      handoverOpen: '非常抱歉。已为您创建工单 {id}，我们的同事会尽快回复您。',
      handoverClosed: '非常抱歉。已为您创建工单 {id}。客服目前不在线（周一至周六 9am–6pm），上班后会回复您。',
      unknown: '抱歉我不太明白。我可以帮您查库存、价格、配送、团购或参观，也可以为您转接人工。'
    },
    ms: {
      hi: 'Hai! Saya Ask MEOD 🌱 Saya boleh semak stok, harga, penghantaran dan kod beli berkumpulan.',
      inStock: function (p, q, when) { return p.title + ' ada stok — ' + q + ' unit pada ' + M.money(p.priceCents) + '. Dikemas kini ' + when + '.'; },
      out: function (p) { return 'Maaf, ' + p.title + ' telah habis dijual.'; },
      stale: function (p) { return 'Saya tidak dapat mengesahkan stok ' + p.title + ' sekarang. Kakitangan kami boleh semak untuk anda.'; },
      price: function (p) { return 'Harga ' + p.title + ' ialah ' + M.money(p.priceCents) + ' (harga contoh).'; },
      which: 'Sayur apa yang anda cari? Contoh: "Ada kangkung?"',
      delivery: 'Penghantaran pada Selasa, Khamis dan Sabtu. Percuma untuk pesanan S$60 ke atas (contoh).',
      promo: 'Ahli beli berkumpulan dapat diskaun 5% dengan kod ketua kumpulan.',
      order: 'Untuk privasi anda, sila log masuk ke Portal untuk melihat pesanan.',
      visit: 'Lawatan ladang mengikut temujanji di 13 Neo Tiew Harvest Lane.',
      clearance: function (bag, when) { return 'Beg Kejutan Tuaian kami ada dua saiz: Kecil ' + M.money(bag.small.priceCents) + ' (bernilai sekurang-kurangnya ' + M.money(bag.small.worthCents) + ') dan Biasa ' + M.money(bag.regular.priceCents) + ' (bernilai sekurang-kurangnya ' + M.money(bag.regular.worthCents) + '). Pesan dahulu sebelum ' + when + '. Lihat semua di halaman Buy to Clear — harga adalah contoh.'; },
      clearanceStale: 'Saya tidak dapat mengesahkan stok Beg Kejutan Tuaian sekarang. Sila semak halaman Buy to Clear sebentar lagi, atau kakitangan kami boleh bantu.',
      handoverOpen: 'Maaf atas kesulitan ini. Tiket {id} telah dibuat dan kakitangan kami akan membalas.',
      handoverClosed: 'Maaf atas kesulitan ini. Tiket {id} telah dibuat. Pasukan kami akan membalas pada waktu pejabat (Isn–Sab 9pg–6ptg).',
      unknown: 'Maaf, saya kurang faham. Saya boleh bantu stok, harga, penghantaran atau sambungkan anda kepada kakitangan.'
    }
  };

  function timeAgo(iso) {
    var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 60) return m + ' min ago';
    return Math.round(m / 60) + ' h ago';
  }

  function openTicket(intent, text, ctx) {
    var id = M.nextId('T');
    M.state.tickets.unshift({
      id: id,
      customerId: (ctx && ctx.customerId) || null,
      channel: (ctx && ctx.channel) || 'web',
      intent: intent,
      // Redact digits so phone/card numbers are not copied into the ticket.
      summary: text.replace(/\d{4,}/g, '[redacted]').slice(0, 200),
      status: 'open',
      assignee: null,
      createdAt: new Date().toISOString()
    });
    M.audit('assist-bot', 'ticket.created', id);
    M.save();
    return id;
  }

  function reply(text, ctx) {
    var lang = detectLanguage(text);
    var t = T[lang] || T.en;
    var prefix = lang === 'ta' ? 'வணக்கம்! (Tamil replies coming soon — answering in English.)\n' : '';
    if (lang === 'ta') t = T.en;
    var intent = classify(text);
    var product = M.findProduct(text);
    var out = { language: lang, intent: intent, handover: false, text: '' };

    if (HUMAN_INTENTS.indexOf(intent) > -1) {
      var id = openTicket(intent, text, ctx);
      out.handover = true;
      out.ticketId = id;
      out.text = (M.withinHumanHours() ? t.handoverOpen : t.handoverClosed).replace('{id}', id);
    } else if (intent === 'stock' || (intent === 'price' && product)) {
      if (!product) out.text = t.which;
      else if (intent === 'price') out.text = t.price(product);
      else {
        var s = M.stockStatus(product);
        out.text = !s.known ? t.stale(product) : s.qty === 0 ? t.out(product) : t.inStock(product, s.qty, timeAgo(product.stock.updatedAt));
      }
    } else if (intent === 'price') out.text = t.which;
    else if (intent === 'clearance') {
      var bagProduct = M.findProduct('Surprise Harvest Bag');
      var bagStatus = bagProduct ? M.stockStatus(bagProduct) : { known: false };
      if (!bagStatus.known) out.text = t.clearanceStale;
      else {
        var bag = M.state.harvestBag;
        var cutoff = M.clearance.nextBagCutoff();
        var when = cutoff.cutoff.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' }) + ' 10pm, for ' +
          cutoff.deliveryDay.toLocaleDateString('en-SG', { weekday: 'long' }) + ' delivery';
        out.text = t.clearance({ small: bag.sizes[0], regular: bag.sizes[1] }, when);
      }
      // Let the UI add a tappable "Go to Buy to Clear" link — its href depends on whether
      // this is the public chat widget or the portal's own Ask MEOD page.
      out.showClearanceLink = true;
    }
    else if (intent === 'delivery') out.text = t.delivery;
    else if (intent === 'promotion') out.text = t.promo;
    else if (intent === 'visit') out.text = t.visit;
    else if (intent === 'order') {
      if (ctx && ctx.customerId) {
        var mine = M.state.orders.filter(function (o) { return o.customerId === ctx.customerId; });
        var last = mine[mine.length - 1];
        if (!last) out.text = 'You have no orders yet.';
        else {
          var tr = M.trackingFor ? M.trackingFor(last) : null;
          out.text = 'Your latest order ' + last.ref + ' (' + M.money(last.totalCents) + '): ' + (tr ? tr.headline + (tr.sub ? ' — ' + tr.sub : '') : last.status.replace('_', ' ')) + '. See My orders for live tracking.';
        }
      } else out.text = t.order;
    } else if (intent === 'greeting') out.text = t.hi;
    else out.text = t.unknown;

    out.text = prefix + out.text;
    return out;
  }

  M.assist = { reply: reply, detectLanguage: detectLanguage, classify: classify };
})();
