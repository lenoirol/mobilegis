/* MapLibre scene: basemaps, the 167 communes painted by value (2D fill or 3D extrusion), 120 m raster layers,
   hover/selection, threshold dimming and the year-change animation.
   Honesty rules: a commune whose sample coverage is below 50 % is drawn grey and flat (never coloured or ranked);
   missing values are never filled. The year animation only eases between two REAL years; the label always shows a real year. */
import * as maplibregl from '../../vendor/maplibre/maplibre-gl.mjs';
import {url} from '../core/api.js';
import {INDEX, valid} from '../core/format.js';

const policy = window.ViewerPolicy;
const OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const GREY = '#c3ccd5';
const BASE_H = 120, MAX_H = 9000;   // metres; heights are exaggerated for reading, the legend says so

const stopsOf = key => { const s = INDEX[key], n = s.colors.length; return s.colors.flatMap((c, i) => [s.min + (s.max - s.min) * i / (n - 1), c]); };
const colorExpr = key => ['case', ['==', ['feature-state', 'ok'], true],
  ['interpolate', ['linear'], ['to-number', ['feature-state', 'v'], INDEX[key].min], ...stopsOf(key)], GREY];
const dimmed = ['boolean', ['feature-state', 'dim'], false];

export function bboxOf(geo) {
  let w = 180, s = 90, e = -180, n = -90;
  const walk = c => { if (typeof c[0] === 'number') { w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]); } else c.forEach(walk); };
  geo.features.forEach(f => walk(f.geometry.coordinates));
  return [[w, s], [e, n]];
}

