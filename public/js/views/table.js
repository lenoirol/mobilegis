/* Data table view: a clear detail table and an expert summary ("Bảng tổng").
   Never fills missing values (— = no data, never 0). Low-sample rows keep their numbers and are flagged. */
import {h, mount, icon} from '../core/dom.js';
import {data, indexRows} from '../core/data.js';
import {post, isAdmin, onSession, get, url, env} from '../core/api.js';
import {INDEX, INDICES, YEARS, SOURCES, CANONICAL_SOURCE, fmt, pct, dmy, normalize, valid, shortName, download, toCsv} from '../core/format.js';
import {segmented} from '../ui/seg.js';
import {toast} from '../ui/toast.js';
import {lineChart, barChart} from '../ui/charts.js';
import {stagger} from '../core/motion.js';

const ENOUGH = .5, LOW = .1, PAGE = 25;
const S = {view: 'detail', mode: 'real', source: CANONICAL_SOURCE, year: '2025', q: '', onlyEnough: false, sort: {key: 'name', dir: 1}, page: 0, minCov: .5, index: 'lst'};
const cache = {};
let root, body, nav, shownOnce = false, charts = [];

const quality = (row, k) => {
  if (!valid(row[k])) return 'missing';
  const c = row[k + '_coverage'];
  if (!valid(c)) return 'unknown';
  return c >= ENOUGH ? 'ok' : c >= LOW ? 'low' : 'sparse';
};
const minCoverage = row => Math.min(...INDICES.map(k => row[k + '_coverage'] ?? 0));
const dates = row => (row.dates || []).slice().sort();
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };

async function load() {
  const key = S.mode === 'real' ? 'real:' + S.source : S.mode;
  if (S.mode === 'demo') return data.demoPoints();
  if (!cache[key]) cache[key] = S.mode === 'real' ? await data.rows(S.source) : await data.userPoints();
  return cache[key];
}

function filtered(rows) {
  const q = normalize(S.q);
  const out = rows.filter(r => (S.year === 'all' || String(r.year) === S.year) && (!q || normalize(r.name).includes(q) || String(r.code || '').includes(q))
    && (S.mode !== 'real' || !S.onlyEnough || INDICES.every(k => quality(r, k) === 'ok')));
  const {key, dir} = S.sort, val = r => key === 'name' ? normalize(r.name) : key === 'coverage' ? minCoverage(r) : r[key];
  return out.sort((a, b) => { const x = val(a), y = val(b); return x == null ? 1 : y == null ? -1 : x < y ? -dir : x > y ? dir : 0; });
}

