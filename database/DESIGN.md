# Thiết kế CSDL MobileGIS PostgreSQL và PostGIS

Phiên bản 2026.10.PG3, schema 3: ba bảng hiện trạng và ba bảng kết quả riêng
trong cùng database. Phần nền tảng sau đây được giữ từ PG2; bổ sung PG3 ở cuối.
Thiết kế dựa trên yêu cầu trong hai ảnh IMG0919/IMG0920:
trực quan hoá và hỗ trợ ra quyết định về diễn biến không gian–thời gian LST, NDVI,
TVDI; PostGIS/Object Storage → FastAPI/GeoServer → REST/WMS/WFS/XYZ → WebGIS/MobileGIS.
Các chữ trong ảnh là yêu cầu tham chiếu, không phải xác nhận các thành phần đã tồn tại.

## 1 Lựa chọn kiến trúc thực hiện

```text
GEE Landsat và WorldCover      Ranh giới tham khảo 2025      CSV nhóm
             \                         |                    /
              → kiểm tra nguồn và nhập trong transaction ←
                                      |
           PostgreSQL + PostGIS              Local raster storage
           ranh giới và thống kê             TIFF, query grids, XYZ
                        \                      /
                         FastAPI REST + XYZ
                                 |
                         WebGIS responsive PWA
```

Có FastAPI, REST và XYZ, không có GeoServer/WMS/WFS. Lưu file cục bộ hiện là
storage cho raster, chưa có S3/MinIO. Kiến trúc cho phép chuyển asset sang object
storage sau, nhưng không ghi trong báo cáo rằng đã triển khai cloud storage.
MobileGIS hiện là giao diện web/PWA phù hợp màn hình nhỏ, chưa phải Flutter/APK.

Không lưu hàng triệu pixel thành từng dòng SQL và không lưu TIFF như bytea:
tránh nặng CSDL, giữ định dạng GeoTIFF gốc để kiểm chứng. PostGIS lưu và truy vấn
vector. Tra cứu pixel vẫn đọc binary grid từ storage theo metadata có trong SQL.

## 2 Nguyên tắc dữ liệu

* Giữ NULL/NoData, không nội suy và không thay dữ liệu thiếu bằng0.
* Mã hành chính là TEXT để không mất số0 đầu; năm là INTEGER, ngày chụp là DATE.
* CRS vector EPSG4326; TIFF nghiên cứu EPSG32648, lưới120m. Không đổi tọa độ TIFF
  bằng cách chỉ đổi nhãn CRS. Thống kê WorldCover GEE ở10m, hiển thị khoảng30m.
* Ranh giới tham khảo năm2025 dùng cho mọi năm2020–2025, không phải ranh giới lịch sử.
* Mỗi nguồn/phiên bản là dataset riêng. Không ghép bộ cũ với GEE thành một chuỗi.
* Giá trị số dùng double precision, giữ giá trị nhập; chỉ làm tròn khi hiển thị.
* Kết quả nghiên cứu chỉ đọc với tài khoản web. Dữ liệu thực hành tách vật lý.
* Ranh giới `geom` đã đơn giản hóa chỉ dùng hiển thị; `geom_original` bảo toàn
  hình học nguồn để ST_Covers truy vấn vị trí. Không tính thống kê từ polygon nhẹ.

## 3 Quan hệ chính

```text
boundary_versions 1 ── N admin_units
       |                    |
       └──── datasets ─── unit_observations ── observation_scenes ── satellite_scenes
                              |
                              ├── lst_observations  (LST, °C)
                              ├── ndvi_observations (NDVI, −1..1)
                              └── tvdi_observations (TVDI, 0..1, thử nghiệm)
                 |
                 ├── landcover_statistics
                 ├── point_observations
                 └── asset_catalog

demo_observations ── trigger ── audit_log
documents                     schema_migrations
```

Các quan hệ dùng khóa ngoại ghép cho nguồn, năm và mã cảnh. Ba bảng chỉ số khóa theo
`(dataset_id, code, year)` và liên kết thông tin chung ở unit_observations. Khóa ngoại
còn chứa sampled_pixels để chặn mẫu số khác nhau. Ranh giới khóa theo `(boundary_id, code)`.
View observations_combined JOIN ba bảng cho giao diện; view không là bản sao dữ liệu.

## 4 Các bảng và trách nhiệm

