/* Shareable state: the map view is kept in the address (#/?chi-so=lst&nam=2025&khu-vuc=26743&…), so a copied link reopens the same view. */
import {INDICES, YEARS} from '../core/format.js';

const DEFAULT = {index: 'lst', year: 2025, mode: 'zones', dims: '2d', basemap: 'osm', palette: 'standard', range: [2020, 2025]};
const ok = {mode: ['zones', 'pixel'], dims: ['2d', '3d'], basemap: ['osm', 'sat', 'plain'], palette: ['standard', 'cb']};

export function stateFromParams(p) {
  const s = {};
  if (INDICES.includes(p['chi-so'])) s.index = p['chi-so'];
  if (YEARS.includes(+p.nam)) s.year = +p.nam;
  if (/^[0-9]{5}$/.test(p['khu-vuc'] || '')) s.selected = p['khu-vuc'];
  for (const [key, name] of [['che-do', 'mode'], ['kieu', 'dims'], ['nen', 'basemap'], ['mau', 'palette']]) if (ok[name].includes(p[key])) s[name] = p[key];
  if (YEARS.includes(+p.tu) && YEARS.includes(+p.den) && +p.tu <= +p.den) s.range = [+p.tu, +p.den];
  if (YEARS.includes(+p['so-sanh'])) s.compare = {on: true, year: +p['so-sanh']};
  if (s.mode === 'pixel') s.dims = '2d';
  return s;
}

export function paramsFromState(s) {
  const q = new URLSearchParams();
  if (s.index !== DEFAULT.index) q.set('chi-so', s.index);
  if (s.year !== DEFAULT.year) q.set('nam', s.year);
  if (s.selected) q.set('khu-vuc', s.selected);
  if (s.mode !== DEFAULT.mode) q.set('che-do', s.mode);
  if (s.dims !== DEFAULT.dims) q.set('kieu', s.dims);
  if (s.basemap !== DEFAULT.basemap) q.set('nen', s.basemap);
  if (s.palette !== DEFAULT.palette) q.set('mau', s.palette);
  if (s.range[0] !== DEFAULT.range[0] || s.range[1] !== DEFAULT.range[1]) { q.set('tu', s.range[0]); q.set('den', s.range[1]); }
  if (s.compare?.on) q.set('so-sanh', s.compare.year);
  return q.toString();
}

export function syncAddress(s) {
  const q = paramsFromState(s);
  history.replaceState(null, '', location.pathname + location.search + '#/' + (q ? '?' + q : ''));
}
export const shareUrl = s => { const q = paramsFromState(s); return location.origin + location.pathname + location.search + '#/' + (q ? '?' + q : ''); };
