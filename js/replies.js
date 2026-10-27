/* Tyllage Reply — reads a farm-visit enquiry and drafts an email reply for staff to edit.
 *
 * PROTOTYPE ONLY. read() pulls facts and flags out of the booking with simple rules and
 * keyword matching, and draft() fills a template. In the live version a language model
 * would do both from the same booking fields; the shape of what they return would stay the
 * same. Nothing is ever sent from here: staff review, edit and press Send themselves.
 * Session times, what's included and directions are illustrative, for Tyllage to confirm.
 */
(function () {
  'use strict';
  var M = window.MEOD;

  var CODE_TOKEN = '{farm-shop code}';
  var DURATION_MIN = { 'Farm Tour': 90, 'Workshop': 120, 'School Visit': 120, 'Others': 90 };
  var DAY_SLOTS = [570, 690, 840, 960];     // 9:30am, 11:30am, 2:00pm, 4:00pm
  var MORNING_SLOTS = [540, 645, 750];      // 9:00am, 10:45am, 12:30pm
  var INCLUDED = {
    school: ['A seedling-to-harvest walk through our greenhouses', 'Hands-on planting that students take home', 'A learning outcomes sheet for teachers'],
    company: ['A guided tour of the farm', 'A hands-on mushroom-growing workshop', 'A tasting of what is in season'],
    community: ['A gentle-paced guided tour with rest stops', 'A tasting of what is in season', 'Tips on starting a neighbourhood group buy'],
    other: ['A guided tour of the farm', 'A tasting of what is in season']
  };
  var KEYWORDS = [
    { re: /\b(primary|p)\s?([1-6])\b/i, fact: function (m) { return 'Primary ' + m[2] + ' class'; }, line: function (m) { return 'For your Primary ' + m[2] + ' students, we\'ll focus on plant life cycles and where our food comes from.'; } },
    { re: /\b(secondary|sec)\s?([1-5])\b/i, fact: function (m) { return 'Secondary ' + m[2] + ' class'; }, line: function () { return 'For your secondary students, we\'ll cover food security and how farms like ours use technology to grow more with less.'; } },
    { re: /science/i, fact: function () { return 'Science focus'; }, line: function () { return 'We can tie the visit to science topics such as plant growth, photosynthesis and fungi.'; } },
    { re: /food security|30 by 30|sustainab/i, fact: function () { return 'Food security / sustainability theme'; }, line: function () { return 'We\'ll include a short talk on Singapore\'s food security and why buying local matters.'; } },
    { re: /csr|team|staff/i, fact: function () { return 'Team / CSR day'; }, line: function () { return 'The workshop works well as a team activity, and staff can order fresh produce home the same day.'; } },
    { re: /senior|elderly|wheelchair|mobility|walking aid/i, fact: function () { return 'Seniors / mobility needs'; }, line: function () { return 'Our main paths are paved, and we\'ll plan rest stops with seating along the way.'; }, flag: 'Mentions seniors or mobility needs: check the accessible route and seating.' },
    { re: /morning/i, fact: function () { return 'Prefers mornings'; }, morning: true },
    { re: /lunch|food|meal|halal|vegetarian|vegan|allerg|dietary/i, fact: function () { return 'Food / dietary mention'; }, ask: 'any dietary needs or allergies we should know about for the tasting', flag: 'Mentions food or dietary needs: confirm what the tasting can cover.' },
    { re: /bus|coach|transport|carpark|parking/i, fact: function () { return 'Asks about transport'; }, line: function () { return 'Coaches can drop off and pick up at our main gate, and there is limited parking on site.'; } }
  ];

  function longDay(key) { return M.clearance.parseDayKey(key).toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long' }); }
  function shortDay(d) { return d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' }); }
  function clock(mins) { var h = Math.floor(mins / 60), m = mins % 60; return (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m + (h >= 12 ? 'pm' : 'am'); }
  function cleanName(n) { return String(n || '').replace(/\s*\(demo\)\s*/i, '').trim(); }
  function possessive(n) { return /s$/i.test(n) ? n + '\'' : n + '\'s'; }
  function greetingName(b) {
    var n = cleanName(b.name);
    if (!n || /team|office|committee|hr\b/i.test(n)) return 'there';
    return n;
  }

  // Facts and flags staff see beside the draft; asks are questions the draft puts to the organiser.
  function read(b) {
    var type = M.GROUP_TYPES[b.groupType] || null;
    var sessions = M.visits.sessions(b.pax);
    var day = M.clearance.parseDayKey(b.date);
    var daysAway = Math.round((day.getTime() - new Date().setHours(0, 0, 0, 0)) / 864e5);
    var msg = String(b.message || '');
    var out = { facts: [], flags: [], asks: [], lines: [], morning: false, sessions: sessions, daysAway: daysAway };
    out.facts.push((b.org ? cleanName(b.org) + ' · ' : '') + (type ? type.label : 'Individual / friends'));
    out.facts.push(b.experience + ' · ' + b.pax + ' guests' + (sessions > 1 ? ' (' + sessions + ' sessions)' : ''));
    out.facts.push(longDay(b.date) + (daysAway >= 0 ? ' · in ' + daysAway + ' day' + (daysAway === 1 ? '' : 's') : ''));
    KEYWORDS.forEach(function (k) {
      var m = k.re.exec(msg);
      if (!m) return;
      out.facts.push(k.fact(m));
      if (k.line) out.lines.push(k.line(m));
      if (k.flag) out.flags.push(k.flag);
      if (k.ask) out.asks.push(k.ask);
      if (k.morning) out.morning = true;
    });
    if (sessions > 1) out.flags.push('Large group: ' + b.pax + ' guests split into ' + sessions + ' sessions of up to ' + M.RULES.visitSessionMax + '.');
    var fit = b.status !== 'confirmed' && M.visits.fits ? M.visits.fits(b) : null;
    out.full = !!(fit && !fit.fits);
    if (out.full) out.flags.push('Fully booked: ' + fit.booked + ' of ' + fit.cap + ' sessions already taken that day. Offer other dates.');
    if (day.getDay() === 0) out.flags.push('Sunday visit: check the farm is staffed that day.');
    if (daysAway >= 0 && daysAway < 7) out.flags.push('Less than a week away: reply today.');
    if (!String(b.phone || '').trim()) { out.flags.push('No phone number: the draft asks for one.'); out.asks.unshift('a mobile number we can reach on the day'); }
    if (!b.org && b.pax >= 15) out.asks.push('the name of your organisation, if you\'re visiting as a group');
    if (sessions > 1) out.asks.push('whether back-to-back sessions work, or if you\'d prefer to split the group across two days');
    if (!msg.trim()) out.asks.push('anything you\'d like the visit to focus on');
    var replies = (b.replies || []).length;
    if (replies) out.flags.push('Already replied ' + replies + ' time' + (replies === 1 ? '' : 's') + '.');
    return out;
  }

  function slotsFor(b, info) {
    var dur = DURATION_MIN[b.experience] || 90;
    var starts = info.morning ? MORNING_SLOTS : DAY_SLOTS;
    var list = [];
    for (var i = 0; i < info.sessions; i++) {
      var start = starts[i] != null ? starts[i] : starts[starts.length - 1] + (i - starts.length + 1) * (dur + 15);
      list.push(clock(start) + ' – ' + clock(start + dur));
    }
    return list;
  }
  function altDates(b) {
    // Days with room for the whole group (Visits capacity), else simply the next two days.
    var free = M.visits.freeDays ? M.visits.freeDays(b, 2) : [];
    if (free.length) return free.map(function (k) { return shortDay(M.clearance.parseDayKey(k)); });
    var d = M.clearance.parseDayKey(b.date), out = [];
    while (out.length < 2) {
      d = new Date(d.getTime() + 864e5);
      if (d.getDay() !== 0) out.push(shortDay(d));
    }
    return out;
  }
  function bullets(list) { return list.map(function (x) { return '• ' + x; }).join('\n'); }

  // kind: 'confirm' | 'details' | 'alternative'; tone: 'warm' | 'formal'.
  function draft(b, opts) {
    opts = opts || {};
    var kind = opts.kind || 'confirm', formal = opts.tone === 'formal';
    var info = read(b);
    var typeKey = M.GROUP_TYPES[b.groupType] ? b.groupType : 'other';
    var type = M.GROUP_TYPES[typeKey];
    var who = cleanName(b.org) || 'your group';
    var hello = (formal ? 'Dear ' : 'Hi ') + greetingName(b) + ',';
    var signoff = (formal ? 'Yours sincerely,' : 'Warm regards,') + '\nTyllage Visits Team\nWhatsApp +65 8133 0358 · info@meod.com.sg';
    var pct = Math.round(M.RULES.visitFundRate * 100);
    var subject, parts = [hello];

    if (kind === 'confirm') {
      subject = 'Your Tyllage visit on ' + shortDay(M.clearance.parseDayKey(b.date)) + ' is confirmed';
      parts.push((formal ? 'Thank you for your enquiry. We are pleased to confirm ' : 'Thanks so much for choosing Tyllage! We\'re happy to confirm ') +
        (b.org ? possessive(who) + ' ' : 'your ') + b.experience.toLowerCase() + ' for ' + b.pax + ' guests on ' + longDay(b.date) + '.');
      var slots = slotsFor(b, info);
      parts.push((formal ? 'Programme' : 'Here\'s the plan') + ':\n' + bullets(
        slots.map(function (s, i) { return (slots.length > 1 ? 'Session ' + (i + 1) + ': ' : '') + s + (slots.length > 1 ? ' (up to ' + M.RULES.visitSessionMax + ' guests)' : ''); })
          .concat(INCLUDED[typeKey]).concat(info.lines)));
      parts.push('On the day:\n' + bullets([
        'Address: 13 Neo Tiew Harvest Lane, Singapore 719838',
        'Please bring water, a hat and covered shoes — part of the visit is outdoors',
        'Your group\'s farm shop: guests scan a QR code to order fresh produce with ' + Math.round(M.RULES.groupDiscountRate * 100) + '% off, and ' + pct + '% of the group\'s orders goes to your ' + type.fund + '. Your code: ' + CODE_TOKEN
      ]));
      if (info.asks.length) parts.push((formal ? 'To help us prepare, could you kindly let us know:' : 'To help us get ready, could you let us know:') + '\n' + bullets(info.asks));
      parts.push(formal ? 'We look forward to welcoming you.' : 'We can\'t wait to show you around!');
    } else if (kind === 'details') {
      subject = 'About your Tyllage visit on ' + shortDay(M.clearance.parseDayKey(b.date));
      parts.push((formal ? 'Thank you for your interest in visiting Tyllage.' : 'Thanks for your interest in visiting Tyllage!') +
        ' We\'d love to host ' + (b.org ? who : 'your group') + ' for a ' + b.experience.toLowerCase() + ' on ' + longDay(b.date) + '.');
      var asks = info.asks.slice();
      if (asks.indexOf('your preferred start time (morning or afternoon)') === -1 && !info.morning) asks.push('your preferred start time (morning or afternoon)');
      parts.push((formal ? 'Before we confirm, could you kindly share:' : 'Before we confirm, could you share:') + '\n' + bullets(asks));
      if (info.lines.length) parts.push(info.lines.join(' '));
      parts.push(formal ? 'Once we have these details, we will confirm your booking.' : 'Once we hear back, we\'ll confirm everything and send your group\'s farm-shop code.');
    } else {
      var alts = altDates(b);
      subject = 'Other dates for your Tyllage visit';
      parts.push((formal ? 'Thank you for your enquiry. Unfortunately, we are fully booked on ' : 'Thanks for reaching out! Unfortunately we\'re fully booked on ') + longDay(b.date) + '.');
      parts.push((formal ? 'We would be glad to offer one of these dates instead:' : 'We\'d love to host you on one of these dates instead:') + '\n' + bullets(alts.map(function (d) { return d + ', same programme for ' + b.pax + ' guests'; })));
      parts.push(formal ? 'Please let us know which suits you, and we will confirm straight away.' : 'Just reply with the one that works and we\'ll confirm straight away.');
    }
    parts.push(signoff);
    return { subject: subject, body: parts.join('\n\n'), info: info };
  }

  M.replies = { read: read, draft: draft, CODE_TOKEN: CODE_TOKEN };
})();
