import {useEffect, useRef} from 'react';
import {Animated, Pressable, ScrollView, View} from 'react-native';
import {BW, C, Icon} from '@/ds';
import {EASE} from '@/ds/motion';

export const PEEK = 292;
/** Phone bottom sheet: the yellow arrow button opens it (arrow turns down) and closes it. No dragging, so a swipe never slips onto the map. */
export function BottomSheet({open, onToggle, height, children}: {open: boolean; onToggle: () => void; height: number; children: React.ReactNode}) {
  const full = Math.min(Math.round(height * 0.84), 700);
  const y = useRef(new Animated.Value(open ? 0 : 1)).current;
  useEffect(() => { Animated.timing(y, {toValue: open ? 0 : 1, duration: 500, easing: EASE, useNativeDriver: true}).start(); }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  const scroll = useRef<any>(null);
  useEffect(() => { if (!open) scroll.current?.scrollTo({y: 0, animated: true}); }, [open]);
  return (
    <Animated.View style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: full, backgroundColor: C.card, borderWidth: BW, borderBottomWidth: 0, borderColor: C.ink, borderTopLeftRadius: 18, borderTopRightRadius: 18, transform: [{translateY: y.interpolate({inputRange: [0, 1], outputRange: [0, full - PEEK]})}]}}>
      <View style={{position: 'absolute', left: 0, right: 0, bottom: 0, top: -6, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderTopWidth: 6, borderColor: C.ink, opacity: 0}} pointerEvents="none" />
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityLabel={open ? 'Thu gọn bảng thông tin' : 'Mở rộng bảng thông tin'} style={{alignSelf: 'center', marginTop: -20, width: 64, height: 36, zIndex: 3}}>
        <View style={{position: 'absolute', left: 2, top: 2, right: -2, bottom: -2, backgroundColor: C.ink, borderRadius: 8}} />
        <View style={{flex: 1, backgroundColor: C.signal, borderWidth: BW, borderColor: C.ink, borderRadius: 8, alignItems: 'center', justifyContent: 'center'}}>
          <Animated.View style={{transform: [{rotate: y.interpolate({inputRange: [0, 1], outputRange: ['180deg', '0deg']})}]}}><Icon name="up" size={24} /></Animated.View>
        </View>
      </Pressable>
      <ScrollView ref={scroll} scrollEnabled={open} showsVerticalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={{paddingHorizontal: 16, paddingTop: 10, paddingBottom: 32}}>{children}</ScrollView>
    </Animated.View>
  );
}
