/* "Thử nghiệm trên điện thoại": a speed check and a short survey that anyone can do without signing in.
   Numbers stay on this device until the person presses send; nothing identifies them (no name needed, no location, no IP stored). */
import {h, mount, icon} from '../core/dom.js';
import {env, post} from '../core/api.js';
import {download, toCsv} from '../core/format.js';
import {perf, median, describeDevice} from '../core/perf.js';
import {segmented} from '../ui/seg.js';
import {toast} from '../ui/toast.js';

const TASKS = [
  ['T1', 'Tìm xã/phường của bạn và cho biết nhiệt độ bề mặt năm 2025.'],
  ['T2', 'Xem độ xanh của cùng khu vực năm 2020 so với năm 2025.'],
  ['T3', 'Bật lớp độ khô và cho biết khu vực đang ở mức nào.'],
  ['T4', 'Dùng vị trí hiện tại để xem nơi bạn đang đứng.'],
  ['T5', 'Tìm một khu vực có cảnh báo độ khô.'],
];
const RATINGS = [['easy', 'Giao diện dễ dùng'], ['legend', 'Chú giải dễ hiểu'], ['trust', 'Biết khu vực nào “tin cậy thấp” và vì sao'], ['useful', 'Hữu ích khi xem nhanh trên điện thoại']];
const CONNECTIONS = [{value: 'wifi', label: 'Wi-Fi'}, {value: 'mobile', label: 'Mạng di động'}, {value: 'other', label: 'Khác'}];
const sec = ms => ms == null ? '—' : (ms / 1000).toLocaleString('vi-VN', {minimumFractionDigits: 1, maximumFractionDigits: 1}) + ' s';

let root, nav;
const form = {device: '', screen: '', net: '', connection: '', note: '', participant: '', comment: '', tasks: {}, ratings: {}};

