/* Tài khoản: sign in / register / forgot password for guests; for signed-in users: profile, change password,
   sign out and DELETE MY ACCOUNT (password confirmation; the server also refuses to delete the last admin). */
import {h, mount, icon} from '../core/dom.js';
import {session, post, loadSession, onSession, env, url} from '../core/api.js';
import {toast} from '../ui/toast.js';

let root, tab = 'login';

const field = (label, input, hint) => h('label', {class: 'field'}, h('span', null, label), input, hint && h('small', {class: 'muted', style: {fontWeight: 400}}, hint));
const input = (name, type = 'text', extra = {}) => h('input', {class: 'input', name, type, required: true, ...extra});
const message = () => h('p', {class: 'small', role: 'alert', style: {color: 'var(--err)', fontWeight: 600, minHeight: '1.2em', margin: 0}});

function form(title, fields, submit, onSubmit, after) {
  const msg = message(), btn = h('button', {class: 'btn primary', type: 'submit'}, submit);
  const node = h('form', {class: 'card acct-form', novalidate: true, on: {submit: async e => {
    e.preventDefault();
    if (!node.checkValidity()) { node.reportValidity(); return; }
    msg.textContent = ''; btn.disabled = true;
    try { await onSubmit(Object.fromEntries(new FormData(node)), msg); } catch (error) { msg.style.color = 'var(--err)'; msg.textContent = error.message; } finally { btn.disabled = false; }
  }}}, h('h2', null, title), ...fields, msg, h('div', {class: 'dlg-actions', style: {justifyContent: 'flex-start'}}, btn), after);
  return node;
}

function guest() {
  const switcher = h('div', {class: 'seg', role: 'group', 'aria-label': 'Chọn thao tác'},
    ...[['login', 'Đăng nhập'], ['register', 'Đăng ký'], ['forgot', 'Quên mật khẩu']].map(([k, label]) => h('button', {type: 'button', 'aria-pressed': String(tab === k), on: {click: () => { tab = k; render(); }}}, label)));
  let body;
  if (tab === 'login') body = form('Đăng nhập', [field('Email', input('email', 'email', {autocomplete: 'email'})), field('Mật khẩu', input('password', 'password', {autocomplete: 'current-password'}))], 'Đăng nhập',
    async v => { await post('/api/auth/login', v); await loadSession(); toast('Đã đăng nhập.'); location.hash = '#/'; });
  else if (tab === 'register') body = form('Tạo tài khoản', [
    field('Tên hiển thị', input('display_name', 'text', {autocomplete: 'nickname', maxLength: 60})),
    field('Email', input('email', 'email', {autocomplete: 'email'})),
    field('Mật khẩu', input('password', 'password', {autocomplete: 'new-password', minLength: 8}), 'Ít nhất 8 ký tự'),
    field('Nhập lại mật khẩu', input('confirm', 'password', {autocomplete: 'new-password', minLength: 8}))], 'Tạo tài khoản',
    async v => { if (v.password !== v.confirm) throw new Error('Hai mật khẩu chưa giống nhau.'); await post('/api/auth/register', {display_name: v.display_name, email: v.email, password: v.password}); await loadSession(); toast('Đã tạo tài khoản.'); location.hash = '#/'; },
    h('p', {class: 'small muted', style: {margin: '6px 0 0'}}, 'Tài khoản thường chỉ xem bản đồ và thống kê. Bạn có thể tự xóa tài khoản bất kỳ lúc nào trong trang này.'));
  else body = h('div', {class: 'grid'},
    form('Quên mật khẩu', [field('Email đã đăng ký', input('email', 'email', {autocomplete: 'email'}))], 'Gửi yêu cầu',
      async (v, msg) => { const r = await post('/api/auth/forgot', v); msg.style.color = 'var(--ok)'; msg.textContent = r.message; }),
    form('Đặt lại bằng mã từ quản trị viên', [field('Email', input('email', 'email')), field('Mã đặt lại', input('code', 'text', {autocomplete: 'one-time-code'})), field('Mật khẩu mới', input('new_password', 'password', {minLength: 8, autocomplete: 'new-password'}))], 'Đặt lại mật khẩu',
      async v => { await post('/api/auth/reset', {...v, code: v.code.trim().toUpperCase()}); tab = 'login'; render(); toast('Đã đặt lại mật khẩu. Hãy đăng nhập.'); }));
  return [switcher, body];
}

