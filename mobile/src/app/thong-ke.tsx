import {useEffect, useMemo, useRef, useState} from 'react';
import {Pressable, View} from 'react-native';
import {useRouter} from 'expo-router';
import {Block, Button, Callout, Card, Field, Icon, Input, Page, PageHead, Reveal, Segmented, Select, Skeleton, T, Table, C, useToast, Eyebrow, BW, RADIUS} from '@/ds';
import {BarChart, BoxChart, Histogram, LineChart, ScatterChart} from '@/charts/Charts';
import {SERIES_COLORS} from '@/charts/kit';
import {CountUp} from '@/components/CountUp';
import {Ramp} from '@/components/Legend';
import {useData} from '@/components/DataProvider';
import {get} from '@/lib/api';
import {INDEX, INDICES, YEARS, fmt, pct, shortName, valid, type IndexKey} from '@/lib/format';
import {valueColor} from '@/map/colors';
import {eligible} from '@/lib/policy';
import {getState, setState, useStore} from '@/lib/store';
import {indexRows, type Row} from '@/lib/data';
import {shareCsv} from '@/lib/exportCsv';

const SRC = 'gee_recovery';
interface Unit {code: string; name: string; valid_count: number; coverage: number; minimum: number; q25: number; median: number; mean: number; q75: number; maximum: number; stddev: number; histogram: {edges: number[]; counts: number[]}}
interface Stats {units: Unit[]}
interface Cover {note?: string; classes: {class_name: string; mean: number; color?: string; valid_count?: number; pixels?: number}[]}
interface Corr {pairs: {x: string; y: string; n: number; r: number | null; r_squared: number | null}[]; note: string}

