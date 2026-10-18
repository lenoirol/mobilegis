# Hồ sơ kiểm thử MobileGIS TP.HCM

Tài liệu này ứng với mục 6.7, 7.7 và 7.9 của đề cương (nhóm 6). Phần **đã đo bằng máy** ghi kết quả thật. Phần **cần thiết bị thật hoặc người dùng thật** để trống cho nhóm điền; không có số liệu nào ở đó được tạo sẵn.

Phạm vi: TP.HCM sau sáp nhập, 167 xã/phường, không gồm Côn Đảo (mã 26732). Dữ liệu: Landsat 8/9 Collection 2 Level-2, mùa khô 2020–2025.

## 1. Kiểm thử chức năng (Bảng 6.2, nhóm "Chức năng")

Cột "Tự động" là kết quả của bộ kiểm tra trình duyệt `tests/e2e_ui.py` (Chrome thật, 81 kiểm tra đạt ngày 18/10/2026). Cột "Thiết bị thật" để nhóm điền khi thử trên điện thoại.

| STT | Mức ưu tiên (Bảng 5.1) | Thao tác | Kết quả mong đợi | Tự động | Thiết bị thật (Android/iOS, ghi máy) |
|---|---|---|---|---|---|
| F1 | Bắt buộc | Mở ứng dụng | Hiện bản đồ và 167 khu vực, không lỗi console | Đạt | |
| F2 | Bắt buộc | Chuyển lớp Nhiệt độ / Độ xanh / Độ khô (chạm ô giá trị) | Đúng lớp, địa chỉ ghi `chi-so`, chú giải đổi theo | Đạt | |
| F3 | Bắt buộc | Chọn mốc thời gian 2020–2025 | Đúng năm, thang màu giữ nguyên giữa các năm | Đạt | |
| F4 | Bắt buộc | Bật/tắt lớp: lớp chỉ số đang xem, ranh giới, tên khu vực, lớp phủ đất, so sánh kéo màn hình | Lớp hiện/ẩn đúng; tắt lớp chỉ số thì chỉ còn nền và ranh giới | Đạt (lớp chỉ số: thử thủ công 18/10) | |
| F5 | Bắt buộc | Xem chú giải | Thang màu và khoảng giá trị đúng; Độ khô có 5 mức | Đạt | |
| F6 | Bắt buộc | Chạm một xã/phường | Bảng thông tin hiện tên, 3 giá trị, độ tin cậy | Đạt | |
| F7 | Dự kiến | Nút vị trí hiện tại | Chọn đúng xã/phường chứa vị trí; ngoài 167 khu vực thì báo | Đạt (vị trí giả lập) | |
| F8 | Dự kiến | Xem biểu đồ biến động của khu vực | Biểu đồ 2020–2025, không nối qua năm thiếu dữ liệu | Đạt | |
| F9 | Nếu còn thời gian | Chọn khu vực có độ khô ≥ 0,8 | Hiện cảnh báo thử nghiệm, ghi rõ không phải cảnh báo hạn chính thức | Đạt | |
| F10 | Nếu còn thời gian | Dùng khi mạng yếu | Giao diện, ranh giới, số liệu đã xem vẫn mở được (bộ nhớ đệm) | Chưa đo tự động | |
| F11 | Ngoài đề cương | Mở `#/gia-lap` khi chưa đăng nhập quản trị | Bị đưa về bản đồ | Đạt | |
| F12 | Bắt buộc | Chạm một điểm trên bản đồ (chế độ Chi tiết) để xem giá trị ô 120 m, kể cả bản tĩnh không có máy chủ | Hiện tọa độ và giá trị ô gần nhất; ô thiếu dữ liệu ghi rõ "thiếu dữ liệu" | Đạt (thử thủ công; 60/60 điểm khớp cách tính của máy chủ) | |
| F13 | Bắt buộc | Bản đồ nền toàn cầu: thu nhỏ ra thế giới, đổi nền Bản đồ (OpenStreetMap) / Vệ tinh (Esri) / Nhẹ (Natural Earth, không cần mạng); ô bản đồ định vị Thế giới – Việt Nam – TP.HCM | Nền hiện đúng; nhãn QĐ. Hoàng Sa, QĐ. Trường Sa, Biển Đông; mất mạng thì tự về nền Nhẹ | Đạt với nền Nhẹ và ô định vị (thủ công). Nền trực tuyến cần nhóm kiểm tra bằng mắt | |

