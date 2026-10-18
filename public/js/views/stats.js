/* Statistics view: pixel-level distributions from PostgreSQL, ward comparison, ranking, scatter, correlations,
   TVDI screening and the supplementary CSV/evidence material. Presentation rules: never fill gaps, never bridge them. */
import {h, mount, icon} from '../core/dom.js';
import {get} from '../core/api.js';
import {data, indexRows} from '../core/data.js';
import {INDEX, INDICES, YEARS, SOURCES, CANONICAL_SOURCE, fmt, fmtInt, pct, valid, shortName, colorOf, rampCss, download, toCsv} from '../core/format.js';
import {countTo, stagger} from '../core/motion.js';
import {segmented} from '../ui/seg.js';
import {toast} from '../ui/toast.js';
import {lineChart, barChart, histogramChart, boxChart, scatterChart, SERIES_COLORS, chartToSvgText} from '../ui/charts.js';

const policy = window.ViewerPolicy;
const S = {source: CANONICAL_SOURCE, index: 'lst', year: 2025, coverage: .5, unit: ''};
let store, nav, root, geo = null, rows = null, ticketN = 0, charts = [], current = [], seg = {};
const el = {};

const clearCharts = () => { charts.forEach(c => c.destroy()); charts = []; };
const card = (title, ...kids) => h('article', {class: 'card chart-card'}, h('h3', null, title), ...kids);
const field = (label, node) => h('label', {class: 'field'}, h('span', null, label), node);
const skeleton = (n = 1, height = 180) => Array.from({length: n}, () => h('div', {class: 'skeleton', style: {height: height + 'px'}}));

// ---- filter bar -------------------------------------------------------------------------------------------------------
function buildFilters() {
  seg.index = segmented(INDICES.map(k => ({value: k, label: INDEX[k].label})), S.index, v => { S.index = v; refresh(); }, {label: 'Chỉ số'});
  seg.year = segmented(YEARS.map(y => ({value: y, label: String(y)})), S.year, v => { S.year = +v; refresh(); }, {label: 'Mốc ảnh', layout: 'row years'});
  el.coverage = h('select', {class: 'select', 'aria-label': 'Độ phủ tối thiểu', on: {change: () => { S.coverage = +el.coverage.value; refresh(); }}},
    ...[[.5, '≥ 50% · khuyến nghị'], [.1, '≥ 10% · gồm mẫu ít'], [.8, '≥ 80%']].map(([v, l]) => h('option', {value: v}, l)));
  el.unit = h('select', {class: 'select', 'aria-label': 'Khu vực thống kê', on: {change: () => { S.unit = el.unit.value; refresh(); }}}, h('option', {value: ''}, 'Tất cả khu vực đủ độ phủ'));
  seg.source = segmented(Object.values(SOURCES).map(s => ({value: s.id, label: s.label})), S.source, async v => { S.source = v; rows = null; await refresh(); }, {label: 'Nguồn dữ liệu', layout: 'col'});
  return h('div', {class: 'filters card sticky'}, field('Chỉ số', seg.index.el), field('Mốc ảnh', seg.year.el), field('Độ phủ tối thiểu', el.coverage), field('Khu vực', el.unit),
    h('details', {class: 'adv'}, h('summary', null, 'Nguồn dữ liệu · nâng cao'), seg.source.el));
}

