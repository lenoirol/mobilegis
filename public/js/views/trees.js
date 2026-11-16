/* Tính lợi ích trồng cây xanh: nhập kịch bản trồng cây → tính ngay CO₂, O₂, sinh khối, bóng mát, nước mưa và giá trị quy đổi.
   Hàm tính nằm ở core/treecalc.js (dùng chung với app Android). Hệ số mặc định là VÍ DỤ của đề bài, không phải số đo tại TP.HCM. */
import {h, mount, icon} from '../core/dom.js';
import {data} from '../core/data.js';
import {fmt, pct, download, toCsv} from '../core/format.js';
import {segmented} from '../ui/seg.js';
import {lineChart} from '../ui/charts.js';
import {PARAMS, GROUPS, SCENARIOS, SOURCES, compute, defaults, resultRows, shareOfArea, shortMoney} from '../core/treecalc.js';

const KEY = 'mg-trees';
const S = {plans: {A: defaults(), B: {...defaults(), N: 2000}}, active: 'A', compare: false, scenario: 'all', code: ''};
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) { /* bỏ qua: chỉ là tiện ích nhớ lần nhập trước */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) { /* trình duyệt chặn lưu */ } };

let root, geo = null, el = {}, seg = {};
const use = () => SCENARIOS.find(s => s.key === S.scenario)?.use || SCENARIOS[0].use;
const ward = () => geo?.features.find(f => f.id === S.code || f.properties.code === S.code);
const num = (v, d = 0) => fmt(v, d);

function inputs() {
  const plan = S.plans[S.active];
  return GROUPS.map(g => h('fieldset', {class: 'card tc-group'}, h('legend', null, g.title),
    ...PARAMS.filter(p => p.group === g.key).map(p => {
      const input = h('input', {class: 'input', type: 'number', inputMode: 'decimal', min: p.min, max: p.max, step: p.step, value: plan[p.key], 'aria-label': p.label,
        on: {input: e => { const v = e.target.value === '' ? p.def : Number(e.target.value); plan[p.key] = v; save(); results(); }}});
      return h('label', {class: 'field tc-field'},
        h('span', null, h('b', {class: 'tc-sym'}, p.sym), ' ', p.label),
        h('span', {class: 'tc-in'}, input, h('em', null, p.unit)),
        p.hint && h('small', {class: 'field-hint'}, p.hint));
    })));
}

function stat(row, big = false) {
  return h('div', {class: 'tc-stat' + (big ? ' big' : '') + (row.money ? ' money' : ''), title: row.formula},
    h('small', null, h('b', null, row.sym), ' · ', row.label),
    h('strong', null, row.money ? shortMoney(row.value) : `${num(row.value, row.digits)} ${row.unit}`),
    h('span', {class: 'tc-formula'}, row.formula, row.money ? ` = ${num(row.value, 0)} đồng` : ''));
}

