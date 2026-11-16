/** Tính lợi ích trồng cây xanh: nhập kịch bản → tính ngay CO₂, O₂, sinh khối, bóng mát, nước mưa và giá trị quy đổi.
 *  Hàm tính là bản chép nguyên văn của web (src/lib/treecalc.js ← public/js/core/treecalc.js), nên app và web cho cùng kết quả. */
import {memo, useMemo, useState} from 'react';
import {Alert, FlatList, Linking, Modal, Pressable, TextInput, View} from 'react-native';
import Svg, {Circle, Line, Polyline, Text as SvgText} from 'react-native-svg';
import {useLocalSearchParams} from 'expo-router';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Btn, Callout, Card, PageBar, Screen, Seg, T} from '@/ui/kit';
import {C, R} from '@/ui/theme';
import {fmt, normalize} from '@/lib/format';
import {CODES, getGeo, names} from '@/lib/data';
import {saveCsv} from '@/lib/exportCsv';
import {PARAMS, GROUPS, SCENARIOS, SOURCES, compute, defaults, resultRows, shareOfArea, shortMoney} from '@/lib/treecalc';

type Plan = Record<string, string>;
const toText = (o: Record<string, number>): Plan => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)]));
const toNum = (p: Plan) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.trim() === '' ? undefined : Number(v.replace(',', '.'))]));
// Giữ lại số đã nhập khi rời màn hình rồi quay lại (trong phiên dùng app).
const memo0 = {plans: {A: toText(defaults()), B: toText({...defaults(), N: 2000})} as Record<'A' | 'B', Plan>, active: 'A' as 'A' | 'B', compare: false, scenario: 'all', code: ''};

const area = (code: string) => getGeo().features.find(f => f.properties.code === code)?.properties.area_km2_source;
const money = (row: any) => row.money ? shortMoney(row.value) : `${fmt(row.value, row.digits)} ${row.unit}`;

const Stat = memo(function Stat({row, big, off}: {row: any; big?: boolean; off?: boolean}) {
  const fg = big ? '#fff' : C.ink;
  return (
    <View style={{flexBasis: big ? '100%' : '48%', flexGrow: 1, backgroundColor: big ? C.accent : off ? C.surface2 : C.surface, opacity: off ? 0.6 : 1, borderRadius: R, borderWidth: 1, borderColor: big ? C.accent : C.line, padding: 10, gap: 2}}>
      <T s={11.5} w="700" color={big ? '#fff' : C.accent2}>{row.sym}<T s={11.5} color={big ? '#ffffffd0' : C.ink3}> · {row.label}</T></T>
      <T s={big ? 26 : 17} w="900" color={fg}>{money(row)}</T>
      <T s={10.5} color={big ? '#ffffffd0' : C.ink3}>{row.formula}{off ? ' · không cộng vào tổng' : ''}</T>
    </View>
  );
});

const Chart = memo(function Chart({series, width}: {series: {name: string; color: string; ys: number[]}[]; width: number}) {
  const n = series[0].ys.length, all = series.flatMap(s => s.ys), lo = Math.min(0, ...all), hi0 = Math.max(0, ...all), hi = hi0 + (hi0 - lo) * 0.12 || 1;
  const W = width, H = 190, pl = 40, pr = 10, pt = 12, pb = 22;
  const x = (i: number) => pl + (n === 1 ? 0.5 : i / (n - 1)) * (W - pl - pr), y = (v: number) => H - pb - ((v - lo) / (hi - lo)) * (H - pt - pb);
  const ticks = [0, 1, 2, 3, 4].map(t => lo + (hi - lo) * t / 4);
  return (
    <Svg width={W} height={H}>
      {ticks.map((t, i) => <Line key={i} x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} stroke={C.line} strokeWidth={1} />)}
      {ticks.map((t, i) => <SvgText key={'t' + i} x={pl - 5} y={y(t) + 4} fontSize={10} fill={C.ink3} textAnchor="end">{fmt(t, 0)}</SvgText>)}
      {series[0].ys.map((_, i) => (n <= 12 || i % Math.ceil(n / 10) === 0) && <SvgText key={'x' + i} x={x(i)} y={H - 6} fontSize={10} fill={C.ink3} textAnchor="middle">{i + 1}</SvgText>)}
      {series.map((s, si) => <Polyline key={s.name} points={s.ys.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={s.color} strokeWidth={2.4} strokeDasharray={si ? '6 4' : undefined} />)}
      {n <= 15 && series[0].ys.map((v, i) => <Circle key={'c' + i} cx={x(i)} cy={y(v)} r={3.5} fill={series[0].color} />)}
    </Svg>
  );
});

