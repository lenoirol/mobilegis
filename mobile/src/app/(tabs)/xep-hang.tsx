/** Xếp hạng: danh sách bên trái, bản đồ bên phải. Bấm một tên: bản đồ phóng tới khu vực đó, các khu vực khác mờ đi.
 *  Danh sách dùng FlatList chiều cao dòng cố định (cuộn mượt trên máy yếu). Chế độ nhẹ: gỡ bản đồ khi rời tab. */
import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {FlatList, Modal, Pressable, ScrollView, View} from 'react-native';
import {useIsFocused} from 'expo-router';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {ZonesMap, type ZonesHandle} from '@/map/ZonesMap';
import {Btn, Dot, Seg, T, st} from '@/ui/kit';
import {IndexSwitch} from '@/ui/IndexSwitch';
import {C} from '@/ui/theme';
import {INDEX, YEARS, colorOf, fmt, indexTitle, type IndexKey} from '@/lib/format';
import {eligible} from '@/lib/policy';
import {CODES, getRows, names, useDataVersion} from '@/lib/data';
import {setState, useStore, type Dir} from '@/lib/store';
import {saveCsv} from '@/lib/exportCsv';

const DEFAULT_DIR: Record<IndexKey, 'asc' | 'desc'> = {lst: 'desc', ndvi: 'asc', tvdi: 'desc'};
const TOP_TEXT: Record<IndexKey, Record<'asc' | 'desc', string>> = {
  lst: {desc: 'Nóng nhất ở trên cùng', asc: 'Mát nhất ở trên cùng'}, ndvi: {desc: 'Nhiều cây xanh nhất ở trên', asc: 'Ít cây xanh nhất ở trên'}, tvdi: {desc: 'Khô nhất ở trên cùng', asc: 'Ẩm nhất ở trên cùng'}};
const ROW_H = 54;
const effective = (k: IndexKey, d: Dir) => d === 'auto' ? DEFAULT_DIR[k] : d;

const Item = memo(function Item({code, rank, value, k, on, onPress}: {code: string; rank: number | null; value?: number; k: IndexKey; on: boolean; onPress: (c: string) => void}) {
  return (
    <Pressable onPress={() => onPress(code)} style={{height: ROW_H, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, backgroundColor: on ? C.accentSoft : 'transparent'}}>
      <T s={11.5} color={C.ink3} style={{width: 22, textAlign: 'right'}}>{rank ?? '–'}</T>
      <T s={13} w="700" lines={2} style={{flex: 1}}>{(names.get(code) ?? code).replace(/^(Phường|Xã|Đặc khu) /, '')}</T>
      {rank != null ? <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}><Dot color={colorOf(value, k)} size={9} /><T s={13} w="800">{fmt(value, INDEX[k].digits)}</T></View> : <T s={11} color={C.ink3}>thiếu</T>}
    </Pressable>
  );
});

