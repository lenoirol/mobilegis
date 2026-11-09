/** Số liệu: mở ngay bằng bản đóng gói sẵn trong app (hoặc bản đã lưu lần trước), rồi lặng lẽ tải bản mới từ GitHub Pages.
 *  Không bao giờ chặn màn hình chờ mạng, nên mạng yếu hay mất mạng app vẫn mở tức thì. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useSyncExternalStore} from 'react';
import {PAGES} from './config';
import type {IndexKey} from './format';

export interface Row {
  code: string; name: string; year: number; sampled_pixels?: number; dates?: string[]; supplement?: string;
  lst?: number; lst_coverage?: number; ndvi?: number; ndvi_coverage?: number; tvdi?: number; tvdi_coverage?: number;
}
export interface Feature {type: 'Feature'; id: string; geometry: {type: 'Polygon' | 'MultiPolygon'; coordinates: any}; properties: {code: string; name: string; full_name: string; lat: number; lon: number}}
export interface Geo {type: 'FeatureCollection'; features: Feature[]}
export interface Forecast {generated: string; months: string[]; future: string[]; source: string; backtest_months: number; notes: string[];
  indices: Record<string, {model: string; mae_model: number; mae_baseline: number | null; beats_baseline: boolean}>;
  units: Record<string, {lst: (number | null)[]; ndvi: (number | null)[]; f_lst: [number, number, number][] | null; f_ndvi: [number, number, number][] | null}>}

const geo: Geo = require('../../assets/data/boundaries.json');
let rows: Row[] = require('../../assets/data/rows.json');
let forecast: Forecast = require('../../assets/data/forecast.json');
let version = 0, origin: 'bundled' | 'saved' | 'online' = 'bundled';
const subs = new Set<() => void>();
const bump = () => { version++; index = build(rows); subs.forEach(f => f()); };

/** Tra cứu nhanh theo (mã, năm). */
function build(list: Row[]) {
  const by = new Map<string, Row>();
  for (const r of list) by.set(r.code + '|' + r.year, r);
  return {get: (code: string, year: number) => by.get(code + '|' + year)};
}
let index = build(rows);
export type RowIndex = typeof index;

/** Ô vuông bao của từng khu vực (để phóng bản đồ tới khu vực) và tên, tính một lần. */
export const bbox = new Map<string, [number, number, number, number]>();
export const names = new Map<string, string>();
for (const f of geo.features) {
  let w = 180, s = 90, e = -180, n = -90;
  const walk = (c: any): void => { if (typeof c[0] === 'number') { if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0]; if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1]; } else c.forEach(walk); };
  walk(f.geometry.coordinates); bbox.set(f.properties.code, [w, s, e, n]); names.set(f.properties.code, f.properties.full_name || f.properties.name);
}
export const CODES = geo.features.map(f => f.properties.code);
export const WORLD_BOX: [number, number, number, number] = (() => { let w = 180, s = 90, e = -180, n = -90; for (const b of bbox.values()) { w = Math.min(w, b[0]); s = Math.min(s, b[1]); e = Math.max(e, b[2]); n = Math.max(n, b[3]); } return [w, s, e, n]; })();

export const getGeo = () => geo;
export const getRows = () => index;
export const getRowList = () => rows;
export const getForecast = () => forecast;
export const dataOrigin = () => origin;
/** Thành phần dùng số liệu gọi hook này để vẽ lại khi có bản mới. */
export function useDataVersion() { return useSyncExternalStore(cb => { subs.add(cb); return () => { subs.delete(cb); }; }, () => version); }

const KEY_ROWS = 'mg:rows:v3', KEY_FC = 'mg:forecast:v3';
const KEEP = ['code', 'name', 'year', 'sampled_pixels', 'dates', 'lst', 'lst_coverage', 'ndvi', 'ndvi_coverage', 'tvdi', 'tvdi_coverage', 'supplement'];
const compact = (r: any): Row => { const o: any = {}; for (const k of KEEP) if (r[k] !== null && r[k] !== undefined) o[k] = r[k]; return o; };

async function fetchJson<T>(path: string, ms = 20000): Promise<T> {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(PAGES + path, {signal: ctl.signal}); if (!r.ok) throw new Error(path + ' ' + r.status); return await r.json() as T; } finally { clearTimeout(t); }
}

let started = false;
/** Gọi một lần khi mở app. */
export async function startData() {
  if (started) return; started = true;
  try {
    const [r, f] = await Promise.all([AsyncStorage.getItem(KEY_ROWS), AsyncStorage.getItem(KEY_FC)]);
    if (r) { const list = JSON.parse(r); if (Array.isArray(list) && list.length > 900) { rows = list; origin = 'saved'; } }
    if (f) forecast = JSON.parse(f);
    if (r || f) bump();
  } catch { /* bản đóng gói vẫn dùng được */ }
  refresh().catch(() => {});
}
/** Tải bản mới: số liệu đã công bố + các đợt bổ sung đã kiểm tra (giống bản web), và dự báo tháng. */
export async function refresh() {
  const [base, extra, fc] = await Promise.all([
    fetchJson<any[]>('/data/gee_recovery/observations.json'),
    fetchJson<any[]>('/data/gee_recovery/supplements.json').catch(() => []),
    fetchJson<Forecast>('/data/forecast/forecast.json').catch(() => null),
  ]);
  const at = new Map(base.map((r, i) => [r.code + '|' + r.year, i]));
  for (const r of extra) { const i = at.get(r.code + '|' + r.year); if (i === undefined) base.push(r); else base[i] = r; }
  rows = base.map(compact); origin = 'online';
  if (fc?.future?.length) forecast = fc;
  bump();
  AsyncStorage.setItem(KEY_ROWS, JSON.stringify(rows)).catch(() => {});
  if (fc) AsyncStorage.setItem(KEY_FC, JSON.stringify(fc)).catch(() => {});
}

/** Ô ảnh 120 m (lớp ảnh gốc), tải khi người dùng bật lần đầu. */
export interface TileMeta {url: string; min_zoom: number; max_native_zoom: number}
let products: Record<string, Partial<Record<IndexKey, TileMeta>>> | null = null;
export async function tileMeta(year: number, k: IndexKey) {
  if (!products) products = (await fetchJson<any>('/data/gee_recovery/products.json')).absolute;
  const m = products?.[String(year)]?.[k];
  return m ? {...m, tiles: PAGES + m.url} : null;
}
