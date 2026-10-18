# Bổ sung dữ liệu thiếu năm 2025

## Kết luận hiện tại

**Đã nhận, kiểm tra và tích hợp batch 1 ngày 04/10/2026.** Bổ sung 6.325 ô thực trong 5 phường, nâng năm 2025 từ 162 lên 167/167 đơn vị có cả ba chỉ số. Độ phủ thấp nhất trong 5 phường đạt 96,7%. Bản GEE gốc, 19 file gốc và mọi giá trị đã có giữ nguyên. Trong demo GEE7, chọn **GEE · đã bổ sung 2025** (mặc định) hoặc **GEE · bản gốc** để đối chiếu. Không cần chạy batch 2 hoặc xuất lại WorldCover. Chi tiết ở `verification/GEE_2025_RECOVERY.md`.

Các bước GEE bên dưới được giữ để tái lập, **bạn đã hoàn thành chúng**, không cần chạy lại.

## Vì sao thiếu

Độ phủ LST/NDVI theo TIFF GEE hiện tại:

| Phường | Mã | Ô hợp lệ / tổng ô | Độ phủ |
| --- | --- | ---: | ---: |
| Dĩ An | 25942 | 70 / 1485 | 4,71% |
| Tân Đông Hiệp | 25945 | 111 / 1483 | 7,48% |
| Đông Hoà | 25951 | 103 / 1456 | 7,07% |
| Thuận Giao | 25969 | 9 / 1182 | 0,76% |
| An Phú | 25975 | 46 / 1158 | 3,97% |

Các vùng đều có hơn 5 ô hợp lệ nhưng dưới 10% độ phủ, nên trung bình bị để trống. Hạ ngưỡng để xuất hiện một con số không cải thiện chất lượng dữ liệu.

Đối chiếu các kênh QA USGS đã lưu trong project cho cảnh path/row 125/052 ngày 04/02/2025 cho thấy lần lượt 1412, 1376, 1357, 1172 và 1118 ô bị QA loại trong các phường trên. Các số này tính trên lưới lấy mẫu cũ, **không phải số chính xác của mask TIFF GEE**. Chúng chỉ ra mây/bóng mây cục bộ là nguyên nhân có khả năng cao, mặc dù tỷ lệ mây toàn cảnh chỉ 2,21%. Bảng chẩn đoán xuất mới sẽ kiểm tra trực tiếp trên GEE.

