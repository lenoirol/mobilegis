/** Thống kê (nhiều màu theo chỉ số): số tổng quan, phân bố giá trị các xã/phường, diễn biến 2020–2025 của vài khu vực, nhiệt độ theo độ xanh. */
import {memo, useMemo, useState} from 'react';
import {View} from 'react-native';
import Svg, {Circle, G, Line, Polyline, Rect, Text as SvgText} from 'react-native-svg';
import {PageBar, Screen, Seg, T} from '@/ui/kit';
import {IndexSwitch} from '@/ui/IndexSwitch';
import {IxCard} from '@/ui/IxCard';
import {C, R} from '@/ui/theme';
import {INDEX, YEARS, colorOf, fmt, shortName, type IndexKey} from '@/lib/format';
import {eligible} from '@/lib/policy';
import {CODES, getRows, names, useDataVersion} from '@/lib/data';
import {setState, useStore} from '@/lib/store';

const SERIES = ['#2a78d6', '#eb6834', '#1baf7a'];
const PINNED = ['26743', '27664', '25747'];

const Histogram = memo(function Histogram({values, k, width}: {values: number[]; k: IndexKey; width: number}) {
  const s = INDEX[k], bins = 12, lo = Math.min(...values), hi = Math.max(...values), step = (hi - lo) / bins || 1;
  const counts = Array.from({length: bins}, (_, i) => values.filter(v => v >= lo + i * step && (i === bins - 1 ? v <= hi : v < lo + (i + 1) * step)).length);
  const H = 160, pb = 22, top = Math.max(...counts, 1), bw = (width - 10) / bins;
  return (
    <Svg width={width} height={H}>
      {counts.map((c, i) => { const h = (c / top) * (H - pb - 8); return <Rect key={i} x={5 + i * bw + 1} y={H - pb - h} width={bw - 2} height={h} rx={3} fill={colorOf(lo + (i + 0.5) * step, k)} />; })}
      <SvgText x={5} y={H - 6} fontSize={10} fill={C.ink3}>{fmt(lo, s.digits)}</SvgText>
      <SvgText x={width - 5} y={H - 6} fontSize={10} fill={C.ink3} textAnchor="end">{fmt(hi, s.digits)}</SvgText>
    </Svg>
  );
});

const Lines = memo(function Lines({k, width}: {k: IndexKey; width: number}) {
  const s = INDEX[k], rows = getRows(), H = 190, pl = 34, pr = 10, pt = 10, pb = 22;
  const series = PINNED.map(code => YEARS.map(y => { const r = rows.get(code, y); return eligible(r, k) ? r![k]! : null; }));
  const all = series.flat().filter((v): v is number => v !== null); if (!all.length) return null;
  let lo = Math.min(...all), hi = Math.max(...all); const p = (hi - lo) * 0.15 || 1; lo -= p; hi += p;
  const x = (i: number) => pl + (i / (YEARS.length - 1)) * (width - pl - pr), y = (v: number) => H - pb - ((v - lo) / (hi - lo)) * (H - pt - pb);
  return (
    <Svg width={width} height={H}>
      {[0, 1, 2].map(t => <SvgText key={t} x={pl - 4} y={y(lo + ((hi - lo) * t) / 2) + 4} fontSize={10} fill={C.ink3} textAnchor="end">{fmt(lo + ((hi - lo) * t) / 2, s.digits === 1 ? 0 : 1)}</SvgText>)}
      {YEARS.map((yr, i) => <SvgText key={yr} x={x(i)} y={H - 6} fontSize={10} fill={C.ink3} textAnchor="middle">{yr}</SvgText>)}
      {series.map((ser, si) => {
        const runs: string[][] = [[]]; ser.forEach((v, i) => { if (v === null) runs.push([]); else runs[runs.length - 1].push(`${x(i)},${y(v)}`); });   // năm thiếu: ngắt đường
        return <G key={si}>{runs.filter(r => r.length > 1).map((r, j) => <Polyline key={j} points={r.join(' ')} fill="none" stroke={SERIES[si]} strokeWidth={2.5} />)}
          {ser.map((v, i) => v === null ? null : <Circle key={i} cx={x(i)} cy={y(v)} r={4} fill={SERIES[si]} stroke="#fff" strokeWidth={1.5} />)}</G>;
      })}
    </Svg>
  );
});