// ---- sections ---------------------------------------------------------------------------------------------------------------
function kpis(list) {
  const valid_ = list.filter(r => r.valid_count > 0), count = valid_.reduce((s, r) => s + r.valid_count, 0);
  const mean = count ? valid_.reduce((s, r) => s + r.mean * r.valid_count, 0) / count : null, idx = INDEX[S.index];
  const items = [[count, 'Mẫu hợp lệ trong nhóm', v => Math.round(v).toLocaleString('vi-VN')], [mean, 'Trung bình theo pixel', v => fmt(v, idx.digits)],
    [valid_.length ? Math.min(...valid_.map(r => r.minimum)) : null, 'Giá trị thấp nhất', v => fmt(v, idx.digits)], [valid_.length ? Math.max(...valid_.map(r => r.maximum)) : null, 'Giá trị cao nhất', v => fmt(v, idx.digits)]];
  mount(el.kpis, ...items.map(([value, label, format], i) => { const b = h('b', {class: 'mono num'}, '—'); requestAnimationFrame(() => countTo(b, value, format, 700)); return h('div', {class: 'kpi-card reveal', style: {'--i': i}}, b, h('span', null, label)); }));
}
function unitPicker(features) {
  if (el.unit.dataset.ready) return;
  for (const f of features) el.unit.append(h('option', {value: f.id}, f.properties.full_name));
  el.unit.dataset.ready = '1';
}
function distributions(stats, cover) {
  const idx = INDEX[S.index], list = stats.units.filter(r => r.valid_count > 0);
  const pinned = store.get().pinned;
  clearCharts();
  const hosts = {hist: h('div'), box: h('div'), mean: h('div'), lc: h('div')};
  mount(el.dist,
    card(`Phân bố pixel hợp lệ · ${idx.label}`, hosts.hist, h('p', {class: 'dock-help'}, 'Số pixel hợp lệ theo khoảng giá trị, gộp theo khu vực. Ranh giới có thể có ô trùng ở mép.')),
    card('Phân bố trong các khu vực', hosts.box, h('p', {class: 'dock-help'}, 'Hộp: Q25–Q75; vạch đậm: trung vị; râu: min–max. Hiển thị các khu vực đã ghim để so sánh. Không phải sai số dự báo.')),
    card('Trung bình cao nhất theo khu vực', hosts.mean), card('Chỉ số theo lớp phủ đất 2021', hosts.lc, h('p', {class: 'dock-help'}, cover?.note || '')));
  requestAnimationFrame(() => {
    const sum = list[0] ? list[0].histogram.counts.map((_, i) => list.reduce((s, r) => s + r.histogram.counts[i], 0)) : [];
    charts.push(histogramChart(hosts.hist, {edges: list[0]?.histogram.edges || [], counts: sum}, {unit: idx.unit || idx.label, digits: S.index === 'lst' ? 0 : 2, label: `Histogram ${idx.label}`}));
    let shown = list.filter(r => pinned.includes(r.code) && valid(r.minimum)).slice(0, 6); if (!shown.length) shown = list.filter(r => valid(r.minimum)).slice(0, 6);
    charts.push(boxChart(hosts.box, shown.map(r => ({label: shortName(r.name), min: r.minimum, q25: r.q25, median: r.median, q75: r.q75, max: r.maximum})), {unit: idx.unit, digits: idx.digits, label: `Hộp phân vị ${idx.label}`}));
    charts.push(barChart(hosts.mean, [...list].sort((a, b) => b.mean - a.mean).slice(0, 8).map(r => ({label: shortName(r.name), value: r.mean, note: [`${r.valid_count.toLocaleString('vi-VN')} pixel · độ phủ ${pct(r.coverage, 1)}`]})), {unit: idx.unit, digits: idx.digits, label: 'Trung bình cao nhất'}));
    charts.push(barChart(hosts.lc, (cover?.classes || []).map(c => ({label: c.class_name, value: c.mean, color: c.color || '#0e0e0c', note: [`${(c.valid_count ?? c.pixels ?? 0).toLocaleString('vi-VN')} pixel`]})), {unit: idx.unit, digits: idx.digits, label: 'Chỉ số theo lớp phủ'}));
  });
}
function correlations(corr) {
  mount(el.corr, h('div', {class: 'scroll card flat'}, h('table', {class: 'tbl'}, h('thead', null, h('tr', null, ...['Cặp chỉ số', 'Số cặp', 'Pearson r', 'R² hồi quy đơn'].map((t, i) => h('th', {class: i ? 'num' : ''}, t)))),
    h('tbody', null, ...corr.pairs.map(p => h('tr', null, h('th', {scope: 'row', class: 'name'}, `${p.x.toUpperCase()} – ${p.y.toUpperCase()}`), h('td', {class: 'num mono'}, fmtInt(p.n)), h('td', {class: 'num mono strong'}, fmt(p.r, 3)), h('td', {class: 'num mono'}, fmt(p.r_squared, 3))))))),
    h('p', {class: 'dock-help'}, corr.note));
}
function wardCompare() {
  const idx = INDEX[S.index], pinned = store.get().pinned, byCode = indexRows(rows), host = h('div');
  const series = pinned.map((code, i) => ({id: code, name: geo.features.find(f => f.id === code)?.properties.full_name || code, short: shortName(geo.features.find(f => f.id === code)?.properties.full_name || code), color: SERIES_COLORS[i % 4],
    points: YEARS.map(year => { const r = byCode.get(code, year), ok = valid(r?.[S.index]) && (r[S.index + '_coverage'] ?? 0) >= S.coverage; return {x: year, y: ok ? r[S.index] : null, lines: [`Độ phủ ${pct(r?.[S.index + '_coverage'], 1)}`]}; })}));
  const select = h('select', {class: 'select', 'aria-label': 'Thêm khu vực'}, ...geo.features.map(f => h('option', {value: f.id}, f.properties.full_name)));
  const chips = pinned.map((code, i) => h('button', {class: 'pin-chip', type: 'button', title: 'Bỏ khỏi so sánh', on: {click: () => { store.set({pinned: pinned.filter(c => c !== code)}); renderWards(); }}}, h('i', {style: {background: SERIES_COLORS[i % 4]}}), shortName(series[i].name), icon('x', 14)));
  mount(el.ward, h('div', {class: 'ward-bar'}, h('div', {class: 'ward-add'}, select, h('button', {class: 'btn sm', type: 'button', on: {click: () => {
    const code = select.value, p = store.get().pinned;
    if (p.includes(code)) return; if (p.length >= 4) return toast('Tối đa 4 khu vực. Bỏ bớt một khu vực trước khi thêm.', {error: true});
    store.set({pinned: [...p, code]}); renderWards();
  }}}, icon('plus', 16), 'Thêm')), h('div', {class: 'pin-chips'}, ...chips, !chips.length ? h('span', {class: 'muted small'}, 'Chưa chọn khu vực nào.') : null)), host,
    h('p', {class: 'dock-help'}, `Chỉ vẽ mốc độ phủ ≥ ${Math.round(S.coverage * 100)}%; khoảng thiếu hoặc ít mẫu không nối. Ngày ảnh khác nhau giữa năm; TVDI thử nghiệm.`));
  charts.push(lineChart(host, series, {xs: YEARS, unit: idx.unit, height: 280, label: `So sánh ${idx.name} của các khu vực`, domain: [Math.min(idx.min, ...series.flatMap(s => s.points.map(p => p.y)).filter(valid)), Math.max(idx.max, ...series.flatMap(s => s.points.map(p => p.y)).filter(valid))], yFormat: v => fmt(v, idx.digits)}));
}
function renderWards() { if (rows && geo) wardCompare(); }
function ranking() {
  const idx = INDEX[S.index], year = rows.filter(r => r.year === S.year && policy.eligible(r, S.index, S.coverage)).sort((a, b) => b[S.index] - a[S.index]).slice(0, 5);
  mount(el.rank, ...year.map((r, i) => h('li', {class: 'rank-row'}, h('span', {class: 'rank-n mono'}, String(i + 1).padStart(2, '0')), h('span', {class: 'rank-name'}, h('b', null, r.name), h('small', {class: 'mono'}, `độ phủ ${pct(r[S.index + '_coverage'])}`)),
    h('b', {class: 'mono rank-v'}, `${fmt(r[S.index], idx.digits)} ${idx.unit}`.trim()), h('a', {class: 'btn sm', href: `#/ban-do?khu-vuc=${r.code}&nam=${S.year}&chi-so=${S.index}&che-do=zones`}, icon('map', 16), 'Bản đồ'))));
  if (!year.length) mount(el.rank, h('li', {class: 'muted'}, 'Chưa có khu vực đủ độ phủ ở bộ lọc này.'));
}
function scatter() {
  const pts = rows.filter(r => r.year === S.year && policy.eligible(r, 'lst', S.coverage) && policy.eligible(r, 'ndvi', S.coverage)).map(r => {
    const hasT = policy.eligible(r, 'tvdi', S.coverage);
    return {x: r.ndvi, y: r.lst, color: hasT ? colorOf(r.tvdi, 'tvdi') : '#8b8672', label: r.name, lines: [`NDVI ${fmt(r.ndvi)} · LST ${fmt(r.lst, 1)} °C`, `TVDI ${hasT ? fmt(r.tvdi) : 'thiếu / độ phủ thấp'}`], code: r.code};
  });
  const host = h('div');
  mount(el.scatter, host, h('div', {class: 'scatter-legend'}, h('span', {class: 'mono'}, 'TVDI'), h('i', {style: {background: rampCss('tvdi')}}), h('span', {class: 'mono'}, '0'), h('span', {class: 'mono'}, '1'), h('span', {class: 'muted small'}, '· xám: thiếu / độ phủ thấp')),
    h('p', {class: 'dock-help'}, `${pts.length} khu vực đủ độ phủ LST/NDVI. Mỗi chấm là trung bình một khu vực. Tương quan không chứng minh nguyên nhân; TVDI phụ thuộc toán học vào LST và NDVI.`));
  charts.push(scatterChart(host, pts, {xLabel: 'NDVI', yLabel: 'LST (°C)', xDigits: 2, yDigits: 0, height: 320, label: 'LST theo NDVI, tô màu theo TVDI', onPick: p => nav('ban-do', {'khu-vuc': p.code, nam: S.year})}));
}
function fullTable(list) {
  const cols = ['Khu vực', 'Pixel hợp lệ', 'Độ phủ', 'Min', 'Q25', 'Trung vị', 'Trung bình', 'Q75', 'Max', 'Độ lệch chuẩn'];
  const idx = INDEX[S.index];
  mount(el.full, h('div', {class: 'scroll card flat'}, h('table', {class: 'tbl'}, h('thead', null, h('tr', null, ...cols.map((c, i) => h('th', {class: i ? 'num' : ''}, c)))),
    h('tbody', null, ...list.filter(r => r.valid_count > 0).map(r => h('tr', null, h('th', {scope: 'row', class: 'name'}, r.name), h('td', {class: 'num mono'}, fmtInt(r.valid_count)), h('td', {class: 'num mono'}, pct(r.coverage, 1)),
      ...['minimum', 'q25', 'median', 'mean', 'q75', 'maximum', 'stddev'].map(k => h('td', {class: 'num mono'}, fmt(r[k], idx.digits)))))))),
    h('p', {class: 'dock-help'}, 'Độ lệch chuẩn mô tả độ phân tán pixel, không phải độ chính xác. Trung vị là giá trị giữa của phân bố, không phải giá trị phổ biến nhất.'));
}

