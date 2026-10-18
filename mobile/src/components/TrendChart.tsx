import {useEffect, useRef} from 'react';
import {Animated, View} from 'react-native';
import Svg, {Circle, Line, Path, Text as SvgText} from 'react-native-svg';
import {INDEX, fmt, YEARS, type IndexKey} from '@/lib/format';
import {eligible} from '@/lib/policy';
import type {RowIndex} from '@/lib/data';
import {C, T} from '@/ds';
import {EASE} from '@/ds/motion';

const W = 320, H = 150, PAD = {l: 38, r: 10, t: 12, b: 24};
const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Change over the six dry-season dates for one commune. Only dates with >= 50 % coverage are drawn and gaps are never bridged. The line draws itself in. */
export function TrendChart({rows, code, index, color = C.ink}: {rows: RowIndex; code: string; index: IndexKey; color?: string}) {
  const spec = INDEX[index];
  const points = YEARS.map(year => { const r = rows.get(code, year); return {year, y: eligible(r, index) ? (r![index] as number) : null}; });
  const values = points.filter(p => p.y !== null).map(p => p.y as number);
  const draw = useRef(new Animated.Value(0)).current;
  useEffect(() => { draw.setValue(0); Animated.timing(draw, {toValue: 1, duration: 700, easing: EASE, useNativeDriver: false}).start(); }, [code, index]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!values.length) return <View style={{height: 70, alignItems: 'center', justifyContent: 'center'}}><T s={13} color={C.ink3}>Chưa có mốc nào đạt độ phủ 50%</T></View>;
  const pad = index === 'lst' ? 1 : .03, lo = Math.min(...values) - pad, hi = Math.max(...values) + pad;
  const x = (year: number) => PAD.l + (year - YEARS[0]) / (YEARS.at(-1)! - YEARS[0]) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  let path = '', pen = false;
  for (const p of points) { if (p.y === null) { pen = false; continue; } path += `${pen ? 'L' : 'M'}${x(p.year).toFixed(1)} ${y(p.y).toFixed(1)} `; pen = true; }
  return (
    <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} accessibilityLabel={`Biểu đồ ${spec.name} theo năm`}>
      {[lo, (lo + hi) / 2, hi].map((v, i) => <Line key={i} x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke={C.hair} strokeDasharray="3 3" />)}
      {[lo, hi].map((v, i) => <SvgText key={i} x={PAD.l - 4} y={y(v) + 4} fontSize={10} fill={C.ink2} textAnchor="end">{fmt(v, spec.digits)}</SvgText>)}
      {YEARS.map(yr => <SvgText key={yr} x={x(yr)} y={H - 6} fontSize={10} fill={C.ink2} textAnchor="middle">{yr}</SvgText>)}
      <AnimatedPath d={path} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeDasharray="1200" strokeDashoffset={draw.interpolate({inputRange: [0, 1], outputRange: [1200, 0]})} />
      {points.filter(p => p.y !== null).map(p => <Circle key={p.year} cx={x(p.year)} cy={y(p.y as number)} r={4.5} fill={C.signal} stroke={C.ink} strokeWidth={2} />)}
    </Svg>
  );
}
