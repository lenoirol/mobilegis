# Kết quả kiểm tra bản MobileGIS tích hợp Landsat

Ngày kiểm tra: 28/09/2026. Kiểm tra trong môi trường Windows, Python 3.12 và trình duyệt Chromium tích hợp. Mục tiêu là xác nhận dữ liệu được tải và hiển thị nhất quán, không phải xác nhận độ chính xác khoa học bằng số liệu thực địa.

## Kiểm tra tự động

Lệnh: `python -m unittest discover -s tests -v`

Kết quả sau khi tích hợp CSV nhóm: **9/9 ca kiểm tra đạt**, khoảng 2,32 giây. Ca thứ 9 đối chiếu toàn bộ giá trị với file CSV nguyên gốc.

| Hạng mục | Kết quả |
|---|---|
| 167 hình học hợp lệ, mã không trùng | Đạt |
| Côn Đảo 26732 bị loại, Thạnh An 27676 được giữ | Đạt |
| Danh mục mã nguồn khớp bản phát hành 2025 | Đạt, đủ 168 mã trước khi loại Côn Đảo |
| Sáu năm 2020–2025, cảnh Landsat 8/9 Level-2 và tháng 1–4 | Đạt, 24 cảnh |
| 1.002 khóa đơn vị/năm duy nhất | Đạt |
| Miền giá trị, tỷ lệ độ phủ, điều kiện giữ giá trị trống | Đạt |
| CSV và JSON có cùng số liệu | Đạt |
| Đối chiếu 10 đơn vị × 6 năm × 3 chỉ số từ GeoTIFF | Đạt, 180 phép so sánh |
| Hệ số DN và các bit QA với đầu vào kiểm soát | Đạt |
| API tải GeoTIFF giới hạn danh sách tên tệp | Đạt |
| Bộ nghiên cứu và 36 dòng demo được tách biệt | Đạt |

Danh sách 180 phép đối chiếu nằm trong `zonal_crosscheck.csv`. Test mở lại GeoTIFF, biến đổi polygon nguồn và tính trung bình pixel để so với bảng tra cứu. Đây là đối chiếu độc lập ở bước đọc/tổng hợp đầu ra; không phải so sánh với một bộ dữ liệu thực địa độc lập.

`node --check public/app.js` và `node --check public/sw.js`: đạt.

## Kiểm tra giao diện thực tế trong trình duyệt

| Thao tác | Kết quả quan sát |
|---|---|
| Tìm `ben thanh` không dấu | Trả Phường Bến Thành, mã 26743 |
| Chọn Thủ Dầu Một 2025 | LST 32,99°C; NDVI 0,43; TVDI thử nghiệm 0,29; độ phủ LST 78,6% |
| Bến Thành 2025 | LST 40,17°C; NDVI 0,26; TVDI thử nghiệm 0,60; 128/128 pixel LST hợp lệ |
| Chạm polygon trên bản đồ | Đổi thông tin sang Phường Cầu Kiệu, mã 27058 |
| Đổi LST sang NDVI/TVDI | Chú giải, số liệu, biểu đồ và liên kết GeoTIFF thay đổi đúng lớp |
| Đổi năm về 2020 | Hiển thị ngày ảnh 2020 và dữ liệu tương ứng |
| Chọn trung bình xã/phường | Các polygon được tô màu theo giá trị |
| Bỏ chọn hiển thị lớp | Lớp ảnh được gỡ khỏi bản đồ |
| Bộ nghiên cứu ở tab Dữ liệu | 1.002 dòng, không có nút sửa kết quả nghiên cứu |
| Bộ demo ở tab Dữ liệu | 36 dòng, giữ công cụ quản lý demo |
| Tab Nguồn | 24 dòng cảnh và xác nhận danh mục 167 đơn vị |
| Màn hình 390 × 844 | Không tràn ngang, body rộng 390 px, nút thu gọn hoạt động |
| Màn hình 360 × 800 | Bản đồ và bảng thông tin hiển thị, bảng thông tin cuộn được |
| Dừng máy chủ rồi tải lại trang đã mở | Giao diện, ranh giới, bảng số liệu, ảnh đã xem và tra cứu Bến Thành vẫn hoạt động từ cache |

Hai kích thước trên là viewport giả lập trong trình duyệt, **chưa phải hai điện thoại Android vật lý**. GPS không được cấp quyền/chạy thử trong phiên kiểm tra này. Chưa khảo sát người dùng và chưa đo hiệu năng trên Wi-Fi/mạng di động thực tế.

## Độ phủ của bộ dữ liệu thử nghiệm