Ghi chú: F12, F13 và phần tắt lớp chỉ số ở F4 được thêm sau lần chạy 81 kiểm tra tự động; cần chạy lại `tests/e2e_ui.py` để cập nhật cột "Tự động".

Ghi chú: F10 là mức "chỉ mô phỏng, không cam kết" trong đề cương; nhóm cần tự thử bằng chế độ máy bay trên điện thoại.

## 2. Kiểm thử hiệu năng

Đo bằng `scripts/make_test_report.py perf`, trình duyệt Chrome giả lập hai cỡ điện thoại, **chạy trên máy phát triển (localhost), không giới hạn mạng**, mỗi cỡ 5 lần (kết quả thô ở `DO_HIEU_NANG_LOCALHOST.csv`).

| Cỡ màn hình | Bản đồ đầu tiên (trung vị) | Đổi lớp (trung vị) |
|---|---|---|
| 360×740 | 2,38 s | 0,47 s |
| 412×915 | 2,38 s | 0,48 s |

Lưu ý khi đọc: thời gian "bản đồ đầu tiên" **đã gồm màn hình khởi động cố ý giữ tối thiểu khoảng 1,1 giây** ở lần mở đầu. Đây là kết quả trên localhost nên **không thay cho đo qua Wi-Fi và mạng di động** mà đề cương yêu cầu.

Bảng để nhóm điền khi đo trên máy thật:

| Thiết bị (hãng, Android, cỡ màn hình) | Mạng | Bản đồ xuất hiện (s) | Đổi lớp (s) | Giật, lỗi tile, tràn nút, chữ khó đọc |
|---|---|---|---|---|
| | Wi-Fi | | | |
| | Mạng di động | | | |
| | Wi-Fi | | | |
| | Mạng di động | | | |

Đề cương yêu cầu thử trên **ít nhất hai kích thước màn hình Android**. Kiểm tra tự động đã xác nhận ở 390 px không tràn ngang, nhưng chưa thay cho máy thật.

## 3. Đối chiếu tính nhất quán dữ liệu (≥ 10 đơn vị)

Cách làm: với 10 xã/phường thuộc nhiều dạng không gian, tính lại giá trị trung bình từng chỉ số **trực tiếp từ các GeoTIFF GEE và shapefile ranh giới đã nạp**, rồi so với giá trị ứng dụng đang phục vụ (đọc từ PostgreSQL). Quy tắc: lấy các ô có tâm nằm trong ranh giới, bỏ ô NoData, trung bình không trọng số; chỉ lấy khi có từ 5 ô hợp lệ. Mã: `scripts/make_test_report.py cross-check`; chi tiết 180 dòng ở `DOI_CHIEU_10_DON_VI.csv`.

| Mã | Khu vực | Dạng không gian |
|---|---|---|
| 26743 | Phường Bến Thành | đô thị trung tâm |
| 27265 | Phường Khánh Hội | đô thị, ven sông |
| 27442 | Phường Bình Tân | đô thị, công nghiệp |
| 25747 | Phường Thủ Dầu Một | đô thị Bình Dương |
| 25888 | Phường Tân Uyên | công nghiệp, Bình Dương |
| 26983 | Phường Bảy Hiền | nội đô |
| 27511 | Xã Nhuận Đức | nông nghiệp, Củ Chi |
| 26575 | Xã Ngãi Giao | nông nghiệp, Bà Rịa |
| 27664 | Xã Cần Giờ | rừng ngập mặn, ven biển |
| 27673 | Xã An Thới Đông | rừng ngập mặn, Cần Giờ |

