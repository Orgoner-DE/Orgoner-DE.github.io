/* Malwort shell cache. Generated at build time. */
const CACHE = "malwort-d16830c2621d";
const ASSETS = ["./assets/draw-CKNLl6K-.js","./assets/home-iCFPlzhW.js","./assets/index-BTkud6Gb.css","./assets/index-tA5WdjRF.js","./assets/numbers-CkRuFgLu.js","./assets/speech-oOOcT6OJ.js","./assets/words-BHUf-IbK.js","./assets/words-TW9LrmSX.js","./icons/icon.svg","./index.html","./manifest.webmanifest"];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('malwort-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const scopePath = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(scopePath)) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('./index.html')));
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});
