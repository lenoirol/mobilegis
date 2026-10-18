/* Admin console: accounts, password-reset requests, security log, system overview. Text is inserted as text nodes only. */
import {$, h, mount, icon} from './core/dom.js';
import {session, loadSession, get, post, url} from './core/api.js';
import {segmented} from './ui/seg.js';
import {toast} from './ui/toast.js';

let users = [], me = null, tabs;
const when = iso => iso ? new Date(iso).toLocaleString('vi-VN', {dateStyle: 'short', timeStyle: 'short'}) : '—';
const EVENTS = {register: 'Đăng ký', login: 'Đăng nhập', login_failed: 'Đăng nhập sai', password_changed: 'Đổi mật khẩu', reset_requested: 'Yêu cầu đặt lại', reset_issued: 'Cấp mã đặt lại',
  user_created: 'Admin tạo tài khoản', reset_cancelled: 'Hủy yêu cầu', password_reset: 'Đã đặt lại mật khẩu', role_changed: 'Đổi vai trò', activated: 'Kích hoạt', deactivated: 'Vô hiệu hóa', user_deleted: 'Xóa tài khoản', admin_created: 'Tạo quản trị viên'};

async function api(target, method = 'GET', body) {
  if (method === 'GET') return get(target);
  if (method === 'DELETE') {
    const response = await fetch(url(target), {method, credentials: 'same-origin', headers: {'X-Token': session.token}});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Có lỗi xảy ra.');
    return data;
  }
  return post(target, body ?? {});
}
const act = async (fn, okText) => { try { await fn(); if (okText) toast(okText); await refresh(); } catch (error) { toast(error.message, {error: true}); } };

