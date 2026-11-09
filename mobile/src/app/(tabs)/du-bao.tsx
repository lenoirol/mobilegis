/** Dự báo theo tháng (thử nghiệm): LST và NDVI trung bình của từng xã/phường cho 6 tháng tới, kèm khoảng tin cậy 80%. */
import {memo, useEffect, useMemo, useState} from 'react';
import {FlatList, Modal, Pressable, TextInput, View} from 'react-native';
import Svg, {Circle, Line, Polygon, Polyline, Text as SvgText} from 'react-native-svg';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Callout, Dot, PageBar, Screen, Seg, T} from '@/ui/kit';
import {IndexSwitch} from '@/ui/IndexSwitch';
import {IxCard} from '@/ui/IxCard';
import {C, R} from '@/ui/theme';
import {INDEX, colorOf, fmt, normalize, type IndexKey} from '@/lib/format';
import {CODES, getForecast, names, useDataVersion} from '@/lib/data';
import {setState, useStore} from '@/lib/store';

const FIX: IndexKey[] = ['lst', 'ndvi'];
const mLong = (ym: string) => `tháng ${+ym.slice(5)}/${ym.slice(0, 4)}`, mShort = (ym: string) => `T${+ym.slice(5)}/${ym.slice(2, 4)}`;

const Chart = memo(function Chart({code, k, width}: {code: string; k: IndexKey; width: number}) {
  const fc = getForecast(), u = fc.units[code], spec = INDEX[k];
  if (!u) return <T s={13} color={C.ink3}>Chưa có dữ liệu tháng cho khu vực này.</T>;
  const n = 36, from = fc.months.length - n, hist = fc.months.slice(from).map((m, i) => ({m, v: u[k as 'lst' | 'ndvi'][from + i]})), f = u[(`f_${k}`) as 'f_lst'];
  const W = width, H = 210, pl = 36, pr = 8, pt = 12, pb = 24, total = n + (f?.length ?? 0);
  const ys = [...hist.map(p => p.v), ...(f ?? []).flatMap(x => [x[1], x[2]])].filter((v): v is number => typeof v === 'number');
  if (!ys.length) return <T s={13} color={C.ink3}>Khu vực này chưa đủ dữ liệu tháng để dự báo.</T>;
  let lo = Math.min(...ys), hi = Math.max(...ys); const padY = (hi - lo) * 0.12 || 1; lo -= padY; hi += padY;
  const x = (i: number) => pl + (i / (total - 1)) * (W - pl - pr), y = (v: number) => H - pb - ((v - lo) / (hi - lo)) * (H - pt - pb);
  const runs: string[] = []; let cur: string[] = [];
  hist.forEach((p, i) => { if (typeof p.v === 'number') cur.push(`${x(i)},${y(p.v)}`); else { if (cur.length > 1) runs.push(cur.join(' ')); cur = []; } });
  if (cur.length > 1) runs.push(cur.join(' '));
  const band = f ? [...f.map((v, i) => `${x(n + i)},${y(v[2])}`), ...f.map((v, i) => `${x(n + i)},${y(v[1])}`).reverse()].join(' ') : '';
  const lastIdx = [...hist.keys()].reverse().find(i => typeof hist[i].v === 'number');
  const fline = f ? [...(lastIdx != null ? [`${x(lastIdx)},${y(hist[lastIdx].v as number)}`] : []), ...f.map((v, i) => `${x(n + i)},${y(v[0])}`)].join(' ') : '';
  return (
    <Svg width={W} height={H}>
      {[0, 1, 2, 3].map(t => { const v = lo + ((hi - lo) * t) / 3; return <SvgText key={t} x={pl - 4} y={y(v) + 4} fontSize={10} fill={C.ink3} textAnchor="end">{fmt(v, spec.digits === 1 ? 0 : 1)}</SvgText>; })}
      {[0, 1, 2, 3].map(t => <Line key={'g' + t} x1={pl} x2={W - pr} y1={y(lo + ((hi - lo) * t) / 3)} y2={y(lo + ((hi - lo) * t) / 3)} stroke={C.line} strokeDasharray="2 4" />)}
      {band ? <Polygon points={band} fill={spec.ix} fillOpacity={0.18} /> : null}
      {runs.map((r, i) => <Polyline key={i} points={r} fill="none" stroke={spec.dark} strokeWidth={2} />)}
      {fline ? <Polyline points={fline} fill="none" stroke={spec.ix} strokeWidth={2.5} strokeDasharray="6 4" /> : null}
      {f?.map((v, i) => <Circle key={i} cx={x(n + i)} cy={y(v[0])} r={4} fill={colorOf(v[0], k)} stroke={spec.dark} strokeWidth={1.2} />)}
      <Line x1={x(n - 0.5)} x2={x(n - 0.5)} y1={pt} y2={H - pb} stroke={C.ink3} strokeDasharray="3 3" />
      {[0, 12, 24, n].map(i => <SvgText key={'m' + i} x={x(Math.min(i, total - 1))} y={H - 6} fontSize={10} fill={C.ink3} textAnchor="middle">{mShort(i < n ? hist[i].m : fc.future[0])}</SvgText>)}
    </Svg>
  );
});