| Bảng trong schema mobilegis | Khóa chính | Nội dung |
| --- | --- | --- |
| schema_migrations | version | Phiên bản cấu trúc đã áp dụng |
| boundary_versions | id | Năm, mô tả, giới hạn và metadata ranh giới |
| admin_units | boundary_id + code | 167 đơn vị, geom nhẹ và geom_original đầy đủ, MultiPolygon4326 |
| datasets | id | Nguồn, loại, bản cha và metadata quy trình |
| unit_observations | dataset_id + code + year | Thông tin chung: ranh giới, tổng mẫu, ngày và snapshot provenance |
| lst_observations | dataset_id + code + year | Giá trị lst (°C), valid_pixels, sampled_pixels, coverage |
| ndvi_observations | dataset_id + code + year | Giá trị ndvi (−1..1), valid_pixels, sampled_pixels, coverage |
| tvdi_observations | dataset_id + code + year | Giá trị tvdi (0..1), valid_pixels, sampled_pixels, coverage |
| satellite_scenes | dataset_id + year + scene_id | Mã cảnh, DATE chụp, metadata chất lượng |
| observation_scenes | dataset_id + code + year + scene_id | Liên kết danh mục cảnh của bản thống kê |
| landcover_statistics | dataset_id + code + year | Thống kê lớp phủ2021 theo đơn vị |
| point_observations | dataset_id + name + year | 24 bản ghi CSV nhóm, Point4326 và metadata |
| demo_observations | id | 36 dòng thực hành cũ, CRUD, UNIQUE(name,year) |
| audit_log | id | Nhật ký INSERT/UPDATE/DELETE điểm thực hành |
| asset_catalog | id | Đường dẫn, loại, số byte, SHA256 của TIFF/CSV gốc và xử lý |
| documents | key | JSONB metadata đầy đủ và hash file nguồn nhập |

`datasets.kind` phân biệt research, user_points, demo. Nguồn nghiên cứu gồm
`legacy`, `gee`, `gee_recovery`, mỗi nguồn1002 dòng. `gee_recovery.parent_id=gee`.
CSV nhóm là `user_csv`, chưa tái kiểm chứng quy trình. Bảng demo không dùng chung
với bảng nghiên cứu để tránh API thực hành thay nhầm giá trị thật.

Có 16 bảng và 1 view. Mỗi bảng chỉ số có 3006 dòng = 3 nguồn × 167 khu vực × 6 năm,
kể cả dòng NULL. Với một nguồn như gee_recovery, mỗi bảng có 1002 dòng. Đây là ba
bảng trong database mobilegis, không phải ba database độc lập. CSV nhóm và demo
vẫn tách riêng vì dữ liệu tại điểm/thực hành không phải trung bình xã/phường.

## 5 Vì sao vừa có cột SQL vừa có JSONB

Giá trị, năm, mã và độ phủ có cột riêng để truy vấn, lọc, ràng buộc và đánh chỉ mục.
Metadata khó cố định như số ô bổ sung, cảnh đóng góp và giới hạn phương pháp giữ
trong JSONB. Truy vấn trả giá trị từ cột của ba bảng chỉ số; JSONB giữ snapshot
nguồn/provenance. Unit_observations không còn cột lst/ndvi/tvdi hoặc độ phủ riêng.
Snapshot JSONB có giá trị gốc để đối chiếu, không thay cho ba bảng SQL. Importer và
kiểm thử đối chiếu toàn bộ dữ liệu để phát hiện khác biệt.
JSON nguồn vẫn giữ trên đĩa làm đầu vào kiểm chứng/nhập lại, không là nguồn dự phòng
khi CSDL mất kết nối. Các URL JSON cũ của giao diện nay trả kết quả truy vấn SQL.

## 6 Ràng buộc và chỉ mục

PK/FK chặn nguồn, đơn vị hoặc cảnh không tồn tại. CHECK chặn năm ngoài2020–2025,
tọa độ sai, số ô âm hoặc vượt tổng mẫu, độ phủ ngoài0–1, chỉ số ngoài khoảng lưu trữ.
Giá trị trung bình chỉ được có khi ít nhất5ô và độ phủ ít nhất10%. NULL được giữ.
Geometry phải hợp lệ, không rỗng; kiểu/SRID được cột PostGIS kiểm tra.

CHECK mỗi bảng chỉ số chặn độ phủ không khớp tỷ lệ pixel. GEE/GEErecovery dùng
sai số số thực 1e−12; legacy đã công bố độ phủ làm tròn 4 chữ số nên cho sai số
tối đa 0,00005000001. Không sửa số nguồn để ép ràng buộc.

