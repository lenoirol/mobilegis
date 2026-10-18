import {useEffect, useRef, useState} from 'react';
import {Animated, Pressable, View, type LayoutChangeEvent, type StyleProp, type ViewStyle} from 'react-native';
import {BW, C, RADIUS} from './tokens';
import {T} from './Text';
import {EASE} from './motion';

export interface SegOption<V extends string | number> {value: V; label: string; disabled?: boolean}
interface Props<V extends string | number> {options: SegOption<V>[]; value: V; onChange: (v: V) => void; layout?: 'row' | 'grid2' | 'col'; label?: string; style?: StyleProp<ViewStyle>; scroll?: boolean}

/** `.seg`: segmented control whose yellow thumb slides (and resizes) to the chosen option. */
export function Segmented<V extends string | number>({options, value, onChange, layout = 'row', label, style}: Props<V>) {
  const [boxes, setBoxes] = useState<Record<string, {x: number; y: number; w: number; h: number}>>({});
  const x = useRef(new Animated.Value(0)).current, y = useRef(new Animated.Value(0)).current, w = useRef(new Animated.Value(0)).current, h = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);
  const box = boxes[String(value)];
  useEffect(() => {
    if (!box) return;
    if (!placed.current) { x.setValue(box.x); y.setValue(box.y); w.setValue(box.w); h.setValue(box.h); placed.current = true; return; }
    Animated.parallel([x, y, w, h].map((v, i) => Animated.timing(v, {toValue: [box.x, box.y, box.w, box.h][i], duration: 320, easing: EASE, useNativeDriver: false}))).start();
  }, [box?.x, box?.y, box?.w, box?.h]);   // eslint-disable-line react-hooks/exhaustive-deps
  const wrap: ViewStyle = layout === 'row' ? {flexDirection: 'row'} : layout === 'grid2' ? {flexDirection: 'row', flexWrap: 'wrap'} : {};
  const cell: ViewStyle = layout === 'row' ? {flex: 1} : layout === 'grid2' ? {width: '50%'} : {};
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[{position: 'relative', borderWidth: BW, borderColor: C.ink, borderRadius: RADIUS, backgroundColor: '#fff', padding: 3}, wrap, style]}>
      <Animated.View pointerEvents="none" style={{position: 'absolute', left: 3, top: 3, width: w, height: h, transform: [{translateX: x}, {translateY: y}], backgroundColor: C.signal, borderWidth: BW, borderColor: C.ink, borderRadius: 5, opacity: box ? 1 : 0}} />
      {options.map(o => (
        <Pressable key={String(o.value)} disabled={o.disabled} accessibilityRole="radio" accessibilityState={{selected: o.value === value, disabled: o.disabled}} onPress={() => onChange(o.value)}
          onLayout={(e: LayoutChangeEvent) => { const l = e.nativeEvent.layout; setBoxes(b => { const p = b[String(o.value)]; return p && p.x === l.x && p.y === l.y && p.w === l.width && p.h === l.height ? b : {...b, [String(o.value)]: {x: l.x, y: l.y, w: l.width, h: l.height}}; }); }}
          style={[{minHeight: 38, paddingHorizontal: 12, paddingVertical: 9, alignItems: 'center', justifyContent: 'center', opacity: o.disabled ? 0.4 : 1}, cell]}>
          <T w={700} s={14} align="center">{o.label}</T>
        </Pressable>
      ))}
    </View>
  );
}