export default function Stats() {
  const {data} = useData();
  const router = useRouter();
  const toast = useToast();
  const pinned = useStore(s => s.pinned);
  const [index, setIndex] = useState<IndexKey>('lst');
  const [year, setYear] = useState(2025);
  const [coverage, setCoverage] = useState(0.5);
  const [unit, setUnit] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [cover, setCover] = useState<Cover | null>(null);
  const [corr, setCorr] = useState<Corr | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const ticket = useRef(0);
  const rows = data?.rows ?? [], rowIdx = useMemo(() => indexRows(rows), [rows]);
  const spec = INDEX[index];

  useEffect(() => {
    const mine = ++ticket.current; setLoading(true); setErr('');
    const q = new URLSearchParams({source: SRC, year: String(year), index, coverage: String(coverage), ...(unit ? {code: unit} : {})}).toString();
    Promise.all([get<Stats>('/api/analysis/statistics?' + q, 45000), get<Cover>('/api/analysis/landcover?' + q, 45000), get<Corr>(`/api/analysis/correlations?source=${SRC}&year=${year}&coverage=${coverage}`, 45000)])
      .then(([s, c, r]) => { if (mine !== ticket.current) return; setStats(s); setCover(c); setCorr(r); setLoading(false); })
      .catch(e => { if (mine !== ticket.current) return; setErr(e.message); setLoading(false); });
  }, [index, year, coverage, unit]);

  const list = (stats?.units ?? []).filter(r => r.valid_count > 0);
  const total = list.reduce((s, r) => s + r.valid_count, 0);
  const kpis: [number | null, string, (v: number) => string][] = [[total || null, 'Mẫu hợp lệ trong nhóm', v => Math.round(v).toLocaleString('vi-VN')], [total ? list.reduce((s, r) => s + r.mean * r.valid_count, 0) / total : null, 'Trung bình theo pixel', v => fmt(v, spec.digits)],
    [list.length ? Math.min(...list.map(r => r.minimum)) : null, 'Giá trị thấp nhất', v => fmt(v, spec.digits)], [list.length ? Math.max(...list.map(r => r.maximum)) : null, 'Giá trị cao nhất', v => fmt(v, spec.digits)]];

  const sumCounts = list[0] ? list[0].histogram.counts.map((_, i) => list.reduce((s, r) => s + r.histogram.counts[i], 0)) : [];
  let boxUnits = list.filter(r => pinned.includes(r.code) && valid(r.minimum)).slice(0, 6); if (!boxUnits.length) boxUnits = list.filter(r => valid(r.minimum)).slice(0, 6);
  const names = (code: string) => data?.geo.features.find(f => f.properties.code === code)?.properties.full_name || code;
  const series = pinned.map((code, i) => ({id: code, name: names(code), short: shortName(names(code)), color: SERIES_COLORS[i % 4], points: YEARS.map(y => { const r = rowIdx.get(code, y), ok = valid(r?.[index]) && ((r![`${index}_coverage` as const] as number) ?? 0) >= coverage; return {x: y, y: ok ? (r![index] as number) : null, lines: [`Độ phủ ${pct(r?.[`${index}_coverage` as const], 1)}`]}; })}));
  const wardVals = series.flatMap(s => s.points.map(p => p.y)).filter(valid) as number[];
  const top5 = rows.filter(r => r.year === year && eligible(r, index) && ((r[`${index}_coverage` as const] as number) ?? 0) >= coverage).sort((a, b) => (b[index] as number) - (a[index] as number)).slice(0, 5);
  const pts = rows.filter(r => r.year === year && eligible(r, 'lst') && eligible(r, 'ndvi')).map(r => { const hasT = eligible(r, 'tvdi'); return {x: r.ndvi as number, y: r.lst as number, color: hasT ? valueColor(r.tvdi, 'tvdi') : '#8b8672', label: r.name, code: r.code, lines: [`Độ xanh ${fmt(r.ndvi)} · Nhiệt độ ${fmt(r.lst, 1)} °C`, `Độ khô ${hasT ? fmt(r.tvdi) : 'thiếu / độ phủ thấp'}`]}; });

  const exportCsv = async () => {
    if (!list.length) return toast('Chưa có thống kê để xuất.', {error: true});
    try { await shareCsv('MobileGIS_thong_ke_pixel.csv', ['code', 'name', 'year', 'index', 'valid_count', 'coverage', 'minimum', 'q25', 'median', 'mean', 'q75', 'maximum', 'stddev'], list.map(r => ({...r, year, index}))); } catch (e: any) { toast(e.message || 'Không xuất được CSV.', {error: true}); }
  };
  return (
    <Page back={{label: 'Chuyên gia', href: '/chuyen-gia'}}>
      <PageHead eyebrow="Thống kê và phân tích" title="Thống kê môi trường theo xã/phường" intro="Tính trực tiếp từ các ô ảnh hợp lệ, không suy ra từ trung bình xã/phường. Mọi kết quả kèm giới hạn của dữ liệu." />
      <Card pad={14}><View style={{gap: 12}}>
        <Field label="Chỉ số"><Segmented options={INDICES.map(k => ({value: k, label: INDEX[k].label}))} value={index} onChange={setIndex} label="Chỉ số" /></Field>
        <Field label="Mốc ảnh"><Segmented options={YEARS.map(y => ({value: y, label: String(y)}))} value={year} onChange={setYear} layout="grid2" label="Mốc ảnh" /></Field>
        <Field label="Độ phủ tối thiểu"><Select label="Độ phủ tối thiểu" value={String(coverage)} onChange={v => setCoverage(+v)} options={[{value: '0.5', label: '≥ 50% · khuyến nghị'}, {value: '0.1', label: '≥ 10% · gồm mẫu ít'}, {value: '0.8', label: '≥ 80%'}]} /></Field>
        <Field label="Khu vực"><Select label="Khu vực thống kê" value={unit} onChange={setUnit} options={[{value: '', label: 'Tất cả khu vực đủ độ phủ'}, ...(data?.geo.features ?? []).map(f => ({value: f.properties.code, label: f.properties.full_name}))]} /></Field>
      </View></Card>
      <T mono s={12} lh={1.5} color={C.ink2} style={{marginTop: 12}}>{loading ? 'Đang tính thống kê…' : err ? 'Không tải được thống kê: ' + err : `${YEARS.includes(year) ? '' : ''}${year} · ${spec.label} · ${list.length} khu vực · độ phủ ≥ ${Math.round(coverage * 100)}%. Không phải trung bình năm.`}</T>
      <View style={{marginTop: 14, gap: 12}}>
        {err ? <Callout tone="err">{err}</Callout> : loading && !stats ? <><Skeleton height={78} /><Skeleton height={78} /></> : (
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 12}}>
            {kpis.map(([v, label, f], i) => <Reveal key={label} index={i} style={{width: '47.5%'}}><View style={{backgroundColor: i === 1 ? C.signal : '#fff', borderWidth: BW, borderColor: C.ink, borderRadius: 14, padding: 14, gap: 4}}><CountUp value={v} format={f} mono w={800} s={24} /><T mono w={600} s={10.5} ls={0.08} upper color={C.ink2}>{label}</T></View></Reveal>)}
          </View>
        )}
      </View>
      {!err && <>
        <Block title="Phân bố">
          <Card pad={14}><View style={{gap: 6}}><T w={800} s={17}>{`Phân bố pixel hợp lệ · ${spec.label}`}</T><Histogram edges={list[0]?.histogram.edges ?? []} counts={sumCounts} unit={spec.unit || spec.label} digits={index === 'lst' ? 0 : 2} /><T s={12} lh={1.45} color={C.ink3}>Số pixel hợp lệ theo khoảng giá trị, gộp theo khu vực. Ranh giới có thể có ô trùng ở mép.</T></View></Card>
          <Card pad={14}><View style={{gap: 6}}><T w={800} s={17}>Phân bố trong các khu vực</T><BoxChart boxes={boxUnits.map(r => ({label: shortName(r.name), min: r.minimum, q25: r.q25, median: r.median, q75: r.q75, max: r.maximum}))} unit={spec.unit} digits={spec.digits} /><T s={12} lh={1.45} color={C.ink3}>Hộp: Q25–Q75; vạch đậm: trung vị; râu: min–max. Hiển thị các khu vực đã ghim để so sánh. Không phải sai số dự báo.</T></View></Card>
          <Card pad={14}><View style={{gap: 6}}><T w={800} s={17}>Trung bình cao nhất theo khu vực</T><BarChart items={[...list].sort((a, b) => b.mean - a.mean).slice(0, 8).map(r => ({label: shortName(r.name), value: r.mean, note: [`${r.valid_count.toLocaleString('vi-VN')} pixel · độ phủ ${pct(r.coverage, 1)}`]}))} unit={spec.unit} digits={spec.digits} /></View></Card>
          <Card pad={14}><View style={{gap: 6}}><T w={800} s={17}>Chỉ số theo lớp phủ đất 2021</T><BarChart items={(cover?.classes ?? []).map(c => ({label: c.class_name, value: c.mean, color: c.color || C.ink, note: [`${(c.valid_count ?? c.pixels ?? 0).toLocaleString('vi-VN')} pixel`]}))} unit={spec.unit} digits={spec.digits} /><T s={12} lh={1.45} color={C.ink3}>{cover?.note ?? ''}</T></View></Card>
        </Block>
        <Block title="So sánh chuỗi các khu vực">
          <Card pad={14}><View style={{gap: 10}}>
            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
              {pinned.map((code, i) => <Pressable key={code} onPress={() => setState({pinned: pinned.filter(c => c !== code)})} accessibilityRole="button" accessibilityLabel={`Bỏ ${names(code)} khỏi so sánh`} style={{flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: BW, borderColor: C.ink, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#fff'}}><View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: SERIES_COLORS[i % 4]}} /><T w={700} s={13}>{shortName(names(code))}</T><Icon name="x" size={14} /></Pressable>)}
              {!pinned.length && <T s={13} color={C.ink3}>Chưa chọn khu vực nào.</T>}
            </View>
            <Select label="Thêm khu vực so sánh" value="" onChange={code => { if (!code || pinned.includes(code)) return; if (pinned.length >= 4) return toast('Tối đa 4 khu vực. Bỏ bớt một khu vực trước khi thêm.', {error: true}); setState({pinned: [...pinned, code]}); }} options={[{value: '', label: '+ Thêm khu vực…'}, ...(data?.geo.features ?? []).map(f => ({value: f.properties.code, label: f.properties.full_name}))]} />
            <LineChart series={series} xs={YEARS} unit={spec.unit} height={280} domain={[Math.min(spec.min, ...wardVals), Math.max(spec.max, ...wardVals)]} yFormat={v => fmt(v, spec.digits)} />
            <T s={12} lh={1.45} color={C.ink3}>{`Chỉ vẽ mốc độ phủ ≥ ${Math.round(coverage * 100)}%; khoảng thiếu hoặc ít mẫu không nối. Ngày ảnh khác nhau giữa năm; Độ khô là chỉ số thử nghiệm.`}</T>
          </View></Card>
        </Block>
        <Block title="Khu vực giá trị cao">
          <Card pad={14}><View style={{gap: 4}}>
            {top5.length ? top5.map((r, i) => (
              <View key={r.code} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: i ? 1.5 : 0, borderTopColor: C.hair}}>
                <T mono w={800} s={14}>{String(i + 1).padStart(2, '0')}</T>
                <View style={{flex: 1}}><T w={700} s={15}>{r.name}</T><T mono s={11} color={C.ink3}>{`độ phủ ${pct(r[`${index}_coverage` as const])}`}</T></View>
                <T mono w={800} s={14}>{`${fmt(r[index], spec.digits)} ${spec.unit}`.trim()}</T>
                <Pressable onPress={() => router.navigate({pathname: '/', params: {'khu-vuc': r.code, nam: String(year), 'chi-so': index, 'che-do': 'zones'}} as any)} accessibilityRole="button" accessibilityLabel={`Xem ${r.name} trên bản đồ`} hitSlop={8} style={{width: 36, height: 36, borderWidth: 2, borderColor: C.ink, borderRadius: 8, alignItems: 'center', justifyContent: 'center'}}><Icon name="map" size={16} /></Pressable>
              </View>
            )) : <T s={14} color={C.ink3}>Chưa có khu vực đủ độ phủ ở bộ lọc này.</T>}
            <T s={12} lh={1.45} color={C.ink3} style={{marginTop: 6}}>Xếp theo giá trị chỉ số của năm đang chọn, không phải mức rủi ro đã kiểm định.</T>
          </View></Card>
        </Block>
        <Block title="Nhiệt độ và độ xanh cùng mốc">
          <Card pad={14}><View style={{gap: 8}}>
            <ScatterChart points={pts} xLabel="Độ xanh" yLabel="Nhiệt độ (°C)" onPick={p => router.navigate({pathname: '/', params: {'khu-vuc': p.code, nam: String(year)}} as any)} />
            <View style={{gap: 4}}><T mono w={700} s={11} ls={0.08} upper color={C.ink2}>Độ khô</T><Ramp colors={INDEX.tvdi.colors} min="0" max="1" height={10} /><T s={12} color={C.ink3}>Xám: thiếu / độ phủ thấp</T></View>
            <T s={12} lh={1.45} color={C.ink3}>{`${pts.length} khu vực đủ độ phủ nhiệt độ/độ xanh. Mỗi chấm là trung bình một khu vực. Tương quan không chứng minh nguyên nhân; độ khô phụ thuộc toán học vào nhiệt độ và độ xanh.`}</T>
          </View></Card>
        </Block>
        <Block title="Tương quan trung bình xã/phường">
          <Table minWidth={460} rowKey={p => p.x + p.y} rows={corr?.pairs ?? []} cols={[{key: 'pair', label: 'Cặp chỉ số', width: 150, render: p => <T w={700} s={13}>{`${p.x.toUpperCase()} – ${p.y.toUpperCase()}`}</T>}, {key: 'n', label: 'Số cặp', width: 90, num: true, render: p => <T mono s={13}>{p.n.toLocaleString('vi-VN')}</T>}, {key: 'r', label: 'Pearson r', width: 110, num: true, render: p => <T mono w={800} s={13}>{fmt(p.r, 3)}</T>}, {key: 'r2', label: 'R² đơn', width: 110, num: true, render: p => <T mono s={13}>{fmt(p.r_squared, 3)}</T>}]} />
          <T s={12} lh={1.45} color={C.ink3}>{corr?.note ?? ''}</T>
        </Block>
        <Screening router={router} />
        <Block title="Bảng thống kê đầy đủ theo khu vực">
          <Table minWidth={900} rowKey={r => r.code} rows={list} cols={[{key: 'name', label: 'Khu vực', width: 180, render: r => <T w={700} s={13}>{r.name}</T>}, {key: 'valid', label: 'Pixel hợp lệ', width: 100, num: true, render: r => <T mono s={13}>{r.valid_count.toLocaleString('vi-VN')}</T>}, {key: 'cov', label: 'Độ phủ', width: 80, num: true, render: r => <T mono s={13}>{pct(r.coverage, 1)}</T>},
            ...(['minimum', 'q25', 'median', 'mean', 'q75', 'maximum', 'stddev'] as const).map(k => ({key: k, label: {minimum: 'Min', q25: 'Q25', median: 'Trung vị', mean: 'Trung bình', q75: 'Q75', maximum: 'Max', stddev: 'Độ lệch chuẩn'}[k], width: 96, num: true, render: (r: Unit) => <T mono s={13}>{fmt(r[k], spec.digits)}</T>}))]} />
          <T s={12} lh={1.45} color={C.ink3}>Độ lệch chuẩn mô tả độ phân tán pixel, không phải độ chính xác. Trung vị là giá trị giữa của phân bố, không phải giá trị phổ biến nhất.</T>
          <View style={{flexDirection: 'row'}}><Button icon="download" label="CSV thống kê đã lọc" onPress={exportCsv} disabled={!list.length} /></View>
        </Block>
      </>}
      <View style={{height: 30}} />
    </Page>
  );
}

