# Kiểm tra chuyển đổi PostgreSQL / PostGIS — PG1

Ngày 05/10/2026. Project tại Documents/ChatGPT/gis/mobilegis, không phải bản cũ
trong Downloads. Kết nối đang dùng: PostgreSQL 18.6 trên localhost cổng5432,
database mobilegis, schema mobilegis, PostGIS3.6.2. Web dùng tài khoản ứng dụng
riêng, không dùng tài khoản quản trị. Không ghi mật khẩu vào báo cáo này.

## Kết quả

* 13 bảng trong schema mobilegis, PK/FK/CHECK, GiST cho polygon/điểm và B-tree
  cho nguồn/năm. 167 MultiPolygon hợp lệ EPSG4326.
* Ba nguồn legacy/gee/gee_recovery: mỗi nguồn1002dòng, 167đơn vị × 6năm2020–2025.
  Đối chiếu toàn bộ3006dòng và metadata với JSON đầu vào: không thay giá trị.
* Giữ24dòng CSV nhóm và36dòng demo cùng ID cũ. NULL không đổi thành0.
* GEE gốc DĩAn25942 năm2025 còn NULL; gee_recovery có LST43,0780904204°C.
  158đơn vị2025 có LST và độ phủ≥50%;167đơn vị có cả ba chỉ số theo quy tắc≥10%.
* Tài khoản web không ghi kết quả nghiên cứu, không tự thêm/sửa/xoá nhật ký.
  Trigger có search_path cố định, ghi actor đúng tài khoản phiên kết nối.
* CRUD demo, rollback khi lỗi, danh mục tài sản/hash, tải TIFF, tra cứu pixel,
  ST_Covers và đầu vào sai được kiểm thử bằng PostgreSQL thật.
* Cấu hình local không được web phục vụ, APIinfo không chứa password.
* 48 kiểm thử tự động PASS trên PostgreSQL18, thời gian lần cuối16,894giây.
  Kiểm thử xác nhận dữ liệu/phần mềm; không thay kiểm chứng thực địa hoặc khoa học.
* Nhập lại cùng nguồn không tăng số dòng hoặc reset điểm demo. Tên database/schema
  không rõ nguồn gốc bị chặn; không xoá bảng hoặc tự đổi password role đã tồn tại.

## Kiểm tra giao diện

Tab Nguồn hiển thị PostgreSQL18.6/PostGIS3.6.2 và1002dòng mỗi nguồn. Bảng sàng lọc
TVDI năm2025 nguồngee_recovery, ngưỡng0,8/độ phủ50% trả13đơn vị; đổi ngưỡng0,95
trả0đơn vị. Nút Xem bản đồ chọn đúng Xã Phước Thành. Tìm25942 hiển thị43,08°C,
NDVI0,25, TVDI0,72. Nhãn PG1 không bị đoạn giao diện cũ ghi đè thànhGEE7.

Kiểm tra màn hình điện thoại: tab Nguồn không tràn ngang (clientWidth=scrollWidth=375).
Đã lưu ảnh postgres_sources.jpg, postgres_screening.jpg, postgres_mobile_sources.jpg.
Chưa thử trên điện thoại Android vật lý, không khẳng định đã kiểm thửGPS/PWA trên thiết bị.

## Gói bàn giao

MobileGIS_POSTGRESQL_PG1.zip không chứa configlocal, SQLite, cluster hoặc mật khẩu.
Đã kiểm tra CRC toàn ZIP và chạy máy chủ từ phần giải nén riêng: truy vấn đủ3006dòng,
tra cứu ô GEErecovery, tài liệu, shapefileZIP và tự chọn cổng khác khi cổng đã bị chiếm.
Kiểm tra này dùng CSDL hiện tại, không phải thử cài trên một máy Windows mới.
Người nhận vẫn cần PostgreSQL/PostGIS và INSTALL_DEPENDENCIES/CONNECT_EXISTING_POSTGRESQL.

## Môi trường và phục hồi

Cluster thử nghiệm riêng cổng55432 đã dừng, dữ liệu vẫn giữ. Chạy start không mở
lại cluster đó khi cấu hình đang dùng5432; PostgreSQL18 vẫn hoạt động và web
truy vấn đủ3006dòng. Đây là kiểm tra không phụ thuộc server thử nghiệm/SQLite.

Backup SQL Custom: database/backups/mobilegis_pg1_20261005.backup. Đã kiểm tra
pg_restore --list đọc được danh mục. Chưa thử restore toàn bộ vào máy mới; phải
sao lưu thêm TIFF/querygrid/XYZ. Backup và thông tin kết nối không nằm trongZIP.

## Giới hạn theo đề bài

Đã triển khai PostGIS + FastAPI REST/XYZ + WebGIS/PWA + storage file cục bộ.
Chưa có GeoServerWMS/WFS, cloudobjectstorage, Flutter/APK, đăng nhập đa người,
HTTPSInternet hoặc hệ thống cảnh báo hạn đã kiểm định. Sàng lọcTVDI chỉ là tính
năng khám phá với ngưỡng người dùng. Không ghi trong báo cáo rằng các phần chưa
triển khai đã hoàn thành. Không dùng dữ liệu2026 thay cho mốc2025.