export function createMap(container, {geo, rows, products, ranges, onSelect, padding, controls = true, interactive = true}) {
  const box = bboxOf(geo);
  const map = new maplibregl.Map({
    container, maxPitch: 70, attributionControl: false, interactive, canvasContextAttributes: {preserveDrawingBuffer: true},
    bounds: box, fitBoundsOptions: {padding: padding()},
    style: {version: 8, sources: {
      osm: {type: 'raster', tiles: [OSM], tileSize: 256, maxzoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'},
      esri: {type: 'raster', tiles: [ESRI], tileSize: 256, maxzoom: 18, attribution: 'Ảnh nền: Esri, Maxar, Earthstar Geographics'},
      world: {type: 'geojson', data: url('data/world_land.json')},
      communes: {type: 'geojson', data: geo, promoteId: 'code'},
    }, layers: [
      {id: 'bg', type: 'background', paint: {'background-color': '#dfe8ee'}},
      {id: 'world', type: 'fill', source: 'world', layout: {visibility: 'none'}, paint: {'fill-color': '#f6f4ee', 'fill-outline-color': '#b9c2ca'}},
      {id: 'osm', type: 'raster', source: 'osm', paint: {'raster-saturation': -0.55, 'raster-brightness-min': 0.08, 'raster-contrast': -0.08}},
      {id: 'esri', type: 'raster', source: 'esri', layout: {visibility: 'none'}, paint: {'raster-saturation': -0.25}},
    ]},
  });
  if (controls) {
  map.addControl(new maplibregl.AttributionControl({compact: true}), 'bottom-right');
  map.addControl(new maplibregl.NavigationControl({visualizePitch: true}), 'bottom-right');
  map.addControl(new maplibregl.GeolocateControl({positionOptions: {enableHighAccuracy: true}, trackUserLocation: false, showAccuracyCircle: false}), 'bottom-right');
  map.addControl(new maplibregl.ScaleControl({maxWidth: 120, unit: 'metric'}), 'bottom-left');
  }
  if (interactive) map.touchZoomRotate.enableRotation();
  // A missing tile outside the data extent is normal (404 on static hosting); do not report it as an app error.
  map.on('error', e => { const m = String(e?.error?.message || ''); if (e?.tile || /404|decode|Failed to fetch/i.test(m)) return; console.error(e?.error || e); });

  const codes = geo.features.map(f => f.properties.code);
  const current = new Map();            // code → {v, h, ok} as currently drawn
  let index = 'lst', year = 2025, heightScale = 1, dim = null, selected = null, hovered = null, anim = 0;
  const rasters = new Set();
  let ready = new Promise(resolve => map.on('load', resolve));

  ready = ready.then(() => {
    map.addLayer({id: 'c-fill', type: 'fill', source: 'communes', paint: {'fill-color': colorExpr(index), 'fill-opacity': ['case', dimmed, 0.16, 0.86]}});
    map.addLayer({id: 'c-3d', type: 'fill-extrusion', source: 'communes', layout: {visibility: 'none'}, paint: {
      'fill-extrusion-color': ['case', dimmed, '#e3e8ec', colorExpr(index)],
      'fill-extrusion-height': ['case', ['all', ['==', ['feature-state', 'ok'], true], ['!', dimmed]], ['*', ['to-number', ['feature-state', 'h'], 0], heightScale], 25],
      'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.94, 'fill-extrusion-vertical-gradient': true}});
    map.addLayer({id: 'c-line', type: 'line', source: 'communes', paint: {'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.4, 12, 1.2], 'line-opacity': 0.85}});
    map.addLayer({id: 'c-hover', type: 'line', source: 'communes', paint: {'line-color': '#1d2733', 'line-width': 1.6, 'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.9, 0]}});
    map.addLayer({id: 'c-sel', type: 'line', source: 'communes', paint: {'line-color': '#1d2733', 'line-width': 3, 'line-opacity': ['case', ['boolean', ['feature-state', 'sel'], false], 1, 0]}});
    apply(false);
  });

  // ---- values per year (with an easing between two real years) ----
  function target(code) {
    const row = rows.get(code, year), ok = policy.eligible(row, index), v = ok ? row[index] : null;
    const r = ranges[index], t = ok ? Math.max(0, Math.min(1, (v - r.min) / (r.max - r.min))) : 0;
    return {ok, v, h: BASE_H + t * MAX_H};
  }
  function apply(animate) {
    cancelAnimationFrame(anim);
    const from = new Map(codes.map(c => [c, current.get(c)])), to = new Map(codes.map(c => [c, target(c)]));
    const set = (code, s) => { current.set(code, s); map.setFeatureState({source: 'communes', id: code}, s); };
    if (!animate) { to.forEach((s, code) => set(code, s)); return; }
    const start = performance.now(), ms = 650, ease = t => 1 - Math.pow(1 - t, 3);
    const frame = now => {
      const k = ease(Math.min(1, (now - start) / ms));
      to.forEach((b, code) => {
        const a = from.get(code);
        if (!a || !a.ok || !b.ok) set(code, k < 1 && a?.ok && !b.ok ? {...a, h: a.h * (1 - k)} : b.ok ? {ok: true, v: b.v, h: b.h * k} : b);   // appears/disappears: grow or shrink, value is the real one
        else set(code, {ok: true, v: a.v + (b.v - a.v) * k, h: a.h + (b.h - a.h) * k});
      });
      if (k < 1) anim = requestAnimationFrame(frame);
    };
    anim = requestAnimationFrame(frame);
  }

  // ---- interaction ----
  const popup = new maplibregl.Popup({closeButton: false, closeOnClick: false, offset: 10, className: 'pop-wrap'});
  const layersHit = () => [map.getLayoutProperty('c-3d', 'visibility') === 'visible' ? 'c-3d' : 'c-fill'];
  ready.then(() => {
    map.on('mousemove', e => {
      const f = map.queryRenderedFeatures(e.point, {layers: layersHit()})[0];
      const code = f?.properties.code ?? null;
      if (code !== hovered) {
        if (hovered) map.setFeatureState({source: 'communes', id: hovered}, {hover: false});
        hovered = code;
        if (code) map.setFeatureState({source: 'communes', id: code}, {hover: true});
      }
      map.getCanvas().style.cursor = code ? 'pointer' : '';
      if (!code || matchMedia('(hover: none)').matches) { popup.remove(); return; }
      const s = current.get(code), spec = INDEX[index];
      const value = s?.ok ? `${spec.code} ${target(code).v.toLocaleString('vi-VN', {minimumFractionDigits: spec.digits, maximumFractionDigits: spec.digits})}${spec.unit ? ' ' + spec.unit : ''}` : 'Chưa đủ dữ liệu (độ phủ < 50%)';
      const node = document.createElement('div'); node.className = 'pop';
      const b = document.createElement('b'); b.textContent = f.properties.full_name || f.properties.name;
      const sp = document.createElement('span'); sp.textContent = `${value} · ${year}`;
      node.append(b, sp);
      popup.setLngLat(e.lngLat).setDOMContent(node).addTo(map);
    });
    map.on('mouseout', () => { popup.remove(); if (hovered) map.setFeatureState({source: 'communes', id: hovered}, {hover: false}); hovered = null; });
    map.on('click', e => {
      const f = map.queryRenderedFeatures(e.point, {layers: layersHit()})[0];
      onSelect(f ? f.properties.code : null, e.lngLat);
    });
  });

  // ---- raster (120 m) layers ----
  function rasterFor(idx, yr) {
    const meta = products.absolute?.[yr]?.[idx];
    if (!meta) return null;
    const id = `px-${idx}-${yr}`;
    if (!rasters.has(id)) {
      const [[s, w], [n, e]] = meta.bounds;
      map.addSource(id, {type: 'raster', tiles: [url(meta.url)], tileSize: 256, minzoom: meta.min_zoom, maxzoom: meta.max_native_zoom, bounds: [w, s, e, n]});
      map.addLayer({id, type: 'raster', source: id, layout: {visibility: 'none'}, paint: {'raster-opacity': 0.92, 'raster-fade-duration': 150, 'raster-resampling': 'nearest'}}, 'c-fill');
      rasters.add(id);
    }
    return id;
  }

  const vis = (id, on) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  let mode = 'zones', dims = '2d';
  function layout() {
    const zones = mode === 'zones';
    vis('c-fill', zones && dims === '2d');
    vis('c-3d', zones && dims === '3d');
    vis('c-line', dims === '2d' || !zones);
    const want = !zones ? rasterFor(index, year) : null;
    rasters.forEach(id => vis(id, id === want));
  }

  return {
    map, ready,
    async update(next, {animate = false} = {}) {
      await ready;
      const changed = next.index !== index || next.year !== year;
      if (next.index !== index) {
        index = next.index;
        map.setPaintProperty('c-fill', 'fill-color', colorExpr(index));
        map.setPaintProperty('c-3d', 'fill-extrusion-color', ['case', dimmed, '#e3e8ec', colorExpr(index)]);
      }
      year = next.year;
      if (next.mode && next.mode !== mode) mode = next.mode;
      if (next.dims && next.dims !== dims) {
        dims = next.dims;
        map.easeTo(dims === '3d' ? {pitch: 58, bearing: -17, duration: 900} : {pitch: 0, bearing: 0, duration: 700});
      }
      if (next.basemap) { vis('osm', next.basemap === 'osm'); vis('esri', next.basemap === 'sat'); vis('world', next.basemap === 'plain'); }
      if (changed) apply(animate);
      layout();
    },
    /** Re-read INDEX[*].colors (after setPalette) and repaint. */
    async repaint() {
      await ready;
      map.setPaintProperty('c-fill', 'fill-color', colorExpr(index));
      map.setPaintProperty('c-3d', 'fill-extrusion-color', ['case', dimmed, '#e3e8ec', colorExpr(index)]);
    },
    async setHeight(scale) {
      await ready; heightScale = scale;
      map.setPaintProperty('c-3d', 'fill-extrusion-height', ['case', ['all', ['==', ['feature-state', 'ok'], true], ['!', dimmed]], ['*', ['to-number', ['feature-state', 'h'], 0], heightScale], 25]);
    },
    async setDim(matching) {
      await ready; dim = matching;
      codes.forEach(code => map.setFeatureState({source: 'communes', id: code}, {dim: !!dim && !dim.has(code)}));
    },
    async select(code, fly = false) {
      await ready;
      if (selected) map.setFeatureState({source: 'communes', id: selected}, {sel: false});
      selected = code;
      if (code) map.setFeatureState({source: 'communes', id: code}, {sel: true});
      if (code && fly) {
        const f = geo.features.find(x => x.properties.code === code);
        if (f) map.fitBounds(bboxOf({features: [f]}), {padding: padding(), maxZoom: 12.5, duration: 900, pitch: map.getPitch(), bearing: map.getBearing()});
      }
    },
    fitAll() { map.fitBounds(box, {padding: padding(), duration: 800, pitch: map.getPitch(), bearing: map.getBearing()}); },
    resize() { map.resize(); },
    state: () => ({index, year, mode, dims, heightScale}),
  };
}