**Kết quả (18/10/2026):** 10 đơn vị × 6 năm × 3 chỉ số = **180 phép so sánh, 180 khớp** về giá trị ở độ chính xác hiển thị (nhiệt độ 0,1 °C; độ xanh và độ khô 0,01) và khớp số ô hợp lệ. Sai khác tuyệt đối lớn nhất là 0.

Giới hạn cần nêu trong báo cáo: phép tính lại dùng **cùng quy tắc tâm ô** với bước nhập dữ liệu, nên khớp tuyệt đối là điều được kỳ vọng. Phép đối chiếu này chứng minh ứng dụng hiển thị đúng dữ liệu nguồn; **không** chứng minh độ chính xác khoa học so với số đo thực địa (nhóm không có số đo thực địa). Nhóm cũng nên đối chiếu thêm bằng QGIS (Zonal Statistics) trên một vài đơn vị để có bằng chứng bằng công cụ thứ hai.

Các kiểm tra khác đã có sẵn trong `tests/` (92 test Python và 6 test Node, đạt): 167 hình học hợp lệ, loại Côn Đảo, khóa đơn vị/năm không trùng, miền giá trị (NDVI −1…1, TVDI 0…1), tỷ lệ độ phủ, giữ nguyên giá trị trống, CSV và JSON cùng số liệu.

## 4. Nhật ký lỗi (đã phát hiện và sửa trong quá trình làm)

| STT | Lỗi | Nguyên nhân | Cách sửa | Trạng thái |
|---|---|---|---|---|
| 1 | Trang điện thoại bị phóng to, tràn ngang | Phần tử lưới thiếu `min-width:0` | Thêm `min-width:0`, thanh chọn cuộn ngang được | Đã sửa |
| 2 | Màn hình khởi động bị thanh đầu trang che | Chuyển cảnh chạy ngay lần hiện đầu tiên | Không chuyển cảnh ở lần đầu; chuyển cảnh chịu được việc bị hủy | Đã sửa |
| 3 | Chạm vùng khu vực không tra được giá trị ô | `stopPropagation` chặn sự kiện bản đồ | Bỏ `stopPropagation` | Đã sửa |
| 4 | Dữ liệu float bị làm tròn 15 chữ số trên Supabase, 3 test lệch | Supabase mặc định `extra_float_digits=0` | Đặt 3 cho mọi kết nối | Đã sửa |
| 5 | Lỗi luồng khi thoát (Python 3.14) | Pool kết nối đóng muộn | Đóng pool bằng `atexit` | Đã sửa |
| 6 | Cấp quyền sai trên Supabase khi tên role khác | Quyền gắn cứng theo tên role | Cấp quyền tường minh cho role cấu hình | Đã sửa |
| 7 | Bản đồ 2025 thiếu vùng ở một số phường | Mây và cảnh ảnh không phủ | Bổ sung 6.325 ô thật từ cảnh LC09 (đợt 1); đợt 2 chuẩn bị sẵn | Một phần: còn 9 khu vực dưới 50% độ phủ năm 2025 |
| 8 | Bảng thông tin điện thoại chia hai tab gây rối | Thiết kế ban đầu | Gộp thành một bảng, ô giá trị chạm để đổi lớp | Đã sửa |
| 9 | Vuốt kéo bảng dễ trượt vào bản đồ; thanh tab sát thanh cử chỉ | Thao tác kéo, thiếu khoảng an toàn | Nút mũi tên mở/đóng; nâng thanh tab | Đã sửa, cần xác nhận trên máy thật |
| 10 | Chọn khu vực nhưng sai chữ "đủ mẫu" gây khó hiểu | Thuật ngữ kỹ thuật | Đổi thành độ tin cậy Cao/Vừa/Thấp | Đã sửa |

Lỗi đang mở: **khu vực dưới 50% độ phủ năm 2025** (xem lỗi 7), cần chạy tiếp đợt GEE 2 hoặc ghi rõ hạn chế trong báo cáo.

