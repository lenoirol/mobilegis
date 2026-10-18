# Bổ sung năm 2025 · Đợt 2 (GEE)

**Mục tiêu:** lấp thêm các ô còn trống hoàn toàn trong 31 khu vực của năm 2025 bằng ảnh Landsat **khác** trong cùng mùa khô
(tháng 1–4/2025), cùng mặt nạ chất lượng, cùng lưới 120 m như đợt 1. Không nội suy, không dùng ảnh 2026, không ghi đè ô đã có.

## Đã chuẩn bị sẵn (chưa đổi dữ liệu nào)
| Tệp | Việc |
|---|---|
| `scripts/plan_gee_batch2.py` | đếm ô trống hoàn toàn theo khu vực, chọn mục tiêu (≥ 10% ô trống) |
| `verification/GEE_2025_batch2_targets.json` | 31 khu vực mục tiêu, tối đa ~27.960 ô có thể lấp, 8 cảnh đã dùng |
| `scripts/gee_recover_2025_batch2.js` | script GEE đợt 2 |
| `scripts/review_gee_recovery.py --batch 2` | kiểm tra file trả về và tạo bản ghép riêng, dựa trên bản đợt 1 |

13 khu vực khác chỉ thiếu **từng phần băng** (ví dụ có LST nhưng thiếu TVDI); kiểu bổ sung "chỉ lấp ô trống hoàn toàn" không sửa được và script không đụng tới chúng.

## Bạn làm trên GEE
1. Vào code.earthengine.google.com, tạo script mới, dán toàn bộ nội dung `scripts/gee_recover_2025_batch2.js`.
2. Kiểm tra dòng đầu: `UNIT_ASSET` đúng tài sản của bạn, `FOLDER` đúng tên thư mục Drive (tên, không phải ID).
3. Bấm **Run**. Cửa sổ Console in số khu vực mục tiêu (31) và **số cảnh ứng viên (0–4)**.
   - Nếu số cảnh = 0: dừng. Nghĩa là không còn cảnh nào có ô sạch ở chỗ đang trống, và không nên nới lỏng mặt nạ để lấp cho đủ.
4. Tab **Tasks** → bấm **Run** cả 3 tác vụ: `MobileGIS_recovery_2025_batch2_120m`, `_scenes`, `_diagnostics`.
5. Tải 3 file từ Drive về máy rồi gửi mình đường dẫn thư mục.

Nếu GEE báo lỗi (hết bộ nhớ, quá thời gian…), gửi nguyên văn lỗi. Cách xử lý đầu tiên là rút `TARGET_CODES` xuống 8–10 khu vực đầu danh sách.

## Mình làm khi nhận file (sẽ hỏi bạn trước khi ghi)
1. `review_gee_recovery.py --batch 2` kiểm tra file (ngày cảnh, miền giá trị, mặt nạ 5 băng, lưới) và ghép vào **thư mục mới**, không ghi đè.
2. Báo cáo trước/sau từng khu vực để bạn quyết định có dùng không.
3. Nếu đồng ý: sao lưu PostgreSQL, tạo lại tile/lưới tra cứu năm 2025 và lớp chênh lệch, cập nhật nguồn `gee_recovery`, nhập lại vào DB, chạy lại toàn bộ test.
   Phần xuất bản đợt 2 sẽ được viết và kiểm thử lúc đó, vì cần xem kết quả thực.

## Giới hạn cần nói thật
- Script **chưa được chạy trên GEE** (chỉ kiểm tra cú pháp và logic cục bộ bằng test giả lập). Có thể phải chỉnh sau lần chạy đầu.
- Chưa biết sẽ lấp được bao nhiêu ô; có thể ít, vì mây/mặt nạ chất lượng ở các cảnh khác cũng có thể trùng chỗ.
- Ô lấp từ cảnh khác ngày, mỗi cảnh có phép khớp TVDI riêng; báo cáo phải ghi rõ điều này, và chuỗi vẫn không phải trung bình năm.