function overlay(text) {
  const box = h('div', {class: 'speed-overlay', role: 'alert'}, h('div', {class: 'card'}, h('b', null, 'Đang đo…'), h('p', {class: 'muted'}, text), h('p', {class: 'small'}, 'Vui lòng không chạm vào màn hình.')));
  document.body.append(box);
  return {set(t) { box.querySelector('p').textContent = t; }, close() { box.remove(); }};
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runSwitchTest() {
  const map = await import('./map.js');
  const o = overlay('Mở bản đồ…');
  try {
    nav('ban-do');
    for (let i = 0; i < 40 && !map.isShown(); i++) await sleep(150);
    if (!map.isShown()) throw new Error('Không mở được màn hình bản đồ.');
    await sleep(900);   // let the map finish fitting the city
    const list = await map.speedTest((i, n) => o.set(`Đổi lớp bản đồ lần ${i}/${n}…`));
    const good = list.filter(v => v != null);
    if (!good.length) throw new Error('Không lớp nào tải xong trong 20 giây. Kiểm tra kết nối mạng.');
    perf.setLayers(good);
    if (good.length < list.length) toast(`Có ${list.length - good.length} lần quá 20 giây nên không tính.`, {error: true});
  } catch (error) { toast(error.message, {error: true}); }
  finally { o.close(); nav('thu-nghiem'); render(); }
}

function csvOfPerf(body) {
  return toCsv(['thiet_bi', 'man_hinh', 'mang', 'thong_tin_mang', 'mo_ban_do_ms', 'mo_lan_dau', 'doi_lop_ms', 'doi_lop_trung_vi_ms', 'ghi_chu'],
    [{thiet_bi: body.device, man_hinh: body.screen, mang: body.connection, thong_tin_mang: body.net_info, mo_ban_do_ms: body.first_map_ms ?? '', mo_lan_dau: body.first_open ? 1 : 0,
      doi_lop_ms: (body.layer_ms || []).join(' '), doi_lop_trung_vi_ms: median(body.layer_ms || []) ?? '', ghi_chu: body.note}]);
}
function perfBody() {
  const r = perf.result;
  return {device: form.device.trim(), screen: form.screen, connection: form.connection, net_info: form.net, first_map_ms: r.first_map_ms ?? null, first_open: !!r.first_open, layer_ms: r.layer_ms || [], note: form.note.trim()};
}
function validatePerf() {
  const b = perfBody();
  if (b.first_map_ms == null && !b.layer_ms.length) return 'Chưa có số đo nào. Bấm “Đo thời gian mở” hoặc “Đo đổi lớp” trước.';
  if (!b.device) return 'Nhập tên thiết bị (ví dụ: Samsung A54).';
  if (!b.connection) return 'Chọn loại mạng đang dùng: Wi-Fi hoặc mạng di động.';
  return '';
}
async function sendPerf() {
  const problem = validatePerf();
  if (problem) return toast(problem, {error: true});
  try { await post('/api/field/perf', perfBody()); toast('Đã gửi số đo cho nhóm. Cảm ơn bạn!'); }
  catch (error) { toast(error.message, {error: true}); }
}
function surveyBody() {
  return {participant: form.participant.trim(), device: form.device.trim(), tasks: Object.fromEntries(TASKS.map(([k]) => [k, {done: form.tasks[k]?.done, taps: form.tasks[k]?.taps ?? 0}])), ratings: {...form.ratings}, comment: form.comment.trim()};
}
function validateSurvey() {
  const b = surveyBody();
  if (TASKS.some(([k]) => typeof b.tasks[k].done !== 'boolean')) return 'Trả lời đủ 5 nhiệm vụ (làm được hay chưa).';
  if (RATINGS.some(([k]) => !b.ratings[k])) return 'Chấm đủ 4 câu từ 1 đến 5.';
  return '';
}
async function sendSurvey() {
  const problem = validateSurvey();
  if (problem) return toast(problem, {error: true});
  try { await post('/api/field/survey', surveyBody()); toast('Đã gửi phiếu khảo sát. Cảm ơn bạn!'); form.tasks = {}; form.ratings = {}; form.comment = ''; render(); window.scrollTo(0, 0); }
  catch (error) { toast(error.message, {error: true}); }
}
function downloadSurvey() {
  const problem = validateSurvey();
  if (problem) return toast(problem, {error: true});
  const b = surveyBody(), row = {nguoi_lam: b.participant, thiet_bi: b.device, gop_y: b.comment};
  TASKS.forEach(([k]) => { row[k + '_lam_duoc'] = b.tasks[k].done ? 1 : 0; row[k + '_cham_sai'] = b.tasks[k].taps; });
  RATINGS.forEach(([k]) => { row[k] = b.ratings[k]; });
  download('mobilegis_khao_sat.csv', toCsv(Object.keys(row), [row]));
}

function render() {
  const r = perf.result, layers = r.layer_ms || [];
  const field = (label, input) => h('label', {class: 'field'}, h('span', null, label), input);
  const bind = (key, input) => { input.value = form[key]; input.addEventListener('input', () => { form[key] = input.value; }); return input; };
  const connection = segmented(CONNECTIONS, form.connection, v => { form.connection = v; }, {label: 'Loại mạng đang dùng'});
  const result = h('div', {class: 'ft-result'},
    h('div', {class: 'stat'}, h('b', {class: 'mono'}, sec(r.first_map_ms)), h('span', null, r.first_open ? 'Mở bản đồ (lần đầu)' : 'Mở bản đồ')),
    h('div', {class: 'stat'}, h('b', {class: 'mono'}, sec(median(layers))), h('span', null, layers.length ? `Đổi lớp (trung vị ${layers.length} lần)` : 'Đổi lớp')));

  const tasks = TASKS.map(([key, text]) => {
    const done = segmented([{value: 'yes', label: 'Làm được'}, {value: 'no', label: 'Chưa làm được'}], form.tasks[key]?.done == null ? '' : form.tasks[key].done ? 'yes' : 'no',
      v => { form.tasks[key] = {...(form.tasks[key] || {}), done: v === 'yes'}; }, {label: `${key}: kết quả`});
    const taps = h('select', {class: 'select', 'aria-label': `${key}: số lần chạm sai`, on: {change: e => { form.tasks[key] = {...(form.tasks[key] || {}), taps: +e.target.value}; }}},
      ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => h('option', {value: n, selected: (form.tasks[key]?.taps ?? 0) === n}, n === 0 ? 'Không chạm sai' : n === 9 ? '9 lần trở lên' : `${n} lần`)));
    return h('div', {class: 'ft-task'}, h('b', {class: 'mono'}, key), h('p', null, text), done.el, h('label', {class: 'field'}, h('span', null, 'Số lần chạm nhầm'), taps));
  });
  const ratings = RATINGS.map(([key, text]) => {
    const seg = segmented([1, 2, 3, 4, 5].map(n => ({value: n, label: String(n)})), form.ratings[key] ?? '', v => { form.ratings[key] = +v; }, {label: text});
    return h('div', {class: 'ft-rate'}, h('p', null, text), seg.el, h('div', {class: 'ft-scale small muted'}, h('span', null, '1 = không đồng ý'), h('span', null, '5 = rất đồng ý')));
  });

  mount(root,
    h('header', {class: 'page-head'}, h('span', {class: 'eyebrow'}, 'Thử nghiệm'), h('h1', null, 'Giúp nhóm thử trên điện thoại'),
      h('p', null, 'Đo tốc độ và làm phiếu khảo sát ngắn, mất khoảng 5 phút. Không cần đăng nhập, không cần ghi tên, không lưu vị trí của bạn.')),
    env.api ? null : h('div', {class: 'callout warn'}, 'Bạn đang xem bản xem thử, chưa có máy chủ nhận kết quả. Bạn vẫn đo và làm phiếu được, rồi bấm “Tải kết quả” để gửi tệp cho nhóm.'),

    h('section', {class: 'block'}, h('h2', null, 'Bước 1 · Đo tốc độ trên máy này'),
      h('div', {class: 'card ft-card'},
        h('div', {class: 'ft-grid'}, field('Thiết bị', bind('device', h('input', {class: 'input', maxlength: 120, placeholder: 'Ví dụ: Samsung A54, Android 14', autocomplete: 'off'}))),
          h('div', {class: 'field'}, h('span', null, 'Mạng đang dùng'), connection.el)),
        h('div', {class: 'ft-actions'},
          h('button', {class: 'btn primary', type: 'button', on: {click: () => perf.requestReload()}}, icon('play', 16), 'Đo thời gian mở'),
          h('button', {class: 'btn primary', type: 'button', on: {click: runSwitchTest}}, icon('layers', 16), 'Đo đổi lớp (5 lần)')),
        result,
        h('p', {class: 'small muted'}, '“Đo thời gian mở” tải lại ứng dụng và tính đến lúc bản đồ có màu (gồm cả màn hình khởi động). “Đo đổi lớp” tự chuyển 5 lớp ảnh chưa xem rồi bấm giờ từng lần.'),
        h('p', {class: 'small muted'}, 'Mẹo: đo qua Wi-Fi một lượt, tắt Wi-Fi đo thêm một lượt bằng mạng di động, và gửi từng lượt riêng. Đo lại lần hai sẽ nhanh hơn vì ứng dụng đã lưu tạm một phần dữ liệu.'),
        field('Ghi chú (không bắt buộc)', bind('note', h('input', {class: 'input', maxlength: 200, placeholder: 'Ví dụ: sóng yếu, đang ở trong nhà'}))),
        h('div', {class: 'ft-actions'},
          env.api ? h('button', {class: 'btn dark', type: 'button', on: {click: sendPerf}}, 'Gửi số đo cho nhóm') : null,
          h('button', {class: 'btn', type: 'button', on: {click: () => { const p = validatePerf(); if (p) return toast(p, {error: true}); download('mobilegis_do_toc_do.csv', csvOfPerf(perfBody())); }}}, icon('download', 16), 'Tải kết quả'),
          h('button', {class: 'btn ghost', type: 'button', on: {click: () => { perf.clear(); render(); }}}, 'Xóa số đo')))),

    h('section', {class: 'block'}, h('h2', null, 'Bước 2 · Khảo sát ngắn'),
      h('p', {class: 'muted'}, 'Mở bản đồ và thử lần lượt 5 việc dưới đây mà không nhờ ai chỉ. Làm xong rồi quay lại trả lời.'),
      h('a', {class: 'btn sm', href: '#/ban-do'}, icon('map', 16), 'Mở bản đồ'),
      h('div', {class: 'ft-tasks'}, ...tasks),
      h('div', {class: 'card ft-card'}, h('h3', null, 'Bạn thấy thế nào?'), ...ratings,
        field('Góp ý thêm (không bắt buộc)', bind('comment', h('textarea', {class: 'input', rows: 3, maxlength: 500, placeholder: 'Điều gì khó hiểu hoặc khó bấm?'}))),
        field('Tên gọi hoặc nhóm (không bắt buộc)', bind('participant', h('input', {class: 'input', maxlength: 40, placeholder: 'Có thể để trống'}))),
        h('div', {class: 'ft-actions'},
          env.api ? h('button', {class: 'btn dark', type: 'button', on: {click: sendSurvey}}, 'Gửi phiếu khảo sát') : null,
          h('button', {class: 'btn', type: 'button', on: {click: downloadSurvey}}, icon('download', 16), 'Tải kết quả')),
        h('p', {class: 'small muted'}, 'Mẫu nhỏ chỉ dùng để rút kinh nghiệm cho bản thử nghiệm, không dùng để khẳng định ứng dụng phù hợp với mọi người dùng.'))));
  connection.place();
}

export function init(section, ctx) {
  nav = ctx.navigate;
  const d = describeDevice();
  Object.assign(form, {device: d.device, screen: d.screen, net: d.net, connection: d.type});
  root = h('div', {class: 'page ft-page'});
  section.append(root);
}
export function show() { render(); }
