# Hướng dẫn MobileGIS 2026.10.PG3 cho người mới

**Lưu ý bản hiện hành PG3:** CSDL đã chuyển sang PostgreSQL/PostGIS và máy chủ
FastAPI. Đọc `DATABASE_POSTGRESQL.md` để khởi động; không dùng SQLite hay ZIP GEE7
cũ để chạy phiên bản này. Nhãn web mới là `2026.10.PG3 · PostGIS`. Đọc
`NANG_CAP_PG3_20261011.md` cho thống kê, giả lập, màu mới và xử lý vùng ảnh trống.
Các phần cài đặt/kiến trúc GEE7 còn lại bên dưới là lịch sử.

Mặc định là **GEE · đã bổ sung 2025**: 167/167 đơn vị có ba chỉ số năm 2025. Bản đồ, bảng và phân tích dùng cùng nguồn được chọn. Chọn **GEE · bản gốc** để thấy 5 phường trước bổ sung vẫn trống. Bộ xử lý cũ là nguồn riêng. Không cần chạy lại GEE hoặc batch 2. ZIP mới có tên `MobileGIS_GEE_2020_2025_RECOVERY.zip`.

Thử tìm mã **25942 (Dĩ An)** năm 2025: bản bổ sung có LST 43,08°C, NDVI 0,25, TVDI 0,72 và độ phủ LST 99,2%; bản gốc có 4,7% độ phủ nên để trống. Ngày cảnh bổ sung là 28/02/2025; 1.403 ô mới và 70 ô gốc được tính chung. Không phải nhiệt độ không khí hoặc trung bình cả năm. TVDI chưa được kiểm định hạn hán.

## Mở đúng bản mới

Thư mục đang cập nhật trên máy: `C:\Users\phuhuy\Documents\ChatGPT\gis\mobilegis`. Đây không phải thư mục cũ trong Downloads. Mở `START_MOBILEGIS.cmd` tại thư mục mới và giữ cửa sổ mở. Sao chép địa chỉ sau chữ **MobileGIS:** vào Chrome/Edge, thông thường `http://127.0.0.1:5379/`. Nếu cổng có máy chủ cũ, bản mới tự chọn cổng khác. Không dùng lại địa chỉ đã lưu mà chưa kiểm tra.

Góc trên bên phải hiện **2026.10.GEE7 · 167 đơn vị**. Rê chuột lên đó để thấy đường dẫn project thực tế. Địa chỉ và cổng lấy từ cửa sổ máy chủ. Nếu trang chưa đổi, tải lại mạnh bằng Ctrl+F5. Không nhấp đúp `index.html` để chạy; chương trình cần máy chủ Python để đọc dữ liệu. Khi xong, đóng cửa sổ máy chủ hoặc Ctrl+C. Không đóng cửa sổ khi vẫn cần xem ứng dụng.

ZIP chạy gọn: giải nén toàn bộ vào thư mục mới trước khi mở file CMD. Cần Python 3; trên máy hiện tại đã có. Đừng chỉ sao chép `server.py` hay thư mục `public` vì tra cứu ô mẫu và tải GeoTIFF cần thư mục `data`.

## Bài thực hành 1 — đọc bản đồ nhiệt độ

1. Mở tab **Bản đồ**, giữ bộ **Landsat thực · 167 đơn vị** và nút **LST**.
2. Chọn mốc 2025, chế độ **Phân bố chỉ số**. Thu gọn công cụ/thông tin để có nhiều diện tích bản đồ; nút **⌖ Toàn vùng** đưa về phạm vi nghiên cứu.
3. Đọc thanh màu: 20–45°C là thang hiển thị cố định theo tài liệu giáo viên. Vùng không màu/xám có thể thiếu dữ liệu, không phải nhiệt độ bằng 0. Số ngoài thang màu vẫn được giữ trong TIFF và bảng.
4. Tìm **Bến Thành** hoặc mã **26743**, chọn kết quả. Xem LST, NDVI, TVDI, ngày chụp và số pixel hợp lệ. Bấm **+** trên thẻ thông tin nếu đang thu gọn.
5. Chạm bản đồ: dòng màu vàng ghi tọa độ và giá trị ô mẫu gần vị trí chạm. Đây là giá trị mẫu, **khác trung bình xã/phường** trong ba ô phía trên. Chạm vùng nước/mây có thể báo thiếu dữ liệu.
6. Bấm **Tải GeoTIFF** nếu cần mở lớp số trong QGIS. GeoTIFF có tọa độ và giá trị pixel; JPG chỉ là minh họa.

**LST** là nhiệt độ bề mặt đất/vật thể theo ảnh vệ tinh, không phải nhiệt độ không khí từ trạm thời tiết. Các ảnh ghép có ngày chụp khác nhau giữa vùng; mốc “2025” không có nghĩa quan trắc liên tục cả năm.

## Bài thực hành 2 — cây xanh và lớp phủ đất

