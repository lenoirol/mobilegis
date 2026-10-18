/* Server access. Session + CSRF token are refreshed on demand; errors carry the server's Vietnamese message. */
export const session = {user: null, token: ''};
/** Base of the app (works at "/" and at a sub-path such as /mobilegis/ on GitHub Pages). Plain string concat keeps {z}/{x}/{y} intact. */
const BASE = new URL('./', document.baseURI).href;
export const url = path => /^([a-z]+:)?\/\//i.test(path) ? path : BASE + String(path).replace(/^\//, '');
/** Static demo: the page is served without the FastAPI server (e.g. GitHub Pages). Set once at boot by detectApi(). */
export const env = {api: true};
export async function detectApi() {
  try { const r = await fetch(url('api/health'), {cache: 'no-store'}); env.api = r.ok && (r.headers.get('content-type') || '').includes('json'); }
  catch (_) { env.api = false; }
  document.body.classList.toggle('is-static', !env.api);
  return env.api;
}
const listeners = new Set();
export const onSession = fn => { listeners.add(fn); return () => listeners.delete(fn); };

const urlOf = url;
async function request(target, options = {}) {
  const response = await fetch(urlOf(target), {credentials: 'same-origin', ...options});
  let data = null;
  try { data = await response.json(); } catch (_) { /* non-JSON body */ }
  if (!response.ok) {
    const error = new Error(data?.error || (typeof data?.detail === 'string' ? data.detail : '') || `Không tải được ${target}`);
    error.status = response.status; throw error;
  }
  return data;
}
export const get = target => request(target);
export async function post(target, body = {}) {
  if (!env.api) throw new Error('Bản demo tĩnh không có máy chủ nên không thực hiện được thao tác này.');
  if (!session.token) await loadSession();
  return request(target, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Token': session.token}, body: JSON.stringify(body)});
}
export async function loadSession() {
  if (!env.api) { session.user = null; session.token = ''; for (const fn of listeners) fn(session); return session; }
  try {
    const data = await request('/api/session');
    session.user = data.user; session.token = data.token;
  } catch (_) { session.user = null; session.token = ''; }
  for (const fn of listeners) fn(session);
  return session;
}
/** Anonymous usage counter (which page, area or layer was opened). Fire and forget; nothing identifies the visitor. */
let lastHit = '';
export function track(kind, key) {
  const id = kind + ':' + key;
  if (!env.api || id === lastHit) return;
  lastHit = id;
  fetch(url('api/hit'), {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({kind, key}), keepalive: true}).catch(() => {});
}
export const isAdmin = () => session.user?.role === 'admin';
