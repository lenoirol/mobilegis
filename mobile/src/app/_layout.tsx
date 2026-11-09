import {useEffect} from 'react';
import {LogBox} from 'react-native';
import {Stack} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {enableFreeze} from 'react-native-screens';
import {startData} from '@/lib/data';
import {loadSession} from '@/lib/api';
import {isLowEnd} from '@/lib/device';
import {setState} from '@/lib/store';
import {C} from '@/ui/theme';

LogBox.ignoreLogs(['Request failed', 'Failed to load tile']);   // ô bản đồ ngoài vùng dữ liệu không phải lỗi
enableFreeze(true);   // tab không xem bị "đóng băng": không vẽ lại, không tốn CPU

export default function Root() {
  useEffect(() => {
    setState({lite: isLowEnd()});
    SystemUI.setBackgroundColorAsync(C.bg).catch(() => {});
    startData(); loadSession();
  }, []);
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{headerShown: false, animation: 'fade', animationDuration: 150, contentStyle: {backgroundColor: C.bg}, freezeOnBlur: true}} />
    </SafeAreaProvider>
  );
}
