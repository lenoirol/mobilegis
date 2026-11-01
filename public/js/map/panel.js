/* Left panel: ranked list of the 167 communes and the threshold filter (e.g. LST > 40).
   Order (teacher's request): LST high → low, NDVI low → high, TVDI high → low.
   Only communes with sample coverage ≥ 50 % are ranked; the rest are listed at the end as "chưa đủ dữ liệu", never ranked. */
import {h, mount, icon} from '../core/dom.js';
import {INDEX, INDICES, fmt, colorOf, download, toCsv} from '../core/format.js';

const policy = window.ViewerPolicy;
const ORDER = {lst: -1, ndvi: 1, tvdi: -1};   // -1 = descending
const ORDER_TEXT = {lst: 'cao → thấp', ndvi: 'thấp → cao', tvdi: 'cao → thấp'};
const DEFAULTS = {lst: {op: '>', val: 40}, ndvi: {op: '<', val: 0.2}, tvdi: {op: '>', val: 0.8}};

/** Codes that satisfy every active condition in `year`. A commune without adequate data for a condition never matches it. */
export function matching(filters, rows, codes, year) {
  const active = INDICES.filter(k => filters[k]?.on);
  if (!active.length) return null;
  return new Set(codes.filter(code => active.every(k => {
    const row = rows.get(code, year), f = filters[k];
    if (!policy.eligible(row, k)) return false;
    return f.op === '>' ? row[k] > f.val : row[k] < f.val;
  })));
}

