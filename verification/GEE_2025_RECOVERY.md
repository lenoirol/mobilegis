# Kiểm tra dữ liệu phục hồi năm 2025 — GEE7

Nguồn: ba file `MobileGIS_recovery_2025_batch1_*` do người dùng xuất GEE và gửi ngày 04/10/2026. Kiểm tra metadata, ngày ảnh, grid EPSG:32648 120 m, năm/mùa, miền giá trị, mặt nạ chung 5 band và mã cảnh/day-of-year theo từng ô. Bảo toàn nguyên bản và SHA256 trong thư mục recovery riêng. Không ghi đè raster hay JSON nguồn GEE gốc.

## Kết quả thực đo

| Phường | Độ phủ LST trước | LST sau | NDVI sau | TVDI sau | LST trung bình °C |
| --- | ---: | ---: | ---: | ---: | ---: |
| Dĩ An | 4,71% | 99,19% | 99,19% | 99,19% | 43,08 |
| Tân Đông Hiệp | 7,48% | 97,44% | 97,44% | 97,37% | 39,64 |
| Đông Hoà | 7,07% | 96,98% | 96,98% | 96,70% | 40,10 |
| Thuận Giao | 0,76% | 99,92% | 99,92% | 99,92% | 42,69 |
| An Phú | 3,97% | 99,57% | 99,57% | 99,57% | 43,67 |

Tổng 6.325 bộ ba ô mới. Loại 351 ô ứng viên ngoài mặt nạ tâm pixel của 5 phường, không bổ sung sang hàng xóm. Năm 2025 có 167/167 đơn vị đạt ngưỡng ≥5 ô và ≥10% độ phủ cho cả ba chỉ số. Đây không phải khẳng định 100% diện tích có dữ liệu. Còn các ô thiếu được giữ NoData.

Chỉ bổ sung ô mà cả ba chỉ số gốc cùng thiếu, bằng ba chỉ số cùng cảnh/ngày của ứng viên. Giữ nguyên mọi giá trị hữu hạn kể cả ô chỉ có một phần chỉ số. Tính lại trung bình float64 không trọng số với tâm pixel nằm trong polygon gốc. Ngoài 5 phường, toàn bộ dữ liệu giữ nguyên; 2020–2024 giữ nguyên. Bản đồ chênh lệch chỉ trừ cặp ô có số ở cả hai năm.

Các cảnh mới thuộc tháng 1–4/2025; provenance lưu mã cảnh và ngày theo từng ô. Metadata cảnh có bốn ứng viên nhưng số ô thực dùng mỗi cảnh được ghi ở `GEE_2025_recovery_published.json`, không coi mọi ứng viên đều được dùng. Ngày của mosaic không đồng nghĩa mọi cảnh phủ mọi phường.

## Sử dụng

Mặc định chọn **GEE · đã bổ sung 2025**. Có thể chọn **GEE · bản gốc** để đối chiếu 162/167 trước bổ sung, hoặc nguồn cũ độc lập. Bảng CSV, tải TIFF, tra cứu ô mẫu, biểu đồ, kéo so sánh và chênh lệch đồng bộ nguồn. Tab Nguồn có bảng trước/sau và metadata tải về.

Không cần batch 2. Không cần dữ liệu 2026 vì báo cáo đặt phạm vi 2020–2025. Không dùng ảnh 2026 để bù 2025. LST là nhiệt độ bề mặt, không phải nhiệt độ không khí. TVDI tiếp tục thử nghiệm, không kết luận hạn hán hay quan hệ nhân quả từ màu hoặc chênh lệch.

## Xác minh

38 bài kiểm tra tự động đã qua: bảo toàn gốc, thống kê từ TIFF, dữ liệu nguyên trạng ngoài mục tiêu, nguồn từng ô, độ phủ và cặp ô chênh lệch. Tên/hash đầy đủ ở JSON kiểm tra kèm theo.

Kiểm tra giao diện máy tính: Dĩ An có LST 43,08°C, độ phủ 99,2% và biểu đồ sáu năm; đổi sang bản gốc trả về ô trống và 4,7% độ phủ. Bản đồ chênh lệch tải đúng raster phục hồi. Bảng năm 2025 và liên kết CSV đúng nguồn. Kiểm tra điện thoại 390×844: không tràn ngang, tile thực đã tải và thẻ ba chỉ số đọc được. Không ghi nhận lỗi JavaScript trong phiên kiểm tra. Ảnh kiểm tra ở `screenshots/gee_recovery_desktop.png` và `screenshots/gee_recovery_mobile.png`.

ZIP mới `MobileGIS_GEE_2020_2025_RECOVERY.zip` được kiểm tra CRC toàn bộ; khởi động bản trích ra thư mục tạm bằng Python chuẩn, kiểm tra thống kê 167 đơn vị và tra cứu ô nguồn phục hồi. Kiểm tra cổng bận tự chọn cổng mới đã qua. Kết quả ở `package_recovery_smoke.json`. Không kiểm tra APK/native vì sản phẩm hiện là web/PWA.
