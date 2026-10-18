import {useEffect, useMemo, useRef, useState} from 'react';
import {Animated, Pressable, View} from 'react-native';
import Svg, {Circle, Path, Rect, Text as SvgText} from 'react-native-svg';
import {BW, C, Icon, PressBox, T} from '@/ds';
import {EASE} from '@/ds/motion';
import {get} from '@/lib/api';
import type {Geo} from '@/lib/data';

const W = 240, H = 160, RED = '#ff5a36';
const LEVELS = [{id: 'world', label: 'Thế giới'}, {id: 'vietnam', label: 'Việt Nam'}, {id: 'city', label: 'TP.HCM'}] as const;
type Level = typeof LEVELS[number]['id'];
export interface ViewBounds {west: number; south: number; east: number; north: number}
const CAPTION: Record<Level, string> = {
  world: 'Vị trí TP.HCM trên thế giới. Chạm tab Việt Nam hoặc TP.HCM để xem gần hơn.',
  vietnam: 'TP.HCM sau sáp nhập (gồm Bình Dương, Bà Rịa – Vũng Tàu cũ), không gồm Côn Đảo.',
  city: 'Khung đỏ: vùng bản đồ đang xem. Chạm vào hình để di chuyển tới đó.',
};

/** Equirectangular projection fitted to the commune boundaries (cos-lat corrected), so the viewport box can be placed and a tap converted back to coordinates. */
function cityProjection(geo: Geo) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const walk = (c: any): void => { if (typeof c[0] === 'number') { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); } else c.forEach(walk); };
  geo.features.forEach(f => walk(f.geometry.coordinates));
  const k = Math.cos((y0 + y1) / 2 * Math.PI / 180), pad = 8, s = Math.min((W - 2 * pad) / ((x1 - x0) * k), (H - 2 * pad) / (y1 - y0));
  const ox = (W - (x1 - x0) * k * s) / 2, oy = (H - (y1 - y0) * s) / 2;
  return {project: (lng: number, lat: number): [number, number] => [ox + (lng - x0) * k * s, oy + (y1 - lat) * s], invert: (x: number, y: number): [number, number] => [(x - ox) / (k * s) + x0, y1 - (y - oy) / s]};
}
const ringPath = (ring: number[][], project: (a: number, b: number) => [number, number]) => ring.map(([lng, lat], i) => { const [x, y] = project(lng, lat); return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); }).join('') + 'Z';

