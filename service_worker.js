// TC Checklist service worker (v2).
// v1 served the page from its cache forever, so some devices never saw new versions. v2 always asks the server first
// and only falls back to the saved copy when offline. It deletes every older cache when it takes over.
const CACHE_NAME = 'tchb-checklist-cache-v2';
const SHELL = ['./', './index.html', './manifest.json', './logo-light.png', './logo-dark.png', './logo-mark.png'];

self.addEventListener('install', event => {
  self.skipWaiting();
  // Each file is cached on its own, so one missing file can never stop the update from installing.
  event.waitUntil(caches.open(CACHE_NAME).then(cache => Promise.all(SHELL.map(url => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})))));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Network first for this site's own files; everything else (Firebase, fonts, the team API) goes straight to the network.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.searchParams.has('clock')) return;
  event.respondWith(
    // (a navigation request can't be re-made with options, so the page is fetched by its address)
    (req.mode === 'navigate' ? fetch(req.url, { cache: 'no-store', credentials: 'same-origin' }) : fetch(req, { cache: 'no-cache' })).then(res => {
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req.mode === 'navigate' ? './index.html' : req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req.mode === 'navigate' ? './index.html' : req).then(hit => hit || caches.match(req)).then(hit => hit || Response.error()))
  );
});
