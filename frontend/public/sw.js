const CACHE = 'terrawatch-shell-v5';
const SHELL = ['/', '/manifest.webmanifest', '/terrawatch-icon.svg', '/terrawatch-icon-192.png', '/terrawatch-icon-512.png'];

function isPrivateOrApi(url) {
  return url.origin === self.location.origin && (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/app') ||
    url.pathname.startsWith('/staff') ||
    url.pathname.startsWith('/login') ||
    url.pathname.startsWith('/incidents') ||
    url.pathname.startsWith('/ranger') ||
    url.pathname.startsWith('/citizen') ||
    url.pathname.startsWith('/citizen/report') ||
    url.pathname.startsWith('/citizen/reports') ||
    url.pathname.startsWith('/redesign/field') ||
    url.pathname.startsWith('/redesign/simulation') ||
    url.pathname.startsWith('/redesign/incident')
  );
}

function isCacheablePublicAsset(request) {
  const url = new URL(request.url);
  return url.origin === self.location.origin && !isPrivateOrApi(url) && (
    request.mode === 'navigate' ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/terrawatch-icon.svg' ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/simulation/')
  );
}

function isSafePublicResponse(response) {
  if (!response.ok || response.redirected) return false;
  try {
    return !isPrivateOrApi(new URL(response.url));
  } catch {
    return false;
  }
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE && (key.startsWith('resq-shell-') || key.startsWith('terrawatch-shell-'))).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (isPrivateOrApi(url)) return;
  if (!isCacheablePublicAsset(event.request)) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (isSafePublicResponse(response) && isCacheablePublicAsset(event.request)) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === 'navigate' ? caches.match('/') : Response.error())))
  );
});
