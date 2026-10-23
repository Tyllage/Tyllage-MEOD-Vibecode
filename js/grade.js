/* Tyllage Grade — prototype harvest grading from a photo, entirely in the browser.
 *
 * PROTOTYPE ONLY. This is not a trained model: it is an explainable colour check.
 * Each photo is scaled down and every pixel classified by hue/saturation/brightness:
 *   - background  near-white, grey or very dark pixels (ignored)
 *   - healthy     green leaves, pale stems, red/purple leaves (e.g. Red Pak Choy, Bayam)
 *   - yellowing   strongly yellow pixels
 *   - browning    dark orange-brown pixels
 * The share of yellow/brown among plant pixels sets a suggested grade. It judges LOOKS
 * ONLY — never food safety — and staff confirm every grade. A trained image model
 * (e.g. Teachable Machine on MEOD's own photos) could replace analyze() later without
 * changing the portal UI, as long as it returns the same shape.
 */
(function () {
  'use strict';
  var M = window.MEOD;

  // Illustrative thresholds — to be calibrated on MEOD's real produce during the pilot.
  var RULES = {
    cosmeticAt: 0.05,   // ≥ 5% yellow/brown leaf area → Cosmetic
    checkAt: 0.18,      // ≥ 18% → Check (a person should look at it)
    minPlant: 0.12,     // below 12% plant pixels the photo is "unclear"
    maxSide: 180        // analyse at most 180px on the long side (fast, ~30k pixels)
  };
  var GRADES = {
    A: { label: 'Grade A', tone: 'green', note: 'Looks fresh — sell at the normal price.' },
    cosmetic: { label: 'Cosmetic', tone: 'amber', note: 'Edible but imperfect — a clearance price makes sense.' },
    check: { label: 'Check', tone: 'red', note: 'A lot of yellowing or browning — a person should inspect it.' },
    unclear: { label: 'Unclear', tone: 'grey', note: 'Not enough leaves in the photo — retake it closer.' }
  };

  function hsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, hue = 0;
    if (d) {
      if (max === r) hue = ((g - b) / d) % 6;
      else if (max === g) hue = (b - r) / d + 2;
      else hue = (r - g) / d + 4;
      hue *= 60;
      if (hue < 0) hue += 360;
    }
    return { h: hue, s: max ? d / max : 0, v: max };
  }

  function classify(r, g, b) {
    var c = hsv(r, g, b);
    if (c.v < 0.12) return 'bg';                    // shadows
    if (c.s < 0.1) return 'bg';                     // white plate, grey table
    if (c.h >= 40 && c.h < 68 && c.s >= 0.45 && c.v >= 0.35) return 'yellow';
    if (c.h >= 8 && c.h < 40 && c.s >= 0.35 && c.v < 0.62) return 'brown';
    if (c.h >= 40 && c.h < 180) return 'plant';    // greens, incl. pale yellow-green stems
    if (c.h >= 260 || c.h < 8) return 'plant';      // red/purple leaves
    return 'bg';                                    // e.g. light wood, blue cloth
  }

  function toCanvas(source) {
    var w = source.naturalWidth || source.width, hgt = source.naturalHeight || source.height;
    var scale = Math.min(1, RULES.maxSide / Math.max(w, hgt));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * scale));
    c.height = Math.max(1, Math.round(hgt * scale));
    c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
    return c;
  }

  // source: a loaded <img> or <canvas>. Returns the grade plus an overlay that marks
  // the pixels behind the decision (yellow → amber, brown → red), so staff can see why.
  function analyze(source) {
    var c = toCanvas(source);
    var ctx = c.getContext('2d');
    var data = ctx.getImageData(0, 0, c.width, c.height);
    var px = data.data;
    var overlay = ctx.createImageData(c.width, c.height);
    var o = overlay.data;
    var n = { plant: 0, yellow: 0, brown: 0, bg: 0 };
    for (var i = 0; i < px.length; i += 4) {
      var k = classify(px[i], px[i + 1], px[i + 2]);
      n[k]++;
      if (k === 'yellow') { o[i] = 255; o[i + 1] = 170; o[i + 2] = 0; o[i + 3] = 230; }
      else if (k === 'brown') { o[i] = 220; o[i + 1] = 30; o[i + 2] = 60; o[i + 3] = 230; }
    }
    var total = px.length / 4;
    var leaf = n.plant + n.yellow + n.brown;
    var plantShare = leaf / total;
    var bad = leaf ? (n.yellow + n.brown) / leaf : 0;
    var grade = plantShare < RULES.minPlant ? 'unclear' : bad >= RULES.checkAt ? 'check' : bad >= RULES.cosmeticAt ? 'cosmetic' : 'A';
    var oc = document.createElement('canvas');
    oc.width = c.width; oc.height = c.height;
    oc.getContext('2d').putImageData(overlay, 0, 0);
    var pct = function (x) { return Math.round(x * 1000) / 10; };
    return {
      grade: grade, label: GRADES[grade].label, tone: GRADES[grade].tone, note: GRADES[grade].note,
      plantPct: pct(plantShare), yellowPct: leaf ? pct(n.yellow / leaf) : 0, brownPct: leaf ? pct(n.brown / leaf) : 0, discolouredPct: pct(bad),
      reason: grade === 'unclear' ? 'Only ' + pct(plantShare) + '% of the photo is leaves.'
        : pct(bad) + '% of leaf area yellow/brown (' + pct(leaf ? n.yellow / leaf : 0) + '% yellow, ' + pct(leaf ? n.brown / leaf : 0) + '% brown).',
      overlayUrl: oc.toDataURL('image/png')
    };
  }

  // Splits a harvested quantity by the share of each grade across the graded photos
  // (unclear photos are left out). Rounds so the three parts always add up to qty.
  function split(results, qty) {
    var usable = results.filter(function (r) { return r.grade !== 'unclear'; });
    if (!usable.length || !(qty > 0)) return null;
    var count = { A: 0, cosmetic: 0, check: 0 };
    usable.forEach(function (r) { count[r.grade]++; });
    var cosmetic = Math.round(qty * count.cosmetic / usable.length);
    var check = Math.round(qty * count.check / usable.length);
    if (cosmetic + check > qty) check = qty - cosmetic;
    return { A: qty - cosmetic - check, cosmetic: cosmetic, check: check, photos: usable.length };
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
  }

  // Deterministic pseudo-random numbers so demo samples look the same every time.
  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

  // Paints simulated yellowing / brown spots onto the leaf pixels of a copy of the photo.
  function blemish(img, kind, amount, seed) {
    var c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    var ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    var data = ctx.getImageData(0, 0, c.width, c.height);
    var px = data.data, rand = rng(seed);
    var blobs = [];
    for (var b = 0; b < amount; b++) {
      blobs.push({ x: rand() * c.width, y: rand() * c.height, r: (0.05 + rand() * 0.09) * Math.min(c.width, c.height) });
    }
    for (var y = 0; y < c.height; y++) {
      for (var x = 0; x < c.width; x++) {
        var inBlob = 0;
        for (var j = 0; j < blobs.length; j++) {
          var dx = x - blobs[j].x, dy = y - blobs[j].y, d = Math.sqrt(dx * dx + dy * dy) / blobs[j].r;
          if (d < 1) inBlob = Math.max(inBlob, 1 - d * d);
        }
        if (!inBlob) continue;
        var i = (y * c.width + x) * 4;
        if (classify(px[i], px[i + 1], px[i + 2]) !== 'plant') continue;
        var t = Math.min(1, inBlob * 1.6);
        var target = kind === 'brown' ? [120, 72, 28] : [222, 190, 40];
        px[i] = px[i] + (target[0] - px[i]) * t;
        px[i + 1] = px[i + 1] + (target[1] - px[i + 1]) * t;
        px[i + 2] = px[i + 2] + (target[2] - px[i + 2]) * t;
      }
    }
    ctx.putImageData(data, 0, 0);
    return c;
  }

  // Demo photos for when no real harvest photos are at hand: MEOD's own product shots,
  // plus copies with yellowing or brown spots painted on (clearly labelled as simulated).
  function demoSamples(category) {
    var src = category === 'lettuces' ? 'assets/img/veg-mesclun.webp'
      : category === 'herbs' ? 'assets/img/veg-tuscan-kale.webp'
      : category === 'asian-greens' ? 'assets/img/veg-xiao-bai-cai.webp' : 'assets/img/veg-tuscan-kale.webp';
    var second = src.indexOf('kale') > -1 ? 'assets/img/veg-xiao-bai-cai.webp' : 'assets/img/veg-tuscan-kale.webp';
    return Promise.all([loadImage(src), loadImage(second)]).then(function (imgs) {
      return [
        { label: 'Fresh bunch', simulated: false, source: imgs[0] },
        { label: 'Fresh bunch', simulated: false, source: imgs[1] },
        { label: 'Some yellowing (simulated)', simulated: true, source: blemish(imgs[0], 'yellow', 4, 7) },
        { label: 'Brown spots (simulated)', simulated: true, source: blemish(imgs[0], 'brown', 9, 21) }
      ];
    });
  }

  // Grading reads leaf colour, so it only applies to leafy produce.
  function canGrade(product) { return Boolean(product) && ['asian-greens', 'lettuces', 'herbs'].indexOf(product.category) > -1; }

  M.grade = { RULES: RULES, GRADES: GRADES, analyze: analyze, split: split, loadImage: loadImage, demoSamples: demoSamples, canGrade: canGrade };
})();
