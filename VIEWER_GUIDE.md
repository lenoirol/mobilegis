# Giao diện người xem · PG3 Viewer1

Mở http://127.0.0.1:5379/?v=viewer1 khi máy chủ đang chạy.

## Luồng sử dụng

1. **Bản đồ**: tìm xã/phường, chọn LST/NDVI/TVDI và mốc ảnh 2020–2025.
2. Đọc số liệu cùng **độ phủ**. Vùng không màu là thiếu mẫu hợp lệ, không phải 0.
3. Mở **Hiển thị và lớp phủ** nếu cần đổi nền, xem độ phủ, so sánh hai năm,
   điều chỉnh độ đậm hoặc xem lớp phủ đất 2021.
4. **Bảng số liệu**: mặc định năm hiện tại khi tải nguồn, tìm khu vực hoặc đổi năm.
   Các ô “Ít mẫu” giữ nguyên giá trị gốc nhưng có độ phủ dưới 50%.
   Xuất CSV giữ cả số liệu ít mẫu và các cột độ phủ; không tự loại hay điền số.
5. **Thống kê**: chọn năm, chỉ số và ngưỡng độ phủ. Biểu đồ so sánh chuỗi cũng
   dùng ngưỡng này, không nối qua năm thiếu mẫu. 50% là ngưỡng xem mặc định,
   không phải chứng nhận độ chính xác hay ngưỡng khoa học đã kiểm định.
6. **Giả lập**: kết quả kịch bản độc lập với hiện trạng. Không phải dự báo đã
   huấn luyện/kiểm định; không diễn giải như quan sát thực tế.
7. **Dữ liệu & phương pháp**: xem nguồn, giới hạn và số vùng phủ ≥50% theo từng
   năm/chỉ số. Mở công cụ nâng cao để đối chiếu bản GEE gốc, nguồn cũ, CSV điểm,
   dữ liệu thực hành hoặc xem PostgreSQL/PostGIS.

## Nguồn và chất lượng

- Người xem dùng `gee_recovery`: chuỗi GEE 2020–2025 với phần bổ sung thực 2025.
  Không trộn số liệu nguồn cũ vào vùng trống. Nếu bộ này không tải được,
  giao diện báo chưa sẵn sàng, không âm thầm dùng nguồn khác.
- Có trung bình ở 167/167 khu vực không đồng nghĩa có ảnh phủ kín các khu vực.
  Thống kê gốc giữ giá trị từ ≥5 ô và ≥10% độ phủ; giao diện so sánh mặc định
  thận trọng hơn với ngưỡng 50%. Giá trị ít mẫu vẫn có thể đọc kèm cảnh báo.
- Bản đồ trung bình vùng tô xám/nét đứt khi thiếu giá trị hoặc độ phủ <50%.
  Bản đồ raster giữ từng ô hợp lệ và khoảng NoData gốc, không tô bù.
- Biểu đồ nhỏ của khu vực chỉ vẽ mốc phủ ≥50%, không nối qua khoảng thiếu.
  Nâng cao cho phép đọc chuỗi gốc; biểu đồ so sánh ở Thống kê luôn theo bộ lọc.
- LST là nhiệt độ bề mặt, không phải nhiệt độ không khí. NDVI không phải số cây.
  TVDI thử nghiệm, chưa là kết luận hạn. Lớp phủ đất chỉ mô tả năm 2021.
- Ranh giới 2025 áp dụng cho tất cả mốc; ngày ảnh khác nhau, không phải trung
  bình năm hay xu thế khí hậu được kiểm định.

## Phạm vi thay đổi

Chỉ thay đổi trình bày và quy tắc so sánh trên giao diện. Không sửa bảng SQL,
GeoTIFF, CSV, giá trị hiện trạng hoặc kết quả lưu. Không xóa nguồn cũ.
Nâng cao là một tùy chọn hiển thị, **không phải phân quyền bảo mật**. Ứng dụng
hiện phù hợp demo cục bộ; trước khi công khai cần bảo vệ API ghi bằng cơ chế
đăng nhập/phân quyền ở máy chủ, không chỉ ẩn nút trên giao diện.

Mã giao diện mới: `public/viewer-policy.js`, `public/viewer-ui.js`,
`public/viewer.css`. Backend/database vẫn là PG3. Bộ nhớ đệm giao diện mang
phiên bản `mobilegis-research-pg3-viewer1`.
