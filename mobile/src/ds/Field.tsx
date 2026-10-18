import {useState} from 'react';
import {Pressable, TextInput, View, type TextInputProps} from 'react-native';
import {BW, C, RADIUS} from './tokens';
import {T} from './Text';
import {family} from './fonts';

/** `.field`: mono 11px uppercase label above a control. */
export function Field({label, children}: {label: string; children: React.ReactNode}) {
  return <View style={{gap: 6}}><T mono w={600} s={11} lh={1.2} ls={0.1} upper color={C.ink2}>{label}</T>{children}</View>;
}

/** `.input`: 44px, 2px border; moves 1px up-left with a soft shadow when focused. */
export function Input(props: TextInputProps & {multiline?: boolean}) {
  const [focus, setFocus] = useState(false);
  const {style, onFocus, onBlur, ...rest} = props;
  const min = props.multiline ? 96 : 44;
  return (
    <View style={{minHeight: min}}>
      {focus && <View pointerEvents="none" style={{position: 'absolute', left: 2, top: 2, right: -2, bottom: -2, backgroundColor: C.ink, borderRadius: RADIUS}} />}
      <View style={focus ? {marginLeft: -1, marginTop: -1} : undefined}>
        <TextInput placeholderTextColor={C.ink3} {...rest} onFocus={e => { setFocus(true); onFocus?.(e); }} onBlur={e => { setFocus(false); onBlur?.(e); }}
          style={[{minHeight: min, paddingHorizontal: 12, paddingVertical: 10, borderWidth: BW, borderColor: C.ink, borderRadius: RADIUS, backgroundColor: '#fff', fontFamily: family('sans', 500), fontSize: 15, color: C.ink, textAlignVertical: props.multiline ? 'top' : 'center'}, style]} />
      </View>
    </View>
  );
}

/** Password field with the web's "Hiện / Ẩn" toggle. */
export function PasswordInput(props: TextInputProps) {
  const [show, setShow] = useState(false);
  return (
    <View>
      <Input {...props} secureTextEntry={!show} autoCapitalize="none" autoCorrect={false} style={[{paddingRight: 64}, props.style]} />
      <Pressable onPress={() => setShow(s => !s)} accessibilityRole="button" accessibilityLabel={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} hitSlop={8} style={{position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center'}}><T w={700} s={13}>{show ? 'Ẩn' : 'Hiện'}</T></Pressable>
    </View>
  );
}
