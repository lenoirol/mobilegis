/* Research data access with caching. Sources are never mixed: an unavailable source is an error, never a silent fallback. */
import {get} from './api.js';

const cache = new Map();
function once(key, load) {
  if (!cache.has(key)) cache.set(key, load().catch(error => { cache.delete(key); throw error; }));
  return cache.get(key);
}
const ROWS_URL = {gee_recovery: '/data/gee_recovery/observations.json', gee: '/data/gee/observations.json', legacy: '/data/observations_real.json'};
const PRODUCT_URL = {gee_recovery: '/data/gee_recovery/products.json', gee: '/data/gee/products.json', legacy: '/data/visual_products.json'};

export const data = {
  geo: () => once('geo', () => get('/data/hcm_167.geojson')),
  rows: source => once('rows:' + source, () => get(ROWS_URL[source])),
  product: source => once('product:' + source, () => get(PRODUCT_URL[source])),
  cover: source => once('cover:' + (source === 'legacy' ? 'legacy' : 'gee'), () => get(source === 'legacy' ? '/data/landcover_stats.json' : '/data/gee/landcover_stats.json')),
  userPoints: () => once('user', () => get('/data/observations_user.json')),
  demoPoints: () => get('/api/observations'),
  boundary: () => once('boundary', () => get('/data/boundary_source.json')),
  info: () => get('/api/info'),
  content: () => once('content', () => get('/api/content').catch(() => ({notes: {}, highlights: []}))),
  forget: key => { for (const k of [...cache.keys()]) if (k.startsWith(key)) cache.delete(k); },
};

/** Tile/layer metadata for a source. RGB context tiles only exist in the legacy bundle; they are context, not indices. */
export async function layersFor(source) {
  const product = await data.product(source);
  const legacy = source === 'legacy' ? product : await data.product('legacy').catch(() => null);
  return {
    absolute: product.absolute || {}, change: product.change || {},
    context: {...(legacy?.context || {}), ...(product.context || {})},
    years: (product.available_years || Object.keys(product.absolute || {}).map(Number)).map(Number).sort(),
    pending: product.pending_years || [], product,
  };
}

/** Index rows for fast lookup. */
export function indexRows(rows) {
  const byKey = new Map(), byYear = new Map(), byCode = new Map();
  for (const row of rows) {
    byKey.set(row.code + '|' + row.year, row);
    (byYear.get(row.year) || byYear.set(row.year, []).get(row.year)).push(row);
    (byCode.get(row.code) || byCode.set(row.code, []).get(row.code)).push(row);
  }
  return {get: (code, year) => byKey.get(code + '|' + year), year: y => byYear.get(y) || [], code: c => (byCode.get(c) || []).sort((a, b) => a.year - b.year), all: rows};
}
