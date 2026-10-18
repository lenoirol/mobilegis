/* Locator ("bản đồ định vị"): a small inset that places the study area in the world, in Việt Nam and inside the city.
   World and Việt Nam outlines are pre-projected SVG paths (data/locator.json, Natural Earth); the city level is drawn
   from the app's own 167 boundaries and shows the part of the city the main map is looking at. Works offline. */
import {h, svg, icon, mount} from '../core/dom.js';
import {get} from '../core/api.js';
import {shortName} from '../core/format.js';

const LEVELS = [
  {id: 'world', label: 'Thế giới'},
  {id: 'vietnam', label: 'Việt Nam'},
  {id: 'city', label: 'TP.HCM'},
];
const W = 240, H = 160;

/** Equirectangular projection fitted to the commune boundaries (cos-lat corrected), so the client can place the viewport box. */
function cityProjection(geo) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const walk = c => typeof c[0] === 'number' ? (x0 = Math.min(x0, c[0]), x1 = Math.max(x1, c[0]), y0 = Math.min(y0, c[1]), y1 = Math.max(y1, c[1])) : c.forEach(walk);
  geo.features.forEach(f => walk(f.geometry.coordinates));
  const k = Math.cos((y0 + y1) / 2 * Math.PI / 180), pad = 8;
  const s = Math.min((W - 2 * pad) / ((x1 - x0) * k), (H - 2 * pad) / (y1 - y0));
  const ox = (W - (x1 - x0) * k * s) / 2, oy = (H - (y1 - y0) * s) / 2;
  const project = (lng, lat) => [ox + (lng - x0) * k * s, oy + (y1 - lat) * s];
  const invert = (x, y) => [(x - ox) / (k * s) + x0, y1 - (y - oy) / s];
  return {project, invert};
}
const ringPath = (ring, project) => ring.map(([lng, lat], i) => { const [x, y] = project(lng, lat); return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); }).join('') + 'Z';
function featurePath(f, project) {
  const g = f.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return polys.map(p => p.map(r => ringPath(r, project)).join('')).join('');
}

