/* Offline shell. Network first (always fresh when the server is up), cache fallback when offline.
   Works at "/" and at a sub-path (GitHub Pages: /mobilegis/). Never caches /api/ (accounts, writes) or OSM tiles. */
const CACHE = 'mobilegis-ui8';
const SCOPE = new URL(self.registration.scope).pathname;
const rel = path => SCOPE + path.replace(/^\//, '');
const CORE = ["/", "/index.html", "/login.html", "/admin.html", "/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/viewer-policy.js", "/vendor/leaflet.js", "/vendor/leaflet.css", "/js/admin.js", "/js/auth-page.js", "/js/core/api.js", "/js/core/data.js", "/js/core/dom.js", "/js/core/format.js", "/js/core/geo.js", "/js/core/sample.js", "/js/core/insight.js", "/js/core/motion.js", "/js/core/perf.js", "/js/core/store.js", "/js/main.js", "/js/ui/account.js", "/js/ui/charts.js", "/js/ui/seg.js", "/js/ui/toast.js", "/js/views/about.js", "/js/views/experts.js", "/js/views/field-test.js", "/js/views/map-detail.js", "/js/views/map-dock.js", "/js/views/map-engine.js", "/js/views/map-export.js", "/js/views/map-locator.js", "/js/views/map.js", "/js/views/scenario.js", "/js/views/stats.js", "/js/views/table.js", "/styles/auth.css", "/styles/base.css", "/styles/charts.css", "/styles/map.css", "/styles/views.css", "/fonts/bricolage-latin-ext.woff2", "/fonts/bricolage-latin.woff2", "/fonts/bricolage-vietnamese.woff2", "/fonts/fonts.css", "/fonts/jetbrains-mono-latin-ext.woff2", "/fonts/jetbrains-mono-latin.woff2", "/fonts/jetbrains-mono-vietnamese.woff2", "/data/hcm_167.geojson", "/data/locator.json", "/data/world_land.json", "/data/boundary_source.json", "/data/gee_recovery/products.json", "/data/gee/products.json", "/data/visual_products.json", "/data/gee/landcover_stats.json", "/data/landcover_stats.json", "/data/gee_recovery/observations.json", "/data/observations_user.json"].map(rel);
const RUNTIME = ['data/tiles/', 'data/query/', 'data/rasters/', 'data/evidence/', 'data/gee/', 'data/gee_recovery/', 'data/observations_real.json'].map(rel);
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('mobilegis-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith(rel('api/'))) return;
  const wanted = CORE.includes(url.pathname) || RUNTIME.some(prefix => url.pathname.startsWith(prefix));
  if (!wanted) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'no-cache' revalidates with the server (ETag) instead of reusing the browser's HTTP cache, so a new deploy shows up at once.
    try { const response = await fetch(event.request.url, {cache: 'no-cache', credentials: 'same-origin'}); if (response.ok) await cache.put(event.request, response.clone()); return response; }
    catch { return (await cache.match(event.request, {ignoreSearch: true})) || new Response('Chưa có dữ liệu này trong bộ nhớ đệm.', {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}}); }
  })());
});
