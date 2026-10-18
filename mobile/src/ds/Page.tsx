import {useEffect, useState} from 'react';
import {Keyboard, ScrollView, View, type StyleProp, type ViewStyle} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {C} from './tokens';
import {T} from './Text';
import {Eyebrow} from './Bits';
import {Reveal} from './Bits';
import {ViewIn} from './Chrome';
import {Button} from './Button';
import {useRouter} from 'expo-router';

/** `.page`: scrolling column with 16px gutters, animated in on focus. `back` adds the "Quay lại" link of sub-pages. */
export function Page({children, back, style}: {children: React.ReactNode; back?: {label: string; href: string}; style?: StyleProp<ViewStyle>}) {
  const router = useRouter();
  const [kb, setKb] = useState(0);   // the keyboard overlays the screen (edge-to-edge): add its height so fields and buttons can scroll above it
  useEffect(() => { const a = Keyboard.addListener('keyboardDidShow', e => setKb(e.endCoordinates.height)), b = Keyboard.addListener('keyboardDidHide', () => setKb(0)); return () => { a.remove(); b.remove(); }; }, []);
  return (
    <ViewIn>
      <ScrollView style={{flex: 1}} contentContainerStyle={[{paddingHorizontal: 16, paddingTop: back ? 16 : 24, paddingBottom: 40 + kb, gap: 0}, style]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {back && <View style={{marginBottom: 16}}><Button icon="chevron" iconRotate={90} label={`Quay lại ${back.label}`} onPress={() => router.navigate(back.href as any)} /></View>}
        {children}
      </ScrollView>
    </ViewIn>
  );
}
/** `.page-head`: eyebrow, big heading, intro paragraph. */
export function PageHead({eyebrow, title, intro}: {eyebrow: string; title: string; intro?: string}) {
  return (
    <Reveal style={{gap: 14, marginBottom: 26}}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <T w={800} s={34} lh={1.08} ls={-0.035}>{title}</T>
      {intro ? <T s={16} lh={1.55} color={C.ink2}>{intro}</T> : null}
    </Reveal>
  );
}
/** `.block`: section with an h2 and 14px gap. */
export function Block({title, sub, children, index = 0}: {title?: string; sub?: string; children: React.ReactNode; index?: number}) {
  return <Reveal index={index} style={{marginTop: 34, gap: 14}}>{title ? <T w={800} s={24} lh={1.08} ls={-0.02}>{title}</T> : null}{sub ? <T s={15} lh={1.5} color={C.ink3}>{sub}</T> : null}{children}</Reveal>;
}
