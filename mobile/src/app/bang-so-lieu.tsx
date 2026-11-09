/** Bảng số liệu: Khu vực + ba chỉ số của năm đang chọn; tìm không dấu; lưu CSV hỏi nơi lưu. */
import {memo, useMemo, useState} from 'react';
import {FlatList, TextInput, View} from 'react-native';
import {Btn, Dot, PageBar, Seg, T} from '@/ui/kit';
import {C, R} from '@/ui/theme';
import {INDEX, INDICES, YEARS, colorOf, fmt, indexTitle, normalize} from '@/lib/format';
import {eligible} from '@/lib/policy';
import {CODES, getRows, names, useDataVersion} from '@/lib/data';
import {setState, useStore} from '@/lib/store';
import {saveCsv} from '@/lib/exportCsv';

const H = 56;
const Row = memo(function Row({code, year, odd}: {code: string; year: number; odd: boolean}) {
  const r = getRows().get(code, year);
  return (
    <View style={{height: H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, backgroundColor: odd ? C.surface2 : C.surface}}>
      <View style={{flex: 1.6}}><T s={13.5} w="700" lines={1}>{names.get(code)}</T><T s={11} color={C.ink3}>Mã {code}</T></View>
      {INDICES.map(k => { const ok = eligible(r, k); return (
        <View key={k} style={{flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4}}>
          {ok && <Dot color={colorOf(r![k], k)} size={8} />}<T s={13.5} w="700" color={ok ? C.ink : C.ink3}>{ok ? fmt(r![k], INDEX[k].digits) : '—'}</T></View>); })}
    </View>
  );
});

export default function Table() {
  useDataVersion();
  const year = useStore(s => s.year);
  const [q, setQ] = useState(''), [msg, setMsg] = useState('');
  const codes = useMemo(() => CODES.filter(c => !q || normalize(names.get(c)).includes(normalize(q)) || c.includes(q)).sort((a, b) => (names.get(a) ?? '').localeCompare(names.get(b) ?? '', 'vi')), [q]);
  const exportCsv = async () => {
    try {
      const rows = codes.map(c => { const r = getRows().get(c, year); return {ma: c, ten: names.get(c), nam: year, lst: r?.lst ?? '', do_phu_lst: r?.lst_coverage ?? '', ndvi: r?.ndvi ?? '', do_phu_ndvi: r?.ndvi_coverage ?? '', tvdi: r?.tvdi ?? '', do_phu_tvdi: r?.tvdi_coverage ?? '', ngay_anh: r?.dates ?? ''}; });
      const where = await saveCsv(`so_lieu_${year}.csv`, ['ma', 'ten', 'nam', 'lst', 'do_phu_lst', 'ndvi', 'do_phu_ndvi', 'tvdi', 'do_phu_tvdi', 'ngay_anh'], rows);
      setMsg(where ? 'Đã lưu vào ' + where : 'Đã hủy lưu');
    } catch (e: any) { setMsg('Không lưu được: ' + e.message); }
  };
  return (
    <View style={{flex: 1, backgroundColor: C.bg}}>
      <PageBar title="Bảng số liệu" back />
      <View style={{padding: 12, gap: 8}}>
        <Seg options={YEARS.map(y => ({value: y, label: String(y)}))} value={year} onChange={v => setState({year: v})} wrap />
        <TextInput value={q} onChangeText={setQ} placeholder="Tìm tên hoặc mã khu vực (không cần dấu)" placeholderTextColor={C.ink3} style={{backgroundColor: C.surface, borderWidth: 1, borderColor: C.line2, borderRadius: R, padding: 11, fontSize: 15, color: C.ink}} />
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
          <Btn small tone="primary" icon="download" label="Lưu bảng (CSV)" onPress={exportCsv} />
          <T s={12} color={C.ink3} style={{flex: 1}}>{codes.length} dòng · trống nghĩa là chưa đủ dữ liệu, không phải 0</T>
        </View>
        {msg ? <T s={12.5} w="700" color={C.accent2}>{msg}</T> : null}
      </View>
      <View style={{flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 8, backgroundColor: C.ink}}>
        <T s={11} w="800" color="#fff" style={{flex: 1.6}}>KHU VỰC</T>
        {INDICES.map(k => <T key={k} s={11} w="800" color="#fff" style={{flex: 1, textAlign: 'right'}}>{INDEX[k].code}{INDEX[k].unit ? ' ' + INDEX[k].unit : ''}</T>)}
      </View>
      <FlatList data={codes} keyExtractor={c => c} getItemLayout={(_, i) => ({length: H, offset: H * i, index: i})} initialNumToRender={16} windowSize={7} removeClippedSubviews
        renderItem={({item, index}) => <Row code={item} year={year} odd={index % 2 === 1} />} />
      <T s={11} color={C.ink3} style={{padding: 8}}>{INDICES.map(indexTitle).join(' · ')}</T>
    </View>
  );
}