B-tree cho dataset/năm/mã phục vụ chuỗi và lọc bảng. GiST trên polygon và điểm
phục vụ ST_Covers và mở rộng truy vấn không gian. Index không thay kiểm định hình học.
Không gán độ phủ là độ chính xác. Ngưỡng50% ở giao diện chỉ là mức lọc khuyến nghị.
Ba bảng chỉ số có index dataset/year/value cho lọc và xếp hạng, loại NULL khỏi index này.

## 7 Quy trình nhập và chuyển đổi

1. Đọc SQLite cũ ở chế độ chỉ đọc một lần, tạo snapshot36dòng để giữ ID và số liệu.
2. Tạo schema/extension bằng tài khoản chủ, không dùng tài khoản web chạy DDL.
3. Bắt khóa nhập, kiểm tra hash các file công bố và ràng buộc6năm×167đơn vị.
4. Nhập ranh giới, datasets, thống kê, cảnh/liên kết, lớp phủ, CSV nhóm, snapshotdemo.
5. Lập danh mục file lớn và SHA256, không thay TIFF hoặc mảnh bản đồ.
6. Commit toàn bộ khi hợp lệ; lỗi thì rollback toàn transaction.
7. Tạo tài khoản web, cấp quyền đúng bảng; kiểm tra HTTP và giá trị so với nguồn.

Chạy lại không tạo dòng trùng, không reset điểm thực hành đã sửa hoặc đã xoá.
File nguồn thay đổi thì bị chặn nhập đè; cần migration/version mới. File SQLite
được giữ nguyên và mã cũ trong `.legacy`, không còn là phụ thuộc runtime.

Migration `database/migrations/002_split_indices.sql` chép các cột cũ sang ba bảng,
so sánh giá trị/NULL/số ô/độ phủ trước khi bỏ cột trùng ở bảng cha. Tất cả cùng
transaction. Seed boundaries_original.geojson giữ 167 hình học gốc; geom_original
phải khớp ST_Equals và NOT NULL trước khi ghi schema version 2.

## 8 Thông tin cảnh và bổ sung năm2025

Liên kết cảnh mô tả cảnh được nêu trong metadata của bản thống kê; không tự khẳng
định mọi cảnh đóng góp vào mọi phường. Metadata bổ sung giữ riêng số ô cảnh thực sự
đóng góp. Tổng6325ô mới ở5phường:6324ô ngày28/02/2025,1ô ngày12/01/2025. Giữ nguyên
các ô gốc,162phường khác và các năm2020–2024. Không dùng2026 để thay2025.
Không biến cảnh ứng viên chưa dùng thành cảnh đã đóng góp. Provenance raster vẫn
ở storage để đối chiếu theo pixel, metadata SQL giúp truy vết file/phiên bản.

## 9 Dòng vận hành

Mở web → kiểm tra PostgreSQL/PostGIS và đủ3006dòng nghiên cứu → FastAPI cung cấp
GeoJSON/JSON từ SQL → Leaflet hiển thị XYZ từ storage → chọn nguồn/năm/chỉ số →
hiển thị thống kê, chuỗi và chênh lệch. Xuất CSV nghiên cứu đọc từ SQL; tải TIFF
lấy file gốc/xử lý đã định danh. Không mở tài khoản GEE mỗi lần xem bản đồ.

CRUD thực hành → token phiên → kiểm tra dữ liệu → parameterized query → trigger
ghi nhật ký trong cùng transaction → commit. Lỗi một dòng importCSV thì không
ghi một phần. Khóa tên+năm cho upsert demo, không áp dụng vào bảng nghiên cứu.

## 10 API chính

| API | Chức năng |
| --- | --- |
| GET /api/health | Trạng thái CSDL, số bản ghi và PostGIS |
| GET /api/units | GeoJSON từ PostGIS; lat/lon tùy chọn để tìm vùng chứa điểm |
| GET /api/research/observations | source/year/code/index/coverage để lọc SQL |
| GET /api/research/indices/lst hoặc ndvi hoặc tvdi | Đọc đúng một bảng chỉ số riêng |
| GET /api/research/alerts | Sàng lọc TVDI cao, giữ nhãn thử nghiệm |
| GET /api/sample | Tra cứu ô lưới gần nhất trong storage với metadata SQL |
| GET /api/observations | Điểm thực hành từ PostgreSQL |
| POST /api/save hoặc delete hoặc import | Chỉ ghi điểm thực hành |
| GET /api/gee và gee_recovery/... | Tải file trong danh sách cho phép |
| GET /data/tiles/... | XYZ, ô trống là trong suốt không phải giá trị0 |
| GET /docs | OpenAPI tương tác |