// ---- TVDI screening ------------------------------------------------------------------------------------------------------------------
function screeningCard() {
  const y = h('select', {class: 'select', 'aria-label': 'Mốc ảnh'}, ...YEARS.map(v => h('option', {value: v, selected: v === 2025}, String(v))));
  const t = h('input', {class: 'input', type: 'number', min: 0, max: 1, step: .05, value: .8, 'aria-label': 'TVDI tối thiểu'});
  const c = h('select', {class: 'select', 'aria-label': 'Độ phủ tối thiểu'}, ...[[.5, '≥ 50%'], [.8, '≥ 80%'], [.1, '≥ 10% · thận trọng']].map(([v, l]) => h('option', {value: v}, l)));
  const status = h('p', {class: 'small', role: 'status'}), list = h('div', {class: 'alert-list'});
  let n = 0;
  const run = async () => {
    const th = Number(t.value), mine = ++n;
    if (t.value.trim() === '' || !Number.isFinite(th) || th < 0 || th > 1) { status.textContent = 'Nhập TVDI trong khoảng 0–1.'; list.replaceChildren(); return; }
    status.textContent = 'Đang truy vấn CSDL…'; mount(list, ...skeleton(1, 60));
    try {
      const res = await get(`/api/research/alerts?source=${S.source}&year=${y.value}&threshold=${th}&coverage=${c.value}`);
      if (mine !== n) return;
      status.textContent = `${SOURCES[S.source].label} · ${y.value}: ${res.units.length} khu vực đạt TVDI ≥ ${th} và độ phủ ≥ ${Math.round(c.value * 100)}%. Đây là sàng lọc thử nghiệm, không phải cấp hạn hay cảnh báo chính thức.`;
      mount(list, ...res.units.slice(0, 40).map(r => h('div', {class: 'alert-row'}, h('b', null, r.name), h('span', {class: 'mono'}, `TVDI ${fmt(r.tvdi)}`), h('span', {class: 'mono muted'}, `phủ ${pct(r.tvdi_coverage)}`), h('a', {class: 'btn sm', href: `#/ban-do?khu-vuc=${r.code}&nam=${y.value}&chi-so=tvdi&che-do=zones`}, icon('map', 16), 'Bản đồ'))),
        res.units.length > 40 ? h('p', {class: 'muted small'}, `Hiện 40/${res.units.length} khu vực đầu.`) : null);
    } catch (e) { if (mine === n) { status.textContent = 'Không tải được kết quả SQL: ' + e.message; list.replaceChildren(); } }
  };
  [y, c].forEach(n_ => n_.addEventListener('change', run)); t.addEventListener('input', run);
  setTimeout(run, 50);
  return h('article', {class: 'card'}, h('span', {class: 'eyebrow'}, 'Sàng lọc thử nghiệm'), h('h2', null, 'Khu vực có TVDI cao'),
    h('p', {class: 'muted'}, 'Truy vấn PostgreSQL theo năm, nguồn và độ phủ. Không phải cảnh báo hạn chính thức hay ngưỡng đã kiểm định.'),
    h('div', {class: 'filters flat-row'}, field('Mốc ảnh', y), field('TVDI tối thiểu', t), field('Độ phủ tối thiểu', c)), status, list);
}