function signedIn(user) {
  const admin = user.role === 'admin';
  const profile = h('div', {class: 'card acct-form'},
    h('div', {style: {display: 'flex', gap: '12px', alignItems: 'center'}}, h('span', {class: 'acct-av', style: {width: '44px', height: '44px', fontSize: '18px'}}, (user.display_name || '?').trim().charAt(0).toUpperCase()),
      h('div', null, h('h2', null, user.display_name), h('div', {class: 'muted small'}, `${user.email} · ${admin ? 'Quản trị viên (toàn quyền)' : 'Người dùng (chỉ xem và thống kê)'}`))),
    h('div', {class: 'dlg-actions', style: {justifyContent: 'flex-start', flexWrap: 'wrap'}},
      admin && h('a', {class: 'btn', href: url('admin.html')}, icon('lock', 16), 'Trang quản trị'),
      h('button', {class: 'btn', type: 'button', on: {click: async () => { try { await post('/api/auth/logout'); } finally { await loadSession(); toast('Đã đăng xuất.'); location.hash = '#/'; } }}}, 'Đăng xuất')));
  const pw = form('Đổi mật khẩu', [field('Mật khẩu hiện tại', input('current_password', 'password', {autocomplete: 'current-password'})), field('Mật khẩu mới', input('new_password', 'password', {minLength: 8, autocomplete: 'new-password'}), 'Ít nhất 8 ký tự')], 'Lưu mật khẩu mới',
    async (v, msg) => { await post('/api/auth/change-password', v); msg.style.color = 'var(--ok)'; msg.textContent = 'Đã đổi mật khẩu. Các thiết bị khác phải đăng nhập lại.'; });
  const confirm = h('input', {type: 'checkbox', name: 'sure', required: true});
  const del = form('Xóa tài khoản của tôi', [
    h('p', {class: 'small', style: {margin: 0}}, 'Tài khoản, tên hiển thị, email và các phiên đăng nhập của bạn sẽ bị xóa vĩnh viễn và không khôi phục được. Số liệu nghiên cứu không bị ảnh hưởng.'),
    field('Nhập mật khẩu để xác nhận', input('password', 'password', {autocomplete: 'current-password'})),
    h('label', {class: 'check'}, confirm, 'Tôi hiểu việc xóa không thể hoàn tác')], 'Xóa vĩnh viễn',
    async v => { await post('/api/auth/delete-account', {password: v.password}); await loadSession(); toast('Đã xóa tài khoản của bạn.'); location.hash = '#/'; });
  del.classList.add('danger-zone'); del.querySelector('button[type=submit]').className = 'btn danger solid';
  if (admin) del.append(h('p', {class: 'small muted', style: {margin: 0}}, 'Quản trị viên cuối cùng không thể tự xóa; hãy chuyển quyền cho người khác trước.'));
  return [profile, h('div', {class: 'grid acct-cols'}, pw, del)];
}

function render() {
  if (!root) return;
  const intro = h('header', {class: 'page-head'}, h('p', null, 'Ai cũng xem được bản đồ, xếp hạng và thống kê mà không cần tài khoản. Tài khoản dùng để quản trị và lưu thông tin cá nhân; bạn luôn có quyền tự xóa tài khoản của mình.'));
  if (!env.api) { mount(root, intro, h('div', {class: 'callout'}, 'Bản xem thử không có máy chủ nên không có tài khoản. Hãy dùng bản đầy đủ để đăng nhập.')); return; }
  mount(root, intro, ...(session.user ? signedIn(session.user) : guest()));
}

export function init(section) {
  root = h('div', {class: 'page acct-page'});
  section.append(root);
  onSession(render);
}
export function show() { render(); }
