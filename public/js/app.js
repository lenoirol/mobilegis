/* Bản đồ Nhiệt - Xanh - Khô TP.HCM · app shell.
   The map is the whole screen. Ranking/threshold panel, tools, selected-area card, legend and timeline float on it.
   Secondary screens (Thống kê, Bảng số liệu, Giới thiệu, Tài khoản, Thử nghiệm) open as full-screen pages over the map. */
import {$, h, mount, icon} from './core/dom.js';
import {loadSession, session, onSession, detectApi, env, url} from './core/api.js';
import {data, indexRows} from './core/data.js';
import {createStore} from './core/store.js';
import {INDEX, INDICES, YEARS, CANONICAL_SOURCE, setPalette} from './core/format.js';
import {toast} from './ui/toast.js';
import {perf} from './core/perf.js';
import {createMap} from './map/engine.js';
import {createPanel, matching, FILTER_DEFAULTS} from './map/panel.js';
import {renderInfo, renderLegend, createTimeline} from './map/widgets.js';
import {createSearch} from './map/search.js';
import {createCompare} from './map/compare.js';
import {stateFromParams, syncAddress, shareUrl} from './map/share.js';
import {showTour, tourSeen} from './map/tour.js';
import {hit, watchErrors} from './core/track.js';

const policy = window.ViewerPolicy;
const APP = 'Bản đồ Nhiệt - Xanh - Khô TP.HCM';
const narrow = () => matchMedia('(max-width: 900px)').matches;

export const store = createStore({
  index: 'lst', year: 2025, range: [2020, 2025], selected: '26743', mode: 'zones', dims: '2d', basemap: 'osm', height: 1,
  filters: FILTER_DEFAULTS, panel: !narrow(), playing: false, animate: false, pinned: ['26743', '27664', '25747'],
  palette: 'standard', compare: {on: false, year: 2020},
});
const savedPalette = () => { try { return localStorage.getItem('mg-palette') === 'cb' ? 'cb' : 'standard'; } catch (_) { return 'standard'; } };

// ---------------------------------------------------------------- pages
const PAGES = {
  'thong-ke': {title: 'Thống kê', load: () => import('./views/stats.js')},
  'bang-so-lieu': {title: 'Bảng số liệu', load: () => import('./views/table.js')},
  'gioi-thieu': {title: 'Giới thiệu', load: () => import('./views/about.js')},
  'tai-khoan': {title: 'Tài khoản', load: () => import('./views/account.js')},
  'thu-nghiem': {title: 'Thử nghiệm trên điện thoại', load: () => import('./views/field-test.js')},
};
const ALIAS = {'du-lieu': 'gioi-thieu', 'chuyen-gia': 'thong-ke', 'ban-do': ''};
const pages = new Map();
let openPage = null;

const parseHash = () => {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const id = path in ALIAS ? ALIAS[path] : path;
  return {id: PAGES[id] ? id : '', params: Object.fromEntries(new URLSearchParams(query))};
};
export const navigate = (id, params = {}) => {
  const q = new URLSearchParams(params).toString();
  location.hash = `#/${id === 'ban-do' ? '' : id}${q ? '?' + q : ''}`;
};

async function showRoute({id, params}) {
  const host = $('#pages');
  if (!id) {
    if (openPage) { openPage.module.hide?.(); openPage = null; }
    host.hidden = true; document.title = APP;
    applyMapParams(params);
    return;
  }
  const page = PAGES[id];
  let entry = pages.get(id);
  if (!entry) {
    const section = h('section', {class: 'view', 'aria-label': page.title});
    entry = {section, ready: page.load().then(module => { entry.module = module; return module.init(section, {store, navigate}); })};
    pages.set(id, entry);
  }
  mount(host, h('div', {class: 'page-bar'},
    h('a', {class: 'btn sm', href: '#/'}, icon('map', 16), 'Về bản đồ'), h('h1', null, page.title), h('span', {class: 'spacer'})), entry.section);
  host.hidden = false; host.scrollTop = 0; document.title = `${page.title} · ${APP}`;
  try { await entry.ready; } catch (e) { console.error(e); toast('Không mở được trang này: ' + e.message, {error: true}); return; }
  if (openPage && openPage !== entry) openPage.module.hide?.();
  openPage = entry;
  entry.module.show?.(params);
  hit('page', id, true);
}

