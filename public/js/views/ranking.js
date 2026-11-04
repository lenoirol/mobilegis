/* Xếp hạng: tab riêng, hai cột. Trái: danh sách xã/phường. Phải: bản đồ toàn TP.HCM, kéo và thu phóng được; khi chọn một khu vực,
   các khu vực còn lại mờ đi để khu vực được chọn nổi bật. Một thanh duy nhất để đổi chỉ số (LST / NDVI / TVDI). */
import {h, mount, svg, icon} from '../core/dom.js';
import {createPanel} from '../map/panel.js';
import {INDEX, YEARS, colorOf, fmt, rampCss, indexTitle} from '../core/format.js';
import {VIEW_DEFAULT} from '../map/panel.js';

const policy = window.ViewerPolicy;
const W = 1000, H = 800, PAD = 20;     // hệ tọa độ SVG của bản đồ phẳng
let root, deps, store, nav, host, mapEl, svgEl, labelEl, sumEl, legendEl, ready = false, selectedLast;   // undefined = lần mở đầu: giữ toàn vùng, chưa phóng tới khu vực chọn sẵn
const wards = new Map();
const DEFAULT_DIR = {lst: 'desc', ndvi: 'asc', tvdi: 'desc'};   // mặc định theo yêu cầu của cô: LST cao→thấp, NDVI thấp→cao, TVDI cao→thấp
let orderBar, view = null, box = {w: 1, h: 1}, anim = 0;

/* ---------- dựng bản đồ phẳng một lần ---------- */
function buildMap() {
  const feats = deps.geo.features, polysOf = f => f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const f of feats) for (const [lon, lat] of polysOf(f).flat(2)) { x0 = Math.min(x0, lon); x1 = Math.max(x1, lon); y0 = Math.min(y0, lat); y1 = Math.max(y1, lat); }
  const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180), s = Math.min((W - 2 * PAD) / ((x1 - x0) * k), (H - 2 * PAD) / (y1 - y0));
  const ox = (W - (x1 - x0) * k * s) / 2, oy = (H - (y1 - y0) * s) / 2;
  const px = lon => ox + (lon - x0) * k * s, py = lat => H - oy - (lat - y0) * s;
  svgEl = svg('svg', {class: 'rank-map-svg', role: 'img', 'aria-label': 'Bản đồ 167 xã/phường, kéo để di chuyển, cuộn hoặc chụm hai ngón để thu phóng'});
  for (const f of feats) {
    const code = f.properties.code, ring = polysOf(f).map(p => p[0]).sort((a, b) => b.length - a.length)[0];
    const xs = ring.map(c => px(c[0])), ys = ring.map(c => py(c[1]));
    const d = polysOf(f).map(poly => poly.map(r => r.map(([lon, lat], i) => `${i ? 'L' : 'M'}${px(lon).toFixed(1)} ${py(lat).toFixed(1)}`).join('') + 'Z').join('')).join('');
    const el = svg('path', {class: 'rank-ward', d, 'fill-rule': 'evenodd', tabindex: 0, role: 'button', 'aria-label': f.properties.full_name || f.properties.name});
    el.addEventListener('click', () => { if (!dragged) store.set({selected: code}); });
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); store.set({selected: code}); } });
    wards.set(code, {el, f, bx: Math.min(...xs), by: Math.min(...ys), bw: Math.max(...xs) - Math.min(...xs), bh: Math.max(...ys) - Math.min(...ys)});
    svgEl.append(el);
  }
  labelEl = svg('text', {class: 'rank-map-label', 'text-anchor': 'middle'}); svgEl.append(labelEl);
}

