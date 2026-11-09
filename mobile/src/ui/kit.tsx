/** Các khối giao diện dùng chung. Nhẹ: không hiệu ứng nặng, không thư viện ngoài, mọi thành phần được memo. */
import {memo, type ReactNode} from 'react';
import {ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useRouter} from 'expo-router';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {C, R, SHADOW} from './theme';
import {Icon, type IconName} from './Icon';
import {INDEX, type IndexKey} from '@/lib/format';

export function T({s = 15, w = '400', color = C.ink, style, children, lines, center}: {s?: number; w?: TextStyle['fontWeight']; color?: string; style?: StyleProp<TextStyle>; children: ReactNode; lines?: number; center?: boolean}) {
  return <Text allowFontScaling={false} numberOfLines={lines} style={[{fontSize: s, fontWeight: w, color, lineHeight: Math.round(s * 1.35), textAlign: center ? 'center' : undefined}, style]}>{children}</Text>;
}

export const Card = memo(function Card({children, style, tint}: {children: ReactNode; style?: StyleProp<ViewStyle>; tint?: string}) {
  return <View style={[st.card, tint ? {backgroundColor: tint, borderColor: 'transparent'} : null, style]}>{children}</View>;
});

export function Btn({label, icon, onPress, tone = 'plain', color, small, disabled, style}: {label?: string; icon?: IconName; onPress?: () => void; tone?: 'plain' | 'primary' | 'ghost'; color?: string; small?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>}) {
  const bg = tone === 'primary' ? (color ?? C.accent) : tone === 'ghost' ? 'transparent' : C.surface, fg = tone === 'primary' ? '#fff' : (color ?? C.ink);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} android_ripple={{color: '#0000001a'}}
      style={({pressed}) => [st.btn, small && st.btnSm, {backgroundColor: bg, borderColor: tone === 'plain' ? (color ?? C.line2) : 'transparent', opacity: disabled ? 0.45 : pressed ? 0.85 : 1}, style]}>
      {icon && <Icon name={icon} size={small ? 16 : 18} color={fg} />}
      {label ? <T s={small ? 13 : 14.5} w="700" color={fg}>{label}</T> : null}
    </Pressable>
  );
}

/** Nút chọn một trong nhiều (không hoạt ảnh trượt để nhẹ máy). */
export function Seg<V extends string | number>({options, value, onChange, color = C.accent, wrap}: {options: {value: V; label: string; sub?: string}[]; value: V; onChange: (v: V) => void; color?: string; wrap?: boolean}) {
  return (
    <View style={[st.seg, wrap && {flexWrap: 'wrap'}]}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <Pressable key={String(o.value)} onPress={() => onChange(o.value)} accessibilityRole="button" accessibilityState={{selected: on}}
            style={[st.segItem, wrap && {flexBasis: '30%'}, on && {backgroundColor: color}]}>
            <T s={13.5} w={on ? '800' : '600'} color={on ? '#fff' : C.ink2} center>{o.label}</T>
            {o.sub ? <T s={10.5} w="600" color={on ? '#ffffffd0' : C.ink3} center>{o.sub}</T> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Thanh tiêu đề trang (có nút quay lại khi là trang con). */
export function PageBar({title, back, color, right}: {title: string; back?: boolean; color?: string; right?: ReactNode}) {
  const insets = useSafeAreaInsets(), router = useRouter();
  return (
    <View style={[st.pagebar, {paddingTop: insets.top + 8, backgroundColor: color ?? C.surface, borderBottomColor: color ? 'transparent' : C.line}]}>
      {back && <Pressable hitSlop={10} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Quay lại" style={{padding: 4}}><Icon name="back" size={22} color={color ? '#fff' : C.ink} /></Pressable>}
      <T s={18} w="800" color={color ? '#fff' : C.ink} style={{flex: 1}} lines={1}>{title}</T>
      {right}
    </View>
  );
}

export function Screen({children, bg = C.bg, scroll = true, pad = true}: {children: ReactNode; bg?: string; scroll?: boolean; pad?: boolean}) {
  if (!scroll) return <View style={{flex: 1, backgroundColor: bg}}>{children}</View>;
  return <ScrollView style={{flex: 1, backgroundColor: bg}} contentContainerStyle={pad ? {padding: 14, paddingBottom: 28, gap: 12} : undefined} keyboardShouldPersistTaps="handled" removeClippedSubviews>{children}</ScrollView>;
}

/** Dải màu của thang chỉ số. */
export const Ramp = memo(function Ramp({k, height = 8, width = '100%' as any}: {k: IndexKey; height?: number; width?: any}) {
  const c = INDEX[k].colors;
  return (
    <Svg width={width} height={height}>
      <Defs><LinearGradient id={'g' + k} x1="0" y1="0" x2="1" y2="0">{c.map((col, i) => <Stop key={i} offset={i / (c.length - 1)} stopColor={col} />)}</LinearGradient></Defs>
      <Rect x="0" y="0" width="100%" height={height} rx={height / 2} fill={`url(#g${k})`} />
    </Svg>
  );
});

export const Dot = ({color, size = 10}: {color: string; size?: number}) => <View style={{width: size, height: size, borderRadius: 3, backgroundColor: color}} />;
export const Loading = ({text}: {text?: string}) => <View style={{padding: 24, alignItems: 'center', gap: 8}}><ActivityIndicator color={C.accent} />{text ? <T s={13} color={C.ink3}>{text}</T> : null}</View>;
export function Callout({children, tone = 'info'}: {children: ReactNode; tone?: 'info' | 'warn' | 'err'}) {
  const bg = tone === 'warn' ? C.warnBg : tone === 'err' ? C.errBg : C.accentSoft, fg = tone === 'warn' ? C.warnInk : tone === 'err' ? C.err : C.accent2;
  return <View style={{backgroundColor: bg, borderRadius: R, padding: 12, borderLeftWidth: 4, borderLeftColor: fg}}><T s={13.5} color={fg}>{children}</T></View>;
}

export const st = StyleSheet.create({
  card: {backgroundColor: C.surface, borderRadius: R, borderWidth: 1, borderColor: C.line, padding: 14, gap: 8},
  btn: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, paddingHorizontal: 14, borderRadius: R, borderWidth: 1},
  btnSm: {minHeight: 34, paddingHorizontal: 10, borderRadius: 10},
  seg: {flexDirection: 'row', backgroundColor: C.bg2, borderRadius: R, padding: 3, gap: 3},
  segItem: {flex: 1, minHeight: 38, borderRadius: 9, justifyContent: 'center', paddingHorizontal: 4, paddingVertical: 4},
  pagebar: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: 1},
  float: {backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: R, borderWidth: 1, borderColor: C.line, ...SHADOW},
});
