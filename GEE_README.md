# Lấy dữ liệu GEE từ đầu

Bản cập nhật **2026.10.GEE6** đã nhập đủ 19 file GEE cho sáu năm 2020–2025 và WorldCover 2021. File gốc giữ nguyên trong `data/gee/originals`. Thống kê đã tính lại từ GeoTIFF trong `public/data/gee`, không ghi đè bộ xử lý Planetary Computer cũ.

**Không cần xuất lại:** các file 2020–2024 bạn gửi đã tích hợp. Quy trình dưới đây để tham khảo/tái tạo; agent không trực tiếp chạy GEE hoặc có bản sao script thực tế trong tài khoản. Chọn “GEE · đủ 2020–2025” trong demo để xem toàn bộ chuỗi. Chi tiết kiểm tra ở `verification/GEE_2020_2025.md`.

**GEE7 đã bổ sung 5 phường năm 2025:** ba file batch 1 đã nhận và kiểm tra, thêm 6.325 ô thực, năm 2025 đạt 167/167 đơn vị có ba chỉ số. Mặc định chọn “GEE · đã bổ sung 2025”; chọn “GEE · bản gốc” để đối chiếu trước bổ sung. Không cần batch 2, không xuất lại WorldCover. Theo đề cương, năm 2026 không bắt buộc. Chi tiết ở `luu_tru/GEE_BO_SUNG_2025.md` và `verification/GEE_2025_RECOVERY.md`.

## 1. Chuẩn bị tài khoản

