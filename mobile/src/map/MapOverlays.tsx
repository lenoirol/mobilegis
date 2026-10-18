import {useEffect, useRef} from 'react';
import {Animated, Pressable, View} from 'react-native';
import {IconButton, T, Icon, BW, C, RADIUS, PressBox, Eyebrow} from '@/ds';
import {EASE} from '@/ds/motion';
import {INDEX, fmt} from '@/lib/format';
import {Ramp, Legend} from '@/components/Legend';
import {CHANGE_RAMP, COVERAGE_RAMP} from './colors';
import type {Dataset, Extras} from '@/lib/data';
import type {MapView} from './MapCanvas';

/** `.bar-loader`: 4px ink bar sliding across the top while tiles load. */
export function BarLoader({on}: {on: boolean}) {
  const v = useRef(new Animated.Value(0)).current, o = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(o, {toValue: on ? 1 : 0, duration: 200, useNativeDriver: true}).start(); if (!on) return; const a = Animated.loop(Animated.timing(v, {toValue: 1, duration: 1000, easing: EASE, useNativeDriver: true})); a.start(); return () => a.stop(); }, [on]);   // eslint-disable-line react-hooks/exhaustive-deps
  return <Animated.View pointerEvents="none" style={{position: 'absolute', left: 0, right: 0, top: 0, height: 4, overflow: 'hidden', opacity: o}}><Animated.View style={{width: '40%', height: 4, backgroundColor: C.ink, transform: [{translateX: v.interpolate({inputRange: [0, 1], outputRange: [-160, 420]})}]}} /></Animated.View>;
}

/** `.map-kpis`: three small stat chips. */
export function Kpis({items}: {items: {value: string; label: string}[]}) {
  return (
    <View style={{flexDirection: 'row', gap: 6, alignSelf: 'flex-start'}}>
      {items.map(k => <PressBox key={k.label} shadow={2} innerStyle={{paddingHorizontal: 9, paddingVertical: 5}}><T mono w={800} s={16}>{k.value}</T><T mono s={9} ls={0.06} upper color={C.ink2}>{k.label}</T></PressBox>)}
    </View>
  );
}

export const Fabs = ({children}: {children: React.ReactNode}) => <View style={{gap: 8}}>{children}</View>;
export {IconButton};

/** `.legend`: collapsible colour scale; the content follows the current display mode. */
export function MapLegend({view, data, extras, open, onToggle}: {view: MapView; data: Dataset; extras: Extras | null; open: boolean; onToggle: () => void}) {
  const idx = INDEX[view.index];
  let body: React.ReactNode;
  if (view.landcover) {
    const classes = (extras?.context.worldcover?.classes ?? []).filter(c => ![70, 100].includes(c.code));
    body = <View style={{gap: 6}}><T w={800} s={13}>Lớp phủ đất · 2021</T><View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>{classes.map(c => <View key={c.code} style={{flexDirection: 'row', alignItems: 'center', gap: 4}}><View style={{width: 10, height: 10, backgroundColor: c.color, borderWidth: 1, borderColor: C.ink}} /><T s={11}>{c.name}</T></View>)}</View><T s={11} color={C.ink3}>ESA WorldCover · lấy mẫu 120 m</T></View>;
  } else if (view.display === 'change') {
    const cfg = data.products.change[view.index] as any;
    body = <View style={{gap: 6}}><T w={800} s={13}>{`Thay đổi ${idx.label} · 2025 − 2020`}</T><Ramp colors={CHANGE_RAMP} min={`${String(cfg?.min ?? -1).replace('.', ',')}`} max={`+${String(cfg?.max ?? 1).replace('.', ',')}`} unit={idx.unit} /><T s={11} color={C.ink3}>Xanh: giảm · đỏ: tăng, chỉ ở ô hợp lệ cả hai năm. Khác ngày ảnh, không phải quan hệ nhân quả.</T></View>;
  } else if (view.display === 'coverage') {
    body = <View style={{gap: 6}}><T w={800} s={13}>Độ phủ mẫu hợp lệ</T><Ramp colors={COVERAGE_RAMP} min="0%" max="100%" /><T s={11} color={C.ink3}>Tỷ lệ ô mẫu; không phải độ chính xác.</T></View>;
  } else body = <Legend index={view.index} compact />;
  return (
    <View style={{width: 252, maxWidth: '78%'}}>
      <PressBox onPress={onToggle} accessibilityRole="button" accessibilityState={{expanded: open}} shadow={2} innerStyle={{paddingHorizontal: 10, paddingVertical: 8}}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}><Icon name={open ? 'minus' : 'plus'} size={14} /><T mono w={700} s={11} ls={0.08} upper>{open ? 'Chú giải' : 'Hiện chú giải'}</T></View>
        {open && <View style={{marginTop: 8}}>{body}</View>}
      </PressBox>
    </View>
  );
}
export const StatusCallout = ({text, error}: {text: string; error?: boolean}) => (
  <View style={{borderWidth: BW, borderColor: C.ink, borderLeftWidth: 8, borderLeftColor: error ? C.err : C.coral, borderRadius: RADIUS, backgroundColor: error ? C.errBg : C.warnBg, padding: 10}}><T s={13} lh={1.4}>{text}</T></View>
);
