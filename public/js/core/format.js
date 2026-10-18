/* Formatting and the fixed index specs (palettes come from the teacher's colour-scale document). */
export const valid = v => typeof v === 'number' && Number.isFinite(v);
export const fmt = (v, digits = 2) => valid(v) ? v.toLocaleString('vi-VN', {minimumFractionDigits: digits, maximumFractionDigits: digits}) : '—';
export const fmtInt = v => valid(v) ? Math.round(v).toLocaleString('vi-VN') : '—';
export const pct = (v, digits = 0) => valid(v) ? (v * 100).toLocaleString('vi-VN', {minimumFractionDigits: digits, maximumFractionDigits: digits}) + '%' : '—';
export const dmy = iso => String(iso).split('-').reverse().join('/');
export const normalize = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();
export const shortName = name => String(name).replace(/^(Phường|Xã|Đặc khu) /, '');

export const INDEX = {
  lst: {key: 'lst', label: 'LST', name: 'Nhiệt độ bề mặt', short: 'Nóng / mát', unit: '°C', min: 20, max: 45, digits: 1,
    colors: ['#0000FF', '#0066FF', '#00FFFF', '#00FF00', '#FFFF00', '#FFCC00', '#FF6600', '#FF0000'],
    help: 'Nhiệt độ bề mặt đất, mái nhà, cây… tại mốc ảnh. Không phải nhiệt độ không khí.'},
  ndvi: {key: 'ndvi', label: 'NDVI', name: 'Chỉ số thực vật', short: 'Xanh / thưa', unit: '', min: -0.2, max: 1, digits: 2,
    colors: ['#FF0000', '#FF7F00', '#FFFF00', '#ADFF2F', '#00FF00', '#00FFFF', '#007FFF', '#0000FF'],
    help: 'Mức độ xanh của thực vật. Giá trị cao thường là thực vật xanh; không phải số lượng cây.'},
  tvdi: {key: 'tvdi', label: 'TVDI', name: 'Độ khô tương đối', short: 'Khô / ẩm', unit: '', min: 0, max: 1, digits: 2, experimental: true,
    colors: ['#066b00', '#0bc400', '#0ce100', '#00ff00', '#ffff00', '#ffcc00', '#ff6600', '#ff0000'],
    help: 'Độ khô tương đối tính từ LST và NDVI. Chỉ số thử nghiệm, chưa dùng để kết luận hạn hán.'},
};
export const INDICES = ['lst', 'ndvi', 'tvdi'];
export const YEARS = [2020, 2021, 2022, 2023, 2024, 2025];

const hex = c => [1, 3, 5].map(p => parseInt(c.slice(p, p + 2), 16));
/** Colour for a value on an index scale (linear interpolation, like Earth Engine). Missing → neutral grey. */
export function colorOf(value, index) {
  if (!valid(value)) return '#c9c4b0';
  const s = INDEX[index], t = Math.max(0, Math.min(1, (value - s.min) / (s.max - s.min))) * (s.colors.length - 1);
  const i = Math.min(s.colors.length - 2, Math.floor(t)), a = hex(s.colors[i]), b = hex(s.colors[i + 1]);
  return '#' + a.map((v, k) => Math.round(v + (b[k] - v) * (t - i)).toString(16).padStart(2, '0')).join('');
}
export function rampCss(index) { return `linear-gradient(90deg,${INDEX[index].colors.join(',')})`; }

export const SOURCES = {
  gee_recovery: {id: 'gee_recovery', label: 'GEE · đã bổ sung 2025', long: 'Google Earth Engine · Landsat 8/9 · đã bổ sung 6.325 ô thực năm 2025'},
  gee: {id: 'gee', label: 'GEE · bản gốc', long: 'Google Earth Engine · bản gốc, năm 2025 thiếu 5 phường'},
  legacy: {id: 'legacy', label: 'Bộ xử lý cũ', long: 'USGS / Planetary Computer · bộ xử lý trước đó'},
};
export const CANONICAL_SOURCE = 'gee_recovery';

export function download(name, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], {type}));
  const a = Object.assign(document.createElement('a'), {href: url, download: name});
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}
export const csvCell = v => { const s = Array.isArray(v) ? v.join(' ') : String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export const toCsv = (columns, rows) => '﻿' + [columns.join(','), ...rows.map(r => columns.map(c => csvCell(r[c])).join(','))].join('\r\n');
