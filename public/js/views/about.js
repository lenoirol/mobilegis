/* Data & methods view: how to read the numbers, data completeness by year, source audit, system status, documents. */
import {h, mount, icon} from '../core/dom.js';
import {data} from '../core/data.js';
import {INDEX, INDICES, YEARS, rampCss, fmt, valid, fmtInt} from '../core/format.js';
import {stagger} from '../core/motion.js';

const policy = window.ViewerPolicy;
let root, built = false;

const METHODS = {
  lst: {formula: 'LST (°C) = ST_B10 × 0,00341802 + 149 − 273,15', text: 'Nhiệt độ bề mặt từ sản phẩm Landsat 8/9 Collection 2 Level-2. Cho biết bề mặt nóng hay mát tại mốc ảnh; không phải nhiệt độ không khí.'},
  ndvi: {formula: 'NDVI = (NIR − Red) / (NIR + Red)', text: 'Chỉ số xanh thực vật, không có đơn vị, sau hệ số phản xạ Level-2. Không chuyển trực tiếp thành số cây hay diện tích cây xanh.'},
  tvdi: {formula: 'TVDI từ không gian LST – NDVI', text: 'Chỉ số khô tương đối từ 0 đến 1, đang thử nghiệm. Không phải cảnh báo hạn đã được kiểm định.'},
};
const READING = [
  ['Ô ảnh 120 m', 'Mỗi ô chỉ số có kích thước lấy mẫu 120 m. Phóng to bản đồ không tạo thêm chi tiết thật.'],
  ['Vùng không màu', 'Là nơi không có mẫu hợp lệ (mây, bóng mây, mất dữ liệu), không phải giá trị 0. Ứng dụng không nội suy để tô kín.'],
  ['Trung bình xã/phường', 'Chỉ tính từ các ô hợp lệ. Có số ở 167 khu vực không có nghĩa ảnh phủ kín 167 khu vực.'],
  ['Độ phủ mẫu', 'Là tỷ lệ ô hợp lệ trong khu vực, không phải độ chính xác. 50% là ngưỡng hỗ trợ đọc/so sánh, không phải chứng nhận chất lượng.'],
  ['Ngày ảnh', 'Cùng một mùa nhưng ngày ảnh khác nhau giữa vùng và năm, nên không diễn giải chuỗi như trung bình năm hay xu thế khí hậu.'],
  ['Ranh giới và lớp phủ', 'Ranh giới tham chiếu năm 2025 dùng chung cho mọi mốc, không phải ranh giới lịch sử. Lớp phủ ESA WorldCover chỉ mô tả năm 2021.'],
  ['Giả lập', 'Tab Giả lập cộng mức thay đổi do người dùng nhập. Kết quả tách khỏi hiện trạng và không phải dự báo đã kiểm định.'],
];