/* ---------- thu phóng / kéo ---------- */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
/* Danh sách nằm đè lên mép trái bản đồ, nên "vùng nhìn thấy" của bản đồ là phần bên phải danh sách. */
const listW = () => Math.max(0, (host?.offsetWidth || 0) - 22);
const visCx = () => listW() + (box.w - listW()) / 2;                 // tâm ngang của vùng nhìn thấy (px)
const visCy = () => box.h * 0.46;                                     // hơi cao hơn tâm để chừa chỗ cho thẻ chọn ở dưới
function viewAround(cx, cy, w) { return {w, h: w * box.h / box.w, x: cx - visCx() / box.w * w, y: cy - visCy() / box.h * (w * box.h / box.w)}; }
function fitView() {
  const vw = Math.max(1, box.w - listW()), s = Math.min(vw / (W * 1.02), box.h / (H * 1.06)), w = box.w / s;   // toàn vùng: vừa khít phần bản đồ bên phải danh sách
  return {w, h: w * box.h / box.w, x: W / 2 - (box.w - vw / 2) / box.w * w, y: H / 2 - 0.5 * w * box.h / box.w};
}
function setView(v) {
  const full = fitView(); v.w = clamp(v.w, full.w / 60, full.w * 1.2); v.h = v.w * box.h / box.w;
  const lim = (v, size, world, margin) => size >= world ? clamp(v, world - size - size * .5, size * .5) : clamp(v, -margin, world + margin - size);   // khung lớn hơn bản đồ: cho lệch tự do (để chừa chỗ cho danh sách), chỉ chặn trôi quá xa
  v.x = lim(v.x, v.w, W, full.w * .1); v.y = lim(v.y, v.h, H, full.h * .1);
  view = v; svgEl.setAttribute('viewBox', `${v.x.toFixed(1)} ${v.y.toFixed(1)} ${v.w.toFixed(1)} ${v.h.toFixed(1)}`);
  const sc = full.w / v.w; svgEl.style.setProperty('--z', String(Math.min(1, 1 / Math.sqrt(sc))));   // nét viền mảnh dần khi phóng to
  labelEl.style.fontSize = (15 * v.w / box.w * 1.2) + 'px';
}
function animateTo(target, ms = 380) {
  moved = true;
  cancelAnimationFrame(anim); const from = {...view}, t0 = performance.now();
  const step = now => { const t = clamp((now - t0) / ms, 0, 1), e = 1 - (1 - t) ** 3; setView({x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, w: from.w + (target.w - from.w) * e}); if (t < 1) anim = requestAnimationFrame(step); };
  anim = requestAnimationFrame(step);
}
function toSvg(cx, cy) { const r = svgEl.getBoundingClientRect(); return {x: view.x + (cx - r.left) / r.width * view.w, y: view.y + (cy - r.top) / r.height * view.h}; }
function zoomAt(cx, cy, factor) { const p = toSvg(cx, cy), w = view.w / factor; const r = svgEl.getBoundingClientRect(); setView({w, x: p.x - (cx - r.left) / r.width * w, y: p.y - (cy - r.top) / r.height * (w * box.h / box.w)}); }
function zoomCentre(factor) { const r = svgEl.getBoundingClientRect(), p = toSvg(r.left + visCx(), r.top + visCy()), w = view.w / factor; animateTo(viewAround(p.x, p.y, w), 220); }
function focusWard(code) {
  const o = wards.get(code); if (!o) return;
  // phóng to để khu vực chiếm khoảng 60% vùng nhìn thấy (khu vực rất nhỏ thì phóng tối đa 50 lần so với toàn vùng)
  const vw = Math.max(1, box.w - listW()), full = fitView();
  const s = Math.min(0.6 * Math.min(vw / Math.max(o.bw, 1), box.h / Math.max(o.bh, 1)), (box.w / full.w) * 50), w = box.w / s;
  animateTo(viewAround(o.bx + o.bw / 2, o.by + o.bh / 2, w));
}
let dragged = false, moved = false;   // moved: người dùng đã kéo/thu phóng/chọn khu vực
function wireGestures() {
  const pts = new Map(); let last = null, pinch = null;
  svgEl.addEventListener('pointerdown', e => { svgEl.setPointerCapture?.(e.pointerId); pts.set(e.pointerId, {x: e.clientX, y: e.clientY}); dragged = false; cancelAnimationFrame(anim); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } else last = {x: e.clientX, y: e.clientY}; });
  svgEl.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch); pinch = d; dragged = true; return; }
    if (pts.size === 1 && last) { const dx = e.clientX - last.x, dy = e.clientY - last.y; if (Math.abs(dx) + Math.abs(dy) > 3 || dragged) { dragged = true; moved = true; const r = svgEl.getBoundingClientRect(); setView({...view, x: view.x - dx / r.width * view.w, y: view.y - dy / r.height * view.h}); last = {x: e.clientX, y: e.clientY}; } }
  });
  const end = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) { last = null; setTimeout(() => { dragged = false; }, 0); } };
  svgEl.addEventListener('pointerup', end); svgEl.addEventListener('pointercancel', end);
  svgEl.addEventListener('dblclick', e => { e.preventDefault(); const r = svgEl.getBoundingClientRect(), pt = toSvg(e.clientX, e.clientY), w = view.w / 2; animateTo({w, x: pt.x - (e.clientX - r.left) / r.width * w, y: pt.y - (e.clientY - r.top) / r.height * (w * box.h / box.w)}, 260); });
  svgEl.addEventListener('wheel', e => { e.preventDefault(); moved = true; zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0016)); }, {passive: false});
}

