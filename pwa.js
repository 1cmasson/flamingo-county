// Flamingo County — homescreen install (PWA).
//
// Registers the service worker and shows the install affordance: Chrome's deferred
// prompt on Android, a "Share -> Add to Home Screen" hint on iOS (which has no
// beforeinstallprompt at all).
//
// Loaded from each page's real <head>, not from <helmet>: Chrome reads
// <link rel="manifest"> off the parsed document to decide installability, and helmet
// tags only land in <head> after the runtime boots. The static head also keeps this
// file out of the double-execution path described in the README — the guard below is
// belt-and-braces.
(function () {
  if (window.__fcPwa) return;
  window.__fcPwa = true;

  var HINT_KEY = 'pwaHint';

  // Kept local rather than added to the ES dictionary in fc-data.js, so a Claude Design
  // re-sync has one less hunk to re-apply.
  var COPY = {
    en: {
      install: 'Install',
      later: 'Later',
      android: 'Add Flamingo County to your homescreen.',
      ios: 'Add to Home Screen:',
      iosHow: 'tap Share, then Add to Home Screen.',
    },
    es: {
      install: 'Instalar',
      later: 'Ahora no',
      android: 'Agrega Flamingo County a tu pantalla de inicio.',
      ios: 'Agregar a Inicio:',
      iosHow: 'toca Compartir y luego Agregar a inicio.',
    },
  };

  // ---- service worker -----------------------------------------------------------
  // Does not depend on FCBase, so it never waits on it.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function (err) {
        console.warn('[pwa] service worker registration failed:', err);
      });
    });
  }

  // ---- install affordance -------------------------------------------------------
  var deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (ready) showAndroid();
  });

  function standalone() {
    return (
      navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    );
  }

  function isIOS() {
    var ua = navigator.userAgent || '';
    // iPadOS 13+ reports as MacIntel, so the classic /iPad|iPhone|iPod/ test misses it.
    return (
      /iP(hone|ad|od)/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
  }

  var ready = false;
  var B = null;
  var t = COPY.en;

  function bar() {
    var el = document.createElement('div');
    el.setAttribute('data-fc-pwa', '');
    el.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:9999;' +
      'display:flex;align-items:center;gap:12px;flex-wrap:wrap;' +
      'padding:12px 16px;background:#0C0F14;color:#FFF6E5;' +
      'border-top:5px solid #16E0F2;font-family:Archivo,system-ui,sans-serif;' +
      'font-size:14px;line-height:1.35;box-shadow:0 -8px 24px rgba(0,0,0,.28)';
    return el;
  }

  function button(label, bg, fg) {
    var b = document.createElement('button');
    b.textContent = label;
    b.style.cssText =
      'flex:0 0 auto;border:0;border-radius:999px;padding:9px 18px;cursor:pointer;' +
      'font-family:inherit;font-size:14px;font-weight:800;background:' +
      bg +
      ';color:' +
      fg;
    return b;
  }

  function dismiss(el) {
    el.remove();
    if (B) B.lsSet(HINT_KEY, true);
  }

  function showAndroid() {
    if (document.querySelector('[data-fc-pwa]')) return;
    var el = bar();
    var text = document.createElement('span');
    text.style.cssText = 'flex:1 1 200px';
    text.textContent = t.android;
    var yes = button(t.install, '#FFD400', '#0C0F14');
    var no = button(t.later, 'transparent', '#FFF6E5');
    no.style.border = '2px solid #FFF6E5';
    yes.addEventListener('click', function () {
      el.remove();
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () {
        deferredPrompt = null;
      });
    });
    no.addEventListener('click', function () {
      dismiss(el);
    });
    el.appendChild(text);
    el.appendChild(yes);
    el.appendChild(no);
    document.body.appendChild(el);
  }

  function showIOS() {
    if (document.querySelector('[data-fc-pwa]')) return;
    var el = bar();
    var text = document.createElement('span');
    text.style.cssText = 'flex:1 1 200px';
    var strong = document.createElement('strong');
    strong.textContent = t.ios + ' ';
    text.appendChild(strong);
    text.appendChild(document.createTextNode(t.iosHow));
    var ok = button('OK', '#FFD400', '#0C0F14');
    ok.addEventListener('click', function () {
      dismiss(el);
    });
    el.appendChild(text);
    el.appendChild(ok);
    document.body.appendChild(el);
  }

  function init() {
    B = window.FCBase || null;
    if (B) {
      t = COPY[B.resolveLang()] || COPY.en;
      if (B.lsGet(HINT_KEY, false)) return; // dismissed before
    }
    ready = true;
    if (standalone()) return; // already installed
    if (deferredPrompt) showAndroid();
    else if (isIOS()) showIOS();
  }

  // fc-data.js dispatches 'fc-base' synchronously at the end of its IIFE, during body
  // parse — this file is deferred and so always runs after that. Listening alone would
  // never fire; checking alone would break if the load order ever changed.
  function start() {
    if (window.FCBase) init();
    else window.addEventListener('fc-base', init, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
