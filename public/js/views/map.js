/* Map view: composes the Leaflet engine, control dock, detail card, legend, quick stats and the mobile bottom sheet. */
import {h, mount, icon, $} from '../core/dom.js';
import {get, env} from '../core/api.js';
import {data, layersFor, indexRows} from '../core/data.js';
import {INDEX, fmt, valid, CANONICAL_SOURCE, SOURCES, rampCss, YEARS} from '../core/format.js';
import {createStore} from '../core/store.js';
import {countTo} from '../core/motion.js';
import {toast} from '../ui/toast.js';
import {createEngine, COVERAGE_GRADIENT, CHANGE_GRADIENT} from './map-engine.js';
import {createDock} from './map-dock.js';
import {createDetail} from './map-detail.js';

const policy = window.ViewerPolicy;
const mobile = () => matchMedia('(max-width:860px)').matches;
const DISPLAYS = ['raster', 'zones', 'change', 'coverage'];

let shell, engine, dock, detail, store, nav;
let D = {source: CANONICAL_SOURCE, geo: null, rows: null, layers: null, cover: null, points: [], years: YEARS};
let engineData = null, probe = null, playTimer = null, probeToken = 0, shown = false, fitted = false, urlTimer = null;
const ms = createStore({display: 'raster', landcover: false, compare: false, swipe: 50, opacity: 1, boundaries: true, labels: true, basemap: 'plain', visible: true,
  mode: 'real', legendOpen: true, sheetTab: 'detail', snap: 'peek', detailOpen: true, dockOpen: true});
const merged = () => ({...store.get(), ...ms.get()});