// ---- detail table ----------------------------------------------------------------------------------------------------
const TAG = {ok: 'Đủ mẫu', low: 'Ít mẫu', sparse: 'Rất ít mẫu', missing: 'Thiếu', unknown: 'Chưa rõ'};
function coverageCell(row) {
  const states = INDICES.map(k => quality(row, k));
  const worst = ['missing', 'sparse', 'low', 'unknown'].find(x => states.includes(x)) || 'ok';
  return h('td', {class: 'cov'}, h('span', {class: 'tag ' + (worst === 'unknown' ? 'low' : worst)}, TAG[worst]), valid(row.lst_coverage) ? h('small', {class: 'mono'}, INDICES.map(k => pct(row[k + '_coverage'])).join(' · ')) : null);
}
function headerRow(columns) {
  return h('tr', null, ...columns.map(c => {
    const th = h('th', {scope: 'col', class: c.num ? 'num' : '', title: c.hint || ''});
    if (c.sort) {
      th.setAttribute('aria-sort', S.sort.key === c.sort ? (S.sort.dir > 0 ? 'ascending' : 'descending') : 'none');
      th.append(h('button', {type: 'button', class: 'th-sort', on: {click: () => { S.sort = {key: c.sort, dir: S.sort.key === c.sort ? -S.sort.dir : 1}; S.page = 0; render(); }}}, c.label, h('span', {class: 'arrow', 'aria-hidden': 'true'}, S.sort.key === c.sort ? (S.sort.dir > 0 ? '▲' : '▼') : '↕')));
    } else th.textContent = c.label;
    return th;
  }));
}
function detailTable(rows, onEdit, onDelete) {
  const real = S.mode === 'real', admin = isAdmin();
  const columns = real
    ? [{label: 'Khu vực', sort: 'name'}, {label: 'Năm', sort: 'year', num: 1}, ...INDICES.map(k => ({label: INDEX[k].label + (INDEX[k].unit ? ' ' + INDEX[k].unit : '') + (INDEX[k].experimental ? ' *' : ''), sort: k, num: 1, hint: INDEX[k].name})),
       {label: 'Độ phủ mẫu', sort: 'coverage', hint: 'Tỷ lệ ô ảnh hợp lệ của nhiệt độ, độ xanh và độ khô'}, {label: 'Ngày ảnh'}, {label: ''}]
    : [{label: 'Khu vực', sort: 'name'}, {label: 'Năm', sort: 'year', num: 1}, ...INDICES.map(k => ({label: INDEX[k].label, sort: k, num: 1})), {label: 'Nguồn'}, ...(S.mode === 'demo' && admin ? [{label: 'Thao tác'}] : [])];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  S.page = Math.min(S.page, pages - 1);
  const tbody = h('tbody');
  for (const r of rows.slice(S.page * PAGE, S.page * PAGE + PAGE)) {
    const tr = h('tr');
    tr.append(h('th', {scope: 'row', class: 'name'}, r.name || '', real ? h('small', {class: 'mono'}, 'Mã ' + r.code) : null), h('td', {class: 'num mono'}, String(r.year)));
    for (const k of INDICES) {
      if (real) {
        const q = quality(r, k);
        tr.append(h('td', {class: 'num mono val' + (q === 'ok' ? '' : ' flag-' + q), title: q === 'low' || q === 'sparse' ? `Ít pixel hợp lệ (${pct(r[k + '_coverage'])}): số có thật nhưng chưa đại diện cả khu vực.` : ''}, q === 'missing' ? '—' : fmt(r[k], INDEX[k].digits)));
      } else tr.append(h('td', {class: 'num mono val'}, fmt(r[k], INDEX[k].digits)));
    }
    if (real) {
      const d = dates(r);
      tr.append(coverageCell(r), h('td', {class: 'dates'}, d.length ? (d[0] === d.at(-1) ? dmy(d[0]) : `${dmy(d[0])} – ${dmy(d.at(-1))}`) : '', d.length ? h('small', {class: 'mono'}, `${(r.scene_ids || d).length} cảnh`) : null),
        h('td', {class: 'go'}, h('a', {class: 'icon-btn sm', href: `#/ban-do?khu-vuc=${r.code}&nam=${r.year}`, title: 'Xem trên bản đồ', 'aria-label': 'Xem ' + r.name + ' trên bản đồ'}, icon('map', 16))));
    } else {
      tr.append(h('td', {class: 'src'}, r.source || ''));
      if (S.mode === 'demo' && admin) tr.append(h('td', {class: 'actions'}, h('button', {class: 'btn sm', type: 'button', on: {click: () => onEdit(r)}}, 'Sửa'), h('button', {class: 'btn sm danger', type: 'button', on: {click: () => onDelete(r)}}, 'Xóa')));
    }
    tbody.append(tr);
  }
  if (!rows.length) tbody.append(h('tr', null, h('td', {colSpan: columns.length, class: 'empty'}, 'Không có dòng nào khớp bộ lọc.')));
  const pager = h('div', {class: 'pager'},
    h('button', {class: 'btn sm', type: 'button', disabled: S.page === 0, on: {click: () => { S.page--; render(); }}}, '‹ Trước'),
    h('span', {class: 'mono'}, `Trang ${S.page + 1}/${pages} · ${rows.length.toLocaleString('vi-VN')} dòng`),
    h('button', {class: 'btn sm', type: 'button', disabled: S.page >= pages - 1, on: {click: () => { S.page++; render(); }}}, 'Sau ›'));
  return h('div', null, h('div', {class: 'scroll card flat'}, h('table', {class: 'tbl'}, h('caption', {class: 'sr-only'}, 'Bảng số liệu nhiệt độ, độ xanh và độ khô'), h('thead', null, headerRow(columns)), tbody)), pager);
}

