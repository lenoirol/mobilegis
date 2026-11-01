/* "Dành cho chuyên gia": the detailed tables and statistics, kept out of the main visitor flow. */
import {h, icon} from '../core/dom.js';
import {stagger} from '../core/motion.js';

const CARDS = [
  {href: '#/bang-so-lieu', icon: 'table', title: 'Bảng số liệu', text: 'Giá trị nhiệt độ, độ xanh, độ khô của từng xã/phường theo năm, kèm bảng tổng, xếp hạng và tải CSV.'},
  {href: '#/thong-ke', icon: 'chart', title: 'Thống kê', text: 'Biểu đồ diễn biến, so sánh nhiều khu vực, tương quan nhiệt độ – độ xanh và sàng lọc khu vực có độ khô cao.'},
  {href: '#/gia-lap', icon: 'flask', title: 'Kịch bản giả lập', text: 'Công cụ thử nghiệm của quản trị viên, nằm ngoài đề cương. Không phải dự báo.', admin: true},
];

export function init(section) {
  const root = h('div', {class: 'page experts-page'},
    h('header', {class: 'page-head'}, h('span', {class: 'eyebrow'}, 'Dành cho chuyên gia'), h('h1', null, 'Số liệu chi tiết'),
      h('p', null, 'Các bảng và thống kê dành cho người có chuyên môn. Bản đồ vẫn là cách nhanh nhất để xem kết quả; những trang này giúp đối chiếu và kiểm tra.')),
    h('div', {class: 'expert-grid'}, ...CARDS.map((c, i) => h('a', {class: 'card expert-card reveal' + (c.admin ? ' admin-only' : ''), href: c.href, style: {'--i': i}}, icon(c.icon, 28), h('h2', null, c.title), h('p', {class: 'muted'}, c.text), h('span', {class: 'btn sm'}, 'Mở')))));
  section.append(root); stagger(root, ':scope > .page-head, :scope > .expert-grid');
}
