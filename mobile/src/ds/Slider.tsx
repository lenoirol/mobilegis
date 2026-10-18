import {useRef, useState} from 'react';
import {PanResponder, View} from 'react-native';
import {BW, C} from './tokens';

/** `input[type=range]`: ink-filled track with a yellow square thumb. Discrete steps. */
export function Slider({min, max, step = 1, value, onChange, disabled, label}: {min: number; max: number; step?: number; value: number; onChange: (v: number) => void; disabled?: boolean; label?: string}) {
  const [width, setWidth] = useState(0);
  const THUMB = 26, track = Math.max(1, width - THUMB);
  const ref = useRef({min, max, step, track, onChange, disabled});
  ref.current = {min, max, step, track, onChange, disabled};
  const pick = (px: number) => { const r = ref.current; if (r.disabled) return; const t = Math.max(0, Math.min(1, (px - THUMB / 2) / r.track)); const v = Math.round((r.min + t * (r.max - r.min)) / r.step) * r.step; r.onChange(Math.max(r.min, Math.min(r.max, v))); };
  const pan = useRef(PanResponder.create({onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true, onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: e => pick(e.nativeEvent.locationX), onPanResponderMove: e => pick(e.nativeEvent.locationX)})).current;
  const t = max === min ? 0 : (value - min) / (max - min);
  return (
    <View accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{min, max, now: value}} onLayout={e => setWidth(e.nativeEvent.layout.width)} {...pan.panHandlers} style={{height: 34, justifyContent: 'center', opacity: disabled ? 0.45 : 1}}>
      <View style={{height: 10, borderWidth: BW, borderColor: C.ink, borderRadius: 999, backgroundColor: '#fff', overflow: 'hidden'}} pointerEvents="none"><View style={{width: `${t * 100}%`, height: '100%', backgroundColor: C.ink}} /></View>
      <View pointerEvents="none" style={{position: 'absolute', left: t * track, top: 4, width: THUMB, height: THUMB, backgroundColor: C.signal, borderWidth: BW, borderColor: C.ink, borderRadius: 6}} />
    </View>
  );
}