/* ---------- tô màu và làm mờ ---------- */
function paint() {
  const s = store.get(), k = s.index, sel = s.selected && wards.has(s.selected) ? s.selected : null;
  for (const [code, o] of wards) {
    const row = deps.rows.get(code, s.year), ok = policy.eligible(row, k);
    o.el.setAttribute('fill', ok ? colorOf(row[k], k) : '#c3ccd5');
    o.el.classList.toggle('dim', !!sel && code !== sel); o.el.classList.toggle('sel', code === sel);
  }
  if (sel) {
    const o = wards.get(sel); svgEl.insertBefore(o.el, labelEl);
    labelEl.textContent = (o.f.properties.full_name || o.f.properties.name).replace(/^(Phường|Xã|Đặc khu) /, '');
    labelEl.setAttribute('x', o.bx + o.bw / 2); labelEl.setAttribute('y', o.by - 6);
  } else labelEl.textContent = '';
}
function renderSelected() {
  const s = store.get(), o = wards.get(s.selected);
  if (!o) { mount(sumEl, h('span', {class: 'rank-hint'}, 'Bấm một tên hoặc một khu vực để xem')); return; }
  const k = s.index, row = deps.rows.get(s.selected, s.year), ok = policy.eligible(row, k), spec = INDEX[k];
  mount(sumEl, h('b', null, o.f.properties.full_name || o.f.properties.name),
    h('span', {class: 'rank-sel-val'}, ok ? [h('i', {style: {background: colorOf(row[k], k)}}), `${spec.code} ${fmt(row[k], spec.digits)}${spec.unit ? ' ' + spec.unit : ''}`] : `${spec.code}: chưa đủ dữ liệu`),
    h('button', {class: 'link-btn', type: 'button', on: {click: () => nav('ban-do', {'khu-vuc': s.selected, nam: s.year, 'chi-so': k, 'che-do': 'zones'})}}, 'Xem trên bản đồ'),
    h('button', {class: 'info-x', type: 'button', 'aria-label': 'Bỏ chọn', on: {click: () => store.set({selected: null})}}, icon('x', 16)));
}
/* ---------- thanh thứ tự: hai nút rõ nghĩa + một câu mô tả ---------- */
const TOP_TEXT = {
  lst: {desc: 'Nóng nhất ở trên cùng', asc: 'Mát nhất ở trên cùng'},
  ndvi: {desc: 'Nhiều cây xanh nhất ở trên cùng', asc: 'Ít cây xanh nhất ở trên cùng'},
  tvdi: {desc: 'Khô nhất ở trên cùng', asc: 'Ẩm nhất ở trên cùng'},
};
const SORT_TEXT = {change: {desc: 'Tăng nhiều nhất so với năm trước ở trên cùng', asc: 'Giảm nhiều nhất so với năm trước ở trên cùng'}, coverage: {desc: 'Độ tin cậy cao nhất ở trên cùng', asc: 'Độ tin cậy thấp nhất ở trên cùng'}, name: {desc: 'Tên xếp từ Z đến A', asc: 'Tên xếp từ A đến Z'}};
function effectiveDir(s) { const v = s.view || VIEW_DEFAULT; return v.dir !== 'auto' ? v.dir : (v.sort === 'value' ? DEFAULT_DIR[s.index] : v.sort === 'name' ? 'asc' : 'desc'); }
function renderOrder() {
  const s = store.get(), v = s.view || VIEW_DEFAULT, dir = effectiveDir(s);
  const set = d => store.set({view: {...v, dir: d}});
  orderBar.querySelector('[data-dir=desc]').setAttribute('aria-pressed', String(dir === 'desc'));
  orderBar.querySelector('[data-dir=asc]').setAttribute('aria-pressed', String(dir === 'asc'));
  orderBar.querySelector('.rank-order-note').textContent = (v.sort === 'value' ? TOP_TEXT[s.index] : SORT_TEXT[v.sort])[dir];
  orderBar._set = set;
  const ys = orderBar.querySelector('.rank-year'); if (ys && +ys.value !== s.year) ys.value = String(s.year);
}
function render(fromSelect) {
  if (!ready) return;
  paint(); renderSelected(); renderOrder();
  const k = store.get().index, sel = store.get().selected;
  legendEl.querySelector('.rank-ramp').style.background = rampCss(k);
  legendEl.querySelector('.cap').textContent = indexTitle(k);
  legendEl.querySelector('.lo').textContent = fmt(INDEX[k].min, INDEX[k].digits === 1 ? 0 : 1); legendEl.querySelector('.hi').textContent = fmt(INDEX[k].max, INDEX[k].digits === 1 ? 0 : 1);
  if (sel && selectedLast !== undefined && sel !== selectedLast) { host.querySelector(`.rank-item[data-code="${sel}"]`)?.scrollIntoView({block: 'nearest'}); focusWard(sel); }
  selectedLast = sel;
}

