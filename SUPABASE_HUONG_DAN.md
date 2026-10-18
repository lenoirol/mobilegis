# Chuyển cơ sở dữ liệu lên Supabase

Project Supabase: `dramddqxgrcspfcpqnhe` (https://supabase.com/dashboard/project/dramddqxgrcspfcpqnhe).
Ứng dụng giữ nguyên máy chủ FastAPI; chỉ đổi nơi đặt PostgreSQL + PostGIS (28 bảng, khoảng 56 MB, vừa gói miễn phí 500 MB).
**Mật khẩu chỉ nằm trong `config/supabase.local.json` (đã bị Git bỏ qua). Đừng dán vào chat, tài liệu hay mã nguồn.**

## 1. Lấy thông tin trong trang Supabase
1. Mở project → nút **Connect** → chọn **Session pooler** (cổng 5432). Chuỗi có dạng  
   `postgresql://postgres.dramddqxgrcspfcpqnhe:[YOUR-PASSWORD]@aws-0-<vùng>.pooler.supabase.com:5432/postgres`  
   Dùng pooler vì kết nối trực tiếp `db.<ref>.supabase.co` chỉ có IPv6 ở gói miễn phí.
2. Quên mật khẩu database: **Project Settings → Database → Reset database password**.
3. Mật khẩu có ký tự đặc biệt (`@ : / ? # %`) phải mã hóa URL. Cách dễ nhất: đặt mật khẩu chỉ gồm chữ và số, dài từ 20 ký tự.

## 2. Tạo tệp cấu hình riêng
Sao chép `config/supabase.example.json` thành `config/supabase.local.json`, rồi điền:
- `owner_dsn`: chuỗi của user `postgres.dramddqxgrcspfcpqnhe` (chỉ dùng khi chuyển dữ liệu).
- `dsn`: chuỗi của user **`mobilegis_app.dramddqxgrcspfcpqnhe`** với một mật khẩu MỚI do bạn đặt. Script sẽ tạo role `mobilegis_app` với mật khẩu này (quyền tối thiểu, không phải superuser).

## 3. Chuyển dữ liệu
```
.venv/bin/pip install -r requirements-server.txt
.venv/bin/python scripts/migrate_to_supabase.py --backup database/backups/mobilegis_schema4_20261018.backup
```
Script bật PostGIS, tạo role ứng dụng, khôi phục trong **một giao dịch** (lỗi thì hoàn tác hết), cấp quyền tối thiểu, thu hồi quyền của
`anon`/`authenticated`, rồi so số dòng từng bảng với DB trên máy. Cuối cùng phải thấy `KẾT QUẢ: ĐẠT`.
Script **không ghi đè**: nếu schema `mobilegis` đã có trên Supabase nó sẽ dừng. Kiểm tra lại bất cứ lúc nào: `--verify-only`.
Nếu cần xuất bản mới từ DB trên máy:  
`pg_dump -h 127.0.0.1 -p 5433 -U phuhuy -d mobilegis -n mobilegis --no-owner -Fc -f database/backups/ten_moi.backup`

## 4. Chạy ứng dụng với Supabase
```
MOBILEGIS_DB_CONFIG=config/supabase.local.json .venv/bin/python server.py --port 5379 --auto-port
```
Không đặt biến này thì ứng dụng vẫn dùng PostgreSQL trên máy như cũ (DB trên máy không bị đụng tới).
Khi `dsn` có trong tệp, ứng dụng tự dùng bộ gom kết nối (`pool_size` mặc định 6) và đặt `statement_timeout` sau khi kết nối (pooler của Supabase không nhận tham số khởi động).

## Bảo mật
- Không bật **Data API** cho schema `mobilegis` (mặc định chỉ `public` được mở). Script thu hồi quyền `anon`/`authenticated` trên toàn bộ bảng
  và trên `public.spatial_ref_sys` (bảng tham chiếu của PostGIS, đặt ở `public` vì bản xuất tham chiếu `public.geometry`).
- Không dùng khóa `service_role` hay `anon` trong ứng dụng này; ứng dụng chỉ nói chuyện với DB bằng role `mobilegis_app`.
- Quyền ghi (demo, giả lập, tài khoản) vẫn do máy chủ FastAPI kiểm soát. Không mở cổng PostgreSQL ra ngoài chỉ để chia sẻ.
- Lộ mật khẩu: đổi ngay ở Project Settings → Database, rồi sửa tệp `supabase.local.json`.

## Giới hạn cần biết
- Gói miễn phí: dung lượng 500 MB, project bị tạm dừng nếu một tuần không hoạt động, không có sao lưu tự động. Hãy tự `pg_dump` định kỳ.
- Mỗi lời gọi API giờ đi qua Internet nên chậm hơn DB trên máy; bộ gom kết nối giảm phần mở kết nối. Mình mới đo trên bản sao cục bộ (khoảng 40 ms mỗi lần tải 1.002 dòng), **chưa đo với Supabase thật**.
- Dữ liệu trên Supabase là bản chụp. Khi dữ liệu thay đổi (ví dụ bổ sung GEE đợt 2) phải chuyển lại: xóa schema cũ trên Supabase
  (`DROP SCHEMA mobilegis CASCADE;`, chỉ khi bạn chắc chắn) rồi chạy lại bước 3.
- TIFF, tile và lưới tra cứu vẫn nằm trên đĩa của máy chủ, không nằm trong Supabase. Bản demo GitHub Pages vẫn là bản tĩnh.
