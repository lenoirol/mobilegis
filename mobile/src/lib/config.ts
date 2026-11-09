/** Nguồn dữ liệu. Số liệu tĩnh (ranh giới, số liệu, dự báo, ô ảnh 120 m) lấy từ GitHub Pages (CDN, luôn sẵn sàng);
 *  máy chủ Render chỉ dùng cho tài khoản. `EXPO_PUBLIC_API_BASE` cho phép bản debug trỏ về máy chủ trên máy (10.0.2.2 từ máy ảo). */
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE || 'https://mobilegis-93u9.onrender.com';
export const PAGES = 'https://lenoirol.github.io/mobilegis';
export const WEB_APP = API_BASE + '/';
export const APP_NAME = 'Bản đồ đo nhiệt độ, chỉ số thực vật và chỉ số khô hạn TP.HCM';
export const APP_SHORT = 'Bản đồ đo nhiệt độ, chỉ số thực vật và chỉ số khô hạn';
export const OSM_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';   // nền đường phố Esri (máy chủ ô OSM công cộng chặn ứng dụng di động)
export const ESRI_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const START_CENTER: [number, number] = [106.82, 10.85];
export const START_ZOOM = 8.3;