// ---- expert summary -----------------------------------------------------------------------------------------------------------------
function summarize(rows, k, year) {
  const have = rows.filter(r => r.year === year && valid(r[k])), used = have.filter(r => (r[k + '_coverage'] ?? 0) >= S.minCov);
  const values = used.map(r => r[k]), weights = used.reduce((s, r) => s + (r[k + '_pixels'] || 0), 0);
  const sorted = [...used].sort((a, b) => a[k] - b[k]);
  return {have: have.length, used: used.length, weighted: weights ? used.reduce((s, r) => s + r[k] * (r[k + '_pixels'] || 0), 0) / weights : null,
    mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, median: median(values), min: sorted[0], max: sorted.at(-1)};
}
function summaryView(rows) {
  const years = [...new Set(rows.map(r => r.year))].sort(), units = new Set(rows.map(r => r.code)).size;
  const wrap = h('div', {class: 'summary'});
  // trend cards: weighted regional mean per year, one chart per index
  const trend = h('div', {class: 'trend-grid'});
  charts.forEach(c => c.destroy()); charts = [];
  for (const k of INDICES) {
    const idx = INDEX[k], host = h('div', {class: 'trend-chart'});
    const points = years.map(y => ({x: y, y: summarize(rows, k, y).weighted, lines: [`${summarize(rows, k, y).used}/${summarize(rows, k, y).have} khu vực đủ mẫu`]}));
    trend.append(h('article', {class: 'card trend-card'}, h('div', {class: 'trend-top'}, h('span', {class: 'eyebrow'}, idx.label + (idx.experimental ? ' · thử nghiệm' : '')), h('b', null, idx.name)), host));
    requestAnimationFrame(() => charts.push(lineChart(host, [{id: k, name: 'Trung bình toàn vùng', color: '#0e0e0c', points}], {xs: years, compact: true, unit: idx.unit, label: `Trung bình toàn vùng ${idx.name} theo năm`, yFormat: v => fmt(v, idx.digits), minPad: k === 'lst' ? 1 : .03})));
  }
  wrap.append(h('div', null, h('h2', null, 'Xu hướng toàn vùng'), h('p', {class: 'muted'}, `Trung bình theo pixel hợp lệ của các khu vực đủ mẫu (≥ ${Math.round(S.minCov * 100)}%), ${units} khu vực.`)), trend);
  // yearly table
  const head = headerRow([{label: 'Chỉ số'}, {label: 'Năm', num: 1}, {label: 'Khu vực đủ mẫu', num: 1, hint: 'Đạt ngưỡng độ phủ / có số liệu'}, {label: 'TB toàn vùng', num: 1, hint: 'Trung bình có trọng số theo số pixel hợp lệ'}, {label: 'TB các khu vực', num: 1}, {label: 'Trung vị', num: 1}, {label: 'Thấp nhất'}, {label: 'Cao nhất'}]);
  const tbody = h('tbody');
  for (const k of INDICES) years.forEach((year, n) => {
    const s = summarize(rows, k, year), idx = INDEX[k];
    const ext = r => h('td', null, r ? [h('b', {class: 'mono'}, fmt(r[k], idx.digits)), h('small', null, r.name)] : '');
    const tr = h('tr', {class: n === 0 ? 'group-start' : ''});
    if (n === 0) tr.append(h('th', {scope: 'rowgroup', rowSpan: years.length, class: 'idx-cell'}, h('b', null, idx.label), h('small', null, idx.name + (idx.unit ? ` (${idx.unit})` : ''))));
    tr.append(h('td', {class: 'num mono'}, String(year)), h('td', {class: 'num mono'}, `${s.used}/${s.have}`), h('td', {class: 'num mono strong'}, fmt(s.weighted, idx.digits)), h('td', {class: 'num mono'}, fmt(s.mean, idx.digits)), h('td', {class: 'num mono'}, fmt(s.median, idx.digits)), ext(s.min), ext(s.max));
    tbody.append(tr);
  });
  wrap.append(h('div', null, h('h2', null, 'Tổng hợp theo năm'), h('div', {class: 'scroll card flat flat-top'}, h('table', {class: 'tbl sum'}, h('thead', null, head), tbody))));
  // ranking
  const year = S.year === 'all' ? years.at(-1) : +S.year, idx = INDEX[S.index];
  const eligible = rows.filter(r => r.year === year && valid(r[S.index]) && (r[S.index + '_coverage'] ?? 0) >= S.minCov).sort((a, b) => b[S.index] - a[S.index]);
  const item = r => ({label: shortName(r.name), value: r[S.index], note: [`Mã ${r.code}`, `Độ phủ ${pct(r[S.index + '_coverage'])}`], color: '#0e0e0c'});
  const topHost = h('div'), lowHost = h('div');
  wrap.append(h('div', null, h('h2', null, `Xếp hạng · ${idx.label} · năm ${year}`), h('p', {class: 'muted'}, 'Xếp theo giá trị chỉ số, không phải mức rủi ro đã kiểm định.')),
    h('div', {class: 'rank-grid'}, h('article', {class: 'card'}, h('h3', null, '10 khu vực cao nhất'), topHost), h('article', {class: 'card'}, h('h3', null, '10 khu vực thấp nhất'), lowHost)));
  requestAnimationFrame(() => { charts.push(barChart(topHost, eligible.slice(0, 10).map(item), {digits: idx.digits, unit: idx.unit, label: 'Mười khu vực cao nhất'}), barChart(lowHost, eligible.slice(-10).reverse().map(item), {digits: idx.digits, unit: idx.unit, label: 'Mười khu vực thấp nhất'})); });
  wrap.append(h('p', {class: 'callout'}, '“TB toàn vùng” là trung bình theo pixel hợp lệ của các khu vực đủ mẫu, không phải trung bình khí hậu năm. Số liệu là mùa khô theo ngày ảnh từng khu vực; Độ khô là chỉ số thử nghiệm; chênh lệch giữa các năm chưa là xu thế đã kiểm định.'));
  return wrap;
}

