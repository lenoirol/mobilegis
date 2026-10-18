# MobileGIS TP.HCM với dữ liệu Landsat

## Demo trực tuyến

**https://lenoirol.github.io/mobilegis/** là bản demo tĩnh trên GitHub Pages (tự cập nhật khi đẩy thay đổi trong `public/`).
Xem được bản đồ, bảng số liệu, bảng tổng, so sánh khu vực, tương quan và sàng lọc TVDI (tính từ số liệu trung bình khu vực đã xuất sẵn).
Đăng nhập, thống kê theo pixel, tra cứu ô và giả lập cần máy chủ FastAPI + PostgreSQL/PostGIS nên chỉ có khi chạy bản đầy đủ trên máy.

## Giao diện mới · UI2

Giao diện đã được xây lại (tối giản hiện đại pha brutalism, màn hình khởi động, chuyển cảnh mượt, thanh tab dưới đáy trên điện thoại,
chạy ngoại tuyến). Đọc **[GIAO_DIEN_MOI.md](GIAO_DIEN_MOI.md)** để biết phong cách, cấu trúc thư mục và cách kiểm thử.
Bản giao diện cũ nằm trong `luu_tru/giao_dien_cu/`.

## Tài khoản và phân quyền · PG4

MobileGIS TP.HCM là **web-app PWA** (không phải Flutter/APK). Bản 2026.10.PG4 thêm đăng ký,
đăng nhập, quên mật khẩu (quản trị viên cấp mã), hai vai trò **Khách hàng** và **Quản trị viên**,
trang `/admin.html`, **Bảng tổng** cho chuyên gia trong tab Bảng số liệu và tông màu sáng-vàng
thống nhất (`public/theme.css`). Chỉ quản trị viên được ghi dữ liệu demo và giả lập. Đọc
**[TAI_KHOAN_VA_PHAN_QUYEN.md](TAI_KHOAN_VA_PHAN_QUYEN.md)** để cài đặt và tạo quản trị viên đầu tiên.
Migration mới: `database/migrations/004_accounts.sql` (4 bảng, schema 4). Test: `pip install -r requirements-test.txt`.

## Giao diện người xem · Viewer1

Bản đồ, Bảng số liệu, Thống kê, Giả lập và Dữ liệu & phương pháp được sắp xếp
cho người xem. Mặc định dùng GEE 2020–2025 đã bổ sung 2025; các lựa chọn nguồn
cũ/demo và trạng thái PostgreSQL chuyển vào công cụ nâng cao. Độ phủ thấp được
đánh dấu; biểu đồ không nối qua mốc thiếu/ít mẫu. Đọc [VIEWER_GUIDE.md](VIEWER_GUIDE.md).
Thay đổi này không sửa dữ liệu hay schema PG3. Nâng cao không phải phân quyền.

## Bản hiện hành: PostgreSQL / PostGIS — 2026.10.PG3

Máy chủ đã chuyển sang **Python FastAPI + PostgreSQL/PostGIS**, không còn dùng
SQLite khi vận hành. GEE 2020–2025, bản bổ sung 2025, ranh giới 167 đơn vị và dữ
liệu thực hành được bảo toàn, tách nguồn và kiểm tra bằng các ràng buộc SQL.
GeoTIFF và tile XYZ vẫn lưu riêng trên đĩa; PostGIS lưu hình học, thống kê và nguồn.

Đọc **[DATABASE_POSTGRESQL.md](DATABASE_POSTGRESQL.md)** để cài thư viện, kết nối
PostgreSQL 18 có PostGIS và khởi động đúng bản PG3. Thiết kế 24 bảng và 1 view,
khóa và chỉ mục nằm trong **[database/DESIGN.md](database/DESIGN.md)**.
LST, NDVI và TVDI nằm trong ba bảng riêng: `lst_observations`,
`ndvi_observations`, `tvdi_observations`. Mỗi bảng có 3.006 bản ghi, bao gồm
các giá trị NULL được giữ nguyên; ba nguồn dữ liệu không bị trộn lẫn.
SQL cài đặt gồm **database/schema.sql**, **database/migrations/002_split_indices.sql**
và **database/migrations/003_analysis_results.sql** theo đúng thứ tự.
Tab Nguồn có trạng thái CSDL; tab Thống kê có sàng lọc TVDI theo năm/độ phủ từ SQL.
Đây là sàng lọc thử nghiệm, không phải cảnh báo hạn đã kiểm định.