function applyMapParams(params) {
  const patch = stateFromParams(params);
  if (Object.keys(patch).length) { store.set(patch); if (patch.selected) engine?.select(patch.selected, true); }
}

// ---------------------------------------------------------------- top bar
function buildIndexSwitch() {
  const host = $('#indexSwitch');
  const render = s => mount(host, ...INDICES.map(k => h('button', {type: 'button', 'aria-pressed': String(k === s.index), title: INDEX[k].help, on: {click: () => store.set({index: k})}},
    h('i', {style: {background: INDEX[k].colors[k === 'ndvi' ? 5 : 6]}}), INDEX[k].label, h('small', null, INDEX[k].code))));
  let last; store.subscribe(s => { const key = s.index + s.palette; if (key !== last) { last = key; render(s); } }); render(store.get()); last = store.get().index + store.get().palette;
}
function buildMenu() {
  const host = $('#menu');
  const render = () => {
    const user = session.user, admin = user?.role === 'admin';
    mount(host,
      h('button', {class: 'nav', type: 'button', 'aria-pressed': String(store.get().panel), on: {click: () => store.set({panel: !store.get().panel})}}, icon('table', 17), h('span', null, 'Xếp hạng')),
      h('a', {href: '#/thong-ke'}, icon('chart', 17), h('span', null, 'Thống kê')),
      h('a', {href: '#/bang-so-lieu'}, icon('grid', 17), h('span', null, 'Bảng số liệu')),
      h('a', {href: '#/gioi-thieu'}, icon('info', 17), h('span', null, 'Giới thiệu')),
      admin && h('a', {href: url('admin.html')}, icon('lock', 17), h('span', null, 'Quản trị')),
      env.api && (user ? h('a', {href: '#/tai-khoan', class: 'acct-btn', title: user.email}, h('span', {class: 'acct-av'}, (user.display_name || '?').trim().charAt(0).toUpperCase()), h('span', null, user.display_name))
        : h('a', {href: '#/tai-khoan'}, icon('user', 17), h('span', null, 'Đăng nhập'))));
  };
  onSession(render); store.subscribe((s, p) => { if (s.panel !== p.panel) render(); }); render();
}