function results() {
  const r = compute(S.plans[S.active], use()), rows = resultRows(r), by = Object.fromEntries(rows.map(x => [x.key, x]));
  const w = ward(), share = w ? shareOfArea(r.shade, w.properties.area_km2_source) : null;
  const scen = SCENARIOS.find(s => s.key === S.scenario);
  mount(el.mini, h('small', null, 'Tổng'), h('b', null, shortMoney(r.net)), h('small', null, `· CO₂ ${num(r.co2, 1)} tấn`), h('span', null, 'Kết quả ↓'));
  mount(el.problems, r.problems.length ? h('div', {class: 'callout warn'}, 'Đã tự chỉnh: ', r.problems.join('; '), '.') : null);
  mount(el.result,
    h('div', {class: 'tc-hero'}, stat(by.net, true), h('p', {class: 'small muted'}, scen.note)),
    h('h3', null, 'Lợi ích môi trường'),
    h('div', {class: 'tc-grid'}, ...['co2', 'o2', 'biomass', 'shade', 'water'].map(k => stat(by[k]))),
    h('h3', null, 'Giá trị quy đổi'),
    h('div', {class: 'tc-grid'}, ...['G1', 'G2', 'G3'].map(k => h('div', {class: r.use[k] ? '' : 'tc-off'}, stat(by[k]), !r.use[k] && h('span', {class: 'tc-tag'}, 'không cộng vào tổng ở kịch bản này'))),
      ...(r.invest + r.care > 0 ? ['invest', 'care'].map(k => stat(by[k])) : [])),
    r.breakEven ? h('p', {class: 'callout ok'}, `Với các chi phí đã nhập, lợi ích lũy kế bù được chi phí từ năm thứ ${r.breakEven}.`)
      : r.invest + r.care > 0 ? h('p', {class: 'callout warn'}, `Trong ${r.values.T} năm, lợi ích lũy kế chưa bù được chi phí đã nhập.`) : null,
    w && h('div', {class: 'callout'}, h('b', null, w.properties.full_name), `: diện tích khoảng ${num(w.properties.area_km2_source, 2)} km². `,
      `${num(r.values.N)} cây tương đương ${num(r.values.N / w.properties.area_km2_source, 0)} cây/km²; bóng mát ${num(r.shade)} m² bằng ${pct(share, share < .01 ? 2 : 1)} diện tích khu vực.`,
      share > 1 ? ' Con số vượt diện tích khu vực — hãy giảm số cây hoặc diện tích tán.' : ''));
  // Đồ thị lũy kế theo năm
  const xs = r.byYear.map(y => y.year), net = r.invest + r.care > 0;
  const series = [{id: 'A', name: net ? 'Lợi ích ròng lũy kế' : 'Giá trị lũy kế', color: '#23756a', points: r.byYear.map(y => ({x: y.year, y: (net ? y.net : y.gross) / 1e6, lines: [`CO₂: ${num(y.co2, 1)} tấn`]}))}];
  if (S.compare) {
    const other = S.active === 'A' ? 'B' : 'A', rb = compute(S.plans[other], use());
    if (rb.values.T === r.values.T) series.push({id: other, name: `Phương án ${other}`, short: `Phương án ${other}`, color: '#eb6834', dashed: true, points: rb.byYear.map(y => ({x: y.year, y: ((rb.invest + rb.care > 0) ? y.net : y.gross) / 1e6}))});
    series[0].name = series[0].short = `Phương án ${S.active}`;
  }
  mount(el.chart); const all = series.flatMap(s => s.points.map(p => p.y)), lo = Math.min(0, ...all), hi = Math.max(0, ...all);
  lineChart(el.chart, series, {xs, domain: [lo, hi + (hi - lo) * .12 || 1], unit: 'triệu đồng', label: 'Giá trị lũy kế theo năm', height: 220, yFormat: v => fmt(v, 0), showLabels: xs.length <= 12});
  mount(el.compare, S.compare ? compareTable() : null);
}

function compareTable() {
  const ra = compute(S.plans.A, use()), rb = compute(S.plans.B, use());
  const a = resultRows(ra), b = resultRows(rb);
  const params = PARAMS.filter(p => S.plans.A[p.key] !== S.plans.B[p.key]);
  const cell = row => row.money ? shortMoney(row.value) : `${num(row.value, row.digits)} ${row.unit}`;
  return h('div', {class: 'scroll card flat', style: {padding: 0}}, h('table', {class: 'tbl'},
    h('thead', null, h('tr', null, h('th', null, 'So sánh'), h('th', {class: 'num'}, 'Phương án A'), h('th', {class: 'num'}, 'Phương án B'))),
    h('tbody', null,
      ...params.map(p => h('tr', {class: 'tc-diff'}, h('th', {scope: 'row'}, `${p.sym} · ${p.label}`), h('td', {class: 'num'}, `${num(S.plans.A[p.key], p.step < 1 ? 2 : 0)} ${p.unit}`), h('td', {class: 'num'}, `${num(S.plans.B[p.key], p.step < 1 ? 2 : 0)} ${p.unit}`))),
      ...a.filter(x => !['invest', 'care'].includes(x.key) || ra.invest + ra.care + rb.invest + rb.care > 0).map((x, i) => h('tr', null, h('th', {scope: 'row'}, `${x.sym} · ${x.label}`), h('td', {class: 'num'}, cell(x)), h('td', {class: 'num'}, cell(b[i])))))));
}

