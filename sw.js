/* Tyllage Portal service worker: lets the portal open with no signal (e.g. inside a greenhouse).
 *
 * - The app's own files are fetched from the network first, so updates show up straight
 *   away, and fall back to the copy saved here when there's no signal. A request that takes
 *   longer than 4 seconds (a weak signal) also falls back to the saved copy.
 * - Google Fonts are kept once fetched.
 * - Weather (data.gov.sg) isn't cached here: the portal keeps its own labelled copy of the
 *   last forecast. Inspection data lives in the browser's storage, not in this cache.
 * Bump VERSION when the list of files below changes. */
var VERSION = 'tyllage-v1';
var SHELL = [
  'portal.html', 'dashboard.html', 'manifest.webmanifest',
  'css/style.css', 'css/portal.css',
  'js/data.js', 'js/assist.js', 'js/auth.js', 'js/login.js', 'js/grade.js', 'js/recipes.js', 'js/content.js', 'js/replies.js', 'js/portal.js', 'js/pwa.js',
  'assets/tyllage-logo-white.png',
  'assets/img/favicon.png', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png',
  // Demo photos used by the inspection's "No plants nearby?" buttons.
  'assets/img/veg-mesclun.webp', 'assets/img/veg-tuscan-kale.webp', 'assets/img/veg-xiao-bai-cai.webp'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    // One missing file shouldn't stop the rest from being saved.
    return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () { /* skip */ }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function networkFirst(req) {
  return caches.open(VERSION).then(function (cache) {
    var network = fetch(req).then(function (res) {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    });
    var slow = new Promise(function (resolve) { setTimeout(resolve, 4000); }).then(function () {
      return cache.match(req, { ignoreSearch: true }).then(function (hit) { return hit || network; });
    });
    return Promise.race([network, slow]).catch(function () {
      return cache.match(req, { ignoreSearch: true }).then(function (hit) {
        return hit || (req.mode === 'navigate' ? cache.match('dashboard.html') : Response.error());
      });
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin === self.location.origin) { e.respondWith(networkFirst(req)); return; }
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(VERSION).then(function (c) {
      return c.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) { c.put(req, res.clone()); return res; });
      });
    }));
  }
  // Everything else (data.gov.sg, cdnjs) goes straight to the network.
});
