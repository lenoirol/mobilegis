# Giao diện v3.1 · Bản đồ Nhiệt - Xanh - Khô TP.HCM

Xây lại toàn bộ giao diện web (01/11/2026) theo góp ý của cô: bản đồ là thành phần chính, có 2D/3D, chạy diễn biến theo
khoảng năm, xếp hạng 167 xã/phường, lọc theo ngưỡng, nền màu nhẹ, người dùng tự xóa được tài khoản.
Máy chủ, API, cơ sở dữ liệu và số liệu không đổi. Giao diện UI2 cũ được lưu ở `luu_tru/giao_dien_v2/` (không xóa).

## Bổ sung v3.1 (02/11/2026)
- **Logo mới** (`public/logo.svg`, `icon.svg`, các biểu tượng PNG 192/512/maskable): ô vuông xanh bo góc, hình TP.HCM màu vàng có mặt cười, giọt nước; bộ nhớ đệm `sw.js` = `mobilegis-v31`.
- **Tìm kiếm** xã/phường (gõ không dấu), **Chia sẻ** liên kết (trạng thái nằm trong phần `#` của địa chỉ: chỉ số, năm, khu vực, chế độ, kiểu, nền, màu, khoảng năm, năm so sánh), **Hướng dẫn nhanh** 5 bước lần đầu vào (nút `?` mở lại; ghi nhớ trong `localStorage` khóa `mg-tour`).
- **So sánh hai năm**: bản đồ thứ hai không tương tác, cắt bằng thanh kéo, camera đồng bộ (`public/js/map/compare.js`).
- **Màu dễ phân biệt** (viridis/inferno) cho người khó nhìn đỏ–xanh; chỉ áp dụng cho tô màu xã/phường, biểu đồ, chú giải; ảnh ô 120 m giữ thang gốc.
- **Lưu ý khi đọc** trong chú giải + mục "Vì sao TVDI chỉ để tham khảo" ở trang Giới thiệu (mỗi năm một cảnh ≠ xu thế khí hậu; TVDI thử nghiệm; LST ≠ nhiệt độ không khí).
- **Thống kê sử dụng ẩn danh** (`POST /api/hit`: loại area/layer/page/feature/error; không lưu danh tính) và khối "Mức độ sử dụng" ở tổng quan quản trị.
- **Nhập số liệu (quản trị viên)**: tab "Nhập số liệu" trong `admin.html`. CSV `code,year,sampled_pixels,lst,lst_pixels,ndvi,ndvi_pixels,tvdi,tvdi_pixels,dates`;
  xem trước thay đổi → áp dụng → hoàn tác / áp dụng lại. Là lớp phủ (`mobilegis.observation_imports`, migration 008, schema 8): số liệu đã công bố không bị sửa;
  độ phủ = số ô / số ô lấy mẫu, quy tắc ≥ 50% vẫn áp dụng. Ô ảnh 120 m và bản tĩnh GitHub Pages không đổi theo lần nhập. Mã: `observation_imports.py`, `engagement_api.py`, `public/js/admin-import.js`.
- **Đợt 2 GEE (2025)**: `data/gee_recovery/batch2_20261101_review/nhap_so_lieu_dot2.csv` (27 dòng) lấy từ bản rà soát; đã áp dụng ở DB local, còn 4 xã dưới 50% (Phú Lợi, Bình Dương, Hòa Lợi, Tân Khánh).
  Máy chủ thật (Supabase) cần chạy `python scripts/migrate_engagement.py --supabase` rồi quản trị viên tải tệp lên.

## Màn hình chính (bản đồ toàn màn hình)
- **Thanh trên:** tên ứng dụng, chọn chỉ số (Nhiệt độ LST · Độ xanh NDVI · Độ khô TVDI), menu Xếp hạng / Thống kê / Bảng số liệu / Giới thiệu / Tài khoản.
- **Bảng Xếp hạng (bên trái; trên điện thoại là tấm trượt từ dưới lên, tối đa khoảng nửa màn hình):** 167 xã/phường,
  LST cao → thấp, NDVI thấp → cao, TVDI cao → thấp. Khu vực có độ phủ mẫu < 50% xếp cuối, ghi "chưa đủ dữ liệu", không xếp hạng.
  **Lọc theo ngưỡng** (ví dụ LST > 40) cho từng chỉ số, kết hợp được; khu vực không thỏa bị làm mờ trên bản đồ. Tải CSV danh sách.
- **Công cụ (bên phải):** 2D / 3D, Xã/phường / Ô ảnh 120 m, nền Bản đồ / Vệ tinh / Nhẹ, độ cao khối 3D, Toàn vùng, **Lưu ảnh**.
- **Thẻ khu vực đang chọn:** tên, ngày chụp, ba giá trị kèm mức tin cậy, cảnh báo thử nghiệm khi TVDI ≥ 0,8, đường diễn biến 2020–2025.
  Đọc được ngay, không cần cuộn.
