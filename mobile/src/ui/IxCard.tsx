import {memo} from 'react';
import {View} from 'react-native';
import {INDEX, indexTitle, type IndexKey} from '@/lib/format';
import {Ramp, T} from './kit';
import {C, R} from './theme';

/** Thẻ giải nghĩa chỉ số đang xem (luôn hiện ở Thống kê và Dự báo). */
export const IxCard = memo(function IxCard({k}: {k: IndexKey}) {
  const s = INDEX[k];
  return (
    <View style={{backgroundColor: s.soft, borderRadius: R, borderLeftWidth: 6, borderLeftColor: s.ix, padding: 12, gap: 6}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
        <View style={{backgroundColor: s.dark, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5}}><T s={14} w="900" color="#fff">{s.code}</T></View>
        <View style={{flex: 1}}><T s={15} w="800" color={s.dark}>{indexTitle(k)}</T><T s={11.5} color={C.ink3}>{s.english} · thang {s.scale}</T></View>
      </View>
      <Ramp k={k} />
      <T s={13.5}><T s={13.5} w="700">Ý nghĩa: </T>{s.what}</T>
      <T s={13} color={C.ink2}><T s={13} w="700" color={C.ink2}>Lưu ý: </T>{s.limit}</T>
    </View>
  );
});