// ---- demo points (admin) ------------------------------------------------------------------------------------------------------------
function editorDialog(record) {
  const fields = [['name', 'Tên khu vực', 'text'], ['lat', 'Vĩ độ', 'number'], ['lon', 'Kinh độ', 'number'], ['year', 'Năm (2020–2025)', 'number'], ['lst', 'Nhiệt độ (°C)', 'number'], ['ndvi', 'Độ xanh (−1 → 1)', 'number'], ['tvdi', 'Độ khô (0 → 1)', 'number'], ['source', 'Nguồn', 'text']];
  const inputs = Object.fromEntries(fields.map(([k, , type]) => [k, h('input', {class: 'input', type, step: type === 'number' ? 'any' : null, required: true, value: record?.[k] ?? (k === 'source' ? 'Thực hành' : '')})]));
  const error = h('p', {class: 'form-error', role: 'alert'});
  const dialog = h('dialog', null, h('form', {class: 'dlg-form', method: 'dialog', on: {submit: async e => {
    e.preventDefault();
    try {
      await post('/api/save', {...Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value])), id: record?.id});
      dialog.close(); dialog.remove(); toast('Đã lưu điểm thực hành.'); render();
    } catch (err) { error.textContent = err.message; }
  }}}, h('h2', null, record ? 'Sửa điểm thực hành' : 'Thêm điểm thực hành'),
    h('div', {class: 'form-grid'}, ...fields.map(([k, label]) => h('label', {class: 'field'}, h('span', null, label), inputs[k]))), error,
    h('div', {class: 'dlg-actions'}, h('button', {class: 'btn', type: 'button', on: {click: () => { dialog.close(); dialog.remove(); }}}, 'Hủy'), h('button', {class: 'btn primary', type: 'submit'}, 'Lưu'))));
  document.body.append(dialog); dialog.showModal();
}
async function removeRecord(r) {
  if (!confirm(`Xóa điểm "${r.name}", năm ${r.year}?`)) return;
  try { await post('/api/delete', {id: r.id}); toast('Đã xóa điểm thực hành.'); render(); } catch (e) { toast(e.message, {error: true}); }
}
async function importCsv(file) {
  if (!file) return;
  try {
    if (file.size > 1_800_000) throw new Error('CSV vượt 1,8 MB.');
    if (!confirm('Nhập vào bộ điểm thực hành? Dòng trùng tên và năm sẽ được cập nhật.')) return;
    await post('/api/import', {csv: await file.text()}); toast('Đã nhập CSV điểm thực hành.'); render();
  } catch (e) { toast(e.message, {error: true}); }
}

