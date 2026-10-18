/** Server access. The session cookie is kept by the OS network stack; the CSRF token comes from /api/session and goes in `X-Token`. */
import {API_BASE} from './config';

export interface User {id: number; email: string; display_name: string; role: 'customer' | 'admin'; is_active?: boolean; created_at?: string; last_login_at?: string}
export const session: {user: User | null; token: string} = {user: null, token: ''};
const listeners = new Set<() => void>();
export const onSession = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const emit = () => listeners.forEach(fn => fn());

export class ApiError extends Error {status: number; constructor(message: string, status: number) { super(message); this.status = status; }}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 25000): Promise<T> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path.startsWith('http') ? path : API_BASE + path, {credentials: 'include', ...init, signal: controller.signal});
    let data: any = null;
    try { data = await response.json(); } catch { /* not JSON */ }
    if (!response.ok) throw new ApiError(data?.error || (typeof data?.detail === 'string' ? data.detail : '') || `Không tải được ${path} (${response.status})`, response.status);
    return data as T;
  } catch (error: any) {
    if (error?.name === 'AbortError') throw new ApiError('Máy chủ phản hồi quá lâu. Kiểm tra mạng rồi thử lại.', 0);
    if (error instanceof ApiError) throw error;
    throw new ApiError('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.', 0);
  } finally { clearTimeout(timer); }
}
export const get = <T = any>(path: string, timeoutMs?: number) => request<T>(path, {}, timeoutMs);

async function write<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!session.token) await loadSession();
  return request<T>(path, {method, headers: {'Content-Type': 'application/json', 'X-Token': session.token}, body: body === undefined ? undefined : JSON.stringify(body)});
}
export const post = <T = any>(path: string, body: unknown = {}) => write<T>('POST', path, body);
export const del = <T = any>(path: string) => write<T>('DELETE', path);

export async function loadSession() {
  try { const data = await request<{user: User | null; token: string}>('/api/session', {}, 15000); session.user = data.user; session.token = data.token; }
  catch { session.user = null; session.token = ''; }
  emit();
  return session;
}
export const isAdmin = () => session.user?.role === 'admin';

export async function login(email: string, password: string) { const r = await request<{user: User; token: string}>('/api/auth/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email, password})}); session.user = r.user; session.token = r.token; emit(); return r.user; }
export async function register(email: string, display_name: string, password: string) { const r = await request<{user: User; token: string}>('/api/auth/register', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email, display_name, password})}); session.user = r.user; session.token = r.token; emit(); return r.user; }
export async function logout() { try { await request('/api/auth/logout', {method: 'POST', headers: {'X-Token': session.token}}); } finally { session.user = null; session.token = ''; emit(); await loadSession(); } }
