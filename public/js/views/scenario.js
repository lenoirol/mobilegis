/* Scenario view: independent-offset simulations saved to PostgreSQL (admin only). Results are never mixed with observed data
   and are never presented as forecasts. */
import {h, mount, icon} from '../core/dom.js';
import {get, post, isAdmin, onSession} from '../core/api.js';
import {data, indexRows} from '../core/data.js';
import {INDEX, INDICES, YEARS, SOURCES, CANONICAL_SOURCE, fmt, valid, download, toCsv} from '../core/format.js';
import {countTo} from '../core/motion.js';
import {toast} from '../ui/toast.js';

const STATUS = {simulated: ['ok', 'Giả lập'], clipped: ['low', 'Giới hạn miền hợp lệ'], insufficient_base_coverage: ['missing', 'Thiếu mẫu cơ sở']};
let root, form, history, runData = null, runTicket = 0;
const el = {};
const field = (label, node, hint) => h('label', {class: 'field'}, h('span', null, label), node, hint ? h('small', {class: 'field-hint'}, hint) : null);

function sliderField(label, min, max, step, value, unit, digits) {
  const input = h('input', {type: 'range', min, max, step, value, 'aria-label': label});
  const out = h('output', {class: 'mono slider-out'}, `${fmt(+value, digits)} ${unit}`.trim());
  const number = h('input', {class: 'input num-in', type: 'number', min, max, step, value, required: true, 'aria-label': label + ' (số)'});
  const sync = v => { input.value = v; number.value = v; input.style.setProperty('--fill', ((v - min) / (max - min) * 100) + '%'); out.textContent = `${v > 0 ? '+' : ''}${fmt(+v, digits)} ${unit}`.trim(); };
  input.addEventListener('input', () => sync(input.value)); number.addEventListener('input', () => { if (number.value !== '') sync(number.value); });
  sync(value);
  return {node: h('div', {class: 'slider-field'}, h('div', {class: 'slider-top'}, h('span', {class: 'field'}, h('span', null, label)), out), input, number), get value() { return +number.value; }};
}

function buildForm() {
  const title = h('input', {class: 'input', required: true, maxLength: 150, value: 'Kịch bản minh họa từ hiện trạng 2025'});
  const source = h('select', {class: 'select'}, ...Object.values(SOURCES).map(s => h('option', {value: s.id}, s.label)));
  const base = h('select', {class: 'select'}, ...YEARS.map(y => h('option', {value: y, selected: y === 2025}, String(y))));
  const target = h('input', {class: 'input', type: 'number', min: 2020, max: 2100, value: 2026, required: true});
  const lst = sliderField('Thay đổi LST', -10, 10, .1, 0, '°C', 1), ndvi = sliderField('Thay đổi NDVI', -1, 1, .01, 0, '', 2), tvdi = sliderField('Thay đổi TVDI', -1, 1, .01, 0, '', 2);
  const cov = h('select', {class: 'select'}, ...[[.5, '50%'], [.8, '80%'], [.1, '10% · thận trọng']].map(([v, l]) => h('option', {value: v}, l)));
  el.status = h('p', {class: 'small', role: 'status'});
  el.submit = h('button', {class: 'btn primary', type: 'submit'}, icon('flask', 18), 'Tạo giả lập và lưu PostgreSQL');
  form = h('form', {class: 'scenario-form', on: {submit: async e => {
    e.preventDefault(); el.submit.disabled = true; el.status.textContent = 'Đang tạo giả lập trong giao dịch PostgreSQL…';
    try {
      const result = await post('/api/analysis/simulate', {title: title.value, source: source.value, base_year: +base.value, target_year: +target.value, lst_delta: lst.value, ndvi_delta: ndvi.value, tvdi_delta: tvdi.value, coverage: +cov.value});
      el.status.textContent = 'Đã lưu GIẢ LẬP. Số liệu hiện trạng không thay đổi.'; toast('Đã lưu kịch bản giả lập.'); await loadRuns(result.id);
    } catch (error) { el.status.textContent = error.message; toast(error.message, {error: true}); }
    finally { el.submit.disabled = false; }
  }}},
    h('div', {class: 'form-grid'}, field('Tên kịch bản', title), field('Nguồn hiện trạng', source), field('Năm cơ sở', base), field('Năm gắn nhãn kịch bản', target, 'Chỉ là nhãn; không có nghĩa đã tải ảnh năm đó.')),
    h('div', {class: 'sliders'}, lst.node, ndvi.node, tvdi.node), field('Độ phủ hiện trạng tối thiểu', cov),
    h('p', {class: 'small muted'}, 'Dữ liệu cơ sở thiếu hoặc độ phủ thấp sẽ để trống. Giá trị vượt miền hợp lệ được chặn và đánh dấu.'), el.submit, el.status);
  return form;
}

