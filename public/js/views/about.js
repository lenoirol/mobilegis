/* Giới thiệu: what the three indices mean, how to read the map, how far to trust the numbers, where the data comes from. */
import {h, mount, icon} from '../core/dom.js';
import {data} from '../core/data.js';
import {INDEX, INDICES, YEARS, rampCss, TVDI_CLASSES, CANONICAL_SOURCE} from '../core/format.js';
import {url} from '../core/api.js';

const policy = window.ViewerPolicy;
let root, built = false;

const MEANING = {
  lst: 'Mặt đường, mái nhà, tán cây nóng đến mức nào lúc vệ tinh chụp. Đây là nhiệt độ bề mặt, thường cao hơn nhiệt độ không khí.',
  ndvi: 'Mức xanh của thảm thực vật. Giá trị càng cao thường là càng nhiều cây cỏ xanh; không đếm được số cây.',
  tvdi: 'Mức khô tương đối của bề mặt (0 ẩm → 1 khô), suy ra từ hai chỉ số trên. Chỉ số thử nghiệm, chưa dùng để kết luận hạn hán.',
};
const HOWTO = [
  ['Bản đồ là màn hình chính', 'Mỗi xã/phường được tô màu theo giá trị trung bình của chỉ số đang chọn. Chạm vào một khu vực để xem ba chỉ số và mức tin cậy.'],
  ['2D và 3D', 'Nút 3D dựng mỗi xã/phường thành khối, chiều cao theo giá trị (đã phóng đại để dễ nhìn). Kéo chuột phải hoặc hai ngón tay để xoay, nghiêng.'],
  ['Diễn biến theo thời gian', 'Chọn khoảng năm ở thanh thời gian rồi bấm phát. Bản đồ chạy lần lượt qua các năm thật 2020–2025; không có số liệu cho năm ở giữa.'],
  ['Xếp hạng', 'Tab Xếp hạng liệt kê 167 xã/phường, mặc định LST cao → thấp, NDVI thấp → cao, TVDI cao → thấp; bấm Cao → thấp / Thấp → cao để đổi. Bấm một tên, bản đồ bên cạnh phóng tới khu vực đó, các khu vực khác mờ đi. Nút Tùy chỉnh để lọc ngưỡng (ví dụ LST > 40).'],
  ['Dự báo theo tháng', 'Tab Dự báo cho giá trị trung bình dự kiến của LST và NDVI trong 6 tháng tới, kèm khoảng tin cậy 80%. Đây là ước tính thử nghiệm, không phải cảnh báo.'],
  ['Vùng màu xám', 'Khu vực có dưới 50% diện tích ảnh dùng được (do mây) không được tô màu, không xếp hạng và không tính khi lọc.'],
  ['Lưu ảnh bản đồ', 'Trong menu Thêm công cụ của bản đồ, mục Lưu ảnh tạo tệp PNG có tiêu đề, tọa độ, la bàn, thước tỷ lệ và thang màu.'],
  ['Tìm kiếm và chia sẻ', 'Gõ tên xã/phường vào ô Tìm (không cần dấu). Mục Chia sẻ trong menu Thêm công cụ sao chép liên kết đúng chỉ số, năm, khu vực đang xem.'],
  ['So sánh hai năm', 'Nút So sánh năm chia bản đồ làm hai nửa bằng thanh kéo: bên trái là năm trên thanh thời gian, bên phải là năm bạn chọn để so.'],
  ['Màu dễ phân biệt', 'Bảng màu thay thế cho người khó nhìn màu đỏ – xanh. Chỉ áp dụng cho tô màu xã/phường; ảnh ô 120 m luôn dùng thang màu gốc.'],
];

