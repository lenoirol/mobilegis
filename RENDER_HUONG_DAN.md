# Đưa MobileGIS lên Internet: Render + Supabase (miễn phí)

Kết quả: một địa chỉ dạng `https://mobilegis-xxxx.onrender.com` có **đủ chức năng** (bản đồ, bảng, thống kê, giả lập, đăng nhập, quản trị).
Giao diện và API chạy chung một chỗ trên Render; cơ sở dữ liệu nằm trên Supabase (đã chuyển xong). Trang GitHub Pages vẫn là bản demo tĩnh.

> **Chi phí:** 0 đồng. Đổi lại: Render miễn phí **ngủ sau 15 phút không ai truy cập** và mất khoảng 1 phút để thức dậy; Supabase miễn phí bị **tạm dừng sau 1 tuần không hoạt động** (bấm *Restore* trong trang Supabase để bật lại).
> Các gói miễn phí có thể đổi chính sách; kiểm tra lại trang giá của Render và Supabase trước khi dùng cho việc quan trọng.

Cần có trước: tài khoản GitHub (đã có), tài khoản Supabase (đã có), một địa chỉ email để đăng ký Render. Thời gian: khoảng 30–40 phút.

---

## Bước 1 · Việc cần làm ở Supabase

**1.1 Khu vực (region) của project**
Project của bạn ở **Sydney (`ap-southeast-2`)** (mình đã kiểm tra bằng cách thử kết nối). Bạn có thể xem lại ở https://supabase.com/dashboard/project/dramddqxgrcspfcpqnhe → **Project Settings** (bánh răng) → **General** → mục *Region*.
Render không có khu vực Sydney, nên ở bước 4 chọn **Singapore** (gần Sydney nhất).

**1.2 Đổi mật khẩu database (nên làm, vì mật khẩu cũ đã xuất hiện trong chat)**
**Project Settings → Database → Database password → Reset database password**. Đặt mật khẩu mới chỉ gồm chữ và số, dài từ 20 ký tự, và lưu vào nơi an toàn.
Sau đó mở tệp `config/supabase.local.json` trên máy, sửa mật khẩu trong dòng `owner_dsn` (phần giữa `postgres:` và `@`). Ứng dụng trên Render **không bị ảnh hưởng** vì nó dùng role `mobilegis_app` với mật khẩu riêng.

**1.3 Host của Session pooler**
Host của project bạn là: **`aws-0-ap-southeast-2.pooler.supabase.com`** (mình đã thử nối thật bằng role ứng dụng và thành công).
Nếu muốn tự xem trong trang Supabase: bấm nút **Connect** ở thanh trên cùng của trang project → chọn **Session pooler** → chuỗi kết nối có dạng
`postgresql://postgres.dramddqxgrcspfcpqnhe:[YOUR-PASSWORD]@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres`; **host là phần nằm giữa dấu `@` và `:5432`**.
(Giao diện Supabase đôi khi đổi chỗ; nếu không thấy nút Connect, vào Project Settings → Database → *Connection string*.)
Vì sao không dùng địa chỉ trực tiếp `db.<mã>.supabase.co`: Render không nối được qua IPv6, còn pooler thì có IPv4.

## Bước 2 · Tạo chuỗi kết nối cho Render (trên máy bạn)

Mở Terminal, vào thư mục project và chạy (thay host bằng host ở bước 1.3):
```
cd ~/Desktop/mobilegis
.venv/bin/python scripts/supabase_render_dsn.py --host aws-0-ap-southeast-2.pooler.supabase.com
```
Script đọc mật khẩu role ứng dụng trong `config/supabase.local.json`, **sao chép chuỗi kết nối vào clipboard** và chỉ in bản che mật khẩu (`********`).
Đừng dán chuỗi này vào chat, GitHub hay tài liệu. Cứ để đó, bước 4 bạn dán (Cmd+V) vào Render.

## Bước 3 · Tạo tài khoản quản trị trên Supabase

Trong Terminal (vẫn ở thư mục project):
```
MOBILEGIS_DB_CONFIG=config/supabase.local.json .venv/bin/python scripts/create_admin.py --email EMAIL_CỦA_BẠN --name "Tên của bạn"
```
Script hỏi mật khẩu quản trị (ẩn khi gõ). Chọn mật khẩu mạnh, ít nhất 12 ký tự và **khác** mật khẩu database. Đây là tài khoản bạn dùng đăng nhập vào trang quản trị trên Internet.

## Bước 4 · Tạo dịch vụ trên Render

