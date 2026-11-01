/* Admin tab "Nhập số liệu" and the usage block on the overview. Text only via DOM helpers. */
import {$, h, mount} from './core/dom.js';
import {get, post, url} from './core/api.js';
import {toast} from './ui/toast.js';

const when = iso => iso ? new Date(iso).toLocaleString('vi-VN', {dateStyle: 'short', timeStyle: 'short'}) : '—';
const pct = v => typeof v === 'number' ? Math.round(v * 100) + '%' : '—';
const num = (v, d = 2) => typeof v === 'number' ? v.toLocaleString('vi-VN', {minimumFractionDigits: d, maximumFractionDigits: d}) : '—';
const NAMES = {lst: 'LST', ndvi: 'NDVI', tvdi: 'TVDI'};
const state = {csv: '', filename: '', preview: null};

function diffCell(d) {
  return h('div', null, h('b', null, NAMES[d.index] + ': '), `${num(d.before)} (${pct(d.before_coverage)}) → `, h('b', null, `${num(d.after)} (${pct(d.after_coverage)})`));
}

function renderPreview() {
  const host = $('#importPreview'), p = state.preview;
  if (!p) { mount(host); return; }
  const apply = $('#importApply');
  apply.disabled = !!p.error_count || !p.changed_rows && !p.new_rows;
  mount(host,
    h('div', {class: 'stat-row'},
      h('div', {class: 'stat'}, h('b', {class: 'mono'}, String(p.rows)), h('span', null, 'Dòng hợp lệ')),
      h('div', {class: 'stat'}, h('b', {class: 'mono'}, String(p.changed_rows)), h('span', null, 'Dòng làm đổi số liệu')),
      h('div', {class: 'stat'}, h('b', {class: 'mono'}, String(p.new_rows)), h('span', null, 'Dòng mới')),
      h('div', {class: 'stat'}, h('b', {class: 'mono', style: {color: p.error_count ? 'var(--err)' : 'inherit'}}, String(p.error_count)), h('span', null, 'Lỗi'))),
    p.error_count ? h('div', {class: 'callout err'}, h('b', null, 'Chưa nhập được. Sửa các lỗi sau rồi chọn lại tệp:'), h('ul', null, ...p.errors.map(e => h('li', null, e)), p.error_count > p.errors.length ? h('li', null, `… và ${p.error_count - p.errors.length} lỗi nữa`) : null)) : null,
    !p.error_count && !p.changed_rows && !p.new_rows ? h('div', {class: 'callout'}, 'Tệp hợp lệ nhưng không làm đổi số liệu nào.') : null,
    p.changes.some(c => c.diff.length || c.new) ? h('div', {class: 'scroll card flat'}, h('table', {class: 'tbl'}, h('thead', null, h('tr', null, h('th', null, 'Khu vực'), h('th', null, 'Năm'), h('th', null, 'Trước → sau (độ phủ mẫu)'))),
      h('tbody', null, ...p.changes.filter(c => c.diff.length || c.new).slice(0, 120).map(c => h('tr', null, h('th', {scope: 'row', class: 'name'}, c.name || c.code, c.new ? h('span', {class: 'tag signal', style: {marginLeft: '6px'}}, 'mới') : null), h('td', null, String(c.year)), h('td', null, ...c.diff.map(diffCell))))))) : null);
}

async function history() {
  const list = await get('/api/admin/imports');
  mount($('#importRows'), ...(list.length ? list.map(i => h('tr', null,
    h('th', {scope: 'row', class: 'name'}, '#' + i.id), h('td', null, when(i.created_at)), h('td', null, i.filename), h('td', {class: 'num'}, String(i.row_count)),
    h('td', null, i.status === 'applied' ? h('span', {class: 'tag ok'}, 'Đang áp dụng') : h('span', {class: 'tag missing'}, 'Đã hoàn tác')), h('td', null, i.by || '—'), h('td', null, i.note || ''),
    h('td', null, h('button', {class: 'btn sm', type: 'button', on: {click: async () => { try { await post(`/api/admin/imports/${i.id}/${i.status === 'applied' ? 'revert' : 'reapply'}`); toast(i.status === 'applied' ? 'Đã hoàn tác. Số liệu gốc hiện lại.' : 'Đã áp dụng lại.'); await history(); } catch (e) { toast(e.message, {error: true}); } }}}, i.status === 'applied' ? 'Hoàn tác' : 'Áp dụng lại'))))
    : [h('tr', null, h('td', {colspan: 7, class: 'muted'}, 'Chưa có lần nhập nào. Số liệu đang hiển thị là bộ gốc từ Google Earth Engine.'))]));
}

export function initImports() {
  $('#importFile').addEventListener('change', async e => {
    const file = e.target.files[0]; state.preview = null; $('#importApply').disabled = true;
    if (!file) { renderPreview(); return; }
    if (file.size > 1_000_000) { toast('Tệp quá lớn (tối đa 1 MB).', {error: true}); return; }
    state.csv = await file.text(); state.filename = file.name;
    try { state.preview = await post('/api/admin/imports/preview', {csv: state.csv}); renderPreview(); }
    catch (err) { state.preview = null; renderPreview(); toast(err.message, {error: true, ms: 9000}); }
  });
  $('#importApply').addEventListener('click', async () => {
    try {
      const r = await post('/api/admin/imports', {csv: state.csv, filename: state.filename, note: $('#importNote').value});
      toast(`Đã nhập số liệu (lần #${r.id}). Bản đồ và bảng số liệu dùng số mới ngay.`);
      state.preview = null; $('#importFile').value = ''; $('#importNote').value = ''; renderPreview(); $('#importApply').disabled = true; await history();
    } catch (err) { toast(err.message, {error: true, ms: 9000}); }
  });
  $('#importTemplate').href = url('/api/admin/imports/template.csv');
  history().catch(() => {});
}

export async function loadUsage() {
  try {
    const u = await get('/api/admin/usage');
    const list = (items, label) => h('div', {class: 'card flat'}, h('h3', null, label), items.length ? h('ul', {class: 'small', style: {margin: '6px 0 0', paddingLeft: '18px'}}, ...items.map(i => h('li', null, `${i.key}: `, h('b', null, String(i.n))))) : h('p', {class: 'muted small', style: {margin: '6px 0 0'}}, 'Chưa có số liệu.'));
    mount($('#usageBox'), h('p', {class: 'small muted'}, `${u.days} ngày gần nhất · chỉ đếm số lượt, không lưu danh tính hay địa chỉ.`),
      h('div', {class: 'about-grid'}, list(u.pages, 'Trang được mở'), list(u.layers, 'Chỉ số được xem'), list(u.features, 'Tính năng được dùng'), list(u.areas, 'Khu vực được xem nhiều'), list(u.errors, 'Lỗi giao diện (JS)')));
  } catch (_) { /* usage is optional */ }
}
