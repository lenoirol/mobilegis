/** Research data access: network first, last good copy on the phone as fallback (works when the connection is weak). */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {API_BASE, CANONICAL_SOURCE} from './config';
import {get} from './api';
import type {IndexKey} from './format';

export interface Row {
  code: string; name: string; year: number; sampled_pixels?: number; dates?: string[];
  lst?: number | null; lst_coverage?: number; lst_pixels?: number;
  ndvi?: number | null; ndvi_coverage?: number; ndvi_pixels?: number;
  tvdi?: number | null; tvdi_coverage?: number; tvdi_pixels?: number;
}
export interface GeoFeature {type: 'Feature'; id: string; geometry: {type: 'Polygon' | 'MultiPolygon'; coordinates: any}; properties: {code: string; name: string; full_name: string; area_km2_source?: number; lat: number; lon: number}}
export interface Geo {type: 'FeatureCollection'; features: GeoFeature[]}
export interface TileMeta {url: string; bounds: [[number, number], [number, number]]; min_zoom: number; max_native_zoom: number}
export interface Products {absolute: Record<string, Partial<Record<IndexKey, TileMeta>>>; change: Partial<Record<IndexKey, TileMeta>>; available_years: number[]; generated_at?: string}
export interface Dataset {geo: Geo; rows: Row[]; products: Products; fromCache: boolean; rowsFrom: 'api' | 'file' | 'cache'}

const KEY = (path: string) => 'mobilegis:' + path;
async function getJson<T>(path: string, timeoutMs = 60000): Promise<{data: T; cached: boolean}> {   // 60 s: a sleeping free Render server needs about a minute to wake up
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(API_BASE + path, {signal: controller.signal});
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    const text = await response.text();
    const data = JSON.parse(text) as T;
    AsyncStorage.setItem(KEY(path), text).catch(() => {});   // keep the last good copy
    return {data, cached: false};
  } catch (error) {
    const saved = await AsyncStorage.getItem(KEY(path)).catch(() => null);
    if (saved) return {data: JSON.parse(saved) as T, cached: true};
    throw error;
  } finally { clearTimeout(timer); }
}

/** Research rows come from the PostgreSQL database through the API; the exported static file is only a fallback when the API is down. */
async function loadRows(): Promise<{data: Row[]; cached: boolean; from: 'api' | 'file' | 'cache'}> {
  try { const data = await get<Row[]>(`/api/research/observations?source=${CANONICAL_SOURCE}`, 20000); if (Array.isArray(data) && data.length > 900) { AsyncStorage.setItem(KEY('rows-api'), JSON.stringify(data)).catch(() => {}); return {data, cached: false, from: 'api'}; } }
  catch { /* fall through */ }
  try { const r = await getJson<Row[]>(`/data/${CANONICAL_SOURCE}/observations.json`); if (!r.cached) AsyncStorage.setItem(KEY('rows-api'), JSON.stringify(r.data)).catch(() => {}); return {data: r.data, cached: r.cached, from: r.cached ? 'cache' : 'file'}; }
  catch (error) { const saved = await AsyncStorage.getItem(KEY('rows-api')).catch(() => null); if (saved) return {data: JSON.parse(saved), cached: true, from: 'cache'}; throw error; }
}

/** The three files are independent, so they download at the same time (they used to go one after another). */
export async function loadDataset(onStep?: (step: number, text: string) => void): Promise<Dataset> {
  let done = 0;
  const tick = (text: string) => <T,>(value: T) => { done += 1; onStep?.(done, text); return value; };
  onStep?.(1, 'Đang tải số liệu và bản đồ…');
  const [geo, rows, products] = await Promise.all([
    getJson<Geo>('/data/hcm_167.geojson').then(tick('Đã có ranh giới 167 xã/phường')),
    loadRows().then(tick('Đã có số liệu nhiệt độ · độ xanh · độ khô')),
    getJson<Products>(`/data/${CANONICAL_SOURCE}/products.json`).then(tick('Đã có lớp bản đồ')),
  ]);
  onStep?.(4, 'Sẵn sàng');
  return {geo: geo.data, rows: rows.data, products: products.data, fromCache: geo.cached || rows.cached || products.cached, rowsFrom: rows.from};
}

/** Copy saved on the phone by an earlier run. Lets the app open at once; the fresh copy is fetched behind the scenes. */
export async function loadSaved(): Promise<Dataset | null> {
  try {
    const [geo, rows, products] = await Promise.all([
      AsyncStorage.getItem(KEY('/data/hcm_167.geojson')),
      AsyncStorage.getItem(KEY('rows-api')),
      AsyncStorage.getItem(KEY(`/data/${CANONICAL_SOURCE}/products.json`)),
    ]);
    if (!geo || !rows || !products) return null;
    return {geo: JSON.parse(geo) as Geo, rows: JSON.parse(rows) as Row[], products: JSON.parse(products) as Products, fromCache: true, rowsFrom: 'cache'};
  } catch { return null; }
}

/** Fast lookup by commune and year. */
export function indexRows(rows: Row[]) {
  const byKey = new Map<string, Row>(), byYear = new Map<number, Row[]>();
  for (const row of rows) { byKey.set(row.code + '|' + row.year, row); (byYear.get(row.year) ?? byYear.set(row.year, []).get(row.year)!).push(row); }
  return {get: (code: string, year: number) => byKey.get(code + '|' + year), year: (y: number) => byYear.get(y) ?? [], all: rows};
}
export interface LandClass {code: number; name: string; color: string; percent: number}
export interface CoverRow {code: string; classes: LandClass[]}
export interface Context {worldcover?: TileMeta & {classes?: {code: number; name: string; color: string}[]}; rgb_2020?: TileMeta; rgb_2025?: TileMeta}
export interface Extras {context: Context; cover: CoverRow[]; world: any | null}
/** Optional layers (land cover, natural-colour imagery, offline world outline). Loaded after the main data; the map works without them. */
export async function loadExtras(): Promise<Extras> {
  const [visual, cover, world] = await Promise.all([
    getJson<{context: Context}>('/data/visual_products.json').then(r => r.data.context).catch(() => ({} as Context)),
    getJson<CoverRow[]>('/data/gee/landcover_stats.json').then(r => r.data).catch(() => [] as CoverRow[]),
    getJson<any>('/data/world_land.json').then(r => r.data).catch(() => null),
  ]);
  return {context: visual, cover, world};
}

export type RowIndex = ReturnType<typeof indexRows>;