`/api/units?detail=original` tải vector đầy đủ. Mặc định detail=display dùng hình
nhẹ để vẽ. Truy vấn lat/lon luôn dùng geom_original dù trả hình hiển thị nhẹ.

API cũ `/data/gee/observations.json` được giữ để không làm mất chức năng giao diện,
nhưng nội dung được lấy từ SQL. Không dùng đường dẫn tùy ý để đọc config/password.

## 11 Sàng lọc TVDI theo đề bài

Chức năng hiện trả xã/phường có trung bìnhTVDI≥ngưỡng người dùng và đủ độ phủ, phân
biệt nguồn và năm. Ngưỡng mặc định0,8 và độ phủ50% là lựa chọn khám phá, chưa được
kiểm định. Có nút mở bản đồ và thông báo giới hạn. Đây chưa phải thông báo đẩy,
giám sát realtime, cấp hạn, cảnh báo thiên tai chính thức hoặc hệ thống ra quyết
định tự động. Cần đối chứng thực địa và thiết kế ngưỡng mới triển khai cảnh báo.

## 12 Quyền và mật khẩu

Tài khoản chủ dùng setup/import/backup. Web dùng role login riêng không superuser,
không tạo role/database: SELECT dữ liệu nghiên cứu, CRUD điểm demo và USAGE sequence
demo. Không có quyền UPDATE/DELETE bảng nghiên cứu hoặc tự thêm/sửa/xoá nhật ký.
Trigger SECURITY DEFINER có search_path cố định, ghi actor từ session_user, không
nhận SQL tùy ý. Trigger và transaction đảm bảo log cùng thay đổi.
Mật khẩu ở configlocal hoặc biến môi trường, không Git, JavaScript, báo cáo, APIinfo
hay gói bàn giao. Không trả DSN ở lỗi kết nối. Nên hạn chế ACL fileconfig.

Ứng dụng chưa có đăng nhập/phân quyền người dùng cuối; token localhost không thay
thế xác thực hệ thống đa người dùng. Khi công bố cầnHTTPS, auth, reverseproxy,
giới hạn tải, pooling, giám sát, backup kiểm tra phục hồi và quy trình cập nhật.

## 13 Sao lưu và phục hồi

Backup PostgreSQL bằng pg_dump/pgAdmin Custom. Backup raster/XYZ gốc và hash riêng.
Khôi phục vào database mới, kiểm tra167/1002mỗi nguồn, hash, NULL, độ phủ và hình
học trước khi trỏ web vào. Không đánh đồng một SQLdump với gói đầy đủ có raster.
Không xoá SQLite cũ trước khi xác nhận chuyển đổi và sao lưu. Không dùng JSONbackup
như dự phòng âm thầm nếu PostgreSQL dừng.

## 14 Những phần chưa triển khai

GeoServerWMS/WFS, cloudobjectstorage, Flutter/ReactNative, APK, thông báo đẩy, auth
đa người, cảnh báo đã kiểm định và triển khai Internet chưa có. Không thể kết luận
đã hoàn thành mọi yêu cầu WebGIS/MobileGIS chỉ bằng việc đổi SQLite sang PostGIS.
Thiết kế này hoàn thiện tầng dữ liệu và API cho bản demo hiện tại và mở đường cho
những phần còn lại, không phóng đại phạm vi đã làm.

## Tài liệu chính thức

PostGIS ST_Covers: https://postgis.net/docs/ST_Covers.html

PostgreSQL ràng buộc: https://www.postgresql.org/docs/current/ddl-constraints.html

Psycopg transaction: https://www.psycopg.org/psycopg3/docs/basic/transactions.html

FastAPI: https://fastapi.tiangolo.com/

## 8 Bổ sung PG3: thống kê và kết quả tách riêng

Hiện có 24 bảng. Tám bảng thêm vào không thay thế hoặc trộn dữ liệu vào 16 bảng
nền tảng; TIFF vẫn lưu ngoài SQL. Khóa ngoại liên kết các bảng nghiệp vụ mới:

```text
datasets → unit_observations → pixel_statistics → index_landcover_statistics
    |
    └── analysis_runs ← boundary_versions
            |
            ├── result_units ← admin_units
            |       ├── lst_results
            |       ├── ndvi_results
            |       └── tvdi_results
            └── model_evaluations → datasets (nguồn đối chứng)
```

| Bảng thêm | Nội dung và đầu vào |
| --- | --- |
| pixel_statistics | 9.018 nhóm nguồn/khu vực/năm/chỉ số, đếm mẫu, min/max, mean, median, stddev dân số, Q25/Q75 và histogram từ TIFF hợp lệ |
| index_landcover_statistics | 50.467 nhóm nguồn/khu vực/năm/chỉ số/lớp phủ; số pixel và trung bình, WorldCover tham chiếu 2021 lấy mẫu trên grid chỉ số 120 m |
| analysis_runs | Loại forecast/simulation, nguồn cơ sở, ranh giới, năm cơ sở/đích, phương pháp, phiên bản, tham số, mô tả, người tạo/thời gian |
| result_units | Liên kết một lần chạy với mã khu vực, phiên bản ranh giới và năm kết quả |
| lst_results | Giá trị LST kết quả °C; cận và trạng thái, không áp ràng buộc số pixel của hiện trạng |
| ndvi_results | Giá trị NDVI kết quả, cận và trạng thái |
| tvdi_results | Giá trị TVDI kết quả, cận và trạng thái |
| model_evaluations | Chỉ nhận kết quả đánh giá thực: nguồn đối chứng, cách kiểm định, n, RMSE/MAE/Bias; hiện chưa có mô hình đã kiểm định nên bảng trống |

`datasets.result_kind` phân biệt observed, forecast, simulation, unverified;
CSV nhóm là unverified, điểm demo là simulation. GEE recovery vẫn là observed
vì dùng pixel từ ảnh thật, không phải dự báo. Kết quả giả lập không có pixel
quan trắc nên không ép valid_pixels/coverage vào các bảng kết quả.

Tab Kịch bản hiện chỉ cung cấp `independent_offsets v1.0`: cộng riêng mức thay
đổi cho mỗi trung bình chỉ số đủ độ phủ, để NULL khi thiếu hiện trạng. Không có
huấn luyện hoặc mô phỏng liên hệ vật lý giữa ba chỉ số. Cận tin cậy và bảng
đánh giá không được điền bằng số giả. Một kịch bản mẫu tăng LST 1°C được lưu
riêng để minh họa quy trình; không được trình bày là ảnh GEE năm 2026.

Thống kê gốc tính từ tâm pixel trong polygon đầy đủ; stddev dân số và phân vị
nội suy tuyến tính. Min/max ngoài thang màu vẫn giữ nguyên; không đồng nghĩa
đã đạt chất lượng đo đạc. Số mẫu gộp có thể lặp tại mép polygon, không gọi là
số pixel duy nhất toàn vùng. Lớp phủ cố định 2021 không dùng để kết luận biến
động lớp phủ 2020–2025. Thống kê được giữ phương pháp và SHA256 nguồn raster.

Tài khoản web chỉ SELECT hiện trạng/thống kê, INSERT lần chạy và kết quả,
không có UPDATE/DELETE dữ liệu nghiên cứu. Dữ liệu demo có quyền CRUD riêng và
trigger nhật ký như PG2. Schema migration và tài liệu hệ thống không cần nối
giả vào bảng nghiệp vụ chỉ để làm đẹp ERD. Không triển khai kiến trúc Big Data.


## PG4: tài khoản và phân quyền (schema 4)

Migration `004_accounts.sql` thêm bốn bảng trong schema `mobilegis`, không sửa bảng nghiên cứu:
`app_users` (email duy nhất, mật khẩu băm scrypt, vai trò `customer`/`admin`, khóa tạm khi đăng nhập sai),
`app_sessions` (băm mã phiên, mã CSRF, hạn dùng), `password_resets` (yêu cầu quên mật khẩu, mã đặt lại băm, hạn 30 phút,
đếm lần nhập sai) và `auth_events` (nhật ký bảo mật, chỉ thêm). Tổng cộng 28 bảng và 1 view.
Xóa người dùng xóa phiên và yêu cầu đặt lại của họ (ON DELETE CASCADE); nhật ký giữ lại với `user_id` rỗng.
Chi tiết vận hành: `TAI_KHOAN_VA_PHAN_QUYEN.md`.
