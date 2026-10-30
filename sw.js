// Bump V on every deploy: the new worker installs alongside the old one and the
// page offers a reload. Each version serves only its own cache, so files never mix.
const V = 'imt-v29';
const FILES = ['./', 'index.html', 'style.css', 'game.js', 'sync.js', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png', 'assets/ui/frame.png', 'assets/ui/divider.png', 'assets/monsters/sheet.png', 'assets/monsters/sheet.js'];

self.addEventListener('install', e => {
  // cache: 'reload' skips the HTTP cache so a new version gets fresh files
  e.waitUntil(caches.open(V).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// cache-first; network only for misses; offline navigation falls back to the shell
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(V).then(c => c.match(req, { ignoreSearch: true })).then(hit =>
      hit || fetch(req).catch(() => req.mode === 'navigate' ? caches.match('index.html') : Response.error()))
  );
});
