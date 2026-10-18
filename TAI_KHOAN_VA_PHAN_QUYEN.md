# Tài khoản và phân quyền (schema 4)

MobileGIS TP.HCM là **web-app PWA**. Từ bản `2026.10.PG4` ứng dụng có đăng ký, đăng nhập,
quên mật khẩu và hai giao diện: **Khách hàng** (ứng dụng chính) và **Quản trị** (`/admin.html`).

## Ai làm được gì

| Việc | Khách (chưa đăng nhập) | Khách hàng | Quản trị viên |
|---|:-:|:-:|:-:|
| Xem bản đồ, bảng số liệu, bảng tổng, thống kê, tra cứu điểm | ✔ | ✔ | ✔ |
| Xuất CSV số liệu | ✔ | ✔ | ✔ |
| Đổi mật khẩu của mình | – | ✔ | ✔ |
| Thêm/sửa/xóa điểm thực hành, nhập CSV demo | – | – | ✔ |
| Tạo và lưu giả lập (ghi vào PostgreSQL) | – | – | ✔ |
| Quản lý tài khoản, cấp mã quên mật khẩu, xem nhật ký | – | – | ✔ |

Quyền được kiểm tra ở **máy chủ** (HTTP 401 chưa đăng nhập, 403 không đủ quyền). Việc ẩn nút trên giao diện chỉ để dễ dùng, không phải bảo mật.
Dữ liệu nghiên cứu hiện trạng (LST, NDVI, TVDI) vẫn chỉ đọc với mọi vai trò.

## Cài đặt lần đầu (máy đã có PG3)

1. Sao lưu database: `pg_dump -Fc -d mobilegis -f mobilegis_truoc_pg4.backup`.
2. Áp migration và cấp quyền (dùng tài khoản chủ CSDL; không ghi mật khẩu vào file):
   `MOBILEGIS_ADMIN_PASSWORD=... .venv/bin/python scripts/migrate_accounts.py --user <chủ CSDL>`
3. Tạo quản trị viên đầu tiên, bạn tự chọn mật khẩu (≥ 8 ký tự):
   `.venv/bin/python scripts/create_admin.py --email ban@example.com --name "Tên của bạn"`
   (tool hỏi mật khẩu; hoặc đặt biến `MOBILEGIS_NEW_ADMIN_PASSWORD`).
4. Khởi động server và vào `/login.html`.

Cài mới từ đầu: `import_postgres.py` đã tự thêm migration 004; chỉ cần bước 3.

## Cách hoạt động

- **Mật khẩu**: băm bằng `scrypt` (thư viện chuẩn Python), không lưu mật khẩu gốc.
- **Phiên đăng nhập**: cookie `mg_session` (HttpOnly, SameSite=Lax, 12 giờ; thêm Secure khi chạy HTTPS). Trong DB chỉ lưu bản băm của mã phiên.
- **CSRF**: thao tác ghi cần cookie *và* header `X-Token` (lấy từ `/api/session`).
- **Khóa tạm**: sai mật khẩu 5 lần thì khóa 15 phút. Thông báo lỗi giống nhau cho email không tồn tại và mật khẩu sai.
- **Quên mật khẩu** (chưa có dịch vụ email vì chạy cục bộ):
  1. Người dùng nhập email ở “Quên mật khẩu”.
  2. Quản trị viên vào *Trang quản trị → Quên mật khẩu → Cấp mã*; mã 8 ký tự hiện **một lần**, hiệu lực 30 phút, dùng một lần, tối đa 5 lần nhập sai.
  3. Quản trị viên gửi mã cho người dùng qua kênh riêng; người dùng nhập email, mã, mật khẩu mới.
  Đổi hoặc đặt lại mật khẩu sẽ đăng xuất các thiết bị khác.
- **Bảo vệ quản trị viên cuối**: không thể hạ quyền, khóa hoặc xóa quản trị viên đang hoạt động cuối cùng; không thể tự xóa mình.
- **Nhật ký**: bảng `auth_events` (đăng ký, đăng nhập, đăng nhập sai, đổi vai trò…), xem ở tab Nhật ký.

## Bốn bảng mới (không đụng bảng nghiên cứu)

`app_users`, `app_sessions`, `password_resets`, `auth_events`. Vai trò chỉ có `customer` và `admin`.
Role `mobilegis_app` được cấp SELECT/INSERT/UPDATE/DELETE trên ba bảng đầu và SELECT/INSERT trên `auth_events`.

## Giới hạn cần nói thật

- Chưa có xác minh email và chưa gửi email tự động; quên mật khẩu dựa vào quản trị viên.
- Chưa có HTTPS tự động. Nếu mở ra Internet phải đặt sau HTTPS và không mở cổng PostgreSQL.
- Chưa kiểm thử tải nhiều người đồng thời. Nhật ký DEMO (`audit_log`) vẫn ghi tài khoản kết nối CSDL, chưa ghi từng người dùng.

## Đợt 2: khu vực đã lưu, góp ý, thông báo (schema 5)

- **Khách hàng đã đăng nhập:** lưu tối đa 30 khu vực và xem bảng so sánh nhanh ở trang chủ ("Khu vực của tôi"); gửi góp ý/báo sai số liệu (tối đa 5 lần mỗi giờ); xuất báo cáo một khu vực ra PDF bằng nút "Xuất PDF" (dùng hộp thoại in của trình duyệt).
- **Quản trị viên:** tạo tài khoản trực tiếp (tab Tài khoản), xử lý góp ý (tab Góp ý), đặt thông báo đầu trang (tab Nội dung).
- **Nâng cấp CSDL đã có:** chạy một lần `python scripts/migrate_engagement.py --user <chủ CSDL>` (cục bộ) hoặc `python scripts/migrate_engagement.py --supabase`. **Triển khai mã mới lên Render trước, rồi mới chạy lệnh Supabase**, vì mã cũ không nhận schema 5.
