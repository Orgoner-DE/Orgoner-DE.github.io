/* BAP-50 Service Worker 1.0.0
   Seite und Code: network-first (offline -> Cache). Samples und Icons: cache-first. */
const VERSION = '1.0.0';
const CACHE = 'bap50-v' + VERSION;
const SHELL = [
  './', './index.html', './app.css', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png',
  './js/app.js', './js/util.js', './js/controls.js', './js/catalog.js', './js/engine.js', './js/seq.js', './js/state.js', './js/render.js',
  './samples/samples.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => fetch('./samples/samples.json'))
      .then((r) => r.json())
      .then((doc) => caches.open(CACHE).then((c) => c.addAll(doc.samples.map((s) => './' + s.file))))
      .catch(() => { /* Samples werden sonst beim ersten Laden gecacht */ })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bap50-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const isStatic = /\/samples\/.+\.wav$/.test(url.pathname) || /\.(png|svg)$/.test(url.pathname);
  if (isStatic) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
  );
});
