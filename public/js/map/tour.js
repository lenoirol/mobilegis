/* First-visit guide (also from the "?" button): five short steps, never shown again after "Đã hiểu" is ticked. */
import {h, icon} from '../core/dom.js';

const KEY = 'mg-tour';
export const tourSeen = () => { try { return localStorage.getItem(KEY) === '1'; } catch (_) { return true; } };
const STEPS = [
  ['map', 'Chạm vào bản đồ', 'Chạm một xã/phường để xem nhiệt độ, độ xanh và độ khô cùng mức tin cậy. Màu xám nghĩa là chưa đủ dữ liệu (ảnh bị mây che).'],
  ['sliders', 'Chọn chỉ số và năm', 'Chọn LST (nhiệt độ), NDVI (độ xanh) hoặc TVDI (độ khô) ở thanh trên; lựa chọn này dùng chung cho mọi tab. Chọn năm ở thanh thời gian hoặc bấm ▶ để xem 2020–2025.'],
  ['layers', '2D và 3D', 'Nút 3D dựng mỗi xã/phường thành khối, chiều cao theo giá trị. Dùng hai ngón tay để xoay và nghiêng.'],
  ['table', 'Xếp hạng', 'Tab Xếp hạng liệt kê 167 xã/phường; bấm một tên để bản đồ phóng tới khu vực đó. Nút Cao → thấp / Thấp → cao đổi thứ tự, nút Tùy chỉnh để lọc (ví dụ LST > 40).'],
  ['compare', 'Dự báo, thống kê và tiện ích', 'Tab Dự báo cho giá trị dự kiến các tháng tới, tab Thống kê cho biểu đồ. Nút So sánh năm và menu Thêm công cụ (bản đồ nền, lưu ảnh, chia sẻ) nằm trên dải công cụ.'],
];

export function showTour() {
  const again = h('input', {type: 'checkbox', checked: true});
  const dialog = h('dialog', {class: 'tour', 'aria-label': 'Hướng dẫn nhanh'},
    h('h2', null, 'Hướng dẫn nhanh'), h('p', {class: 'muted small', style: {margin: '4px 0 12px'}}, 'Bản đồ Nhiệt - Xanh - Khô TP.HCM · mùa khô 2020–2025'),
    h('ol', {class: 'tour-steps'}, ...STEPS.map(([ic, t, d]) => h('li', null, h('span', {class: 'tour-ic'}, icon(ic, 18)), h('div', null, h('b', null, t), h('p', null, d))))),
    h('div', {class: 'dlg-actions', style: {justifyContent: 'space-between', alignItems: 'center'}},
      h('label', {class: 'check'}, again, 'Không hiện lại'),
      h('button', {class: 'btn primary', type: 'button', on: {click: () => { try { if (again.checked) localStorage.setItem(KEY, '1'); } catch (_) { /* ignore */ } dialog.close(); dialog.remove(); }}}, 'Đã hiểu')));
  dialog.addEventListener('cancel', () => dialog.remove());
  document.body.append(dialog); dialog.showModal();
}