Các đoạn GEE7 bên dưới và ZIP/Word cũ là lịch sử xử lý dữ liệu, không phải hướng
dẫn khởi động bản PG3. 36 dòng demo đã được chuyển sang PostgreSQL; SQLite cũ chỉ
giữ làm bản dự phòng. Không gửi các file `config/*.local.json` chứa thông tin kết nối.

PG3 bổ sung 9.018 thống kê pixel (histogram, min/max, trung vị, phân vị, độ lệch
chuẩn), 50.467 nhóm so sánh chỉ số với lớp phủ 2021, bảng tương quan và tab
Kịch bản. Ba bảng kết quả `lst_results`, `ndvi_results`, `tvdi_results` tách khỏi
ba bảng hiện trạng. Công cụ hiện có là giả lập cộng mức thay đổi độc lập, **không
phải mô hình dự báo đã huấn luyện/kiểm định**; không tạo RMSE/MAE giả.
Nền nhẹ cục bộ là mặc định; nhãn tự tránh chồng và có thể tắt. Ảnh RGB nghiên cứu
vẫn giữ vùng thiếu dữ liệu thật. Màu lớp chỉ số dùng đúng tài liệu giáo viên;
không cắt giá trị TIFF theo khoảng màu hiển thị. Không triển khai Big Data.
Đọc **[NANG_CAP_PG3_20261011.md](NANG_CAP_PG3_20261011.md)** để thao tác các phần mới.

## Lịch sử dữ liệu: GEE7 và các phiên bản trước

Bản nâng cấp từ demo nhóm 6: **2026.10.GEE7** mặc định nguồn **GEE đã bổ sung 2025**, đủ chuỗi 2020–2025 và 167/167 đơn vị có ba chỉ số năm 2025. Giữ riêng bản GEE gốc và bộ xử lý cũ. Đây là web/PWA, chưa phải Flutter/React Native hoặc APK.

## Cập nhật phục hồi 2025

Đã kiểm tra ba file batch 1 bạn xuất: bổ sung 6.325 ô từ ảnh Landsat cùng mùa năm 2025. Độ phủ ba chỉ số ở 5 phường đạt 96,7–99,9%. Chỉ lấp bộ ba ô thiếu trong 5 phường; mọi giá trị gốc, dữ liệu 2020–2024 và 162 đơn vị còn lại giữ nguyên. Không nội suy, không dùng 2026. Chọn nguồn **GEE · bản gốc** để đối chiếu trước/sau. TVDI vẫn là thử nghiệm, LST là nhiệt độ bề mặt.

Bản chạy mới: `MobileGIS_GEE_2020_2025_RECOVERY.zip`. Kết quả chi tiết: `verification/GEE_2025_RECOVERY.md`. Các ZIP trước và 19 file GEE gốc không bị ghi đè. Ba file recovery gốc được bảo toàn riêng trong `data/gee_recovery/batch1_20261004/originals`.

Phần GEE6 dưới đây ghi lại kiểm tra **bản gốc**, không phải số thiếu của bản GEE7 đang mặc định.

## Cập nhật GEE thật

- Giữ đủ 19 file GEE gốc (6 TIFF chỉ số, 12 CSV, 1 WorldCover), kiểm tra SHA256. Chuẩn hóa NoData, không thay giá trị pixel hữu hạn.
- Tính lại số mẫu, tỷ lệ phủ 0–100% và trung bình từ cùng grid 120 m và polygon gốc theo quy tắc tâm pixel. Mỗi năm 2020–2024 có 167/167 đơn vị đạt ngưỡng; 2025 có 162/167, giữ trống 5 phường thiếu mẫu. Không cắt số >100% để che lỗi CSV ban đầu. Tổng cộng 1.002 dòng, không đồng nghĩa 1.002 dòng đều đủ số.
- GEE WorldCover 2021: thống kê lưới 10 m, tile hiển thị khoảng 30 m; có tải TIFF 10 m. Nguồn cũ WorldCover lấy mẫu 120 m vẫn giữ riêng.
- Bộ chọn nguồn đồng bộ Bản đồ, Dữ liệu, Phân tích. Năm GEE thiếu không dùng dữ liệu PC thay thế. Chênh lệch và kéo màn hình chỉ bật khi có đủ GEE 2020/2025 cùng grid.
- Đã tạo 18 lớp chỉ số GEE và 3 lớp chênh lệch cùng nguồn 2025 trừ 2020, chỉ giữ các cặp ô có số ở cả hai năm. Kéo màn hình, diễn biến và phân tích sáu năm đã bật.
- `GEE_2020_2024.md` giữ quy trình tái xuất; các file 2020–2024 hiện đã nhận và nhập xong. Không cần chạy lại các tác vụ Completed. Agent không trực tiếp chạy tài khoản GEE, không có bản sao script thực tế của người dùng để xác nhận từng dòng; kiểm tra file xuất và metadata cảnh có thể thực hiện độc lập.
- `scripts/import_gee.py` nhập bổ sung toàn bộ TIFF/CSV vào nguồn riêng và tạo tile/query/metadata, không sửa bộ xử lý cũ. Yêu cầu thư viện xử lý, không cần các thư viện này để chạy server.
- ZIP đủ sáu năm: `MobileGIS_GEE_2020_2025.zip`; hai ZIP trước giữ nguyên. File Word cũ không được cập nhật; ưu tiên hướng dẫn Markdown hiện hành. Kết quả kiểm tra ở `verification/GEE_2020_2025.md`.

