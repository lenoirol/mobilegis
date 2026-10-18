import {useEffect, useRef} from 'react';
import {Animated} from 'react-native';
import Svg, {Circle, G, Line, Path, Rect, Text as SvgText} from 'react-native-svg';
import {fmt, valid} from '@/lib/format';
import {C} from '@/ds';
import {EASE} from '@/ds/motion';
import {ChartFrame, INK, SERIES_COLORS, decimals, niceTicks, useTip, useWidth} from './kit';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const T_ATTR = {fill: C.ink2, fontSize: 11, fontFamily: 'JetBrainsMono_500Medium'};

function useGrow(key: unknown, ms = 700, delay = 0) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { v.setValue(0); Animated.timing(v, {toValue: 1, duration: ms, delay, easing: EASE, useNativeDriver: false}).start(); }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}
const Empty = ({width, height, message}: {width: number; height: number; message: string}) => <Svg width={width} height={height}><SvgText x={width / 2} y={height / 2} textAnchor="middle" fontSize={13} fill={C.ink3}>{message}</SvgText></Svg>;
function YAxis({ticks, y, left, right, format}: {ticks: number[]; y: (v: number) => number; left: number; right: number; format: (v: number) => string}) {
  return <>{ticks.map(t => <G key={t}><Line x1={left} x2={right} y1={y(t)} y2={y(t)} stroke={C.hair} strokeDasharray="3 3" /><SvgText x={left - 8} y={y(t) + 4} textAnchor="end" {...T_ATTR}>{format(t)}</SvgText></G>)}</>;
}

// ---- line chart (years on x) ------------------------------------------------------------------------------------------------------------------
export interface LinePoint {x: number; y: number | null; lines?: string[]}
export interface LineSeries {id: string; name: string; short?: string; color?: string; dashed?: boolean; points: LinePoint[]}
export function LineChart({series, xs = [2020, 2021, 2022, 2023, 2024, 2025], height = 240, compact, unit = '', yFormat, domain, minPad = 0, emptyText = 'Chưa có mốc đủ độ phủ'}: {series: LineSeries[]; xs?: number[]; height?: number; compact?: boolean; unit?: string; yFormat?: (v: number) => string; domain?: [number, number]; minPad?: number; emptyText?: string}) {
  const {width, onLayout} = useWidth();
  const H = compact ? 150 : height;
  const draw = useGrow(JSON.stringify(series.map(s => s.points.map(p => p.y))));
  return <ChartFrame width={width} height={H} onLayout={onLayout}>{width > 0 && <LineInner {...{series, xs, H, width, compact, unit, yFormat, domain, minPad, emptyText, draw}} />}</ChartFrame>;
}
function LineInner({series, xs, H, width, compact, unit, yFormat, domain, minPad, emptyText, draw}: any) {
  const tip = useTip();
  const values = series.flatMap((s: LineSeries) => s.points.map(p => p.y)).filter(valid) as number[];
  if (!values.length) return <Empty width={width} height={compact ? 120 : H} message={emptyText} />;
  const pad = {l: compact ? 40 : 54, r: compact ? 14 : 24, t: 16, b: 28};
  let lo = domain?.[0] ?? Math.min(...values), hi = domain?.[1] ?? Math.max(...values);
  if (!domain) { const m = Math.max((hi - lo) * .18, minPad ?? 0); lo -= m; hi += m; }
  const ticks = niceTicks(lo, hi, compact ? 3 : 5), d = decimals(ticks), format = yFormat || ((v: number) => fmt(v, d));
  lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks.at(-1)!);
  const x = (v: number) => pad.l + (xs.indexOf(v) / Math.max(1, xs.length - 1)) * (width - pad.l - pad.r), y = (v: number) => H - pad.b - (v - lo) / (hi - lo || 1) * (H - pad.b - pad.t);
  const labelY = new Map<number, number>();
  if (!compact && series.length > 1) {
    const ends = series.map((s: LineSeries, si: number) => { const lp = [...s.points].reverse().find(p => valid(p.y)); return lp ? {si, y: y(lp.y as number)} : null; }).filter(Boolean).sort((a: any, b: any) => a.y - b.y) as {si: number; y: number}[];
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
    ends.forEach(e => labelY.set(e.si, e.y));
  }
  return (
    <Svg width={width} height={H}>
      <YAxis ticks={ticks} y={y} left={pad.l} right={width - pad.r} format={format} />
      {xs.map((xv: number) => <SvgText key={xv} x={x(xv)} y={H - 8} textAnchor="middle" {...T_ATTR}>{String(xv)}</SvgText>)}
      {series.map((s: LineSeries, si: number) => {
        const color = s.color || SERIES_COLORS[si % SERIES_COLORS.length];
        const runs: LinePoint[][] = []; let run: LinePoint[] = [];
        for (const p of s.points) { if (valid(p.y)) run.push(p); else { runs.push(run); run = []; } }
        runs.push(run);
        const last = [...s.points].reverse().find(p => valid(p.y));
        const anchorEnd = last ? x(last.x) > width - 110 : false;
        return (
          <G key={s.id}>
            {runs.filter(r => r.length > 1).map((r, i) => <AnimatedPath key={i} d={r.map((p, k) => `${k ? 'L' : 'M'}${x(p.x).toFixed(1)} ${y(p.y as number).toFixed(1)}`).join('')} stroke={color} strokeWidth={2.4} fill="none" strokeLinejoin="round" strokeDasharray={s.dashed ? '7 4' : '1500'} strokeDashoffset={s.dashed ? 0 : draw.interpolate({inputRange: [0, 1], outputRange: [1500, 0]})} />)}
            {s.points.filter(p => valid(p.y)).map(p => <Circle key={p.x} cx={x(p.x)} cy={y(p.y as number)} r={compact ? 4.5 : 5.5} fill={color} stroke={C.ink} strokeWidth={1.6} onPress={() => tip({x: x(p.x), y: y(p.y as number), lines: [`${s.name} · ${p.x}`, `${format(p.y as number)} ${unit}`.trim(), ...(p.lines || [])]})} />)}
            {!compact && series.length === 1 && s.points.filter(p => valid(p.y)).map(p => <SvgText key={'v' + p.x} x={x(p.x)} y={y(p.y as number) - 11} textAnchor="middle" fontSize={11} fontFamily="JetBrainsMono_700Bold" fill={C.ink}>{format(p.y as number)}</SvgText>)}
            {!compact && series.length > 1 && last ? <SvgText x={anchorEnd ? x(last.x) - 8 : x(last.x) + 8} y={(labelY.get(si) ?? y(last.y as number)) - (anchorEnd ? 12 : 0) + 4} textAnchor={anchorEnd ? 'end' : 'start'} fontSize={12} fontFamily="BricolageGrotesque_700Bold" fill={color}>{s.short || s.name}</SvgText> : null}
          </G>
        );
      })}
    </Svg>
  );
}

