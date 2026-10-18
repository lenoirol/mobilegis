import {useState} from 'react';
import {View} from 'react-native';
import {useRouter} from 'expo-router';
import {Button, Card, Dialog, Field, Page, PageHead, PasswordInput, T, Callout, C, Reveal, useToast} from '@/ds';
import {isAdmin, loadSession, logout, post} from '@/lib/api';
import {useSession} from '@/lib/session';

export default function Account() {
  const router = useRouter();
  const toast = useToast();
  const session = useSession();
  const user = session.user;
  const [dlg, setDlg] = useState(false);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState('');
  if (!user) return <Page><PageHead eyebrow="Tài khoản" title="Bạn chưa đăng nhập" /><Button tone="primary" label="Đăng nhập" onPress={() => router.replace('/dang-nhap' as any)} /></Page>;
  const save = async () => {
    try { await post('/api/auth/change-password', {current_password: cur, new_password: next}); setDlg(false); setCur(''); setNext(''); setErr(''); toast('Đã đổi mật khẩu. Các thiết bị khác phải đăng nhập lại.'); await loadSession(); }
    catch (e: any) { setErr(e.message); }
  };
  return (
    <Page back={{label: 'Bản đồ', href: '/'}}>
      <PageHead eyebrow="Tài khoản" title={user.display_name} intro={`${user.email} · ${isAdmin() ? 'Quản trị viên' : 'Khách hàng'}`} />
      <View style={{gap: 14}}>
        {isAdmin() && <Reveal><Card><View style={{gap: 10}}><T w={800} s={20}>Trang quản trị</T><T s={14} lh={1.5} color={C.ink3}>Quản lý tài khoản, kiểm tra dữ liệu, thông báo và ghi chú khu vực.</T><Button tone="primary" icon="lock" label="Mở trang quản trị" onPress={() => router.navigate('/quan-tri' as any)} /></View></Card></Reveal>}
        <Reveal index={1}><Card><View style={{gap: 10}}><T w={800} s={20}>Mật khẩu</T><Button label="Đổi mật khẩu" onPress={() => setDlg(true)} /></View></Card></Reveal>
        <Reveal index={2}><Button tone="dark" label="Đăng xuất" onPress={async () => { try { await logout(); } finally { router.replace('/' as any); } }} /></Reveal>
      </View>
      <Dialog visible={dlg} onClose={() => setDlg(false)}>
        <T w={800} s={22}>Đổi mật khẩu</T>
        <Field label="Mật khẩu hiện tại"><PasswordInput value={cur} onChangeText={setCur} accessibilityLabel="Mật khẩu hiện tại" /></Field>
        <Field label="Mật khẩu mới · ít nhất 8 ký tự"><PasswordInput value={next} onChangeText={setNext} accessibilityLabel="Mật khẩu mới" /></Field>
        {err ? <Callout tone="err">{err}</Callout> : null}
        <View style={{flexDirection: 'row', justifyContent: 'flex-end', gap: 10}}><Button label="Hủy" onPress={() => setDlg(false)} /><Button tone="primary" label="Lưu" onPress={save} /></View>
      </Dialog>
    </Page>
  );
}
