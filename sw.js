/* Offline shell. Cache-first: once installed the app makes no network
   requests at all, which is the point — it gets opened on Lantau. */

// Bump this whenever app code changes — a cache-first worker keeps serving
// the installed copy until the version (and therefore this file) changes.
// data/plan.json is the exception: it revalidates on its own, so plan edits
// need no bump.
const VERSION = 'lantau-v4';
const SHELL = [
  './',
  'index.html',
  'manifest.json',
  'css/app.css',
  'data/plan.json',
  'js/app.js',
  'js/dates.js',
  'js/dom.js',
  'js/fields.js',
  'js/md.js',
  'js/model.js',
  'js/store.js',
  'js/sync.js',
  'js/theme.js',
  'js/views/week.js',
  'js/views/fullplan.js',
  'js/views/vertical.js',
  'js/views/races.js',
  'js/views/reference.js',
  'js/views/settings.js',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // cache: 'reload' so an install always fetches from the network rather than
    // the browser's HTTP cache, which would otherwise freeze in a stale copy.
    // Individually, so one missing optional asset cannot fail the whole install.
    await Promise.all(SHELL.map(url =>
      cache.add(new Request(url, { cache: 'reload' })).catch(err => console.warn('skip', url, err))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // never touch api.github.com

  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });

    // plan.json is the one file the owner edits on GitHub, so it revalidates in
    // the background: the cached copy is served instantly (offline included),
    // and a newer one is picked up on the next launch. Everything else is
    // strictly cache-first — no network at all once installed.
    if (cached && url.pathname.endsWith('/data/plan.json')) {
      if (navigator.onLine) {
        event.waitUntil((async () => {
          try {
            const fresh = await fetch(req, { cache: 'no-cache' });
            if (fresh && fresh.ok) (await caches.open(VERSION)).put(req, fresh.clone());
          } catch { /* offline: keep what we have */ }
        })());
      }
      return cached;
    }

    if (cached) return cached;

    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') {
        const cache = await caches.open(VERSION);
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      if (req.mode === 'navigate') {
        const shell = await caches.match('index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
