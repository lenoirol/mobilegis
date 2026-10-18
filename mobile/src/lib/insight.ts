/** Plain-language reading of one area against the whole city. Only areas with adequate sample coverage are compared. */
import {INDEX, fmt, tvdiClass, type IndexKey} from './format';
import {eligible} from './policy';
import type {RowIndex} from './data';

const same: Record<IndexKey, number> = {lst: .3, ndvi: .03, tvdi: .03};
const WORDS = {
  lst: {high: 'nóng hơn', low: 'mát hơn', unit: ' °C', noun: 'Nhiệt độ bề mặt', top: 'nóng nhất'},
  ndvi: {high: 'cao hơn', low: 'thấp hơn', unit: '', noun: 'Độ xanh', top: 'xanh nhất'},
  tvdi: {high: 'cao hơn (khô hơn)', low: 'thấp hơn (ẩm hơn)', unit: '', noun: 'Độ khô (thử nghiệm)', top: 'khô nhất'},
};

const ranked = (rows: RowIndex, year: number, index: IndexKey) => rows.year(year).filter(r => eligible(r, index)).sort((a, b) => (b[index] as number) - (a[index] as number));

export function areaSentence(rows: RowIndex, code: string, year: number, index: IndexKey, firstYear: number) {
  const row = rows.get(code, year), w = WORDS[index], spec = INDEX[index];
  if (!row || !eligible(row, index)) return `Chưa đủ dữ liệu để so sánh khu vực này ở mốc ${year}: phần ảnh dùng được quá ít hoặc bị mây che. Ô trống không có nghĩa là bằng 0.`;
  const list = ranked(rows, year, index), mean = list.reduce((s, r) => s + (r[index] as number), 0) / list.length;
  const value = row[index] as number, diff = value - mean, place = list.findIndex(r => r.code === code) + 1;
  const dir = Math.abs(diff) < same[index] ? `xấp xỉ mức trung bình thành phố (${fmt(mean, spec.digits)}${w.unit})` : `${diff > 0 ? w.high : w.low} mức trung bình thành phố khoảng ${fmt(Math.abs(diff), spec.digits)}${w.unit}`;
  let text = `${w.noun} ${dir}. Xếp ${place}/${list.length} khu vực đủ dữ liệu (1 là ${w.top}).`;
  if (index === 'tvdi') text += ` Mức khô: ${tvdiClass(value)!.name.toLowerCase()}.`;
  if (firstYear < year) {
    const past = rows.get(code, firstYear);
    if (past && eligible(past, index)) {
      const d = value - (past[index] as number);
      text += Math.abs(d) < same[index] ? ` So với ${firstYear}: gần như không đổi.` : ` So với ${firstYear}: ${d > 0 ? 'tăng' : 'giảm'} ${fmt(Math.abs(d), spec.digits)}${w.unit}.`;
    }
  }
  return text;
}