// ---- elements --------------------------------------------------------------------------------------------
const el = {};
function build(section) {
  el.map = h('div', {class: 'map-canvas', id: 'map', role: 'application', 'aria-label': 'Bản đồ tương tác LST, NDVI và TVDI'});
  el.loader = h('div', {class: 'bar-loader', 'aria-hidden': 'true'});
  el.kpi = ['Mốc ảnh', 'Khu vực phủ ≥50%', 'Lưới mẫu'].map(label => ({value: h('b', {class: 'mono num'}, '—'), label}));
  el.kpis = h('div', {class: 'map-kpis'}, ...el.kpi.map(k => h('div', {class: 'kpi'}, k.value, h('span', null, k.label))));
  el.legend = h('div', {class: 'legend'});
  el.status = h('div', {class: 'map-status callout', role: 'status', hidden: true});
  el.error = h('div', {class: 'map-error', role: 'alert', hidden: true});
  el.swipe = h('div', {class: 'swipe', hidden: true}, h('span', {class: 'swipe-l mono'}, '2020'), h('span', {class: 'swipe-r mono'}, '2025'), h('div', {class: 'swipe-line', role: 'slider', tabindex: 0, 'aria-label': 'Vị trí đường chia so sánh', 'aria-valuemin': 5, 'aria-valuemax': 95}, h('i', null, icon('compare', 18))));

  dock = createDock({
    onIndex: k => { stopPlay(); probe = null; store.set({index: k}); },
    onYear: y => { probe = null; store.set({year: y}); },
    onDisplay: v => { stopPlay(); probe = null; ms.set({display: v, compare: v === 'raster' ? ms.get().compare : false, landcover: false}); },
    onToggle: (k, v) => { stopPlay(); ms.set({[k]: v, ...(k === 'landcover' && v ? {compare: false} : {}), ...(k === 'compare' && v ? {landcover: false} : {})}); },
    onOpacity: v => ms.set({opacity: v}),
    onPick: id => select(id, true),
    onPlay: togglePlay,
    onSource: changeSource,
    onMode: changeMode,
  });
  detail = createDetail({
    onIndex: k => {   // tapping a value tile shows that layer; on phones the sheet drops to its peek so the map is visible
      stopPlay(); probe = null;
      store.set({index: k});
      ms.set({landcover: false, visible: true, ...(mobile() ? {snap: 'peek'} : {})});
    },
    onPin: () => { const s = store.get(); if (s.pinned.includes(s.selected)) return; if (s.pinned.length >= 4) return toast('Tối đa 4 khu vực so sánh. Bỏ bớt ở tab Thống kê.', {error: true}); store.set({pinned: [...s.pinned, s.selected]}); toast('Đã thêm vào so sánh ở tab Thống kê.'); },
    onTable: () => nav('bang-so-lieu', {q: store.get().selected}),
    onClose: () => ms.set({detailOpen: !ms.get().detailOpen}),
  });

  el.handle = h('button', {class: 'sheet-handle', type: 'button', 'aria-label': 'Kéo để mở hoặc đóng bảng thông tin', on: {click: () => ms.set({snap: ms.get().snap === 'open' ? 'peek' : 'open'})}}, h('i'));
  const tab = (value, label) => h('button', {class: 'sheet-tab', type: 'button', dataset: {tab: value}, on: {click: () => ms.set({sheetTab: value, snap: 'open'})}}, label);
  el.tabs = h('div', {class: 'sheet-tabs', role: 'tablist'}, tab('detail', 'Khu vực'), tab('dock', 'Lớp & hiển thị'));
  el.dockWrap = h('aside', {class: 'dock', 'aria-label': 'Công cụ bản đồ'}, dock.el);
  el.detailWrap = h('aside', {class: 'detail', 'aria-label': 'Thông tin khu vực'}, detail.el);
  el.panels = h('div', {class: 'panels'}, el.handle, el.tabs, el.dockWrap, el.detailWrap);
  el.dockToggle = h('button', {class: 'btn sm dock-toggle', type: 'button', 'aria-label': 'Ẩn hoặc hiện công cụ', on: {click: () => ms.set({dockOpen: !ms.get().dockOpen})}}, icon('sliders', 16), 'Công cụ');
  el.detailOpen = h('button', {class: 'btn sm detail-open', type: 'button', on: {click: () => ms.set({detailOpen: true})}}, icon('chevron', 16), 'Khu vực');

  const fab = (name, label, fn) => h('button', {class: 'icon-btn', type: 'button', title: label, 'aria-label': label, on: {click: fn}}, icon(name, 20));
  el.fabs = h('div', {class: 'fabs'},
    fab('plus', 'Phóng to', () => engine.map.zoomIn(1)), fab('minus', 'Thu nhỏ', () => engine.map.zoomOut(1)),
    fab('locate', 'Vị trí của tôi', locate), fab('extent', 'Xem toàn vùng', () => engine.fitAll()), fab('share', 'Sao chép liên kết', share));

  shell = h('div', {class: 'map-shell'}, el.map, el.loader, el.kpis, el.status, el.error, el.swipe, el.legend, el.fabs, el.dockToggle, el.detailOpen, el.panels);
  section.append(shell);
  wireSwipe(); wireSheet();
}

// ---- data ------------------------------------------------------------------------------------------------------
async function loadSource(source) {
  const [rows, layers, cover] = await Promise.all([data.rows(source), layersFor(source), data.cover(source).catch(() => null)]);
  D = {...D, source, rows: indexRows(rows), layers, cover, years: layers.years.length ? layers.years : YEARS};
  engineData = {geo: D.geo, rows: D.rows, layers: D.layers, points: D.points, source, cover};
}
async function changeSource(source) {
  stopPlay();
  try {
    el.loader.classList.add('on');
    await loadSource(source);
    const years = D.years, s = store.get();
    store.set({source, year: years.includes(s.year) ? s.year : years.at(-1)});
    if (!D.layers.change?.lst) ms.set({display: ms.get().display === 'change' ? 'raster' : ms.get().display, compare: false});
    probe = null;
  } catch (error) {
    toast(`Không tải được nguồn ${SOURCES[source].label}: ${error.message}. Giữ nguồn đang xem.`, {error: true});
    store.set({source: D.source});
  } finally { el.loader.classList.remove('on'); }
}
async function changeMode(mode) {
  stopPlay(); probe = null;
  try {
    let points = [];
    if (mode === 'user') points = await data.userPoints();
    if (mode === 'demo') points = await data.demoPoints();
    D = {...D, points}; engineData = {...engineData, points};
    const first = points[0]?.name || '';
    ms.set({mode, landcover: false, compare: false});
    store.set({selected: mode === 'real' ? '26743' : first, year: Math.min(Math.max(store.get().year, 2020), 2025)});
    if (mode !== 'real' && points[0]) engine.focusPoint(points[0].lat, points[0].lon);
    if (mode === 'real') setTimeout(() => engine.fitAll(), 50);
  } catch (error) { toast(error.message, {error: true}); }
}

