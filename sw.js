// Minimal service worker — just enough for "Add to Home Screen" installability.
// No offline caching (the app is a single Supabase-backed page; caching stale
// data could confuse users), just a pass-through fetch handler.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
