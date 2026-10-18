import {createContext, useCallback, useContext, useEffect, useRef, useState} from 'react';
import {Animated, LayoutChangeEvent, View} from 'react-native';
import {C, T} from '@/ds';
import {EASE} from '@/ds/motion';

/** Colour order of the chart kit (blue, orange, aqua, yellow), same as the web charts. */
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];
export const INK = C.ink;

export function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (lo === hi) { const pad = Math.abs(lo) * .1 || 1; lo -= pad; hi += pad; }
  const step0 = (hi - lo) / Math.max(1, count - 1), mag = 10 ** Math.floor(Math.log10(step0)), norm = step0 / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step * .5; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}
export const decimals = (ticks: number[]) => { const step = Math.abs((ticks[1] ?? 1) - ticks[0]); return step >= 1 ? 0 : step >= .1 ? 1 : 2; };

/** Width of the container (charts are redrawn when it changes). */
export function useWidth(min = 240) {
  const [w, setW] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => { const next = Math.max(min, Math.floor(e.nativeEvent.layout.width)); setW(p => (p === next ? p : next)); }, [min]);
  return {width: w, onLayout};
}

/** Tap a mark to read it: a small ink bubble placed above the mark (no hover on a phone). */
type Tip = {x: number; y: number; lines: string[]} | null;
const TipCtx = createContext<(t: Tip) => void>(() => {});
export const useTip = () => useContext(TipCtx);
export function ChartFrame({width, height, onLayout, children}: {width: number; height: number; onLayout: (e: LayoutChangeEvent) => void; children: React.ReactNode}) {
  const [tip, setTip] = useState<Tip>(null);
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => { fade.setValue(0); if (tip) Animated.timing(fade, {toValue: 1, duration: 160, easing: EASE, useNativeDriver: true}).start(); }, [tip]);   // eslint-disable-line react-hooks/exhaustive-deps
  const bw = 180;
  return (
    <TipCtx.Provider value={t => setTip(cur => (cur && t && cur.x === t.x && cur.y === t.y ? null : t))}>
      <View onLayout={onLayout} style={{width: '100%', minHeight: height}} onStartShouldSetResponderCapture={() => false}>
        {width > 0 && children}
        {tip && (
          <Animated.View pointerEvents="none" style={{position: 'absolute', left: Math.max(4, Math.min(width - bw - 4, tip.x - bw / 2)), top: Math.max(0, tip.y - 14 - tip.lines.length * 17 - 14), width: bw, opacity: fade, backgroundColor: C.ink, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10, gap: 1}}>
            {tip.lines.map((l, i) => <T key={i} w={i === 0 ? 700 : 500} s={12} lh={1.25} color="#fff">{l}</T>)}
          </Animated.View>
        )}
      </View>
    </TipCtx.Provider>
  );
}
