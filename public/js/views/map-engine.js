/* Leaflet engine for the map view. No DOM chrome here: it draws layers and reports clicks.
   Presentation rules (viewer-policy.js): zones below 50 % coverage are grey + dashed; empty is never 0. */
import {h} from '../core/dom.js';
import {INDEX, colorOf, valid, fmt, pct, shortName} from '../core/format.js';
import {url, get} from '../core/api.js';

const L = window.L;
const policy = window.ViewerPolicy;
const COVERAGE_RAMP = ['#ecbca3', '#f4d373', '#0d8165'];
const CHANGE_RAMP = ['#2171b5', '#f7f7f7', '#c53a32'];
const lerpHex = (a, b, t) => '#' + [1, 3, 5].map(p => Math.round(parseInt(a.slice(p, p + 2), 16) + (parseInt(b.slice(p, p + 2), 16) - parseInt(a.slice(p, p + 2), 16)) * t).toString(16).padStart(2, '0')).join('');
export const coverageColor = v => !valid(v) ? '#c9c4b0' : v < .5 ? lerpHex(COVERAGE_RAMP[0], COVERAGE_RAMP[1], v / .5) : lerpHex(COVERAGE_RAMP[1], COVERAGE_RAMP[2], (v - .5) / .5);
export const COVERAGE_GRADIENT = `linear-gradient(90deg,${COVERAGE_RAMP.join(',')})`;
export const CHANGE_GRADIENT = `linear-gradient(90deg,${CHANGE_RAMP.join(',')})`;

const tile = (meta, options = {}) => L.tileLayer(url(meta.url) + '?style=pg3', {bounds: meta.bounds, minNativeZoom: meta.min_zoom, maxNativeZoom: meta.max_native_zoom, maxZoom: 18, noWrap: true, ...options});

/* Global basemaps. All are built from OpenStreetMap data or plain imagery and draw no 'nine-dash line'
   (Google, Bing and China-worldview styles are deliberately not used). The app adds its own Vietnamese sea labels on top. */