export function createLocator({onFocus, onFitAll}) {
  let level = 'world', geo = null, base = null, proj = null, cityPaths = null, view = null, selected = null, open = true;
  const art = h('div', {class: 'loc-art'});
  const caption = h('p', {class: 'loc-cap'});
  const tabs = LEVELS.map(l => h('button', {type: 'button', class: 'loc-tab', dataset: {level: l.id}, 'aria-pressed': 'false', on: {click: () => { level = l.id; render(); }}}, l.label));
  const close = h('button', {type: 'button', class: 'loc-x', 'aria-label': 'Ẩn bản đồ định vị', on: {click: () => setOpen(false)}}, icon('x', 14));
  const el = h('section', {class: 'locator', 'aria-label': 'Bản đồ định vị'},
    h('div', {class: 'loc-head'}, h('b', null, 'Bản đồ định vị'), close),
    h('div', {class: 'loc-tabs', role: 'group', 'aria-label': 'Cấp hiển thị'}, ...tabs), art, caption);

  get('/data/locator.json').then(d => { base = d; render(); }).catch(() => { base = false; render(); });

  function setOpen(v) { open = v; el.hidden = !v; listeners.forEach(fn => fn(v)); }
  const listeners = new Set();

  function frame(...kids) {
    return svg('svg', {viewBox: `0 0 ${W} ${H}`, role: 'img', class: 'loc-svg'}, ...kids);
  }
  const dot = (x, y, label, dx = 7) => [
    svg('circle', {cx: x, cy: y, r: 9, class: 'loc-pulse'}),
    svg('circle', {cx: x, cy: y, r: 4, class: 'loc-dot'}),
    label ? svg('text', {x: x + dx, y: y + 4, class: 'loc-label'}, label) : null,
  ];

  function drawWorld() {
    const w = base.world;
    const pic = frame(
      svg('path', {d: w.sphere, class: 'loc-sea loc-edge'}), svg('path', {d: w.graticule, class: 'loc-grat'}),
      svg('path', {d: w.land, class: 'loc-land'}), svg('path', {d: w.vn, class: 'loc-vn'}), ...dot(w.dot[0], w.dot[1], 'TP.HCM'));
    pic.setAttribute('aria-label', 'Quả địa cầu: Việt Nam tô vàng, chấm đỏ là TP. Hồ Chí Minh');
    return pic;
  }
  function drawVietnam() {
    const v = base.vietnam;
    const pic = frame(
      svg('rect', {width: W, height: H, class: 'loc-sea'}), svg('path', {d: v.neighbours, class: 'loc-land'}),
      svg('path', {d: v.vn, class: 'loc-vn'}), svg('path', {d: v.city, class: 'loc-city'}),
      svg('text', {x: v.sea.at[0], y: v.sea.at[1], class: 'loc-sea-label', 'text-anchor': 'middle'}, v.sea.name),
      ...v.islands.flatMap(i => [svg('circle', {cx: i.at[0], cy: i.at[1], r: 1.8, class: 'loc-isl'}), svg('text', {x: i.at[0] + 4, y: i.at[1] + 3, class: 'loc-isl-label'}, i.name)]),
      ...dot(v.dot[0], v.dot[1], 'TP.HCM', -46));
    pic.setAttribute('aria-label', 'Bản đồ Việt Nam: vùng đỏ là TP. Hồ Chí Minh sau sáp nhập, có quần đảo Hoàng Sa và Trường Sa');
    return pic;
  }
  function drawCity() {
    if (!geo) return h('p', {class: 'loc-empty'}, 'Đang tải ranh giới…');
    if (!cityPaths) { proj = cityProjection(geo); cityPaths = geo.features.map(f => ({id: f.id, d: featurePath(f, proj.project)})); }
    const kids = [svg('rect', {width: W, height: H, class: 'loc-sea'}), ...cityPaths.map(p => svg('path', {d: p.d, class: 'loc-commune' + (p.id === selected ? ' on' : '')}))];
    if (view) {
      const [ax, ay] = proj.project(view.west, view.north), [bx, by] = proj.project(view.east, view.south);
      const x = Math.max(-2, ax), y = Math.max(-2, ay), w = Math.min(W + 2, bx) - x, hh = Math.min(H + 2, by) - y;
      if (w > 0 && hh > 0) kids.push(svg('rect', {x, y, width: Math.max(w, 4), height: Math.max(hh, 4), class: 'loc-view'}));
    }
    const pic = frame(...kids);
    pic.setAttribute('aria-label', 'Toàn TP.HCM: khung đỏ là vùng bản đồ đang xem. Chạm để di chuyển bản đồ tới đó.');
    pic.classList.add('clickable');
    pic.addEventListener('click', e => {
      const r = pic.getBoundingClientRect(), [lng, lat] = proj.invert((e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H);
      onFocus?.(lat, lng);
    });
    return pic;
  }

  const CAPTION = {
    world: 'Vị trí TP.HCM trên thế giới. Chạm tab Việt Nam hoặc TP.HCM để xem gần hơn.',
    vietnam: 'TP.HCM sau sáp nhập (gồm Bình Dương, Bà Rịa – Vũng Tàu cũ), không gồm Côn Đảo.',
    city: 'Khung đỏ: vùng bản đồ đang xem. Chạm vào hình để di chuyển tới đó.',
  };
  function render() {
    tabs.forEach(t => { const on = t.dataset.level === level; t.classList.toggle('on', on); t.setAttribute('aria-pressed', String(on)); });
    if (base === null) return mount(art, h('p', {class: 'loc-empty'}, 'Đang tải…'));
    if (base === false && level !== 'city') { level = 'city'; return render(); }
    const pic = level === 'world' ? drawWorld() : level === 'vietnam' ? drawVietnam() : drawCity();
    if (level !== 'city' && pic.tagName === 'svg') { pic.classList.add('clickable'); pic.addEventListener('click', () => { level = level === 'world' ? 'vietnam' : 'city'; onFitAll?.(); render(); }); }
    mount(art, pic);
    caption.textContent = CAPTION[level];
  }

  return {
    el,
    get open() { return open; },
    setOpen,
    onToggle: fn => listeners.add(fn),
    /** geo: commune GeoJSON; bounds: {west, south, east, north} of the main map; code: selected commune. */
    update({geo: g, bounds, code}) {
      const changed = g !== geo || code !== selected || JSON.stringify(bounds) !== JSON.stringify(view);
      if (g !== geo) { geo = g; cityPaths = null; }
      selected = code; view = bounds;
      if (changed && level === 'city') render();
    },
    nameOf: code => shortName(geo?.features.find(f => f.id === code)?.properties.full_name || ''),
  };
}
