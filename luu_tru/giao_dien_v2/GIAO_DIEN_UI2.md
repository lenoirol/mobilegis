# Giao diện mới (UI2) · MobileGIS TP.HCM

Giao diện được xây lại hoàn toàn: tối giản hiện đại pha brutalism nhẹ. Máy chủ, API và cơ sở dữ liệu không đổi.
Bản giao diện cũ được lưu ở `luu_tru/giao_dien_cu/` (không xóa).

## Phong cách
- **Màu:** giấy kem `#f7f3e8`, mực đen `#0e0e0c`, vàng tín hiệu `#ffd60a` (theo yêu cầu "sáng, tươi, vàng hơn, tương phản cao").
  Màu dữ liệu LST/NDVI/TVDI trên bản đồ giữ đúng bảng màu trong tài liệu của cô (`public/js/core/format.js`).
- **Chữ:** Bricolage Grotesque (tiêu đề, giao diện) và JetBrains Mono (số liệu, nhãn nhỏ), tự lưu trong `public/fonts/`
  (giấy phép OFL, có tiếng Việt, dùng được khi ngoại tuyến).
- **Brutalism nhẹ:** viền mực 2 px, bóng đổ cứng, nhãn mono viết hoa, nút "ấn xuống" khi bấm.
- **Chuyển động:** màn hình khởi động có thanh tiến trình, chuyển cảnh View Transitions giữa các màn hình,
  tab trượt, số đếm chạy lên, biểu đồ vẽ dần, bảng kéo trên điện thoại, skeleton khi tải.
  Tôn trọng `prefers-reduced-motion`.
- **Bố cục:** máy tính có thanh điều hướng trên cùng; điện thoại có thanh tab dưới đáy và bảng thông tin kéo lên từ đáy.

## Cấu trúc (không cần công cụ build, ES modules thuần)
```
public/
  index.html            vỏ ứng dụng + màn hình khởi động
  login.html, admin.html   đăng nhập / quản trị (cùng hệ thiết kế)
  styles/               base.css (hệ thiết kế) · map.css · views.css · charts.css · auth.css
  fonts/                font tự lưu
  js/main.js            khởi động, router (#/ban-do, #/bang-so-lieu, #/thong-ke, #/gia-lap, #/du-lieu)
  js/core/              dom, format (bảng màu), store, api (phiên + CSRF), data (tải/đệm), motion
  js/ui/                charts (thư viện biểu đồ SVG), seg (nút chọn trượt), toast, account
  js/views/             map (+ map-engine, map-dock, map-detail), table, stats, scenario, about
  viewer-policy.js      quy tắc hiển thị (độ phủ ≥ 50%, không nối qua mốc thiếu); có test Node
  sw.js                 bộ nhớ đệm ngoại tuyến (PWA)
```
Mỗi màn hình là một module `init(section, ctx)` / `show(params)` / `hide()`; thêm màn hình mới chỉ cần thêm một dòng vào `ROUTES` trong `main.js`.
Liên kết chia sẻ: `#/ban-do?chi-so=tvdi&nam=2023&khu-vuc=27664&che-do=zones` (nút chia sẻ trên bản đồ tạo sẵn).

## Quy tắc khoa học vẫn giữ nguyên
Ô thiếu là "—" chứ không phải 0; vùng độ phủ < 50% tô xám nét đứt; biểu đồ không nối qua mốc thiếu; nguồn mặc định
`gee_recovery`, nếu không tải được thì báo lỗi rõ ràng chứ không âm thầm dùng nguồn cũ; TVDI luôn ghi "thử nghiệm";
giả lập tách khỏi hiện trạng và chỉ quản trị viên được tạo.

## Kiểm thử
- `python -m unittest discover -s tests` và `node --test tests/viewer-policy.test.cjs` (API, DB, quy tắc hiển thị).
- `tests/e2e_ui.py`: chạy Chrome thật bằng Playwright qua toàn bộ màn hình (khách, quản trị, điện thoại 390 px).
  Cần máy chủ đang chạy và `.venv/bin/pip install playwright`. Xem đầu tệp để biết cách chạy.

## Demo tĩnh trên GitHub Pages
Mọi đường dẫn trong giao diện là **tương đối** (hàm `url()` trong `js/core/api.js`), nên cùng một mã chạy ở `/` (máy chủ thật) và ở
`/mobilegis/` (GitHub Pages). Khi không có `api/health`, ứng dụng tự vào chế độ tĩnh (`body.is-static`):
ẩn đăng nhập và điểm thực hành, tắt giả lập và thống kê theo pixel; tra cứu ô vẫn chạy nhờ các khối lưới trong `data/query/` (hiện thông báo), còn tương quan và sàng lọc TVDI tính ngay
trong trình duyệt từ số liệu khu vực. Quy trình xuất bản: `.github/workflows/pages.yml` (bật Pages với nguồn "GitHub Actions").
Kiểm thử tĩnh cục bộ: phục vụ `public/` bằng `python -m http.server` ở một thư mục cha tên `mobilegis`.