Chọn **NDVI** để xem tương phản thực vật. NDVI từ −1 đến 1; giá trị dương cao thường gắn với thực vật khỏe/dày, nhưng **không phải phần trăm cây xanh** và không xác định loại cây. Nước/đất/vùng xây dựng cần bối cảnh để đọc đúng.

Đánh dấu **Lớp phủ đất ESA · năm 2021** để thay lớp chỉ số bằng bản phân loại. Chú giải ghi cây thân gỗ, khu xây dựng, trồng trọt, nước, ngập nước, rừng ngập mặn… Lớp này cố định 2021, không đổi thành lớp phủ 2025 khi kéo thanh năm. Trong thẻ khu vực có ba lớp chiếm tỷ lệ lớn nhất. Tỷ lệ là số ô lấy mẫu được phân loại, không phải số đo diện tích địa chính. Bỏ dấu để quay lại chỉ số.

**TVDI** thể hiện mức khô tương đối từ quan hệ NDVI–LST; bản này là tính toán thử nghiệm, loại nước và có vùng thiếu. Không tự chuyển màu đỏ thành kết luận hạn hán hoặc dự báo mất mùa. Cần giảng viên rà soát rìa ướt/khô, cảnh ảnh và đối chứng thực địa.

## Bài thực hành 3 — so sánh hai thời điểm

Bỏ chọn lớp phủ đất, chọn **Phân bố chỉ số**, đánh dấu **So sánh kéo màn hình 2020 / năm chọn**. Kéo thanh phân chia: bên trái là 2020, bên phải là năm trên thanh mốc. Giữ cùng chỉ số và độ đậm để đọc tương phản. Năm chọn 2020 sẽ trùng hai bên, đây không phải lỗi.

Để xem hiệu số, chọn **Thay đổi 2020 → 2025**. Năm được khóa 2025; xanh là giảm, đỏ là tăng, trắng gần 0, trống là thiếu cặp mẫu. Chỉ so sánh những ô có dữ liệu ở cả hai năm. Chênh lệch °C là số tuyệt đối; NDVI/TVDI cũng là hiệu số tuyệt đối, không phải phần trăm.

Thẻ khu vực có **Δ trung bình** lấy từ hai trung bình vùng. Tập pixel hợp lệ hai năm có thể khác, nên số này không bắt buộc bằng trung bình của lớp Δ. Không quy mọi chênh lệch cho đô thị hóa: ngày chụp, mùa, mây và rìa TVDI cũng ảnh hưởng.

## Bài thực hành 4 — kiểm tra dữ liệu có đủ không

Chọn **Độ phủ dữ liệu từng khu vực**. Màu biểu diễn phần ô mẫu hợp lệ trong đơn vị theo chỉ số/năm chọn. 100% nghĩa đủ ô trên lưới đã lấy mẫu, **không phải chính xác 100%**. Trung bình ít hơn 5 ô hoặc độ phủ dưới 10% được giữ trống. Đọc thận trọng khi dưới 50%.

Năm 2025 có năm đơn vị thiếu cả ba trung bình: Dĩ An, Tân Đông Hiệp, Đông Hoà, Thuận Giao và An Phú. Không điền 0 hoặc dùng CSV điểm khác thay thế để làm bản đồ “đủ màu”.

## Tab Phân tích

Phần đầu là **167 xã/phường Landsat**: chọn chỉ số, năm và độ phủ tối thiểu. Xem số đơn vị đủ ngưỡng, nhóm giá trị cao, biểu đồ LST–NDVI. Chạm chấm để đọc tên/giá trị; tương quan không chứng minh nguyên nhân. Nút **Bản đồ** tại bảng đưa tới vùng tương ứng.

So sánh chuỗi tối đa bốn đơn vị. Thêm qua danh sách hoặc nút **+ Thêm vào so sánh** trên thẻ bản đồ; bấm tên có dấu × để bỏ. Tải SVG để chèn báo cáo. Dữ liệu thiếu tạo khoảng trống, không tự nối hoặc nội suy. Trục cùng thang cho các chuỗi.

Phần tiếp theo giữ **bốn điểm CSV nhóm cung cấp** và **năm ảnh GEE của nhóm**. Đây là nguồn riêng: số điểm không phải trung bình hành chính, ảnh GEE thí điểm ghi TP.HCM cũ. Script xuất mới chuẩn bị không phải script gốc tạo ra ảnh/CSV đó, nên chưa chứng minh hai nguồn khớp nhau.

## Tab Dữ liệu và Nguồn

Tab **Dữ liệu** chọn đúng bộ, gõ tên/mã, lọc năm. **Xuất bảng đã lọc** chỉ tải các dòng đang lọc; **Xuất toàn bộ** giữ toàn bộ bộ đang chọn. Ô “—” là thiếu dữ liệu. Chỉ bộ thực hành demo có thêm/sửa/xóa/nhập; không sửa trực tiếp bộ thực.

