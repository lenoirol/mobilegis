/* About page for visitors: what the numbers mean, how far to trust them, where they come from. Technical material is in a closed section; system details live in the admin console. */
import {h, mount, icon} from '../core/dom.js';
import {data} from '../core/data.js';
import {INDEX, INDICES, YEARS, rampCss, TVDI_CLASSES} from '../core/format.js';
import {stagger} from '../core/motion.js';
import {url, env} from '../core/api.js';

const policy = window.ViewerPolicy;
let root, built = false;

const MEANING = {
  lst: 'Mặt đường, mái nhà, tán cây nóng đến mức nào lúc vệ tinh chụp. Đây là nhiệt độ bề mặt, thường cao hơn nhiệt độ không khí bạn cảm nhận hằng ngày.',
  ndvi: 'Mức xanh của thảm thực vật. Số càng cao thường là càng nhiều cây cỏ xanh; không đếm được số cây hay diện tích công viên.',
  tvdi: 'Mức khô tương đối của bề mặt, từ 0 (ẩm) đến 1 (khô), suy ra từ hai chỉ số trên. Đang thử nghiệm, chưa dùng để kết luận hạn hán.',
};
const FORMULA = {
  lst: 'Nhiệt độ bề mặt (°C) = ST_B10 × 0,00341802 + 149 − 273,15 (Landsat 8/9 Collection 2 Level-2)',
  ndvi: 'Độ xanh (NDVI) = (NIR − Red) / (NIR + Red), sau hệ số phản xạ Level-2',
  tvdi: 'Độ khô (TVDI) tính từ không gian nhiệt độ – độ xanh của từng mốc ảnh',
};
const READING = [
  ['Ô ảnh 120 m', 'Mỗi ô màu trên bản đồ rộng 120 m. Phóng to hơn nữa không cho thêm chi tiết thật.'],
  ['Vùng không màu', 'Là nơi vệ tinh không có ảnh dùng được (mây, bóng mây, thiếu dữ liệu), không phải giá trị 0. Chúng tôi không đoán để tô kín.'],
  ['Độ tin cậy', 'Cao, Vừa, Thấp cho biết phần ảnh dùng được của khu vực nhiều hay ít (từ 80%, từ 50%, dưới 50%). Đây không phải độ chính xác của phép đo.'],
  ['Khu vực “chưa đủ dữ liệu”', 'Khi ảnh dùng được dưới 50%, trang sẽ không xếp hạng hay so sánh khu vực đó để tránh kết luận sai.'],
  ['Ngày chụp', 'Các phường được chụp vào những ngày khác nhau trong mùa khô, nên số liệu là “ảnh chụp nhanh” của mùa khô, không phải trung bình cả năm hay xu hướng khí hậu.'],
  ['Ranh giới', 'Dùng ranh giới 167 xã/phường sau sáp nhập (không gồm Côn Đảo), áp dụng đồng nhất cho mọi năm.'],
];