Landsat cũng có thể thiếu nhiệt độ bề mặt vì thiếu dữ liệu emissivity ASTER GED, không chỉ do mây. Script chẩn đoán tách độ phủ quang học và nhiệt để không hứa rằng chọn thêm cảnh chắc chắn khắc phục hết. Xem [ghi chú bộ dữ liệu Landsat của Google/USGS](https://developers.google.com/earth-engine/datasets/catalog/LANDSAT_LC08_C02_T1_L2).

## Bạn làm trên GEE

1. Mở [GEE Code Editor](https://code.earthengine.google.com/) bằng tài khoản đã dùng. Không tạo Cloud project hoặc repository mới. Vẫn chọn project `mobilegis-510608`.
2. Tạo **script mới** trong repository hiện có, đặt tên `MobileGIS_bo_sung_2025`. Không xoá hay thay script đã xuất sáu năm trước.
3. Mở file `scripts/gee_recover_2025.js` của project, sao chép toàn bộ nội dung và dán vào vùng code trống của GEE.
4. Giữ `RECOVERY_BATCH = 1`. Asset đã điền `projects/mobilegis-510608/assets/hcm167_GEE`. Thư mục Drive mới có tên `MobileGIS_GEE_recovery_2025`; đây là tên thư mục, không phải mã ID. Không xuất lại WorldCover.
5. Bấm **Save**, rồi **Run** trên thanh công cụ phía trên vùng code. Console phải hiện 167 đơn vị nghiên cứu, 5 phường mục tiêu và tối đa 4 cảnh ứng viên. Nếu số cảnh bằng 0 hoặc có lỗi, gửi ảnh lỗi; đừng tự đổi năm/mùa hay bỏ lọc QA.
6. Vào tab **Tasks**, bấm **Run** cho ba tác vụ sau. Trong hộp xuất, dùng Drive thuộc tài khoản của bạn, rồi xác nhận Run. Mặc định không hiển thị raster xem trước để giảm công việc trong phiên tương tác.

   - `MobileGIS_recovery_2025_batch1_120m`
   - `MobileGIS_recovery_2025_batch1_scenes`
   - `MobileGIS_recovery_2025_batch1_diagnostics`

7. Chờ **Completed**, mở Drive → thư mục `MobileGIS_GEE_recovery_2025`, tải ba file `.tif`, `_scenes.csv`, `_diagnostics.csv`. Có thể chọn cả ba rồi Download và giải nén ZIP.
8. Gửi ba file hoặc đường dẫn thư mục đã giải nén. **Không đổi tên TIFF thành `MobileGIS_indices_2025_120m.tif` và không chép đè file đang dùng.** TIFF bổ sung có 5 band nên không dùng trình nhập ba band cũ.

Chỉ chạy batch 2 sau khi kiểm tra batch 1 còn thiếu. Batch 2 chọn cảnh xếp thứ hai theo độ phủ hợp lệ của vùng mục tiêu; không đổi mùa và không dùng năm 2026 để bù năm 2025. Các batch được kiểm tra riêng, không tự ghép nối nhiều batch chưa được đánh giá.

## Cách bổ sung được kiểm soát

- Chỉ xét Landsat 8/9 Level-2 có LST, tháng 1–4 năm 2025; giữ các điều kiện QA, miền giá trị, hệ tọa độ và lưới 120 m. Loại bốn cảnh cũ khỏi danh sách ứng viên.
- Ưu tiên số ô quang học/nhiệt hợp lệ bên trong 5 phường. Mỗi batch tối đa một cảnh mới cho mỗi path/row, thay vì ghép rất nhiều cảnh và làm tăng tải bộ nhớ.
- TIFF ứng viên gồm NDVI, LST, TVDI, mã cảnh và ngày thứ bao nhiêu trong năm. Cả ba chỉ số phải hợp lệ từ **cùng một cảnh cho cùng một ô**; không ghép LST một ngày với NDVI/TVDI ngày khác. Ngày dùng day-of-year để tránh làm tròn số ngày YYYYMMDD khi lưu float32.
- Chỉ lấp ô mà cả ba band cũ đều thiếu, nằm trong 5 phường. Giữ nguyên mọi giá trị có sẵn và toàn bộ vùng ngoài 5 phường. Ô cũ có một phần chỉ số hợp lệ được giữ nguyên, không sửa âm thầm.
- Công cụ `scripts/review_gee_recovery.py` kiểm tra cảnh, ngày, grid, mặt nạ, miền số và nguồn theo từng ô, rồi tạo **thư mục đánh giá riêng** có TIFF, provenance và số liệu trước/sau. Không sửa nguồn đang chạy.
- Có số sau ngưỡng 10% chỉ là mức tối thiểu của demo. Khi đánh giá bản mới, ưu tiên độ phủ từ 50% và kiểm tra tính đại diện ngày ảnh. Vẫn có thể không phục hồi đủ 5 phường. TVDI tiếp tục là thử nghiệm.

Mosaic lựa chọn ảnh theo mặt nạ và thứ tự ưu tiên; script dùng mặt nạ chung cho cả ba chỉ số để giữ cùng ngày tại một ô. Tham khảo [mosaic của Earth Engine](https://developers.google.com/earth-engine/apidocs/ee-imagecollection-mosaic) và [xuất TIFF có grid/NoData](https://developers.google.com/earth-engine/guides/exporting_images).

## Có cần năm 2026 không

**Không bắt buộc với đề cương hiện tại.** File `mục 8 linh mục 9 phương.docx` ghi giai đoạn 2020–2025 ở mục 4.2, 5.2, 6.3, 7.1 và 8.1. Nên hoàn thiện dữ liệu và kiểm thử giai đoạn này trước.

Chỉ bổ sung 2026 nếu giảng viên yêu cầu mở rộng, hoặc nhóm muốn một phần trình diễn riêng. Khi đó phải ghi rõ phạm vi mới, dùng cùng cửa sổ mùa và phương pháp, cập nhật đề cương, dữ liệu, biểu đồ và kiểm thử. Năm 2026 không thể thay thế quan sát thiếu của 2025, và ảnh tháng 1–4/2026 vẫn không phải trung bình cả năm hay dữ liệu thời gian thực.

## Kết quả kiểm tra công cụ

Script GEE được kiểm tra cú pháp cục bộ, chưa được chạy trên tài khoản GEE. Các kiểm thử công cụ ghép dùng dữ liệu giả trong thư mục tạm và không đưa số giả vào bộ nghiên cứu. Có kiểm tra giữ nguyên file hiện hành, giữ giá trị cũ, giữ vùng lân cận, chặn sai năm/ngày/cảnh/grid và không nhận một bản bổ sung rỗng. Chi tiết chẩn đoán hiện tại nằm trong `verification/GEE_2025_gap_diagnosis.json`.

Ngày 04/10/2026: toàn bộ 34 kiểm thử cục bộ PASS, gồm 6 kiểm thử mới cho công cụ phục hồi. Kiểm tra cú pháp `gee_recover_2025.js` PASS. Đây không phải xác nhận script đã chạy thành công trên máy chủ GEE hoặc dữ liệu bổ sung đã có.

### Sửa lỗi kiểu band khi xuất TIFF

Nếu tác vụ báo NDVI `Expected type: MaskOnly. Actual type: Float`, dùng bản script cập nhật: không đưa ảnh rỗng dự phòng vào ImageCollection Landsat; ảnh rỗng chỉ dùng làm nhánh dự phòng ngoài collection. Các ảnh ứng viên được đổi sang Float trước khi mosaic, không chỉ sau khi mosaic.

Sao chép lại toàn bộ script vào GEE, Save rồi Run để tạo tác vụ mới. Không bấm chạy lại tác vụ Failed cũ vì tác vụ đó vẫn giữ biểu thức xuất trước khi sửa. Chạy tác vụ TIFF mới; CSV nào đã Completed thì giữ, CSV nào Failed hoặc chưa chạy thì chạy tác vụ mới tương ứng. Không đổi batch, asset hay grid để chữa lỗi kiểu band này. Việc sửa được kiểm tra cục bộ; cần kết quả tác vụ mới để xác nhận thực thi trên GEE.
