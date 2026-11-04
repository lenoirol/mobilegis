/* Dự báo theo tháng (thử nghiệm): giá trị trung bình LST / NDVI của từng xã/phường cho các tháng sắp tới.
   Dữ liệu do scripts/forecast_monthly.py tạo từ chuỗi tháng MODIS; hiển thị luôn kèm khoảng tin cậy 80% và nhãn thử nghiệm. */
import {h, mount, svg, icon} from '../core/dom.js';
import {data} from '../core/data.js';
import {INDEX, indexTitle, colorOf, rampCss, fmt, valid, shortName, download, toCsv} from '../core/format.js';
import {segmented} from '../ui/seg.js';
import {infoButton} from '../ui/glossary.js';

const FIX = ['lst', 'ndvi'];          // TVDI chưa có chuỗi tháng nên chưa dự báo
const S = {index: 'lst', code: '26743', history: 36, month: 0, dir: 'desc', top: 10};
let root, doc = null, geo = null, seg = {}, el = {};
const mLabel = ym => `T${+ym.slice(5)}/${ym.slice(2, 4)}`;
const mLong = ym => `tháng ${+ym.slice(5)}/${ym.slice(0, 4)}`;

export async function available() {
  try { doc = await data.forecast(); return Array.isArray(doc?.future) && doc.future.length > 0; } catch (_) { return false; }
}

