/* Home: "how hot / green is where I live?" Search or locate yourself, read one area in plain words, see the city at a glance. */
import {h, mount, icon} from '../core/dom.js';
import {data, indexRows} from '../core/data.js';
import {INDEX, INDICES, CANONICAL_SOURCE, fmt, normalize, confidence, shortName} from '../core/format.js';
import {areaSentence, ranked, cityMean} from '../core/insight.js';
import {toast} from '../ui/toast.js';
import {session, onSession, get, post, env, url} from '../core/api.js';
import {stagger} from '../core/motion.js';

const policy = window.ViewerPolicy;
let root, built = false, rows, geo, year, firstYear, host = {}, favorites = [], shown = null;

const link = (code, index = 'lst', y = year) => `#/ban-do?khu-vuc=${code}&nam=${y}&chi-so=${index}`;
const nameOf = code => geo.features.find(f => f.id === code)?.properties.full_name || code;

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** The commune containing a point (GeoJSON order is lng, lat); holes are respected. */
function locate(lat, lng) {
  for (const f of geo.features) {
    const g = f.geometry, polygons = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    if (polygons.some(([outer, ...holes]) => inRing(lng, lat, outer) && !holes.some(hole => inRing(lng, lat, hole)))) return f.id;
  }
  return null;
}

function showArea(code, scroll = true) {
  const feature = geo.features.find(f => f.id === code);
  if (!feature) return;
  const lines = INDICES.map(k => {
    const row = rows.get(code, year), ok = policy.eligible(row, k), spec = INDEX[k], conf = confidence(row?.[k + '_coverage']);
    return h('div', {class: 'home-line'},
      h('div', {class: 'home-val'}, h('small', null, spec.label + (spec.experimental ? ' (thử nghiệm)' : '')), h('b', {class: 'mono'}, ok ? fmt(row[k], spec.digits) : '—', spec.unit ? h('em', null, ' ' + spec.unit) : null),
        h('span', {class: 'tag ' + (conf.key === 'high' ? 'ok' : conf.key === 'mid' ? 'signal' : 'low')}, ok || row?.[k] != null ? 'Tin cậy ' + conf.text.toLowerCase() : 'Thiếu')),
      h('p', null, areaSentence(rows, code, year, k, [firstYear])));
  });
  mount(host.area, h('div', {class: 'home-area-head'}, h('div', null, h('span', {class: 'eyebrow'}, `Mùa khô ${year}`), h('h2', null, feature.properties.full_name)),
      h('div', {class: 'home-actions'}, h('a', {class: 'btn primary', href: link(code)}, icon('map', 18), 'Xem trên bản đồ'), ...areaButtons(code))), h('p', {class: 'print-only small'}, `MobileGIS TP.HCM · báo cáo khu vực · in ngày ${new Date().toLocaleDateString('vi-VN')}`), ...lines,
    h('p', {class: 'small muted'}, 'Nhiệt độ ở đây là nhiệt độ bề mặt (mặt đường, mái nhà, tán cây), không phải nhiệt độ không khí. “Tin cậy” cho biết phần ảnh dùng được nhiều hay ít, không phải độ chính xác.'));
  host.area.hidden = false; shown = code;
  if (scroll) host.area.scrollIntoView({behavior: 'smooth', block: 'nearest'});
}

