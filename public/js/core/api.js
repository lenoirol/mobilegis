/* Server access. Session + CSRF token are refreshed on demand; errors carry the server's Vietnamese message. */
export const session = {user: null, token: ''};
const listeners = new Set();
export const onSession = fn => { listeners.add(fn); return () => listeners.delete(fn); };

async function request(url, options = {}) {
  const response = await fetch(url, {credentials: 'same-origin', ...options});
  let data = null;
  try { data = await response.json(); } catch (_) { /* non-JSON body */ }
  if (!response.ok) {
    const error = new Error(data?.error || (typeof data?.detail === 'string' ? data.detail : '') || `Không tải được ${url}`);
    error.status = response.status; throw error;
  }
  return data;
}
export const get = url => request(url);
export async function post(url, body = {}) {
  if (!session.token) await loadSession();
  return request(url, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Token': session.token}, body: JSON.stringify(body)});
}
export async function loadSession() {
  try {
    const data = await request('/api/session');
    session.user = data.user; session.token = data.token;
  } catch (_) { session.user = null; session.token = ''; }
  for (const fn of listeners) fn(session);
  return session;
}
export const isAdmin = () => session.user?.role === 'admin';
