/* Admin console: accounts, password-reset requests, security log, system overview. Text is inserted as text nodes only. */
import {$, h, mount, icon} from './core/dom.js';
import {session, loadSession, get, post} from './core/api.js';
import {segmented} from './ui/seg.js';
import {toast} from './ui/toast.js';

let users = [], me = null, tabs;
const when = iso => iso ? new Date(iso).toLocaleString('vi-VN', {dateStyle: 'short', timeStyle: 'short'}) : '—';
const EVENTS = {register: 'Đăng ký', login: 'Đăng nhập', login_failed: 'Đăng nhập sai', password_changed: 'Đổi mật khẩu', reset_requested: 'Yêu cầu đặt lại', reset_issued: 'Cấp mã đặt lại',
  reset_cancelled: 'Hủy yêu cầu', password_reset: 'Đã đặt lại mật khẩu', role_changed: 'Đổi vai trò', activated: 'Kích hoạt', deactivated: 'Vô hiệu hóa', user_deleted: 'Xóa tài khoản', admin_created: 'Tạo quản trị viên'};

async function api(url, method = 'GET', body) {
  if (method === 'GET') return get(url);
  if (method === 'DELETE') {
    const response = await fetch(url, {method, credentials: 'same-origin', headers: {'X-Token': session.token}});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Có lỗi xảy ra.');
    return data;
  }
  return post(url, body ?? {});
}
const act = async (fn, okText) => { try { await fn(); if (okText) toast(okText); await refresh(); } catch (error) { toast(error.message, {error: true}); } };

function overview(info, resets) {
  const stat = (value, label) => h('div', {class: 'stat'}, h('b', {class: 'mono'}, String(value)), h('span', null, label));
  mount($('#cards'), stat(users.length, 'Tài khoản'), stat(users.filter(u => u.role === 'admin').length, 'Quản trị viên'), stat(users.filter(u => u.is_active).length, 'Đang hoạt động'), stat(resets.filter(r => r.status === 'pending').length, 'Yêu cầu chờ xử lý'));
  const rows = [['Phiên bản', info.version], ['PostgreSQL / PostGIS', `${info.database.postgres_version} / ${info.database.postgis}`], ['Phiên bản schema', String(info.database.schema_version)],
    ['Nguồn dữ liệu', info.database.datasets.map(d => `${d.dataset_id}: ${d.rows.toLocaleString('vi-VN')} dòng`).join(' · ')], ['Bảng chỉ số hiện trạng', info.database.metric_tables.map(m => `${m.table}: ${m.rows.toLocaleString('vi-VN')}`).join(' · ')]];
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
  const [list, resets, events, info] = await Promise.all([api('/api/admin/users'), api('/api/admin/resets'), api('/api/admin/events'), api('/api/info')]);
  users = list; overview(info, resets); usersTable(); resetsTable(resets); eventsTable(events);
}
function selectTab(name) {
  for (const id of ['overview', 'users', 'resets', 'events']) $('#tab-' + id).hidden = id !== name;
}

(async () => {
  await loadSession();
  if (!session.user) { location.replace('/login.html?next=/admin.html'); return; }
  if (session.user.role !== 'admin') { $('#denied').hidden = false; $('#logout').hidden = true; return; }
  me = session.user; $('#who').textContent = me.display_name; $('#app').hidden = false;
  const resetCount = h('span', {class: 'count', hidden: true}, '0');
  tabs = segmented([{value: 'overview', label: 'Tổng quan'}, {value: 'users', label: 'Tài khoản'}, {value: 'resets', label: ['Quên mật khẩu', resetCount]}, {value: 'events', label: 'Nhật ký'}], 'overview', selectTab, {label: 'Mục quản trị'});
  tabs.counts = {reset: resetCount}; tabs.el.classList.add('admin-tabs');
  $('#tabsHost').append(tabs.el); tabs.place();
  $('#logout').onclick = async () => { await fetch('/api/auth/logout', {method: 'POST', credentials: 'same-origin'}); location.href = '/login.html'; };
  try { await refresh(); } catch (error) { toast(error.message, {error: true}); }
})();
