/* Anonymous usage counters and error counts. No identifiers are sent (the server keeps only per-day totals by kind and key).
   Failures are ignored: tracking must never get in the way. */
import {env, url} from './api.js';

const sent = new Set();
export function hit(kind, key, once = false) {
  if (!env.api) return;
  const id = kind + ':' + key;
  if (once && sent.has(id)) return;
  sent.add(id);
  try { fetch(url('api/hit'), {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({kind, key}), keepalive: true}).catch(() => {}); } catch (_) { /* ignore */ }
}
let errors = 0;
export function watchErrors() {
  const report = () => { if (errors++ < 3) hit('error', 'js'); };   // at most 3 per page load
  window.addEventListener('error', report);
  window.addEventListener('unhandledrejection', report);
}