async function build() {
  built = true;
  const [rows, info, product, boundary] = await Promise.all([data.rows('gee_recovery').catch(() => []), data.info().catch(() => null), data.product('gee_recovery').catch(() => null), data.boundary().catch(() => null)]);
  const byYear = y => rows.filter(r => r.year === y);
  const quality = h('div', {class: 'scroll card flat'}, h('table', {class: 'tbl'}, h('thead', null, h('tr', null, h('th', null, 'Năm'), ...INDICES.map(k => h('th', {class: 'num'}, `${INDEX[k].label}: độ phủ ≥ 50%`)))),
    h('tbody', null, ...YEARS.map(y => h('tr', null, h('th', {scope: 'row', class: 'name'}, String(y)), ...INDICES.map(k => h('td', {class: 'num mono'}, byYear(y).length ? `${policy.summary(byYear(y), k).adequate} / 167` : 'chưa tải')))))));
  const audits = product ? Object.values(product.audits || {}).sort((a, b) => a.year - b.year) : [];
  const methodCards = INDICES.map((k, i) => h('article', {class: 'card method reveal', style: {'--i': i}}, h('span', {class: 'eyebrow'}, INDEX[k].unit ? `${INDEX[k].label} · ${INDEX[k].unit}` : INDEX[k].label + (INDEX[k].experimental ? ' · thử nghiệm' : '')),
    h('h3', null, INDEX[k].name), h('i', {class: 'ramp', style: {background: rampCss(k)}}), h('div', {class: 'ramp-ends mono'}, h('span', null, `${INDEX[k].min}`), h('span', null, `${INDEX[k].max}`)),
    h('code', {class: 'formula'}, METHODS[k].formula), h('p', {class: 'muted'}, METHODS[k].text)));
  const links = [['/data/gee_recovery/observations.csv', 'CSV hiện trạng 2020–2025'], ['/data/gee_recovery/products.json', 'Metadata & kiểm tra nguồn'], ['/api/documents/gee_script.js', 'Script xuất GEE'], ['/api/documents/gee_next_years.md', 'Quy trình xuất 2020–2024'], ['/data/hcm_167.geojson', 'Ranh giới GeoJSON'], ['/data/landsat_manifest.json', 'Danh mục cảnh và tham số TVDI']];
  const docs = [['/docs', 'Tài liệu REST API'], ['/api/documents/schema.sql', 'SQL tạo bảng và migration'], ['/api/documents/database_design.md', 'Thiết kế CSDL'], ['/api/documents/quickstart.md', 'Cách chạy PostgreSQL'], ['/api/documents/pg3_guide.md', 'Hướng dẫn PG3']];
  const linkList = items => h('div', {class: 'link-grid'}, ...items.map(([href, label]) => h('a', {class: 'btn sm', href, ...(href.startsWith('/docs') ? {target: '_blank', rel: 'noopener'} : {download: ''})}, icon('download', 15), label)));

  mount(root,
    h('header', {class: 'page-head'}, h('span', {class: 'eyebrow'}, 'Hiểu dữ liệu trước khi đọc kết quả'), h('h1', null, 'Dữ liệu & phương pháp'),
      h('p', null, 'Ảnh Landsat 8/9 Collection 2 Level-2 được xử lý bằng Google Earth Engine cho các mốc mùa khô 2020–2025. Bộ mặc định đã gồm phần bổ sung thực năm 2025; không trộn với bộ xử lý cũ hay dữ liệu giả lập.')),
    h('div', {class: 'method-grid'}, ...methodCards),
    h('section', {class: 'block'}, h('h2', null, 'Dữ liệu có đầy đủ không?'), h('p', {class: 'muted'}, 'Số khu vực đạt độ phủ mẫu ≥ 50% theo năm và chỉ số. Số liệu ít mẫu vẫn giữ trong bảng gốc và được đánh dấu.'), quality),
    h('section', {class: 'block'}, h('h2', null, 'Cách đọc bản đồ'), h('div', {class: 'read-grid'}, ...READING.map(([t, d], i) => h('article', {class: 'read-card reveal', style: {'--i': i}}, h('b', {class: 'mono'}, String(i + 1).padStart(2, '0')), h('h3', null, t), h('p', {class: 'muted'}, d))))),
    audits.length ? h('section', {class: 'block'}, h('h2', null, 'Bộ xuất GEE đã kiểm tra'),
      h('p', {class: 'muted'}, `Đã nhập ${audits.length} năm, ${rows.length.toLocaleString('vi-VN')} dòng thống kê. Số ô hợp lệ và trung bình được tính lại theo cùng quy tắc tâm pixel; không cắt tỷ lệ sai về 100%.`),
      h('div', {class: 'scroll card flat'}, h('table', {class: 'tbl'}, h('thead', null, h('tr', null, h('th', null, 'Năm'), h('th', {class: 'num'}, 'Có LST / NDVI / TVDI'), h('th', null, 'Ngày chụp các cảnh'))),
        h('tbody', null, ...audits.map(a => h('tr', null, h('th', {scope: 'row', class: 'name'}, String(a.year)), h('td', {class: 'num mono'}, `${a.valid_means.lst} / ${a.valid_means.ndvi} / ${a.valid_means.tvdi} trên 167`), h('td', {class: 'mono small'}, [...new Set((a.scenes || []).map(s => s.acquisition_date))].sort().join(', '))))))),
      product.recovery ? h('p', {class: 'callout'}, 'Phần bổ sung 2025: 6.324 ô từ LC09 path/row 125/052 ngày 28/02/2025 và 1 ô từ LC08 path/row 124/052 ngày 12/01/2025. Ô gốc, dữ liệu 2020–2024 và các khu vực khác giữ nguyên; không nội suy, không dùng ảnh 2026.') : null,
      linkList(links)) : null,
    h('section', {class: 'block'}, h('h2', null, 'Nguồn và quy trình'),
      h('div', {class: 'two-col'},
        h('article', {class: 'card'}, h('h3', null, 'Ranh giới 167 đơn vị'), h('p', {class: 'muted'}, 'Phạm vi TP.HCM sau sáp nhập, chỉ loại Côn Đảo. Dùng bộ dữ liệu cộng đồng Vietnamese Provinces Database v4.2.0, ranh giới tham chiếu năm 2025 cho mọi mốc.'), boundary ? h('p', {class: 'small mono'}, `Đã tải ${boundary.included_count} đơn vị · đối chiếu mã: ${boundary.list_verification?.status === 'matched' ? 'khớp toàn bộ' : 'cần rà soát'}`) : null),
        h('article', {class: 'card'}, h('h3', null, 'Ảnh Landsat'), h('p', {class: 'muted'}, 'USGS Landsat 8/9 Collection 2 Level-2. Áp hệ số chuyển đổi, lọc mây và bóng mây bằng QA_PIXEL / QA_RADSAT. Lưới sản phẩm 120 m không có nghĩa mọi băng gốc có độ phân giải 120 m.'),
          h('p', {class: 'small muted'}, 'Lớp phủ đất: ESA WorldCover 2021 (CC BY 4.0), thống kê trên lưới 10 m, hiển thị khoảng 30 m.')))),
    h('section', {class: 'block'}, h('h2', null, 'Dùng trên điện thoại và khi mất mạng'),
      h('p', {class: 'muted max'}, 'MobileGIS là ứng dụng web có thể cài lên màn hình chính (PWA). Khi mở qua localhost hoặc HTTPS, giao diện, ranh giới, bảng số liệu và ảnh chỉ số đã xem được lưu đệm. Bản đồ nền đường phố cần Internet; “Vị trí của tôi” cần HTTPS hoặc localhost và không lưu tọa độ.')),
    h('section', {class: 'block'}, h('h2', null, 'Cơ sở dữ liệu'),
      h('article', {class: 'card'}, info ? h('div', {class: 'db'}, h('p', {class: 'mono'}, `PostgreSQL ${info.database.postgres_version} · PostGIS ${info.database.postgis} · schema ${info.database.schema_version}`),
        h('div', {class: 'scroll card flat'}, h('table', {class: 'tbl'}, h('thead', null, h('tr', null, h('th', null, 'Chỉ số'), h('th', null, 'Bảng SQL riêng'), h('th', {class: 'num'}, 'Bản ghi'))),
          h('tbody', null, ...info.database.metric_tables.map(m => h('tr', null, h('th', {scope: 'row', class: 'name'}, m.index.toUpperCase()), h('td', {class: 'mono'}, m.table), h('td', {class: 'num mono'}, fmtInt(m.rows))))))),
        h('p', {class: 'muted small'}, 'LST, NDVI và TVDI nằm trong ba bảng riêng của cùng một database. GeoTIFF, tile và lưới tra cứu lưu trên đĩa, không nằm trong PostGIS. GEE bản gốc, bản bổ sung 2025 và bộ cũ được giữ riêng; chỉ điểm thực hành có thể thêm/sửa/xóa và có nhật ký.'))
        : h('p', {class: 'callout err'}, 'Không truy vấn được CSDL. Kiểm tra PostgreSQL; không coi dữ liệu đệm là cập nhật mới.'), linkList(docs))),
    h('p', {class: 'small muted foot'}, 'Ứng dụng phục vụ học tập, nghiên cứu và trình diễn; không phải hệ thống hỗ trợ quyết định chính thức. TVDI là thử nghiệm; LST là nhiệt độ bề mặt.'));
  root.classList.add('page'); stagger(root, ':scope > .page-head, :scope > .block, :scope > .method-grid');
}

export function init(section) {
  root = h('div', {class: 'page about-page'}, h('div', {class: 'skeleton', style: {height: '320px'}}));
  section.append(root);
}
export function show() { if (!built) build().catch(e => mount(root, h('div', {class: 'callout err'}, e.message))); }
