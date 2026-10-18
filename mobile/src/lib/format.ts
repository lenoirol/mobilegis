/** Index specs, number formatting and the plain-language scales (ported from the web app, same thresholds). */
export type IndexKey = 'lst' | 'ndvi' | 'tvdi';
export const INDICES: IndexKey[] = ['lst', 'ndvi', 'tvdi'];
export const YEARS = [2020, 2021, 2022, 2023, 2024, 2025];

export const valid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const fmt = (v: unknown, digits = 2) => valid(v) ? v.toLocaleString('vi-VN', {minimumFractionDigits: digits, maximumFractionDigits: digits}) : '—';
export const pct = (v: unknown, digits = 0) => valid(v) ? (v * 100).toLocaleString('vi-VN', {minimumFractionDigits: digits, maximumFractionDigits: digits}) + '%' : '—';

export interface IndexSpec {key: IndexKey; code: string; label: string; name: string; short: string; unit: string; min: number; max: number; digits: number; experimental?: boolean; colors: string[]; help: string}
export const INDEX: Record<IndexKey, IndexSpec> = {
  lst: {key: 'lst', code: 'LST', label: 'Nhiệt độ', name: 'Nhiệt độ bề mặt', short: 'Nóng / mát', unit: '°C', min: 20, max: 45, digits: 1,
    colors: ['#0000FF', '#0066FF', '#00FFFF', '#00FF00', '#FFFF00', '#FFCC00', '#FF6600', '#FF0000'],
    help: 'Nhiệt độ bề mặt đất, mái nhà, cây… tại mốc ảnh. Không phải nhiệt độ không khí.'},
  ndvi: {key: 'ndvi', code: 'NDVI', label: 'Độ xanh', name: 'Độ xanh của cây cối', short: 'Xanh / thưa', unit: '', min: -0.2, max: 1, digits: 2,
    colors: ['#FF0000', '#FF7F00', '#FFFF00', '#ADFF2F', '#00FF00', '#00FFFF', '#007FFF', '#0000FF'],
    help: 'Mức độ xanh của thực vật. Giá trị cao thường là thực vật xanh; không phải số lượng cây.'},
  tvdi: {key: 'tvdi', code: 'TVDI', label: 'Độ khô', name: 'Độ khô tương đối', short: 'Khô / ẩm', unit: '', min: 0, max: 1, digits: 2, experimental: true,
    colors: ['#066b00', '#0bc400', '#0ce100', '#00ff00', '#ffff00', '#ffcc00', '#ff6600', '#ff0000'],
    help: 'Độ khô tương đối tính từ nhiệt độ và độ xanh. Chỉ số thử nghiệm, chưa dùng để kết luận hạn hán.'},
};

/** Reliability from the share of valid pixels: Cao ≥ 80 %, Vừa 50–80 %, Thấp < 50 %. Coverage is not accuracy. */
export const confidence = (coverage: unknown) => !valid(coverage) ? {key: 'none', text: 'Chưa rõ'} : coverage >= .8 ? {key: 'high', text: 'Cao'} : coverage >= .5 ? {key: 'mid', text: 'Vừa'} : {key: 'low', text: 'Thấp'};

/** TVDI dryness classes: 5 equal steps, a display convention, not a validated drought scale. */
export const TVDI_CLASSES = [{max: .2, name: 'Rất ẩm'}, {max: .4, name: 'Ẩm'}, {max: .6, name: 'Trung bình'}, {max: .8, name: 'Khô'}, {max: 1.0001, name: 'Rất khô'}];
export const tvdiClass = (v: unknown) => valid(v) ? TVDI_CLASSES.find(c => v < c.max) ?? TVDI_CLASSES[4] : null;
/** An area is flagged when TVDI reaches this value. Experimental, not an official drought warning. */
export const TVDI_ALERT = 0.8;

/** Linear colour ramp like Earth Engine; used to colour legend steps. */
const hex = (c: string) => [1, 3, 5].map(p => parseInt(c.slice(p, p + 2), 16));
export function colorAt(t: number, index: IndexKey) {
  const s = INDEX[index], x = Math.max(0, Math.min(1, t)) * (s.colors.length - 1), i = Math.min(s.colors.length - 2, Math.floor(x)), a = hex(s.colors[i]), b = hex(s.colors[i + 1]);
  return '#' + a.map((v, k) => Math.round(v + (b[k] - v) * (x - i)).toString(16).padStart(2, '0')).join('');
}

export const dmy = (iso: string) => String(iso).split('-').reverse().join('/');
export const shortName = (name: string) => String(name).replace(/^(Phường|Xã|Đặc khu) /, '');
export const normalize = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();

export const csvCell = (v: unknown) => { const s = Array.isArray(v) ? v.join(' ') : String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
