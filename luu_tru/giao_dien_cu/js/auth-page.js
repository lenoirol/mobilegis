/* Login / register / forgot-password page. Talks only to /api/auth/*. */
(() => {
  const $ = s => document.querySelector(s);
  const panels = {login: $('#panelLogin'), register: $('#panelRegister'), forgot: $('#panelForgot')};
  const message = $('#authMessage');

  // Only follow same-site relative paths; ignore anything that could redirect elsewhere.
  const next = (() => {
    const value = new URLSearchParams(location.search).get('next') || '';
    return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '';
  })();

  function show(name) {
    for (const [key, node] of Object.entries(panels)) node.hidden = key !== name;
    $('#tabLogin').ariaSelected = String(name === 'login');
    $('#tabRegister').ariaSelected = String(name === 'register');
    $('.auth-tabs').hidden = name === 'forgot';
    notify('');
    panels[name].querySelector('input')?.focus();
  }
  function notify(text, kind = 'error') {
    message.hidden = !text; message.textContent = text; message.className = 'auth-message ' + kind;
  }
  async function post(url, body) {
    const response = await fetch(url, {method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Có lỗi xảy ra, thử lại sau.');
    return data;
  }
  const values = form => Object.fromEntries(new FormData(form));
  async function guarded(form, action) {
    const button = form.querySelector('.auth-submit');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    button.disabled = true;
    try { await action(values(form)); } catch (error) { notify(error.message); } finally { button.disabled = false; }
  }
  const enter = data => { location.replace(next || (data.user.role === 'admin' ? '/admin.html' : '/')); };

  $('#tabLogin').onclick = () => show('login');
  $('#tabRegister').onclick = () => show('register');
  $('#toForgot').onclick = () => show('forgot');
  $('#toLogin').onclick = () => show('login');
  document.querySelectorAll('.auth-eye').forEach(button => button.onclick = () => {
    const input = button.previousElementSibling, hidden = input.type === 'password';
    input.type = hidden ? 'text' : 'password'; button.textContent = hidden ? 'Ẩn' : 'Hiện';
    button.ariaLabel = hidden ? 'Ẩn mật khẩu' : 'Hiện mật khẩu';
  });

  panels.login.onsubmit = e => { e.preventDefault(); guarded(panels.login, async v => enter(await post('/api/auth/login', v))); };
  panels.register.onsubmit = e => {
    e.preventDefault();
    guarded(panels.register, async v => {
      if (v.password !== v.confirm) throw new Error('Hai mật khẩu nhập vào chưa giống nhau.');
      enter(await post('/api/auth/register', {display_name: v.display_name, email: v.email, password: v.password}));
    });
  };
  $('#formForgot').onsubmit = e => {
    e.preventDefault();
    guarded($('#formForgot'), async v => { const r = await post('/api/auth/forgot', v); notify(r.message, 'ok'); });
  };
  $('#formReset').onsubmit = e => {
    e.preventDefault();
    guarded($('#formReset'), async v => {
      await post('/api/auth/reset', {...v, code: v.code.trim().toUpperCase()});
      show('login'); notify('Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.', 'ok');
    });
  };

  // Already signed in? Go straight to the app instead of showing the form again.
  fetch('/api/session', {credentials: 'same-origin'}).then(r => r.json()).then(s => { if (s.user) enter(s); }).catch(() => {});
  if (new URLSearchParams(location.search).get('tab') === 'register') show('register');
})();
