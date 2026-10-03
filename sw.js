const CACHE = 'orgonerbox-v1.1.0';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

function isMalwort(url) {
  return url.origin === self.location.origin && (url.pathname === '/malwort' || url.pathname.startsWith('/malwort/'));
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(ASSETS.map(url => cache.add(url).catch(() => undefined)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('orgonerbox-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (isMalwort(url)) return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      const res = await fetch(event.request);
      if (res && res.ok && url.origin === self.location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(event.request, copy)).catch(() => undefined);
      }
      return res;
    } catch (err) {
      if (event.request.mode === 'navigate') {
        return (await caches.match('./index.html')) || Response.error();
      }
      return Response.error();
    }
  })());
});
