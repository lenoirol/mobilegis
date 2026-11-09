/** Thêm: tài khoản, bảng số liệu, giải nghĩa chỉ số, giới thiệu, chế độ nhẹ, bản web đầy đủ. */
import {useEffect, useState} from 'react';
import {Linking, Pressable, Switch, View} from 'react-native';
import {useRouter} from 'expo-router';
import {PageBar, Screen, T} from '@/ui/kit';
import {Icon, type IconName} from '@/ui/Icon';
import {Glossary} from '@/ui/Glossary';
import {C, R} from '@/ui/theme';
import {WEB_APP} from '@/lib/config';
import {session, onSession} from '@/lib/api';
import {setState, useStore} from '@/lib/store';
import {dataOrigin, refresh, useDataVersion} from '@/lib/data';
import {deviceLabel} from '@/lib/device';

function Tile({icon, title, text, onPress}: {icon: IconName; title: string; text: string; onPress: () => void}) {
  return (
    <Pressable onPress={onPress} android_ripple={{color: '#0000000f'}} style={{flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: R, borderWidth: 1, borderColor: C.line, padding: 12}}>
      <View style={{width: 46, height: 46, borderRadius: 12, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center'}}><Icon name={icon} size={22} color={C.accent2} /></View>
      <View style={{flex: 1}}><T s={15.5} w="800">{title}</T><T s={12.5} color={C.ink3}>{text}</T></View>
      <View style={{transform: [{rotate: '-90deg'}]}}><Icon name="chevron" size={18} color={C.ink3} /></View>
    </Pressable>
  );
}

export default function More() {
  const router = useRouter(), lite = useStore(s => s.lite);
  const [user, setUser] = useState(session.user), [gloss, setGloss] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => onSession(() => setUser(session.user)), []);
  useDataVersion();
  return (
    <View style={{flex: 1, backgroundColor: C.bg}}>
      <PageBar title="Thêm" />
      <Screen>
        <Tile icon="user" title={user ? user.display_name : 'Đăng nhập / Đăng ký'} text={user ? `Đã đăng nhập${user.role === 'admin' ? ' · quản trị viên' : ''} · xem hồ sơ, đăng xuất` : 'Tạo tài khoản hoặc đăng nhập'} onPress={() => router.push('/tai-khoan')} />
        {user?.role === 'admin' && <Tile icon="lock" title="Quản trị" text="Nhập số liệu, người dùng, nhật ký (mở trang quản trị)" onPress={() => Linking.openURL(WEB_APP + 'admin.html')} />}
        <Tile icon="grid" title="Bảng số liệu" text="Tra cứu từng xã/phường, lưu CSV (chọn nơi lưu)" onPress={() => router.push('/bang-so-lieu')} />
        <Tile icon="info" title="LST, NDVI, TVDI nghĩa là gì?" text="Tên đầy đủ, ý nghĩa, cách đọc và giới hạn" onPress={() => setGloss(true)} />
        <Tile icon="map" title="Giới thiệu và cách đọc bản đồ" text="Nguồn dữ liệu, giới hạn, cách dùng" onPress={() => router.push('/gioi-thieu')} />
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: R, borderWidth: 1, borderColor: C.line, padding: 12}}>
          <View style={{flex: 1}}><T s={15.5} w="800">Chế độ nhẹ</T><T s={12.5} color={C.ink3}>Cho máy yếu: không hiệu ứng bay, 30 khung hình/giây, gỡ bản đồ ở tab không xem. Tự bật trên máy RAM thấp.</T></View>
          <Switch value={lite} onValueChange={v => setState({lite: v})} thumbColor={lite ? C.accent : undefined} trackColor={{true: C.accentSoft, false: C.line2}} />
        </View>
        <Tile icon="download" title={busy ? 'Đang cập nhật…' : 'Cập nhật số liệu mới nhất'} text={`Nguồn đang dùng: ${dataOrigin() === 'online' ? 'bản mới tải' : dataOrigin() === 'saved' ? 'bản đã lưu trên máy' : 'bản có sẵn trong app'}`}
          onPress={async () => { if (busy) return; setBusy(true); try { await refresh(); } catch { /* giữ bản cũ */ } setBusy(false); }} />
        <Tile icon="globe" title="Mở bản web đầy đủ" text="Thống kê theo ô ảnh, quản trị, góp ý" onPress={() => Linking.openURL(WEB_APP)} />
        <T s={11.5} color={C.ink3} center>Thiết bị: {deviceLabel()} · chế độ {lite ? 'nhẹ' : 'đầy đủ'}</T>
      </Screen>
      <Glossary open={gloss} onClose={() => setGloss(false)} />
    </View>
  );
}