/** "Khu vực có độ khô cao": experimental screening from the database, not an official drought warning. */
function Screening({router}: {router: ReturnType<typeof useRouter>}) {
  const [year, setYear] = useState(2025);
  const [thr, setThr] = useState('0.8');
  const [cov, setCov] = useState(0.5);
  const [res, setRes] = useState<Row[] | null>(null);
  const [status, setStatus] = useState('');
  const n = useRef(0);
  useEffect(() => {
    const th = Number(thr), mine = ++n.current;
    if (thr.trim() === '' || !Number.isFinite(th) || th < 0 || th > 1) { setStatus('Nhập độ khô trong khoảng 0–1.'); setRes(null); return; }
    setStatus('Đang truy vấn CSDL…');
    const t = setTimeout(() => get<{units: Row[]}>(`/api/research/alerts?source=${SRC}&year=${year}&threshold=${th}&coverage=${cov}`, 30000)
      .then(r => { if (mine !== n.current) return; setRes(r.units); setStatus(`${year}: ${r.units.length} khu vực đạt độ khô ≥ ${th} và độ phủ ≥ ${Math.round(cov * 100)}%. Đây là sàng lọc thử nghiệm, không phải cấp hạn hay cảnh báo chính thức.`); })
      .catch(e => { if (mine === n.current) { setStatus('Không tải được kết quả: ' + e.message); setRes(null); } }), 350);
    return () => clearTimeout(t);
  }, [year, thr, cov]);
  return (
    <Block title="Khu vực có độ khô cao" sub="Lọc theo năm và độ phủ. Không phải cảnh báo hạn chính thức hay ngưỡng đã kiểm định.">
      <Card pad={14}><View style={{gap: 12}}>
        <Eyebrow>Sàng lọc thử nghiệm</Eyebrow>
        <Field label="Mốc ảnh"><Select label="Mốc ảnh" value={String(year)} onChange={v => setYear(+v)} options={YEARS.map(y => ({value: String(y), label: String(y)}))} /></Field>
        <Field label="Độ khô tối thiểu"><Input value={thr} onChangeText={setThr} keyboardType="decimal-pad" accessibilityLabel="Độ khô tối thiểu" /></Field>
        <Field label="Độ phủ tối thiểu"><Select label="Độ phủ tối thiểu" value={String(cov)} onChange={v => setCov(+v)} options={[{value: '0.5', label: '≥ 50%'}, {value: '0.8', label: '≥ 80%'}, {value: '0.1', label: '≥ 10% · thận trọng'}]} /></Field>
        <T s={13} lh={1.5} color={C.ink2}>{status}</T>
        {(res ?? []).slice(0, 40).map((r, i) => (
          <View key={r.code} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: i ? 1.5 : 0, borderTopColor: C.hair, borderStyle: 'dashed'}}>
            <View style={{flex: 1}}><T w={700} s={14}>{r.name}</T><T mono s={11} color={C.ink3}>{`Độ khô ${fmt(r.tvdi)} · phủ ${pct(r.tvdi_coverage)}`}</T></View>
            <Pressable onPress={() => router.navigate({pathname: '/', params: {'khu-vuc': r.code, nam: String(year), 'chi-so': 'tvdi', 'che-do': 'zones'}} as any)} accessibilityRole="button" accessibilityLabel={`Xem ${r.name} trên bản đồ`} hitSlop={8} style={{width: 36, height: 36, borderWidth: 2, borderColor: C.ink, borderRadius: 8, alignItems: 'center', justifyContent: 'center'}}><Icon name="map" size={16} /></Pressable>
          </View>
        ))}
        {(res?.length ?? 0) > 40 && <T s={12} color={C.ink3}>{`Hiện 40/${res!.length} khu vực đầu.`}</T>}
      </View></Card>
    </Block>
  );
}
