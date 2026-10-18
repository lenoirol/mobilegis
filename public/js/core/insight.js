/* Plain-language reading of one area against the whole city. Only areas with adequate sample coverage are compared. */
import {INDEX, fmt, valid} from './format.js';

const policy = window.ViewerPolicy;
const same = {lst: .3, ndvi: .03, tvdi: .03};   // differences smaller than this read as "about average"

/** Eligible rows of a year, sorted from the highest to the lowest value. */
export function ranked(rows, year, index) {
  return rows.year(year).filter(r => policy.eligible(r, index)).sort((a, b) => b[index] - a[index]);
}
export function cityMean(rows, year, index) {
  const list = ranked(rows, year, index);
  return list.length ? list.reduce((s, r) => s + r[index], 0) / list.length : null;
}
/** Words for "higher than average" per index, so the sentence reads naturally. */
const WORDS = {
  lst: {high: 'nóng hơn', low: 'mát hơn', unit: ' °C', noun: 'Nhiệt độ bề mặt'},
  ndvi: {high: 'cao hơn', low: 'thấp hơn', unit: '', noun: 'Độ xanh'},
  tvdi: {high: 'cao hơn (khô hơn)', low: 'thấp hơn (ẩm hơn)', unit: '', noun: 'Độ khô (thử nghiệm)'},
};

/** One or two honest sentences about an area; says plainly when there is not enough data to compare. */
export function areaSentence(rows, code, year, index, years = []) {
  const row = rows?.get(code, year), w = WORDS[index], spec = INDEX[index];
  if (!row || !policy.eligible(row, index)) return `Chưa đủ dữ liệu để so sánh khu vực này ở mốc ${year}: phần ảnh hợp lệ quá ít hoặc bị mây che. Ô trống không có nghĩa là bằng 0.`;
  const list = ranked(rows, year, index), mean = cityMean(rows, year, index), diff = row[index] - mean, place = list.findIndex(r => r.code === code) + 1;
  const dir = Math.abs(diff) < same[index] ? `xấp xỉ mức trung bình thành phố (${fmt(mean, spec.digits)}${w.unit})`
    : `${diff > 0 ? w.high : w.low} mức trung bình thành phố khoảng ${fmt(Math.abs(diff), spec.digits)}${w.unit}`;
  let text = `${w.noun} ${dir}. Xếp ${place}/${list.length} khu vực đủ dữ liệu (1 là ${index === 'ndvi' ? 'xanh nhất' : index === 'tvdi' ? 'khô nhất' : 'nóng nhất'}).`;
  const first = years[0];
  if (first && first < year) {
    const past = rows.get(code, first);
    if (policy.eligible(past, index)) {
      const d = row[index] - past[index];
      text += Math.abs(d) < same[index] ? ` So với ${first}: gần như không đổi.` : ` So với ${first}: ${d > 0 ? 'tăng' : 'giảm'} ${fmt(Math.abs(d), spec.digits)}${w.unit}.`;
    }
  }
  return text;
}
