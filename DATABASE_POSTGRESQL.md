# Hướng dẫn chạy MobileGIS với PostgreSQL và PostGIS

Phiên bản 2026.10.PG3, schema 3, ngày 11 tháng 10 năm 2026. Ba bảng hiện trạng
LST/NDVI/TVDI và ba bảng kết quả mô hình/giả lập tách riêng. Không dùng SQLite.

PG3 thêm thống kê pixel và kịch bản. Thiết lập mới tự nhập bộ thống kê có SHA256
trong `database/seeds/analysis_pg3`; không cần cài thư viện xử lý ảnh chỉ để chạy
web. SQL tải từ tab Nguồn gồm đủ schema và hai migration, nhưng chỉ chứa cấu
trúc; muốn chuyển cả dữ liệu/kịch bản cần bản sao `.backup` của database.
Hướng dẫn phần mới: `NANG_CAP_PG3_20261011.md`. Các tên ZIP PG2 trong phần lịch sử
bên dưới chỉ bản đóng gói cũ, không phải phiên bản hiện hành.

## 1 Trạng thái chuyển đổi

Máy chủ là Python FastAPI. CSDL là PostgreSQL có PostGIS. Ranh giới, thống kê,
nguồn cảnh, lớp phủ và các điểm được nhập vào SQL. GeoTIFF, lưới tra cứu và
XYZ vẫn là file cục bộ, được dùng cùng CSDL; chưa có dịch vụ object storage đám mây.
Không có chế độ tự quay lại SQLite. File SQLite và máy chủ cũ được giữ để phục hồi,
không được máy chủ hiện tại mở khi chạy.

Project: `C:\Users\phuhuy\Documents\ChatGPT\gis\mobilegis`.
Trên máy hiện tại đã kết nối thành công PostgreSQL **18.6**, PostGIS **3.6.2**,
cổng **5432**, database **mobilegis**, schema **mobilegis**. Bạn chỉ cần chạy
`START_MOBILEGIS.cmd` và mở đúng địa chỉ được in ra; không cần nhập lại dữ liệu hay
cài lại PostGIS. Phần 2 dành cho thiết lập lại hoặc chuyển sang máy khác.

ZIP RECOVERY và hướng dẫn Word GEE7 trước đây mô tả phiên bản cũ; không dùng chúng
để kết luận kiến trúc CSDL PG2. Tài liệu này thay phần khởi động/lưu trữ của hướng dẫn cũ.

## 2 Dùng PostgreSQL 18 đã cài trên máy

1. Mở **Stack Builder**, chọn PostgreSQL 18 đúng cổng 5432.
2. Chọn **Spatial Extensions → PostGIS Bundle**, tải và cài đúng bản dành cho PG18.
3. Mở pgAdmin, kết nối máy chủ bằng tài khoản quản trị của bạn.
4. Mở Query Tool trên database `postgres`, kiểm tra:

```sql
SELECT name, default_version
FROM pg_available_extensions WHERE name = 'postgis';
```

Có một dòng PostGIS thì phần mở rộng đã sẵn sàng. Không tải gói PG17 vào PG18.
Không cần xoá database, gỡ PostgreSQL hoặc đổi mật khẩu để thực hiện chuyển đổi.

5. Nếu chưa có các thư viện Python của web, chạy **INSTALL_DEPENDENCIES.cmd**.
6. Chạy **CONNECT_EXISTING_POSTGRESQL.cmd**. Nhập host `127.0.0.1`, port `5432`,
   tài khoản quản trị `postgres` và mật khẩu của bạn khi được hỏi. Mật khẩu nhập ẩn.
7. Chương trình tạo database riêng tên `mobilegis`, tạo schema `mobilegis`, nhập dữ
   liệu và tạo tài khoản `mobilegis_app`. Web không sử dụng mật khẩu quản trị.
8. Chạy **START_MOBILEGIS.cmd** rồi mở đúng địa chỉ được in ra. Nhãn mới phải có **PG3**.

Nếu đã có database tên `mobilegis` thuộc một ứng dụng khác, dừng trước khi nhập:
không dùng chung. Script không xoá bảng, không thay password của một role đã tồn tại
khác kết nối và không chuyển dữ liệu bằng cách ghi đè các nguồn đã công bố.

## 3 Môi trường PostgreSQL riêng của project

Để kiểm thử, có thể dùng cluster riêng ở `..\.pg-runtime\cluster`, cổng **55432**,
chỉ lắng nghe `127.0.0.1`. Cluster này không phải dịch vụ PostgreSQL18 cổng5432.
Không tự đổi cổng hoặc mật khẩu của bản PostgreSQL bạn cài.

