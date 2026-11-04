/* "Thêm": trang tổng hợp các mục phụ cho điện thoại (tài khoản, bảng số liệu, giới thiệu, giải nghĩa chỉ số, hướng dẫn…). */
import {h, mount, icon} from '../core/dom.js';
import {session, onSession, env, url} from '../core/api.js';
import {showGlossary} from '../ui/glossary.js';
import {showTour} from '../map/tour.js';

const FULL_APP = 'https://mobilegis-93u9.onrender.com/';
let root;

const tile = (ic, title, text, on, href, tone = '') => {
  const body = [h('span', {class: 'mt-ic'}, icon(ic, 24)), h('span', {class: 'mt-tx'}, h('b', null, title), h('small', null, text)), h('span', {class: 'mt-go'}, icon('chevron', 18))];
  return href ? h('a', {class: 'more-tile ' + tone, href}, ...body) : h('button', {class: 'more-tile ' + tone, type: 'button', on: {click: on}}, ...body);
};

function render() {
  const user = session.user, admin = user?.role === 'admin';
  const account = user
    ? tile('user', user.display_name || user.email, `Đã đăng nhập${admin ? ' · quản trị viên' : ''} · xem hồ sơ, đổi mật khẩu, đăng xuất`, null, '#/tai-khoan', 'tone-account')
    : tile('user', 'Đăng nhập / Đăng ký', env.api ? 'Tạo tài khoản hoặc đăng nhập để dùng đầy đủ chức năng' : 'Mở bản đầy đủ để đăng nhập hoặc tạo tài khoản', null, env.api ? '#/tai-khoan' : FULL_APP + '#/tai-khoan', 'tone-account');
  mount(root,
    h('header', {class: 'page-head'}, h('span', {class: 'eyebrow'}, 'Thêm'), h('h1', null, 'Tài khoản và tiện ích'), h('p', null, 'Các mục còn lại của ứng dụng: tài khoản, bảng số liệu, giải nghĩa chỉ số và hướng dẫn.')),
    h('div', {class: 'more-list'},
      account,
      admin && tile('lock', 'Quản trị', 'Nhập số liệu, quản lý người dùng và nhật ký', null, url('admin.html'), 'tone-admin'),
      tile('grid', 'Bảng số liệu', 'Tra cứu số liệu từng xã/phường, tải CSV', null, '#/bang-so-lieu', 'tone-a'),
      tile('info', 'LST, NDVI, TVDI nghĩa là gì?', 'Tên đầy đủ, ý nghĩa, cách đọc và giới hạn của ba chỉ số', () => showGlossary('lst'), null, 'tone-b'),
      tile('map', 'Giới thiệu và cách đọc bản đồ', 'Nguồn dữ liệu, giới hạn, cách dùng', null, '#/gioi-thieu', 'tone-c'),
      tile('sliders', 'Hướng dẫn nhanh', 'Xem lại các bước làm quen khi mở lần đầu', () => showTour(), null, 'tone-d'),
      env.api && tile('flask', 'Thử nghiệm trên điện thoại', 'Giúp nhóm đo thử và góp ý', null, '#/thu-nghiem', 'tone-e'),
      !env.api && tile('globe', 'Mở bản đầy đủ', 'Bản có đăng nhập, quản trị và thống kê theo ô ảnh', null, FULL_APP, 'tone-e')));
}
export function init(section) { root = h('div', {class: 'page more-page'}); section.append(root); onSession(render); render(); }
export function show() { render(); }
