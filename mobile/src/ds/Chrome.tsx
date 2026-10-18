import {useCallback, useEffect, useRef, useState} from 'react';
import {Animated, Pressable, View, type LayoutChangeEvent} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useFocusEffect} from 'expo-router';
import {BW, C, RADIUS, TOP} from './tokens';
import {T} from './Text';
import {Icon, type IconName} from './Icon';
import {Logo} from './Logo';
import {PressBox} from './HardBox';
import {EASE, EASE_SPRING} from './motion';

/** `#top`: brand on the left, account chip on the right, 2px ink rule below. */
export function Header({user, onAccount}: {user?: {name: string} | null; onAccount: () => void}) {
  const insets = useSafeAreaInsets();
  const spin = useRef(new Animated.Value(0)).current;
  const wiggle = () => Animated.sequence([Animated.timing(spin, {toValue: 1, duration: 250, easing: EASE_SPRING, useNativeDriver: true}), Animated.timing(spin, {toValue: 0, duration: 350, easing: EASE, useNativeDriver: true})]).start();
  return (
    <View style={{paddingTop: insets.top, backgroundColor: C.paper, borderBottomWidth: BW, borderBottomColor: C.ink, zIndex: 1000}}>
      <View style={{height: TOP, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10}}>
        <Pressable onPress={wiggle} accessibilityRole="header" accessibilityLabel="MobileGIS TP.HCM" style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
          <Animated.View style={{transform: [{rotate: spin.interpolate({inputRange: [0, 1], outputRange: ['0deg', '-8deg']})}, {scale: spin.interpolate({inputRange: [0, 1], outputRange: [1, 1.06]})}]}}><Logo size={30} /></Animated.View>
          <View><T w={800} s={18} lh={1} ls={-0.03}>MobileGIS</T><T mono w={700} s={10} lh={1} ls={0.3} style={{marginTop: 5}}>TP.HCM</T></View>
        </Pressable>
        <View style={{marginLeft: 'auto'}}>
          <PressBox onPress={onAccount} accessibilityRole="button" accessibilityLabel={user ? 'Tài khoản của ' + user.name : 'Đăng nhập'} radius={999} bg={user ? '#fff' : C.signal} shadow={2} innerStyle={{flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingLeft: user ? 4 : 12, paddingRight: 14}}>
            {user ? <View style={{width: 34, height: 34, borderRadius: 17, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center'}}><T w={800} s={15} color={C.signal}>{user.name.slice(0, 1).toUpperCase()}</T></View> : <Icon name="user" size={18} />}
            <T w={700} s={14} numberOfLines={1} style={{maxWidth: 140}}>{user ? user.name : 'Đăng nhập'}</T>
          </PressBox>
        </View>
      </View>
    </View>
  );
}

export interface NavItem {key: string; label: string; icon: IconName}
/** Bottom tab bar (`#nav` on phones): a yellow bordered thumb with a hard shadow slides between the tabs. */
export function NavBar({items, active, onSelect}: {items: NavItem[]; active: string; onSelect: (key: string) => void}) {
  const insets = useSafeAreaInsets();
  const safe = Math.max(insets.bottom, 14);
  const [boxes, setBoxes] = useState<Record<string, {x: number; w: number}>>({});
  const x = useRef(new Animated.Value(0)).current, w = useRef(new Animated.Value(0)).current, placed = useRef(false);
  const box = boxes[active];
  useEffect(() => {
    if (!box) return;
    if (!placed.current) { x.setValue(box.x); w.setValue(box.w); placed.current = true; return; }
    Animated.parallel([Animated.timing(x, {toValue: box.x, duration: 380, easing: EASE, useNativeDriver: false}), Animated.timing(w, {toValue: box.w, duration: 380, easing: EASE, useNativeDriver: false})]).start();
  }, [box?.x, box?.w]);   // eslint-disable-line react-hooks/exhaustive-deps
  const onLayout = (key: string) => (e: LayoutChangeEvent) => { const l = e.nativeEvent.layout; setBoxes(b => (b[key]?.x === l.x && b[key]?.w === l.width ? b : {...b, [key]: {x: l.x, w: l.width}})); };
  return (
    <View style={{backgroundColor: C.paper, borderTopWidth: BW, borderTopColor: C.ink, paddingTop: 8, paddingHorizontal: 8, paddingBottom: 8 + safe}}>
      <View style={{flexDirection: 'row', gap: 4, height: 54}}>
        <Animated.View pointerEvents="none" style={{position: 'absolute', top: 0, bottom: 0, left: 0, width: w, transform: [{translateX: x}], opacity: box ? 1 : 0}}>
          <View style={{position: 'absolute', left: 2, top: 2, right: -2, bottom: -2, backgroundColor: C.ink, borderRadius: RADIUS}} />
          <View style={{flex: 1, backgroundColor: C.signal, borderWidth: BW, borderColor: C.ink, borderRadius: RADIUS}} />
        </Animated.View>
        {items.map(i => (
          <Pressable key={i.key} onLayout={onLayout(i.key)} onPress={() => onSelect(i.key)} accessibilityRole="tab" accessibilityState={{selected: active === i.key}} accessibilityLabel={i.label} style={{flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 6}}>
            <Icon name={i.icon} size={20} />
            <T w={700} s={11}>{i.label}</T>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** `.view`: every screen fades in and rises 14px each time it gains focus. */
export function ViewIn({children, style}: {children: React.ReactNode; style?: any}) {
  const v = useRef(new Animated.Value(0)).current;
  useFocusEffect(useCallback(() => { v.setValue(0); Animated.timing(v, {toValue: 1, duration: 450, easing: EASE, useNativeDriver: true}).start(); }, [v]));
  return <Animated.View style={[{flex: 1, opacity: v, transform: [{translateY: v.interpolate({inputRange: [0, 1], outputRange: [14, 0]})}]}, style]}>{children}</Animated.View>;
}
