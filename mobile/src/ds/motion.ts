import {Animated, Easing} from 'react-native';
import {useEffect, useRef} from 'react';

/** The web app's easing curves. */
export const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);
export const EASE_SPRING = Easing.bezier(0.34, 1.56, 0.64, 1);

export const timing = (v: Animated.Value, to: number, ms = 300, easing = EASE, native = true) => Animated.timing(v, {toValue: to, duration: ms, easing, useNativeDriver: native});

/** Animated value that runs 0 → 1 once when mounted (or when `key` changes), after `delay` ms. */
export function useEnter(ms = 450, delay = 0, key: unknown = 0, easing = EASE) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { v.setValue(0); const a = Animated.timing(v, {toValue: 1, duration: ms, delay, easing, useNativeDriver: true}); a.start(); return () => a.stop(); }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}
