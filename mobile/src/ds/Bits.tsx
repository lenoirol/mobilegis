import {useEffect, useRef} from 'react';
import {Animated, View, type StyleProp, type ViewStyle} from 'react-native';
import {BW, C, RADIUS, RADIUS_LG} from './tokens';
import {T} from './Text';
import {Icon} from './Icon';
import {EASE, EASE_SPRING} from './motion';
import {HardBox} from './HardBox';

/** `.eyebrow`: 18px rule + 11px mono uppercase label. */
export function Eyebrow({children, color = C.ink2}: {children: string; color?: string}) {
  return <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}><View style={{width: 18, height: 2, backgroundColor: color === C.ink2 ? C.ink : color}} /><T mono w={600} s={11} ls={0.14} upper color={color}>{children}</T></View>;
}

/** `.chip`: pill with 2px border and mono label. */
export function Chip({children, tone = 'plain', style}: {children: string; tone?: 'plain' | 'signal'; style?: StyleProp<ViewStyle>}) {
  return <View style={[{alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderWidth: BW, borderColor: C.ink, borderRadius: 999, backgroundColor: tone === 'signal' ? C.signal : '#fff'}, style]}><T mono w={600} s={11} ls={0.06} upper>{children}</T></View>;
}

const TAGS = {ok: [C.okBg, C.okInk], low: [C.warnBg, C.warnInk], sparse: [C.sparse, C.sparseInk], missing: [C.missing, C.missingInk], signal: [C.signal, C.ink], plain: ['#fff', C.ink]} as const;
/** `.tag`: small mono badge. */
export function Tag({children, tone = 'plain'}: {children: string; tone?: keyof typeof TAGS}) {
  const [bg, fg] = TAGS[tone];
  return <View style={{alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1.5, borderColor: C.ink, borderRadius: 5, backgroundColor: bg}}><T mono w={700} s={11} lh={1.2} ls={0.04} upper color={fg}>{children}</T></View>;
}

/** `.card`: white, 2px border, 14px radius, 4px hard shadow. */
export function Card({children, flat, soft, style, pad = 20}: {children: React.ReactNode; flat?: boolean; soft?: boolean; style?: StyleProp<ViewStyle>; pad?: number}) {
  return <HardBox radius={RADIUS_LG} shadow={flat ? 0 : 4} bg={soft ? C.signalSoft : C.card} style={style}><View style={{padding: pad}}>{children}</View></HardBox>;
}

/** `.callout`: 8px left bar. */
export function Callout({children, tone = 'plain', style}: {children: React.ReactNode; tone?: 'plain' | 'warn' | 'err' | 'ok'; style?: StyleProp<ViewStyle>}) {
  const bg = {plain: C.signalSoft, warn: C.warnBg, err: C.errBg, ok: C.okBg}[tone], bar = {plain: C.ink, warn: C.coral, err: C.err, ok: C.ok}[tone];
  return <View style={[{borderWidth: BW, borderColor: C.ink, borderLeftWidth: 8, borderLeftColor: bar, borderRadius: RADIUS, backgroundColor: bg, paddingVertical: 12, paddingHorizontal: 14}, style]}>{typeof children === 'string' ? <T s={14} lh={1.55}>{children}</T> : children}</View>;
}

/** `.check`: 22px box that pops a tick (spring) when checked. */
export function CheckMark({checked}: {checked: boolean}) {
  const v = useRef(new Animated.Value(checked ? 1 : 0)).current;
  useEffect(() => { Animated.timing(v, {toValue: checked ? 1 : 0, duration: 160, easing: EASE_SPRING, useNativeDriver: true}).start(); }, [checked]);   // eslint-disable-line react-hooks/exhaustive-deps
  return <View style={{width: 22, height: 22, borderWidth: BW, borderColor: C.ink, borderRadius: 5, backgroundColor: checked ? C.signal : '#fff', alignItems: 'center', justifyContent: 'center'}}><Animated.View style={{transform: [{scale: v}]}}><Icon name="check" size={16} /></Animated.View></View>;
}

/** `.skeleton`: block with a yellow shimmer sweeping across. */
export function Skeleton({height = 20, style}: {height?: number; style?: StyleProp<ViewStyle>}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { const a = Animated.loop(Animated.timing(v, {toValue: 1, duration: 1300, easing: EASE, useNativeDriver: true})); a.start(); return () => a.stop(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={[{height, backgroundColor: C.paper2, borderRadius: RADIUS, overflow: 'hidden'}, style]}>
      <Animated.View style={{position: 'absolute', top: 0, bottom: 0, width: '60%', backgroundColor: '#ffd60a66', transform: [{translateX: v.interpolate({inputRange: [0, 1], outputRange: [-200, 420]})}, {skewX: '-18deg'}]}} />
    </View>
  );
}

/** `.reveal`: fade and rise by 14px, staggered by 55ms per item. */
export function Reveal({children, index = 0, style}: {children: React.ReactNode; index?: number; style?: StyleProp<ViewStyle>}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(v, {toValue: 1, duration: 550, delay: index * 55, easing: EASE, useNativeDriver: true}).start(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  return <Animated.View style={[{opacity: v, transform: [{translateY: v.interpolate({inputRange: [0, 1], outputRange: [14, 0]})}]}, style]}>{children}</Animated.View>;
}

/** `.dot`: pulsing status dot. */
export function PulseDot({color = C.ok}: {color?: string}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { const a = Animated.loop(Animated.timing(v, {toValue: 1, duration: 2000, easing: EASE, useNativeDriver: true})); a.start(); return () => a.stop(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={{width: 8, height: 8}}>
      <Animated.View style={{position: 'absolute', left: 0, top: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: color + '66', opacity: v.interpolate({inputRange: [0, .7, 1], outputRange: [1, 0.4, 0]}), transform: [{scale: v.interpolate({inputRange: [0, 1], outputRange: [1, 2.8]})}]}} />
      <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: color}} />
    </View>
  );
}