* `SETUP_POSTGRESQL.cmd`: tạo/nhập CSDL ở môi trường riêng nếu binaries đã chuẩn bị.
* `START_MOBILEGIS.cmd`: mở lại cluster riêng khi cấu hình đang dùng cluster đó,
  sau đó mở máy chủ web. Không nhập lại toàn bộ dữ liệu mỗi lần mở web.
* `scripts/manage_postgres.py status`: kiểm tra phiên bản PostGIS và số dòng.
* `scripts/manage_postgres.py stop`: dừng riêng cluster thử nghiệm, không dừng dịch vụ PG18.

Binaries và thư viện tại `.pg-runtime`/`.pg-libs` là môi trường của máy hiện tại,
không phải dữ liệu nghiên cứu. Nếu chuyển sang máy khác, nên cài PostgreSQL/PostGIS
và chạy INSTALL_DEPENDENCIES, CONNECT_EXISTING_POSTGRESQL trên máy nhận.

Sau khi chuyển sang PostgreSQL 18, file `config/previous-database.local.json`
lưu cấu hình kết nối thử nghiệm trước đó để phục hồi thủ công. File này cũng chứa
mật khẩu ứng dụng, không được chia sẻ. START không khởi động cluster thử nghiệm
khi cấu hình đang trỏ tới dịch vụ PostgreSQL 18.

## 4 Mở trong VS Code

File → Open Folder → chọn thư mục project. Terminal → New Terminal, chạy:

```powershell
.\START_MOBILEGIS.cmd
```

Giữ terminal mở. Ctrl+C dừng máy chủ web; CSDL vẫn có thể chạy. Nếu cổng5379 đang
được bản cũ sử dụng, bản mới chọn cổng khác. Chỉ dùng địa chỉ mới in ở terminal.
Không mở file sqlite3 để kiểm tra CSDL PG2: hãy dùng pgAdmin hoặc tiện ích kết nối
PostgreSQL và chọn database `mobilegis`, schema `mobilegis`.

## 5 Kiểm tra trên pgAdmin

Chọn database `mobilegis` → Query Tool:

```sql
SELECT version(), postgis_lib_version();
SELECT dataset_id, count(*)
FROM mobilegis.unit_observations GROUP BY dataset_id;
SELECT count(*) FROM mobilegis.admin_units; -- 167
SELECT count(*) FROM mobilegis.point_observations; -- 24 điểm theo năm
SELECT count(*) FROM mobilegis.demo_observations; -- 36 trước khi thực hành sửa

SELECT dataset_id, code, year, lst, ndvi, tvdi, lst_coverage
FROM mobilegis.observations_combined
WHERE code = '25942' AND year = 2025
ORDER BY dataset_id;
```

Ba nguồn nghiên cứu có 1.002 dòng/nguồn. GEE gốc để trống Dĩ An năm2025 vì chưa đủ
độ phủ; `gee_recovery` có LST khoảng43,08°C và độ phủ99,19%. Đừng chuyển NULL thành0.

### Ba bảng LST / NDVI / TVDI riêng

Trong pgAdmin: database mobilegis → Schemas → mobilegis → Tables → Refresh.
Chọn lst_observations, ndvi_observations hoặc tvdi_observations → View/Edit Data
→ All Rows để đọc. Tài khoản web chỉ đọc ba bảng này; không chỉnh số nghiên cứu.
Mỗi bảng có 3006 dòng (3 nguồn × 167 khu vực × 6 năm), kể cả giá trị NULL.
Unit_observations giữ thông tin chung; không còn ba cột chỉ số. View
observations_combined kết hợp theo nguồn+mã+năm để so sánh, không lưu bản sao.

```sql
SELECT * FROM mobilegis.lst_observations WHERE dataset_id='gee_recovery' AND code='25942' AND year=2025;
SELECT * FROM mobilegis.ndvi_observations WHERE dataset_id='gee_recovery' AND code='25942' AND year=2025;
SELECT * FROM mobilegis.tvdi_observations WHERE dataset_id='gee_recovery' AND code='25942' AND year=2025;
```

lst: nhiệt độ bề mặt °C; ndvi: chỉ số thực vật; tvdi: độ khô tương đối thử nghiệm.
valid_pixels là số ô hợp lệ, sampled_pixels là tổng mẫu của vùng, coverage là tỷ lệ
0–1 (ví dụ 0,9919 = 99,19%). Ngày ảnh và ranh giới liên kết ở bảng thông tin chung.
CSV bốn điểm và dữ liệu giả lập vẫn tách riêng, không trộn với trung bình xã/phường.

