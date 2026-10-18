import {Linking, View} from 'react-native';
import {Block, Button, Card, Eyebrow, Page, PageHead, Reveal, T, Table, C, type Col} from '@/ds';
import {Ramp} from '@/components/Legend';
import {useData} from '@/components/DataProvider';
import {API_BASE} from '@/lib/config';
import {INDEX, INDICES, TVDI_CLASSES, YEARS, type IndexKey} from '@/lib/format';
import {eligible} from '@/lib/policy';

const MEANING: Record<IndexKey, string> = {
  lst: 'Mặt đường, mái nhà, tán cây nóng đến mức nào lúc vệ tinh chụp. Đây là nhiệt độ bề mặt, thường cao hơn nhiệt độ không khí bạn cảm nhận hằng ngày.',
  ndvi: 'Mức xanh của thảm thực vật. Số càng cao thường là càng nhiều cây cỏ xanh; không đếm được số cây hay diện tích công viên.',
  tvdi: 'Mức khô tương đối của bề mặt, từ 0 (ẩm) đến 1 (khô), suy ra từ hai chỉ số trên. Đang thử nghiệm, chưa dùng để kết luận hạn hán.',
};
const FORMULA: Record<IndexKey, string> = {
  lst: 'Nhiệt độ bề mặt (°C) = ST_B10 × 0,00341802 + 149 − 273,15 (Landsat 8/9 Collection 2 Level-2)',
  ndvi: 'Độ xanh (NDVI) = (NIR − Red) / (NIR + Red), sau hệ số phản xạ Level-2',
  tvdi: 'Độ khô (TVDI) tính từ không gian nhiệt độ – độ xanh của từng mốc ảnh',
};
const READING: [string, string][] = [
  ['Ô ảnh 120 m', 'Mỗi ô màu trên bản đồ rộng 120 m. Phóng to hơn nữa không cho thêm chi tiết thật.'],
  ['Vùng không màu', 'Là nơi vệ tinh không có ảnh dùng được (mây, bóng mây, thiếu dữ liệu), không phải giá trị 0. Chúng tôi không đoán để tô kín.'],
  ['Độ tin cậy', 'Cao, Vừa, Thấp cho biết phần ảnh dùng được của khu vực nhiều hay ít (từ 80%, từ 50%, dưới 50%). Đây không phải độ chính xác của phép đo.'],
  ['Khu vực “chưa đủ dữ liệu”', 'Khi ảnh dùng được dưới 50%, trang sẽ không xếp hạng hay so sánh khu vực đó để tránh kết luận sai.'],
  ['Ngày chụp', 'Các phường được chụp vào những ngày khác nhau trong mùa khô, nên số liệu là “ảnh chụp nhanh” của mùa khô, không phải trung bình cả năm hay xu hướng khí hậu.'],
  ['Ranh giới', 'Dùng ranh giới 167 xã/phường sau sáp nhập (không gồm Côn Đảo), áp dụng đồng nhất cho mọi năm.'],
];

