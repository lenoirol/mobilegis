import {useEffect, useState} from 'react';
import {LogBox, View} from 'react-native';

// MapLibre reports every missing tile (areas outside the data bounds) as a console error; hide the dev overlay so it never covers the tab bar.
LogBox.ignoreAllLogs();
import {Stack, usePathname, useRouter} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import {useFonts} from 'expo-font';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {DataProvider, useData} from '@/components/DataProvider';
import {FONT_FILES} from '@/ds/fonts';
import {C} from '@/ds/tokens';
import {Header, NavBar, type NavItem} from '@/ds/Chrome';
import {Splash} from '@/ds/Splash';
import {ToastProvider, useToast} from '@/ds/Toast';
import {useSession} from '@/lib/session';

const ITEMS: NavItem[] = [{key: 'index', label: 'Bản đồ', icon: 'map'}, {key: 'chuyen-gia', label: 'Chuyên gia', icon: 'chart'}, {key: 'du-lieu', label: 'Giới thiệu', icon: 'info'}];
/** Sub-screens of "Chuyên gia" keep that tab lit, like the web app. */
const TAB_OF: Record<string, string> = {'bang-so-lieu': 'chuyen-gia', 'thong-ke': 'chuyen-gia', 'gia-lap': 'chuyen-gia', 'gop-y': 'du-lieu'};

function Shell() {
  const {status, step, text} = useData();
  const session = useSession();
  const toast = useToast();
  const router = useRouter();
  const path = usePathname();
  const current = path === '/' || path === '' ? 'index' : path.replace(/^\//, '');
  const [gone, setGone] = useState(false);
  const [minShown, setMinShown] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMinShown(true), 1100); return () => clearTimeout(t); }, []);   // the web keeps the splash at least ~1.1 s on first open
  useEffect(() => { SystemUI.setBackgroundColorAsync(C.paper).catch(() => {}); }, []);
  useEffect(() => { if (status === 'error') toast('Chưa tải được số liệu. Kiểm tra mạng rồi thử lại.', {error: true}); }, [status]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={{flex: 1, backgroundColor: C.paper}}>
      <Header user={session.user ? {name: session.user.display_name} : null} onAccount={() => router.push((session.user ? '/tai-khoan' : '/dang-nhap') as any)} />
      <View style={{flex: 1}}><Stack screenOptions={{headerShown: false, animation: 'none', contentStyle: {backgroundColor: C.paper}}} /></View>
      <NavBar items={ITEMS} active={TAB_OF[current] ?? current} onSelect={key => router.navigate((key === 'index' ? '/' : '/' + key) as any)} />
      {!gone && <Splash step={step} status={text} done={minShown && status !== 'loading'} onGone={() => setGone(true)} />}
    </View>
  );
}

export default function Layout() {
  const [fontsReady] = useFonts(FONT_FILES);
  if (!fontsReady) return <View style={{flex: 1, backgroundColor: C.ink}} />;
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <DataProvider><ToastProvider bottom={90}><Shell /></ToastProvider></DataProvider>
    </SafeAreaProvider>
  );
}
