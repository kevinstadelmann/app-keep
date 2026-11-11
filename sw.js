// Bump this version whenever a bundled file changes. Updates activate after
// all Keep windows close, so an open app never mixes different releases.
const CACHE = 'keep-shell-v3';
const ASSETS = ['./', './index.html', './style.css', './app.js', './pwa.js',
  './manifest.webmanifest', './icons/keep-192.png', './icons/keep-512.png',
  './icons/keep-maskable-512.png'];
const root = new URL('./', self.location.href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('keep-shell-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // The entire app is local, including navigations with query parameters.
    if (event.request.mode === 'navigate') return await cache.match('./index.html') || fetch(event.request);
    return await cache.match(event.request, {ignoreSearch: true}) || fetch(event.request);
  })());
});