// ---- interactions ------------------------------------------------------------------------------------------------------
function select(id, fly = true) {
  probe = null; engine.clearProbe();
  store.set({selected: id});
  if (ms.get().mode === 'real') { if (fly) engine.focus(id); } else { const p = D.points.find(r => r.name === id); if (p && fly) engine.focusPoint(p.lat, p.lon); }
  ms.set({sheetTab: 'detail', detailOpen: true, snap: mobile() ? (ms.get().snap === 'open' ? 'open' : 'peek') : ms.get().snap});
}
function togglePlay() {
  if (playTimer) return stopPlay();
  const years = D.years;
  if (years.length < 2) return;
  playTimer = setInterval(() => { const s = store.get(); store.set({year: years[(years.indexOf(s.year) + 1) % years.length]}); }, 1700);
  sync();
}
function stopPlay() { if (playTimer) { clearInterval(playTimer); playTimer = null; sync(); } }

async function probeAt(latlng) {
  const s = merged();
  if (!env.api) return;   // pixel lookup is a server endpoint
  if (s.mode !== 'real' || s.landcover || (s.display !== 'raster' && s.display !== 'change')) return;
  const token = ++probeToken, change = s.display === 'change' ? 1 : 0;
  probe = {lat: latlng.lat, lng: latlng.lng, loading: true, change}; engine.ripple(latlng); sync();
  try {
    const r = await get(`/api/sample?lat=${latlng.lat}&lon=${latlng.lng}&year=${s.year}&index=${s.index}&change=${change}&source=${s.source}`);
    if (token !== probeToken) return;
    probe = {lat: latlng.lat, lng: latlng.lng, value: r.value, change, unavailable: r.status === 'unavailable'};
    engine.ripple(latlng, valid(r.value));
  } catch (_) { if (token !== probeToken) return; probe = {lat: latlng.lat, lng: latlng.lng, error: 'Tra cứu ô mẫu cần máy chủ đang chạy.'}; }
  sync();
  if (mobile() && ms.get().snap === 'peek') ms.set({sheetTab: 'detail'});
}
function locate() {
  if (!window.isSecureContext) return toast('GPS cần HTTPS hoặc localhost. Kết nối HTTP qua địa chỉ mạng LAN không hỗ trợ GPS.', {error: true});
  if (!navigator.geolocation) return toast('Trình duyệt không hỗ trợ GPS.', {error: true});
  navigator.geolocation.getCurrentPosition(p => { engine.gps(p.coords.latitude, p.coords.longitude, p.coords.accuracy); toast('Đã đặt vị trí của bạn lên bản đồ. Tọa độ không được lưu.'); },
    () => toast('Không lấy được vị trí. Kiểm tra quyền GPS của trình duyệt.', {error: true}), {timeout: 10000, enableHighAccuracy: true});
}
function shareUrl() {
  const s = merged(), p = new URLSearchParams({'chi-so': s.index, nam: s.year, 'khu-vuc': s.selected, 'che-do': s.display});
  if (s.source !== CANONICAL_SOURCE) p.set('nguon', s.source);
  return `${location.origin}${location.pathname}#/ban-do?${p}`;
}
async function share() {
  const url = shareUrl();
  try { await navigator.clipboard.writeText(url); toast('Đã sao chép liên kết đúng khu vực, chỉ số và năm đang xem.'); }
  catch (_) { prompt('Sao chép liên kết:', url); }
}
function wireSwipe() {
  const line = el.swipe.querySelector('.swipe-line');
  const set = v => { v = Math.max(5, Math.min(95, v)); ms.set({swipe: v}); engine.applySwipe(); };
  line.addEventListener('pointerdown', e => {
    line.setPointerCapture(e.pointerId);
    const move = ev => { const r = el.map.getBoundingClientRect(); set((ev.clientX - r.left) / r.width * 100); };
    const up = () => { line.removeEventListener('pointermove', move); line.removeEventListener('pointerup', up); };
    line.addEventListener('pointermove', move); line.addEventListener('pointerup', up);
  });
  line.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') set(ms.get().swipe - 3); if (e.key === 'ArrowRight') set(ms.get().swipe + 3); });
}
function wireSheet() {
  let startY = 0, dragging = false, startSnap = 'peek';
  el.handle.addEventListener('pointerdown', e => { if (!mobile()) return; dragging = true; startY = e.clientY; startSnap = ms.get().snap; el.panels.classList.add('dragging'); el.handle.setPointerCapture(e.pointerId); });
  el.handle.addEventListener('pointermove', e => { if (!dragging) return; const dy = e.clientY - startY; el.panels.style.setProperty('--sheet-drag', Math.max(startSnap === 'open' ? 0 : -400, dy) + 'px'); });
  const end = e => {
    if (!dragging) return; dragging = false; el.panels.classList.remove('dragging');
    const dy = e.clientY - startY; el.panels.style.removeProperty('--sheet-drag');
    if (Math.abs(dy) < 8) return;   // treated as a tap (click handler toggles)
    el.handle.dataset.dragged = '1'; setTimeout(() => delete el.handle.dataset.dragged, 50);
    ms.set({snap: dy < 0 ? 'open' : 'peek'});
  };
  el.handle.addEventListener('pointerup', end); el.handle.addEventListener('pointercancel', end);
  el.handle.addEventListener('click', e => { if (el.handle.dataset.dragged) e.stopImmediatePropagation(); }, true);
}

