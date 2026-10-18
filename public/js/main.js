/* App shell: splash → data preload → hash router with View Transitions. Views are lazy ES modules kept alive once created. */
import {$, $$, h, icon, mount} from './core/dom.js';
import {loadSession, session, onSession, detectApi, env, get, track} from './core/api.js';
import {data} from './core/data.js';
import {createStore} from './core/store.js';
import {CANONICAL_SOURCE, SOURCES} from './core/format.js';
import {transition, reduced} from './core/motion.js';
import {mountAccount} from './ui/account.js';
import {toast} from './ui/toast.js';

export const store = createStore({source: CANONICAL_SOURCE, index: 'lst', year: 2025, selected: '26743', pinned: ['26743', '27664', '25747'], error: null});

/* Visitors see Bản đồ, Chuyên gia and Giới thiệu. `nav` says which tab stays highlighted for routes that have no tab of their own. */
const ROUTES = [
  {id: 'ban-do', icon: 'map', long: 'Bản đồ', short: 'Bản đồ', title: 'Bản đồ môi trường', load: () => import('./views/map.js')},
  {id: 'chuyen-gia', icon: 'chart', long: 'Chuyên gia', short: 'Chuyên gia', title: 'Dành cho chuyên gia', load: () => import('./views/experts.js')},
  {id: 'bang-so-lieu', nav: 'chuyen-gia', hidden: true, title: 'Bảng số liệu', load: () => import('./views/table.js')},
  {id: 'thong-ke', nav: 'chuyen-gia', hidden: true, title: 'Thống kê', load: () => import('./views/stats.js')},
  {id: 'gia-lap', nav: 'chuyen-gia', hidden: true, adminOnly: true, title: 'Kịch bản giả lập (ngoài đề cương)', load: () => import('./views/scenario.js')},
  {id: 'du-lieu', icon: 'info', long: 'Giới thiệu', short: 'Giới thiệu', title: 'Giới thiệu', load: () => import('./views/about.js')},
];
const views = new Map();   // id → {section, module, ready}
let current = null;

export const navigate = (id, params = {}) => {
  const query = new URLSearchParams(params).toString();
  location.hash = `#/${id}${query ? '?' + query : ''}`;
};
const parseHash = () => {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  return {id: ROUTES.some(r => r.id === path) ? path : 'ban-do', params: Object.fromEntries(new URLSearchParams(query))};
};

// ---- nav -----------------------------------------------------------------------------
function buildNav() {
  const nav = $('#nav');
  for (const route of ROUTES.filter(r => !r.hidden)) {
    nav.append(h('a', {href: '#/' + route.id, class: route.adminOnly ? 'admin-only' : '', dataset: {route: route.id}},
      icon(route.icon, 20), h('span', {class: 'l-long'}, route.long), h('span', {class: 'l-short'}, route.short)));
  }
}
function placeInk() {
  const ink = $('#nav .nav-ink'), active = $('#nav a[aria-current=page]');
  if (!active) return;
  ink.style.width = active.offsetWidth + 'px';
  ink.style.transform = `translate(${active.offsetLeft}px,${active.offsetTop}px)`;
  ink.style.height = active.offsetHeight + 'px';
}

// ---- views ---------------------------------------------------------------------------
async function ensureView(route) {
  let entry = views.get(route.id);
  if (!entry) {
    const section = h('section', {class: 'view', id: 'view-' + route.id, hidden: true, 'aria-label': route.title});
    $('#main').append(section);
    entry = {section, ready: null};
    views.set(route.id, entry);
    entry.ready = route.load().then(module => { entry.module = module; return module.init(section, {store, navigate}); });
  }
  await entry.ready;
  return entry;
}