export function createPanel(host, {geo, rows, ranges, store, onPick}) {
  const names = new Map(geo.features.map(f => [f.properties.code, f.properties.full_name || f.properties.name]));
  const codes = [...names.keys()];
  let onlyMatches = false;

  const tabs = h('div', {class: 'panel-tabs', role: 'group', 'aria-label': 'Xếp hạng theo chỉ số'});
  const filterBox = h('details', {class: 'filter-box', open: !matchMedia('(max-width: 900px)').matches});
  const meta = h('div', {class: 'rank-meta'});
  const list = h('div', {class: 'rank-list', role: 'list'});
  const title = h('div', null, h('h2', null, 'Xếp hạng 167 xã/phường'), h('div', {class: 'sub'}));
  const csv = h('button', {class: 'btn sm ghost', type: 'button', title: 'Tải danh sách đang xem (CSV)', on: {click: exportCsv}}, icon('download', 16), 'CSV');
  const close = h('button', {class: 'btn sm ghost', type: 'button', 'aria-label': 'Ẩn bảng xếp hạng', on: {click: () => store.set({panel: false})}}, icon('x', 16));
  mount(host, h('div', {class: 'panel-head'}, title, h('div', {style: {display: 'flex', gap: '2px'}}, csv, close)), tabs, filterBox, meta, list);

  // ---- threshold filter (built once; later updates only sync values, so dragging a slider is never interrupted) ----
  const rowsUi = {};
  function filterRow(k) {
    const spec = INDEX[k], f = store.get().filters[k], r = ranges[k];
    const step = spec.digits === 1 ? 0.1 : 0.01;
    const lo = Math.floor(r.min * 10) / 10, hi = Math.ceil(r.max * 10) / 10;
    const on = h('input', {type: 'checkbox', checked: f.on, on: {change: () => patch({on: on.checked})}});
    const op = h('select', {class: 'select', 'aria-label': `Điều kiện ${spec.code}`, on: {change: () => patch({op: op.value, on: true})}},
      h('option', {value: '>', selected: f.op === '>'}, '>'), h('option', {value: '<', selected: f.op === '<'}, '<'));
    const range = h('input', {type: 'range', min: lo, max: hi, step, value: f.val, 'aria-label': `Ngưỡng ${spec.code}`, on: {input: () => { num.value = range.value; patch({val: +range.value, on: true}); }}});
    const num = h('input', {class: 'input', type: 'number', min: lo, max: hi, step, value: f.val, 'aria-label': `Giá trị ngưỡng ${spec.code}`, on: {change: () => { if (num.value === '') return; range.value = num.value; patch({val: +num.value, on: true}); }}});
    function patch(p) { const all = store.get().filters; store.set({filters: {...all, [k]: {...all[k], ...p}}}); }
    const row = h('div', {class: 'f-row' + (f.on ? '' : ' off'), dataset: {index: k}},
      h('label', {class: 'check'}, on, `${spec.code} · ${spec.label}${spec.unit ? ' (' + spec.unit + ')' : ''}`), h('span'),
      h('div', {class: 'f-ctrl', on: {pointerdown: () => { if (!on.checked) patch({on: true}); }}}, op, range, num));
    rowsUi[k] = {row, on, op, range, num};
    return row;
  }
  const count = h('span', {class: 'count'});
  const onlyBox = h('input', {type: 'checkbox', on: {change: e => { onlyMatches = e.target.checked; renderList(); }}});
  const resetBtn = h('button', {class: 'btn sm ghost', type: 'button', on: {click: () => store.set({filters: Object.fromEntries(INDICES.map(k => [k, {...DEFAULTS[k], on: false}]))})}}, 'Bỏ lọc');
  const note = h('p', {class: 'small muted', style: {margin: 0}});
  mount(filterBox, h('summary', null, h('span', null, 'Lọc theo ngưỡng'), count), ...INDICES.map(filterRow),
    h('div', {class: 'f-actions'}, h('label', {class: 'check'}, onlyBox, 'Chỉ hiện khu vực thỏa'), resetBtn), note);
  function renderFilters() {
    const s = store.get(), m = matching(s.filters, rows, codes, s.year);
    for (const k of INDICES) {
      const f = s.filters[k], ui = rowsUi[k];
      ui.row.classList.toggle('off', !f.on); ui.on.checked = f.on; ui.op.value = f.op;
      if (document.activeElement !== ui.num) ui.num.value = f.val;
      if (document.activeElement !== ui.range) ui.range.value = f.val;
    }
    count.textContent = m ? `${m.size}/167 thỏa` : 'Chưa bật';
    onlyBox.disabled = !m; if (!m) { onlyBox.checked = false; onlyMatches = false; }
    resetBtn.disabled = !m;
    note.textContent = `Áp dụng cho năm ${s.year}; khu vực có độ phủ mẫu dưới 50% không được tính là thỏa. Các khu vực không thỏa được làm mờ trên bản đồ.`;
  }

  // ---- ranked list ----
  function ranking(k, year) {
    const ok = [], low = [];
    for (const code of codes) { const row = rows.get(code, year); (policy.eligible(row, k) ? ok : low).push({code, row}); }
    ok.sort((a, b) => ORDER[k] * (a.row[k] - b.row[k]) || names.get(a.code).localeCompare(names.get(b.code), 'vi'));
    low.sort((a, b) => names.get(a.code).localeCompare(names.get(b.code), 'vi'));
    return {ok, low};
  }
  function item({code, row}, rank, k, m, s) {
    const spec = INDEX[k], ok = rank != null, v = row?.[k], r = ranges[k];
    const width = ok ? Math.max(4, Math.min(100, (v - r.min) / (r.max - r.min) * 100)) : 0;
    return h('button', {class: 'rank-item' + (ok ? '' : ' low') + (m && !m.has(code) ? ' dim' : ''), type: 'button', role: 'listitem', dataset: {code},
      'aria-current': String(s.selected === code), on: {click: () => onPick(code)}},
      h('span', {class: 'r'}, ok ? rank : '–'),
      h('span', {class: 'n'}, h('b', null, names.get(code)), h('i', null, ok && h('span', {style: {width: width + '%', background: colorOf(v, k)}}))),
      h('span', {class: 'v'}, ok ? [h('em', {style: {background: colorOf(v, k)}}), fmt(v, spec.digits)] : (Number.isFinite(row?.[`${k}_coverage`]) ? `phủ ${Math.round(row[`${k}_coverage`] * 100)}%` : 'không có')));
  }
  function renderList() {
    const s = store.get(), k = s.index, spec = INDEX[k], m = matching(s.filters, rows, codes, s.year);
    const {ok, low} = ranking(k, s.year);
    const keep = x => !onlyMatches || !m || m.has(x.code);
    title.querySelector('.sub').textContent = `${spec.code} ${ORDER_TEXT[k]} · năm ${s.year}${spec.experimental ? ' · TVDI thử nghiệm' : ''}`;
    mount(meta, h('span', null, `${ok.length} khu vực đủ dữ liệu được xếp hạng`), h('span', null, low.length ? `${low.length} chưa đủ dữ liệu` : ''));
    const ranked = ok.map((x, i) => [x, i + 1]).filter(([x]) => keep(x));
    mount(list, ...ranked.map(([x, rank]) => item(x, rank, k, m, s)),
      low.filter(keep).length ? [h('div', {class: 'rank-group'}, 'Chưa đủ dữ liệu · độ phủ mẫu < 50% · không xếp hạng'), ...low.filter(keep).map(x => item(x, null, k, m, s))] : null,
      !ranked.length && !low.filter(keep).length ? h('p', {class: 'small muted', style: {padding: '12px'}}, 'Không có khu vực nào thỏa điều kiện.') : null);
  }
  function renderTabs() {
    const s = store.get();
    mount(tabs, ...INDICES.map(k => h('button', {type: 'button', 'aria-pressed': String(k === s.index), on: {click: () => store.set({index: k})}}, `${INDEX[k].code} ${ORDER_TEXT[k].replace(' → ', '→')}`)));
  }
  function exportCsv() {
    const s = store.get(), k = s.index, {ok, low} = ranking(k, s.year), m = matching(s.filters, rows, codes, s.year);
    const out = [...ok.map((x, i) => ({hang: i + 1, ...x})), ...low.map(x => ({hang: '', ...x}))].filter(x => !onlyMatches || !m || m.has(x.code))
      .map(x => ({hang: x.hang, ma: x.code, ten: names.get(x.code), nam: s.year, chi_so: INDEX[k].code, gia_tri: Number.isFinite(x.row?.[k]) ? x.row[k].toFixed(4) : '',
        do_phu_mau: Number.isFinite(x.row?.[`${k}_coverage`]) ? x.row[`${k}_coverage`].toFixed(3) : '', thoa_dieu_kien: m ? (m.has(x.code) ? 'có' : 'không') : ''}));
    download(`xep_hang_${INDEX[k].code}_${s.year}.csv`, toCsv(['hang', 'ma', 'ten', 'nam', 'chi_so', 'gia_tri', 'do_phu_mau', 'thoa_dieu_kien'], out));
  }

  let last = {};
  store.subscribe(s => {
    if (s.index !== last.index) renderTabs();
    if (s.filters !== last.filters || s.year !== last.year) renderFilters();
    if (s.index !== last.index || s.year !== last.year || s.filters !== last.filters || s.selected !== last.selected) renderList();
    last = s;
  });
  renderTabs(); renderFilters(); renderList(); last = store.get();
  return {defaults: DEFAULTS};
}

export const FILTER_DEFAULTS = Object.fromEntries(INDICES.map(k => [k, {...DEFAULTS[k], on: false}]));
