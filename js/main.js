/* Public site behaviour: nav, scroll effects, produce grid, booking form and
 * the floating Ask Tyllage assistant. Depends on data.js and assist.js. */
(function () {
  'use strict';
  var M = window.MEOD;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }

  // Header turns solid after scrolling past the hero.
  var header = $('.site-header');
  function onScroll() { if (header) header.classList.toggle('solid', window.scrollY > 40); }
  window.addEventListener('scroll', onScroll, { passive: true });
  // Browsers can restore a scrolled position on reload/back without a scroll event.
  window.addEventListener('pageshow', onScroll);
  window.addEventListener('load', onScroll);
  onScroll();

  // Mobile menu
  var toggle = $('.menu-toggle');
  var links = $('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
      if (header) header.classList.add('solid');
    });
  }

  // Reveal on scroll
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    $all('.reveal').forEach(function (n) { io.observe(n); });
  } else {
    $all('.reveal').forEach(function (n) { n.classList.add('visible'); });
  }

  $all('[data-year]').forEach(function (n) { n.textContent = new Date().getFullYear(); });

  // Show "Hi, name" on the portal button when signed in.
  try {
    var session = JSON.parse(sessionStorage.getItem('meod-session') || 'null');
    if (session) $all('[data-portal-label]').forEach(function (n) { n.textContent = 'My Portal'; });
  } catch (e) { /* ignore */ }

  /* ---------- Produce grid (home: featured, produce page: full catalogue) ---------- */
  var CATEGORY_ART = M.CATEGORY_ART;

  function produceTile(p) {
    var cat = M.CATEGORIES[p.category];
    var s = M.stockStatus(p);
    var tile = el('article', { class: 'produce-tile' + (s.key === 'out' ? ' is-out' : '') });

    var media = el('div', { class: 'tile-media' });
    if (p.image) {
      // Veg cut-outs sit on white; Farm & More shots are styled photos that fill the frame.
      media.classList.add(p.category === 'farm-more' ? 'cover' : 'contain');
      media.appendChild(el('img', { src: p.image, alt: p.title, loading: 'lazy', width: '420', height: '420' }));
    } else {
      media.classList.add('art');
      media.style.setProperty('--tint', cat.color);
      var art = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      art.setAttribute('viewBox', '0 0 64 64');
      art.setAttribute('aria-hidden', 'true');
      art.innerHTML = CATEGORY_ART[p.category] || CATEGORY_ART['asian-greens'];
      media.appendChild(art);
    }
    media.appendChild(el('span', { class: 'pill pill-' + s.key }, s.label));
    tile.appendChild(media);

    var body = el('div', { class: 'tile-body' });
    body.appendChild(el('span', { class: 'tile-cat' }, cat.label));
    body.appendChild(el('h3', null, p.title));
    body.appendChild(el('span', { class: 'sub' }, p.subtitle));
    if (p.blurb) body.appendChild(el('p', null, p.blurb));
    var chips = el('ul', { class: 'nutri-chips', 'aria-label': 'Nutrients' });
    String(p.nutrients || '').split('•').forEach(function (part) {
      part = part.trim();
      if (part) chips.appendChild(el('li', null, part));
    });
    if (chips.childElementCount) body.appendChild(chips);
    var line = el('div', { class: 'price-line' });
    line.appendChild(el('span', { class: 'price' }, M.money(p.priceCents)));
    line.appendChild(el('a', { class: 'tile-buy', href: '#', 'aria-label': 'Buy ' + p.title + ' on Tyllage Fresh (demo)' }, 'Buy ↗'));
    body.appendChild(line);
    tile.appendChild(body);
    return tile;
  }

  var featured = $('[data-featured-produce]');
  if (featured) {
    // Featured strip: in-stock fresh produce, photographed items first.
    M.state.products
      .filter(function (p) { return M.stockStatus(p).key === 'ok' && p.category !== 'farm-more'; })
      .sort(function (a, b) { return (b.image ? 1 : 0) - (a.image ? 1 : 0); })
      .slice(0, Number(featured.getAttribute('data-featured-produce')) || 4)
      .forEach(function (p) { featured.appendChild(produceTile(p)); });
  }

  var grid = $('[data-produce-grid]');
  if (grid) {
    var view = { filter: 'all', q: '', inStock: false, expanded: false };
    var search = $('[data-produce-search]');
    var stockToggle = $('[data-instock-only]');
    var emptyBox = $('[data-produce-empty]');
    var countLine = $('[data-result-count]');
    var moreBox = $('[data-produce-more]');
    var moreBtn = $('[data-more-toggle]');
    var moreNote = $('[data-more-note]');

    // 'All' starts collapsed to two full rows (three on phones) with a Show more button.
    var collapsedLimit = function () {
      var cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 4;
      return cols * (cols <= 2 ? 3 : 2);
    };

    var matches = function (p, ignoreCategory) {
      if (p.bagOffer) return false; // sold only through the Buy to Clear bag pre-order now
      if (!ignoreCategory && view.filter !== 'all' && p.category !== view.filter) return false;
      if (view.inStock && !(M.stockStatus(p).known && p.stock.qty > 0)) return false;
      if (view.q) {
        var hay = [p.title, p.subtitle, p.blurb].concat(p.aliases || []).join(' ').toLowerCase();
        if (hay.indexOf(view.q) === -1) return false;
      }
      return true;
    };

    var renderCatalogue = function () {
      var list = M.state.products.filter(function (p) { return matches(p); });
      var limit = collapsedLimit();
      var collapsible = view.filter === 'all' && list.length > limit;
      var shown = collapsible && !view.expanded ? list.slice(0, limit) : list;
      grid.textContent = '';
      shown.forEach(function (p) { grid.appendChild(produceTile(p)); });
      if (emptyBox) emptyBox.hidden = list.length > 0;
      if (countLine) {
        countLine.textContent = !list.length ? ''
          : shown.length < list.length ? 'Showing ' + shown.length + ' of ' + list.length + ' items'
          : 'Showing ' + list.length + (list.length === 1 ? ' item' : ' items');
      }
      if (moreBox) {
        moreBox.hidden = !collapsible;
        moreBtn.textContent = view.expanded ? 'Show less' : 'Show more';
        moreBtn.setAttribute('aria-expanded', String(view.expanded));
        moreNote.textContent = view.expanded ? '' : (list.length - limit) + ' more to discover';
      }
      // Chip counts follow the search and stock toggle, so people can see where results are.
      $all('[data-chip-count]').forEach(function (n) {
        var key = n.getAttribute('data-chip-count');
        n.textContent = M.state.products.filter(function (p) { return matches(p, true) && (key === 'all' || p.category === key); }).length;
      });
    };

    var setFilter = function (key) {
      view.filter = key;
      view.expanded = false;
      $all('[data-filter]').forEach(function (c) {
        var on = c.getAttribute('data-filter') === key;
        c.classList.toggle('active', on);
        c.setAttribute('aria-pressed', String(on));
      });
      renderCatalogue();
    };

    $all('[data-filter]').forEach(function (chip) {
      chip.addEventListener('click', function () { setFilter(chip.getAttribute('data-filter')); });
    });
    if (search) search.addEventListener('input', function () { view.q = search.value.trim().toLowerCase(); renderCatalogue(); });
    if (stockToggle) stockToggle.addEventListener('change', function () { view.inStock = stockToggle.checked; renderCatalogue(); });
    $all('[data-clear-filters]').forEach(function (b) {
      b.addEventListener('click', function () {
        view.q = ''; view.inStock = false;
        if (search) search.value = '';
        if (stockToggle) stockToggle.checked = false;
        setFilter('all');
      });
    });

    if (moreBtn) {
      moreBtn.addEventListener('click', function () {
        var collapsing = view.expanded;
        view.expanded = !view.expanded;
        renderCatalogue();
        if (collapsing) {
          var target = $('#greens');
          if (target) target.scrollIntoView({ block: 'start' });
        } else {
          // Move focus to the first newly revealed card for keyboard users.
          var next = grid.children[collapsedLimit()];
          if (next) { next.setAttribute('tabindex', '-1'); next.focus({ preventScroll: true }); }
        }
      });
    }
    // Columns change with screen width, so the collapsed row count is recalculated on resize.
    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { if (!view.expanded) renderCatalogue(); }, 150);
    });

    renderCatalogue();
  }

  /* ---------- Buy to Clear (clearance.html) ---------- */
  var clearanceGrid = $('[data-clearance-grid]');
  if (clearanceGrid) {
    var emptyNote = $('[data-clearance-empty]');

    function clearanceTile(l) {
      var p = M.byId('products', l.productId);
      var cat = M.CATEGORIES[p.category];
      var tile = el('article', { class: 'produce-tile clearance-tile' });
      var media = el('div', { class: 'tile-media' });
      if (p.image) {
        media.classList.add(p.category === 'farm-more' ? 'cover' : 'contain');
        media.appendChild(el('img', { src: p.image, alt: p.title, loading: 'lazy', width: '420', height: '420' }));
      } else {
        media.classList.add('art');
        media.style.setProperty('--tint', cat.color);
        var art = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        art.setAttribute('viewBox', '0 0 64 64');
        art.setAttribute('aria-hidden', 'true');
        art.innerHTML = CATEGORY_ART[p.category] || CATEGORY_ART['asian-greens'];
        media.appendChild(art);
      }
      tile.appendChild(media);

      var body = el('div', { class: 'tile-body' });
      body.appendChild(el('span', { class: 'reason-pill' }, M.clearance.reasonLabel(l.reason)));
      body.appendChild(el('h3', null, p.title));
      var meta = el('div', { class: 'clearance-meta' });
      meta.appendChild(el('span', { class: 'mini-chip' }, M.clearance.remaining(l) + ' left'));
      meta.appendChild(el('span', { class: 'mini-chip' }, 'Until ' + new Date(l.availableUntil).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })));
      body.appendChild(meta);
      var foot = el('div', { class: 'clearance-foot' });
      var priceRow = el('div', { class: 'price-row' });
      priceRow.appendChild(el('span', { class: 'price-was' }, M.money(l.normalPriceCents)));
      priceRow.appendChild(el('span', { class: 'price-now price' }, M.money(l.clearancePriceCents)));
      priceRow.appendChild(el('span', { class: 'discount-badge' }, '−' + M.clearance.discountPct(l) + '%'));
      foot.appendChild(priceRow);
      foot.appendChild(el('a', { class: 'tile-buy clearance-buy', href: 'portal.html?role=customer' }, 'Buy now →'));
      body.appendChild(foot);
      tile.appendChild(body);
      return tile;
    }

    var listings = M.clearance.listActive();
    listings.forEach(function (l) { clearanceGrid.appendChild(clearanceTile(l)); });
    if (emptyNote) emptyNote.hidden = listings.length > 0;

    // Surprise Harvest Bag promo: a real (local-only) size + exclude choice, carried over
    // to the Portal via the CTA link's query string so it's pre-selected there — this page
    // never checks out, so nothing here is submitted, just passed along.
    var bagChoice = { sizeKey: M.state.harvestBag.sizes[0].key, exclude: '' };
    var sizesBox = $('[data-bag-sizes]');
    var likelyBox = $('[data-bag-likely]');
    var excludeSelect = $('[data-bag-exclude]');
    var ctaLink = $('[data-bag-cta]');

    function hourLabel(d) { var h = d.getHours(); return (h % 12 || 12) + (h >= 12 ? 'pm' : 'am'); }
    function cutoffShort(d) { return d.toLocaleDateString('en-SG', { weekday: 'short' }) + ' ' + hourLabel(d); }
    function deliveryShort(d) { return d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' }); }

    function updateCta() {
      if (!ctaLink) return;
      ctaLink.href = 'portal.html?role=customer&bagSize=' + encodeURIComponent(bagChoice.sizeKey) +
        (bagChoice.exclude ? '&bagExclude=' + encodeURIComponent(bagChoice.exclude) : '');
    }

    function renderSizes() {
      if (!sizesBox) return;
      sizesBox.textContent = '';
      M.state.harvestBag.sizes.forEach(function (sz) {
        var active = bagChoice.sizeKey === sz.key;
        var box = el('button', { type: 'button', class: 'size-box' + (active ? ' active' : ''), 'aria-pressed': String(active) });
        box.appendChild(el('span', { class: 'tick', 'aria-hidden': 'true' }));
        box.appendChild(el('strong', null, sz.label + ' · ' + M.money(sz.priceCents)));
        box.appendChild(el('span', { class: 'size-save' }, 'Save ' + M.money(sz.worthCents - sz.priceCents)));
        box.appendChild(el('span', { class: 'size-worth' }, 'Worth at least ' + M.money(sz.worthCents)));
        box.addEventListener('click', function () { bagChoice.sizeKey = sz.key; renderSizes(); updateCta(); });
        sizesBox.appendChild(box);
      });
    }
    function renderLikely() {
      if (!likelyBox) return;
      likelyBox.textContent = '';
      var items = M.clearance.likelyInside(bagChoice.exclude || null, 5);
      items.forEach(function (p) { likelyBox.appendChild(el('li', null, p.title)); });
      if (!items.length) likelyBox.appendChild(el('li', null, 'Fresh seasonal picks'));
    }
    if (excludeSelect) {
      excludeSelect.appendChild(el('option', { value: '' }, 'No exclusions'));
      Object.keys(M.CATEGORIES).forEach(function (k) { excludeSelect.appendChild(el('option', { value: k }, 'No ' + M.CATEGORIES[k].label)); });
      excludeSelect.addEventListener('change', function () { bagChoice.exclude = excludeSelect.value; renderLikely(); updateCta(); });
    }
    renderSizes();
    renderLikely();
    updateCta();

    var cutoffTextEl = $('[data-bag-cutoff-text]');
    var leftTextEl = $('[data-bag-left-text]');
    if (cutoffTextEl) {
      var renderCutoff = function () {
        var info = M.clearance.nextBagCutoff();
        var left = M.clearance.bagsLeftForDay(M.clearance.dayKey(info.deliveryDay));
        cutoffTextEl.textContent = 'Order by ' + cutoffShort(info.cutoff) + ' for ' + deliveryShort(info.deliveryDay) + ' delivery';
        if (leftTextEl) leftTextEl.textContent = left + (left === 1 ? ' bag left that day' : ' bags left that day');
      };
      renderCutoff();
      setInterval(renderCutoff, 30000);
    }
  }

  /* ---------- Booking form (Experiences) ---------- */
  var booking = $('#booking-form');
  if (booking) {

    var minDate = new Date(Date.now() + 864e5 * 3).toISOString().slice(0, 10);
    var dateInput = $('input[name="date"]', booking);
    if (dateInput) dateInput.min = minDate;
    var maxPax = M.RULES.visitMaxPax;

    // Live note under group size: how many sessions a larger group is split into.
    var paxInput = $('input[name="pax"]', booking);
    var sessionNote = $('[data-session-note]', booking);
    if (paxInput && sessionNote) {
      var renderSessions = function () {
        var n = Number(paxInput.value);
        var sessions = n > 0 ? M.visits.sessions(n) : 1;
        sessionNote.textContent = n > M.RULES.visitSessionMax && n <= maxPax
          ? 'We\'ll split your group into ' + sessions + ' sessions of up to ' + M.RULES.visitSessionMax + '.'
          : 'Up to ' + M.RULES.visitSessionMax + ' per session, ' + maxPax + ' in total.';
      };
      paxInput.addEventListener('input', renderSessions);
      renderSessions();
    }

    booking.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var fd = new FormData(booking);
      var pax = Number(fd.get('pax'));
      var errors = [];
      if (!String(fd.get('name') || '').trim()) errors.push('Please enter your name.');
      if (!/^\S+@\S+\.\S+$/.test(String(fd.get('email') || ''))) errors.push('Please enter a valid email.');
      if (!fd.get('experience')) errors.push('Please choose an experience.');
      if (!(pax >= 1 && pax <= maxPax)) errors.push('Group size must be between 1 and ' + maxPax + '.');
      if (fd.get('groupType') && !String(fd.get('org') || '').trim()) errors.push('Please enter your organisation\'s name.');
      if (!fd.get('date') || fd.get('date') < minDate) errors.push('Please pick a date at least 3 days ahead.');
      var errBox = $('[data-form-errors]', booking);
      if (errors.length) {
        errBox.textContent = errors.join(' ');
        errBox.hidden = false;
        return;
      }
      errBox.hidden = true;
      var id = M.nextId('B');
      M.state.bookings.unshift({
        id: id,
        name: String(fd.get('name')).trim(),
        email: String(fd.get('email')).trim(),
        phone: String(fd.get('phone') || '').trim(),
        org: String(fd.get('org') || '').trim().slice(0, 80),
        groupType: fd.get('groupType') || null,
        experience: fd.get('experience'),
        pax: pax,
        date: fd.get('date'),
        message: String(fd.get('message') || '').trim().slice(0, 500),
        status: 'new',
        createdAt: new Date().toISOString()
      });
      M.audit('public-site', 'booking.created', id);
      M.save();
      booking.hidden = true;
      var ok = $('[data-booking-success]');
      ok.querySelector('[data-booking-ref]').textContent = id;
      ok.hidden = false;
    });
  }

  /* ---------- Ask Tyllage assistant widget ---------- */
  function mountAssist() {
    var fab = el('button', { class: 'assist-fab', type: 'button', 'aria-label': 'Open Ask Tyllage chat', 'aria-expanded': 'false' });
    fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';

    var panel = el('div', { class: 'assist-panel', role: 'dialog', 'aria-label': 'Ask Tyllage chat' });
    panel.innerHTML =
      '<div class="assist-head"><div><strong>Ask Tyllage</strong><small>Stock • Delivery • Group buys • EN / 中文 / BM</small></div>' +
      '<button class="assist-close" type="button" aria-label="Close chat">&times;</button></div>' +
      '<div class="assist-log" aria-live="polite"></div>' +
      '<div class="assist-suggest"></div>' +
      '<form class="assist-form"><label class="sr-only" for="assist-input" style="position:absolute;left:-9999px">Message</label>' +
      '<input id="assist-input" autocomplete="off" maxlength="300" placeholder="e.g. Do you have kai lan?">' +
      '<button class="btn btn-forest btn-sm" type="submit">Send</button></form>' +
      '<p class="assist-disclaimer">Demo assistant. Prices are illustrative; complaints go to a human.</p>';

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    var log = $('.assist-log', panel);
    var input = $('input', panel);
    var session = null;
    try { session = JSON.parse(sessionStorage.getItem('meod-session') || 'null'); } catch (e) { /* ignore */ }
    var ctx = { channel: 'web', customerId: session && session.customerId };

    function push(text, who, extra, link) {
      var m = el('div', { class: 'msg ' + who + (extra ? ' ' + extra : '') });
      m.appendChild(document.createTextNode(text));
      if (link) m.appendChild(el('a', { class: 'msg-link', href: link.href }, link.label));
      log.appendChild(m);
      log.scrollTop = log.scrollHeight;
    }
    function send(text) {
      text = text.trim();
      if (!text) return;
      push(text, 'user');
      var r = M.assist.reply(text, ctx);
      setTimeout(function () {
        push(r.text, 'bot', r.handover ? 'handover' : '', r.showClearanceLink ? { href: 'clearance.html', label: 'Go to Buy to Clear →' } : null);
      }, 350);
    }

    ['Do you have kai lan?', '菜心有货吗？', 'Delivery days?', 'What\'s the surprise bag?', 'My veg arrived wilted'].forEach(function (s) {
      var b = el('button', { type: 'button' }, s);
      b.addEventListener('click', function () { send(s); });
      $('.assist-suggest', panel).appendChild(b);
    });

    function setOpen(open) {
      panel.classList.toggle('open', open);
      document.body.classList.toggle('assist-open', open);
      fab.setAttribute('aria-expanded', String(open));
      if (open) {
        if (!log.childElementCount) push(M.assist.reply('hi', ctx).text, 'bot');
        input.focus();
      }
    }
    fab.addEventListener('click', function () { setOpen(!panel.classList.contains('open')); });
    $('.assist-close', panel).addEventListener('click', function () { setOpen(false); fab.focus(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('open')) setOpen(false); });
    $('form', panel).addEventListener('submit', function (e) { e.preventDefault(); send(input.value); input.value = ''; });
  }

  if (!document.body.hasAttribute('data-no-assist')) mountAssist();

  /* ---------- Scroll to top (sits above the chat button) ---------- */
  function mountToTop() {
    var btn = el('button', { class: 'to-top', type: 'button', 'aria-label': 'Scroll to top', title: 'Back to top' });
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 15l-6-6-6 6"/></svg>';
    if (document.body.hasAttribute('data-no-assist')) btn.classList.add('solo');
    document.body.appendChild(btn);
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      var skip = $('#main');
      if (skip) { skip.setAttribute('tabindex', '-1'); skip.focus({ preventScroll: true }); }
    });
    function update() { btn.classList.toggle('show', window.scrollY > 500); }
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('pageshow', update);
    update();
  }
  mountToTop();
})();
