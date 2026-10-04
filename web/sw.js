// Cache-first service worker so the app (and the downloaded body-tracking model) load fast and offline.
const CACHE = 'airguitar-v7';
const SHELL = [
  './', 'index.html', 'privacy.html', 'style.css', 'manifest.webmanifest',
  'js/main.js', 'js/version.js', 'js/purchases.js', 'js/looks.js', 'js/body.js', 'js/sounds.js',
  'js/instruments/guitar.js', 'js/instruments/drums.js', 'js/instruments/trombone.js',
  'js/instruments/piano.js', 'js/instruments/sax.js', 'js/instruments/stroke.js', 'js/audio.js', 'js/chords.js', 'js/render.js', 'js/tracker.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const sameOrigin = url.origin === location.origin;
  const tracker = /cdn\.jsdelivr\.net|storage\.googleapis\.com/.test(url.host);
  if (!sameOrigin && !tracker) return;
  e.respondWith(
    // App files: network first so updates show up; the tracker runtime/model are big and versioned: cache first.
    (sameOrigin && !url.pathname.includes('/vendor/') ? fetch(e.request).then((r) => put(e.request, r)).catch(() => caches.match(e.request))
      : caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => put(e.request, r))))
  );
});

function put(req, res) {
  if (res && res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
}