// ---- horizontal bars ----------------------------------------------------------------------------------------------------------------------------
export interface BarItem {label: string; value: number; color?: string; note?: string[]}
export function BarChart({items, digits = 1, unit = '', rowH = 34, emptyText = 'Không có mẫu đủ độ phủ ở bộ lọc này.'}: {items: BarItem[]; digits?: number; unit?: string; rowH?: number; emptyText?: string}) {
  const {width, onLayout} = useWidth();
  const H = 6 + items.length * rowH + 8;
  const grow = useGrow(items.map(i => i.label + i.value).join('|'), 600);
  return <ChartFrame width={width} height={items.length ? H : 90} onLayout={onLayout}>{width > 0 && <BarInner {...{items, digits, unit, rowH, emptyText, width, H, grow}} />}</ChartFrame>;
}
function BarInner({items, digits, unit, rowH, emptyText, width, H, grow}: any) {
  const tip = useTip();
  if (!items.length) return <Empty width={width} height={90} message={emptyText} />;
  const left = Math.min(190, Math.max(96, Math.floor(width * .34))), right = 64, top = 6;
  const lo = Math.min(0, ...items.map((i: BarItem) => i.value)), hi = Math.max(0, ...items.map((i: BarItem) => i.value)) || 1;
  const x = (v: number) => left + (v - lo) / (hi - lo) * (width - left - right);
  return (
    <Svg width={width} height={H}>
      <Line x1={x(0)} x2={x(0)} y1={top} y2={H - 6} stroke={C.ink} strokeWidth={1.5} />
      {items.map((item: BarItem, i: number) => {
        const y = top + i * rowH, x0 = x(Math.min(0, item.value)), w = Math.max(3, Math.abs(x(item.value) - x(0)));
        const name = item.label.length > 24 ? item.label.slice(0, 23) + '…' : item.label;
        return (
          <G key={item.label + i}>
            <SvgText x={left - 10} y={y + rowH / 2 + 4} textAnchor="end" fontSize={12} fontFamily="BricolageGrotesque_600SemiBold" fill={C.ink}>{name}</SvgText>
            <AnimatedRect x={x0} y={y + 5} width={grow.interpolate({inputRange: [0, 1], outputRange: [0, w]})} height={rowH - 12} rx={3} fill={item.color || INK} onPress={() => tip({x: x(item.value), y: y + 5, lines: [item.label, `${fmt(item.value, digits)} ${unit}`.trim(), ...(item.note || [])]})} />
            <SvgText x={x(item.value) + (item.value >= 0 ? 8 : -8)} y={y + rowH / 2 + 4} textAnchor={item.value >= 0 ? 'start' : 'end'} fontSize={12} fontFamily="JetBrainsMono_700Bold" fill={C.ink}>{fmt(item.value, digits)}</SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// ---- histogram ----------------------------------------------------------------------------------------------------------------------------------------
export function Histogram({edges, counts, unit = '', digits = 0, height = 230}: {edges: number[]; counts: number[]; unit?: string; digits?: number; height?: number}) {
  const {width, onLayout} = useWidth();
  const grow = useGrow(counts.join(','), 700);
  return <ChartFrame width={width} height={height} onLayout={onLayout}>{width > 0 && <HistInner {...{edges, counts, unit, digits, height, width, grow}} />}</ChartFrame>;
}
function HistInner({edges, counts, unit, digits, height: H, width, grow}: any) {
  const tip = useTip();
  const first = counts.findIndex((n: number) => n > 0), last = counts.findLastIndex((n: number) => n > 0);
  if (first < 0) return <Empty width={width} height={H} message="Không có mẫu đủ độ phủ ở bộ lọc này." />;
  const sub: number[] = counts.slice(first, last + 1), pad = {l: 56, r: 16, t: 14, b: 40};
  const ticks = niceTicks(0, Math.max(...sub), 4), y = (v: number) => H - pad.b - v / ticks.at(-1)! * (H - pad.b - pad.t), slot = (width - pad.l - pad.r) / sub.length;
  const stride = Math.max(1, Math.ceil(sub.length / Math.floor((width - pad.l) / 56)));
  return (
    <Svg width={width} height={H}>
      <YAxis ticks={ticks} y={y} left={pad.l} right={width - pad.r} format={v => v >= 1000 ? (v / 1000).toLocaleString('vi-VN') + 'k' : String(v)} />
      {sub.map((n, i) => (
        <G key={i}>
          <AnimatedRect x={pad.l + i * slot + 1} y={grow.interpolate({inputRange: [0, 1], outputRange: [H - pad.b, y(n)]})} width={Math.max(2, slot - 2)} height={grow.interpolate({inputRange: [0, 1], outputRange: [0, Math.max(0, H - pad.b - y(n))]})} rx={2} fill={INK} onPress={() => tip({x: pad.l + i * slot + slot / 2, y: y(n), lines: [`${fmt(edges[first + i], digits)} – ${fmt(edges[first + i + 1], digits)} ${unit}`.trim(), `${n.toLocaleString('vi-VN')} pixel`]})} />
          {i % stride === 0 && <SvgText x={pad.l + i * slot} y={H - 22} fontSize={11} fontFamily="JetBrainsMono_500Medium" fill={C.ink2}>{fmt(edges[first + i], digits)}</SvgText>}
        </G>
      ))}
      <SvgText x={width - pad.r} y={H - 6} textAnchor="end" {...T_ATTR}>{unit}</SvgText>
    </Svg>
  );
}

// ---- box plot -------------------------------------------------------------------------------------------------------------------------------------------------
export interface BoxItem {label: string; min: number; q25: number; median: number; q75: number; max: number}
export function BoxChart({boxes, digits = 1, unit = '', rowH = 44}: {boxes: BoxItem[]; digits?: number; unit?: string; rowH?: number}) {
  const {width, onLayout} = useWidth();
  const H = 8 + boxes.length * rowH + 30;
  return <ChartFrame width={width} height={boxes.length ? H : 90} onLayout={onLayout}>{width > 0 && <BoxInner {...{boxes, digits, unit, rowH, width, H}} />}</ChartFrame>;
}
function BoxInner({boxes, digits, unit, rowH, width, H}: any) {
  const tip = useTip();
  if (!boxes.length) return <Empty width={width} height={90} message="Không có mẫu đủ độ phủ ở bộ lọc này." />;
  const left = Math.min(170, Math.max(90, Math.floor(width * .3))), right = 18, top = 8;
  const lo = Math.min(...boxes.map((b: BoxItem) => b.min)), hi = Math.max(...boxes.map((b: BoxItem) => b.max)), ticks = niceTicks(lo, hi, 5);
  const x = (v: number) => left + (v - ticks[0]) / ((ticks.at(-1)! - ticks[0]) || 1) * (width - left - right), d = decimals(ticks);
  return (
    <Svg width={width} height={H}>
      {ticks.map(t => <G key={t}><Line x1={x(t)} x2={x(t)} y1={top} y2={H - 24} stroke={C.hair} strokeDasharray="3 3" /><SvgText x={x(t)} y={H - 8} textAnchor="middle" {...T_ATTR}>{fmt(t, d)}</SvgText></G>)}
      {boxes.map((b: BoxItem, i: number) => {
        const cy = top + i * rowH + rowH / 2;
        return (
          <G key={b.label + i} onPress={() => tip({x: x(b.median), y: cy - 11, lines: [b.label, `Trung vị ${fmt(b.median, digits)} ${unit}`.trim(), `Q25–Q75: ${fmt(b.q25, digits)} – ${fmt(b.q75, digits)}`, `Min–Max: ${fmt(b.min, digits)} – ${fmt(b.max, digits)}`]})}>
            <SvgText x={left - 10} y={cy + 4} textAnchor="end" fontSize={12} fontFamily="BricolageGrotesque_600SemiBold" fill={C.ink}>{b.label.length > 22 ? b.label.slice(0, 21) + '…' : b.label}</SvgText>
            <Line x1={x(b.min)} x2={x(b.max)} y1={cy} y2={cy} stroke={C.ink} strokeWidth={1.5} /><Line x1={x(b.min)} x2={x(b.min)} y1={cy - 7} y2={cy + 7} stroke={C.ink} strokeWidth={1.5} /><Line x1={x(b.max)} x2={x(b.max)} y1={cy - 7} y2={cy + 7} stroke={C.ink} strokeWidth={1.5} />
            <Rect x={x(b.q25)} y={cy - 11} width={Math.max(2, x(b.q75) - x(b.q25))} height={22} rx={3} fill={C.signal} stroke={C.ink} strokeWidth={2} /><Line x1={x(b.median)} x2={x(b.median)} y1={cy - 11} y2={cy + 11} stroke={C.ink} strokeWidth={3} />
          </G>
        );
      })}
    </Svg>
  );
}

// ---- scatter ------------------------------------------------------------------------------------------------------------------------------------------------
export interface ScatterPoint {x: number; y: number; color?: string; label: string; lines?: string[]; code?: string}
export function ScatterChart({points, xLabel = '', yLabel = '', xDigits = 2, yDigits = 0, height = 320, onPick}: {points: ScatterPoint[]; xLabel?: string; yLabel?: string; xDigits?: number; yDigits?: number; height?: number; onPick?: (p: ScatterPoint) => void}) {
  const {width, onLayout} = useWidth();
  return <ChartFrame width={width} height={height} onLayout={onLayout}>{width > 0 && <ScatterInner {...{points, xLabel, yLabel, xDigits, yDigits, height, width, onPick}} />}</ChartFrame>;
}
function ScatterInner({points, xLabel, yLabel, xDigits, yDigits, height: H, width, onPick}: any) {
  const tip = useTip();
  if (!points.length) return <Empty width={width} height={120} message="Chưa có cặp giá trị đủ độ phủ" />;
  const pad = {l: 50, r: 16, t: 14, b: 44};
  const xt = niceTicks(Math.min(...points.map((p: ScatterPoint) => p.x)), Math.max(...points.map((p: ScatterPoint) => p.x)), 5), yt = niceTicks(Math.min(...points.map((p: ScatterPoint) => p.y)), Math.max(...points.map((p: ScatterPoint) => p.y)), 5);
  const x = (v: number) => pad.l + (v - xt[0]) / ((xt.at(-1)! - xt[0]) || 1) * (width - pad.l - pad.r), y = (v: number) => H - pad.b - (v - yt[0]) / ((yt.at(-1)! - yt[0]) || 1) * (H - pad.b - pad.t);
  return (
    <Svg width={width} height={H}>
      <YAxis ticks={yt} y={y} left={pad.l} right={width - pad.r} format={v => fmt(v, yDigits)} />
      {xt.map(t => <G key={t}><Line x1={x(t)} x2={x(t)} y1={pad.t} y2={H - pad.b} stroke={C.hair} strokeDasharray="3 3" /><SvgText x={x(t)} y={H - 24} textAnchor="middle" {...T_ATTR}>{fmt(t, xDigits)}</SvgText></G>)}
      <SvgText x={(pad.l + width - pad.r) / 2} y={H - 6} textAnchor="middle" {...T_ATTR}>{xLabel}</SvgText><SvgText x={6} y={12} {...T_ATTR}>{yLabel}</SvgText>
      {points.map((p: ScatterPoint, i: number) => <Circle key={i} cx={x(p.x)} cy={y(p.y)} r={5} fill={p.color || INK} stroke={C.ink} strokeWidth={0.8} onPress={() => { tip({x: x(p.x), y: y(p.y), lines: [p.label, ...(p.lines || [])]}); onPick?.(p); }} />)}
    </Svg>
  );
}