export const BASEMAPS = {
  voyager: {url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    options: {maxZoom: 19, subdomains: 'abcd', attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © <a href="https://carto.com/attributions">CARTO</a>'}},
  streets: {url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}},
  satellite: {url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options: {maxZoom: 19, maxNativeZoom: 18, attribution: 'Ảnh: Esri, Maxar, Earthstar Geographics'}},
};
const SEA_LABELS = [
  {lat: 16.5, lng: 112.0, text: 'QĐ. Hoàng Sa (Việt Nam)', cls: 'isl'},
  {lat: 10.0, lng: 114.2, text: 'QĐ. Trường Sa (Việt Nam)', cls: 'isl'},
  {lat: 13.6, lng: 113.2, text: 'Biển Đông', cls: 'sea'},
];

export function createEngine(container, handlers) {
  const map = L.map(container, {zoomControl: false, preferCanvas: true, zoomSnap: .25, zoomDelta: .5, wheelPxPerZoomLevel: 90, minZoom: 2, maxZoom: 18, worldCopyJump: true}).setView([10.85, 106.9], 9);
  for (const [name, z] of [['context', 250], ['indices', 350], ['comparison', 355], ['labels', 450], ['probe', 470]]) map.createPane(name).style.zIndex = z;
  map.attributionControl.setPrefix(false).addAttribution('Landsat: USGS · Ranh giới: VPDB · © MobileGIS');
  L.control.scale({imperial: false, position: 'bottomleft'}).addTo(map);
  // Vietnamese names for the sea and the two archipelagos, shown from world view down to regional view.
  const seaLabels = L.layerGroup(SEA_LABELS.map(l => L.marker([l.lat, l.lng], {pane: 'labels', interactive: false, keyboard: false,
    icon: L.divIcon({className: 'mg-sea-label ' + l.cls, html: (l.cls === 'isl' ? '<i></i>' : '') + '<span>' + l.text + '</span>', iconSize: null})})));
  const syncSea = () => { const on = map.getZoom() <= 9.5; if (on && !map.hasLayer(seaLabels)) seaLabels.addTo(map); if (!on && map.hasLayer(seaLabels)) seaLabels.remove(); };
  map.on('zoomend', syncSea); syncSea();

  let ctx = null;           // {geo, rows (indexRows), layers, cover, state}
  const layers = {zones: null, base: null, raster: null, other: null, labels: null, points: null, probe: null, gps: null};
  let insets = {top: 24, right: 24, bottom: 24, left: 24};
  let lastTileKey = '', lastBase = '', selectedLayer = null;

  // ---- loading indicator ------------------------------------------------------------
  const watch = layer => {
    layer.on('loading', () => handlers.loading?.(true)).on('load', () => handlers.loading?.(false))
      .on('tileerror', () => handlers.loading?.(false, 'Một số mảnh bản đồ chưa tải được. Kiểm tra máy chủ hoặc bộ nhớ đệm.'));
    return layer;
  };

  // ---- zones ------------------------------------------------------------------------
  function rowOf(code) { return ctx?.rows?.get(code, ctx.state.year); }
  function zoneStyle(feature) {
    const s = ctx.state, row = rowOf(feature.id), selected = feature.id === s.selected;
    const fillMode = s.mode === 'real' && s.visible && !s.landcover && (s.display === 'zones' || s.display === 'coverage');
    let fillColor = '#c9c4b0', dashArray = null;
    if (s.display === 'coverage') fillColor = coverageColor(row?.[s.index + '_coverage']);
    else if (policy.eligible(row, s.index)) fillColor = colorOf(row[s.index], s.index);
    else if (fillMode) dashArray = '4 4';
    return {color: selected ? '#0e0e0c' : '#4b4a3c', weight: selected ? 3.2 : .8, opacity: s.boundaries ? 1 : 0, fillColor, fillOpacity: fillMode ? s.opacity : 0, dashArray, lineJoin: 'round'};
  }
  function tooltipText(feature) {
    const s = ctx.state, row = rowOf(feature.id), name = feature.properties.full_name;
    if (s.mode !== 'real') return name;
    const value = row?.[s.index], cov = row?.[s.index + '_coverage'];
    const idx = INDEX[s.index];
    return h('span', {class: 'tip'}, h('b', null, name), h('span', {class: 'mono'}, valid(value) ? `${fmt(value, idx.digits)} ${idx.unit}`.trim() : 'thiếu dữ liệu'),
      valid(cov) ? h('small', null, `độ phủ ${pct(cov)}${cov < .5 ? ' · ít mẫu' : ''}`) : null);
  }
  function buildZones() {
    layers.zones?.remove();
    layers.zones = L.geoJSON(ctx.geo, {
      style: zoneStyle,
      onEachFeature: (feature, layer) => {
        layer.on('click', e => { if (ctx.state.mode === 'real') handlers.select?.(feature.id, e.latlng); });   // bubbles to the map too, so a tap also probes the pixel
        layer.bindTooltip(() => tooltipText(feature), {sticky: true, className: 'mg-tip', direction: 'top', offset: [0, -8]});
      },
    }).addTo(map);
    selectedLayer = null;
  }
  function restyleZones() {
    if (!layers.zones) return;
    layers.zones.setStyle(zoneStyle);
    const sel = layers.zones.getLayers().find(l => l.feature.id === ctx.state.selected);
    sel?.bringToFront();
  }

  // ---- raster tiles -------------------------------------------------------------------
  function tileMeta(s) {
    if (s.mode !== 'real' || !s.visible) return null;
    if (s.landcover) return ctx.layers.context?.worldcover || null;
    if (s.display === 'change') return ctx.layers.change?.[s.index] || null;
    if (s.display === 'raster') return ctx.layers.absolute?.[s.year]?.[s.index] || null;
    return null;
  }
  function syncTiles(force) {
    const s = ctx.state, meta = tileMeta(s);
    const compareMeta = s.compare && s.display === 'raster' && !s.landcover && s.mode === 'real' ? ctx.layers.absolute?.[2020]?.[s.index] : null;
    const key = [ctx.source, meta?.url, compareMeta?.url, s.visible].join('|');
    if (key !== lastTileKey || force) {
      lastTileKey = key;
      layers.raster?.remove(); layers.other?.remove(); layers.raster = layers.other = null;
      if (meta) layers.raster = watch(tile(meta, {pane: 'indices', opacity: s.opacity})).addTo(map);
      if (compareMeta) layers.other = watch(tile(compareMeta, {pane: 'comparison', opacity: s.opacity})).addTo(map);
      handlers.loading?.(false);
    }
    layers.raster?.setOpacity(s.opacity); layers.other?.setOpacity(s.opacity);
    applySwipe();
    handlers.tileState?.({meta, compare: !!compareMeta, missing: s.mode === 'real' && s.display !== 'zones' && s.display !== 'coverage' && !s.landcover && s.visible && !meta});
  }
  function applySwipe() {
    const s = ctx.state, on = !!layers.other;
    map.getPane('comparison').style.clipPath = on ? `inset(0 ${100 - s.swipe}% 0 0)` : '';
  }

  // ---- basemap ----------------------------------------------------------------------------
  function syncBase() {
    const s = ctx.state, key = s.basemap + '|' + ctx.source;
    if (key === lastBase) return;
    lastBase = key;
    layers.base?.remove(); layers.base = null;
    container.classList.toggle('has-base', s.basemap !== 'plain');
    const online = BASEMAPS[s.basemap];
    if (online) {
      const base = L.tileLayer(online.url, online.options);
      // Fall back to the plain base only when the provider is unreachable (errors and no tile at all), not on a stray missing tile.
      let loaded = 0, failed = 0;
      base.on('tileload', () => { loaded++; });
      base.on('tileerror', () => { failed++; if (layers.base === base && !loaded && failed >= 4) handlers.baseFailed?.(); });
      layers.base = base.addTo(map);
    } else if (s.basemap === 'plain') {
      // Offline world: Natural Earth land drawn as vectors, so the global view works without Internet.
      const group = L.layerGroup();
      layers.base = group.addTo(map);
      get('/data/world_land.json').then(world => {
        if (layers.base !== group) return;
        L.geoJSON(world, {pane: 'context', interactive: false, style: f => f.properties.kind === 'vn'
          ? {color: '#0e0e0c', weight: 1, fillColor: '#fff3b0', fillOpacity: 1}
          : {color: '#0e0e0c', weight: .8, opacity: .55, fillColor: '#fffdf6', fillOpacity: 1}}).addTo(group);
      }).catch(() => {});
    } else if (s.basemap.startsWith('rgb')) {
      const meta = ctx.layers.context?.[s.basemap];
      if (meta) layers.base = tile(meta, {pane: 'context', attribution: 'Landsat: USGS'}).addTo(map);
    }
  }

  // ---- labels (collision-avoiding) -----------------------------------------------------------
  const measure = document.createElement('canvas').getContext('2d');
  function syncLabels() {
    layers.labels?.remove(); layers.labels = null;
    const s = ctx?.state;
    if (!s || s.mode !== 'real' || !layers.zones || !s.labels || !s.boundaries || map.getZoom() < 10.5) return;
    measure.font = '700 12px "Bricolage Grotesque", sans-serif';
    const size = map.getSize(), bounds = map.getBounds(), occupied = [];
    for (const rect of handlers.occupied?.() || []) occupied.push(rect);
    const hit = (a, b) => a.x < b.x + b.w + 8 && a.x + a.w + 8 > b.x && a.y < b.y + b.h + 6 && a.y + a.h + 6 > b.y;
    const group = L.layerGroup();
    const zones = [...layers.zones.getLayers()].sort((a, b) => Number(b.feature.id === s.selected) - Number(a.feature.id === s.selected));
    let count = 0;
    for (const zone of zones) {
      const centre = zone.getBounds().getCenter();
      if (!bounds.contains(centre)) continue;
      const text = zone.feature.properties.full_name, point = map.latLngToContainerPoint(centre), width = measure.measureText(text).width + 18;
      const box = {x: point.x - width / 2, y: point.y - 13, w: width, h: 26};
      if (box.x < 8 || box.y < 8 || box.x + box.w > size.x - 8 || box.y + box.h > size.y - 8 || occupied.some(r => hit(box, r))) continue;
      occupied.push(box);
      L.marker(centre, {icon: L.divIcon({className: 'mg-label' + (zone.feature.id === s.selected ? ' sel' : ''), html: '', iconSize: [0, 0]}), pane: 'labels', interactive: false})
        .bindTooltip(text, {permanent: true, direction: 'center', className: 'mg-label-tip' + (zone.feature.id === s.selected ? ' sel' : '')}).addTo(group);
      if (++count >= (map.getZoom() >= 13 ? 24 : 12)) break;
    }
    layers.labels = group.addTo(map);
  }

  // ---- demo / csv points ---------------------------------------------------------------------
  function syncPoints() {
    layers.points?.remove(); layers.points = null;
    const s = ctx.state;
    if (s.mode === 'real') { layers.zones && !map.hasLayer(layers.zones) && layers.zones.addTo(map); return; }
    layers.zones?.remove();
    const group = L.layerGroup();
    for (const r of (ctx.points || []).filter(p => p.year === s.year)) {
      L.circleMarker([r.lat, r.lon], {radius: 13, color: '#0e0e0c', weight: 2.5, fillColor: colorOf(r[s.index], s.index), fillOpacity: s.opacity})
        .bindTooltip(r.name, {className: 'mg-tip', direction: 'top'}).on('click', () => handlers.select?.(r.name, null)).addTo(group);
    }
    layers.points = group.addTo(map);
  }

  // ---- public API ----------------------------------------------------------------------------------
  const api = {
    map,
    /** state: merged shared+map state. data: {geo, rows, layers, cover, points, source} (only when it changed). */
    update(state, data) {
      const first = !ctx;
      const dataChanged = data && (!ctx || ctx.geo !== data.geo || ctx.rows !== data.rows || ctx.layers !== data.layers || ctx.points !== data.points || ctx.source !== data.source);
      ctx = {...(ctx || {}), ...(data || {}), state};
      if (!ctx.geo) return;
      if (first || !layers.zones || (dataChanged && ctx.geo !== api._geo)) { api._geo = ctx.geo; buildZones(); }
      syncPoints(); restyleZones(); syncTiles(dataChanged); syncBase();
      clearTimeout(api._labelTimer); api._labelTimer = setTimeout(syncLabels, 60);
    },
    setInsets(next) { insets = {...insets, ...next}; },
    fitAll(animate = true) {
      if (!layers.zones) return;
      map.invalidateSize({animate: false});
      map.fitBounds(layers.zones.getBounds(), {animate, duration: .7, paddingTopLeft: [insets.left, insets.top], paddingBottomRight: [insets.right, insets.bottom]});
    },
    focus(code) {
      const zone = layers.zones?.getLayers().find(l => l.feature.id === code);
      if (!zone) return;
      map.flyToBounds(zone.getBounds(), {maxZoom: 13, duration: .8, paddingTopLeft: [insets.left, insets.top], paddingBottomRight: [insets.right, insets.bottom]});
    },
    focusPoint(lat, lon) { map.flyTo([lat, lon], 12, {duration: .8}); },
    ripple(latlng, ok = true) {
      layers.probe?.remove();
      layers.probe = L.marker(latlng, {pane: 'probe', interactive: false, icon: L.divIcon({className: 'mg-probe' + (ok ? '' : ' none'), html: '<i></i><i></i><b></b>', iconSize: [0, 0]})}).addTo(map);
    },
    clearProbe() { layers.probe?.remove(); layers.probe = null; },
    gps(lat, lon, accuracy) {
      layers.gps?.remove();
      layers.gps = L.layerGroup([L.circle([lat, lon], {radius: Math.min(accuracy || 50, 800), color: '#1b5fd1', weight: 1, fillOpacity: .08}),
        L.marker([lat, lon], {icon: L.divIcon({className: 'mg-gps', html: '<i></i><b></b>', iconSize: [0, 0]}), interactive: false})]).addTo(map);
      map.flyTo([lat, lon], 13, {duration: .9});
    },
    relabel() { clearTimeout(api._labelTimer); api._labelTimer = setTimeout(syncLabels, 30); },
    applySwipe() { if (ctx) applySwipe(); },
    invalidate() { map.invalidateSize({animate: false}); },
    zoomBy: delta => map.zoomIn(delta),
    zoomOut: delta => map.zoomOut(delta),
  };
  map.on('moveend', () => api.relabel());
  map.on('click', e => handlers.probe?.(e.latlng));
  map.on('zoomstart', () => { layers.labels?.remove(); });
  return api;
}
