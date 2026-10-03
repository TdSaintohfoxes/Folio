/**
 * Folio — Service Worker (app-shell cache)
 */

const CACHE = 'folio-v1';
const SHELL = [
  './',
  './index.html',
  './css/tokens.css',
  './css/themes.css',
  './css/components.css',
  './js/app.js',
  './js/db.js',
  './js/router.js',
  './js/readers/pdf.js',
  './js/readers/epub.js',
  './js/readers/docx.js',
  './js/readers/comic.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only same-origin GET
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // Network-first for navigations, cache-first for assets
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        // Cache CDN responses optionally (opaque)
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
