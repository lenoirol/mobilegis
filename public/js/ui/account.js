import {h, mount, icon} from '../core/dom.js';
import {session, post, loadSession, onSession} from '../core/api.js';
import {toast} from './toast.js';

/** Header account chip: guest → "Đăng nhập"; signed in → avatar menu (admin page, change password, sign out). */
export function mountAccount(host) {
  const render = () => {
    const user = session.user;
    if (!user) {
      mount(host, h('a', {class: 'btn primary sm', href: '/login.html?next=' + encodeURIComponent(location.pathname + location.hash)}, icon('user', 16), 'Đăng nhập'));
      return;
    }
    const admin = user.role === 'admin';
    const menu = h('div', {class: 'acct-menu', role: 'menu', hidden: true},
      h('div', {class: 'acct-who'}, h('strong', null, user.display_name), h('small', null, `${user.email} · ${admin ? 'Quản trị viên' : 'Khách hàng'}`)),
      admin && h('a', {href: '/admin.html', role: 'menuitem'}, 'Trang quản trị'),
      h('button', {type: 'button', role: 'menuitem', on: {click: () => { menu.hidden = true; passwordDialog(); }}}, 'Đổi mật khẩu'),
      h('button', {type: 'button', role: 'menuitem', on: {click: async () => { try { await post('/api/auth/logout'); } finally { location.reload(); } }}}, 'Đăng xuất'));
    const button = h('button', {class: 'acct-btn', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: user.email,
      on: {click: e => { e.stopPropagation(); menu.hidden = !menu.hidden; button.setAttribute('aria-expanded', String(!menu.hidden)); }}},
      h('span', {class: 'acct-av'}, (user.display_name || '?').trim().charAt(0).toUpperCase()), h('span', {class: 'acct-name'}, user.display_name));
    mount(host, button, menu);
    document.addEventListener('click', () => { menu.hidden = true; button.setAttribute('aria-expanded', 'false'); }, {once: true});
  };
  onSession(render);
  render();
}

function passwordDialog() {
  const current = h('input', {class: 'input', type: 'password', required: true, autocomplete: 'current-password'});
  const next = h('input', {class: 'input', type: 'password', required: true, minLength: 8, autocomplete: 'new-password'});
  const message = h('p', {class: 'small', role: 'alert', style: {color: 'var(--err)', fontWeight: 700, minHeight: '1.2em', margin: 0}});
  const dialog = h('dialog', null, h('form', {class: 'dlg-form', method: 'dialog', on: {submit: async e => {
    e.preventDefault();
    try {
      await post('/api/auth/change-password', {current_password: current.value, new_password: next.value});
      dialog.close(); dialog.remove(); toast('Đã đổi mật khẩu. Các thiết bị khác phải đăng nhập lại.'); await loadSession();
    } catch (error) { message.textContent = error.message; }
  }}},
    h('h2', null, 'Đổi mật khẩu'),
    h('label', {class: 'field'}, h('span', null, 'Mật khẩu hiện tại'), current),
    h('label', {class: 'field'}, h('span', null, 'Mật khẩu mới · ít nhất 8 ký tự'), next), message,
    h('div', {class: 'dlg-actions'}, h('button', {class: 'btn', type: 'button', on: {click: () => { dialog.close(); dialog.remove(); }}}, 'Hủy'), h('button', {class: 'btn primary', type: 'submit'}, 'Lưu'))));
  document.body.append(dialog); dialog.showModal();
}