export default function ForecastScreen() {
  const insets = useSafeAreaInsets(); useDataVersion();
  const store = useStore(s => s.index), selected = useStore(s => s.selected);
  const k: IndexKey = FIX.includes(store) ? store : 'lst', spec = INDEX[k], fc = getForecast();
  const [code, setCode] = useState<string>(selected && fc.units[selected] ? selected : '26743');
  const [pickOpen, setPickOpen] = useState(false), [q, setQ] = useState(''), [month, setMonth] = useState(0), [dir, setDir] = useState<'desc' | 'asc'>('desc');
  const [w, setW] = useState(320);
  useEffect(() => { if (selected && fc.units[selected]) setCode(selected); }, [selected]);   // eslint-disable-line react-hooks/exhaustive-deps
  const shownCode = code;
  const f = fc.units[shownCode]?.[(`f_${k}`) as 'f_lst'];
  const rank = useMemo(() => Object.entries(fc.units).map(([c, u]) => ({c, v: u[(`f_${k}`) as 'f_lst']?.[month]})).filter(x => x.v).sort((a, b) => (dir === 'desc' ? b.v![0] - a.v![0] : a.v![0] - b.v![0])).slice(0, 10), [fc, k, month, dir]);
  const meta = fc.indices[k];
  const filtered = useMemo(() => CODES.filter(c => fc.units[c] && (!q || normalize(names.get(c)).includes(normalize(q)))), [q, fc]);
  return (
    <View style={{flex: 1, backgroundColor: spec.soft}}>
      <PageBar title="Dự báo theo tháng" color={spec.dark} />
      <Screen bg={spec.soft}>
        <Callout tone="warn">Dự báo thử nghiệm từ chuỗi {fc.months.length} tháng (MODIS). Xem cả khoảng 80% (vùng tô mờ). Tháng thiếu dữ liệu để trống, không nội suy. TVDI chưa được dự báo.</Callout>
        <IndexSwitch only={FIX} color={spec.dark} />
        {store === 'tvdi' && <T s={12.5} color={C.warnInk}>TVDI chưa có dự báo; đang hiện LST.</T>}
        <Pressable onPress={() => setPickOpen(true)} style={{backgroundColor: C.surface, borderRadius: R, borderWidth: 1, borderColor: spec.ix, padding: 12}}>
          <T s={12} w="700" color={spec.dark}>KHU VỰC</T><T s={16} w="800">{names.get(shownCode)} ›</T>
        </Pressable>
        <IxCard k={k} />
        <View onLayout={e => setW(e.nativeEvent.layout.width - 24)} style={{backgroundColor: C.surface, borderRadius: R, borderTopWidth: 5, borderTopColor: spec.ix, padding: 12, gap: 6}}>
          <T s={16} w="800" color={spec.dark}>Đường diễn biến và dự báo</T>
          <Chart code={shownCode} k={k} width={w} />
          <T s={12} color={C.ink3}>Đường liền: đã đo theo tháng (đứt đoạn là tháng thiếu). Đứt nét và vùng mờ: dự báo và khoảng 80%.</T>
        </View>
        <View style={{backgroundColor: C.surface, borderRadius: R, overflow: 'hidden'}}>
          <View style={{flexDirection: 'row', backgroundColor: spec.dark, padding: 10}}>
            {['Tháng', 'Dự báo', 'Khoảng 80%'].map((h, i) => <T key={h} s={12} w="800" color="#fff" style={{flex: i ? 1 : 1.3, textAlign: i ? 'right' : 'left'}}>{h}</T>)}
          </View>
          {f ? fc.future.map((m, i) => <View key={m} style={{flexDirection: 'row', padding: 10, backgroundColor: i % 2 ? spec.soft : C.surface}}>
            <T s={13.5} w="700" style={{flex: 1.3}}>{mLong(m)}</T>
            <View style={{flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 5}}><Dot color={colorOf(f[i][0], k)} /><T s={13.5} w="800">{fmt(f[i][0], spec.digits)}</T></View>
            <T s={13} style={{flex: 1, textAlign: 'right'}}>{fmt(f[i][1], spec.digits)}–{fmt(f[i][2], spec.digits)}</T>
          </View>) : <T s={13} color={C.ink3} style={{padding: 12}}>Chưa có dự báo cho khu vực này.</T>}
        </View>
        <View style={{backgroundColor: C.surface, borderRadius: R, padding: 12, gap: 8}}>
          <T s={16} w="800" color={spec.dark}>Xếp hạng theo dự báo · {mLong(fc.future[month])}</T>
          <Seg options={fc.future.map((m, i) => ({value: i, label: mShort(m)}))} value={month} onChange={setMonth} color={spec.dark} wrap />
          <Seg options={[{value: 'desc', label: 'Cao → thấp'}, {value: 'asc', label: 'Thấp → cao'}]} value={dir} onChange={v => setDir(v as any)} color={spec.dark} />
          {rank.map((x, i) => <Pressable key={x.c} onPress={() => { setCode(x.c); setState({selected: x.c}); }} style={{flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: spec.soft}}>
            <T s={13} w="800" color={spec.dark} style={{width: 24}}>{String(i + 1).padStart(2, '0')}</T>
            <T s={13.5} w="700" style={{flex: 1}} lines={1}>{names.get(x.c)}</T>
            <Dot color={colorOf(x.v![0], k)} /><T s={13.5} w="800">{fmt(x.v![0], spec.digits)}</T>
          </Pressable>)}
        </View>
        {meta && <View style={{backgroundColor: C.surface, borderRadius: R, padding: 12, gap: 4}}>
          <T s={15} w="800" color={spec.dark}>Dự báo được tính thế nào?</T>
          <T s={13}>• Nguồn: {fc.source}.</T>
          <T s={13}>• Kiểm chứng {fc.backtest_months} tháng cuối: sai số trung bình {fmt(meta.mae_model, 2)}{spec.unit ? ' ' + spec.unit : ''}{meta.mae_baseline != null ? `; phương pháp "cùng tháng năm trước" là ${fmt(meta.mae_baseline, 2)}` : ''}.</T>
          {fc.notes.map(n => <T key={n} s={13}>• {n}</T>)}
        </View>}
      </Screen>
      <Modal visible={pickOpen} animationType="slide" onRequestClose={() => setPickOpen(false)}>
        <View style={{flex: 1, backgroundColor: C.surface, paddingTop: insets.top + 8}}>
          <View style={{padding: 12, gap: 8}}>
            <T s={18} w="800">Chọn xã/phường</T>
            <TextInput value={q} onChangeText={setQ} placeholder="Gõ tên, không cần dấu" style={{borderWidth: 1, borderColor: C.line2, borderRadius: R, padding: 12, fontSize: 15, color: C.ink}} placeholderTextColor={C.ink3} />
          </View>
          <FlatList data={filtered} keyExtractor={c => c} initialNumToRender={20} getItemLayout={(_, i) => ({length: 48, offset: 48 * i, index: i})} keyboardShouldPersistTaps="handled"
            renderItem={({item}) => <Pressable onPress={() => { setCode(item); setPickOpen(false); setQ(''); }} style={{height: 48, justifyContent: 'center', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.line}}><T s={15} w={item === code ? '800' : '500'}>{names.get(item)}</T></Pressable>} />
        </View>
      </Modal>
    </View>
  );
}