async function build() {
  built = true;
  const rows = await data.rows('gee_recovery').catch(() => []);
  const byYear = y => rows.filter(r => r.year === y);
  const coverage = h('div', {class: 'scroll card flat'}, h('table', {class: 'tbl'}, h('thead', null, h('tr', null, h('th', null, 'Năm'), ...INDICES.map(k => h('th', {class: 'num'}, INDEX[k].label)))),
    h('tbody', null, ...YEARS.map(y => h('tr', null, h('th', {scope: 'row', class: 'name'}, String(y)), ...INDICES.map(k => h('td', {class: 'num mono'}, byYear(y).length ? `${policy.summary(byYear(y), k).adequate} / 167` : '—')))))));
  const cards = INDICES.map((k, i) => h('article', {class: 'card method reveal', style: {'--i': i}}, h('span', {class: 'eyebrow'}, INDEX[k].unit ? `${INDEX[k].short} · ${INDEX[k].unit}` : INDEX[k].short + (INDEX[k].experimental ? ' · thử nghiệm' : '')),
    h('h3', null, INDEX[k].name), h('i', {class: 'ramp', style: {background: rampCss(k)}}), h('div', {class: 'ramp-ends mono'}, h('span', null, `${INDEX[k].min}`), h('span', null, `${INDEX[k].max}`)), h('p', {class: 'muted'}, MEANING[k])));
  const downloads = [['/data/gee_recovery/observations.csv', 'Số liệu theo xã/phường (CSV)'], ['/data/hcm_167.geojson', 'Ranh giới 167 xã/phường (GeoJSON)']];

  mount(root,
    h('header', {class: 'page-head'}, h('span', {class: 'eyebrow'}, 'Giới thiệu'), h('h1', null, 'Hiểu số liệu trước khi dùng'),
      h('p', null, 'MobileGIS TP.HCM cho bạn xem nhiệt độ bề mặt, độ xanh và độ khô của từng xã/phường trong mùa khô 2020–2025, tính từ ảnh vệ tinh Landsat 8/9. Dưới đây là cách đọc và mức tin cậy của các con số.')),
    h('div', {class: 'method-grid'}, ...cards),
    h('section', {class: 'block'}, h('h2', null, 'Cách đọc bản đồ'), h('div', {class: 'read-grid'}, ...READING.map(([t, d], i) => h('article', {class: 'read-card reveal', style: {'--i': i}}, h('b', {class: 'mono'}, String(i + 1).padStart(2, '0')), h('h3', null, t), h('p', {class: 'muted'}, d))))),
    h('section', {class: 'block'}, h('h2', null, 'Các mức độ khô'), h('p', {class: 'muted'}, 'Độ khô (TVDI) được chia thành 5 mức bằng nhau để dễ đọc. Đây là cách chia thường gặp trong các nghiên cứu TVDI, dùng để mô tả chứ không phải thang hạn hán đã kiểm định.'),
      h('div', {class: 'scroll card flat'}, h('table', {class: 'tbl'}, h('thead', null, h('tr', null, h('th', null, 'Khoảng giá trị'), h('th', null, 'Mức'))),
        h('tbody', null, ...TVDI_CLASSES.map((c, i) => h('tr', null, h('td', {class: 'mono'}, `${i ? String(TVDI_CLASSES[i - 1].max).replace('.', ',') : '0'} – ${String(Math.min(c.max, 1)).replace('.', ',')}`), h('td', null, c.name))))))),
    h('section', {class: 'block'}, h('h2', null, 'Mỗi năm có bao nhiêu khu vực đủ dữ liệu?'), h('p', {class: 'muted'}, 'Số xã/phường có từ 50% diện tích ảnh dùng được. Những nơi còn lại vẫn xem được trên bản đồ nhưng được đánh dấu “tin cậy thấp”.'), coverage),
    h('section', {class: 'block'}, h('h2', null, 'Dữ liệu từ đâu'),
      h('div', {class: 'two-col'},
        h('article', {class: 'card'}, h('h3', null, 'Ảnh vệ tinh'), h('p', {class: 'muted'}, 'Landsat 8/9 (USGS), xử lý trên Google Earth Engine cho các mốc mùa khô 2020–2025, đã lọc mây và bóng mây. Số liệu là kết quả xử lý từ ảnh, không phải số đo tại mặt đất.')),
        h('article', {class: 'card'}, h('h3', null, 'Ranh giới và lớp phủ'), h('p', {class: 'muted'}, 'Ranh giới 167 xã/phường từ bộ dữ liệu cộng đồng Vietnamese Provinces. Lớp phủ đất lấy từ ESA WorldCover 2021 (CC BY 4.0), chỉ mô tả năm 2021.'))),
      h('div', {class: 'link-grid'}, ...downloads.map(([href, label]) => h('a', {class: 'btn sm', href: url(href), download: ''}, icon('download', 15), label)))),
    h('section', {class: 'block'}, h('h2', null, 'Giúp nhóm thử nghiệm'),
      h('p', {class: 'muted max'}, 'Nhóm đang kiểm thử ứng dụng trên điện thoại thật. Bạn có thể đo tốc độ và làm phiếu khảo sát ngắn (khoảng 5 phút, không cần đăng nhập, không cần ghi tên).'),
      h('a', {class: 'btn primary', href: '#/thu-nghiem'}, icon('flask', 16), 'Tham gia thử nghiệm')),
    h('section', {class: 'block'}, h('h2', null, 'Dùng trên điện thoại'),
      h('p', {class: 'muted max'}, 'Bạn có thể thêm MobileGIS vào màn hình chính như một ứng dụng. Phần đã xem vẫn mở được khi mạng yếu. “Dùng vị trí của tôi” cần HTTPS và không lưu tọa độ của bạn.')),
    h('section', {class: 'block'}, h('details', {class: 'card'}, h('summary', null, 'Chi tiết kỹ thuật (dành cho người làm chuyên môn)'),
      h('div', {class: 'db'}, ...INDICES.map(k => h('p', null, h('b', null, `${INDEX[k].label}: `), h('code', {class: 'formula'}, FORMULA[k]))),
        h('p', {class: 'muted small'}, 'Trung bình xã/phường chỉ tính từ các ô ảnh hợp lệ, mỗi ô như nhau. Tỷ lệ ô hợp lệ là độ phủ mẫu, không phải độ chính xác. Lưới lấy mẫu 120 m không có nghĩa mọi băng gốc có độ phân giải 120 m.'),
        env.api ? null : h('p', {class: 'callout'}, 'Bạn đang xem bản xem thử: bản đầy đủ có thêm đăng nhập và các công cụ dành cho quản trị viên.')))),
    h('p', {class: 'small muted foot'}, 'Thông tin để tham khảo, không thay thế quan trắc hay đánh giá chính thức. Độ khô là chỉ số thử nghiệm; nhiệt độ ở đây là nhiệt độ bề mặt, không phải nhiệt độ không khí.'));
  root.classList.add('page'); stagger(root, ':scope > .page-head, :scope > .block, :scope > .method-grid');
}

export function init(section) {
  root = h('div', {class: 'page about-page'}, h('div', {class: 'skeleton', style: {height: '320px'}}));
  section.append(root);
}
export function show() { if (!built) build().catch(e => mount(root, h('div', {class: 'callout err'}, e.message))); }