Mở [Earth Engine Code Editor](https://code.earthengine.google.com/). Đăng nhập tài khoản Google của bạn, chọn Google Cloud project đã đăng ký Earth Engine và có quyền phù hợp. Nếu hệ thống yêu cầu đăng ký/xác minh mục đích sử dụng, tự làm theo thông báo; không đưa mật khẩu hoặc khóa dịch vụ vào project này. Không cần mua dịch vụ chỉ để chạy ứng dụng cục bộ đã cung cấp.

Tài liệu chính thức: [quyền truy cập](https://developers.google.com/earth-engine/guides/access), [xác thực và Cloud project](https://developers.google.com/earth-engine/guides/auth).

## 2. Đưa ranh giới 167 đơn vị lên GEE

Trong Code Editor: **Assets → NEW → Shape files**. Chọn `data/gee_boundary/hcm167_GEE.zip`, đặt tên asset `hcm167` và tải lên. Chờ tác vụ nhập xong trong **Tasks**, sao chép đường dẫn asset thực tế, ví dụ `projects/ten-project-cua-ban/assets/hcm167`.

ZIP đã tạo từ hình học nguồn gốc, không từ bản hiển thị đơn giản hóa. Có 167 mã gồm Thạnh An, không có Côn Đảo; tên tiếng Việt UTF-8. Nguồn ranh giới vẫn là kho cộng đồng tham chiếu, không phải xác nhận địa chính. Nếu tải lâu có thể dùng Advanced options để chia hình học; kiểm tra số feature không đổi. [Hướng dẫn nhập bảng của Google](https://developers.google.com/earth-engine/guides/table_upload).

## 3. Chạy một năm khi cần tái tạo bộ mới

Mở `scripts/gee_mobilegis.js`, sao chép toàn bộ vào script mới trong Code Editor. Asset đã đặt `projects/mobilegis-510608/assets/hcm167_GEE`. Mặc định `YEARS = [2020]`, `SCALE = 120`; năm 2025 đã có, không cần chạy lại. Script dùng khung bao và clipToCollection, tránh gộp hình học gây lỗi bộ nhớ.

Trong **Console**, kiểm tra số đơn vị là 167 và danh sách cảnh cho năm đã chọn. Mặc định tháng 1–4, Landsat 8/9 C2 L2SP, mây toàn cảnh ≤35%, một cảnh ít mây nhất cho mỗi WRS 124/125 và hàng 52/53. QA loại fill/mây/bóng mây/cirrus/tuyết và bão hòa. Mosaic ưu tiên pixel hợp lệ của cảnh ít mây trước; đây **không phải trung bình năm**.

Các lớp LST (°C), NDVI và TVDI xuất hiện trên bản đồ. TVDI là phép khớp thử nghiệm phân vị LST 5/95 theo bin NDVI, tối thiểu 80 mẫu/bin và 6 bin/cảnh, loại nước. Thiếu điều kiện thì giữ mask, không điền 0. Rìa khô/ướt khác nhau theo cảnh, không xem đây là thang khô hạn tuyệt đối đã hiệu chuẩn.

## 4. Xuất và tải dữ liệu

Mở **Tasks**, nhấn **RUN** từng tác vụ. Script hiện tại mặc định tạo ba tác vụ mỗi năm: GeoTIFF ba kênh, bảng xã/phường, bảng cảnh/hệ số TVDI. WorldCover chỉ thêm khi `EXPORT_WORLDCOVER=true`; hiện đã có nên giữ false. Thư mục Drive là `MobileGIS_GEE_phuhuy_20261004` do tài khoản của bạn có quyền ghi. Đợi hoàn thành rồi tải toàn bộ file và giữ cùng nhau. Không chỉ chụp JPG: ảnh chụp không có giá trị pixel hoặc hệ tọa độ để phân tích.

Muốn đủ sáu năm, đổi `YEARS` thành `[2020,2021,2022,2023,2024,2025]`. Chạy lần lượt nếu tài nguyên hạn chế. Có 18 tác vụ theo năm và một WorldCover. Tránh khởi chạy lại các tác vụ đã hoàn thành, vì Drive có thể giữ nhiều file cùng tên.

`SCALE=120` là lưới thử nghiệm. Nếu cần kết quả chi tiết hơn, đổi sang 30 m rồi chạy **một bộ mới hoàn chỉnh**. LST Landsat không có độ phân giải nhiệt gốc 30 m dù sản phẩm được đưa lên lưới 30 m; tăng kích thước file không tự tăng độ chính xác. WorldCover là sản phẩm 2021 nguồn 10 m, không phải bản đồ phủ đất cho 2020–2025.

## 5. Đối chiếu trước khi thay dữ liệu ứng dụng

Mở GeoTIFF trong QGIS, kiểm tra CRS EPSG:32648, NoData, phạm vi nghiên cứu và các kênh LST/NDVI/TVDI. Bảng xuất giữ trung bình, số mẫu và độ phủ; dưới 5 mẫu hoặc 10% độ phủ thì trung bình trống. Kiểm tra ít nhất 10 đơn vị với cùng raster và ranh giới, lưu bằng chứng thật.

Không chép trực tiếp CSV mới đè `observations_real.json`. GEE và chương trình cục bộ có lưới, cách đọc overview, phép phân vị và xử lý mask khác nhau nên số liệu có thể khác. Chương trình xử lý `scripts/import_gee.py --input THU_MUC_XUAT` giữ bản gốc, chuẩn hóa NoData, tính lại thống kê, tạo tile và metadata riêng. Cần Python cùng các thư viện xử lý GIS; chương trình này không cần thiết để chạy demo. Gửi thư mục xuất các năm mới để được nhập tiếp.

## Kiểm tra bộ 2025 đã xuất

CSV GEE ban đầu có 121 dòng LST/NDVI và 90 dòng TVDI có độ phủ >100%. Bản hiệu chỉnh dùng **cùng quy tắc tâm pixel** cho cả mẫu hợp lệ và tổng mẫu, và tính lại trung bình bằng float64. Không cắt tỷ lệ về 100% hoặc sửa bản gốc. Trung bình mới khác trung bình có trọng số rìa polygon của GEE một chút; mức chênh LST tối đa khoảng 0,10°C, không phải sửa nhiệt độ pixel.

NoData ở GeoTIFF chỉ số ban đầu là NaN dù metadata khai báo -9999. Bản chuẩn hóa thay NaN thành -9999, giữ nguyên mọi giá trị hữu hạn. WorldCover đặt 0 là NoData, không coi màu nền 0 là một loại đất. Thống kê lớp phủ dùng lưới TIFF 10 m; tile hiển thị lấy mẫu gần nhất khoảng 30 m cho nhẹ, max native zoom 12.

GEE 2025 có 162/167 đơn vị đủ 3 chỉ số. 5 phường Dĩ An, Tân Đông Hiệp, Đông Hoà, Thuận Giao, An Phú giữ giá trị trống vì dưới 10% độ phủ. Đây là hạn chế chọn cảnh ít mây, không phải lỗi tải file. Không nội suy hoặc gán 0 để làm đầy. TVDI vẫn cần kiểm định độc lập trước khi kết luận khô hạn.

## Xử lý lỗi thường gặp

- Không thấy asset: kiểm tra đường dẫn `UNIT_ASSET`, quyền tài khoản và tác vụ nhập.
- Không đủ 167 feature: kiểm tra mã bị chuyển số, geometry splitting và file nguồn; không tiếp tục xuất để kết luận đủ phạm vi.
- Không có cảnh hoặc thiếu kênh: kiểm tra năm/bộ lọc và Console. Không tạo ảnh bằng số 0 để che lỗi.
- Quá bộ nhớ/tác vụ chậm: chạy một năm, dùng 120 m, tăng `tileScale` từ 4 lên 8 cho phép tổng hợp. Không gọi đây là kết quả 30 m.
- TVDI trống: kiểm tra `tvdi_bins`, hệ số trong CSV cảnh; có thể là thiếu mẫu sau lọc mây/nước.

Nguồn: [Landsat 8 C2 L2](https://developers.google.com/earth-engine/datasets/catalog/LANDSAT_LC08_C02_T1_L2), [Landsat 9 C2 L2](https://developers.google.com/earth-engine/datasets/catalog/LANDSAT_LC09_C02_T1_L2), [ESA WorldCover v200](https://developers.google.com/earth-engine/datasets/catalog/ESA_WorldCover_v200), [xuất ảnh](https://developers.google.com/earth-engine/guides/exporting_images). WorldCover: CC BY 4.0; giữ ghi công ESA/Copernicus khi sử dụng.