function overview(info, resets) {
  const stat = (value, label) => h('div', {class: 'stat'}, h('b', {class: 'mono'}, String(value)), h('span', null, label));
  mount($('#cards'), stat(users.length, 'Tài khoản'), stat(users.filter(u => u.role === 'admin').length, 'Quản trị viên'), stat(users.filter(u => u.is_active).length, 'Đang hoạt động'), stat(resets.filter(r => r.status === 'pending').length, 'Yêu cầu chờ xử lý'));
  const rows = [['Phiên bản', info.version], ['PostgreSQL / PostGIS', `${info.database.postgres_version} / ${info.database.postgis}`], ['Phiên bản schema', String(info.database.schema_version)],
    ['Nguồn dữ liệu', info.database.datasets.map(d => `${d.dataset_id}: ${d.rows.toLocaleString('vi-VN')} dòng`).join(' · ')], ['Bảng chỉ số hiện trạng', info.database.metric_tables.map(m => `${m.table}: ${m.rows.toLocaleString('vi-VN')}`).join(' · ')]];
  mount($('#docLinks'), ...[['/docs', 'Tài liệu REST API'], ['/api/documents/schema.sql', 'SQL tạo bảng và migration'], ['/api/documents/database_design.md', 'Thiết kế CSDL'], ['/api/documents/quickstart.md', 'Cách chạy PostgreSQL'], ['/api/documents/pg3_guide.md', 'Hướng dẫn PG3'], ['/api/documents/gee_script.js', 'Script xuất GEE'], ['/api/documents/gee_next_years.md', 'Quy trình xuất GEE']]
    .map(([href, label]) => h('a', {class: 'btn sm', href: url(href), target: '_blank', rel: 'noopener'}, label)));
  mount($('#systemRows'), ...rows.map(([k, v]) => h('tr', null, h('th', {scope: 'row', class: 'name'}, k), h('td', {class: 'mono small'}, v))));
}
function usersTable() {
  mount($('#userRows'), ...users.map(u => {
    const self = u.id === me.id;
    const role = h('select', {class: 'select', 'aria-label': 'Vai trò của ' + u.display_name, disabled: self, on: {change: () => act(() => api(`/api/admin/users/${u.id}/role`, 'POST', {role: role.value}), 'Đã đổi vai trò.')}},
      h('option', {value: 'customer'}, 'Khách hàng'), h('option', {value: 'admin'}, 'Quản trị viên'));
    role.value = u.role;
    return h('tr', null, h('td', null, h('b', null, u.display_name + (self ? ' (bạn)' : '')), h('small', {class: 'mono'}, u.email)),
      h('td', null, h('span', {class: 'pill ' + u.role}, u.role === 'admin' ? 'Quản trị' : 'Khách hàng')), h('td', null, h('span', {class: 'pill ' + (u.is_active ? 'on' : 'off')}, u.is_active ? 'Hoạt động' : 'Đã khóa')),
      h('td', {class: 'mono small'}, when(u.created_at)), h('td', {class: 'mono small'}, when(u.last_login_at)),
      h('td', null, h('div', {class: 'row-actions'}, role,
        h('button', {class: 'btn sm', type: 'button', disabled: self, on: {click: () => act(() => api(`/api/admin/users/${u.id}/active`, 'POST', {active: !u.is_active}), u.is_active ? 'Đã vô hiệu hóa.' : 'Đã kích hoạt.')}}, u.is_active ? 'Vô hiệu hóa' : 'Kích hoạt'),
        h('button', {class: 'btn sm danger', type: 'button', disabled: self, on: {click: () => { if (confirm(`Xóa tài khoản ${u.email}? Không hoàn tác được.`)) act(() => api(`/api/admin/users/${u.id}`, 'DELETE'), 'Đã xóa tài khoản.'); }}}, 'Xóa'))));
  }));
}
function resetsTable(resets) {
  const pending = resets.filter(r => r.status === 'pending').length;
  tabs.counts.reset.hidden = !pending; tabs.counts.reset.textContent = pending;
  if (!resets.length) return mount($('#resetRows'), h('tr', null, h('td', {colSpan: 5, class: 'empty'}, 'Không có yêu cầu nào đang chờ.')));
  mount($('#resetRows'), ...resets.map(r => h('tr', null, h('td', null, h('b', null, r.display_name), h('small', {class: 'mono'}, r.email)),
    h('td', null, h('span', {class: 'pill ' + r.status}, r.status === 'pending' ? 'Chờ cấp mã' : 'Đã cấp mã')), h('td', {class: 'mono small'}, when(r.requested_at)), h('td', {class: 'mono small'}, r.expires_at ? when(r.expires_at) : '—'),
    h('td', null, h('div', {class: 'row-actions'}, h('button', {class: 'btn sm primary', type: 'button', on: {click: () => act(async () => {
      const result = await api(`/api/admin/resets/${r.id}/issue`, 'POST');
      const box = $('#codeBox');
      mount(box, h('strong', null, `Mã đặt lại cho ${r.email}`), h('code', null, result.code), h('span', null, `Hiệu lực ${result.valid_minutes} phút. ${result.message}`),
        h('button', {class: 'btn sm', type: 'button', on: {click: async () => { try { await navigator.clipboard.writeText(result.code); toast('Đã sao chép mã.'); } catch (_) { toast('Không sao chép được, hãy chép thủ công.', {error: true}); } }}}, 'Sao chép mã'));
      box.hidden = false; box.scrollIntoView({behavior: 'smooth', block: 'nearest'});
    })}}, r.status === 'issued' ? 'Cấp mã mới' : 'Cấp mã'), h('button', {class: 'btn sm', type: 'button', on: {click: () => act(() => api(`/api/admin/resets/${r.id}/cancel`, 'POST'), 'Đã hủy yêu cầu.')}}, 'Hủy'))))));
}
function eventsTable(events) {
  mount($('#eventRows'), ...events.map(e => h('tr', null, h('td', {class: 'mono small'}, when(e.created_at)), h('td', null, EVENTS[e.event] || e.event), h('td', {class: 'mono small'}, e.email || '—'), h('td', {class: 'small'}, e.detail || ''))),
    events.length ? null : h('tr', null, h('td', {colSpan: 4, class: 'empty'}, 'Chưa có sự kiện.')));
}
async function refresh() {
  const [list, resets, events, info, feedback] = await Promise.all([api('/api/admin/users'), api('/api/admin/resets'), api('/api/admin/events'), api('/api/info'), api('/api/admin/feedback').catch(() => [])]);
  users = list; overview(info, resets); usersTable(); resetsTable(resets); eventsTable(events); feedbackTable(feedback);
}
async function audits() {
  try {
    const product = await get('/data/gee_recovery/products.json');
    const list = Object.values(product.audits || {}).sort((a, b) => a.year - b.year);
    mount($('#auditRows'), ...list.map(a => h('tr', null, h('th', {scope: 'row', class: 'name'}, String(a.year)), h('td', {class: 'num mono'}, `${a.valid_means.lst} / ${a.valid_means.ndvi} / ${a.valid_means.tvdi} trên 167`), h('td', {class: 'mono small'}, [...new Set((a.scenes || []).map(s => s.acquisition_date))].sort().join(', ')))));
  } catch (_) { mount($('#auditRows'), h('tr', null, h('td', {colSpan: 3, class: 'empty'}, 'Không tải được metadata.'))); }
}
const KIND = {data_error: 'Số liệu sai', suggestion: 'Góp ý', ui_error: 'Lỗi hiển thị'};
function feedbackTable(list) {
  const open = list.filter(f => f.status === 'new').length;
  tabs.counts.feedback.hidden = !open; tabs.counts.feedback.textContent = open;
  if (!list.length) return mount($('#feedbackRows'), h('tr', null, h('td', {colSpan: 6, class: 'empty'}, 'Chưa có góp ý nào.')));
  mount($('#feedbackRows'), ...list.map(f => h('tr', null, h('td', {class: 'mono small'}, when(f.created_at)), h('td', null, KIND[f.kind] || f.kind), h('td', {class: 'mono small'}, f.code || '—'),
    h('td', {class: 'small'}, f.message), h('td', null, f.display_name ? h('b', null, f.display_name) : '—', f.email ? h('small', {class: 'mono'}, f.email) : null),
    h('td', null, h('button', {class: 'btn sm' + (f.status === 'new' ? ' primary' : ''), type: 'button', on: {click: () => act(() => api(`/api/admin/feedback/${f.id}/status`, 'POST', {status: f.status === 'new' ? 'done' : 'new'}))}}, f.status === 'new' ? 'Đánh dấu đã xử lý' : 'Đã xử lý · mở lại')))));
}
const PAGE_NAMES = {'trang-chu': 'Trang chủ', 'ban-do': 'Bản đồ', 'bang-so-lieu': 'Số liệu', 'thong-ke': 'Thống kê', 'gia-lap': 'Giả lập', 'du-lieu': 'Giới thiệu', lst: 'Lớp Nhiệt độ', ndvi: 'Lớp Độ xanh', tvdi: 'Lớp Độ khô'};
let areaNames = new Map();
async function loadAreas() {
  try {
    const geo = await get('/data/hcm_167.geojson');
    areaNames = new Map(geo.features.map(f => [f.id, f.properties.full_name]));
    const sorted = [...areaNames].sort((a, b) => a[1].localeCompare(b[1], 'vi'));
    document.querySelectorAll('select[data-areas]').forEach(sel => sel.append(...sorted.map(([code, name]) => h('option', {value: code}, name))));
  } catch (_) { /* selects stay with their placeholder */ }
}
async function loadContent() {
  const content = await get('/api/content');
  mount($('#highlightRows'), ...(content.highlights.length ? content.highlights.map(x => h('tr', null, h('td', null, h('b', null, x.title)), h('td', {class: 'small'}, x.body), h('td', {class: 'small'}, x.code ? areaNames.get(x.code) || x.code : '—'),
    h('td', null, h('button', {class: 'btn sm danger', type: 'button', on: {click: () => act(async () => { await api(`/api/admin/highlights/${x.id}`, 'DELETE'); await loadContent(); }, 'Đã xóa điểm nhấn.')}}, 'Xóa')))) : [h('tr', null, h('td', {colSpan: 4, class: 'empty'}, 'Chưa có điểm nhấn.'))]));
  window.__notes = content.notes;
}
async function loadUsage() {
  try {
    const u = await api('/api/admin/usage'), total = u.pages.reduce((s, r) => s + r.n, 0), best = u.pages[0];
    const stat = (value, label) => h('div', {class: 'stat'}, h('b', {class: 'mono'}, String(value)), h('span', null, label));
    mount($('#usageCards'), stat(total.toLocaleString('vi-VN'), 'Lượt mở trang'), stat(u.areas.reduce((s, r) => s + r.n, 0).toLocaleString('vi-VN'), 'Lượt xem khu vực'), stat(best ? PAGE_NAMES[best.key] || best.key : '—', 'Trang xem nhiều nhất'));
    const rows = (list, name) => list.length ? list.map(r => h('tr', null, h('th', {scope: 'row', class: 'name'}, name(r.key)), h('td', {class: 'num mono'}, String(r.n)))) : [h('tr', null, h('td', {class: 'empty'}, 'Chưa có dữ liệu.'))];
    mount($('#usageAreas'), ...rows(u.areas, k => areaNames.get(k) || k)); mount($('#usagePages'), ...rows([...u.pages, ...u.layers], k => PAGE_NAMES[k] || k));
  } catch (error) { toast(error.message, {error: true}); }
}
function selectTab(name) {
  if (name === 'usage') loadUsage();
  for (const id of ['overview', 'system', 'users', 'resets', 'feedback', 'content', 'usage', 'events']) $('#tab-' + id).hidden = id !== name;
}