export async function init(section, ctx) {
  store = ctx.store; nav = ctx.navigate;
  host = h('aside', {class: 'panel rank-host', 'aria-label': 'Danh sách xếp hạng'});
  const toolbar = h('div', {class: 'rank-toolbar'});
  sumEl = h('div', {class: 'rank-sel'});
  legendEl = h('div', {class: 'rank-legend'}, h('span', {class: 'cap'}), h('div', {class: 'rank-ramp'}), h('div', {class: 'ends'}, h('span', {class: 'lo'}), h('span', {class: 'hi'})));
  const ctl = h('div', {class: 'rank-zoom'},
    h('button', {type: 'button', 'aria-label': 'Phóng to', on: {click: () => zoomCentre(1.6)}}, icon('plus', 18)),
    h('button', {type: 'button', 'aria-label': 'Thu nhỏ', on: {click: () => zoomCentre(1 / 1.6)}}, icon('minus', 18)),
    h('button', {type: 'button', 'aria-label': 'Xem toàn vùng', on: {click: () => animateTo(fitView())}}, icon('extent', 18)));
  mapEl = h('div', {class: 'rank-map'}, ctl, sumEl, legendEl);
  const body = h('div', {class: 'rank-body'}, host, mapEl);
  root = h('div', {class: 'page rank-page'}, toolbar, body);
  section.append(root);
  deps = await ctx.deps;
  createPanel(host, {geo: deps.geo, rows: deps.rows, ranges: deps.ranges, store, onPick: code => store.set({selected: code})});
  // một thanh duy nhất: đổi chỉ số + tùy chỉnh + CSV nằm trên cả hai cột
  const tabs = host.querySelector('.panel-tabs'), csv = host.querySelector('.panel-head .btn');
  const optBtn = h('button', {class: 'btn sm', type: 'button', 'aria-expanded': 'false', on: {click: () => { const on = body.classList.toggle('show-opts'); optBtn.setAttribute('aria-expanded', String(on)); }}}, icon('sliders', 15), h('span', null, 'Tùy chỉnh'));
  toolbar.append(tabs, optBtn, csv);
  const yearSel = h('select', {class: 'select rank-year', 'aria-label': 'Năm', on: {change: e => store.set({year: +e.target.value})}}, ...YEARS.map(y => h('option', {value: y}, `Mùa khô ${y}`)));
  orderBar = h('div', {class: 'rank-order'}, yearSel,
    h('div', {class: 'rank-order-btns', role: 'group', 'aria-label': 'Thứ tự xếp hạng'},
      h('button', {type: 'button', dataset: {dir: 'desc'}, on: {click: () => orderBar._set('desc')}}, icon('chevron', 15), 'Cao → thấp'),
      h('button', {type: 'button', dataset: {dir: 'asc'}, on: {click: () => orderBar._set('asc')}}, icon('up', 15), 'Thấp → cao')),
    h('p', {class: 'rank-order-note'}));
  host.querySelector('.rank-meta').before(orderBar);
  // tùy chỉnh và lọc: bảng phủ cả hai cột, không bị nhét trong cột hẹp
  const sheet = h('div', {class: 'rank-opts'}, h('div', {class: 'rank-opts-head'}, h('b', null, 'Tùy chỉnh và lọc'), h('button', {class: 'btn sm primary', type: 'button', on: {click: () => optBtn.click()}}, 'Xong')));
  for (const sel of ['.view-box', '.filter-box']) { const n = host.querySelector(sel); if (n) { n.open = true; sheet.append(n); } }
  body.append(sheet);
  buildMap(); wireGestures(); mapEl.prepend(svgEl);
  // offset*: kích thước bố cục, không bị hiệu ứng mở trang (transform) làm sai
  const measure = () => { const r = {width: mapEl.offsetWidth, height: mapEl.offsetHeight}; if (!r.width || !r.height) return; box = {w: r.width, h: r.height}; setView(!view || !moved ? fitView() : {...view}); };   // chưa thao tác thì luôn căn lại toàn vùng theo bề rộng danh sách thực tế
  new ResizeObserver(measure).observe(mapEl);
  ready = true; measure();
  let last = {};
  store.subscribe(s => { if (['selected', 'index', 'year', 'palette', 'view'].some(k => s[k] !== last[k])) render(); last = s; });
  last = store.get(); render();
}
export function show() { requestAnimationFrame(() => { if (!ready) return; if (!moved && mapEl.offsetWidth) { box = {w: mapEl.offsetWidth, h: mapEl.offsetHeight}; setView(fitView()); } render(); }); }
