import {useEffect, useRef} from 'react';
import {Animated, Modal, Pressable, View} from 'react-native';
import {BW, C, RADIUS_LG} from './tokens';
import {EASE, EASE_SPRING} from './motion';

/** `dialog`: dark backdrop, white card with 7px hard shadow, springs in from 18px below. */
export function Dialog({visible, onClose, children}: {visible: boolean; onClose: () => void; children: React.ReactNode}) {
  const v = useRef(new Animated.Value(0)).current, b = useRef(new Animated.Value(0)).current;
  useEffect(() => { if (visible) { v.setValue(0); b.setValue(0); Animated.parallel([Animated.timing(v, {toValue: 1, duration: 320, easing: EASE_SPRING, useNativeDriver: true}), Animated.timing(b, {toValue: 1, duration: 200, easing: EASE, useNativeDriver: true})]).start(); } }, [visible]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={{flex: 1, backgroundColor: '#0e0e0c99', opacity: b}}><Pressable style={{flex: 1}} onPress={onClose} accessibilityLabel="Đóng" /></Animated.View>
      <View pointerEvents="box-none" style={{position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center', padding: 18}}>
        <Animated.View style={{opacity: v, transform: [{translateY: v.interpolate({inputRange: [0, 1], outputRange: [18, 0]})}, {scale: v.interpolate({inputRange: [0, 1], outputRange: [.96, 1]})}]}}>
          <View style={{position: 'absolute', left: 7, top: 7, right: -7, bottom: -7, backgroundColor: C.ink, borderRadius: RADIUS_LG}} />
          <View style={{backgroundColor: '#fff', borderWidth: BW, borderColor: C.ink, borderRadius: RADIUS_LG, padding: 24, gap: 14}}>{children}</View>
        </Animated.View>
      </View>
    </Modal>
  );
}