(async () => {
  await loadSession();
  if (!session.user) { location.replace(url('login.html') + '?next=' + encodeURIComponent(location.pathname)); return; }
  if (session.user.role !== 'admin') { $('#denied').hidden = false; $('#logout').hidden = true; return; }
  me = session.user; $('#who').textContent = me.display_name; $('#app').hidden = false;
  const resetCount = h('span', {class: 'count', hidden: true}, '0'), feedbackCount = h('span', {class: 'count', hidden: true}, '0');
  tabs = segmented([{value: 'overview', label: 'Tổng quan'}, {value: 'users', label: 'Tài khoản'}, {value: 'resets', label: ['Quên mật khẩu', resetCount]}, {value: 'feedback', label: ['Góp ý', feedbackCount]}, {value: 'content', label: 'Nội dung'}, {value: 'usage', label: 'Lượt dùng'}, {value: 'events', label: 'Nhật ký'}, {value: 'system', label: 'Kỹ thuật'}], 'overview', selectTab, {label: 'Mục quản trị'});
  tabs.counts = {reset: resetCount, feedback: feedbackCount}; tabs.el.classList.add('admin-tabs');
  $('#tabsHost').append(tabs.el); tabs.place();
  $('#logout').onclick = async () => { await fetch(url('api/auth/logout'), {method: 'POST', credentials: 'same-origin'}); location.href = url('login.html'); };
  $('#createUser').addEventListener('submit', e => { e.preventDefault(); const form = e.target, body = Object.fromEntries(new FormData(form));
    act(async () => { await api('/api/admin/users', 'POST', body); form.reset(); }, 'Đã tạo tài khoản.'); });
  get('/api/notice').then(n => { $('#noticeForm [name=text]').value = n.text || ''; }).catch(() => {});
  $('#noticeForm').addEventListener('submit', e => { e.preventDefault(); act(() => api('/api/admin/notice', 'POST', {text: e.target.text.value}), 'Đã lưu thông báo.'); });
  $('#highlightForm').addEventListener('submit', e => { e.preventDefault(); const form = e.target, body = Object.fromEntries(new FormData(form));
    act(async () => { await api('/api/admin/highlights', 'POST', body); form.reset(); await loadContent(); }, 'Đã thêm điểm nhấn.'); });
  const noteForm = $('#noteForm');
  noteForm.code.addEventListener('change', () => { noteForm.text.value = (window.__notes || {})[noteForm.code.value] || ''; });
  noteForm.addEventListener('submit', e => { e.preventDefault(); act(async () => { await api('/api/admin/notes', 'POST', {code: noteForm.code.value, text: noteForm.text.value}); await loadContent(); }, 'Đã lưu ghi chú.'); });
  await loadAreas(); loadContent().catch(() => {});
  audits(); try { await refresh(); } catch (error) { toast(error.message, {error: true}); }
})();
