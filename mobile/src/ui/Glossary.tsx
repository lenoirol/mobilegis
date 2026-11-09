import {Modal, Pressable, ScrollView, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {INDEX, INDICES, TVDI_CLASSES, type IndexKey} from '@/lib/format';
import {Btn, Ramp, T} from './kit';
import {C, R} from './theme';

/** "LST, NDVI, TVDI nghĩa là gì?": tên đầy đủ, ý nghĩa, cách đọc, lưu ý. */
export function Glossary({open, onClose, focus}: {open: boolean; onClose: () => void; focus?: IndexKey}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{flex: 1, backgroundColor: '#0006'}} onPress={onClose} />
      <View style={{maxHeight: '86%', backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 12}}>
        <ScrollView contentContainerStyle={{padding: 16, gap: 12}}>
          <T s={20} w="800">Các chỉ số trên bản đồ</T>
          <T s={13.5} color={C.ink3}>Mỗi chỉ số được tính cho từng xã/phường từ ảnh vệ tinh Landsat 8/9 trong mùa khô.</T>
          {INDICES.map(k => { const s = INDEX[k]; return (
            <View key={k} style={{borderRadius: R, borderWidth: focus === k ? 2 : 1, borderColor: focus === k ? s.ix : C.line, borderLeftWidth: 6, borderLeftColor: s.ix, padding: 12, gap: 5}}>
              <T s={16} w="800"><T s={16} w="900" color={s.dark}>{s.code}</T> – {s.name}{s.experimental ? ' (thử nghiệm)' : ''}</T>
              <Ramp k={k} />
              <T s={12.5} color={C.ink3}>{s.english} · đơn vị: {s.unit || 'không đơn vị'} · thang {s.scale}</T>
              <T s={14}><T s={14} w="700">Ý nghĩa: </T>{s.what}</T>
              <T s={14}><T s={14} w="700">Cách đọc: </T>{s.read}</T>
              <T s={14}><T s={14} w="700">Lưu ý: </T>{s.limit}</T>
              {k === 'tvdi' && <T s={12.5} color={C.ink3}>Các mức: {TVDI_CLASSES.map((c, i) => `${i ? TVDI_CLASSES[i - 1].max : 0}–${Math.min(c.max, 1)} ${c.name}`).join(' · ')}</T>}
            </View>); })}
          <Btn label="Đã hiểu" tone="primary" onPress={onClose} />
        </ScrollView>
      </View>
    </Modal>
  );
}
