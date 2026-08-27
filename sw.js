const CACHE_NAME = 'field-notes-shell-v15';
const SHELL_FILES = [
  './nature-dashboard.html',
  './trees-map.html',
  './sightings-map.html',
  './perspective.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './trees-data.txt',
  './trees-lookup.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never cache live data calls — weather, greenspace, species, moon/geo lookups
  // always need fresh network data, not a stale cached response. Must cover
  // every Overpass mirror (see OVERPASS_MIRRORS in nature-dashboard.html) --
  // missing one means its POST requests fall into the cache-first branch below,
  // where cache.put() throws on a non-GET request and silently breaks that
  // mirror's fallback.
  const isLiveData = [
    'api.open-meteo.com',
    'overpass-api.de',
    'overpass.kumi.systems',
    'overpass.openstreetmap.fr',
    'overpass.openstreetmap.ru',
    'api.inaturalist.org',
    'api.sunrisesunset.io',
    'ipwho.is',
    'api.bigdatacloud.net'
  ].some(host => url.hostname.includes(host)) || url.pathname.endsWith('activities.csv');

  if (isLiveData) {
    event.respondWith(fetch(event.request));
    return;
  }

  // App shell: cache-first, so the icon/page still opens offline
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(resp => {
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, resp.clone());
          return resp;
        });
      });
    })
  );
});