function exportCsv() {
  const plans = S.compare ? ['A', 'B'] : [S.active], w = ward();
  const rows = plans.flatMap(name => {
    const r = compute(S.plans[name], use());
    return [...PARAMS.map(p => ({phuong_an: name, loai: 'he_so', ky_hieu: p.sym, ten: p.label, gia_tri: r.values[p.key], don_vi: p.unit, cong_thuc: ''})),
      ...resultRows(r).map(x => ({phuong_an: name, loai: 'ket_qua', ky_hieu: x.sym, ten: x.label, gia_tri: x.digits ? Math.round(x.value * 100) / 100 : Math.round(x.value), don_vi: x.unit, cong_thuc: x.formula}))];
  });
  rows.push({phuong_an: '', loai: 'ghi_chu', ky_hieu: '', ten: `Kịch bản: ${SCENARIOS.find(s => s.key === S.scenario).label}${w ? ' · khu vực: ' + w.properties.full_name : ''}`, gia_tri: '', don_vi: '', cong_thuc: 'Hệ số mặc định là giá trị ví dụ, không phải số đo tại TP.HCM'});
  download('loi_ich_trong_cay.csv', toCsv(['phuong_an', 'loai', 'ky_hieu', 'ten', 'gia_tri', 'don_vi', 'cong_thuc'], rows));
}

function renderInputs() { mount(el.inputs, ...inputs()); }

