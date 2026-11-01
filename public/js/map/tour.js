/* First-visit guide (also from the "?" button): five short steps, never shown again after "Đã hiểu" is ticked. */
import {h, icon} from '../core/dom.js';

const KEY = 'mg-tour';
export const tourSeen = () => { try { return localStorage.getItem(KEY) === '1'; } catch (_) { return true; } };
const STEPS = [
  ['map', 'Chạm vào bản đồ', 'Chạm một xã/phường để xem nhiệt độ, độ xanh và độ khô cùng mức tin cậy. Màu xám nghĩa là chưa đủ dữ liệu (ảnh bị mây che).'],
  ['sliders', 'Chọn chỉ số và năm', 'Đổi chỉ số ở thanh trên. Chọn năm ở thanh thời gian bên dưới hoặc bấm ▶ để xem diễn biến 2020–2025.'],
  ['layers', '2D và 3D', 'Nút 3D dựng mỗi xã/phường thành khối, chiều cao theo giá trị. Kéo chuột phải hoặc dùng hai ngón tay để xoay và nghiêng.'],
  ['table', 'Xếp hạng, tìm kiếm, lọc', 'Bảng Xếp hạng liệt kê 167 xã/phường. Gõ tên để tìm, hoặc bật lọc (ví dụ LST > 40) để làm nổi các khu vực thỏa.'],
  ['compare', 'So sánh, lưu ảnh, chia sẻ', 'So sánh hai năm bằng thanh kéo, lưu bản đồ thành ảnh có tọa độ và thang màu, hoặc sao chép liên kết đúng khung nhìn đang xem.'],
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
