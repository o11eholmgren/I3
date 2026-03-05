const CACHE_NAME = 'cryptopulse-v99';
const IS_LOCAL = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // På localhost — hämta alltid från nätverket, ingen cache
  if (IS_LOCAL) {
    event.respondWith(fetch(event.request).catch(() => new Response('')));
    return;
  }
  // På Netlify — network first
  event.respondWith(fetch(event.request).catch(() => new Response('')));
});