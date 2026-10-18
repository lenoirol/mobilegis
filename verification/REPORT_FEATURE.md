# Kiểm tra tính năng Phân tích và minh chứng

Ngày thực hiện: 2026-09-28. Kiểm tra qua trình duyệt tại localhost:5380.

- Tab Phân tích mở độc lập với tab Bản đồ/Dữ liệu/Nguồn.
- LST hiển thị bốn chuỗi, 24 nút điểm, bảng đầu/cuối kỳ và bảng từng năm.
- Đổi NDVI, TVDI cập nhật bảng và biểu đồ; bỏ chọn Cần Giờ còn ba chuỗi.
- Bỏ toàn bộ điểm: hiện thông báo chọn điểm và vô hiệu hóa xuất SVG. Chọn lại Thủ Đức phục hồi bảng.
- Thực hiện thao tác tải SVG; chưa kiểm tra trực quan tệp SVG tải về trong Word.
- Mở ảnh TVDI bằng hộp thoại, thấy đúng ảnh và chú thích; đóng được bằng nút Đóng ảnh.
- Kiểm tra giao diện chiều rộng 390 pixel, thanh điều hướng bốn mục và thẻ ảnh không tràn trang. Biểu đồ rộng tối thiểu 600 pixel có vùng cuộn ngang; bảng số là phương án đọc thay thế.
- SHA256 của cả năm ảnh khớp bản người dùng cung cấp; không cắt ảnh hay sửa nội dung ảnh.
- `node --check public/report.js`: đạt.
- `python -m unittest discover -s tests -v`: 9/9 đạt. Đây là bộ kiểm thử dữ liệu/API hiện có, không phải kiểm định khoa học hoặc khảo sát người dùng.

Giới hạn: OSM vẫn không tải được từ kết nối hiện tại; các lớp cục bộ hoạt động. Chưa thử trên điện thoại vật lý. Chưa đối chiếu được ảnh GEE với CSV vì thiếu script và metadata. Ảnh pilot TP.HCM cũ không thay thế bộ Landsat nghiên cứu 167 đơn vị. Chưa thử lại cache ngoại tuyến cho tính năng mới.
