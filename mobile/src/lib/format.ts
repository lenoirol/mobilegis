/** Thông số ba chỉ số, định dạng số và bảng màu (giống bản web, cùng ngưỡng). */
export type IndexKey = 'lst' | 'ndvi' | 'tvdi';
export const INDICES: IndexKey[] = ['lst', 'ndvi', 'tvdi'];
export const YEARS = [2020, 2021, 2022, 2023, 2024, 2025];
export const valid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const fmt = (v: unknown, digits = 2) => valid(v) ? v.toLocaleString('vi-VN', {minimumFractionDigits: digits, maximumFractionDigits: digits}) : '—';
export const pct = (v: unknown) => valid(v) ? Math.round(v * 100) + '%' : '—';

export interface IndexSpec {key: IndexKey; code: string; label: string; name: string; english: string; unit: string; scale: string; min: number; max: number; digits: number; experimental?: boolean;
  colors: string[]; what: string; read: string; limit: string; ix: string; dark: string; soft: string; ix2: string}
export const INDEX: Record<IndexKey, IndexSpec> = {
  lst: {key: 'lst', code: 'LST', label: 'Nhiệt độ', name: 'Nhiệt độ bề mặt đất', english: 'Land Surface Temperature', unit: '°C', scale: '20–45 °C', min: 20, max: 45, digits: 1,
    colors: ['#0000FF', '#0066FF', '#00FFFF', '#00FF00', '#FFFF00', '#FFCC00', '#FF6600', '#FF0000'],
    what: 'Nhiệt độ của mặt đất, mái nhà, đường nhựa, tán cây… do vệ tinh đo vào lúc ảnh được chụp.',
    read: 'Càng cao càng nóng. Trên bản đồ: xanh dương là mát, vàng là ấm, đỏ là rất nóng.',
    limit: 'Không phải nhiệt độ không khí do trạm khí tượng đo; vào buổi trưa nắng thường cao hơn nhiều.',
    ix: '#e8590c', dark: '#c2410c', soft: '#ffe8d6', ix2: '#dc2626'},
  ndvi: {key: 'ndvi', code: 'NDVI', label: 'Độ xanh', name: 'Chỉ số thực vật (độ xanh)', english: 'Normalized Difference Vegetation Index', unit: '', scale: '−0,2 đến 1', min: -0.2, max: 1, digits: 2,
    colors: ['#FF0000', '#FF7F00', '#FFFF00', '#ADFF2F', '#00FF00', '#00FFFF', '#007FFF', '#0000FF'],
    what: 'Mức độ xanh, tươi của thực vật, tính từ ánh sáng đỏ và cận hồng ngoại mà vệ tinh thu được.',
    read: 'Gần 0 hoặc âm: đất trống, nước, công trình. Khoảng 0,2–0,5: cỏ, cây thưa. Trên 0,5: cây xanh dày.',
    limit: 'Không đếm được số cây. Vào mùa khô, cây có thể vàng nên NDVI thấp hơn mùa mưa.',
    ix: '#2b9348', dark: '#1f7a38', soft: '#dcf5e3', ix2: '#0891b2'},
  tvdi: {key: 'tvdi', code: 'TVDI', label: 'Độ khô', name: 'Chỉ số khô hạn nhiệt độ – thực vật', english: 'Temperature Vegetation Dryness Index', unit: '', scale: '0 đến 1', min: 0, max: 1, digits: 2, experimental: true,
    colors: ['#066b00', '#0bc400', '#0ce100', '#00ff00', '#ffff00', '#ffcc00', '#ff6600', '#ff0000'],
    what: 'Độ khô tương đối của bề mặt, suy ra từ mối quan hệ giữa LST và NDVI trong cùng một cảnh ảnh.',
    read: '0 là ẩm, 1 là khô. Chia 5 mức: Rất ẩm, Ẩm, Trung bình, Khô, Rất khô.',
    limit: 'Chỉ số thử nghiệm, chưa kiểm định bằng độ ẩm đất. Không dùng để kết luận hạn hán.',
    ix: '#d98a00', dark: '#a85f00', soft: '#ffefc2', ix2: '#ea580c'},
};
/** "LST – Nhiệt độ bề mặt đất (°C)" */
export const indexTitle = (k: IndexKey) => `${INDEX[k].code} – ${INDEX[k].name}${INDEX[k].unit ? ' (' + INDEX[k].unit + ')' : ''}`;
export const confidence = (c: unknown) => !valid(c) ? {key: 'none', text: 'Chưa rõ'} : c >= .8 ? {key: 'high', text: 'Cao'} : c >= .5 ? {key: 'mid', text: 'Vừa'} : {key: 'low', text: 'Thấp'};
export const TVDI_CLASSES = [{max: .2, name: 'Rất ẩm'}, {max: .4, name: 'Ẩm'}, {max: .6, name: 'Trung bình'}, {max: .8, name: 'Khô'}, {max: 1.0001, name: 'Rất khô'}];
export const tvdiClass = (v: unknown) => valid(v) ? TVDI_CLASSES.find(c => v < c.max) ?? TVDI_CLASSES[4] : null;
export const NODATA = '#c3ccd5';

const hex = (c: string) => [1, 3, 5].map(p => parseInt(c.slice(p, p + 2), 16));
/** Màu của một giá trị trên thang cố định (nội suy tuyến tính như Earth Engine). */
export function colorOf(value: unknown, k: IndexKey) {
  if (!valid(value)) return NODATA;
  const s = INDEX[k], t = Math.max(0, Math.min(1, (value - s.min) / (s.max - s.min))) * (s.colors.length - 1);
  const i = Math.min(s.colors.length - 2, Math.floor(t)), a = hex(s.colors[i]), b = hex(s.colors[i + 1]);
  return '#' + a.map((v, j) => Math.round(v + (b[j] - v) * (t - i)).toString(16).padStart(2, '0')).join('');
}
export const dmy = (iso: string) => String(iso).split('-').reverse().join('/');
export const shortName = (name: string) => String(name).replace(/^(Phường|Xã|Đặc khu) /, '');
export const normalize = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();
export const csvCell = (v: unknown) => { const s = Array.isArray(v) ? v.join(' ') : String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
