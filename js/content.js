/* Tyllage Content studio — weekly post ideas for Tyllage's social media and WhatsApp channel.
 *
 * PROTOTYPE ONLY. Ideas are rule-based, built from what the farm actually has this week:
 * Demand Radar (crops to push), Harvest Planner (what's growing), recipes, praise from
 * Feedback, and a library of "support local / Singapore 2035" education posts. In
 * production a language model would write the captions from the same facts; staff still
 * edit every caption, and someone other than the writer approves it before it's posted.
 * Nothing is posted automatically — staff copy the caption into Instagram, Facebook or
 * the WhatsApp channel and mark it posted.
 */
(function () {
  'use strict';
  var M = window.MEOD;

  var TYPES = {
    fresh: { label: 'Fresh this week', tone: 'green', day: 1, time: '7:30pm' },
    story: { label: 'Farm story', tone: 'blue', day: 2, time: '12:30pm' },
    recipe: { label: 'Recipe', tone: 'amber', day: 5, time: '6:00pm' },
    love: { label: 'Customer love', tone: 'green', day: 4, time: '8:00pm' },
    learn: { label: 'Support local', tone: 'blue', day: 0, time: '10:00am' },
    visit: { label: 'Visit the farm', tone: 'amber', day: 3, time: '12:30pm' },
    whatsapp: { label: 'WhatsApp channel', tone: 'green', day: 1, time: '9:00am' }
  };
  var CHANNELS = { social: 'Instagram & Facebook', whatsapp: 'WhatsApp channel' };
  var BASE_TAGS = ['#Tyllage', '#SGFresh', '#GrowLocal'];
  var ORDER_LINE = 'Order on Tyllage Fresh — delivered Tue, Thu & Sat 🚚';

  // "Support local" library: facts Tyllage already states on its website, so nothing new is claimed.
  var LEARN = [
    { id: 'imports', image: 'assets/img/hero-farm.webp', title: 'Why grow food here?', caption: 'Singapore imports over 90% of its food 🌏 Every bunch grown in Kranji is one less shipped or flown in.\n\nBy choosing local, you help Singapore grow more of its own food by 2035 — and keep farms like ours growing. 🌱\n\nOrder fresh from Kranji on Tyllage Fresh.', tags: ['#SingaporeFoodStory', '#FoodSecurity', '#SupportLocal'] },
    { id: 'sgfresh', image: 'assets/img/fresh-produce.webp', title: 'Look for the SG Fresh mark', caption: 'Spot this mark? 🔍 SG Fresh Produce means it was grown right here in Singapore, to a quality standard.\n\nOur greens are SG Fresh certified — harvested in Kranji, at your door within a day. Order on Tyllage Fresh 🌱', tags: ['#SGFreshProduce', '#SupportLocal'] },
    { id: 'pesticide', image: 'assets/img/ladybug.webp', title: 'Pesticide-free, by design', caption: 'Grown pesticide-free, chemical-free and GMO-free 🌿\n\nWe pair hi-tech greenhouses with the wisdom of our forefathers — so you can rinse, cook and enjoy without worry.\n\nOrder on Tyllage Fresh — delivered Tue, Thu & Sat.', tags: ['#PesticideFree', '#CleanEating'] },
    { id: 'imperfect', image: 'assets/img/farm-flatlay.webp', title: 'Imperfect veg is still good veg', caption: 'A few holes or a curly leaf? Still fresh, still delicious 🥬\n\nOur Buy to Clear deals give "imperfect" harvests a home instead of the compost heap. Less waste, better prices — everyone wins. Find them under Buy to Clear when you order on Tyllage Fresh.', tags: ['#FoodWaste', '#UglyVeg', '#ZeroWaste'] },
    { id: 'scale', image: 'assets/img/hero-farm.webp', title: 'A demo farm running on Tyllage', caption: 'Did you know? Our demo farm shows how local growers can grow greens locally, sustainably and at scale 🚜\n\nCome see it for yourself on a farm visit!', tags: ['#UrbanFarming', '#SingaporeFoodStory'] },
    { id: 'seasons', image: 'assets/img/farmer-vertical.webp', title: 'How fresh is fresh?', caption: 'Supermarket greens can take days to travel here. Ours are harvested in the morning and with you within a day 🕒\n\nThat\'s why they stay crisp in the fridge for longer. Taste the difference — order on Tyllage Fresh 🌱', tags: ['#FarmToTable', '#SupportLocal'] }
  ];

  function S() { return M.state; }
  function dayKey(d) { return M.clearance.dayKey(d); }
  function parseKey(k) { return M.clearance.parseDayKey(k); }
  function money(c) { return 'S$' + (c / 100).toFixed(2); }
  // Next date (today or later, within 7 days) that falls on weekday wd.
  function nextDay(wd) {
    var d = new Date(); d.setHours(0, 0, 0, 0);
    for (var i = 0; i < 7; i++) { var x = new Date(d.getTime() + i * 864e5); if (x.getDay() === wd) return dayKey(x); }
    return dayKey(d);
  }
  function weekNo() { return Math.floor((Date.now() - new Date(2026, 0, 5).getTime()) / (7 * 864e5)); }
  function tagFor(p) { return '#' + p.title.replace(/[^A-Za-z]/g, ''); }

  function ideas() {
    var out = [];
    var crops = M.radar.crops();
    var inStock = crops.filter(function (c) { return c.stockKnown && c.stock > 0; });
    var push = inStock.filter(function (c) { return c.status === 'surplus'; }).sort(function (a, b) { return b.gap - a.gap; });
    var rising = inStock.filter(function (c) { return c.status !== 'short' && c.trendPct > 10; }).sort(function (a, b) { return b.trendPct - a.trendPct; });
    var hero = push[0] || rising[0] || inStock[0];

    // 1. Fresh this week — the crop the farm most needs to move (never a short crop).
    if (hero) {
      var p = hero.product, r = M.recipes && M.recipes.forProduct(p);
      out.push({ key: 'fresh|' + p.id, type: 'fresh', channel: 'social', product: p, title: 'Fresh ' + p.title + ' this week',
        caption: 'Fresh from Kranji 🌱 Our ' + p.title + (p.subtitle ? ' (' + p.subtitle + ')' : '') + ' is looking great this week.\n\n' + p.blurb +
          (r ? '\n\nTry it: ' + r.name.en + ' — ready in ' + r.minutes + ' minutes.' : '') + '\n\n' + ORDER_LINE,
        tags: BASE_TAGS.concat([tagFor(p), '#EatLocal']),
        why: hero.status === 'surplus' ? 'Demand Radar: about ' + hero.gap + ' more ' + p.title + ' than expected demand — a post helps it sell at full price.'
          : 'Demand for ' + p.title + ' is ' + (hero.trendPct > 0 ? 'up ' + hero.trendPct + '%' : 'steady') + ' and it\'s in stock.' });
    }
    // 2. WhatsApp channel — the short version of the week's harvest, for people who follow it.
    var picks = (push.length ? push : inStock).slice(0, 3).map(function (c) { return c.product; });
    if (picks.length) {
      out.push({ key: 'whatsapp|week', type: 'whatsapp', channel: 'whatsapp', product: picks[0], title: 'This week\'s harvest (WhatsApp)',
        caption: '🌱 *Tyllage Fresh — this week\'s harvest*\n' + picks.map(function (p) { return '• ' + p.title + ' — ' + money(p.priceCents); }).join('\n') +
          '\n\nOrder by the night before for Tue, Thu & Sat delivery. Reply STOP to leave the channel.',
        tags: [], why: 'For channel followers only. Prices come from the live catalogue, so check them before posting.' });
    }
    // 3. Recipe — a second crop worth pushing, with a recipe from the library.
    var recipeCrop = push.concat(rising, inStock).filter(function (c) { return (!hero || c.product.id !== hero.product.id) && M.recipes && M.recipes.forProduct(c.product); })[0];
    if (recipeCrop) {
      var rp = recipeCrop.product, rr = M.recipes.forProduct(rp);
      out.push({ key: 'recipe|' + rp.id, type: 'recipe', channel: 'social', product: rp, title: 'Recipe: ' + rr.name.en,
        caption: '🍳 ' + rr.name.en + ' · ' + rr.minutes + ' min\n\nYou\'ll need:\n' + rr.ingredients.map(function (i) { return '• ' + i; }).join('\n') +
          '\n\n' + rr.steps.map(function (s, i) { return (i + 1) + '. ' + s; }).join('\n') + '\n\nMade with ' + rp.title + ' from our Kranji farm. ' + ORDER_LINE,
        tags: BASE_TAGS.concat([tagFor(rp), '#HomeCooking', '#SGFood']),
        why: 'Recipes get saved and shared. ' + rp.title + (recipeCrop.status === 'surplus' ? ' has extra supply this week.' : ' is in stock.') });
    }
    // 4. Farm story — the next batch nearly ready, from sowing to harvest.
    var batch = M.harvest.upcoming().filter(function (b) { var st = M.harvest.stage(b); return st === 'growing' || st === 'due'; })[0] || M.harvest.upcoming()[0];
    if (batch) {
      var bp = M.byId('products', batch.productId);
      var grown = Math.max(1, Math.round((Date.now() - parseKey(batch.sowDate).getTime()) / 864e5));
      var hd = parseKey(batch.harvestDate).toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'short' });
      var open = M.harvest.isOpen(batch);
      out.push({ key: 'story|' + batch.id, type: 'story', channel: 'social', product: bp, title: 'Behind the scenes: ' + bp.title,
        caption: 'Day ' + grown + (bp.category === 'fungi' ? ' in the grow room 🍄' : ' in the greenhouse 🌿') + ' This batch of ' + bp.title + ' was sown ' + grown + ' days ago and will be harvested on ' + hd + '.\n\n' +
          'From seed to your plate, it never leaves Singapore.' + (open ? '\n\nPre-order now to get it the day it\'s picked!' : ''),
        tags: BASE_TAGS.concat(['#BehindTheScenes', '#UrbanFarming', tagFor(bp)]),
        why: 'From Harvest Planner. Real farm moments build trust' + (open ? ' — and this batch is open for pre-orders.' : '.'), photoTip: 'Take a photo of the batch before it is harvested.',
        // Post before the harvest, not after it.
        dayKey: nextDay(TYPES.story.day) >= batch.harvestDate ? dayKey(new Date()) : null });
    }
    // 5. Customer love — the best recent praise. Needs the customer's OK before posting.
    var praise = M.feedback ? M.feedback.items().filter(function (x) { return x.sentiment === 'pos' && x.f.source !== 'b2b'; })[0] : null;
    if (praise) {
      out.push({ key: 'love|' + praise.f.id, type: 'love', channel: 'social', product: praise.product, title: 'What our customers say', needsPermission: true,
        caption: '💚 "' + praise.f.text + '"\n— one of our Tyllage Fresh customers\n\nThank you for growing with us! Every order helps a local farm keep growing.',
        tags: BASE_TAGS.concat(['#CustomerLove', '#SupportLocal']),
        why: 'From Feedback (' + M.feedback.SOURCES[praise.f.source].toLowerCase() + '). Ask the customer first — and don\'t use their name unless they agree.' });
    }
    // 6. Support local / 2035 — rotates through the library week by week.
    var lesson = LEARN[weekNo() % LEARN.length];
    out.push(learnIdea(lesson));
    // 7. Visit the farm — fill learning journeys and farm visits.
    out.push({ key: 'visit|week', type: 'visit', channel: 'social', product: null, title: 'Come visit the farm', image: 'assets/img/hero-farm.webp',
      caption: 'Ever wondered where your vegetables come from? 🚜 Our learning journeys take schools, families and teams through the greenhouses — and you get to harvest your own greens.\n\nBook a visit on our Experiences page 🌱',
      tags: BASE_TAGS.concat(['#LearningJourney', '#FarmVisit', '#SingaporeFoodStory']), why: 'Farm visits teach where food comes from and lead to farm-shop sales.' });
    var planned = {};
    (S().contentPlan || []).forEach(function (c) { if (c.status !== 'removed') planned[c.ideaKey] = c; });
    return out.map(function (x) {
      var t = TYPES[x.type];
      x.dayKey = x.dayKey || nextDay(t.day); x.time = t.time;
      // Product photo when Tyllage has one; otherwise a farm photo that suits the post type.
      x.image = x.image || (x.type !== 'whatsapp' && x.type !== 'story' && x.product && x.product.image) ||
        { whatsapp: 'assets/img/farm-flatlay.webp', story: 'assets/img/farmer-vertical.webp', recipe: 'assets/img/farm-flatlay.webp', love: 'assets/img/contact.webp' }[x.type] || 'assets/img/fresh-produce.webp';
      x.planned = planned[x.key] || null;
      x.checks = check(x.caption, x);
      return x;
    });
  }
  function learnIdea(l) {
    return { key: 'learn|' + l.id, type: 'learn', channel: 'social', product: null, title: l.title, image: l.image, caption: l.caption, tags: BASE_TAGS.concat(l.tags),
      why: 'Education post about supporting local farms. Uses only facts Tyllage already states on its website.', photoTip: 'A wide shot of the greenhouses works well.' };
  }

  // Quick checks before a caption goes out — explainable rules, not a judgement of quality.
  function check(caption, x) {
    var c = String(caption || ''), out = [];
    var limit = x && x.channel === 'whatsapp' ? 1000 : 2200;
    out.push({ ok: c.length <= limit, label: c.length + ' / ' + limit + ' characters' });
    var claims = /\b(cure|cures|prevent|prevents|treat|treats|heal|detox|boost(s)? (your )?immun|cancer|diabetes|weight loss)\b/i;
    out.push({ ok: !claims.test(c), label: claims.test(c) ? 'Health claim — remove it' : 'No health claims' });
    out.push({ ok: /order|book|pre-order|visit|meod\.com|reply|come see/i.test(c), label: /order|book|pre-order|visit|meod\.com|reply|come see/i.test(c) ? 'Has a call to action' : 'Add a call to action' });
    if (x && x.needsPermission) out.push({ ok: false, warn: true, label: 'Ask the customer before posting' });
    if (/S\$\d/.test(c)) out.push({ ok: true, warn: true, label: 'Check prices before posting' });
    return out;
  }

  // Plan: staff add an idea (edited), someone else approves, staff mark it posted.
  function plan(x, caption, dayKeyStr, actor) {
    S().contentPlan = S().contentPlan || [];
    var id = M.nextId('PO');
    S().contentPlan.unshift({ id: id, ideaKey: x.key, type: x.type, channel: x.channel, title: x.title, caption: caption, tags: x.tags || [], image: x.image || null,
      productId: x.product ? x.product.id : null, dayKey: dayKeyStr, time: x.time || TYPES[x.type].time, needsPermission: !!x.needsPermission,
      status: 'pending', createdBy: actor, createdAt: new Date().toISOString(), approvedBy: null, postedAt: null });
    return { ok: true, id: id };
  }
  function find(id) { return (S().contentPlan || []).filter(function (c) { return c.id === id; })[0]; }
  function approve(id, actor) {
    var c = find(id);
    if (!c || c.status !== 'pending') return { ok: false, error: 'That post isn\'t waiting for approval.' };
    if (c.createdBy === actor) return { ok: false, error: 'Someone other than the writer must approve it.' };
    if (!check(c.caption, c).every(function (k) { return k.ok || k.warn; })) return { ok: false, error: 'Fix the caption checks first (length, health claims, call to action).' };
    c.status = 'approved'; c.approvedBy = actor; c.approvedAt = new Date().toISOString();
    return { ok: true, post: c };
  }
  function markPosted(id, actor) {
    var c = find(id);
    if (!c || c.status !== 'approved') return { ok: false, error: 'Only approved posts can be marked as posted.' };
    c.status = 'posted'; c.postedAt = new Date().toISOString(); c.postedBy = actor;
    return { ok: true, post: c };
  }
  function remove(id) { var c = find(id); if (c) c.status = 'removed'; return { ok: !!c }; }
  function update(id, caption, dayKeyStr) {
    var c = find(id);
    if (!c || c.status === 'posted') return { ok: false, error: 'Posted posts can\'t be edited.' };
    c.caption = caption; if (dayKeyStr) c.dayKey = dayKeyStr;
    if (c.status === 'approved') { c.status = 'pending'; c.approvedBy = null; } // edits need a fresh approval
    return { ok: true, post: c };
  }
  function upcoming(days) {
    var from = dayKey(new Date()), to = dayKey(new Date(Date.now() + (days || 7) * 864e5));
    return (S().contentPlan || []).filter(function (c) { return c.status !== 'removed' && c.dayKey >= from && c.dayKey < to; })
      .sort(function (a, b) { return a.dayKey < b.dayKey ? -1 : a.dayKey > b.dayKey ? 1 : 0; });
  }

  M.content = { TYPES: TYPES, CHANNELS: CHANNELS, LEARN: LEARN, ideas: ideas, learnIdea: learnIdea, check: check, plan: plan, approve: approve, markPosted: markPosted, remove: remove, update: update, upcoming: upcoming, nextDay: nextDay };
})();