function Field({p, value, onChange}: {p: any; value: string; onChange: (v: string) => void}) {
  return (
    <View style={{gap: 4}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
        <View style={{backgroundColor: C.accentSoft, borderRadius: 5, paddingHorizontal: 5, minWidth: 22, alignItems: 'center'}}><T s={11.5} w="800" color={C.accent2}>{p.sym}</T></View>
        <T s={13.5} w="700" color={C.ink2} style={{flex: 1}}>{p.label}</T>
      </View>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
        <TextInput value={value} onChangeText={onChange} keyboardType="decimal-pad" accessibilityLabel={p.label} selectTextOnFocus
          style={{flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line2, borderRadius: R, paddingHorizontal: 11, paddingVertical: 9, fontSize: 16, color: C.ink, fontWeight: '700'}} />
        <T s={12} color={C.ink3} style={{minWidth: 84}}>{p.unit}</T>
      </View>
      {p.hint ? <T s={11.5} color={C.ink3}>{p.hint}</T> : null}
    </View>
  );
}

export default function Trees() {
  const insets = useSafeAreaInsets(), params = useLocalSearchParams<{ma?: string}>();
  const [plans, setPlans] = useState(memo0.plans), [active, setActive] = useState(memo0.active), [compare, setCompare] = useState(memo0.compare);
  const [scenario, setScenario] = useState(memo0.scenario), [code, setCode] = useState(params.ma || memo0.code);
  const [pick, setPick] = useState(false), [q, setQ] = useState(''), [w, setW] = useState(320);
  Object.assign(memo0, {plans, active, compare, scenario, code});
  const use = SCENARIOS.find(s => s.key === scenario)!.use;
  const r = useMemo(() => compute(toNum(plans[active]), use), [plans, active, use]);
  const rb = useMemo(() => compute(toNum(plans[active === 'A' ? 'B' : 'A']), use), [plans, active, use]);
  const rows = resultRows(r), by = Object.fromEntries(rows.map(x => [x.key, x]));
  const km2 = code ? area(code) : undefined, share = km2 ? shareOfArea(r.shade, km2) : null;
  const filtered = useMemo(() => { const n = normalize(q.trim()); return n ? CODES.filter(c => normalize(names.get(c)).includes(n)) : [...CODES].sort((a, b) => (names.get(a) ?? '').localeCompare(names.get(b) ?? '', 'vi')); }, [q]);
  const setVal = (k: string, v: string) => setPlans(ps => ({...ps, [active]: {...ps[active], [k]: v}}));
  const hasCost = r.invest + r.care > 0, scen = SCENARIOS.find(s => s.key === scenario)!;
  const series = [{name: compare ? `Phương án ${active}` : 'Lũy kế', color: C.accent, ys: r.byYear.map(y => (hasCost ? y.net : y.gross) / 1e6)}];
  if (compare && rb.values.T === r.values.T) series.push({name: `Phương án ${active === 'A' ? 'B' : 'A'}`, color: '#eb6834', ys: rb.byYear.map(y => (rb.invest + rb.care > 0 ? y.net : y.gross) / 1e6)});

  async function exportCsv() {
    const list = compare ? (['A', 'B'] as const) : [active];
    const out: Record<string, unknown>[] = list.flatMap(name => {
      const res = compute(toNum(plans[name]), use);
      return [...PARAMS.map(p => ({phuong_an: name, loai: 'he_so', ky_hieu: p.sym, ten: p.label, gia_tri: (res.values as any)[p.key], don_vi: p.unit, cong_thuc: ''})),
        ...resultRows(res).map(x => ({phuong_an: name, loai: 'ket_qua', ky_hieu: x.sym, ten: x.label, gia_tri: x.digits ? Math.round(x.value * 100) / 100 : Math.round(x.value), don_vi: x.unit, cong_thuc: x.formula}))];
    });
    out.push({phuong_an: '', loai: 'ghi_chu', ky_hieu: '', ten: `Kịch bản: ${scen.label}${code ? ' · khu vực: ' + names.get(code) : ''}`, gia_tri: '' as any, don_vi: '', cong_thuc: 'Hệ số mặc định là giá trị ví dụ, không phải số đo tại TP.HCM'});
    try { const where = await saveCsv('loi_ich_trong_cay.csv', ['phuong_an', 'loai', 'ky_hieu', 'ten', 'gia_tri', 'don_vi', 'cong_thuc'], out); if (where) Alert.alert('Đã lưu', `Tệp loi_ich_trong_cay.csv đã lưu vào ${where}.`); }
    catch (e: any) { Alert.alert('Không lưu được', String(e?.message ?? e)); }
  }

  return (
    <View style={{flex: 1, backgroundColor: C.bg}}>
      <PageBar title="Tính lợi ích trồng cây" back />
      <Screen>
        <T s={21} w="900">Tính lợi ích trồng cây xanh</T>
        <T s={14} color={C.ink2}>Nhập số cây, số năm và hệ số của cây, kết quả tính ngay: CO₂ hấp thụ, O₂ tạo ra, sinh khối, bóng mát, nước mưa giữ lại và giá trị quy đổi.</T>
        <Callout>Số mặc định là ví dụ của đề bài để minh họa cách tính, không phải số đo tại TP.HCM. Công cụ không suy ra mức giảm nhiệt độ: bản đồ đo nhiệt độ bề mặt từ vệ tinh, chưa đủ cơ sở quy đổi số cây thành độ C.</Callout>

        <Card>
          <T s={13} w="700" color={C.ink2}>Kịch bản tính tổng</T>
          <Seg wrap options={SCENARIOS.map(s => ({value: s.key, label: s.label}))} value={scenario} onChange={setScenario} />
          <T s={13} w="700" color={C.ink2}>Khu vực (không bắt buộc)</T>
          <Pressable onPress={() => setPick(true)} style={{borderWidth: 1, borderColor: C.line2, borderRadius: R, padding: 11, flexDirection: 'row'}}>
            <T s={15} w="700" style={{flex: 1}}>{code ? names.get(code) ?? code : 'Không gắn với khu vực nào'}</T><T s={15} color={C.ink3}>▾</T>
          </Pressable>
          <Seg options={[{value: 'one', label: 'Một phương án'}, {value: 'two', label: 'So sánh A và B'}]} value={compare ? 'two' : 'one'} onChange={v => { setCompare(v === 'two'); if (v === 'one') setActive('A'); }} />
          {compare && <Seg options={[{value: 'A', label: 'Đang sửa: A'}, {value: 'B', label: 'Đang sửa: B'}]} value={active} onChange={v => setActive(v as 'A' | 'B')} color={C.accent2} />}
        </Card>

        <T s={18} w="800">Kết quả{compare ? ` · phương án ${active}` : ''}</T>
        {r.problems.length > 0 && <Callout tone="warn">Đã tự chỉnh: {r.problems.join('; ')}.</Callout>}
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
          <Stat row={by.net} big />
          {['co2', 'o2', 'biomass', 'shade', 'water'].map(k => <Stat key={k} row={by[k]} />)}
          {['G1', 'G2', 'G3'].map(k => <Stat key={k} row={by[k]} off={!(r.use as any)[k]} />)}
          {hasCost && ['invest', 'care'].map(k => <Stat key={k} row={by[k]} />)}
        </View>
        <T s={12.5} color={C.ink3}>{scen.note}</T>
        {hasCost && <Callout tone={r.breakEven ? 'info' : 'warn'}>{r.breakEven ? `Lợi ích lũy kế bù được chi phí từ năm thứ ${r.breakEven}.` : `Trong ${r.values.T} năm, lợi ích lũy kế chưa bù được chi phí đã nhập.`}</Callout>}
        {code && km2 ? <Callout>{names.get(code)}: diện tích khoảng {fmt(km2, 2)} km². {fmt(r.values.N, 0)} cây tương đương {fmt(r.values.N / km2, 0)} cây/km²; bóng mát {fmt(r.shade, 0)} m² bằng {fmt((share ?? 0) * 100, (share ?? 0) < 0.01 ? 2 : 1)}% diện tích khu vực.{(share ?? 0) > 1 ? ' Con số vượt diện tích khu vực — hãy giảm số cây hoặc diện tích tán.' : ''}</Callout> : null}

        <Card>
          <T s={15} w="800">Giá trị lũy kế theo năm (triệu đồng)</T>
          <View onLayout={e => setW(Math.round(e.nativeEvent.layout.width))}><Chart series={series} width={w} /></View>
          {series.length > 1 && <View style={{flexDirection: 'row', gap: 14}}>{series.map((s, i) => <T key={s.name} s={12} w="700" color={s.color}>{i ? '- - ' : '— '}{s.name}</T>)}</View>}
          <T s={11.5} color={C.ink3}>Công thức của đề bài tuyến tính nên mỗi năm cộng thêm như nhau; cây thật hấp thụ ít lúc nhỏ và nhiều hơn khi lớn.</T>
        </Card>

        {compare && <Card>
          <T s={15} w="800">So sánh A và B</T>
          {resultRows(compute(toNum(plans.A), use)).map((x, i) => { const y = resultRows(compute(toNum(plans.B), use))[i]; if (!hasCost && (x.key === 'invest' || x.key === 'care')) return null; return (
            <View key={x.key} style={{flexDirection: 'row', gap: 6, paddingVertical: 5, borderTopWidth: i ? 1 : 0, borderTopColor: C.line}}>
              <T s={12.5} color={C.ink2} style={{flex: 1.3}}>{x.sym} · {x.label}</T><T s={12.5} w="700" style={{flex: 1, textAlign: 'right'}}>{money(x)}</T><T s={12.5} w="700" style={{flex: 1, textAlign: 'right'}}>{money(y)}</T>
            </View>); })}
          <T s={11.5} color={C.ink3}>Cột giữa: A · cột phải: B</T>
        </Card>}

        <T s={18} w="800">Thông số{compare ? ` · phương án ${active}` : ''}</T>
        {GROUPS.map(g => (
          <Card key={g.key}>
            <T s={14} w="800" color={C.accent2}>{g.title}</T>
            {PARAMS.filter(p => p.group === g.key).map(p => <Field key={p.key} p={p} value={plans[active][p.key]} onChange={v => setVal(p.key, v)} />)}
          </Card>
        ))}
        <View style={{flexDirection: 'row', gap: 8, flexWrap: 'wrap'}}>
          <Btn small icon="sliders" label="Về số ví dụ của đề bài" onPress={() => setPlans(ps => ({...ps, [active]: toText(active === 'B' ? {...defaults(), N: 2000} : defaults())}))} />
          <Btn small icon="download" label="Lưu CSV (chọn nơi lưu)" onPress={exportCsv} />
        </View>

        <Card>
          <T s={15} w="800">Công thức</T>
          <T s={13}>• CO₂ = N × C × T / 1000 (tấn) · O₂ = CO₂ × 0,727 (tỉ lệ khối lượng 32/44)</T>
          <T s={13}>• B_tổng = N × B × T (kg) · S_tổng = N × S × f (m²) · V = N × R × T / 1000 (m³)</T>
          <T s={13}>• G₁ = CO₂ × P₁ · G₂ = N × B × T × P₂ · G₃ = V × P₃</T>
          <T s={13}>• G_tổng = G₁ + G₂ + G₃ − C_đầu tư − C_bảo dưỡng; C_đầu tư = N × c_đt, C_bảo dưỡng = N × c_bd × T</T>
          <T s={13}>• Bóng mát không quy ra tiền vì đề bài không có đơn giá; G₁ và G₂ cùng đến từ phần gỗ cây tích lũy nên kịch bản "Không tính trùng" bỏ G₂.</T>
          <T s={13} w="700" color={C.ink2}>Nguồn của các khoảng tham khảo</T>
          {Object.values(SOURCES).map(s => <Pressable key={s.url} onPress={() => Linking.openURL(s.url)}><T s={12} color={C.accent2}>{s.text} ›</T></Pressable>)}
        </Card>
        <View style={{height: 56}} />
      </Screen>
      <View pointerEvents="none" style={{position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.accent, borderRadius: R, paddingHorizontal: 14, paddingVertical: 10, elevation: 6}}>
        <T s={12} color="#ffffffd0">Tổng{compare ? ' ' + active : ''}</T><T s={17} w="900" color="#fff">{shortMoney(r.net)}</T><T s={12} color="#ffffffd0" style={{marginLeft: 'auto'}}>CO₂ {fmt(r.co2, 1)} tấn</T>
      </View>

      <Modal visible={pick} animationType="slide" onRequestClose={() => setPick(false)}>
        <View style={{flex: 1, backgroundColor: C.surface, paddingTop: insets.top + 8}}>
          <View style={{padding: 12, gap: 8}}>
            <T s={18} w="800">Chọn xã/phường</T>
            <TextInput value={q} onChangeText={setQ} placeholder="Gõ tên, không cần dấu" style={{borderWidth: 1, borderColor: C.line2, borderRadius: R, padding: 12, fontSize: 15, color: C.ink}} placeholderTextColor={C.ink3} />
          </View>
          <FlatList data={['', ...filtered]} keyExtractor={c => c || 'none'} initialNumToRender={20} getItemLayout={(_, i) => ({length: 48, offset: 48 * i, index: i})} keyboardShouldPersistTaps="handled"
            renderItem={({item}) => <Pressable onPress={() => { setCode(item); setPick(false); setQ(''); }} style={{height: 48, justifyContent: 'center', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.line}}><T s={15} w={item === code ? '800' : '500'} color={item ? C.ink : C.ink3}>{item ? names.get(item) : 'Không gắn với khu vực nào'}</T></Pressable>} />
        </View>
      </Modal>
    </View>
  );
}