- **Thanh thời gian (dưới cùng):** năm hiện tại, chọn khoảng năm (từ – đến), tốc độ, nút phát. Chỉ chạy qua các năm thật;
  hiệu ứng chuyển giữa hai năm chỉ là chuyển cảnh, nhãn luôn là năm thật.
- **Chú giải:** thang màu đúng tài liệu của cô, vùng xám = chưa đủ dữ liệu, ghi chú lọc và chiều cao 3D.

## 3D
MapLibre GL JS 6.13 (`public/vendor/maplibre/`, giấy phép BSD-3) thay cho Leaflet. 3D dựng mỗi xã/phường thành khối
(`fill-extrusion`), chiều cao theo giá trị trong khoảng min–max của 6 năm (đã phóng đại, có thanh chỉnh độ cao), màu theo thang màu.
Khu vực chưa đủ dữ liệu hoặc không thỏa lọc nằm phẳng, màu xám nhạt. Chế độ Ô ảnh 120 m chỉ có 2D.

## Lưu ảnh bản đồ
PNG có tiêu đề, phụ đề (chỉ số, năm, cách tính), khung tọa độ (chỉ khi bản đồ phẳng, hướng Bắc lên), la bàn (xoay theo bản đồ),
thước tỷ lệ (chỉ khi phẳng), thang màu, nguồn dữ liệu và nền.

## Trang phụ (mở đè lên bản đồ, nút "Về bản đồ")
`#/thong-ke`, `#/bang-so-lieu`, `#/gioi-thieu`, `#/tai-khoan`, `#/thu-nghiem`. Liên kết cũ `#/ban-do?khu-vuc=…&nam=…` vẫn mở đúng khu vực.
Trang Giả lập (ngoài đề cương) không còn trên giao diện; API phía máy chủ giữ nguyên, chỉ quản trị viên gọi được.

## Tài khoản
- Ai cũng xem bản đồ, xếp hạng, thống kê mà không cần tài khoản. Người dùng thường chỉ xem; quản trị viên có toàn quyền (trang `admin.html`).
- Trang Tài khoản: đăng nhập, đăng ký, quên/đặt lại mật khẩu, đổi mật khẩu, **xóa tài khoản của tôi** (nhập mật khẩu + xác nhận).
  API mới `POST /api/auth/delete-account` (cần CSRF); quản trị viên cuối cùng không tự xóa được. Quản trị viên xóa tài khoản người khác ở `admin.html` như trước.
- `login.html` chỉ còn chuyển hướng về `#/tai-khoan`.

## Phong cách
Nền xanh xám rất nhạt `#f3f6f8`, thẻ trắng trong mờ, viền mảnh, bóng nhẹ, một màu nhấn xanh ngọc `#23756a`, chữ hệ thống
(hiển thị tiếng Việt tốt, không cần tải phông). Màu dữ liệu LST/NDVI/TVDI không đổi (`public/js/core/format.js`).

## Cấu trúc mã
- `public/js/app.js` – khung ứng dụng, trạng thái, định tuyến trang phụ.
- `public/js/map/engine.js` – bản đồ MapLibre (lớp, 2D/3D, chuyển năm, chọn, làm mờ theo lọc).
- `public/js/map/panel.js` – xếp hạng + lọc ngưỡng. `widgets.js` – thẻ khu vực, chú giải, thanh thời gian. `export.js` – lưu ảnh.
- `public/js/views/` – Thống kê, Bảng số liệu, Giới thiệu, Tài khoản, Thử nghiệm. `public/styles/base.css` + `app.css`.

## Kiểm thử
- `.venv/bin/python -m unittest discover -s tests` (106 kiểm thử, có tự xóa tài khoản và nhập số liệu) và `node --test tests/viewer-policy.test.cjs`.
- `MOBILEGIS_URL=http://127.0.0.1:5379 .venv/bin/python tests/e2e_ui.py` – 47 kiểm tra trình duyệt (Chrome thật, WebGL bằng SwiftShader):
  xếp hạng, lọc, 3D, tìm kiếm, chia sẻ, so sánh năm, màu dễ phân biệt, hướng dẫn nhanh, thanh thời gian, lưu ảnh, CSV, các trang phụ, đăng ký → xóa tài khoản, quản trị, điện thoại, bản tĩnh.
- Máy chủ trả `204` cho ô bản đồ nằm ngoài dữ liệu (trước đây là ảnh PNG 1×1 trong suốt).
