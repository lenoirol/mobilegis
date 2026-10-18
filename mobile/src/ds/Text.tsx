import {Text as RNText, type TextProps, type TextStyle} from 'react-native';
import {C} from './tokens';
import {family, type Weight} from './fonts';

interface Props extends TextProps {
  mono?: boolean; w?: Weight; s?: number; lh?: number; ls?: number; upper?: boolean; color?: string; align?: TextStyle['textAlign']; tab?: boolean;
}
/** Text with the app fonts. `ls` is letter-spacing in em (like the web CSS), `lh` line-height as a multiple of the size. */
export function T({mono, w = 400, s = 16, lh, ls, upper, color = C.ink, align, tab, style, children, ...rest}: Props) {
  const text = upper && typeof children === 'string' ? children.toLocaleUpperCase('vi-VN') : children;
  return (
    <RNText {...rest} allowFontScaling={false}
      style={[{fontFamily: family(mono ? 'mono' : 'sans', w), fontSize: s, color, lineHeight: lh ? Math.round(s * lh) : undefined, letterSpacing: ls !== undefined ? ls * s : undefined, textAlign: align, fontVariant: tab || mono ? ['tabular-nums'] : undefined, includeFontPadding: false}, style]}>
      {text}
    </RNText>
  );
}
/** Mono micro-label: 11px / 600 / .14em / uppercase, with the 18px rule in front (`.eyebrow`). */
