/* Admin console: accounts, password-reset requests, security log, system overview.
   All text is inserted with textContent (display names are user-provided). */
(() => {
  const $ = s => document.querySelector(s);
  let csrf = '', me = null, users = [];

  const el = (tag, attrs = {}, ...kids) => { const n = Object.assign(document.createElement(tag), attrs); n.append(...kids); return n; };
  const when = iso => iso ? new Date(iso).toLocaleString('vi-VN', {dateStyle: 'short', timeStyle: 'short'}) : '—';
  const EVENTS = {register: 'Đăng ký', login: 'Đăng nhập', login_failed: 'Đăng nhập sai', password_changed: 'Đổi mật khẩu', reset_requested: 'Yêu cầu đặt lại',
    reset_issued: 'Cấp mã đặt lại', reset_cancelled: 'Hủy yêu cầu', password_reset: 'Đã đặt lại mật khẩu', role_changed: 'Đổi vai trò',
    activated: 'Kích hoạt', deactivated: 'Vô hiệu hóa', user_deleted: 'Xóa tài khoản', admin_created: 'Tạo quản trị viên'};

  function toast(text, error) {
    const t = $('#toast'); t.textContent = text; t.className = 'toast' + (error ? ' error' : ''); t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 4500);
  }
  async function api(url, options = {}) {
    const response = await fetch(url, {credentials: 'same-origin', ...options,
      headers: {'Content-Type': 'application/json', ...(options.method && options.method !== 'GET' ? {'X-Token': csrf} : {})},
      body: options.body === undefined ? undefined : JSON.stringify(options.body)});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Có lỗi xảy ra.');
    return data;
  }
  const act = async (fn, okText) => { try { await fn(); if (okText) toast(okText); await refresh(); } catch (e) { toast(e.message, true); } };

  // ---- renderers ----------------------------------------------------------------
  function renderOverview(info, resets) {
    const active = users.filter(u => u.is_active).length;
    $('#cards').replaceChildren(...[[users.length, 'Tài khoản'], [users.filter(u => u.role === 'admin').length, 'Quản trị viên'], [active, 'Đang hoạt động'],
      [resets.filter(r => r.status === 'pending').length, 'Yêu cầu chờ xử lý']].map(([n, label]) => el('div', {className: 'card'}, el('strong', {}, String(n)), el('span', {}, label))));
    const rows = [['Phiên bản', info.version], ['PostgreSQL / PostGIS', `${info.database.postgres_version} / ${info.database.postgis}`],
      ['Phiên bản schema', String(info.database.schema_version)],
      ['Nguồn dữ liệu', info.database.datasets.map(d => `${d.dataset_id}: ${d.rows.toLocaleString('vi-VN')} dòng`).join(' · ')],
      ['Bảng chỉ số hiện trạng', info.database.metric_tables.map(m => `${m.table}: ${m.rows.toLocaleString('vi-VN')}`).join(' · ')]];
    $('#systemRows').replaceChildren(...rows.map(([k, v]) => el('tr', {}, el('th', {scope: 'row'}, k), el('td', {}, v))));
  }

  function renderUsers() {
    const body = $('#userRows');
    body.replaceChildren(...users.map(u => {
      const self = u.id === me.id;
      const role = el('select', {ariaLabel: 'Vai trò của ' + u.display_name, disabled: self},
        el('option', {value: 'customer'}, 'Khách hàng'), el('option', {value: 'admin'}, 'Quản trị viên'));
      role.value = u.role;
      role.onchange = () => act(() => api(`/api/admin/users/${u.id}/role`, {method: 'POST', body: {role: role.value}}), 'Đã đổi vai trò.');
      const toggle = el('button', {className: 'btn small', type: 'button', disabled: self}, u.is_active ? 'Vô hiệu hóa' : 'Kích hoạt');
      toggle.onclick = () => act(() => api(`/api/admin/users/${u.id}/active`, {method: 'POST', body: {active: !u.is_active}}), u.is_active ? 'Đã vô hiệu hóa.' : 'Đã kích hoạt.');
      const del = el('button', {className: 'btn small danger', type: 'button', disabled: self}, 'Xóa');
      del.onclick = () => { if (confirm(`Xóa tài khoản ${u.email}? Không hoàn tác được.`)) act(() => api(`/api/admin/users/${u.id}`, {method: 'DELETE'}), 'Đã xóa tài khoản.'); };
      return el('tr', {}, el('td', {}, u.display_name + (self ? ' (bạn)' : ''), el('small', {}, u.email)),
        el('td', {}, el('span', {className: 'pill ' + u.role}, u.role === 'admin' ? 'Quản trị' : 'Khách hàng')),
        el('td', {}, el('span', {className: 'pill ' + (u.is_active ? 'on' : 'off')}, u.is_active ? 'Hoạt động' : 'Đã khóa')),
        el('td', {}, when(u.created_at)), el('td', {}, when(u.last_login_at)),
        el('td', {}, el('div', {className: 'row-actions'}, role, toggle, del)));
    }));
  }

  function renderResets(resets) {
    const badge = $('#resetCount'), pending = resets.filter(r => r.status === 'pending').length;
    badge.hidden = !pending; badge.textContent = pending;
    const body = $('#resetRows');
    if (!resets.length) { body.replaceChildren(el('tr', {}, el('td', {colSpan: 5, className: 'empty'}, 'Không có yêu cầu nào đang chờ.'))); return; }
    body.replaceChildren(...resets.map(r => {
      const issue = el('button', {className: 'btn small primary', type: 'button'}, r.status === 'issued' ? 'Cấp mã mới' : 'Cấp mã');
      issue.onclick = () => act(async () => {
        const result = await api(`/api/admin/resets/${r.id}/issue`, {method: 'POST', body: {}});
        const box = $('#codeBox');
        box.replaceChildren(el('strong', {}, `Mã đặt lại cho ${r.email}`), el('br'), el('code', {}, result.code), el('br'),
          el('span', {}, `Hiệu lực ${result.valid_minutes} phút. ${result.message}`));
        box.hidden = false; box.scrollIntoView({behavior: 'smooth', block: 'nearest'});
      });
      const cancel = el('button', {className: 'btn small', type: 'button'}, 'Hủy');
      cancel.onclick = () => act(() => api(`/api/admin/resets/${r.id}/cancel`, {method: 'POST', body: {}}), 'Đã hủy yêu cầu.');
      return el('tr', {}, el('td', {}, r.display_name, el('small', {}, r.email)),
        el('td', {}, el('span', {className: 'pill ' + r.status}, r.status === 'pending' ? 'Chờ cấp mã' : 'Đã cấp mã')),
        el('td', {}, when(r.requested_at)), el('td', {}, r.expires_at ? when(r.expires_at) : '—'), el('td', {}, el('div', {className: 'row-actions'}, issue, cancel)));
    }));
  }

  function renderEvents(events) {
    $('#eventRows').replaceChildren(...events.map(e => el('tr', {}, el('td', {}, when(e.created_at)), el('td', {}, EVENTS[e.event] || e.event), el('td', {}, e.email || '—'), el('td', {}, e.detail || ''))));
    if (!events.length) $('#eventRows').append(el('tr', {}, el('td', {colSpan: 4, className: 'empty'}, 'Chưa có sự kiện.')));
  }

  async function refresh() {
    const [list, resets, events, info] = await Promise.all([api('/api/admin/users'), api('/api/admin/resets'), api('/api/admin/events'), api('/api/info')]);
    users = list; renderOverview(info, resets); renderUsers(); renderResets(resets); renderEvents(events);
  }

  // ---- start ----------------------------------------------------------------------
  function selectTab(name) {
    document.querySelectorAll('.admin-tabs button').forEach(b => { const on = b.dataset.tab === name; b.classList.toggle('active', on); b.ariaSelected = String(on); });
    document.querySelectorAll('.admin-panel').forEach(p => { p.hidden = p.id !== 'tab-' + name; });
  }
  document.querySelectorAll('.admin-tabs button').forEach(b => b.onclick = () => selectTab(b.dataset.tab));
  $('#logout').onclick = async () => { await fetch('/api/auth/logout', {method: 'POST', credentials: 'same-origin'}); location.href = '/login.html'; };

  (async () => {
    let session;
    try { session = await (await fetch('/api/session', {credentials: 'same-origin'})).json(); } catch (_) { session = {user: null}; }
    if (!session.user) { location.replace('/login.html?next=/admin.html'); return; }
    if (session.user.role !== 'admin') { $('#denied').hidden = false; $('#logout').hidden = true; return; }
    me = session.user; csrf = session.token; $('#who').textContent = me.display_name;
    $('#app').hidden = false;
    try { await refresh(); } catch (e) { toast(e.message, true); }
  })();
})();