Muốn xem mật khẩu tài khoản **ứng dụng** để nhập vào pgAdmin, tự mở
`config/database.local.json` trên máy. Không chụp màn hình, commit Git hoặc gửi file
này cho người khác. Không có mật khẩu trong schema.sql/JavaScript/tài liệu thiết kế.

## 6 API và sàng lọc TVDI

Khi web đang chạy, mở `/docs` cùng địa chỉ web để xem REST API có thể thử trực tiếp.

* `/api/health`: kết nối và số dòng SQL, không trả mật khẩu.
* `/api/research/observations?source=gee_recovery&year=2025&code=25942`.
* `/api/research/indices/lst?source=gee_recovery&year=2025&code=25942` (thay lst bằng ndvi hoặc tvdi).
* `/api/units?lat=10.41&lon=106.96`: tìm vùng chứa điểm bằng PostGIS.
* `/api/research/alerts?source=gee_recovery&year=2025&threshold=0.8&coverage=0.5`.

Tab **Nguồn** cho biết trạng thái CSDL và cho tải schema/thiết kế. Tab **Phân tích**
có sàng lọc khu vực TVDI cao từ SQL; đổi năm, ngưỡng và độ phủ. Đây là tính năng
khám phá kết quả, không phải hệ thống cảnh báo hạn chính thức. Giá trị trung bình
xã/phường có thể khác phân bố pixel hoặc giá trị tại một điểm.

## 7 An toàn và sao lưu

Tài khoản web chỉ đọc nguồn nghiên cứu; được thêm/sửa/xoá ở bảng thực hành và có
nhật ký do trigger ghi. Web không được trực tiếp thêm/sửa/xoá nhật ký. Không có API
cho sửa kết quả nghiên cứu. Tài khoản quản trị chỉ dùng setup,
import và sao lưu. Mật khẩu quản trị đơn giản cần thay trước khi triển khai mạng.

Dùng **pgAdmin → Backup** database `mobilegis`, chọn format **Custom**. Sao lưu
thêm các thư mục `data` và `public/data/tiles`; backup SQL không chứa TIFF/XYZ.
Trước khi phục hồi, tạo database mới và dùng Restore, không ghi đè CSDL đang dùng.

Vẫn chỉ phục vụ localhost. Chưa triển khai đăng nhập nhiều người, phân quyền theo
người dùng, HTTPS public, GeoServer WMS/WFS hoặc Flutter/APK. Không mở cổng ra
Internet chỉ vì đã có PostgreSQL. Object storage cloud có thể bổ sung sau.

## 8 Các lỗi hay gặp

* **PostGIS chưa được cài:** dùng đúng Stack Builder cho cùng phiên bản PostgreSQL.
* **Không kết nối được:** kiểm tra dịch vụ, host/cổng, password và cấu hình local.
* **Role đã tồn tại:** không tự đổi mật khẩu; kiểm tra role thuộc ứng dụng nào.
* **Nguồn công bố đã thay đổi:** importer chặn nhập đè; cần phiên bản/migration mới.
* **Thiếu Python packages:** chạy INSTALL_DEPENDENCIES, sau đó START lại.
* **Web cũ:** xem Project/cổng/nhãn PG2 và Ctrl+F5; cache mới tách khỏi GEE7/PG1.
* **SQL sẵn sàng nhưng TIFF không tải:** kiểm tra thư mục data đi kèm, không chỉ chép code.

## 9 Gửi project cho người khác

Gói mới `MobileGIS_POSTGRESQL_PG2.zip` gồm mã nguồn, dữ liệu bản đồ, đầu vào nhập SQL,
schema và hướng dẫn. Không chứa mật khẩu, cluster PostgreSQL hoặc SQLite. Giải nén
toàn bộ rồi cài PostgreSQL/PostGIS và Python 3.10 trở lên; chạy INSTALL_DEPENDENCIES,
CONNECT_EXISTING_POSTGRESQL, START_MOBILEGIS. Đây không phải file chạy độc lập chỉ
cần nhấp đúp mà không có CSDL. Snapshot demo trong gói là 36 dòng cũ đã bảo toàn,
không phải backup các lần chỉnh sửa thực hành sau này; cần Backup SQL riêng.

## Tài liệu chính thức

* PostgreSQL Windows: https://www.postgresql.org/download/windows/
* PostGIS Windows: https://postgis.net/documentation/getting_started/install_windows/
* FastAPI: https://fastapi.tiangolo.com/
* Psycopg: https://www.psycopg.org/psycopg3/docs/
