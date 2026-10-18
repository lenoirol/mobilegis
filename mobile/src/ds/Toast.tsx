import {createContext, useCallback, useContext, useRef, useState} from 'react';
import {Animated, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {BW, C, RADIUS} from './tokens';
import {T} from './Text';
import {EASE, EASE_SPRING} from './motion';

type Item = {id: number; text: string; error: boolean};
const Ctx = createContext<(text: string, opts?: {error?: boolean; ms?: number}) => void>(() => {});
export const useToast = () => useContext(Ctx);

function ToastView({item, onDone, ms}: {item: Item; onDone: () => void; ms: number}) {
  const v = useRef(new Animated.Value(0)).current;
  useState(() => { Animated.timing(v, {toValue: 1, duration: 450, easing: EASE_SPRING, useNativeDriver: true}).start(() => setTimeout(() => Animated.timing(v, {toValue: 2, duration: 250, easing: EASE, useNativeDriver: true}).start(onDone), ms)); return 0; });
  return (
    <Animated.View pointerEvents="auto" style={{opacity: v.interpolate({inputRange: [0, 1, 2], outputRange: [0, 1, 0]}), transform: [{translateY: v.interpolate({inputRange: [0, 1, 2], outputRange: [24, 0, 12]})}, {scale: v.interpolate({inputRange: [0, 1], outputRange: [.96, 1], extrapolate: 'clamp'})}]}}>
      <View style={{position: 'absolute', left: 4, top: 4, right: -4, bottom: -4, backgroundColor: item.error ? C.coral : C.signal, borderRadius: RADIUS}} />
      <View style={{backgroundColor: C.ink, borderWidth: BW, borderColor: C.ink, borderRadius: RADIUS, paddingVertical: 12, paddingHorizontal: 16}}><T w={600} s={15} color="#fff">{item.text}</T></View>
    </Animated.View>
  );
}

/** `.toast`: ink pill with a yellow (or coral for errors) hard shadow, springing up from below. */
export function ToastProvider({children, bottom = 0}: {children: React.ReactNode; bottom?: number}) {
  const [items, setItems] = useState<(Item & {ms: number})[]>([]);
  const counter = useRef(0);
  const insets = useSafeAreaInsets();
  const push = useCallback((text: string, opts: {error?: boolean; ms?: number} = {}) => { counter.current += 1; setItems(list => [...list.slice(-2), {id: counter.current, text, error: !!opts.error, ms: opts.ms ?? 3200}]); }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <View pointerEvents="box-none" style={{position: 'absolute', left: 16, right: 16, bottom: bottom + 18 + insets.bottom * 0, gap: 12}}>
        {items.map(i => <ToastView key={i.id} item={i} ms={i.ms} onDone={() => setItems(list => list.filter(x => x.id !== i.id))} />)}
      </View>
    </Ctx.Provider>
  );
}