const Scatter = memo(function Scatter({year, width}: {year: number; width: number}) {
  const rows = getRows(), H = 220, pl = 32, pb = 24, pt = 8, pr = 8;
  const pts = CODES.map(c => rows.get(c, year)).filter(r => eligible(r, 'lst') && eligible(r, 'ndvi')) as any[];
  if (!pts.length) return null;
  const lx = Math.min(...pts.map(r => r.ndvi)), hx = Math.max(...pts.map(r => r.ndvi)), ly = Math.min(...pts.map(r => r.lst)), hy = Math.max(...pts.map(r => r.lst));
  const x = (v: number) => pl + ((v - lx) / (hx - lx || 1)) * (width - pl - pr), y = (v: number) => H - pb - ((v - ly) / (hy - ly || 1)) * (H - pt - pb);
  return (
    <Svg width={width} height={H}>
      <Line x1={pl} x2={width - pr} y1={H - pb} y2={H - pb} stroke={C.line2} /><Line x1={pl} x2={pl} y1={pt} y2={H - pb} stroke={C.line2} />
      {pts.map(r => <Circle key={r.code} cx={x(r.ndvi)} cy={y(r.lst)} r={4.5} fill={eligible(r, 'tvdi') ? colorOf(r.tvdi, 'tvdi') : '#8b8672'} stroke="#fff" strokeWidth={1} />)}
      <SvgText x={width - pr} y={H - 6} fontSize={10} fill={C.ink3} textAnchor="end">NDVI · độ xanh →</SvgText>
      <SvgText x={pl + 4} y={pt + 10} fontSize={10} fill={C.ink3}>↑ LST · nhiệt độ (°C)</SvgText>
    </Svg>
  );
});

export default function Stats() {
  useDataVersion();
  const k = useStore(s => s.index), year = useStore(s => s.year), spec = INDEX[k];
  const [w, setW] = useState(320);
  const values = useMemo(() => CODES.map(c => getRows().get(c, year)).filter(r => eligible(r, k)).map(r => r![k]!), [k, year]);
  const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const card = (title: string, child: React.ReactNode, note?: string) => (
    <View onLayout={e => setW(e.nativeEvent.layout.width - 24)} style={{backgroundColor: C.surface, borderRadius: R, borderTopWidth: 5, borderTopColor: spec.ix, padding: 12, gap: 8}}>
      <T s={16} w="800" color={spec.dark}>{title}</T>{child}{note ? <T s={12} color={C.ink3}>{note}</T> : null}
    </View>);
  const kpi = (label: string, v: string) => (
    <View style={{flex: 1, minWidth: '45%', backgroundColor: spec.ix, borderRadius: R, padding: 12, gap: 2}}>
      <T s={22} w="900" color="#fff">{v}</T><T s={11.5} w="700" color="#ffffffdd">{label}</T>
    </View>);
  return (
    <View style={{flex: 1, backgroundColor: spec.soft}}>
      <PageBar title="Thống kê" color={spec.dark} />
      <Screen bg={spec.soft}>
        <View style={{backgroundColor: spec.dark, borderRadius: 16, padding: 16, gap: 4}}>
          <T s={11.5} w="800" color="#ffffffcc">THỐNG KÊ VÀ PHÂN TÍCH</T>
          <T s={21} w="900" color="#fff">Thống kê môi trường theo xã/phường</T>
          <T s={13.5} color="#fffffff0">Tính từ giá trị trung bình của 167 xã/phường. Khu vực chưa đủ dữ liệu không được tính.</T>
        </View>
        <IndexSwitch color={spec.dark} />
        <Seg options={YEARS.map(y => ({value: y, label: String(y)}))} value={year} onChange={v => setState({year: v})} color={spec.dark} wrap />
        <IxCard k={k} />
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
          {kpi('khu vực đủ dữ liệu', `${values.length}/167`)}
          {kpi('trung bình', fmt(mean, spec.digits))}
          {kpi('thấp nhất', fmt(values.length ? Math.min(...values) : null, spec.digits))}
          {kpi('cao nhất', fmt(values.length ? Math.max(...values) : null, spec.digits))}
        </View>
        {values.length > 2 && card(`Phân bố giá trị · ${spec.code}`, <Histogram values={values} k={k} width={w} />, 'Số xã/phường theo khoảng giá trị, tô theo đúng thang màu của bản đồ.')}
        {card('Diễn biến 2020–2025', <><Lines k={k} width={w} /><View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 10}}>{PINNED.map((c, i) => <View key={c} style={{flexDirection: 'row', alignItems: 'center', gap: 5}}><View style={{width: 12, height: 4, borderRadius: 2, backgroundColor: SERIES[i]}} /><T s={12.5} w="700">{shortName(names.get(c) ?? c)}</T></View>)}</View></>,
          'Mỗi năm là một lần chụp mùa khô; năm thiếu dữ liệu không được nối.')}
        {card('Nhiệt độ và độ xanh cùng mốc', <Scatter year={year} width={w} />, 'Mỗi chấm là một xã/phường, màu theo độ khô (TVDI). Tương quan không chứng minh nguyên nhân.')}
      </Screen>
    </View>
  );
}