Tỷ lệ dựa trên pixel lưới 120 m có tâm nằm trong ranh giới nghiên cứu, không phải tỷ lệ diện tích đất được kiểm chứng.

| Năm | LST/NDVI có giá trị | TVDI có giá trị |
|---|---:|---:|
| 2020 | 97,02% | 76,55% |
| 2021 | 99,30% | 86,52% |
| 2022 | 88,11% | 79,48% |
| 2023 | 92,87% | 80,87% |
| 2024 | 99,29% | 79,33% |
| 2025 | 91,38% | 79,04% |

Có 5 dòng đơn vị/năm thiếu giá trị; giữ `null` và trình bày dấu “—”. Ngưỡng giữ trung bình là ít nhất 5 pixel và ít nhất 10% độ phủ. Khi diễn giải cần xem tỷ lệ độ phủ của từng khu vực, nhất là những vùng nước/ven biển.

## CSV nhóm bổ sung

File `MobileGIS_LST_NDVI_TVDI_2020_2025.csv`: 24 dòng, 4 điểm, sáu năm 2020–2025. Không có khóa điểm/năm trùng; tất cả số hữu hạn và trong miền giá trị. Năm dạng `2020.0` được chuyển thành số nguyên; tên hiển thị có dấu được bổ sung, còn `original_name`, nguồn và toàn bộ giá trị số được giữ. File gốc được lưu nguyên byte tại `public/data/user_supplied_original.csv`.

LST từ 31,5569 đến 44,1841°C; NDVI từ 0,1922 đến 0,6449; TVDI từ 0,3531 đến 1, có ba giá trị đúng bằng 1. Chưa có mã cảnh/ngày, script GEE, cửa sổ mùa hoặc vùng đệm/cách tổng hợp. Không dùng bộ này để khẳng định độ chính xác của dữ liệu tự xử lý, và không gán giá trị điểm làm trung bình hành chính.

Đối chiếu không gian trên polygon gốc: Trung tâm TP.HCM → Phường Sài Gòn (26740), Thủ Đức → Phường Thủ Đức (26824), Cần Giờ → Xã Cần Giờ (27664), Củ Chi → Xã Nhuận Đức (27511).

Kiểm tra trình duyệt sau tích hợp: chọn bộ CSV trả 24 dòng, nút thêm/sửa bị ẩn, nút xuất trỏ file nguyên gốc. Chọn Thủ Đức năm 2020 hiển thị LST 41,23°C, NDVI 0,21, TVDI 0,83 và đủ sáu điểm năm trên biểu đồ. Chọn Củ Chi năm 2025 hiển thị LST 33,81°C, NDVI 0,56, TVDI 0,57 cùng đơn vị chứa tọa độ là xã Nhuận Đức. SHA-256 của bản CSV lưu trong project khớp file người dùng gửi.

## Vấn đề môi trường và phần còn lại so với đề cương

Trong lúc kiểm tra, tên miền `tile.openstreetmap.org` và `a.tile.openstreetmap.org` không phân giải được trên máy này. Ứng dụng báo lỗi nền; lớp ranh giới và raster cục bộ vẫn hoạt động. Không thay đổi DNS hay cấu hình mạng của người dùng.

Đã có dữ liệu thực, nguồn, cảnh ảnh, GeoTIFF, thống kê vùng và bản đồ tra cứu. Các việc vẫn cần để hoàn thành toàn bộ đề cương:

- Xử lý và đánh giá chất lượng ở độ phân giải gốc 30 m; rà soát lựa chọn thời điểm, mây nhỏ và phương pháp TVDI với giảng viên.
- Kiểm chứng hình học ranh giới theo nguồn hành chính được nhóm chấp nhận; kiểm tra danh mục mã không thay thế kiểm chứng hình học.
- Chốt kiến trúc với giảng viên: bản hiện tại là web/PWA thích ứng điện thoại, chưa có Flutter/React Native hay APK.
- Cập nhật 04/10/2026: đã bổ sung 24 lớp XYZ (4.176 tile, zoom gốc 7–12); không còn thiếu XYZ. Chưa có MBTiles/native APK. Xem `UPDATE_2026_10.md` cho lớp phủ đất, ảnh nền và kiểm thử mới.
- Thử trên thiết bị Android thật, kiểm tra GPS, đo tốc độ mạng thực tế và thực hiện khảo sát người dùng theo đề cương.
- Cập nhật báo cáo với phương pháp đã thực hiện, kết quả kiểm thử, giới hạn và minh chứng; không mô tả dữ liệu thử nghiệm này là kết quả đã kiểm chứng thực địa.
