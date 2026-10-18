# MobileGIS TP.HCM — ứng dụng Android (React Native)

Bản thử nghiệm MobileGIS theo đề cương nhóm 6: xem diễn biến **nhiệt độ bề mặt (LST), độ xanh (NDVI) và độ khô (TVDI)** của **167 xã/phường TP.HCM sau sáp nhập (không gồm Côn Đảo)**, mùa khô 2020–2025, từ ảnh Landsat 8/9.

## Chức năng
App giờ có **mọi thứ như bản web** (theo yêu cầu của nhóm), không chỉ phạm vi tối thiểu của đề cương. Phần ngoài Bảng 5.1 là phần mở rộng.

| Nhóm | Chức năng | Trong app |
|---|---|---|
| Bắt buộc (Bảng 5.1) | Bản đồ nền, 3 lớp, bật/tắt lớp, chú giải, chọn mốc thời gian, chạm xem thông tin khu vực | Có |
| Dự kiến | Vị trí hiện tại bằng GPS; biểu đồ biến động khu vực | Có |
| Nếu còn thời gian | Cảnh báo độ khô ≥ 0,8 (thử nghiệm); lưu tạm để xem khi mạng yếu | Có |
| Mở rộng (như web) | Chế độ xem Chi tiết / Xã-phường / Thay đổi / Độ tin cậy; lớp phủ đất; nền vệ tinh, nền nhẹ, ảnh 2020/2025; độ đậm lớp; bản đồ định vị; phát theo năm; tra cứu ô 120 m; chia sẻ | Có |
| Mở rộng (như web) | Bảng số liệu + bảng tổng; Thống kê (phân bố, hộp, so sánh khu vực, tương quan, sàng lọc độ khô); xuất CSV | Có |
| Mở rộng (như web) | Đăng ký, đăng nhập, quên mật khẩu (mã do admin cấp), đổi mật khẩu; trang quản trị; kịch bản giả lập (admin) | Có |
| Ngoài phạm vi (đề cương) | WebGIS, dự báo AI, thời gian thực, hệ thống hỗ trợ quyết định | Không làm; giả lập chỉ là giả định, không phải dự báo |

## Giao diện
Dùng lại hệ thiết kế của web: phông **Bricolage Grotesque** và **JetBrains Mono** (đóng gói trong app), cùng bảng màu, viền 2 px, đổ bóng cứng, bộ biểu tượng, đường cong chuyển động (`cubic-bezier(.2,.8,.2,1)`), màn hình khởi động, thanh tab có miếng vàng trượt, các hiệu ứng xuất hiện, đếm số, vẽ đường biểu đồ, skeleton, toast, hộp thoại. Mã ở `src/ds/`.

## Cách app lấy dữ liệu
- **Số liệu theo xã/phường đọc từ cơ sở dữ liệu (Supabase) qua API của máy chủ** (`/api/research/observations`), đã đối chiếu: 1.002 dòng, trùng hoàn toàn với tệp xuất sẵn. Tệp tĩnh chỉ là phương án dự phòng khi API không trả lời; bản sao cuối cùng lưu trong máy.
- Thống kê pixel, tương quan, sàng lọc, tra cứu ô, đăng nhập, quản trị đều gọi API (`src/lib/api.ts`). Ứng dụng **không** giữ mật khẩu cơ sở dữ liệu; chỉ máy chủ kết nối Supabase.
- Ranh giới, danh mục lớp, tile PNG: tệp tĩnh trên cùng máy chủ (`src/lib/config.ts`, hiện `https://mobilegis-93u9.onrender.com`). Nền bản đồ là OpenStreetMap (hoặc ảnh Esri khi chọn "Vệ tinh").
- Máy chủ miễn phí của Render ngủ sau 15 phút không dùng; lần mở đầu có thể chờ khoảng 1 phút.

## Công nghệ
Expo SDK 58, React Native 0.88, Expo Router, `@maplibre/maplibre-react-native` 11, `expo-location`, `react-native-svg`. Mã logic (độ tin cậy, 5 mức độ khô, câu mô tả khu vực) được chuyển từ bản web để hai bản cho kết quả giống nhau.

## Cài môi trường (macOS, Apple Silicon)
```
brew install openjdk@17
brew install --cask android-commandlinetools
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export ANDROID_HOME=$HOME/Library/Android/sdk
export ANDROID_SDK_ROOT=$ANDROID_HOME
sdkmanager --sdk_root=$ANDROID_HOME "platform-tools" "emulator" "platforms;android-36" "build-tools;36.0.0" "cmdline-tools;latest" "system-images;android-36;google_apis;arm64-v8a"
avdmanager create avd -n MobileGIS_pixel_6 -k "system-images;android-36;google_apis;arm64-v8a" -d pixel_6
```

## Chạy và build
```
cd mobile && npm install
npx expo run:android                  # bản debug trên máy ảo/thiết bị (cần máy ảo đang chạy)
npx expo prebuild --platform android  # tạo thư mục android/ (không đưa vào Git)
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
# APK: android/app/build/outputs/apk/release/app-release.apk (khoảng 42 MB)
```
- Bản release hiện được ký bằng khóa debug mặc định của mẫu Expo: đủ để **cài thử và nộp bài**, **không dùng để đưa lên Google Play** (cần khóa ký riêng).
- APK chỉ có phần cho chip **arm64** (điện thoại Android hiện nay và máy ảo trên Mac Apple Silicon). Muốn chạy trên máy x86 hãy bỏ `-PreactNativeArchitectures=...` (APK sẽ lớn hơn nhiều).

## Kiểm thử
Xem `kiem_thu/BAN_KIEM_THU.md`, mục "Ứng dụng Android". Đã chạy trên hai máy ảo (Pixel 6 và Pixel 4a, Android 16). **Chưa thử trên điện thoại thật.**
