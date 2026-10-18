import {useRef} from 'react';
import {Animated, Pressable, View, type StyleProp, type ViewStyle, type PressableProps} from 'react-native';
import {BW, C, RADIUS, SHADOW_SM} from './tokens';
import {EASE} from './motion';

interface BoxProps {
  children?: React.ReactNode; bg?: string; border?: string; radius?: number; shadow?: number; shadowColor?: string; style?: StyleProp<ViewStyle>; bw?: number;
}
/** Box with a hard offset shadow (web `box-shadow: 4px 4px 0 ink`). The shadow is a second view so it never changes the layout. */
export function HardBox({children, bg = C.card, border = C.ink, radius = RADIUS, shadow = SHADOW_SM, shadowColor = C.ink, style, bw = BW}: BoxProps) {
  return (
    <View style={style}>
      {shadow > 0 && <View pointerEvents="none" style={{position: 'absolute', left: shadow, top: shadow, right: -shadow, bottom: -shadow, backgroundColor: shadowColor, borderRadius: radius}} />}
      <View style={{backgroundColor: bg, borderColor: border, borderWidth: bw, borderRadius: radius}}>{children}</View>
    </View>
  );
}

interface PressBoxProps extends Omit<PressableProps, 'style' | 'children'> {
  children?: React.ReactNode | ((pressed: boolean) => React.ReactNode); bg?: string; border?: string; radius?: number; shadow?: number; shadowColor?: string; style?: StyleProp<ViewStyle>; innerStyle?: StyleProp<ViewStyle>; fill?: boolean;
}
/** Pressable HardBox: on press it sinks into its shadow, exactly like `.btn:active` on the web. */
export function PressBox({children, bg = C.card, border = C.ink, radius = RADIUS, shadow = SHADOW_SM, shadowColor = C.ink, style, innerStyle, disabled, fill, ...rest}: PressBoxProps) {
  const sink = useRef(new Animated.Value(0)).current;
  const to = (v: number) => Animated.timing(sink, {toValue: v, duration: 110, easing: EASE, useNativeDriver: true}).start();
  const move = sink.interpolate({inputRange: [0, 1], outputRange: [0, shadow]});
  const fade = sink.interpolate({inputRange: [0, 1], outputRange: [1, 0]});
  return (
    <Pressable {...rest} disabled={disabled} onPressIn={e => { to(1); rest.onPressIn?.(e); }} onPressOut={e => { to(0); rest.onPressOut?.(e); }} style={[style, disabled && {opacity: 0.45}]}>
      {({pressed}) => (
        <>
          {shadow > 0 && <Animated.View pointerEvents="none" style={{position: 'absolute', left: shadow, top: shadow, right: -shadow, bottom: -shadow, backgroundColor: shadowColor, borderRadius: radius, opacity: fade}} />}
          <Animated.View style={[{backgroundColor: bg, borderColor: border, borderWidth: BW, borderRadius: radius, transform: [{translateX: move}, {translateY: move}], ...(fill ? {flexGrow: 1} : null)}, innerStyle]}>
            {typeof children === 'function' ? children(pressed) : children}
          </Animated.View>
        </>
      )}
    </Pressable>
  );
}
