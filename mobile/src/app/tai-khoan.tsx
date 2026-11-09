/** Tài khoản: đăng nhập / đăng ký; khi đã đăng nhập: hồ sơ và đăng xuất. Mật khẩu chỉ gửi qua HTTPS tới máy chủ, không lưu trên máy. */
import {useEffect, useState} from 'react';
import {Linking, TextInput, View} from 'react-native';
import {Btn, Callout, Card, PageBar, Screen, Seg, T} from '@/ui/kit';
import {C, R} from '@/ui/theme';
import {WEB_APP} from '@/lib/config';
import {login, logout, onSession, register, session} from '@/lib/api';

const input = {backgroundColor: C.surface, borderWidth: 1, borderColor: C.line2, borderRadius: R, padding: 12, fontSize: 15, color: C.ink} as const;
export default function Account() {
  const [user, setUser] = useState(session.user), [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState(''), [name, setName] = useState(''), [pw, setPw] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => onSession(() => setUser(session.user)), []);
  const submit = async () => {
    setErr(''); setBusy(true);
    try { if (tab === 'login') await login(email.trim(), pw); else await register(email.trim(), name.trim(), pw); setPw(''); }
    catch (e: any) { setErr(e.message || 'Không thực hiện được.'); }
    setBusy(false);
  };
  return (
    <View style={{flex: 1, backgroundColor: C.bg}}>
      <PageBar title="Tài khoản" back />
      <Screen>
        <Callout>Ai cũng xem được bản đồ, xếp hạng, dự báo và thống kê mà không cần tài khoản. Tài khoản dùng cho quản trị và góp ý.</Callout>
        {user ? <Card>
          <T s={18} w="800">{user.display_name}</T><T s={13.5} color={C.ink3}>{user.email} · {user.role === 'admin' ? 'quản trị viên' : 'người dùng'}</T>
          <Btn label="Đổi mật khẩu, xóa tài khoản (bản web)" icon="globe" onPress={() => Linking.openURL(WEB_APP + '#/tai-khoan')} />
          <Btn label="Đăng xuất" tone="primary" onPress={() => logout()} />
        </Card> : <Card>
          <Seg options={[{value: 'login', label: 'Đăng nhập'}, {value: 'register', label: 'Đăng ký'}]} value={tab} onChange={v => setTab(v as any)} />
          <TextInput style={input} value={email} onChangeText={setEmail} placeholder="Email" autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholderTextColor={C.ink3} />
          {tab === 'register' && <TextInput style={input} value={name} onChangeText={setName} placeholder="Tên hiển thị" placeholderTextColor={C.ink3} />}
          <TextInput style={input} value={pw} onChangeText={setPw} placeholder="Mật khẩu" secureTextEntry autoComplete={tab === 'login' ? 'password' : 'new-password'} placeholderTextColor={C.ink3} />
          {err ? <T s={13} w="700" color={C.err}>{err}</T> : null}
          <Btn tone="primary" label={busy ? 'Đang gửi…' : tab === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'} disabled={busy || !email || !pw} onPress={submit} />
          <T s={12} color={C.ink3}>Máy chủ miễn phí có thể mất khoảng 1 phút để khởi động ở lần đầu.</T>
        </Card>}
      </Screen>
    </View>
  );
}