async function show({id, params}, animate = true) {
  let route = ROUTES.find(r => r.id === id);
  if (route.adminOnly && session.user?.role !== 'admin') { route = ROUTES.find(r => r.id === 'ban-do'); id = route.id; params = {}; if (location.hash !== '#/' + id) history.replaceState(null, '', '#/' + id); }
  let entry;
  try { entry = await ensureView(route); }
  catch (error) { console.error(error); toast('Không mở được màn hình này: ' + error.message, {error: true}); return; }
  const swap = () => {
    if (current && current !== entry) { current.section.hidden = true; current.module.hide?.(); }
    entry.section.hidden = false;
    current = entry;
    $$('#nav a').forEach(a => a.dataset.route === (route.nav || id) ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
    document.title = `${route.title} · MobileGIS TP.HCM`;
    placeInk();
    window.scrollTo(0, 0);
    entry.module.show?.(params);
    track('page', id);
  };
  if (animate) await transition(swap); else swap();
}

// ---- boot ----------------------------------------------------------------------------
function splashStep(n, text) {
  $$('#splash .splash-steps i').forEach((bar, i) => bar.classList.toggle('on', i < n));
  $('#splashStatus').textContent = text;
}
const wait = ms => new Promise(r => setTimeout(r, ms));

async function boot() {
  buildNav();
  const first = !sessionStorage.getItem('mg-seen');
  const started = performance.now();
  splashStep(0, 'Đang kiểm tra máy chủ…');
  await detectApi();   // false on GitHub Pages: the app then runs as a static demo
  const roleClass = () => { document.body.classList.remove('is-guest', 'is-customer', 'is-admin'); document.body.classList.add('is-' + (session.user?.role || 'guest')); };
  onSession(roleClass);
  await loadSession();
  mountAccount($('#account'));
  if (env.api) get('/api/notice').then(n => { if (n.text && sessionStorage.getItem('mg-notice') !== n.text) { const box = $('#notice'); mount(box, h('span', null, n.text), h('button', {type: 'button', 'aria-label': 'Đóng thông báo', on: {click: () => { box.hidden = true; document.body.classList.remove('has-notice'); try { sessionStorage.setItem('mg-notice', n.text); } catch (_) {} }}}, '×')); box.hidden = false; document.body.classList.add('has-notice'); } }).catch(() => {});

  splashStep(1, 'Đang tải ranh giới 167 xã/phường…');
  const geo = data.geo();
  const rows = data.rows(CANONICAL_SOURCE);
  const products = Promise.all([data.product(CANONICAL_SOURCE), data.product('legacy').catch(() => null), data.cover(CANONICAL_SOURCE).catch(() => null)]);
  try { await geo; } catch (e) { store.set({error: 'Chưa tải được ranh giới: ' + e.message}); }
  splashStep(2, 'Đang tải số liệu LST · NDVI · TVDI…');
  try { await rows; } catch (e) { store.set({error: 'Chưa tải được bộ hiện trạng đã bổ sung 2025. Không tự thay bằng nguồn khác. ' + e.message}); }
  splashStep(3, 'Đang tải lớp bản đồ…');
  try { await products; } catch (e) { store.set({error: store.get().error || 'Chưa tải được lớp bản đồ: ' + e.message}); }
  splashStep(4, store.get().error ? 'Một phần dữ liệu chưa sẵn sàng' : 'Sẵn sàng');

  const chip = $('#sourceChip');
  chip.querySelector('span').textContent = store.get().error ? 'Chưa đủ dữ liệu' : env.api ? 'Mùa khô 2020–2025' : 'Bản xem thử · 2020–2025';
  chip.title = env.api ? 'Ảnh vệ tinh Landsat 8/9, các mốc mùa khô 2020–2025' : 'Bản xem thử: một số chức năng (đăng nhập, quản trị) chỉ có ở bản đầy đủ.';
  if (store.get().error) chip.querySelector('.dot').style.background = 'var(--coral)';

  store.subscribe((next, prev) => {   // anonymous counters: which area and layer people look at on the map
    if (current?.section.id === 'view-ban-do') { if (next.selected !== prev.selected) track('area', next.selected); if (next.index !== prev.index) track('layer', next.index); }
  });
  window.addEventListener('hashchange', () => show(parseHash()));
  window.addEventListener('resize', placeInk);
  document.fonts?.ready.then(placeInk);
  await show(parseHash(), false);
  await wait(Math.max(0, (first ? 1100 : 350) - (performance.now() - started)));
  sessionStorage.setItem('mg-seen', '1');
  const splash = $('#splash');
  document.body.classList.remove('is-booting');
  splash.classList.add('done');
  setTimeout(() => splash.remove(), reduced() ? 20 : 1000);

  if (!env.api && !sessionStorage.getItem('mg-static-note')) {
    sessionStorage.setItem('mg-static-note', '1');
    setTimeout(() => toast('Đây là bản xem thử: bạn xem được bản đồ, số liệu và so sánh khu vực. Đăng nhập và các công cụ quản trị chỉ có ở bản đầy đủ.', {ms: 9000}), 1800);
  }
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
