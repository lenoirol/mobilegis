/* Offline shell. Network first (always fresh when the server is up), cache fallback when offline.
   Works at "/" and at a sub-path (GitHub Pages: /mobilegis/). Never caches /api/ (accounts, writes) or OSM tiles. */
const CACHE = 'mobilegis-v31';
const SCOPE = new URL(self.registration.scope).pathname;
const rel = path => SCOPE + path.replace(/^\//, '');
const CORE = ["/", "/index.html", "/login.html", "/admin.html", "/manifest.webmanifest", "/icon.svg", "/logo.svg", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/viewer-policy.js", "/js/admin-import.js", "/js/admin.js", "/js/app.js", "/js/core/api.js", "/js/core/data.js", "/js/core/dom.js", "/js/core/format.js", "/js/core/geo.js", "/js/core/insight.js", "/js/core/motion.js", "/js/core/perf.js", "/js/core/sample.js", "/js/core/store.js", "/js/core/track.js", "/js/map/compare.js", "/js/map/engine.js", "/js/map/export.js", "/js/map/panel.js", "/js/map/search.js", "/js/map/share.js", "/js/map/tour.js", "/js/map/widgets.js", "/js/ui/charts.js", "/js/ui/seg.js", "/js/ui/toast.js", "/js/views/about.js", "/js/views/account.js", "/js/views/field-test.js", "/js/views/stats.js", "/js/views/table.js", "/styles/app.css", "/styles/auth.css", "/styles/base.css", "/styles/charts.css", "/styles/views.css", "/vendor/maplibre/maplibre-gl-worker.mjs", "/vendor/maplibre/maplibre-gl.css", "/vendor/maplibre/maplibre-gl.mjs", "/data/hcm_167.geojson", "/data/world_land.json", "/data/gee_recovery/products.json", "/data/gee_recovery/observations.json", "/data/gee/landcover_stats.json"].map(rel);
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