// ---- appendix: four CSV points + evidence --------------------------------------------------------------------------------------------------
const EVIDENCE = [
  ['gee-ndvi-chart.jpg', 'Biểu đồ NDVI mùa khô 2020–2025', 'Bốn đường diễn biến có mức xanh tương đối khác nhau. Chú giải bị cắt, không đủ để gán chắc chắn mọi màu cho từng điểm. Ảnh tham khảo, không phải nguồn số của biểu đồ tương tác.'],
  ['gee-lst-chart.jpg', 'Biểu đồ LST mùa khô 2020–2025', 'Các đường nhiệt độ bề mặt biến động không đồng nhất. Không đọc ra số chính xác từ ảnh hay kết luận xu hướng chỉ bằng hai điểm đầu cuối.'],
  ['gee-lst-map-2025.jpg', 'Bản đồ LST năm 2025 trên GEE', 'Vùng trung tâm nhiều màu nóng, phía nam màu lạnh hơn. Không có thang số đầy đủ trong ảnh. Phạm vi lớp pilot là TP.HCM cũ.'],
  ['gee-ndvi-map-2025.jpg', 'Bản đồ NDVI năm 2025 trên GEE', 'Phía nam nổi bật màu xanh đậm, trung tâm nhạt hơn. Cần chú giải gốc để xác nhận ngưỡng; không coi màu là phần trăm che phủ.'],
  ['gee-tvdi-map-2025.jpg', 'Bản đồ TVDI thử nghiệm năm 2025', 'Màu đỏ và xanh thể hiện tương phản hiển thị, chưa đủ kết luận cấp hạn hán hay độ ẩm đất.'],
];
function appendix() {
  const box = h('details', {class: 'card appendix'}, h('summary', null, 'Phụ lục · bốn điểm CSV của nhóm và ảnh minh chứng GEE'));
  const body = h('div', {class: 'appendix-body'});
  box.append(body);
  let built = false;
  box.addEventListener('toggle', async () => {
    if (!box.open || built) return; built = true;
    const points = await data.userPoints().catch(() => []), names = [...new Set(points.map(p => p.name))];
    const picked = new Set(names), host = h('div'), table = h('div');
    let k = 'lst'; const idxSeg = segmented(INDICES.map(i => ({value: i, label: INDEX[i].label})), k, v => { k = v; draw(); }, {label: 'Chỉ số so sánh'});
    const boxes = names.map(n => h('label', {class: 'check'}, h('input', {type: 'checkbox', checked: true, on: {change: e => { e.target.checked ? picked.add(n) : picked.delete(n); draw(); }}}, ), n));
    const draw = () => {
      const idx = INDEX[k], list = names.filter(n => picked.has(n));
      const series = list.map(n => ({id: n, name: n, color: SERIES_COLORS[names.indexOf(n) % 4], dashed: names.indexOf(n) % 2 === 1, points: YEARS.map(year => ({x: year, y: points.find(p => p.name === n && p.year === year)?.[k] ?? null}))}));
      clearCharts(); charts.push(lineChart(host, series, {xs: YEARS, unit: idx.unit, height: 280, label: `${idx.label} tại các điểm CSV`, yFormat: v => fmt(v, idx.digits), domain: [Math.min(idx.min, ...series.flatMap(s => s.points.map(p => p.y)).filter(valid)), Math.max(idx.max, ...series.flatMap(s => s.points.map(p => p.y)).filter(valid))]}));
      mount(table, h('div', {class: 'scroll card flat'}, h('table', {class: 'tbl'}, h('thead', null, h('tr', null, h('th', null, 'Điểm'), h('th', {class: 'num'}, '2020'), h('th', {class: 'num'}, '2025'), h('th', {class: 'num'}, 'Chênh lệch'))),
        h('tbody', null, ...list.map(n => { const a = points.find(p => p.name === n && p.year === 2020)?.[k], b = points.find(p => p.name === n && p.year === 2025)?.[k], d = valid(a) && valid(b) ? b - a : null;
          return h('tr', null, h('th', {scope: 'row', class: 'name'}, n), h('td', {class: 'num mono'}, fmt(a, idx.digits)), h('td', {class: 'num mono'}, fmt(b, idx.digits)), h('td', {class: 'num mono strong'}, valid(d) ? (d > 0 ? '+' : '') + fmt(d, idx.digits) : '—')); })))));
    };
    const gallery = h('div', {class: 'evidence'}, ...EVIDENCE.map(([file, title, caption]) => h('figure', {class: 'ev-card'}, h('button', {type: 'button', class: 'ev-open', 'aria-label': 'Mở ảnh ' + title, on: {click: () => lightbox(file, title, caption)}}, h('img', {src: '/data/evidence/' + file, alt: title, loading: 'lazy'})), h('figcaption', null, h('b', null, title), h('span', null, caption)))));
    mount(body, h('h3', null, 'So sánh bốn điểm từ CSV nhóm cung cấp'), h('p', {class: 'dock-help'}, 'Nguồn khai báo: GEE Landsat 8/9 Collection 2 Level 2, mùa khô. Chưa tái kiểm chứng quy trình; không phải trung bình xã/phường. Đoạn nối không phải dự báo.'),
      idxSeg.el, h('div', {class: 'check-row'}, ...boxes), host, table, h('a', {class: 'btn sm', href: '/data/user_supplied_original.csv', download: ''}, icon('download', 16), 'Tải CSV nguyên gốc'),
      h('h3', null, 'Thư viện ảnh GEE do nhóm cung cấp'), h('p', {class: 'dock-help'}, 'Ảnh ghi “Ranh giới pilot – TPHCM cũ”, khác phạm vi sau sáp nhập. JPG không phải lớp bản đồ có tọa độ; không kéo giãn thành số liệu.'), gallery);
    draw(); idxSeg.place();
  });
  return box;
}
function lightbox(file, title, caption) {
  const dialog = h('dialog', {class: 'lightbox'}, h('div', {class: 'dlg-form'}, h('h2', null, title), h('img', {src: '/data/evidence/' + file, alt: title}), h('p', {class: 'small'}, caption),
    h('div', {class: 'dlg-actions'}, h('a', {class: 'btn', href: '/data/evidence/' + file, download: ''}, 'Tải ảnh gốc'), h('button', {class: 'btn primary', type: 'button', on: {click: () => { dialog.close(); dialog.remove(); }}}, 'Đóng'))));
  document.body.append(dialog); dialog.showModal();
}

