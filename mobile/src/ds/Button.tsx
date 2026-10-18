import {View, type StyleProp, type ViewStyle} from 'react-native';
import {C} from './tokens';
import {T} from './Text';
import {Icon, type IconName} from './Icon';
import {PressBox} from './HardBox';

type Tone = 'plain' | 'primary' | 'dark' | 'danger' | 'ghost';
interface Props {label?: string; icon?: IconName; onPress?: () => void; tone?: Tone; sm?: boolean; disabled?: boolean; active?: boolean; style?: StyleProp<ViewStyle>; a11y?: string; full?: boolean; iconRotate?: number}

/** `.btn`: 2px ink border, hard shadow, 700 weight. */
export function Button({label, icon, onPress, tone = 'plain', sm, disabled, active, style, a11y, full, iconRotate}: Props) {
  const bg = active || tone === 'primary' ? C.signal : tone === 'dark' ? C.ink : C.card;
  const color = tone === 'dark' ? '#fff' : tone === 'danger' ? C.err : C.ink;
  const border = tone === 'danger' ? C.err : C.ink;
  return (
    <View style={[{alignSelf: full ? 'stretch' : 'flex-start'}, style]}>
      <PressBox onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={a11y ?? label} accessibilityState={{disabled, selected: !!active}}
        bg={tone === 'ghost' ? 'transparent' : bg} border={tone === 'ghost' ? 'transparent' : border} shadow={tone === 'ghost' ? 0 : 2} shadowColor={tone === 'danger' ? C.err : C.ink}
        innerStyle={{minHeight: sm ? 34 : 42, paddingHorizontal: sm ? 11 : 16, paddingVertical: sm ? 7 : 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8}}>
        {icon && <View style={iconRotate ? {transform: [{rotate: iconRotate + 'deg'}]} : undefined}><Icon name={icon} size={sm ? 16 : 18} color={color} /></View>}
        {label ? <T w={700} s={sm ? 13 : 15} color={color}>{label}</T> : null}
      </PressBox>
    </View>
  );
}

/** `.icon-btn`: 44px square. */
export function IconButton({icon, onPress, label, active, size = 44, style}: {icon: IconName; onPress?: () => void; label: string; active?: boolean; size?: number; style?: StyleProp<ViewStyle>}) {
  return (
    <PressBox onPress={onPress} accessibilityRole="button" accessibilityLabel={label} bg={active ? C.signal : C.card} shadow={2} fill style={[{width: size, height: size}, style]} innerStyle={{alignItems: 'center', justifyContent: 'center'}}>
      <Icon name={icon} size={20} />
    </PressBox>
  );
}
