/* Installable app (PWA): registers the service worker so the portal opens with no signal,
 * and offers "Install app" where the browser supports it (Android Chrome, desktop Chrome
 * and Edge). On iPhone, Safari installs from Share → Add to Home Screen instead. */
(function () {
  'use strict';
  var deferred = null;
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* the app still works online */ }); });
  }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; });
  window.addEventListener('appinstalled', function () { deferred = null; });
  window.MEOD_PWA = {
    canInstall: function () { return Boolean(deferred); },
    installed: function () { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; },
    isIOS: function () { return /iphone|ipad|ipod/i.test(navigator.userAgent); },
    install: function () {
      if (!deferred) return Promise.resolve(false);
      var p = deferred;
      deferred = null;
      p.prompt();
      return p.userChoice.then(function (c) { return c.outcome === 'accepted'; });
    }
  };
})();