function chart() {
  const k = S.index, spec = INDEX[k], u = doc.units[S.code];
  const months = doc.months, all = u[k], n = Math.min(S.history, months.length), from = months.length - n;
  const hist = months.slice(from).map((m, i) => ({m, v: all[from + i]})), fc = doc.future.map((m, i) => ({m, f: u['f_' + k]?.[i]}));
  const W = 360, H = 230, pad = {l: 40, r: 10, t: 14, b: 30}, total = n + fc.length;
  const ys = [...hist.map(p => p.v), ...fc.flatMap(p => p.f ? [p.f[1], p.f[2]] : [])].filter(valid);
  if (!ys.length) return h('p', {class: 'muted'}, 'Khu vực này chưa đủ dữ liệu tháng để dự báo.');
  let lo = Math.min(...ys), hi = Math.max(...ys); const padY = (hi - lo) * .12 || 1; lo -= padY; hi += padY;
  const x = i => pad.l + i / (total - 1) * (W - pad.l - pad.r), y = v => H - pad.b - (v - lo) / (hi - lo) * (H - pad.t - pad.b);
  const s = svg('svg', {class: 'ch fc-chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Dự báo ${indexTitle(k)} của ${geo.features.find(f => f.id === S.code)?.properties.full_name}`});
  for (let t = 0; t <= 4; t++) { const v = lo + (hi - lo) * t / 4; s.append(svg('line', {class: 'ch-grid', x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v)}), svg('text', {class: 'ch-text', x: pad.l - 5, y: y(v) + 4, 'text-anchor': 'end'}, fmt(v, spec.digits === 1 ? 0 : 1))); }
  const col = getComputedStyle(root).getPropertyValue('--ix').trim() || '#23756a';
  const band = fc.map((p, i) => p.f && [x(n + i), y(p.f[2])]).filter(Boolean), bandBack = fc.map((p, i) => p.f && [x(n + i), y(p.f[1])]).filter(Boolean).reverse();
  if (band.length) {
    const lastH = [...hist].reverse().find(p => valid(p.v)), anchor = lastH ? [x(n - 1 - [...hist].reverse().indexOf(lastH)), y(lastH.v)] : null;
    s.append(svg('polygon', {points: [...band, ...bandBack].map(p => p.join(',')).join(' '), fill: col, 'fill-opacity': .16}));
    const line = [anchor, ...fc.map((p, i) => p.f && [x(n + i), y(p.f[0])])].filter(Boolean);
    s.append(svg('polyline', {points: line.map(p => p.join(',')).join(' '), fill: 'none', stroke: col, 'stroke-width': 2.5, 'stroke-dasharray': '6 4'}));
    fc.forEach((p, i) => p.f && s.append(svg('circle', {cx: x(n + i), cy: y(p.f[0]), r: 4.5, fill: colorOf(p.f[0], k), stroke: col, 'stroke-width': 1.5}, svg('title', {}, `${mLong(p.m)}: ${fmt(p.f[0], spec.digits)} (${fmt(p.f[1], spec.digits)} – ${fmt(p.f[2], spec.digits)})`))));
  }
  let run = [];
  const flush = () => { if (run.length > 1) s.append(svg('polyline', {points: run.join(' '), fill: 'none', stroke: col, 'stroke-width': 2.2, 'stroke-linejoin': 'round'})); run = []; };
  hist.forEach((p, i) => { if (valid(p.v)) run.push(`${x(i)},${y(p.v)}`); else flush(); });   // tháng thiếu dữ liệu: ngắt đường, không nối
  flush();
  hist.forEach((p, i) => valid(p.v) && s.append(svg('circle', {cx: x(i), cy: y(p.v), r: 2.6, fill: colorOf(p.v, k)}, svg('title', {}, `${mLong(p.m)}: ${fmt(p.v, spec.digits)}`))));
  s.append(svg('line', {x1: x(n - .5), x2: x(n - .5), y1: pad.t, y2: H - pad.b, stroke: 'var(--ink-3)', 'stroke-dasharray': '3 3'}), svg('text', {class: 'ch-text', x: x(n - .5) + 4, y: pad.t + 8}, 'dự báo →'));
  const step = Math.ceil(total / 7);
  for (let i = 0; i < total; i += step) s.append(svg('text', {class: 'ch-text', x: x(i), y: H - 10, 'text-anchor': 'middle'}, mLabel(i < n ? hist[i].m : fc[i - n].m)));
  return s;
}

function forecastTable() {
  const k = S.index, spec = INDEX[k], u = doc.units[S.code], f = u['f_' + k];
  if (!f) return h('p', {class: 'muted'}, 'Chưa có dự báo cho khu vực này.');
  const prev = ym => { const i = doc.months.indexOf(`${+ym.slice(0, 4) - 1}-${ym.slice(5)}`); return i >= 0 ? u[k][i] : null; };
  return h('div', {class: 'scroll card flat'}, h('table', {class: 'tbl'}, h('thead', null, h('tr', null, h('th', null, 'Tháng'), h('th', {class: 'num'}, 'Dự báo'), h('th', {class: 'num'}, 'Khoảng 80%'), h('th', {class: 'num'}, 'Cùng tháng năm trước'))),
    h('tbody', null, ...doc.future.map((m, i) => h('tr', null, h('th', {scope: 'row', class: 'name'}, mLong(m)),
      h('td', {class: 'num mono strong'}, h('i', {class: 'dot', style: {background: colorOf(f[i][0], k)}}), fmt(f[i][0], spec.digits)), h('td', {class: 'num mono'}, `${fmt(f[i][1], spec.digits)} – ${fmt(f[i][2], spec.digits)}`),
      h('td', {class: 'num mono'}, fmt(prev(m), spec.digits)))))));
}

function rankList() {
  const k = S.index, spec = INDEX[k], i = S.month;
  let list = Object.entries(doc.units).map(([code, u]) => ({code, f: u['f_' + k]?.[i]})).filter(x => x.f);
  list.sort((a, b) => (S.dir === 'desc' ? -1 : 1) * (a.f[0] - b.f[0]));
  const total = list.length; if (S.top) list = list.slice(0, S.top);
  const name = code => geo.features.find(f => f.id === code)?.properties.full_name || code;
  el.rankInfo.textContent = `${mLong(doc.future[i])} · ${total} khu vực có dự báo`;
  mount(el.rank, ...list.map((x, r) => h('li', {class: 'rank-row'}, h('span', {class: 'rank-n mono'}, String(r + 1).padStart(2, '0')),
    h('span', {class: 'rank-name'}, h('b', null, name(x.code)), h('small', {class: 'mono'}, `${fmt(x.f[1], spec.digits)} – ${fmt(x.f[2], spec.digits)}`)),
    h('b', {class: 'mono rank-v'}, h('i', {class: 'dot', style: {background: colorOf(x.f[0], k)}}), `${fmt(x.f[0], spec.digits)} ${spec.unit}`.trim()),
    h('button', {class: 'btn sm', type: 'button', on: {click: () => { S.code = x.code; el.unit.value = x.code; refresh(); root.scrollIntoView(); }}}, 'Xem')))); 
}

function explain() {
  const k = S.index, s = INDEX[k];
  mount(el.explain, h('div', {class: 'ix-head'}, h('b', {class: 'ix-code'}, s.code), h('div', null, h('strong', null, indexTitle(k)), h('small', null, `${s.english} · thang ${s.scaleText}`)), infoButton(k, 'Xem cả ba chỉ số')),
    h('div', {class: 'ix-ramp', style: {background: rampCss(k)}}), h('p', null, h('b', null, 'Ý nghĩa: '), s.what), h('p', {class: 'muted'}, h('b', null, 'Lưu ý: '), s.limit));
}

function modelCard() {
  const m = doc.indices[S.index];
  mount(el.model, h('h3', null, 'Dự báo này được tính thế nào?'), h('ul', {class: 'small model-list'},
    h('li', null, `Nguồn: ${doc.source}.`),
    h('li', null, `Mô hình: ${m.model === 'ols' ? 'hồi quy theo mùa cộng xu hướng nhẹ' : 'trung bình cùng tháng các năm trước'}.`),
    h('li', null, `Kiểm chứng: giữ lại ${doc.backtest_months} tháng cuối để thử. Sai số trung bình tuyệt đối ${fmt(m.mae_model, 2)}${INDEX[S.index].unit ? ' ' + INDEX[S.index].unit : ''}` + (m.mae_baseline != null ? `; phương pháp so sánh "cùng tháng năm trước" là ${fmt(m.mae_baseline, 2)}.` : '.') + (m.beats_baseline ? '' : ' Mô hình không tốt hơn phương pháp đơn giản nên đang dùng phương pháp đơn giản.')),
    h('li', null, 'Khoảng 80% được hiệu chỉnh bằng chính sai số kiểm chứng; không đảm bảo giá trị thật luôn nằm trong khoảng.'),
    ...doc.notes.map(n => h('li', null, n))));
}

async function refresh() {
  root.dataset.ix = document.documentElement.dataset.ix = S.index;
  seg.index?.set(S.index); explain(); mount(el.chart, chart()); mount(el.table, forecastTable()); modelCard(); rankList();
}

let store;
export async function init(section, ctx) {
  store = ctx.store;
  store.subscribe((s, p) => { if (s.index !== p.index && doc && el.chart) { S.index = FIX.includes(s.index) ? s.index : 'lst'; refresh(); } });
  root = h('div', {class: 'page stats-page forecast-page'}, h('div', {class: 'skeleton', style: {height: '240px'}}));
  section.append(root);
}
export async function show() {
  S.index = FIX.includes(store.get().index) ? store.get().index : 'lst';
  const picked = store.get().selected;           // mở đúng khu vực đang chọn ở Bản đồ / Xếp hạng
  if (picked && doc?.units?.[picked]) S.code = picked;
  if (el.chart) { el.unit.value = S.code; refresh(); return; }
  if (!doc && !(await available())) { mount(root, h('div', {class: 'callout'}, 'Chưa có dữ liệu dự báo.')); return; }
  if (!geo) geo = await data.geo();
  seg.index = segmented(FIX.map(k => ({value: k, label: `${INDEX[k].code} · ${INDEX[k].label}`})), S.index, v => store.set({index: v}), {label: 'Chỉ số'});
  el.unit = h('select', {class: 'select', 'aria-label': 'Khu vực', on: {change: () => { S.code = el.unit.value; refresh(); }}}, ...geo.features.filter(f => doc.units[f.id]).map(f => h('option', {value: f.id, selected: f.id === S.code}, f.properties.full_name)));
  const win = h('select', {class: 'select', 'aria-label': 'Lịch sử hiển thị', on: {change: e => { S.history = +e.target.value; refresh(); }}}, ...[[24, '2 năm gần nhất'], [36, '3 năm gần nhất'], [60, '5 năm gần nhất']].map(([v, t]) => h('option', {value: v, selected: v === S.history}, t)));
  el.explain = h('div', {class: 'card ix-card'}); el.chart = h('div', {class: 'fc-host'}); el.table = h('div'); el.model = h('div', {class: 'card'}); el.rank = h('ol', {class: 'rank-list'}); el.rankInfo = h('p', {class: 'small muted'});
  const mSel = h('select', {class: 'select', 'aria-label': 'Tháng dự báo', on: {change: e => { S.month = +e.target.value; rankList(); }}}, ...doc.future.map((m, i) => h('option', {value: i}, mLong(m))));
  const dSel = h('select', {class: 'select', 'aria-label': 'Thứ tự', on: {change: e => { S.dir = e.target.value; rankList(); }}}, h('option', {value: 'desc'}, 'Cao → thấp'), h('option', {value: 'asc'}, 'Thấp → cao'));
  const tSel = h('select', {class: 'select', 'aria-label': 'Số dòng', on: {change: e => { S.top = +e.target.value; rankList(); }}}, ...[[10, '10 đầu'], [20, '20 đầu'], [50, '50 đầu'], [0, 'Tất cả']].map(([v, t]) => h('option', {value: v}, t)));
  const csv = h('button', {class: 'btn sm', type: 'button', on: {click: () => {
    const k = S.index, spec = INDEX[k], rows = Object.entries(doc.units).flatMap(([code, u]) => (u['f_' + k] || []).map((f, i) => ({ma: code, ten: geo.features.find(g => g.id === code)?.properties.full_name || '', thang: doc.future[i], chi_so: indexTitle(k), du_bao: f[0], can_duoi_80: f[1], can_tren_80: f[2], ghi_chu: 'du bao thu nghiem, khong phai canh bao chinh thuc'})));
    download(`du_bao_thang_${k.toUpperCase()}.csv`, toCsv(['ma', 'ten', 'thang', 'chi_so', 'du_bao', 'can_duoi_80', 'can_tren_80', 'ghi_chu'], rows));
  }}}, icon('download', 16), 'CSV dự báo');
  const field = (label, node) => h('label', {class: 'field'}, h('span', null, label), node);
  mount(root,
    h('header', {class: 'page-head'}, h('span', {class: 'eyebrow'}, 'Dự báo thử nghiệm'), h('h1', null, 'Dự báo theo tháng'),
      h('p', null, `Giá trị trung bình dự kiến của từng xã/phường cho ${doc.future.length} tháng tới (${mLong(doc.future[0])} đến ${mLong(doc.future.at(-1))}). Đây là ước tính thống kê từ chuỗi ${doc.months.length} tháng, không phải cảnh báo chính thức.`)),
    h('div', {class: 'callout'}, 'Dự báo thử nghiệm. Chuỗi dữ liệu ngắn nên sai số có thể lớn; hãy xem cả khoảng 80% (vùng tô mờ). Tháng thiếu dữ liệu được để trống, không nội suy. TVDI chưa được dự báo.'),
    h('div', {class: 'filters card sticky'}, field('Chỉ số', seg.index.el), field('Khu vực', el.unit)),
    el.explain,
    h('section', {class: 'block'}, h('h2', null, 'Đường diễn biến và dự báo'), h('div', {class: 'card chart-card'}, el.chart, h('p', {class: 'dock-help'}, 'Đường liền: giá trị đã đo theo tháng (đứt đoạn là tháng thiếu dữ liệu). Đường đứt nét và vùng mờ: dự báo và khoảng 80%.'))),
    h('section', {class: 'block'}, h('h2', null, 'Dự báo từng tháng'), el.table),
    h('section', {class: 'block'}, h('h2', null, 'Xếp hạng khu vực theo dự báo'),
      h('div', {class: 'card'}, h('div', {class: 'filters flat-row'}, field('Tháng', mSel), field('Thứ tự', dSel), field('Số dòng', tSel)), el.rankInfo, el.rank, h('div', {class: 'export-row'}, csv))),
    h('section', {class: 'block'}, el.model));
  Object.values(seg).forEach(s => s.place()); refresh();
}
export function hide() { delete document.documentElement.dataset.ix; }
