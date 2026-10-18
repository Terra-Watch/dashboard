// The build step (scripts/postbuild.mjs) fills in the build id and the list of files to keep ready for offline use.
const BUILD = /*BUILD*/'dev'/*END*/;
const PRECACHE = /*PRECACHE*/[]/*END*/;
const CACHE = `terrawatch-shell-${BUILD}`;
const MAP_CACHE = 'tw-map-v1';
const MAP_ARCHIVE = '/tiles/resq-basemap.pmtiles';
const SHELL = ['/', '/manifest.webmanifest', '/brand/logo-mark.svg', '/brand/icon-192.png', '/brand/icon-512.png'];

function isPrivateOrApi(url) {
  return url.origin === self.location.origin && (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/app') ||
    url.pathname.startsWith('/staff') ||
    url.pathname.startsWith('/login') ||
    url.pathname.startsWith('/incidents') ||
    url.pathname.startsWith('/ranger') ||
    url.pathname.startsWith('/field') ||
    url.pathname.startsWith('/ops') ||
    url.pathname.startsWith('/register') ||
    url.pathname.startsWith('/forgot') ||
    url.pathname.startsWith('/reset') ||
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
    url.pathname.startsWith('/brand/') ||
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
  // The shell must be there. The rest is kept ready for offline use, but one missing file must not stop the update.
  event.waitUntil(caches.open(CACHE).then(async cache => {
    await cache.addAll(SHELL);
    await Promise.allSettled(PRECACHE.map(url => cache.add(url)));
  }));
});
// A new version waits until the person chooses to reload, so a half-written report is never lost to a silent refresh.
self.addEventListener('message', event => { if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE && key !== MAP_CACHE && (key.startsWith('resq-shell-') || key.startsWith('terrawatch-shell-'))).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});
/** The saved map is one big file read in pieces. Answer range requests from the saved copy when the person chose to keep it on the phone. */
async function serveSavedMap(request) {
  const cache = await caches.open(MAP_CACHE);
  const saved = request.headers.get('X-Tw-Refresh') ? null : await cache.match(MAP_ARCHIVE);
  if (!saved) return fetch(request);
  const blob = await saved.blob();
  const range = request.headers.get('range');
  const match = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (!match) return new Response(blob, { status: 200, headers: { 'Content-Type': 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Content-Length': String(blob.size) } });
  const start = match[1] === '' ? Math.max(0, blob.size - Number(match[2])) : Number(match[1]);
  const end = match[1] === '' || match[2] === '' ? blob.size - 1 : Math.min(Number(match[2]), blob.size - 1);
  if (!(start <= end) || start >= blob.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${blob.size}` } });
  return new Response(blob.slice(start, end + 1), { status: 206, headers: { 'Content-Type': 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${blob.size}`, 'Content-Length': String(end - start + 1) } });
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname === MAP_ARCHIVE) { event.respondWith(serveSavedMap(event.request)); return; }
  if (url.origin === self.location.origin && url.pathname.startsWith('/map/')) {
    event.respondWith(caches.open(MAP_CACHE).then(cache => cache.match(event.request).then(hit => hit || fetch(event.request).then(response => { if (response.ok) cache.put(event.request, response.clone()); return response; }))));
    return;
  }
  // Private screens are never stored, but when the phone is offline they still open: the app shell is the same page for every route.
  if (isPrivateOrApi(url) && event.request.mode === 'navigate' && !url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request).catch(() => caches.match('/').then(shell => shell || Response.error())));
    return;
  }
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
