// Flamingo County — service worker.
//
// Bump CACHE on any deploy that changes a .dc.html page or a runtime .js file.
// `activate` deletes every cache whose name differs, so the bump is the whole
// invalidation story.
//
// The routing below deliberately mirrors netlify.toml rather than inventing its own
// policy: the pages and the runtime (support.js, fc-data.js, …) version as a matched
// unit and carry `max-age=0, must-revalidate`, so they are network-first here too —
// serving a cached .dc.html against a newer fc-data.js gives a page the runtime cannot
// compile. /assets, /mascots, /uploads and /vendor carry a one-year max-age, so they
// are cache-first.
const CACHE = 'fc-v1';

// Kept tiny on purpose: this is an installability + offline-fallback worker, not an
// offline-browsing one. Everything else is cached as it is visited.
const PRECACHE = [
  '/offline.html',
  '/uploads/fc-icon-192.png',
  '/uploads/fc-icon-512.png',
];

// support.js loads React, ReactDOM and Babel from unpkg at runtime — without them the
// .dc.html templates never compile and a cached page renders blank. The URLs are
// version-pinned and requested with crossOrigin="anonymous", so the responses are
// non-opaque and safe to replay under their SRI hashes.
const CDN_HOSTS = ['unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

// Cache-first prefixes — same paths netlify.toml gives max-age=31536000.
const IMMUTABLE_PATHS = ['/assets/', '/mascots/', '/uploads/', '/vendor/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      // One missing precache entry must not abort the install — without an active
      // worker Chrome will not offer to install the app at all.
      .catch((err) => console.warn('[sw] precache failed:', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
      )
      .then(() => self.clients.claim())
  );
});

function isImmutable(url) {
  return IMMUTABLE_PATHS.some((p) => url.pathname.startsWith(p));
}

// The pages and the runtime that compiles them. Only root-level .js — anything under
// /vendor/ is version-pinned and handled as immutable above.
function isAppShell(url) {
  return (
    url.pathname.endsWith('.dc.html') ||
    url.pathname === '/manifest.json' ||
    /^\/[^/]+\.js$/.test(url.pathname)
  );
}

function cacheable(response) {
  return response && response.status === 200 && response.type !== 'opaque';
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (cacheable(response)) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const offline = await caches.match('/offline.html');
      if (offline) return offline;
    }
    throw err;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (cacheable(response)) {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copy));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Netlify Forms: FCBase.netlifySubmit() POSTs urlencoded data to "/". Touching a
  // non-GET request here breaks both forms silently, in production, for installed
  // users only. Never remove this.
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return;
  }

  // chrome-extension:, data:, blob: — not ours to serve.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (url.origin !== self.location.origin) {
    if (CDN_HOSTS.includes(url.hostname)) {
      event.respondWith(cacheFirst(request));
    }
    // Any other cross-origin request passes straight through, uncached.
    return;
  }

  if (isImmutable(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Navigations, <dc-import> fetches of Nav/Footer, and the runtime scripts.
  if (request.mode === 'navigate' || isAppShell(url)) {
    event.respondWith(networkFirst(request));
  }
});