function areaButtons(code) {
  const buttons = [h('button', {class: 'btn', type: 'button', on: {click: () => printArea()}}, icon('download', 16), 'Xuất PDF')];
  if (!env.api) return buttons;
  if (!session.user) return [h('a', {class: 'btn', href: url('login.html') + '?next=' + encodeURIComponent(location.pathname + location.hash)}, icon('user', 16), 'Đăng nhập để lưu'), ...buttons];
  const saved = favorites.includes(code);
  return [h('button', {class: 'btn' + (saved ? ' on' : ''), type: 'button', 'aria-pressed': String(saved), on: {click: () => toggleFavorite(code)}}, icon(saved ? 'check' : 'plus', 16), saved ? 'Đã lưu' : 'Lưu khu vực'),
    h('button', {class: 'btn', type: 'button', on: {click: () => feedbackDialog(code)}}, icon('alert', 16), 'Góp ý / báo sai'), ...buttons];
}
function printArea() {
  document.body.classList.add('printing-area');
  const done = () => { document.body.classList.remove('printing-area'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done); window.print(); setTimeout(done, 4000);
}
async function toggleFavorite(code) {
  try {
    if (favorites.includes(code)) { await fetch(url('api/me/favorites/' + code), {method: 'DELETE', credentials: 'same-origin', headers: {'X-Token': session.token}}).then(r => { if (!r.ok) throw new Error('Không bỏ lưu được.'); }); favorites = favorites.filter(c => c !== code); toast('Đã bỏ lưu khu vực.'); }
    else { await post('/api/me/favorites', {code}); favorites = [...favorites, code]; toast('Đã lưu khu vực. Xem ở mục “Khu vực của tôi”.'); }
  } catch (error) { toast(error.message, {error: true}); }
  refreshMine(); if (shown) showArea(shown, false);
}
function feedbackDialog(code) {
  const kind = h('select', {class: 'select', name: 'kind'}, h('option', {value: 'data_error'}, 'Số liệu có vẻ sai'), h('option', {value: 'suggestion'}, 'Góp ý, đề xuất'), h('option', {value: 'ui_error'}, 'Lỗi hiển thị / sử dụng'));
  const message = h('textarea', {class: 'input', name: 'message', rows: 5, maxlength: 1000, required: true, placeholder: 'Mô tả ngắn gọn điều bạn thấy (5–1000 ký tự)'});
  const dialog = h('dialog', null, h('form', {class: 'dlg-form', method: 'dialog', on: {submit: async e => {
    e.preventDefault();
    try { await post('/api/feedback', {kind: kind.value, code, message: message.value}); dialog.close(); dialog.remove(); toast('Đã gửi. Cảm ơn bạn đã góp ý!'); }
    catch (error) { toast(error.message, {error: true}); }
  }}}, h('h2', null, 'Góp ý về ' + nameOf(code)), h('label', {class: 'field'}, h('span', null, 'Loại góp ý'), kind), h('label', {class: 'field'}, h('span', null, 'Nội dung'), message),
    h('div', {class: 'dlg-actions'}, h('button', {class: 'btn', type: 'button', on: {click: () => { dialog.close(); dialog.remove(); }}}, 'Hủy'), h('button', {class: 'btn primary', type: 'submit'}, 'Gửi'))));
  document.body.append(dialog); dialog.showModal();
}
async function refreshMine() {
  if (!host.mine) return;
  if (!env.api) { host.mine.hidden = true; return; }
  if (!session.user) { favorites = []; mount(host.mine, h('h2', null, 'Khu vực của tôi'), h('p', {class: 'muted'}, 'Đăng nhập để lưu các khu vực bạn quan tâm và so sánh chúng cạnh nhau.'), h('a', {class: 'btn', href: url('login.html') + '?next=' + encodeURIComponent(location.pathname + location.hash)}, icon('user', 16), 'Đăng nhập')); host.mine.hidden = false; return; }
  host.mine.hidden = false;
  if (!favorites.length) return mount(host.mine, h('h2', null, 'Khu vực của tôi'), h('p', {class: 'muted'}, 'Chưa lưu khu vực nào. Tìm một phường/xã ở trên rồi bấm “Lưu khu vực”.'));
  const head = ['Khu vực', ...INDICES.map(k => INDEX[k].label), ''];
  const body = favorites.map(code => { const row = rows.get(code, year); return h('tr', null,
    h('th', {scope: 'row', class: 'name'}, h('button', {class: 'linklike', type: 'button', on: {click: () => { host.input.value = nameOf(code); showArea(code); }}}, shortName(nameOf(code)))),
    ...INDICES.map(k => { const ok = policy.eligible(row, k); return h('td', {class: 'num mono' + (ok ? '' : ' muted')}, ok ? fmt(row[k], INDEX[k].digits) : 'chưa đủ dữ liệu'); }),
    h('td', null, h('button', {class: 'btn sm', type: 'button', on: {click: () => toggleFavorite(code)}}, 'Bỏ lưu'))); });
  mount(host.mine, h('h2', null, 'Khu vực của tôi'), h('p', {class: 'muted'}, `So sánh nhanh các khu vực đã lưu, mùa khô ${year}. Ô “chưa đủ dữ liệu” nghĩa là ảnh dùng được dưới 50%.`),
    h('div', {class: 'scroll card flat'}, h('table', {class: 'tbl'}, h('thead', null, h('tr', null, ...head.map((t, i) => h('th', {class: i > 0 && i < 4 ? 'num' : ''}, t)))), h('tbody', null, ...body))));
}

function results(query) {
  const q = normalize(query.trim());
  const list = q ? geo.features.filter(f => normalize(f.properties.full_name).includes(q)).slice(0, 8) : [];
  mount(host.results, ...list.map(f => h('button', {class: 'res', type: 'button', role: 'option', on: {click: () => { host.input.value = f.properties.full_name; host.results.replaceChildren(); host.results.classList.remove('on'); showArea(f.id); }}}, h('b', null, f.properties.full_name)),
    q && !list.length ? h('small', {class: 'muted'}, 'Không tìm thấy. Thử gõ tên ngắn hơn, ví dụ “Bến Nghé”.') : null));
  host.results.classList.toggle('on', !!host.results.children.length);
}

function useMyLocation() {
  if (!navigator.geolocation || !window.isSecureContext) return toast('Trình duyệt này chưa cho dùng vị trí (cần HTTPS). Bạn có thể gõ tên phường/xã.', {error: true});
  host.locate.disabled = true;
  navigator.geolocation.getCurrentPosition(p => {
    host.locate.disabled = false;
    const code = locate(p.coords.latitude, p.coords.longitude);
    if (!code) return toast('Vị trí của bạn nằm ngoài 167 xã/phường được thống kê.', {error: true});
    host.input.value = nameOf(code); showArea(code);
  }, () => { host.locate.disabled = false; toast('Không lấy được vị trí. Hãy cho phép truy cập vị trí hoặc gõ tên phường/xã.', {error: true}); }, {timeout: 12000});
}

const topList = (title, sub, items, fmtValue, index) => h('article', {class: 'card home-list'}, h('h3', null, title), h('p', {class: 'muted small'}, sub),
  h('ol', null, ...items.map(it => h('li', null, h('a', {href: link(it.code, index)}, h('span', null, shortName(nameOf(it.code))), h('b', {class: 'mono'}, fmtValue(it)))))));

async function build() {
  built = true;
  const [rawRows, g] = await Promise.all([data.rows(CANONICAL_SOURCE), data.geo()]);
  rows = indexRows(rawRows); geo = g;
  const years = [...new Set(rawRows.map(r => r.year))].sort(); year = years.at(-1); firstYear = years[0];
  const lst = cityMean(rows, year, 'lst'), lst0 = cityMean(rows, firstYear, 'lst'), ndvi = cityMean(rows, year, 'ndvi'), ndvi0 = cityMean(rows, firstYear, 'ndvi');
  const reliable = ranked(rows, year, 'lst').length;
  const delta = (a, b, digits, unit) => a != null && b != null ? `${a - b >= 0 ? '+' : '−'}${fmt(Math.abs(a - b), digits)}${unit} so với ${firstYear}` : '';
  const stat = (label, value, unit, note) => h('div', {class: 'kpi-card'}, h('b', {class: 'mono'}, value, unit ? h('em', null, unit) : null), h('span', null, label), h('small', {class: 'muted'}, note));
  const hot = ranked(rows, year, 'lst').slice(0, 5), green = ranked(rows, year, 'ndvi').slice(0, 5);
  const warmed = rawRows.filter(r => r.year === year && policy.eligible(r, 'lst') && policy.eligible(rows.get(r.code, firstYear), 'lst'))
    .map(r => ({code: r.code, d: r.lst - rows.get(r.code, firstYear).lst})).sort((a, b) => b.d - a.d).slice(0, 5);

  host.input = h('input', {class: 'input', type: 'search', placeholder: 'Nhập tên phường/xã, ví dụ “Bến Thành”…', autocomplete: 'off', 'aria-label': 'Tìm phường hoặc xã', on: {input: e => results(e.target.value), focus: e => results(e.target.value)}});
  host.results = h('div', {class: 'dock-results home-results', role: 'listbox', 'aria-label': 'Kết quả tìm kiếm'});
  host.locate = h('button', {class: 'btn', type: 'button', on: {click: useMyLocation}}, icon('locate', 18), 'Dùng vị trí của tôi');
  host.area = h('section', {class: 'card home-area', hidden: true, 'aria-live': 'polite'});
  host.mine = h('section', {class: 'block home-mine', hidden: true});

  mount(root,
    h('header', {class: 'home-hero'}, h('span', {class: 'eyebrow'}, 'TP. Hồ Chí Minh · 167 xã/phường · ' + firstYear + '–' + year),
      h('h1', null, 'Chỗ bạn ở nóng đến đâu, xanh đến đâu?'),
      h('p', null, 'Nhiệt độ bề mặt và độ xanh của cây cối từ ảnh vệ tinh Landsat, so sánh từng phường/xã với cả thành phố qua các năm.'),
      h('div', {class: 'home-search'}, h('div', {class: 'search-wrap'}, icon('search', 18), host.input), host.locate), host.results),
    host.area, host.mine,
    h('section', {class: 'block'}, h('h2', null, `Cả thành phố, mùa khô ${year}`),
      h('div', {class: 'kpi-row'}, stat('Nhiệt độ bề mặt trung bình', fmt(lst, 1), ' °C', delta(lst, lst0, 1, ' °C')), stat('Độ xanh trung bình', fmt(ndvi, 2), '', delta(ndvi, ndvi0, 2, '')),
        stat('Khu vực có đủ dữ liệu', String(reliable), ' / 167', 'Khu vực thiếu ảnh không được tính')),
      h('p', {class: 'small muted'}, 'Trung bình của các khu vực có đủ dữ liệu, mỗi khu vực tính một phần như nhau; không phải nhiệt độ không khí hay trung bình cả năm.')),
    h('section', {class: 'block'}, h('h2', null, 'Nổi bật'), h('div', {class: 'home-lists'},
      topList('Nóng nhất', `Nhiệt độ bề mặt ${year}`, hot, it => fmt(it.lst, 1) + ' °C', 'lst'),
      topList('Xanh nhất', `Độ xanh ${year}`, green, it => fmt(it.ndvi, 2), 'ndvi'),
      topList('Nóng lên nhiều nhất', `So với ${firstYear}`, warmed, it => '+' + fmt(it.d, 1) + ' °C', 'lst'))),
    h('section', {class: 'block home-go'}, h('a', {class: 'btn primary', href: '#/ban-do'}, icon('map', 18), 'Mở bản đồ'), h('a', {class: 'btn', href: '#/bang-so-lieu'}, icon('table', 18), 'Xem bảng số liệu'), h('a', {class: 'btn', href: '#/du-lieu'}, icon('info', 18), 'Cách đọc và độ tin cậy')),
    h('p', {class: 'small muted foot'}, 'Thông tin để tham khảo, không thay thế quan trắc hay đánh giá chính thức. Độ khô là chỉ số thử nghiệm.'));
  root.classList.add('page'); stagger(root, ':scope > .home-hero, :scope > .block');
  const load = async () => { favorites = env.api && session.user ? await get('/api/me/favorites').catch(() => []) : []; refreshMine(); if (shown) showArea(shown, false); };
  onSession(load); load();
}

export function init(section) {
  root = h('div', {class: 'page home-page'}, h('div', {class: 'skeleton', style: {height: '320px'}}));
  section.append(root);
}
export function show() { if (!built) build().catch(e => mount(root, h('div', {class: 'callout err'}, 'Chưa tải được số liệu: ' + e.message))); }
