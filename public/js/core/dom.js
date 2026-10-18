/* Tiny DOM helpers. Text is always inserted as text nodes (never innerHTML) so user data cannot inject markup. */
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const SVG_NS = 'http://www.w3.org/2000/svg';

function apply(node, props) {
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') node.setAttribute('class', value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'on') for (const [event, handler] of Object.entries(value)) node.addEventListener(event, handler);
    else if (key in node && !(node instanceof SVGElement)) node[key] = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
}
function append(node, kids) {
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return node;
}
export function h(tag, props, ...kids) {
  const node = document.createElement(tag);
  apply(node, props);
  return append(node, kids);
}
export function svg(tag, attrs, ...kids) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs || {})) if (value != null && value !== false) node.setAttribute(key, value);
  return append(node, kids);
}
/** Replace all children of `node` with `kids`. */
export function mount(node, ...kids) { node.replaceChildren(); return append(node, kids); }

const ICONS = {
  map: '<path d="M9 4 3 6.5v14L9 18l6 2.5 6-2.5v-14L15 6.5 9 4Z"/><path d="M9 4v14M15 6.5v14"/>',
  table: '<rect x="3" y="4" width="18" height="16"/><path d="M3 10h18M3 15h18M9 4v16"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  flask: '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3"/><path d="M7.5 15h9"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  play: '<path d="M7 4v16l13-8Z"/>', pause: '<path d="M7 4v16M17 4v16"/>',
  locate: '<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
  extent: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5M5 14v7h14v-7"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  x: '<path d="M5 5l14 14M19 5 5 19"/>', check: '<path d="m4 12 5 5 11-11"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>', up: '<path d="m6 15 6-6 6 6"/>',
  lock: '<rect x="5" y="11" width="14" height="10"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  compare: '<path d="M12 3v18M4 7h5M4 12h5M4 17h5M15 9h5M15 14h5"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  grid: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>',
  alert: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v5M12 17.5v.5"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
};
/** Inline SVG icon from the static set above (trusted markup, not user data). */
export function icon(name, size = 20) {
  const node = svg('svg', {viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 2,
    'stroke-linecap': 'square', 'stroke-linejoin': 'miter', 'aria-hidden': 'true', focusable: 'false'});
  node.innerHTML = ICONS[name] || '';
  return node;
}