// ---------------------------------------------------------------- tools
let currentGeo = null;
function buildTools(engine) {
  const host = $('#mapTools');
  const group = (label, options, key, extra = {}) => h('div', {class: 'tool-group', role: 'group', 'aria-label': label},
    ...options.map(([value, text, ic, title]) => h('button', {type: 'button', title: title || text, dataset: {key, value}, on: {click: () => store.set({[key]: value, ...(extra[value] || {})})}}, ic && icon(ic, 16), h('span', null, text))));
  const dims = group('2D hoặc 3D', [['2d', '2D', 'map', 'Bản đồ phẳng'], ['3d', '3D', 'layers', 'Khối 3D: chiều cao theo giá trị']], 'dims', {'3d': {mode: 'zones'}});
  const mode = group('Cách hiển thị', [['zones', 'Xã/phường', null, 'Tô màu theo giá trị trung bình của xã/phường'], ['pixel', 'Ô ảnh 120 m', null, 'Ảnh chỉ số gốc, mỗi ô 120 m (chỉ 2D)']], 'mode', {pixel: {dims: '2d'}});
  const base = group('Bản đồ nền', [['osm', 'Bản đồ'], ['sat', 'Vệ tinh'], ['plain', 'Nhẹ']], 'basemap');
  const height = h('input', {type: 'range', min: 0.3, max: 2.5, step: 0.1, value: store.get().height, 'aria-label': 'Độ cao khối 3D', on: {input: e => store.set({height: +e.target.value})}});
  const heightBox = h('label', {class: 'height-ctl'}, 'Độ cao khối', height);
  const actions = h('div', {class: 'tool-group'},
    h('button', {type: 'button', title: 'Xem toàn bộ 167 xã/phường', on: {click: () => engine.fitAll()}}, icon('extent', 16), h('span', null, 'Toàn vùng')),
    h('button', {type: 'button', dataset: {act: 'compare'}, title: 'So sánh hai năm bằng thanh kéo', on: {click: toggleCompare}}, icon('compare', 16), h('span', null, 'So sánh năm')),
    h('button', {type: 'button', dataset: {act: 'palette'}, title: 'Bảng màu dễ phân biệt cho người khó nhìn màu (chỉ áp dụng cho tô màu xã/phường)', on: {click: () => { const next = store.get().palette === 'cb' ? 'standard' : 'cb'; setPalette(next); store.set({palette: next}); }}}, icon('eye', 16), h('span', null, 'Màu dễ phân biệt')),
    h('button', {type: 'button', title: 'Lưu bản đồ thành ảnh PNG có tiêu đề, tọa độ, la bàn, thước tỷ lệ và thang màu', on: {click: saveImage}}, icon('image', 16), h('span', null, 'Lưu ảnh')),
    h('button', {type: 'button', title: 'Sao chép liên kết đúng khung nhìn đang xem', on: {click: copyLink}}, icon('share', 16), h('span', null, 'Chia sẻ')),
    h('button', {type: 'button', title: 'Hướng dẫn nhanh', 'aria-label': 'Hướng dẫn nhanh', on: {click: () => { hit('feature', 'huong-dan'); showTour(); }}}, icon('info', 16)));
  const search = h('div', {class: 'search'});
  createSearch(search, {geo: currentGeo, onPick: code => { hit('feature', 'tim-kiem'); store.set({selected: code}); engine.select(code, true); if (narrow()) store.set({panel: false}); }});
  mount(host, search, dims, mode, base, heightBox, actions);
  const sync = s => {
    host.querySelectorAll('button[data-key]').forEach(b => b.setAttribute('aria-pressed', String(String(s[b.dataset.key]) === b.dataset.value)));
    host.querySelector('button[data-key=dims][data-value="3d"]').disabled = s.mode === 'pixel';
    heightBox.hidden = s.dims !== '3d';
    host.querySelector('[data-act=compare]').setAttribute('aria-pressed', String(!!s.compare.on));
    host.querySelector('[data-act=palette]').setAttribute('aria-pressed', String(s.palette === 'cb'));
  };
  function toggleCompare() {
    const s = store.get();
    if (s.compare.on) { store.set({compare: {...s.compare, on: false}}); return; }
    hit('feature', 'so-sanh');
    store.set({compare: {on: true, year: s.year === 2020 ? 2025 : 2020}, playing: false});
  }
  async function copyLink() {
    hit('feature', 'chia-se'); syncAddress(store.get());
    const link = shareUrl(store.get());
    try { await navigator.clipboard.writeText(link); toast('Đã sao chép liên kết. Dán vào tin nhắn để chia sẻ đúng khung nhìn này.'); }
    catch (_) { window.prompt('Sao chép liên kết này:', link); }
  }
  store.subscribe(sync); sync(store.get());

  async function saveImage() {
    const {exportMap} = await import('./map/export.js');
    const s = store.get();
    hit('feature', 'luu-anh'); toast('Đang tạo ảnh bản đồ…', {ms: 1800});
    try {
      const blob = await exportMap(engine.map, s, {title: `Bản đồ ${INDEX[s.index].name.toLowerCase()} TP.HCM năm ${s.year}`});
      const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download: `ban-do-${INDEX[s.index].code}-${s.year}.png`});
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { console.error(e); toast('Không tạo được ảnh: ' + e.message + '. Thử chọn nền "Nhẹ" rồi lưu lại.', {error: true, ms: 8000}); }
  }
}