// ---- legend / kpis --------------------------------------------------------------------------------------------------------------------
function renderLegend(s) {
  const toggle = h('button', {class: 'legend-toggle', type: 'button', 'aria-expanded': String(s.legendOpen), on: {click: () => ms.set({legendOpen: !ms.get().legendOpen})}}, icon(s.legendOpen ? 'minus' : 'plus', 14), s.legendOpen ? 'Chú giải' : 'Hiện chú giải');
  let body = null;
  const idx = INDEX[s.index];
  if (s.mode !== 'real') body = h('div', null, h('b', null, idx.name), h('i', {class: 'ramp', style: {background: rampCss(s.index)}}), h('div', {class: 'ramp-ends mono'}, h('span', null, `${idx.min} ${idx.unit}`), h('span', null, `${idx.max} ${idx.unit}`)), h('small', null, 'Điểm tròn tô theo cùng thang màu.'));
  else if (s.landcover) {
    const classes = D.layers?.context?.worldcover?.classes || [];
    body = h('div', null, h('b', null, 'Lớp phủ đất · 2021'), h('div', {class: 'lc-list'}, ...classes.filter(c => ![70, 100].includes(c.code)).map(c => h('span', null, h('i', {style: {background: c.color}}), c.name))), h('small', null, 'ESA WorldCover · lấy mẫu 120 m'));
  } else if (s.display === 'change') {
    const cfg = D.layers?.change?.[s.index];
    body = h('div', null, h('b', null, `Thay đổi ${idx.label} · 2025 − 2020`), h('i', {class: 'ramp', style: {background: CHANGE_GRADIENT}}), h('div', {class: 'ramp-ends mono'}, h('span', null, `${cfg?.min ?? -1} ${idx.unit}`), h('span', null, '0'), h('span', null, `+${cfg?.max ?? 1} ${idx.unit}`)), h('small', null, 'Xanh: giảm · đỏ: tăng · trống: thiếu cặp ô hợp lệ.'));
  } else if (s.display === 'coverage') {
    body = h('div', null, h('b', null, 'Độ phủ mẫu hợp lệ'), h('i', {class: 'ramp', style: {background: COVERAGE_GRADIENT}}), h('div', {class: 'ramp-ends mono'}, h('span', null, '0%'), h('span', null, '100%')), h('small', null, 'Tỷ lệ ô mẫu; không phải độ chính xác.'));
  } else {
    body = h('div', null, h('b', null, `${idx.name}${idx.experimental ? ' · thử nghiệm' : ''}`), h('i', {class: 'ramp', style: {background: rampCss(s.index)}}), h('div', {class: 'ramp-ends mono'}, h('span', null, `${idx.min} ${idx.unit}`.trim()), h('span', null, `${idx.max} ${idx.unit}`.trim())),
      h('small', null, 'Thang cố định giữa các năm, theo tài liệu của cô. Trống/xám: thiếu mẫu, không phải 0.' + (s.display === 'zones' ? ' Nét đứt: dưới 50% độ phủ.' : '')));
  }
  mount(el.legend, toggle, s.legendOpen ? body : null);
}
function renderKpis(s) {
  const rows = D.rows?.year(s.year) || [], q = policy.summary(rows, s.index), total = D.geo?.features.length || 167;
  const label = s.landcover ? 'Lớp phủ 2021' : s.display === 'change' ? '2020→2025' : String(s.year);
  if (el.kpi[0].value.textContent !== label) el.kpi[0].value.textContent = label;
  if (s.mode === 'real') { countTo(el.kpi[1].value, q.adequate, v => `${Math.round(v)}/${total}`, 600); el.kpi[2].value.textContent = '120 m'; }
  else { el.kpi[1].value.textContent = `${(D.points || []).filter(p => p.year === s.year).length} điểm`; el.kpi[2].value.textContent = s.mode === 'user' ? 'CSV' : 'Demo'; }
}
const statusText = (s, tile) => {
  if (store.get().error) return store.get().error;
  if (s.mode === 'real' && tile?.missing) return `Chưa có lớp ảnh ${s.display === 'change' ? 'chênh lệch' : 'năm ' + s.year} ở nguồn này. Không thay bằng nguồn khác.`;
  return '';
};