async function loadRuns(selectId) {
  try {
    const runs = await get('/api/analysis/runs');
    el.run.replaceChildren(...(runs.length ? runs.map(r => h('option', {value: r.id}, `${r.result_kind === 'simulation' ? 'GIẢ LẬP' : 'DỰ BÁO'} · ${r.title} · ${r.base_year}→${r.target_year}`)) : [h('option', {value: ''}, 'Chưa có lần chạy nào')]));
    if (selectId) el.run.value = selectId;
    el.empty.hidden = !!runs.length; el.result.hidden = !runs.length;
    if (runs.length) await loadRun();
  } catch (error) { el.status && (el.status.textContent = error.message); }
}
async function loadRun() {
  const id = el.run.value; if (!id) return;
  const mine = ++runTicket;
  mount(el.rows, h('tr', null, h('td', {colSpan: 9}, h('div', {class: 'skeleton', style: {height: '120px'}}))));
  try {
    const result = await get('/api/analysis/runs/' + id), baseline = indexRows(await data.rows(result.run.source_dataset_id));
    if (mine !== runTicket) return;
    runData = result;
    const r = result.run, name = SOURCES[r.source_dataset_id]?.label || r.source_dataset_id;
    el.method.textContent = `${r.result_kind === 'simulation' ? 'GIẢ LẬP' : 'DỰ BÁO'} · cơ sở: ${name}, ${r.base_year} · nhãn: ${r.target_year} · ${r.method === 'independent_offsets' ? 'cộng mức thay đổi độc lập' : r.method} ${r.method_version} · ${new Date(r.created_at).toLocaleString('vi-VN')}${r.note ? ' · ' + r.note : ''}`;
    // before → after means (only units that have both)
    mount(el.compare, ...INDICES.map(k => {
      const pairs = result.units.map(u => [baseline.get(u.code, r.base_year)?.[k], u[k]]).filter(([a, b]) => valid(a) && valid(b)), n = pairs.length;
      const a = n ? pairs.reduce((s, p) => s + p[0], 0) / n : null, b = n ? pairs.reduce((s, p) => s + p[1], 0) / n : null, idx = INDEX[k], delta = valid(a) && valid(b) ? b - a : null;
      const out = h('b', {class: 'mono num'}, '—'); requestAnimationFrame(() => countTo(out, b, v => fmt(v, idx.digits), 700));
      return h('div', {class: 'cmp-card'}, h('span', {class: 'eyebrow'}, idx.label), out, h('small', {class: 'mono'}, valid(a) ? `cơ sở ${fmt(a, idx.digits)} → ${valid(delta) ? (delta > 0 ? '+' : '') + fmt(delta, idx.digits) : '—'} ${idx.unit}`.trim() : 'thiếu mẫu cơ sở'), h('small', {class: 'muted'}, `${n} khu vực`));
    }));
    mount(el.rows, ...result.units.map(u => {
      const b = baseline.get(u.code, r.base_year), sts = [u.lst_status, u.ndvi_status, u.tvdi_status];
      const worst = sts.includes('insufficient_base_coverage') ? 'insufficient_base_coverage' : sts.includes('clipped') ? 'clipped' : 'simulated';
      return h('tr', null, h('th', {scope: 'row', class: 'name'}, u.name), h('td', {class: 'num mono'}, String(u.year)), h('td', {class: 'num mono'}, fmt(b?.lst, 1)), h('td', {class: 'num mono strong'}, fmt(u.lst, 1)), h('td', {class: 'num mono'}, fmt(b?.ndvi)), h('td', {class: 'num mono strong'}, fmt(u.ndvi)),
        h('td', {class: 'num mono'}, fmt(b?.tvdi)), h('td', {class: 'num mono strong'}, fmt(u.tvdi)), h('td', null, h('span', {class: 'tag ' + STATUS[worst][0], title: sts.map(s => STATUS[s]?.[1] || s).join(' / ')}, STATUS[worst][1])));
    }));
  } catch (error) { if (mine === runTicket) { runData = null; mount(el.rows, h('tr', null, h('td', {colSpan: 9, class: 'empty'}, error.message))); } }
}