Các phần mô tả “nguồn cũ” bên dưới giữ để đối chiếu, không phải nguồn GEE mới.

## Chạy ứng dụng

Nhấp đúp `START_MOBILEGIS.cmd`, giữ cửa sổ máy chủ mở và truy cập **đúng địa chỉ được in trong cửa sổ**. Mặc định **http://127.0.0.1:5379**; nếu cổng đã dùng, chương trình tự chọn cổng kế tiếp, không đóng máy chủ cũ. Góc trên bên phải giao diện hiện `2026.10`, cổng và đường dẫn project khi rê chuột để phân biệt bản cũ/mới.

Hoặc, tại thư mục này:

```powershell
python server.py --port 5379 --auto-port
```

Máy hiện tại có Python tại `C:\Users\phuhuy\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`. Chạy ứng dụng PG3 cần các gói trong `requirements-runtime.txt` và PostgreSQL/PostGIS. Thư viện GIS trong `requirements-processing.txt` chỉ cần khi tái xử lý TIFF.

Chọn bộ **Landsat thực**, tìm xã/phường theo tên hoặc mã, chạm vùng để xem chỉ số, ngày ảnh, tỷ lệ pixel hợp lệ và biểu đồ. Đổi giữa ảnh chỉ số và trung bình xã/phường. Nút **Công cụ/Thu gọn** và nút **−/+** giúp mở rộng bản đồ trên điện thoại. Tab **Nguồn** có danh mục 24 cảnh, phương pháp, GeoJSON và liên kết tải dữ liệu.

## Bổ sung thực tế · phiên bản 2026.10

- 24 lớp hiển thị dạng XYZ, zoom gốc 7–12: 18 lớp chỉ số, hai ảnh nền Landsat RGB thật 2020/2025, một WorldCover 2021 và ba lớp thay đổi. Zoom lớn hơn chỉ phóng to mẫu, không tăng chi tiết 120 m.
- Nền vệ tinh cục bộ dùng được khi máy chủ đang chạy, không phụ thuộc OSM. Tắt lớp chỉ số để xem màu tự nhiên. Ngày và năm ảnh nền cố định được ghi riêng, không gọi là ảnh hiện tại.
- Lớp phủ ESA WorldCover nguồn cũ: nguồn 10 m năm 2021 được lấy mẫu 120 m từ COG ESA. Nguồn GEE mới đã nhập riêng, thống kê ở 10 m; cả hai chỉ mô tả năm 2021.
- Chế độ thay đổi 2025 − 2020 chỉ dùng các ô có dữ liệu ở cả hai mốc; màu xanh giảm, đỏ tăng. Bảng khu vực ghi riêng chênh lệch trung bình vùng, không đánh đồng với trung bình chênh lệch của tập pixel giao nhau. Khác ngày ảnh và rìa TVDI hạn chế diễn giải nguyên nhân/xu thế.
- So sánh kéo màn hình: bên trái 2020, bên phải năm chọn; độ phủ dữ liệu theo xã/phường; tra cứu ô mẫu gần vị trí chạm. Bản tra cứu được đổi lưới địa lý bằng nearest-neighbour, không phải phép nội suy độ chính xác cao.
- Tab Phân tích: lọc độ phủ, nhóm giá trị cao, phân bố LST–NDVI và chuỗi tối đa bốn xã/phường. Xếp hạng không phải cảnh báo rủi ro chính thức. Tab Dữ liệu tìm theo tên/mã/năm, xuất CSV đã lọc, giữ bộ thực/CSV nhóm/demo tách riêng.
- Có `GEE_README.md`, `GEE_2020_2024.md`, script xuất và ZIP ranh giới. Người dùng đã gửi đủ file GEE 2020–2025; trình nhập giữ nguồn GEE riêng, không sửa bộ xử lý cũ.