function build() {
  seg.scenario = segmented(SCENARIOS.map(s => ({value: s.key, label: s.label, title: s.note})), S.scenario, v => { S.scenario = v; save(); results(); }, {label: 'Kịch bản', layout: 'grid2'});
  seg.plan = segmented([{value: 'A', label: 'Phương án A'}, {value: 'B', label: 'Phương án B'}], S.active, v => { S.active = v; save(); renderInputs(); results(); }, {label: 'Phương án'});
  const planBox = h('div', {class: 'tc-plan', hidden: !S.compare}, seg.plan.el);
  const cmp = h('input', {type: 'checkbox', checked: S.compare, on: {change: e => { S.compare = e.target.checked; if (!S.compare) { S.active = 'A'; seg.plan.set('A'); renderInputs(); } planBox.hidden = !S.compare; seg.plan.place(); save(); results(); }}});
  const area = h('select', {class: 'select', 'aria-label': 'Khu vực', on: {change: e => { S.code = e.target.value; save(); results(); }}},
    h('option', {value: ''}, 'Không gắn với khu vực nào'),
    ...[...geo.features].sort((a, b) => a.properties.full_name.localeCompare(b.properties.full_name, 'vi')).map(f => h('option', {value: f.id, selected: f.id === S.code}, f.properties.full_name)));
  el.area = area;
  el.inputs = h('div', {class: 'tc-inputs'}); el.result = h('div', {class: 'tc-result'}); el.chart = h('div', {class: 'tc-chart'}); el.compare = h('div'); el.problems = h('div');
  el.mini = h('a', {class: 'tc-mini', href: '#', on: {click: e => { e.preventDefault(); el.result.scrollIntoView({behavior: 'smooth', block: 'start'}); }}});
  const field = (label, node) => h('label', {class: 'field'}, h('span', null, label), node);
  const reset = h('button', {class: 'btn sm', type: 'button', on: {click: () => { S.plans[S.active] = S.active === 'B' ? {...defaults(), N: 2000} : defaults(); save(); renderInputs(); results(); }}}, icon('sliders', 16), 'Về số ví dụ của đề bài');
  mount(root,
    h('header', {class: 'page-head'}, h('span', {class: 'eyebrow'}, 'Tiện ích'), h('h1', null, 'Tính lợi ích trồng cây xanh'),
      h('p', null, 'Nhập số cây, số năm và hệ số của cây, kết quả tính ngay: CO₂ hấp thụ, O₂ tạo ra, sinh khối, diện tích bóng mát, nước mưa giữ lại và giá trị quy đổi ra tiền.')),
    h('div', {class: 'callout'}, 'Số mặc định là ví dụ của đề bài để minh họa cách tính, không phải số đo tại TP.HCM. Hãy thay bằng hệ số của loài cây và giá thực tế. Công cụ không suy ra mức giảm nhiệt độ: bản đồ đo nhiệt độ bề mặt từ vệ tinh, chưa đủ cơ sở để quy đổi số cây thành độ C.'),
    h('div', {class: 'filters card'}, field('Kịch bản tính tổng', seg.scenario.el), field('Khu vực (không bắt buộc)', area),
      h('label', {class: 'check'}, cmp, 'So sánh hai phương án'), planBox),
    el.mini,
    h('div', {class: 'tc-layout'},
      h('section', {class: 'tc-left'}, h('h2', null, 'Thông số'), el.problems, el.inputs, h('div', {class: 'export-row'}, reset)),
      h('section', {class: 'tc-right'}, h('h2', null, 'Kết quả'), el.result,
        h('h3', null, 'Giá trị lũy kế theo năm'), h('div', {class: 'card chart-card'}, el.chart, h('p', {class: 'dock-help'}, 'Đơn vị: triệu đồng. Công thức của đề bài tuyến tính nên mỗi năm cộng thêm như nhau; cây thật hấp thụ ít lúc nhỏ và nhiều hơn khi lớn.')),
        el.compare,
        h('div', {class: 'export-row'}, h('button', {class: 'btn sm', type: 'button', on: {click: exportCsv}}, icon('download', 16), 'Tải CSV kết quả')))),
    h('section', {class: 'block'}, h('h2', null, 'Công thức và nguồn tham khảo'),
      h('div', {class: 'card tc-method'},
        h('ul', null,
          h('li', null, h('b', null, 'CO₂'), ' = N × C × T / 1000 (tấn) · ', h('b', null, 'O₂'), ' = CO₂ × 0,727 (tỉ lệ khối lượng 32/44: mỗi tấn CO₂ cây hấp thụ ứng với khoảng 0,727 tấn O₂ giải phóng khi quang hợp)'),
          h('li', null, h('b', null, 'B_tổng'), ' = N × B × T (kg) · ', h('b', null, 'S_tổng'), ' = N × S × f (m²) · ', h('b', null, 'V'), ' = N × R × T / 1000 (m³)'),
          h('li', null, h('b', null, 'G₁'), ' = CO₂ × P₁ · ', h('b', null, 'G₂'), ' = N × B × T × P₂ · ', h('b', null, 'G₃'), ' = V × P₃'),
          h('li', null, h('b', null, 'G_tổng'), ' = G₁ + G₂ + G₃ − C_đầu tư − C_bảo dưỡng, với C_đầu tư = N × c_đt và C_bảo dưỡng = N × c_bd × T'),
          h('li', null, 'Bóng mát S_tổng không quy ra tiền vì đề bài không có đơn giá; G₁ và G₂ cùng đến từ phần gỗ cây tích lũy nên kịch bản "Không tính trùng" bỏ G₂.')),
        h('p', {class: 'small muted'}, 'Nguồn của các khoảng tham khảo ghi dưới ô nhập:'),
        h('ol', {class: 'small'}, ...Object.values(SOURCES).map(s => h('li', null, s.text, ' ', h('a', {href: s.url, target: '_blank', rel: 'noopener'}, 'Mở nguồn')))))));
  renderInputs(); results();
  const scroller = root.closest('#pages') || window, onScroll = () => el.mini.classList.toggle('away', el.result.getBoundingClientRect().top < innerHeight - 120);
  scroller.addEventListener('scroll', onScroll, {passive: true}); onScroll();
  Object.values(seg).forEach(s => s.place());
}

export function init(section) {
  root = h('div', {class: 'page tree-page'}, h('div', {class: 'skeleton', style: {height: '320px'}}));
  section.append(root);
}
export async function show(params = {}) {
  if (params.ma) { S.code = params.ma; save(); }
  if (!geo) { geo = await data.geo(); build(); return; }
  if (el.area) { el.area.value = S.code; results(); }
}