1. Vào https://render.com → **Get Started** → đăng ký bằng **GitHub** (dễ nhất vì cùng tài khoản `lenoirol`).
2. Trên bảng điều khiển: **New +** → **Blueprint**.
3. Render hỏi quyền truy cập GitHub: chọn **Only select repositories** → `lenoirol/mobilegis` → *Install/Authorize*.
4. Chọn kho `mobilegis`. Render đọc tệp `render.yaml` và hiển thị dịch vụ **mobilegis** (Web Service, gói **Free**, khu vực **Singapore**).
5. Ở ô **MOBILEGIS_DATABASE_URL**: bấm vào, **dán (Cmd+V)** chuỗi đã sao chép ở bước 2.
6. Kiểm tra lại: Region = Singapore (Render không có Sydney), Instance Type = **Free**. Bấm **Apply** / **Deploy Blueprint**.
7. Đợi build (thường 5–10 phút, vì kho có dữ liệu bản đồ nặng). Mở tab **Logs**. Thành công khi thấy dòng
   `MobileGIS: http://0.0.0.0:...` rồi trạng thái chuyển **Live**.
8. Địa chỉ nằm ở đầu trang dịch vụ, dạng `https://mobilegis-xxxx.onrender.com`.

*Nếu Blueprint báo lỗi*, tạo thủ công: **New + → Web Service** → chọn kho `mobilegis` → Language **Python 3** → Region Singapore →
Build Command `pip install -r requirements-server.txt` → Start Command `python server.py --host 0.0.0.0 --port $PORT` → Instance Type **Free**
→ mục **Environment** thêm 4 biến: `MOBILEGIS_DATABASE_URL` (dán chuỗi bước 2), `PYTHON_VERSION` = `3.12.7`, `MOBILEGIS_DB_POOL_SIZE` = `4`, `MOBILEGIS_CACHE_SECONDS` = `3600` → **Create Web Service**.

## Bước 5 · Kiểm tra

Lần đầu mở có thể mất khoảng 1 phút (dịch vụ đang thức dậy). Mở lần lượt:
1. `https://địa-chỉ-của-bạn/api/ping` → thấy `{"ok":true}`.
2. `https://địa-chỉ-của-bạn/api/health` → thấy `"status":"ok"`, PostgreSQL 17, PostGIS 3.3.7, schema 4.
3. Trang chủ: bản đồ hiện, chip trên đầu ghi **GEE · đã bổ sung 2025** (không còn ghi "demo tĩnh").
4. Bấm **Đăng nhập** → vào bằng tài khoản quản trị ở bước 3 → mở **Trang quản trị** và tab **Giả lập**.
5. Thử đăng ký một tài khoản khách hàng bằng email khác để thấy luồng đăng ký.

## Nếu có lỗi

| Dấu hiệu | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Logs: `Không thể khởi động: PostgreSQL/PostGIS chưa sẵn sàng` | Chuỗi kết nối sai hoặc Supabase đang tạm dừng | Kiểm tra Supabase có đang *Paused* không (bấm Restore); làm lại bước 2 |
| `Tenant or user not found` | Sai host pooler, mã project hoặc tên role | Chép lại host ở bước 1.3; tên role phải là `mobilegis_app.dramddqxgrcspfcpqnhe` |
| `password authentication failed` | Mật khẩu role ứng dụng không khớp | Chạy lại `supabase_render_dsn.py`, dán lại vào biến môi trường rồi *Manual Deploy → Deploy latest commit* |
| `Network is unreachable` hoặc timeout | Đang dùng địa chỉ trực tiếp IPv6 | Dùng host **pooler** (bước 1.3), không dùng `db.<mã>.supabase.co` |
| Build lỗi hết bộ nhớ | Gói miễn phí giới hạn RAM | Thử *Clear build cache & deploy* trong menu Manual Deploy; gửi mình đoạn log |
| Trang rất chậm lần đầu mỗi lần | Dịch vụ ngủ do không ai dùng | Bình thường ở gói miễn phí; mở trước vài phút khi cần demo |
| Đăng nhập xong vẫn như chưa đăng nhập | Đang mở bằng `http://` thay vì `https://` | Luôn dùng địa chỉ `https://…onrender.com` |

Gửi mình **đoạn log lỗi** (chỉ chép vài dòng cuối, đã không có mật khẩu) nếu cần hỗ trợ.

## Giữ cho dịch vụ không ngủ (tùy chọn)
Dùng dịch vụ ping miễn phí như UptimeRobot, gọi `https://địa-chỉ-của-bạn/api/ping` mỗi 5 phút. Cách này dùng khoảng 744 giờ/tháng, vừa sát hạn mức 750 giờ của một dịch vụ miễn phí. Chỉ nên bật khi cần, và **không** ping `/api/health` (nó truy vấn Supabase mỗi lần).

## Bảo mật cần nhớ
- Không dán mật khẩu hay chuỗi kết nối vào chat, tài liệu hay GitHub. Chúng chỉ nằm trong `config/supabase.local.json` (máy bạn) và biến môi trường của Render.
- Ai cũng đăng ký được tài khoản khách hàng; **chỉ quản trị viên** (bạn) được thêm dữ liệu thực hành, tạo giả lập và quản lý tài khoản. Không cấp quyền quản trị cho người lạ.
- Mỗi khi đổi dữ liệu gốc (ví dụ bổ sung GEE đợt 2): chuyển lại dữ liệu lên Supabase (xem `SUPABASE_HUONG_DAN.md`), rồi khởi động lại dịch vụ trên Render để xóa bộ nhớ đệm.