Đọc `luu_tru/HUONG_DAN_NHANH_2026_10.md` cho phiên bản này. File Word cũ được giữ nguyên để bảo toàn tài liệu trước; các thao tác mới và cổng chạy ưu tiên hướng dẫn mới. ZIP chạy gọn không đóng gói tài liệu Word cũ hay các kênh tải trung gian; thư mục project đầy đủ vẫn giữ tất cả.

## Phân tích và ảnh minh chứng GEE

Tab **Phân tích** so sánh LST, NDVI, TVDI của bốn điểm từ CSV nhóm cung cấp; chọn/bỏ chọn điểm, xem bảng từng năm, chênh lệch 2025 trừ 2020 và tải SVG có ghi nguồn. Biểu đồ đọc trực tiếp `observations_user.json`, không số hóa hay thay số từ ảnh chụp. NDVI/TVDI dùng trục cố định; chênh lệch là số tuyệt đối, không phải phần trăm.

Năm ảnh gốc do người dùng cung cấp được giữ nguyên tại `public/data/evidence/`: hai biểu đồ NDVI/LST và ba bản đồ GEE năm 2025. Có xem lớn, tải ảnh gốc và giải thích. Ảnh chỉ minh chứng xử lý thí điểm: nhãn ranh giới là TP.HCM cũ, không chứng minh bao phủ 167 đơn vị. Chú giải biểu đồ bị cắt và diễn biến có dấu hiệu khác CSV; chưa thể xác nhận đồng nhất nếu không có script GEE và thông tin nguồn đầy đủ. Không trích số chính xác từ ảnh và không georeference ảnh chụp thành lớp nghiên cứu.

Phần này hỗ trợ mục 8.3 và 8.5 của đề cương, không thay thế kiểm định khoa học. Ảnh đã mở được lưu đệm khi service worker hoạt động; ảnh chưa mở vẫn cần máy chủ. Để nhập bản đồ GEE thực, cần GeoTIFF và metadata thay vì JPG.

## Dữ liệu đã có

- 168 file GeoJSON nguồn được tải; lớp nghiên cứu gồm 167 đơn vị sau khi loại Côn Đảo (`26732`). Giữ Thạnh An (`27676`) và các đảo ven bờ khác.
- Mã đơn vị được đối chiếu với danh mục phát hành `v3.0.2` năm 2025: khớp cả 168 mã trước khi loại Côn Đảo. Điều này xác nhận danh mục, không chứng nhận độ chính xác địa chính của hình học.
- Dữ liệu lấy mẫu từ 24 cảnh Landsat 8/9 Collection 2 Level-2: bốn cảnh mỗi năm, trong tháng 1–4, cho sáu năm 2020–2025.
- 18 GeoTIFF chỉ số trên lưới 120 m và 18 ảnh hiển thị nhẹ đã chuyển Web Mercator.
- 1.002 dòng đơn vị/năm trong JSON và CSV; 997 dòng có ba chỉ số, 5 dòng thiếu được giữ trống.
- 36 dòng giả lập cũ vẫn nằm trong SQLite, chỉ xuất hiện khi chuyển sang bộ demo. CRUD và nhập CSV cũ chỉ tác động bộ demo.
- CSV nhóm bổ sung có 24 dòng tại 4 điểm, đủ sáu năm. Chọn **CSV nhóm cung cấp · 4 điểm GEE** để xem. Tọa độ và số liệu được giữ nguyên; file gốc có thể tải từ tab Nguồn. Nguồn GEE là thông tin do CSV khai báo, chưa tái kiểm chứng vì thiếu script, mã cảnh và phương pháp tổng hợp. Bộ này độc lập với 1.002 dòng thống kê và 36 dòng demo.

Tên điểm trong CSV không luôn là tên đơn vị mới: Trung tâm TP.HCM nằm trong phường Sài Gòn; Củ Chi nằm trong xã Nhuận Đức theo lớp tham chiếu. Đã gắn mã đơn vị chứa tọa độ để tra cứu, không coi số liệu CSV là trung bình của đơn vị đó. Có ba TVDI bằng 1, được giữ nguyên và ghi trong kiểm tra nguồn. Không kết luận chúng sai hay hạn hán nếu chưa biết cách tính.