export default function About() {
  const {rows} = useData();
  const coverage = YEARS.map(y => ({year: y, ...Object.fromEntries(INDICES.map(k => [k, rows ? `${rows.year(y).filter(r => eligible(r, k)).length} / 167` : '—']))}));
  const colsCov: Col<any>[] = [{key: 'year', label: 'Năm', width: 70}, ...INDICES.map(k => ({key: k, label: INDEX[k].label, width: 100, num: true}))];
  const colsTvdi: Col<any>[] = [{key: 'range', label: 'Khoảng giá trị', width: 150, mono: true}, {key: 'name', label: 'Mức', width: 150}];
  const tvdi = TVDI_CLASSES.map((c, i) => ({range: `${i ? String(TVDI_CLASSES[i - 1].max).replace('.', ',') : '0'} – ${String(Math.min(c.max, 1)).replace('.', ',')}`, name: c.name}));
  return (
    <Page>
      <PageHead eyebrow="Giới thiệu" title="Hiểu số liệu trước khi dùng" intro="MobileGIS TP.HCM cho bạn xem nhiệt độ bề mặt, độ xanh và độ khô của từng xã/phường trong mùa khô 2020–2025, tính từ ảnh vệ tinh Landsat 8/9. Dưới đây là cách đọc và mức tin cậy của các con số." />
      <View style={{gap: 16}}>
        {INDICES.map((k, i) => (
          <Reveal key={k} index={i}>
            <Card><View style={{gap: 10}}>
              <Eyebrow>{INDEX[k].unit ? `${INDEX[k].short} · ${INDEX[k].unit}` : INDEX[k].short + (INDEX[k].experimental ? ' · thử nghiệm' : '')}</Eyebrow>
              <T w={800} s={18} ls={-0.01}>{INDEX[k].name}</T>
              <Ramp colors={INDEX[k].colors} min={String(INDEX[k].min).replace('.', ',')} max={String(INDEX[k].max).replace('.', ',')} />
              <T s={15} lh={1.55} color={C.ink3}>{MEANING[k]}</T>
            </View></Card>
          </Reveal>
        ))}
      </View>
      <Block title="Cách đọc bản đồ">
        <View style={{gap: 12}}>{READING.map(([t, d], i) => (
          <Reveal key={t} index={i}><Card pad={16}><View style={{gap: 6}}>
            <View style={{alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 4, backgroundColor: C.signal, borderWidth: 2, borderColor: C.ink, borderRadius: 6}}><T mono w={800} s={13}>{String(i + 1).padStart(2, '0')}</T></View>
            <T w={800} s={17}>{t}</T><T s={14} lh={1.5} color={C.ink3}>{d}</T>
          </View></Card></Reveal>
        ))}</View>
      </Block>
      <Block title="Các mức độ khô" sub="Độ khô (TVDI) được chia thành 5 mức bằng nhau để dễ đọc. Đây là cách chia thường gặp trong các nghiên cứu TVDI, dùng để mô tả chứ không phải thang hạn hán đã kiểm định.">
        <Table cols={colsTvdi} rows={tvdi} rowKey={r => r.range} />
      </Block>
      <Block title="Mỗi năm có bao nhiêu khu vực đủ dữ liệu?" sub="Số xã/phường có từ 50% diện tích ảnh dùng được. Những nơi còn lại vẫn xem được trên bản đồ nhưng được đánh dấu “tin cậy thấp”.">
        <Table cols={colsCov} rows={coverage} rowKey={r => String(r.year)} />
      </Block>
      <Block title="Dữ liệu từ đâu">
        <View style={{gap: 12}}>
          <Card pad={16}><View style={{gap: 6}}><T w={800} s={17}>Ảnh vệ tinh</T><T s={14} lh={1.5} color={C.ink3}>Landsat 8/9 (USGS), xử lý trên Google Earth Engine cho các mốc mùa khô 2020–2025, đã lọc mây và bóng mây. Số liệu là kết quả xử lý từ ảnh, không phải số đo tại mặt đất.</T></View></Card>
          <Card pad={16}><View style={{gap: 6}}><T w={800} s={17}>Ranh giới và lớp phủ</T><T s={14} lh={1.5} color={C.ink3}>Ranh giới 167 xã/phường từ bộ dữ liệu cộng đồng Vietnamese Provinces. Lớp phủ đất lấy từ ESA WorldCover 2021 (CC BY 4.0), chỉ mô tả năm 2021.</T></View></Card>
        </View>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 10}}>
          <Button sm icon="download" label="Số liệu theo xã/phường (CSV)" onPress={() => Linking.openURL(API_BASE + '/data/gee_recovery/observations.csv')} />
          <Button sm icon="download" label="Ranh giới 167 xã/phường (GeoJSON)" onPress={() => Linking.openURL(API_BASE + '/data/hcm_167.geojson')} />
        </View>
      </Block>
      <Block title="Dùng trên điện thoại">
        <T s={15} lh={1.55} color={C.ink3}>Số liệu và những mảnh bản đồ bạn đã xem được lưu trên máy, nên mở lại được khi mạng yếu. “Vị trí của tôi” cần quyền vị trí và không lưu tọa độ của bạn.</T>
      </Block>
      <Block>
        <Card flat pad={14}><View style={{gap: 10}}>
          <T w={700} s={15}>Chi tiết kỹ thuật (dành cho người làm chuyên môn)</T>
          {INDICES.map(k => <View key={k} style={{gap: 4}}><T w={800} s={14}>{INDEX[k].label}</T><View style={{backgroundColor: C.paper2, padding: 8, borderRadius: 6}}><T mono s={12} lh={1.5}>{FORMULA[k]}</T></View></View>)}
          <T s={13} lh={1.5} color={C.ink3}>Trung bình xã/phường chỉ tính từ các ô ảnh hợp lệ, mỗi ô như nhau. Tỷ lệ ô hợp lệ là độ phủ mẫu, không phải độ chính xác. Lưới lấy mẫu 120 m không có nghĩa mọi băng gốc có độ phân giải 120 m.</T>
        </View></Card>
      </Block>
      <T s={12.5} lh={1.45} color={C.ink3} align="center" style={{marginVertical: 22}}>Thông tin để tham khảo, không thay thế quan trắc hay đánh giá chính thức. Độ khô là chỉ số thử nghiệm; nhiệt độ ở đây là nhiệt độ bề mặt, không phải nhiệt độ không khí.</T>
    </Page>
  );
}