## 5. Đánh giá mức dễ sử dụng (nhóm thực hiện)

Phần này phải do người dùng thật làm; chưa có kết quả nào. Gợi ý nhiệm vụ mẫu (mỗi người làm không có hướng dẫn):

| Nhiệm vụ | Người 1 | Người 2 | Người 3 | Ghi lỗi thao tác và góp ý |
|---|---|---|---|---|
| T1. Tìm xã/phường của bạn và cho biết nhiệt độ bề mặt năm 2025 | | | | |
| T2. Xem độ xanh của cùng khu vực năm 2020 so với 2025 | | | | |
| T3. Bật lớp độ khô và cho biết khu vực đang ở mức nào | | | | |
| T4. Dùng vị trí hiện tại để xem nơi bạn đang đứng | | | | |
| T5. Tìm một khu vực có cảnh báo độ khô | | | | |

Ghi: hoàn thành (Có/Không), số lần chạm sai, thời gian, câu nói đáng chú ý. Mẫu nhỏ chỉ dùng để rút kinh nghiệm, không khẳng định cho mọi người dùng (đúng như đề cương).

Câu hỏi khảo sát ngắn (thang 1–5): (1) Giao diện dễ dùng; (2) Chú giải dễ hiểu; (3) Biết khu vực nào "tin cậy thấp" và vì sao; (4) Hữu ích khi xem nhanh trên điện thoại; (5) Góp ý tự do.

## 6. Checklist nghiệm thu (mục 7.9)

| STT | Hạng mục | Minh chứng hiện có | Còn thiếu |
|---|---|---|---|
| 1 | Phạm vi và yêu cầu | Đề cương | Phiếu thống nhất chức năng ưu tiên (nhóm) |
| 2 | Dữ liệu đầu vào | Danh mục cảnh (`public/data/landsat_manifest.json`, `products.json`), ranh giới 167 đơn vị | Nhóm xác nhận nguồn tải (đề cương ghi USGS EarthExplorer, thực tế xử lý qua Google Earth Engine, cùng sản phẩm Collection 2 Level-2) |
| 3 | Xử lý LST, NDVI, TVDI | GeoTIFF theo năm, bảng thống kê 167 đơn vị, kiểm tra miền giá trị | Đối chiếu bằng QGIS |
| 4 | Đóng gói dữ liệu | Tile XYZ (mức 7–12), GeoJSON ranh giới (~1,1 MB), bảng JSON/CSV, khối tra cứu điểm `data/query/` (~15 MB, 399 khối), lớp nền thế giới Natural Earth (~85 KB) | Tổng kích thước tile theo nguồn dữ liệu |
| 5 | Thiết kế giao diện | Bản đồ toàn màn hình, bảng trượt dưới, nút cảm ứng | Wireframe và ghi nhận góp ý người dùng |
| 6 | Bản mẫu | Chạy đủ chức năng bắt buộc và dự kiến | Chạy trên thiết bị Android thật |
| 7 | Kiểm thử | Tài liệu này, 92 + 6 + 81 kiểm tra tự động, 180 phép đối chiếu | Bảng đo trên máy thật, khảo sát |
| 8 | Hồ sơ | Mã nguồn, README | Ảnh chụp màn hình và báo cáo chung |

## 7. Hạn chế cần nêu trung thực trong báo cáo

- Độ khô (TVDI) là chỉ số thử nghiệm; 5 mức chia đều chỉ là quy ước hiển thị, chưa được kiểm định với số đo độ ẩm đất.
- Ngày chụp ảnh khác nhau giữa các khu vực và năm; số liệu là ảnh chụp nhanh mùa khô, không phải trung bình năm hay xu hướng khí hậu.
- Năm 2025 còn 9 khu vực dưới 50% độ phủ, được đánh dấu "tin cậy thấp" và không dùng để xếp hạng.
- Ứng dụng hiện là web/PWA; đề cương dự kiến Flutter hoặc React Native. Việc đổi công cụ cần được nhóm thống nhất và ghi trong báo cáo.