Các kênh được tải theo cửa sổ không gian và lấy mẫu từ COG; không tải toàn bộ các cảnh nguyên gốc ở độ phân giải 30 m. Dữ liệu lấy mẫu trung gian được giữ ở `data/sampled_inputs/`, STAC nguồn và URL kênh ở `data/sources/landsat/`.

## Nguồn

1. [Vietnamese Provinces Database](https://github.com/thanglequoc/vietnamese-provinces-database/tree/v4.2.0), commit `cd58063299585146ded3981f2272946ef19ced54`. Kho cộng đồng dẫn dữ liệu hình học từ [bản đồ tham chiếu sắp xếp đơn vị hành chính](https://sapnhap.bando.com.vn). Giấy phép MIT của kho được giữ trong `data/sources/boundaries/LICENSE.txt`. Phiên bản hình học tải năm 2026 và được đối chiếu danh mục mã 2025; không gọi đây là bản đo đạc lịch sử chính thức năm 2025.
2. [USGS Landsat 8–9 Level-2 Collection 2](https://doi.org/10.5066/P9OGBGM6), cung cấp qua [Microsoft Planetary Computer](https://planetarycomputer.microsoft.com/dataset/landsat-c2-l2). Sản phẩm Landsat được sử dụng không hạn chế theo [USGS](https://www.usgs.gov/landsat-missions/landsat-collection-2-surface-reflectance).
3. Hệ số nhiệt độ theo [USGS Surface Temperature](https://www.usgs.gov/landsat-missions/landsat-collection-2-surface-temperature); bit chất lượng theo [USGS QA bands](https://www.usgs.gov/landsat-missions/landsat-collection-2-quality-assessment-bands).
4. Bản đồ nền: [OpenStreetMap](https://www.openstreetmap.org/copyright). Thư viện bản đồ [Leaflet 1.9.4](https://leafletjs.com) được lưu cục bộ, giữ giấy phép trong `public/vendor/`.
5. [ESA WorldCover 2021 v200](https://esa-worldcover.org/en/data-access), [cùng sản phẩm trong danh mục GEE](https://developers.google.com/earth-engine/datasets/catalog/ESA_WorldCover_v200), CC BY 4.0. © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium. Không so sánh lớp phủ của sản phẩm này như chuỗi sáu năm.

## Phương pháp và giới hạn cần ghi trong báo cáo

LST = DN × 0,00341802 + 149 − 273,15 (°C). Phản xạ Red/NIR = DN × 0,0000275 − 0,2; NDVI = (NIR − Red)/(NIR + Red). Loại fill, mây, bóng mây, cirrus và snow bằng QA_PIXEL bits 0–5; loại QA_RADSAT khác 0. Kiểm tra miền phản xạ 0–1 và LST −10 đến 70°C như bước sàng lọc thử nghiệm.

Lưới phân tích 120 m trong EPSG:32648. Các kênh nguồn và overview COG được đọc bằng nearest-neighbour rồi đưa về cùng lưới. Bộ lọc QA chạy trên lưới lấy mẫu; không đảm bảo loại mọi đám mây nhỏ ở độ phân giải nguồn 30 m. LST/NDVI dùng chung pixel đủ cả hai chỉ số. Đây là lấy mẫu thưa, không phải trung bình tất cả pixel 30 m trong một ô 120 m.

Mỗi WRS path/row chọn một cảnh có mây toàn cảnh thấp nhất trong tháng 1–4, giới hạn 35%. Ghép theo thứ tự mây tăng dần, ưu tiên pixel hợp lệ đầu tiên. Không gọi kết quả này là trung bình năm hoặc ảnh cùng ngày. Ngày chụp thật và nguồn từng cảnh được lưu đầy đủ; khác biệt ngày chụp cần được xem xét khi phân tích biến động.

TVDI là **ước lượng thử nghiệm**, không phải chỉ số sẵn có do USGS cung cấp. Loại nước theo QA bit 7; chia NDVI 0,1–0,85 thành nhóm rộng 0,05, ít nhất 80 pixel/nhóm và sáu nhóm/cảnh. Khớp tuyến tính phân vị LST 5% và 95% làm rìa ướt/khô. Chỉ tính trong miền NDVI thực tế của các nhóm và khi rìa khô cao hơn rìa ướt ít nhất 2°C. Giá trị ngoài 0–1 được chặn; tỷ lệ chặn, hệ số hồi quy, số mẫu và các nhóm được ghi trong manifest. Cần rà soát phương pháp này với giảng viên và kiểm chứng trước khi kết luận khô hạn; không so sánh TVDI giữa cảnh như thang đo tuyệt đối đã hiệu chuẩn.

Thống kê hành chính dùng hình học gốc, không dùng hình đã đơn giản hóa để hiển thị. Tính trung bình pixel có tâm nằm trong đơn vị. Ít hơn năm pixel hợp lệ hoặc độ phủ dưới 10% thì trả `null`. Không điền 0 hay nội suy. Độ phủ tính trên số ô mẫu nằm trong polygon, có thể bao gồm vùng nước; không phải tỷ lệ diện tích đất được xác nhận.

Phân tích 2020–2025 cùng dùng ranh giới nghiên cứu sau sắp xếp 2025. Chưa kiểm chứng độc lập với dữ liệu thực địa, chưa xử lý đầy đủ độ phân giải 30 m, chưa có khảo sát người dùng hoặc thử trên hai điện thoại Android vật lý. Kiểm thử hiện tại xác nhận tính nhất quán dữ liệu/phần mềm; xem `verification/REPORT.md`.

## Cấu trúc

```text
server.py                     Máy chủ Python, API demo và tải GeoTIFF
public/                       Giao diện, Leaflet cục bộ, bộ nhớ đệm
public/data/hcm_167.geojson    Ranh giới nhẹ dùng hiển thị
public/data/landsat_manifest.json  Danh mục cảnh, ngày, hệ số TVDI, giới hạn
public/data/observations_real.*    Thuộc tính theo đơn vị/năm
public/data/rasters/           18 PNG chỉ số trong Web Mercator
public/data/tiles/             24 lớp XYZ cục bộ, 4.176 tile PNG
public/data/visual_products.json  Metadata nguồn/màu/phạm vi/độ phân giải
public/data/landcover_stats.json  Tỷ lệ ô mẫu WorldCover theo đơn vị
data/rasters/                 18 GeoTIFF 120 m để mở trong QGIS
data/context/                 GeoTIFF WorldCover và RGB hai mốc
data/query_grid/              Lưới nhị phân tra cứu pixel qua máy chủ
data/gee_boundary/            Shapefile ZIP ranh giới gốc để nhập GEE
data/sources/                 GeoJSON nguyên bản, giấy phép, danh mục STAC
data/sampled_inputs/          Kênh đã tải, lấy mẫu về lưới chung
data/processed/               Kết quả từng năm và nguồn
scripts/                      Tải lại và tái tạo kết quả
tests/                        Kiểm tra dữ liệu và API
verification/                 Bảng đối chiếu 10 đơn vị × 6 năm × 3 chỉ số
```

## Tái tạo dữ liệu

Trong môi trường Python riêng của nhóm:

```powershell
python -m pip install -r requirements-processing.txt
python scripts/download_boundaries.py
python scripts/build_landsat.py
python scripts/build_visual_products.py
python scripts/prepare_gee_boundary.py
python -m unittest discover -s tests -v
```

Trên máy này, thư viện xử lý đã cài riêng ở `../.geo-libs` và script tự tìm. Pipeline giữ cache; lần chạy lại bỏ qua năm đã hoàn tất. Nếu thay công thức, cần chủ động chuyển kết quả cũ trong `data/processed/` sang thư mục lưu trữ trước khi chạy lại để tạo phiên bản mới. Không sửa kết quả JSON bằng tay. Cần Internet và đủ dung lượng khi tải lại nguồn.

## Điện thoại và bộ nhớ đệm

Máy chủ mặc định chỉ chạy trên máy hiện tại. Khi cần thử trong mạng riêng tin cậy, nhóm có thể chạy `python server.py --host 0.0.0.0 --port 5380` rồi mở địa chỉ LAN của máy tính từ điện thoại cùng mạng. HTTP qua LAN không đủ điều kiện GPS/PWA trên nhiều trình duyệt; muốn dùng các chức năng này cần HTTPS do nhóm cấu hình. Chưa có đăng nhập/phân quyền; không mở máy chủ demo trực tiếp ra Internet.

Service worker chỉ bật với localhost/HTTPS, lưu giao diện, ranh giới, dữ liệu tra cứu và các PNG đã xem. Không tải hàng loạt tile OSM; GeoTIFF, API quản lý demo và ảnh chưa xem cần máy chủ. Đây là bộ nhớ đệm hạn chế, không phải gói bản đồ ngoại tuyến đầy đủ. Nếu không phân giải được tên miền OSM, nền có thể trống trong khi ranh giới và Landsat vẫn hoạt động.