// ---- refresh --------------------------------------------------------------------------------------------------------------------------------------------
async function refresh() {
  if (!root || root.closest('[hidden]')) return;
  const mine = ++ticketN;
  seg.index.set(S.index); seg.year.set(S.year); el.coverage.value = String(S.coverage); seg.source.set(S.source);
  el.status.textContent = 'Đang truy vấn thống kê PostgreSQL…';
  mount(el.kpis, ...skeleton(4, 78));
  try {
    if (!geo) geo = await data.geo();
    unitPicker(geo.features);
    if (!rows) rows = await data.rows(S.source);
    const q = new URLSearchParams({source: S.source, year: S.year, index: S.index, coverage: S.coverage, ...(S.unit ? {code: S.unit} : {})});
    const [stats, cover, corr] = await Promise.all([get('/api/analysis/statistics?' + q), get('/api/analysis/landcover?' + q), get(`/api/analysis/correlations?source=${S.source}&year=${S.year}&coverage=${S.coverage}`)]);
    if (mine !== ticketN) return;
    current = stats.units;
    const used = stats.units.filter(r => r.valid_count > 0);
    el.status.textContent = `${SOURCES[S.source].label} · ${S.year} · ${INDEX[S.index].label} · ${used.length} khu vực · độ phủ ≥ ${Math.round(S.coverage * 100)}%. Không phải trung bình năm.`;
    kpis(stats.units); distributions(stats, cover); correlations(corr); renderWards(); ranking(); scatter(); fullTable(stats.units);
    el.exportCsv.disabled = el.exportSvg.disabled = !current.length;
  } catch (error) {
    if (mine !== ticketN) return;
    current = []; el.status.textContent = 'Không tải được thống kê: ' + error.message;
    mount(el.kpis, h('div', {class: 'callout err', role: 'alert'}, error.message));
  }
}