// ---- shell ---------------------------------------------------------------------------------------------------------------------------------------
let modeSeg, viewSeg, yearSelect, searchInput, onlyBox, indexSeg, covSelect, sourceSeg, controlsHost, actionsHost;
function buildShell(section) {
  viewSeg = segmented([{value: 'detail', label: 'Bảng chi tiết'}, {value: 'summary', label: 'Bảng tổng · chuyên gia'}], 'detail', v => { S.view = v; render(); }, {label: 'Kiểu bảng'});
  modeSeg = segmented([{value: 'real', label: 'Landsat · 167 khu vực'}, {value: 'user', label: 'CSV nhóm · 4 điểm'}, {value: 'demo', label: 'Điểm thực hành'}], 'real', v => { S.mode = v; S.page = 0; S.sort = {key: 'name', dir: 1}; if (v !== 'real') S.view = 'detail'; render(); }, {label: 'Bộ dữ liệu', layout: 'row stack-m'});
  yearSelect = h('select', {class: 'select', 'aria-label': 'Năm', on: {change: () => { S.year = yearSelect.value; S.page = 0; render(); }}}, h('option', {value: 'all'}, 'Tất cả năm'), ...YEARS.map(y => h('option', {value: y}, 'Năm ' + y)));
  searchInput = h('input', {class: 'input', type: 'search', placeholder: 'Tên hoặc mã khu vực…', 'aria-label': 'Tìm khu vực'});
  let timer; searchInput.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { S.q = searchInput.value; S.page = 0; render(); }, 160); });
  onlyBox = h('input', {type: 'checkbox', on: {change: () => { S.onlyEnough = onlyBox.checked; S.page = 0; render(); }}});
  indexSeg = segmented(INDICES.map(k => ({value: k, label: INDEX[k].label})), 'lst', v => { S.index = v; render(); }, {label: 'Xếp hạng theo'});
  covSelect = h('select', {class: 'select', 'aria-label': 'Ngưỡng độ phủ', on: {change: () => { S.minCov = +covSelect.value; render(); }}}, ...[[.1, '≥ 10%'], [.5, '≥ 50% · khuyến nghị'], [.8, '≥ 80%']].map(([v, l]) => h('option', {value: v, selected: v === S.minCov}, l)));
  sourceSeg = segmented(Object.values(SOURCES).map(s => ({value: s.id, label: s.label})), CANONICAL_SOURCE, v => { S.source = v; S.page = 0; render(); }, {label: 'Nguồn dữ liệu'});
  controlsHost = h('div', {class: 'filters card flat'});
  actionsHost = h('div', {class: 'table-actions'});
  body = h('div', {class: 'table-body'});
  root = h('div', {class: 'page table-page'},
    h('header', {class: 'page-head'}, h('span', {class: 'eyebrow'}, 'Bảng số liệu'), h('h1', null, 'Số liệu nhiệt độ, độ xanh, độ khô theo xã/phường'),
      h('p', null, 'Mọi số đều kèm độ phủ mẫu. Ô trống nghĩa là không có số liệu, không phải 0.')), viewSeg.el, controlsHost, actionsHost, body);
  section.append(root);
}
const field = (label, node) => h('label', {class: 'field'}, h('span', null, label), node);

