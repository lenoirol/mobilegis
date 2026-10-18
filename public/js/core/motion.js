/* Motion helpers. Everything degrades to instant when the user asks for reduced motion. */
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeOut = t => 1 - Math.pow(1 - t, 3);

/** Count a number up (or between values) inside `node`; `format` turns a number into text. */
export function countTo(node, to, format = v => Math.round(v).toLocaleString('vi-VN'), duration = 700) {
  if (!Number.isFinite(to)) { node.textContent = '—'; return; }
  const from = Number(node.dataset.v ?? 0); node.dataset.v = to;
  if (reduced() || from === to) { node.textContent = format(to); return; }
  const start = performance.now(), token = node._tick = Symbol();
  (function step(now) {
    if (node._tick !== token) return;
    const t = Math.min(1, (now - start) / duration);
    node.textContent = format(from + (to - from) * easeOut(t));
    if (t < 1) requestAnimationFrame(step);
  })(start);
}

/** Run a DOM swap inside a View Transition when supported (cross-fade + slide), else plainly. */
export function transition(swap) {
  if (document.startViewTransition && !reduced()) {
    let applied = false;
    const run = () => { applied = true; swap(); };
    try {
      const t = document.startViewTransition(run);
      t.finished.catch(() => {}); t.ready.catch(() => {});   // aborted transitions (e.g. viewport resize) are harmless
      return t.updateCallbackDone.catch(() => { if (!applied) run(); });
    } catch (_) { if (!applied) run(); return Promise.resolve(); }
  }
  swap(); return Promise.resolve();
}

/** Stagger-reveal the direct children of `root` (uses the .reveal class and --i delay). */
export function stagger(root, selector = ':scope > *') {
  root.querySelectorAll(selector).forEach((node, i) => { node.classList.add('reveal'); node.style.setProperty('--i', Math.min(i, 12)); });
}

/** Draw an SVG path with a stroke animation. */
export function drawPath(path, ms = 800) {
  if (reduced()) return;
  const length = path.getTotalLength?.() || 0;
  if (!length) return;
  path.style.strokeDasharray = length; path.style.strokeDashoffset = length;
  path.getBoundingClientRect();
  path.style.transition = `stroke-dashoffset ${ms}ms cubic-bezier(.2,.8,.2,1)`; path.style.strokeDashoffset = 0;
  setTimeout(() => { path.style.strokeDasharray = ''; path.style.transition = ''; }, ms + 60);
}