Tab **Nguồn** có ngày/mã cảnh, phương pháp, giới hạn và file gốc. Đọc ghi công ESA WorldCover khi đưa bản đồ vào báo cáo. Tải hướng dẫn GEE, script và ZIP ranh giới từ phần bổ sung ở cuối.

## Dùng ảnh nền và điện thoại

Ảnh nền vệ tinh cục bộ 2020/2025 là màu tự nhiên Landsat đã lấy mẫu 120 m. Tắt **Hiển thị lớp chỉ số** để nhìn ảnh nền rõ hơn. Ảnh có lỗ mây/NoData; phóng to không tạo chi tiết 30 m. Chọn **Đường phố OpenStreetMap** nếu có Internet; nếu không tải được thì quay lại ảnh cục bộ hoặc nền nhẹ.

Trên điện thoại, công cụ có thể thu gọn để ưu tiên bản đồ. Đây là **web/PWA**, chưa phải APK. Muốn mở qua cùng Wi-Fi phải cấu hình máy chủ LAN có chủ đích; địa chỉ 127.0.0.1 chỉ dùng trên máy đang chạy. Không tự mở máy chủ ra Internet. GPS cần người dùng cấp quyền và HTTPS/localhost; HTTP LAN có thể không dùng GPS.

Bộ nhớ đệm chỉ lưu tài nguyên/mảnh đã mở; chưa phải gói tải offline toàn vùng. Khi mất máy chủ, dữ liệu chưa tải và tra cứu ô mẫu có thể không hoạt động. Còn khi chỉ mất Internet nhưng máy chủ vẫn chạy trên máy tính này, các lớp cục bộ vẫn dùng được.

## Xuất bổ sung dữ liệu GEE

Bạn đã gửi đủ file 2020–2025 và WorldCover 2021, đã tích hợp. **GEE_2020_2024.md** giữ quy trình xuất để tham khảo, không phải bước còn bắt buộc. Khi tái xuất một bộ khác, giữ đủ TIFF và hai CSV mỗi năm, nhập thành phiên bản riêng; không chép đè CSV nguồn cũ hoặc file gốc đã bảo toàn. Không cần đưa mật khẩu hay khóa tài khoản.

## Cách ghi kết quả vào báo cáo

Ghi nguồn, phạm vi 167 đơn vị (không Côn Đảo), ngày ảnh, lưới mẫu 120 m, cách tổng hợp và giới hạn TVDI. XYZ là dạng hiển thị đã bổ sung. Không gọi ảnh chụp thành raster có tọa độ; không gọi kiểm thử trình duyệt thành khảo sát người dùng hay thử Android thật. Các kiểm thử tự động và giao diện được ghi tại `verification/UPDATE_2026_10.md`.
# Cập nhật 2026.10.GEE6

Mặc định demo dùng bộ **GEE đủ 2020–2025 đã kiểm tra**. Chọn “Nguồn Landsat nghiên cứu” ở Bản đồ, hoặc “Nguồn Landsat” ở Dữ liệu/Phân tích để chuyển sang bộ xử lý cũ 2020–2025. Tuyệt đối không coi hai bộ là một chuỗi thống nhất.

GEE đủ sáu năm: kéo thanh năm 2020–2025 hoặc bấm **Phát diễn biến** trong chế độ Phân bố chỉ số. Bật **So sánh kéo màn hình** để xem GEE 2020 bên trái và năm chọn bên phải; kéo thanh chia để đối chiếu. Chọn **Thay đổi 2020 → 2025** để xem 2025 trừ 2020 chỉ trên các cặp ô có số ở cả hai năm. Bảng GEE có 1.002 dòng: mỗi năm 2020–2024 có 167 đơn vị đạt ngưỡng, 2025 có 162, 5 dòng thiếu giữ trống. Độ phủ nằm trong 0–100%, tính trực tiếp từ TIFF theo tâm pixel. Phóng to không tạo thêm độ chi tiết so với lưới 120 m.

WorldCover là năm **2021**, thống kê GEE trên lưới 10 m, hiển thị tile lấy mẫu khoảng 30 m; không phải lớp phủ 2025. Link GeoTIFF chỉ số GEE tải cả **3 band theo thứ tự NDVI, LST, TVDI**, vùng thiếu = -9999. Link WorldCover GEE tải bản 10 m đã chuẩn hóa NoData=0. Tab Nguồn có CSV hiệu chỉnh, metadata và các file GEE gốc.

Bấm **Thu gọn chú giải** để nhìn phần bản đồ bị bảng màu che; bấm **Hiện chú giải** để mở lại. Trên điện thoại, mở **Công cụ** khi cần tìm xã/phường, đổi lớp hoặc nguồn; nút **+** trong bảng thông tin mở số liệu khu vực.

Khởi động từ START_MOBILEGIS.cmd trong đúng thư mục bản mới; xem địa chỉ và phiên bản cửa sổ in ra, không dùng tab server cũ đang mở. Gói đầy đủ là **MobileGIS_GEE_2020_2025.zip**. Chi tiết kiểm tra nằm ở `verification/GEE_2020_2025.md`.

