// SHINOBI ARENA service worker: offline play + installability (PWA).
// Cache-first for all same-origin GETs; versioned cache, old ones purged.
const CACHE = 'shinobi-arena-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(['./', 'index.html', 'manifest.webmanifest']))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // only cache same-origin app assets (never socket.io / api calls)
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/socket.io') || url.pathname.includes('/api/')) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: false }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && (res.status === 200 || res.status === 0)) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('index.html'));
    })
  );
});
