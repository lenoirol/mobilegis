import {View} from 'react-native';
import {Card, PageBar, Ramp, Screen, T} from '@/ui/kit';
import {C} from '@/ui/theme';
import {APP_NAME} from '@/lib/config';
import {INDEX, INDICES, indexTitle} from '@/lib/format';

const HOWTO = [
  ['Bản đồ', 'Mỗi xã/phường tô màu theo giá trị chỉ số đang chọn. Chạm một khu vực để xem ba chỉ số và mức tin cậy. Nút 3D dựng khối theo giá trị; Ô 120 m hiện ảnh gốc.'],
  ['Xếp hạng', 'Danh sách 167 xã/phường, mặc định LST cao → thấp, NDVI thấp → cao, TVDI cao → thấp. Bấm một tên, bản đồ bên cạnh phóng tới khu vực đó.'],
  ['Dự báo', 'Giá trị trung bình dự kiến của LST và NDVI 6 tháng tới, kèm khoảng tin cậy 80%. Ước tính thử nghiệm, không phải cảnh báo.'],
  ['Thống kê', 'Số tổng quan, phân bố giá trị, diễn biến 2020–2025 và quan hệ nhiệt độ – độ xanh.'],
  ['Vùng màu xám', 'Khu vực có dưới 50% ô ảnh dùng được (do mây) không tô màu, không xếp hạng.'],
];
export default function About() {
  return (
    <View style={{flex: 1, backgroundColor: C.bg}}>
      <PageBar title="Giới thiệu" back />
      <Screen>
        <T s={21} w="900">{APP_NAME}</T>
        <T s={14} color={C.ink2}>Ứng dụng MobileGIS trực quan hóa diễn biến nhiệt độ bề mặt đất (LST), chỉ số thực vật (NDVI) và chỉ số khô hạn nhiệt độ – thực vật (TVDI) cho 167 xã/phường TP.HCM sau sáp nhập (không gồm Côn Đảo), mùa khô 2020–2025, tính từ ảnh Landsat 8/9.</T>
        {INDICES.map(k => <Card key={k}><T s={15} w="800" color={INDEX[k].dark}>{indexTitle(k)}</T><Ramp k={k} /><T s={13.5}>{INDEX[k].what}</T><T s={13} color={C.ink3}>{INDEX[k].limit}</T></Card>)}
        <T s={18} w="800">Cách dùng</T>
        {HOWTO.map(([t, d]) => <Card key={t}><T s={15} w="800">{t}</T><T s={13.5} color={C.ink2}>{d}</T></Card>)}
        <T s={18} w="800">Dữ liệu và giới hạn</T>
        <Card><T s={13.5} color={C.ink2}>Landsat 8/9 Collection 2 Level-2 (USGS), xử lý trên Google Earth Engine, ô ảnh 120 m. Ranh giới tham khảo, không phải địa chính. Phục vụ học tập, không phải quan trắc thời gian thực, không thay thế cảnh báo chính thức.</T></Card>
      </Screen>
    </View>
  );
}
