import {useEffect, useRef} from 'react';
import {Animated, Dimensions, StyleSheet, View} from 'react-native';
import Svg from 'react-native-svg';
import {C} from './tokens';
import {T} from './Text';
import {EASE, EASE_SPRING} from './motion';
import {LogoCity, LogoFace, LogoSparkles, LogoTile} from './Logo';

const layer = (children: React.ReactNode) => <Svg width={84} height={84} viewBox="0 0 120 120" style={StyleSheet.absoluteFill}>{children}</Svg>;

/** Boot screen like the web `#splash`: logo parts pop in one by one, 4 progress bars fill, then the whole screen slides up. */
export function Splash({step, status, done, onGone}: {step: number; status: string; done: boolean; onGone: () => void}) {
  const tile = useRef(new Animated.Value(0)).current, city = useRef(new Animated.Value(0)).current, face = useRef(new Animated.Value(0)).current;
  const bars = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current, exit = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(tile, {toValue: 1, duration: 500, delay: 50, easing: EASE_SPRING, useNativeDriver: true}).start();
    Animated.timing(city, {toValue: 1, duration: 550, delay: 400, easing: EASE_SPRING, useNativeDriver: true}).start();
    Animated.timing(face, {toValue: 1, duration: 350, delay: 850, easing: EASE, useNativeDriver: true}).start();
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bars.forEach((b, i) => Animated.timing(b, {toValue: i < step ? 1 : 0, duration: 500, easing: EASE, useNativeDriver: true}).start()); }, [step]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (done) Animated.timing(exit, {toValue: 1, duration: 800, delay: 100, easing: EASE, useNativeDriver: true}).start(onGone); }, [done]);   // eslint-disable-line react-hooks/exhaustive-deps
  const H = Dimensions.get('window').height;
  return (
    <Animated.View pointerEvents={done ? 'none' : 'auto'} style={[StyleSheet.absoluteFill, {backgroundColor: C.ink, zIndex: 5000, justifyContent: 'center', alignItems: 'center', transform: [{translateY: exit.interpolate({inputRange: [0, 1], outputRange: [0, -H * 1.01]})}]}]}>
      <View style={{width: '86%', maxWidth: 420, gap: 26}}>
        <View style={{width: 84, height: 84}}>
          <Animated.View style={[StyleSheet.absoluteFill, {transform: [{scale: tile}]}]}>{layer(<LogoTile />)}</Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, {opacity: face}]}>{layer(<LogoSparkles />)}</Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, {opacity: city, transform: [{translateY: city.interpolate({inputRange: [0, 1], outputRange: [10, 0]})}, {scale: city.interpolate({inputRange: [0, 1], outputRange: [.85, 1]})}]}]}>{layer(<LogoCity />)}</Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, {opacity: face}]}>{layer(<LogoFace />)}</Animated.View>
        </View>
        <View>
          <T w={800} s={52} lh={0.95} ls={-0.04} color="#fff">MobileGIS</T>
          <T mono w={600} s={13} lh={1} ls={0.4} color={C.signal} style={{marginTop: 12}}>TP.HCM · NHIỆT ĐỘ · ĐỘ XANH</T>
        </View>
        <View style={{flexDirection: 'row', gap: 6}}>
          {bars.map((b, i) => (
            <View key={i} style={{flex: 1, height: 8, backgroundColor: '#ffffff26', borderRadius: 2, overflow: 'hidden'}}>
              <Animated.View style={{flex: 1, backgroundColor: C.signal, transform: [{translateX: b.interpolate({inputRange: [0, 1], outputRange: [-120, 0]})}]}} />
            </View>
          ))}
        </View>
        <T mono w={500} s={12} lh={1.4} ls={0.06} color="#ffffffb3" style={{minHeight: 17}}>{status}</T>
      </View>
    </Animated.View>
  );
}
