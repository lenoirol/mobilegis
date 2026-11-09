import {useRouter} from 'expo-router';
import {Tabs} from 'expo-router/js-tabs';
import {Pressable, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {T} from '@/ui/kit';
import {Icon, type IconName} from '@/ui/Icon';
import {C} from '@/ui/theme';
import {INDEX} from '@/lib/format';
import {useStore} from '@/lib/store';

const TABS: {name: string; label: string; icon: IconName}[] = [
  {name: 'index', label: 'Bản đồ', icon: 'map'}, {name: 'xep-hang', label: 'Xếp hạng', icon: 'table'},
  {name: 'du-bao', label: 'Dự báo', icon: 'trend'}, {name: 'thong-ke', label: 'Thống kê', icon: 'chart'}, {name: 'them', label: 'Thêm', icon: 'more'},
];
const COLOURED = new Set(['du-bao', 'thong-ke']);   // hai tab nhiều màu: thanh dưới cùng màu chỉ số đang xem

function TabBar({state}: any) {
  const insets = useSafeAreaInsets(), router = useRouter(), k = useStore(s => s.index);
  const route = state.routes[state.index].name, coloured = COLOURED.has(route), spec = INDEX[k];
  return (
    <View style={{flexDirection: 'row', backgroundColor: coloured ? spec.dark : C.surface, borderTopWidth: coloured ? 0 : 1, borderTopColor: C.line,
      paddingTop: 6, paddingBottom: Math.max(insets.bottom, 12)}}>
      {TABS.map(t => {
        const on = route === t.name, fg = coloured ? (on ? '#fff' : '#ffffffbb') : (on ? C.accent2 : C.ink3);
        return (
          <Pressable key={t.name} onPress={() => { if (!on) router.navigate((t.name === 'index' ? '/' : '/' + t.name) as any); }} accessibilityRole="tab" accessibilityState={{selected: on}} accessibilityLabel={t.label}
            style={{flex: 1, alignItems: 'center', gap: 2}} android_ripple={{color: '#00000014', borderless: true}}>
            <View style={{width: 54, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? (coloured ? '#ffffff40' : C.accentSoft) : 'transparent'}}>
              <Icon name={t.icon} size={22} color={fg} />
            </View>
            <T s={11} w={on ? '800' : '600'} color={fg} lines={1}>{t.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={p => <TabBar {...p} />} screenOptions={{headerShown: false, lazy: true, freezeOnBlur: true, animation: 'none'}}>
      {TABS.map(t => <Tabs.Screen key={t.name} name={t.name} />)}
    </Tabs>
  );
}