/** SVG text with a halo (react-native-svg has no paint-order): stroke pass first, fill pass on top. */
function Halo({x, y, size, weight = '600', fill = C.ink, halo = '#fff', hw = 3, style, anchor, children}: {x: number; y: number; size: number; weight?: string; fill?: string; halo?: string; hw?: number; style?: 'italic'; anchor?: 'start' | 'middle' | 'end'; children: string}) {
  const common = {x, y, fontSize: size, fontWeight: weight as any, fontStyle: style, textAnchor: anchor};
  return <><SvgText {...common} fill={halo} stroke={halo} strokeWidth={hw} strokeLinejoin="round">{children}</SvgText><SvgText {...common} fill={fill}>{children}</SvgText></>;
}
function Pulse({x, y}: {x: number; y: number}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { const a = Animated.loop(Animated.timing(v, {toValue: 1, duration: 1800, easing: EASE, useNativeDriver: true})); a.start(); return () => a.stop(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  return <Animated.View pointerEvents="none" style={{position: 'absolute', left: `${x / W * 100}%`, top: `${y / H * 100}%`, width: 0, height: 0, opacity: v.interpolate({inputRange: [0, 1], outputRange: [0.45, 0]})}}><Animated.View style={{position: 'absolute', left: -9, top: -9, width: 18, height: 18, borderRadius: 9, backgroundColor: RED, transform: [{scale: v.interpolate({inputRange: [0, 1], outputRange: [0.6, 1.8]})}]}} /></Animated.View>;
}

/** "Bản đồ định vị": small inset placing the study area in the world, in Việt Nam and inside the city. The outlines are bundled in /data/locator.json, so it needs no map tiles. */
export function Locator({geo, bounds, selected, onClose, onFit, onFocus}: {geo: Geo; bounds: ViewBounds | null; selected: string | null; onClose: () => void; onFit: () => void; onFocus: (lat: number, lng: number) => void}) {
  const [level, setLevel] = useState<Level>('world');
  const [base, setBase] = useState<any>(null);
  const [box, setBox] = useState({w: 1, h: 1});
  useEffect(() => { get('/data/locator.json', 20000).then(setBase).catch(() => setBase(false)); }, []);
  useEffect(() => { if (base === false && level !== 'city') setLevel('city'); }, [base, level]);
  const proj = useMemo(() => cityProjection(geo), [geo]);
  const cityPaths = useMemo(() => geo.features.map(f => { const g = f.geometry, polys: number[][][][] = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; return {code: f.properties.code, d: polys.map(p => p.map(r => ringPath(r, proj.project)).join('')).join('')}; }), [geo, proj]);
  const w = base?.world, v = base?.vietnam;
  let view: {x: number; y: number; w: number; h: number} | null = null;
  if (bounds) { const [ax, ay] = proj.project(bounds.west, bounds.north), [bx, by] = proj.project(bounds.east, bounds.south); const x = Math.max(-2, ax), y = Math.max(-2, ay), ww = Math.min(W + 2, bx) - x, hh = Math.min(H + 2, by) - y; if (ww > 0 && hh > 0) view = {x, y, w: Math.max(ww, 4), h: Math.max(hh, 4)}; }
  const dot = (x: number, y: number, label?: string, dx = 7) => <><Circle cx={x} cy={y} r={4} fill={RED} stroke={C.ink} strokeWidth={1.5} />{label ? <Halo x={x + dx} y={y + 4} size={10} weight="800">{label}</Halo> : null}</>;
  const tap = (e: any) => {
    const x = e.nativeEvent.locationX / box.w * W, y = e.nativeEvent.locationY / box.h * H;
    if (level === 'city') { const [lng, lat] = proj.invert(x, y); onFocus(lat, lng); } else { setLevel(level === 'world' ? 'vietnam' : 'city'); onFit(); }
  };
  const pulse = level === 'world' && w ? w.dot : level === 'vietnam' && v ? v.dot : null;
  return (
    <PressBox shadow={4} radius={14} bg="#fff" innerStyle={{padding: 9, gap: 7, width: 232}}>
      <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
        <T mono w={700} s={11} ls={0.12} upper>Bản đồ định vị</T>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Ẩn bản đồ định vị" hitSlop={10} style={{width: 26, height: 26, borderWidth: 1.5, borderColor: C.ink, borderRadius: 7, alignItems: 'center', justifyContent: 'center'}}><Icon name="x" size={14} /></Pressable>
      </View>
      <View style={{flexDirection: 'row', gap: 4}}>{LEVELS.map(l => <Pressable key={l.id} onPress={() => setLevel(l.id)} accessibilityRole="button" accessibilityState={{selected: level === l.id}} style={{flex: 1, paddingVertical: 7, borderWidth: 1.5, borderColor: C.ink, borderRadius: 7, backgroundColor: level === l.id ? C.signal : '#fff', alignItems: 'center'}}><T mono w={700} s={11}>{l.label}</T></Pressable>)}</View>
      <Pressable onPress={tap} onLayout={e => setBox({w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height})} accessibilityRole="image" accessibilityLabel={CAPTION[level]} style={{borderWidth: 1.5, borderColor: C.ink, borderRadius: 8, overflow: 'hidden', backgroundColor: '#eef2ff', aspectRatio: 3 / 2}}>
        {base === null ? <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}><T s={12} color={C.ink3}>Đang tải…</T></View> : (
          <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%">
            {level === 'world' && w && <><Path d={w.sphere} fill="#dfe8ff" stroke={C.ink} strokeWidth={1.4} /><Path d={w.graticule} fill="none" stroke={C.ink} strokeOpacity={0.12} strokeWidth={0.6} /><Path d={w.land} fill="#fffdf6" stroke={C.ink} strokeWidth={0.5} strokeLinejoin="round" /><Path d={w.vn} fill={C.signal} stroke={C.ink} strokeWidth={0.8} strokeLinejoin="round" />{dot(w.dot[0], w.dot[1], 'TP.HCM')}</>}
            {level === 'vietnam' && v && <><Rect width={W} height={H} fill="#dfe8ff" /><Path d={v.neighbours} fill="#fffdf6" stroke={C.ink} strokeWidth={0.5} strokeLinejoin="round" /><Path d={v.vn} fill={C.signal} stroke={C.ink} strokeWidth={0.8} strokeLinejoin="round" /><Path d={v.city} fill={RED} stroke={C.ink} strokeWidth={0.6} />
              <SvgText x={v.sea.at[0]} y={v.sea.at[1]} fontSize={8} fontStyle="italic" fontWeight="600" fill="#3b5bcc" textAnchor="middle">{v.sea.name}</SvgText>
                            {v.islands.map((i: any) => <Circle key={'c' + i.name} cx={i.at[0]} cy={i.at[1]} r={1.8} fill={C.ink} />)}
              {v.islands.map((i: any) => <Halo key={'t' + i.name} x={i.at[0] + 4} y={i.at[1] + 3} size={6.5} halo="#dfe8ff" hw={2}>{i.name}</Halo>)}
              {dot(v.dot[0], v.dot[1], 'TP.HCM', -46)}</>}
            {level === 'city' && <><Rect width={W} height={H} fill="#dfe8ff" />{cityPaths.map(p => <Path key={p.code} d={p.d} fill={p.code === selected ? C.signal : '#fffdf6'} stroke={C.ink} strokeOpacity={p.code === selected ? 1 : 0.55} strokeWidth={p.code === selected ? 0.8 : 0.35} />)}{view && <Rect x={view.x} y={view.y} width={view.w} height={view.h} fill="none" stroke={RED} strokeWidth={2.5} strokeDasharray="6 3" />}</>}
          </Svg>
        )}
        {pulse && <Pulse x={pulse[0]} y={pulse[1]} />}
      </Pressable>
      <T s={11.5} lh={1.4} color={C.ink3}>{CAPTION[level]}</T>
    </PressBox>
  );
}