// ---------------------------------------------------------------- field speed test hooks (used by the Thử nghiệm page)
export const isShown = () => !!engine && $('#pages').hidden;
/** Switch index/year `n` times and return how long each switch took until the map was idle again (ms, null if > 20 s). */
export async function speedTest(progress, n = 5) {
  const plan = [['ndvi', 2024], ['tvdi', 2023], ['lst', 2022], ['ndvi', 2021], ['lst', 2025]].slice(0, n), out = [];
  for (let i = 0; i < plan.length; i++) {
    progress?.(i + 1, plan.length);
    const t0 = performance.now();
    const idle = new Promise(resolve => { const timer = setTimeout(() => resolve(null), 20000); engine.map.once('idle', () => { clearTimeout(timer); resolve(Math.round(performance.now() - t0)); }); });
    store.set({index: plan[i][0], year: plan[i][1]});
    engine.map.triggerRepaint();
    out.push(await idle);
    await new Promise(r => setTimeout(r, 400));
  }
  return out;
}

// ---------------------------------------------------------------- boot
let engine = null, addrTimer = 0;
function step(n, text) { $('#splashBar').style.width = (n * 25) + '%'; $('#splashStatus').textContent = text; }

async function boot() {
  perf.begin(!sessionStorage.getItem('mg-seen'), !parseHash().id);
  const openedWithLink = location.hash.includes('?');
  watchErrors();
  perf.onReturn(() => navigate('thu-nghiem'));
  step(0, 'Đang kiểm tra máy chủ…');
  await detectApi();
  onSession(() => { document.body.classList.remove('is-guest', 'is-customer', 'is-admin'); document.body.classList.add('is-' + (session.user?.role || 'guest')); });
  await loadSession();
  step(1, 'Đang tải ranh giới 167 xã/phường…');
  let geo, rowsList, products;
  try {
    [geo, rowsList, products] = await Promise.all([data.geo(), (step(2, 'Đang tải số liệu LST · NDVI · TVDI…'), data.rows(CANONICAL_SOURCE)), data.product(CANONICAL_SOURCE)]);
  } catch (e) {
    $('#splashStatus').textContent = 'Chưa tải được dữ liệu: ' + e.message; return;
  }
  step(3, 'Đang dựng bản đồ…');
  const rows = indexRows(rowsList);
  currentGeo = geo;
  const startPatch = {palette: savedPalette(), ...(parseHash().id ? {} : stateFromParams(parseHash().params))};
  if (startPatch.palette === 'cb' && !parseHash().params.mau) startPatch.palette = 'cb';
  setPalette(startPatch.palette); store.set(startPatch);
  const ranges = Object.fromEntries(INDICES.map(k => { const v = rowsList.filter(r => policy.eligible(r, k)).map(r => r[k]); return [k, {min: Math.min(...v), max: Math.max(...v)}]; }));
  const padding = () => {
    const s = store.get(), top = $('#topbar').getBoundingClientRect().bottom + 12, bottom = innerHeight - $('#timeline').getBoundingClientRect().top + 12;
    return narrow() ? {top, bottom: bottom + 70, left: 20, right: 20} : {top, bottom, left: s.panel ? 380 : 30, right: 30};
  };
  engine = createMap($('#map'), {geo, rows, products, ranges, padding, onSelect: code => {
    if (!code) { toast('Điểm này nằm ngoài 167 xã/phường của khu vực nghiên cứu.', {ms: 2600}); return; }
    store.set({selected: code});
  }});

  const setTop = () => document.documentElement.style.setProperty('--topb', Math.round($('#topbar').getBoundingClientRect().bottom) + 'px');
  new ResizeObserver(setTop).observe($('#topbar')); setTop();
  buildIndexSwitch(); buildMenu(); buildTools(engine);
  createPanel($('#panel'), {geo, rows, ranges, store, onPick: code => { store.set({selected: code}); engine.select(code, true); if (narrow()) store.set({panel: false}); }});
  createTimeline($('#timeline'), store);
  const codes = geo.features.map(f => f.properties.code);
  const compare = createCompare({host: $('#map2'), handleHost: $('#cmp'), geo, rows, products, ranges, padding, main: engine, store, codes});

  const draw = (s, p = {}) => {
    if (s.index !== p.index || s.year !== p.year || s.mode !== p.mode || s.dims !== p.dims || s.basemap !== p.basemap)
      engine.update({index: s.index, year: s.year, mode: s.mode, dims: s.dims, basemap: s.basemap}, {animate: s.animate || (s.year !== p.year && s.index === p.index)});
    if (s.palette !== p.palette) { setPalette(s.palette); engine.repaint(); compare.repaint(); try { localStorage.setItem('mg-palette', s.palette); } catch (_) { /* ignore */ } if (s.palette !== 'standard') hit('feature', 'mau-cb'); }
    if (s.height !== p.height) engine.setHeight(s.height);
    let m = null;
    if (s.filters !== p.filters || s.year !== p.year) { m = matching(s.filters, rows, codes, s.year); engine.setDim(m); }
    if (s.selected !== p.selected) engine.select(s.selected);
    if (s.panel !== p.panel) { document.body.classList.toggle('panel-closed', !s.panel); }
    if (['index', 'year', 'selected', 'palette'].some(k => s[k] !== p[k])) renderInfo($('#info'), {code: s.selected, geo, rows, store});
    if (['index', 'year', 'mode', 'dims', 'filters', 'palette'].some(k => s[k] !== p[k])) renderLegend($('#legend'), s, {matchCount: (m || matching(s.filters, rows, codes, s.year))?.size ?? null});
    if (['index', 'year', 'mode', 'dims', 'basemap', 'height', 'filters', 'selected', 'compare', 'palette'].some(k => s[k] !== p[k])) compare.sync(s, p);
    if (s.index !== p.index && p.index) hit('layer', s.index, true);
    if (s.selected !== p.selected && s.selected && p.selected !== undefined) hit('area', s.selected);
    if (s.dims === '3d' && p.dims !== '3d') hit('feature', '3d', true);
    if (s.playing && !p.playing) hit('feature', 'phat', true);
    if (['index', 'year', 'selected', 'mode', 'dims', 'basemap', 'palette', 'range', 'compare'].some(k => s[k] !== p[k]) && $('#pages').hidden) { clearTimeout(addrTimer); addrTimer = setTimeout(() => syncAddress(store.get()), 300); }
    if (s.animate) queueMicrotask(() => store.set({animate: false}));
  };
  store.subscribe(draw);
  draw(store.get(), {});
  engine.setHeight(store.get().height);

  window.addEventListener('hashchange', () => showRoute(parseHash()));
  await showRoute(parseHash());
  await engine.ready;
  engine.map.once('idle', () => perf.mark('load'));
  step(4, 'Sẵn sàng');
  sessionStorage.setItem('mg-seen', '1');
  document.body.classList.remove('is-booting');
  $('#splash').classList.add('done'); setTimeout(() => $('#splash')?.remove(), 600);
  perf.mark('splash');
  hit('page', parseHash().id || 'ban-do', true);
  if (!tourSeen() && !openedWithLink) setTimeout(showTour, 900);
  if (!env.api && !sessionStorage.getItem('mg-static-note')) {
    sessionStorage.setItem('mg-static-note', '1');
    setTimeout(() => toast('Đây là bản xem thử: xem được bản đồ, xếp hạng, lọc ngưỡng và thống kê. Tài khoản và quản trị chỉ có ở bản đầy đủ.', {ms: 8000}), 1200);
  }
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