let ticket = 0;
async function render() {
  if (!root) return;
  const mine = ++ticket;
  S.view = S.mode === 'real' ? S.view : 'detail';
  viewSeg.set(S.view); viewSeg.el.hidden = S.mode !== 'real'; modeSeg.set(S.mode); modeSeg.setDisabled(env.api ? [] : ['demo']); yearSelect.value = S.year; sourceSeg.set(S.source); indexSeg.set(S.index);
  modeSeg.el.classList.add('admin-only');
  mount(controlsHost, modeSeg.el, field('Tìm khu vực', searchInput), field('Năm', yearSelect),
    S.mode === 'real' && S.view === 'summary' ? [field('Xếp hạng theo', indexSeg.el), field('Ngưỡng độ phủ', covSelect)] : null,
    S.mode === 'real' && S.view === 'detail' ? h('label', {class: 'check'}, onlyBox, 'Chỉ khu vực đủ dữ liệu (≥ 50% ảnh dùng được)') : null,
    S.mode === 'real' ? h('details', {class: 'adv admin-only'}, h('summary', null, 'Nguồn dữ liệu · nâng cao'), sourceSeg.el) : null);
  onlyBox.checked = S.onlyEnough; requestAnimationFrame(() => { modeSeg.place(); viewSeg.place(); sourceSeg.place(); indexSeg.place(); });
  body.classList.add('loading');
  let rows;
  try { rows = await load(); }
  catch (error) { if (mine === ticket) mount(body, h('div', {class: 'callout err', role: 'alert'}, error.message)); body.classList.remove('loading'); return; }
  if (mine !== ticket) return;
  body.classList.remove('loading');
  const shown = filtered(rows), real = S.mode === 'real';
  const hint = real ? 'Ô nền vàng là khu vực ít pixel hợp lệ: số vẫn là số thật nhưng chưa đại diện cả khu vực. * Độ khô là chỉ số thử nghiệm.'
    : S.mode === 'user' ? 'CSV nhóm cung cấp: 24 dòng tại 4 điểm, giữ nguyên số liệu; không phải trung bình xã/phường.' : 'Điểm thực hành do quản trị viên nhập; không phải số liệu nghiên cứu.';
  const exportBtn = h('button', {class: 'btn primary', type: 'button', on: {click: () => {
    if (!shown.length) return toast('Không có dòng nào để xuất.', {error: true});
    const cols = real ? ['code', 'name', 'year', 'lst', 'ndvi', 'tvdi', 'lst_coverage', 'ndvi_coverage', 'tvdi_coverage', 'dates'] : ['name', 'year', 'lst', 'ndvi', 'tvdi', 'source'];
    download('mobilegis_bang_so_lieu.csv', toCsv(cols, shown));
  }}}, icon('download', 16), 'Xuất bảng đang xem (CSV)');
  mount(actionsHost, exportBtn,
    S.mode === 'demo' ? h('button', {class: 'btn admin-only', type: 'button', on: {click: () => editorDialog()}}, icon('plus', 16), 'Thêm điểm') : null,
    S.mode === 'demo' ? h('label', {class: 'btn admin-only', for: 'importFile'}, icon('download', 16), 'Nhập CSV', h('input', {id: 'importFile', type: 'file', accept: '.csv', hidden: true, on: {change: e => { importCsv(e.target.files[0]); e.target.value = ''; }}})) : null,
    S.mode === 'demo' && !isAdmin() ? h('span', {class: 'small muted'}, 'Chỉ quản trị viên được thêm/sửa/xóa điểm thực hành. ', env.api ? h('a', {href: url('login.html')}, 'Đăng nhập') : null) : null);
  mount(body, h('p', {class: 'callout'}, hint),
    S.view === 'summary' && real ? summaryView(rows) : [h('p', {class: 'count mono'}, `${shown.length.toLocaleString('vi-VN')} dòng`), detailTable(shown, editorDialog, removeRecord)]);
  if (!shownOnce || S.view === 'summary') { stagger(body); shownOnce = true; }
}

export function init(section, ctx) {
  nav = ctx.navigate;
  buildShell(section);
  onSession(() => root && render());
  return render();
}
export function show(params = {}) {
  if (params.q != null && params.q !== S.q) { S.q = params.q; searchInput && (searchInput.value = params.q); S.page = 0; }
  else if (!params.q && S.q && searchInput) { /* keep the last search */ }
  S.year = S.year;
  render();
}