export default function Ranking() {
  const insets = useSafeAreaInsets(), focused = useIsFocused(), map = useRef<ZonesHandle>(null), list = useRef<FlatList>(null);
  const k = useStore(s => s.index), year = useStore(s => s.year), selected = useStore(s => s.selected), dir = useStore(s => s.dir), lite = useStore(s => s.lite);
  const [yearOpen, setYearOpen] = useState(false), [msg, setMsg] = useState('');
  const version = useDataVersion();
  const d = effective(k, dir);
  const items = useMemo(() => {
    const rows = getRows(), ok: {code: string; v: number}[] = [], low: string[] = [];
    for (const code of CODES) { const r = rows.get(code, year); if (eligible(r, k)) ok.push({code, v: r![k]!}); else low.push(code); }
    ok.sort((a, b) => (d === 'desc' ? b.v - a.v : a.v - b.v));
    return [...ok.map((x, i) => ({code: x.code, rank: i + 1, value: x.v})), ...low.map(code => ({code, rank: null as number | null, value: undefined as number | undefined}))];
  }, [k, year, d, version]);
  const pick = useCallback((code: string) => { setState({selected: code}); map.current?.focus(code); }, []);
  useEffect(() => {   // chọn từ tab khác: cuộn tới dòng đó
    if (!selected || !focused) return;
    const i = items.findIndex(x => x.code === selected); if (i >= 0) list.current?.scrollToIndex({index: i, viewPosition: 0.4, animated: !lite});
  }, [selected, focused]);   // eslint-disable-line react-hooks/exhaustive-deps
  const exportCsv = async () => {
    try {
      const where = await saveCsv(`xep_hang_${INDEX[k].code}_${year}.csv`, ['hang', 'ma', 'ten', 'nam', 'chi_so', 'gia_tri'],
        items.map(x => ({hang: x.rank ?? '', ma: x.code, ten: names.get(x.code), nam: year, chi_so: indexTitle(k), gia_tri: x.value ?? ''})));
      setMsg(where ? 'Đã lưu CSV vào ' + where : '');
    } catch (e: any) { setMsg('Không lưu được: ' + e.message); }
    setTimeout(() => setMsg(''), 3500);
  };
  const showMap = focused || !lite;
  return (
    <View style={{flex: 1, backgroundColor: C.bg, paddingTop: insets.top}}>
      <View style={{padding: 10, gap: 8, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.line}}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
          <T s={18} w="800" style={{flex: 1}}>Xếp hạng</T>
          <Btn small label={'Mùa khô ' + year} icon="chevron" onPress={() => setYearOpen(true)} />
          <Btn small icon="download" label="CSV" onPress={exportCsv} />
        </View>
        <IndexSwitch />
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
          <View style={{flex: 1}}><Seg options={[{value: 'desc', label: 'Cao → thấp'}, {value: 'asc', label: 'Thấp → cao'}]} value={d} onChange={v => setState({dir: v as Dir})} /></View>
        </View>
        <T s={12} color={C.ink2}>{TOP_TEXT[k][d]} · {items.filter(x => x.rank).length} khu vực được xếp hạng</T>
        {msg ? <T s={12.5} w="700" color={C.accent2}>{msg}</T> : null}
      </View>
      <View style={{flex: 1, flexDirection: 'row'}}>
        <View style={{width: '46%', backgroundColor: C.surface, borderRightWidth: 1, borderRightColor: C.line}}>
          <FlatList ref={list} data={items} keyExtractor={x => x.code} getItemLayout={(_, i) => ({length: ROW_H, offset: ROW_H * i, index: i})}
            initialNumToRender={14} maxToRenderPerBatch={12} windowSize={7} removeClippedSubviews
            onScrollToIndexFailed={() => {}} renderItem={({item}) => <Item code={item.code} rank={item.rank} value={item.value} k={k} on={item.code === selected} onPress={pick} />} />
        </View>
        <View style={{flex: 1}}>
          {showMap ? <ZonesMap ref={map} index={k} year={year} selected={selected} dimOthers lite={lite} onPick={c => c && pick(c)} padding={{top: 30, right: 20, bottom: 60, left: 20}} /> : null}
          {selected && <View style={[st.float, {position: 'absolute', left: 6, right: 6, bottom: 6, padding: 8}]}>
            <T s={13} w="800" lines={1}>{names.get(selected)}</T>
            <T s={12.5} color={C.ink2}>{INDEX[k].code} {fmt(getRows().get(selected, year)?.[k], INDEX[k].digits)}{INDEX[k].unit ? ' ' + INDEX[k].unit : ''}</T>
          </View>}
          <View style={{position: 'absolute', top: 8, right: 8, gap: 6}}>
            <Btn small icon="plus" onPress={() => map.current?.zoomBy(1)} />
            <Btn small icon="minus" onPress={() => map.current?.zoomBy(-1)} />
            <Btn small icon="extent" onPress={() => map.current?.fitAll()} />
          </View>
        </View>
      </View>
      <Modal visible={yearOpen} transparent animationType="fade" onRequestClose={() => setYearOpen(false)}>
        <Pressable style={{flex: 1, backgroundColor: '#0005', justifyContent: 'center', padding: 24}} onPress={() => setYearOpen(false)}>
          <View style={{backgroundColor: C.surface, borderRadius: 16, padding: 12, gap: 4}}>
            <T s={16} w="800">Chọn năm</T>
            <ScrollView>{YEARS.map(y => <Pressable key={y} onPress={() => { setState({year: y}); setYearOpen(false); }} style={{padding: 12, borderRadius: 10, backgroundColor: y === year ? C.accentSoft : 'transparent'}}>
              <T s={15} w={y === year ? '800' : '600'}>Mùa khô {y}</T></Pressable>)}</ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