function render() {
  const admin = isAdmin();
  el.formWrap.hidden = !admin; el.lock.hidden = admin;
}

export function init(section) {
  el.run = h('select', {class: 'select', 'aria-label': 'Chọn lần chạy', on: {change: loadRun}});
  el.method = h('p', {class: 'small'}); el.compare = h('div', {class: 'cmp-row'}); el.rows = h('tbody');
  el.empty = h('p', {class: 'callout', hidden: true}, 'Chưa có lần chạy nào. Quản trị viên có thể tạo kịch bản ở trên.');
  el.result = h('div', {class: 'result'}, field('Lần chạy', el.run), el.method, el.compare,
    h('div', {class: 'scroll card flat'}, h('table', {class: 'tbl'}, h('thead', null, h('tr', null, ...['Khu vực', 'Năm', 'LST cơ sở', 'LST kết quả', 'NDVI cơ sở', 'NDVI kết quả', 'TVDI cơ sở', 'TVDI kết quả', 'Trạng thái'].map((t, i) => h('th', {class: i > 0 && i < 8 ? 'num' : ''}, t)))), el.rows)),
    h('button', {class: 'btn sm', type: 'button', on: {click: () => {
      if (!runData) return toast('Chưa chọn kết quả.', {error: true});
      const rows = runData.units.map(u => ({run_id: runData.run.id, result_kind: runData.run.result_kind, source: runData.run.source_dataset_id, base_year: runData.run.base_year, ...u}));
      download(`MobileGIS_gia_lap_${runData.run.target_year}.csv`, toCsv(['run_id', 'result_kind', 'source', 'base_year', 'code', 'name', 'year', 'lst', 'ndvi', 'tvdi', 'lst_status', 'ndvi_status', 'tvdi_status'], rows));
    }}}, icon('download', 16), 'Xuất CSV kết quả'));
  el.formWrap = h('article', {class: 'card scenario-card'}, h('span', {class: 'eyebrow'}, 'Tạo mới'), h('h2', null, 'Tạo và lưu một lần chạy'), buildForm());
  el.lock = h('article', {class: 'card lock-card', hidden: true}, icon('lock', 28), h('h2', null, 'Chỉ quản trị viên được tạo giả lập'), h('p', {class: 'muted'}, 'Mỗi lần chạy được ghi vào PostgreSQL nên cần tài khoản quản trị. Bạn vẫn xem được các kết quả đã lưu ở bên dưới.'),
    h('a', {class: 'btn primary', href: '/login.html?next=' + encodeURIComponent('/#/gia-lap')}, 'Đăng nhập'));
  root = h('div', {class: 'page scenario-page'},
    h('header', {class: 'page-head'}, h('span', {class: 'eyebrow'}, 'Kết quả tách biệt với hiện trạng'), h('h1', null, 'Kịch bản giả lập'),
      h('p', null, 'Công cụ minh họa giả định, không phải dự báo đã kiểm chứng. Mỗi chỉ số được cộng mức thay đổi độc lập; không mô phỏng quan hệ vật lý giữa cây xanh, nhiệt độ và độ khô.')),
    el.formWrap, el.lock,
    h('section', {class: 'block'}, h('h2', null, 'Lịch sử kết quả'), el.empty, el.result),
    h('p', {class: 'small muted'}, 'CSDL có thể lưu RMSE/MAE/Bias của một mô hình đã kiểm định. Bản này chỉ có giả lập; không tạo số đánh giá độ chính xác khi chưa có dữ liệu đối chứng.'));
  section.append(root);
  onSession(render); render();
}
export function show() { render(); loadRuns(); }