// ---- sync ----------------------------------------------------------------------------------------------------------------------------------------------
let tileState = null;
function sync() {
  if (!engine || !D.geo) return;
  const s = merged(), onMap = shown;
  engine.update(s, engineData);
  const years = D.years, search = (D.geo?.features || []).map(f => ({id: f.id, name: f.properties.full_name}));
  dock.sync(s, {years, search: s.mode === 'real' ? search : [...new Set(D.points.map(p => p.name))].map(n => ({id: n, name: n})), canChange: !!D.layers?.change?.[s.index] && s.mode === 'real', canCompare: !!D.layers?.absolute?.[2020]?.[s.index], playing: !!playTimer});
  detail.render(s, D, probe, {pinned: store.get().pinned});
  renderLegend(s); renderKpis(s);
  el.swipe.hidden = !(tileState?.compare && s.display === 'raster');
  el.swipe.style.setProperty('--x', s.swipe + '%'); el.swipe.querySelector('.swipe-r').textContent = s.year;
  el.swipe.querySelector('.swipe-line').setAttribute('aria-valuenow', Math.round(s.swipe));
  const text = statusText(s, tileState); el.status.hidden = !text; el.status.textContent = text; el.status.classList.toggle('err', !!store.get().error);
  shell.dataset.tab = s.sheetTab; shell.dataset.snap = s.snap;
  shell.classList.toggle('dock-collapsed', !s.dockOpen); shell.classList.toggle('detail-collapsed', !s.detailOpen);
  el.tabs.querySelectorAll('.sheet-tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === s.sheetTab)));
  clearTimeout(urlTimer); urlTimer = setTimeout(() => { if (shown) history.replaceState(null, '', shareUrl().slice(shareUrl().indexOf('#'))); }, 400);
}
function insets() {
  if (mobile()) return {left: 16, right: 16, top: 72, bottom: Math.round(innerHeight * .3)};
  const s = ms.get();
  return {left: s.dockOpen ? 372 : 24, right: s.detailOpen && store.get().selected ? 392 : 24, top: 76, bottom: 40};
}
function occupiedRects() {
  const origin = el.map.getBoundingClientRect(), rects = [];
  for (const node of [el.kpis, el.legend, el.fabs, ...(mobile() ? [el.panels] : [el.dockWrap, el.detailWrap])]) {
    if (!node || node.hidden) continue;
    const r = node.getBoundingClientRect();
    if (r.width && r.height) rects.push({x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height});
  }
  return rects;
}

// ---- public view API ---------------------------------------------------------------------------------------------------------------------------------------
export async function init(section, ctx) {
  store = ctx.store; nav = ctx.navigate;
  section.classList.add('map-view');
  build(section);
  if (mobile()) ms.set({legendOpen: false});
  try {
    D.geo = await data.geo();
    await loadSource(store.get().source);
  } catch (error) {
    el.error.hidden = false;
    mount(el.error, h('h2', null, 'Chưa tải được dữ liệu hiện trạng'), h('p', null, error.message + ' Không tự thay bằng nguồn cũ hay dữ liệu giả lập.'), h('button', {class: 'btn primary', type: 'button', on: {click: () => location.reload()}}, 'Tải lại'));
  }
  engine = createEngine(el.map, {
    select: (id, latlng) => select(id, false), probe: probeAt,
    loading: (on, message) => { el.loader.classList.toggle('on', on); if (message && env.api) toast(message, {error: true}); },   // static hosts 404 on empty edge tiles
    tileState: t => { tileState = t; const missing = t.missing; if (el.status) { const text = statusText(merged(), t); el.status.hidden = !text; el.status.textContent = text; } },
    baseFailed: () => { ms.set({basemap: 'plain'}); toast('Không kết nối được nền đường phố; đã chuyển sang nền nhẹ. Số liệu và ranh giới vẫn dùng được.', {error: true}); },
    occupied: occupiedRects,
  });
  engine.map.on('zoomend moveend', () => {});
  store.subscribe(() => sync());
  ms.subscribe((next, prev) => {
    if (next.dockOpen !== prev.dockOpen || next.detailOpen !== prev.detailOpen) { engine.setInsets(insets()); setTimeout(() => engine.invalidate(), 320); }
    sync(); if (next.snap !== prev.snap || next.dockOpen !== prev.dockOpen || next.detailOpen !== prev.detailOpen) engine.relabel();
  });
  window.addEventListener('resize', () => { engine.setInsets(insets()); engine.invalidate(); sync(); });
  engineData = D.rows ? {geo: D.geo, rows: D.rows, layers: D.layers, points: D.points, source: D.source, cover: D.cover} : null;
  sync();
}

export function show(params = {}) {
  shown = true;
  const patch = {}, mpatch = {};
  if (INDEX[params['chi-so']]) patch.index = params['chi-so'];
  if (YEARS.includes(+params.nam)) patch.year = +params.nam;
  if (params['khu-vuc'] && D.geo?.features.some(f => f.id === params['khu-vuc'])) patch.selected = params['khu-vuc'];
  if (DISPLAYS.includes(params['che-do'])) mpatch.display = params['che-do'];
  if (params.nguon && SOURCES[params.nguon] && params.nguon !== D.source) { store.set({source: params.nguon}); changeSource(params.nguon); }
  Object.keys(mpatch).length && ms.set(mpatch);
  Object.keys(patch).length && store.set(patch);
  requestAnimationFrame(() => {
    engine?.invalidate(); engine?.setInsets(insets());
    dock?.placeSegs();
    if (!fitted && D.geo) { fitted = true; engine.fitAll(false); if (params['khu-vuc']) setTimeout(() => engine.focus(store.get().selected), 700); }
    sync();
  });
}
export function hide() { shown = false; stopPlay(); }
export const selectArea = (code, params) => { store.set({selected: code, ...(params || {})}); };
