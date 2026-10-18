# Dọn project ngày 11/10/2026

Đưa cache `data/sampled_inputs` (136 file NPY, 320,32 MiB) ra thư mục lưu trữ
`C:\Users\phuhuy\Documents\ChatGPT\gis\mobilegis_luu_tru_20261011`.
Đã xác minh toàn bộ dung lượng và SHA256 sau chuyển, không xóa vĩnh viễn.
Cache không được web hiện tại sử dụng, nhưng cần khi kiểm tra/tái xử lý nguồn cũ.
Để dùng lại, khôi phục về `data/sampled_inputs` theo README của thư mục lưu trữ.

Giữ nguyên TIFF gốc/xử lý, tile XYZ, query_grid, dữ liệu bổ sung 2025, ranh giới,
metadata, snapshot nhập PostgreSQL, cấu hình kết nối và backup database.
Giữ cả `data/processed` vì công cụ dựng lại ảnh nền còn đọc thư mục này.
Không xóa `data/sources` vì chứa nguồn ranh giới và dữ liệu để kiểm chứng.
SQLite cũ, mã legacy và tài liệu cũ rất nhỏ, được giữ để phục hồi/đối chiếu.

Việc chuyển cache chỉ giảm dung lượng thư mục mobilegis; không giảm dung lượng
đã dùng trên ổ đĩa. Gói bàn giao không cần kèm thư mục lưu trữ ngoài project.

Sau dọn, project khoảng 584,40 MiB (trước khoảng 904,72 MiB).
51 kiểm thử đạt sau dọn (18,669 giây), gồm số liệu TIFF, nguồn gốc/phục hồi,
SQL, API, tải file, tra cứu pixel và phân quyền.
Lần kiểm thử đầu gặp xung đột PROJ do môi trường trỏ vào thư viện PostGIS.
Lần xác minh cuối dùng PROJ_DATA/PROJ_LIB của Rasterio chỉ trong tiến trình
kiểm thử, sau đó trả lại giá trị môi trường cũ; không sửa hệ thống hay TIFF.
