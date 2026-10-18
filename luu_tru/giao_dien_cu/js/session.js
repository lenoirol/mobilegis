/* Session and account menu for the main app. Server enforces permissions; this only shapes the UI.
   Exposes window.MG = {user, token, isAdmin, ready}. Roles: guest (no user), customer, admin. */
(() => {
  const MG = window.MG = {user: null, token: '', isAdmin: false};
  const api = async (url, body, token) => {
    const response = await fetch(url, body === undefined ? {credentials: 'same-origin'} : {
      method: 'POST', credentials: 'same-origin',
      headers: {'Content-Type': 'application/json', ...(token ? {'X-Token': token} : {})}, body: JSON.stringify(body)});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Có lỗi xảy ra.');
    return data;
  };
  MG.api = api;

  const el = (tag, attrs = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), attrs);
    node.append(...children);
    return node;
  };

  function applyRole() {
    const role = MG.user ? MG.user.role : 'guest';
    document.body.classList.remove('is-guest', 'is-customer', 'is-admin');
    document.body.classList.add('is-' + role);
    MG.isAdmin = role === 'admin';
    if (typeof state !== 'undefined') state.token = MG.token;
  }

  function accountBox() {
    const box = document.getElementById('account') || el('div', {id: 'account'});
    box.replaceChildren();
    if (!MG.user) {
      box.append(el('a', {className: 'account-login', href: '/login.html?next=' + encodeURIComponent(location.pathname)}, 'Đăng nhập'));
    } else {
      const roleName = MG.isAdmin ? 'Quản trị viên' : 'Khách hàng';
      const button = el('button', {className: 'account-chip', type: 'button', title: MG.user.email, ariaHaspopup: 'menu', ariaExpanded: 'false'},
        el('span', {className: 'account-avatar'}, (MG.user.display_name || '?').trim().charAt(0).toUpperCase()),
        el('span', {className: 'account-name'}, MG.user.display_name));
      const menu = el('div', {className: 'account-menu', role: 'menu', hidden: true},
        el('div', {className: 'account-who'}, el('strong', {}, MG.user.display_name), el('small', {}, `${MG.user.email} · ${roleName}`)));
      if (MG.isAdmin) menu.append(el('a', {href: '/admin.html', role: 'menuitem'}, 'Trang quản trị'));
      const password = el('button', {type: 'button', role: 'menuitem'}, 'Đổi mật khẩu');
      const logout = el('button', {type: 'button', role: 'menuitem'}, 'Đăng xuất');
      password.onclick = () => { menu.hidden = true; passwordDialog(); };
      logout.onclick = async () => { try { await api('/api/auth/logout', {}); } finally { location.reload(); } };
      menu.append(password, logout);
      button.onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; button.ariaExpanded = String(!menu.hidden); };
      document.addEventListener('click', () => { menu.hidden = true; });
      box.append(button, menu);
    }
    if (!box.isConnected) document.querySelector('body > header').append(box);
  }

  function passwordDialog() {
    const dialog = el('dialog', {className: 'account-dialog'});
    const current = el('input', {type: 'password', required: true, autocomplete: 'current-password'});
    const next = el('input', {type: 'password', required: true, minLength: 8, autocomplete: 'new-password'});
    const message = el('p', {className: 'account-message', role: 'alert'});
    const form = el('form', {method: 'dialog'},
      el('h2', {}, 'Đổi mật khẩu'),
      el('label', {}, 'Mật khẩu hiện tại', current), el('label', {}, 'Mật khẩu mới (ít nhất 8 ký tự)', next), message,
      el('div', {className: 'account-actions'}, el('button', {type: 'button', id: 'pwCancel'}, 'Hủy'), el('button', {type: 'submit', className: 'primary'}, 'Lưu')));
    form.onsubmit = async e => {
      e.preventDefault();
      try {
        await api('/api/auth/change-password', {current_password: current.value, new_password: next.value}, MG.token);
        dialog.close(); dialog.remove(); if (typeof toast === 'function') toast('Đã đổi mật khẩu. Các thiết bị khác phải đăng nhập lại.');
      } catch (err) { message.textContent = err.message; }
    };
    form.querySelector('#pwCancel').onclick = () => { dialog.close(); dialog.remove(); };
    dialog.append(form);
    document.body.append(dialog);
    dialog.showModal();
  }

  function adminNotices() {
    // Short explanation where an admin-only control is hidden for customers and guests.
    const notice = el('p', {className: 'admin-only-note small muted'},
      'Chỉ quản trị viên được thêm dữ liệu demo hoặc lưu giả lập. ',
      MG.user ? 'Tài khoản của bạn có quyền xem.' : el('a', {href: '/login.html'}, 'Đăng nhập'), MG.user ? '' : ' để tiếp tục.');
    const form = document.getElementById('scenarioForm');
    if (form && !form.parentNode.querySelector('.admin-only-note')) form.after(notice);
    const heading = document.querySelector('#dataView .dataHeading');
    if (heading && !document.querySelector('#dataView .admin-only-note')) heading.after(notice.cloneNode(true));
  }

  MG.ready = (async () => {
    try {
      const session = await api('/api/session');
      MG.user = session.user; MG.token = session.token;
    } catch (_) { /* offline or server down: stay guest */ }
    applyRole(); accountBox(); adminNotices();
  })();
  // The scenario form is built by another script after load; add its note once it exists.
  window.addEventListener('load', () => MG.ready.then(adminNotices));
})();