export function init(section, ctx) {
  store = ctx.store; nav = ctx.navigate;
  el.status = h('p', {class: 'status mono', role: 'status'});
  el.kpis = h('div', {class: 'kpi-row'}); el.dist = h('div', {class: 'chart-grid'}); el.corr = h('div'); el.ward = h('div'); el.rank = h('ol', {class: 'rank-list'}); el.scatter = h('div'); el.full = h('div');
  el.exportCsv = h('button', {class: 'btn sm', type: 'button', disabled: true, on: {click: () => {
    if (!current.length) return toast('Chưa có thống kê để xuất.', {error: true});
    download('MobileGIS_thong_ke_pixel.csv', toCsv(['dataset_id', 'code', 'name', 'year', 'index_name', 'sample_count', 'valid_count', 'coverage', 'minimum', 'q25', 'median', 'mean', 'q75', 'maximum', 'stddev', 'method', 'raster_sha256'], current));
  }}}, icon('download', 16), 'CSV thống kê đã lọc');
  el.exportSvg = h('button', {class: 'btn sm', type: 'button', disabled: true, on: {click: () => {
    const svgs = [...root.querySelectorAll('.chart-grid svg.ch')]; if (!svgs.length) return toast('Chưa có biểu đồ để tải.', {error: true});
    svgs.forEach((node, i) => download(`mobilegis_bieu_do_${i + 1}.svg`, chartToSvgText(node), 'image/svg+xml;charset=utf-8'));
  }}}, icon('download', 16), 'Biểu đồ SVG');
  root = h('div', {class: 'page stats-page'},
    h('header', {class: 'page-head'}, h('span', {class: 'eyebrow'}, 'Thống kê và phân tích'), h('h1', null, 'Thống kê môi trường theo xã/phường'),
      h('p', null, 'Tính trực tiếp từ pixel hợp lệ trong GeoTIFF và PostgreSQL, không suy ra từ trung bình xã/phường. Mọi kết quả kèm giới hạn của dữ liệu.')),
    buildFilters(), el.status, el.kpis,
    h('section', {class: 'block'}, h('h2', null, 'Phân bố'), el.dist, h('div', {class: 'export-row'}, el.exportCsv, el.exportSvg)),
    h('section', {class: 'block'}, h('h2', null, 'So sánh chuỗi các khu vực'), h('div', {class: 'card'}, el.ward)),
    h('section', {class: 'block two'}, h('div', null, h('h2', null, 'Khu vực giá trị cao'), h('div', {class: 'card'}, el.rank, h('p', {class: 'dock-help'}, 'Xếp theo giá trị chỉ số của năm đang chọn, không phải mức rủi ro đã kiểm định.'))),
      h('div', null, h('h2', null, 'LST và NDVI cùng mốc'), h('div', {class: 'card'}, el.scatter))),
    h('section', {class: 'block'}, h('h2', null, 'Tương quan trung bình xã/phường'), el.corr),
    h('section', {class: 'block'}, screeningCard()),
    h('section', {class: 'block'}, h('details', {class: 'card'}, h('summary', null, 'Bảng thống kê đầy đủ theo khu vực'), el.full)),
    h('section', {class: 'block'}, appendix()));
  section.append(root);
  stagger(root, ':scope > .page-head, :scope > .block');
}
export function show() { requestAnimationFrame(() => { Object.values(seg).forEach(s => s.place()); refresh(); }); }
export function hide() { clearCharts(); }
