const CACHE_NAME = 'mm-tracker-v16';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/vendor/supabase.js',
  './js/supabase-config.js',
  './js/supabase-client.js',
  './js/db.js',
  './js/app.js',
  './js/auth.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // {cache: 'reload'} bypasses the browser's own HTTP cache, otherwise
      // a stale heuristically-cached response (Python's http.server sends no
      // explicit Cache-Control headers) can get locked into the SW cache.
      Promise.all(APP_SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' }))))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin GET requests for the app shell.
  // Everything else (Supabase API calls, other origins) goes straight to the network.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Network-first: always prefer a fresh response so app updates show up
  // immediately; only fall back to the cache when offline. cache:'no-store'
  // is essential here — plain fetch() still honors the browser's ordinary
  // HTTP cache/heuristic freshness, which defeats "network-first" silently.
  event.respondWith(
    fetch(req, { cache: 'no-store' })
      .then((res) => {
        if (res && res.ok) {
          caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone()));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
