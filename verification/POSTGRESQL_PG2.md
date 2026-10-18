# Kiểm tra PostgreSQL/PostGIS — 2026.10.PG2

Ngày kiểm tra: 05/10/2026, trên máy của người dùng.

## Kết quả đã xác minh

- PostgreSQL 18.6, PostGIS 3.6.2, database `mobilegis`, schema `mobilegis`, version 2.
- 16 bảng vật lý và 1 view `observations_combined`.
- Ba bảng độc lập `lst_observations`, `ndvi_observations`, `tvdi_observations`:
  mỗi bảng 3.006 dòng = ba nguồn × 167 đơn vị × sáu năm 2020–2025.
  Dòng thiếu được giữ NULL, không đồng nghĩa 3.006 giá trị hợp lệ.
- Đối chiếu chính xác 9.018 bản ghi chỉ số: giá trị, số pixel hợp lệ, số mẫu
  và độ phủ không đổi so với từng nguồn đã công bố. Các cột chỉ số cũ trong
  bảng thông tin chung được bỏ sau khi đối chiếu trong cùng transaction.
- 167 hình học gốc hợp lệ, SRID 4326, ST_Equals với seed nguồn bảo toàn.
  Truy vấn vị trí dùng hình học gốc, giao diện dùng bản nhẹ.
- 24 dòng CSV bốn điểm và 36 dòng thực hành được giữ riêng, bảo toàn.
- Tài khoản web chỉ đọc dữ liệu nghiên cứu, chỉ thêm/sửa/xóa dữ liệu thực hành;
  nhật ký do trigger ghi, không cho web trực tiếp sửa nhật ký.
- API từng chỉ số đọc từ bảng riêng; API so sánh đọc view kết hợp.
- 51 kiểm thử tự động đạt (lần cuối: 22,004 giây). Gồm số liệu TIFF, dữ liệu
  gốc/phục hồi, NULL, độ phủ, truy vấn không gian, tải file, phân quyền và CRUD.
- Chạy lại nhập dữ liệu PG2 thành công, số dòng không tăng hoặc bị ghi đè.
- Cài schema và nhập dữ liệu từ đầu trong database thử nghiệm mới thành công;
  database thử nghiệm do kiểm tra tạo ra đã được dọn, database chính giữ nguyên.
- Kiểm tra giao diện tab Nguồn thấy đúng ba bảng, số dòng và nhãn PG2.
  Đã sửa nhãn phiên bản GEE7 ghi đè nhãn ứng dụng sau khi tải số liệu.

Ảnh giao diện: `postgres_pg2_sources.jpg`.

## Sao lưu và đóng gói

Backup cấu trúc/dữ liệu PG2: `database/backups/mobilegis_pg2_20261005.backup`
(5.644.754 byte, pg_dump custom format). Đã đọc danh mục bằng pg_restore;
chưa thực hiện thử khôi phục toàn bộ backup này. Backup PG1 được giữ lại.
TIFF/XYZ nằm ngoài database, phải sao lưu các thư mục dữ liệu cùng project.

ZIP `MobileGIS_POSTGRESQL_PG2.zip` chỉ gồm mã, dữ liệu và tài liệu; không gồm
mật khẩu, cấu hình kết nối riêng, cluster PostgreSQL hoặc SQLite. Máy khác cần
Python, PostgreSQL/PostGIS và chạy hướng dẫn kết nối/nhập dữ liệu. Có công cụ
`scripts/check_distribution.py` để kiểm tra CRC và chạy bản giải nén chỉ đọc
trên PostgreSQL đã cấu hình; kiểm tra này không thay thế cài đặt trên máy mới.

## Giới hạn so với đề bài

Đây là FastAPI REST/XYZ + PostgreSQL/PostGIS + Leaflet Web/PWA. Chưa có
GeoServer/WMS/WFS, object storage đám mây, Flutter/APK hay đăng nhập nhiều
người dùng. TVDI và sàng lọc theo ngưỡng vẫn thử nghiệm, không phải cảnh báo
hạn chính thức. WorldCover chỉ có năm 2021, chuỗi chỉ số là các cảnh mùa khô
khác ngày, không phải trung bình năm hoặc dữ liệu quan trắc khí tượng.