async function build() {
  built = true;
  const rows = await data.rows(CANONICAL_SOURCE).catch(() => []);
  const byYear = y => rows.filter(r => r.year === y);
  const coverage = h('div', {class: 'scroll card flat', style: {padding: 0}}, h('table', {class: 'tbl'},
    h('thead', null, h('tr', null, h('th', null, 'Năm'), ...INDICES.map(k => h('th', {class: 'num'}, `${INDEX[k].label} (${INDEX[k].code})`)))),
    h('tbody', null, ...YEARS.map(y => h('tr', null, h('th', {scope: 'row'}, String(y)), ...INDICES.map(k => h('td', {class: 'num'}, byYear(y).length ? `${policy.summary(byYear(y), k).adequate} / 167` : '—')))))));
  mount(root,
    h('header', {class: 'page-head'}, h('h1', null, 'Bản đồ đo nhiệt độ, chỉ số thực vật và chỉ số khô hạn TP.HCM'),
      h('p', null, 'Ứng dụng MobileGIS trực quan hóa diễn biến không gian – thời gian của nhiệt độ bề mặt đất (LST), chỉ số thực vật (NDVI) và chỉ số khô hạn nhiệt độ – thực vật (TVDI) cho 167 xã/phường của TP.HCM sau sáp nhập (không gồm đặc khu Côn Đảo), mùa khô 2020–2025, tính từ ảnh Landsat 8/9.')),
    h('div', {class: 'about-grid'}, ...INDICES.map(k => h('article', {class: 'card'},
      h('span', {class: 'eyebrow'}, `${INDEX[k].code}${INDEX[k].unit ? ' · ' + INDEX[k].unit : ''}${INDEX[k].experimental ? ' · thử nghiệm' : ''}`), h('h3', null, INDEX[k].full.split(' · ')[1]), h('small', {class: 'muted'}, INDEX[k].english),
      h('div', {style: {height: '10px', borderRadius: '5px', margin: '8px 0', background: rampCss(k)}}), h('p', {class: 'small muted', style: {margin: 0}}, MEANING[k]), h('p', {class: 'small', style: {margin: '6px 0 0'}}, h('b', null, 'Cách đọc: '), INDEX[k].read)))),
    h('section', {class: 'about-sec'}, h('h2', null, 'Cách dùng'), h('div', {class: 'about-grid'}, ...HOWTO.map(([t, d]) => h('article', {class: 'card'}, h('h3', null, t), h('p', {class: 'small muted', style: {margin: 0}}, d))))),
    h('section', {class: 'about-sec'}, h('h2', null, 'Mức độ khô (TVDI)'), h('p', {class: 'muted small'}, 'Chia 5 mức bằng nhau theo cách thường dùng trong các nghiên cứu TVDI; đây là quy ước hiển thị, không phải thang hạn hán đã kiểm định.'),
      h('div', {class: 'scroll card flat', style: {padding: 0}}, h('table', {class: 'tbl'}, h('thead', null, h('tr', null, h('th', null, 'Khoảng giá trị'), h('th', null, 'Mức'))),
        h('tbody', null, ...TVDI_CLASSES.map((c, i) => h('tr', null, h('td', {class: 'num', style: {textAlign: 'left'}}, `${i ? String(TVDI_CLASSES[i - 1].max).replace('.', ',') : '0'} – ${String(Math.min(c.max, 1)).replace('.', ',')}`), h('td', null, c.name))))))),
    h('section', {class: 'about-sec'}, h('h2', null, 'Mỗi năm có bao nhiêu khu vực đủ dữ liệu?'), h('p', {class: 'muted small'}, 'Số xã/phường có từ 50% diện tích ảnh dùng được. Mỗi năm là một lần chụp trong mùa khô (các cảnh có thể khác ngày), nên chênh lệch giữa các năm không phải xu thế khí hậu.'), coverage),
    h('section', {class: 'about-sec'}, h('h2', null, 'Vì sao TVDI chỉ để tham khảo'),
      h('div', {class: 'card'}, h('p', {class: 'small', style: {margin: 0}}, 'TVDI được ước lượng riêng cho từng cảnh ảnh, chưa kiểm định bằng số đo độ ẩm đất. Trong dữ liệu này, quan hệ giữa TVDI và NDVI của các xã/phường đổi dấu theo năm (khoảng từ −0,33 đến +0,50), trong khi TVDI luôn đi cùng chiều với LST (khoảng 0,28–0,75). Điều đó cho thấy TVDI phụ thuộc nhiều vào cảnh ảnh được chọn, vì vậy nó chỉ dùng để mô tả mức khô tương đối, không dùng để kết luận hạn hán.'))),
    h('section', {class: 'about-sec'}, h('h2', null, 'Dữ liệu và giới hạn'),
      h('div', {class: 'about-grid'},
        h('article', {class: 'card'}, h('h3', null, 'Ảnh vệ tinh'), h('p', {class: 'small muted', style: {margin: 0}}, 'Landsat 8/9 Collection 2 Level-2 (USGS), xử lý trên Google Earth Engine, đã lọc mây và bóng mây. Ô ảnh 120 m. Đây là kết quả xử lý ảnh, không phải số đo tại mặt đất.')),
        h('article', {class: 'card'}, h('h3', null, 'Ranh giới'), h('p', {class: 'small muted', style: {margin: 0}}, '167 xã/phường TP.HCM sau sáp nhập (không gồm Côn Đảo), dùng chung cho mọi năm. Ranh giới tham khảo từ bộ dữ liệu cộng đồng, không phải ranh giới địa chính.')),
        h('article', {class: 'card'}, h('h3', null, 'Phạm vi sử dụng'), h('p', {class: 'small muted', style: {margin: 0}}, 'Phục vụ học tập và tham khảo; không phải quan trắc thời gian thực, không dự báo, không thay thế cảnh báo chính thức.'))),
      h('div', {class: 'dlg-actions', style: {justifyContent: 'flex-start', flexWrap: 'wrap'}},
        h('a', {class: 'btn', href: url('data/gee_recovery/observations.csv'), download: ''}, icon('download', 16), 'Số liệu theo xã/phường (CSV)'),
        h('a', {class: 'btn', href: url('data/hcm_167.geojson'), download: ''}, icon('download', 16), 'Ranh giới (GeoJSON)'),
        h('a', {class: 'btn primary', href: '#/thu-nghiem'}, icon('flask', 16), 'Giúp nhóm thử nghiệm'))),
    h('p', {class: 'small muted', style: {marginTop: '24px'}}, 'Người dùng thường chỉ xem bản đồ và thống kê. Nạp hay thay đổi dữ liệu và các thông tin quản trị chỉ dành cho quản trị viên.'));
}

export function init(section) {
  root = h('div', {class: 'page about-page'}, h('div', {class: 'skeleton', style: {height: '320px'}}));
  section.append(root);
}
export function show() { if (!built) build().catch(e => mount(root, h('div', {class: 'callout err'}, e.message))); }
