// Phone / browser build: keep the app working offline. Network first so updates show up, cache when offline.
const CACHE = 'lumina-v2';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'logic.js', 'logo.svg', 'icon.png', 'manifest.webmanifest',
  'fonts/nunito-400.woff2', 'fonts/nunito-600.woff2', 'fonts/nunito-700.woff2', 'fonts/fraunces-600.woff2'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
// Tapping a notification opens Lumina.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(ws => ws[0]?.focus() ?? self.clients.openWindow('./')));
});
