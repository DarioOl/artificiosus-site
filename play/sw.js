// Cache hors ligne. Réseau d'abord (on reçoit toujours la dernière version), le cache sert quand il n'y a pas de réseau.
const CACHE = 'artificiosus-v64';
const FILES = [
  './', 'index.html', 'style.css', 'native.js', 'i18n.js', 'rules.js', 'meta.js', 'audio.js', 'bg.js', 'game.js',
  'manifest.webmanifest', 'fonts/Jersey10.ttf', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))),
  );
});
