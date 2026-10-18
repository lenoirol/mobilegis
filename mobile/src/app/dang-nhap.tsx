import {useState} from 'react';
import {View} from 'react-native';
import {useRouter} from 'expo-router';
import {Button, Callout, Card, Field, Input, Page, PasswordInput, Reveal, Segmented, T, C, Eyebrow} from '@/ds';
import {login, post, register} from '@/lib/api';

type Mode = 'login' | 'register' | 'forgot';
/** Sign in / register / forgot password (admin-issued one-time reset code), same flows and wording as the web login page. */
export default function Auth() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [msg, setMsg] = useState<{text: string; kind: 'err' | 'ok'} | null>(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({email: '', password: '', name: '', confirm: '', code: '', newPassword: ''});
  const set = (k: keyof typeof f) => (v: string) => setF(s => ({...s, [k]: v}));
  const run = async (fn: () => Promise<void>) => { setBusy(true); setMsg(null); try { await fn(); } catch (e: any) { setMsg({text: e.message || 'Có lỗi xảy ra, thử lại sau.', kind: 'err'}); } finally { setBusy(false); } };
  const enter = () => router.replace('/' as any);
  const email = f.email.trim().toLowerCase();
  return (
    <Page back={{label: 'Bản đồ', href: '/'}}>
      <Reveal style={{gap: 12, marginBottom: 18}}>
        <Eyebrow>Tài khoản</Eyebrow>
        <T w={800} s={32} lh={1.08} ls={-0.035}>{mode === 'login' ? 'Chào mừng trở lại' : mode === 'register' ? 'Tạo tài khoản khách hàng' : 'Quên mật khẩu'}</T>
        <T s={15} lh={1.5} color={C.ink2}>Diễn biến nhiệt độ bề mặt, thực vật và độ khô tại TP.HCM sau sáp nhập.</T>
      </Reveal>
      {mode !== 'forgot' && <><Segmented options={[{value: 'login', label: 'Đăng nhập'}, {value: 'register', label: 'Đăng ký'}]} value={mode} onChange={m => { setMode(m); setMsg(null); }} label="Chọn thao tác" /><View style={{height: 14}} /></>}
      {msg && <View style={{marginBottom: 14}}><Callout tone={msg.kind === 'ok' ? 'ok' : 'err'}>{msg.text}</Callout></View>}
      <Card><View style={{gap: 14}}>
        {mode === 'login' && <>
          <Field label="Email"><Input value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="ten@example.com" accessibilityLabel="Email" /></Field>
          <Field label="Mật khẩu"><PasswordInput value={f.password} onChangeText={set('password')} autoComplete="current-password" accessibilityLabel="Mật khẩu" /></Field>
          <Button tone="primary" full label={busy ? 'Đang đăng nhập…' : 'Đăng nhập'} disabled={busy} onPress={() => run(async () => { if (!email || !f.password) throw new Error('Nhập email và mật khẩu.'); await login(email, f.password); enter(); })} />
          <Button tone="ghost" label="Quên mật khẩu?" onPress={() => { setMode('forgot'); setMsg(null); }} />
        </>}
        {mode === 'register' && <>
          <Field label="Tên hiển thị"><Input value={f.name} onChangeText={set('name')} maxLength={100} autoComplete="name" accessibilityLabel="Tên hiển thị" /></Field>
          <Field label="Email"><Input value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" autoComplete="email" accessibilityLabel="Email" /></Field>
          <Field label="Mật khẩu · ít nhất 8 ký tự"><PasswordInput value={f.password} onChangeText={set('password')} autoComplete="new-password" accessibilityLabel="Mật khẩu" /></Field>
          <Field label="Nhập lại mật khẩu"><PasswordInput value={f.confirm} onChangeText={set('confirm')} autoComplete="new-password" accessibilityLabel="Nhập lại mật khẩu" /></Field>
          <Button tone="primary" full label={busy ? 'Đang tạo…' : 'Đăng ký'} disabled={busy} onPress={() => run(async () => {
            if (!f.name.trim() || !email || f.password.length < 8) throw new Error('Nhập đủ tên, email và mật khẩu ít nhất 8 ký tự.');
            if (f.password !== f.confirm) throw new Error('Hai mật khẩu nhập vào chưa giống nhau.');
            await register(email, f.name.trim(), f.password); enter();
          })} />
          <T s={12.5} lh={1.5} color={C.ink3}>Tài khoản mới có quyền xem bản đồ, bảng số liệu và thống kê. Quyền quản trị do quản trị viên cấp.</T>
        </>}
        {mode === 'forgot' && <>
          <T s={14} lh={1.5} color={C.ink2}>Hệ thống chưa gửi email. Bạn gửi yêu cầu, <T w={800} s={14}>quản trị viên sẽ cấp một mã đặt lại</T> (hiệu lực 30 phút) và gửi cho bạn qua kênh riêng.</T>
          <Field label="Email đã đăng ký"><Input value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" accessibilityLabel="Email đã đăng ký" /></Field>
          <Button tone="primary" full label="Gửi yêu cầu cho quản trị viên" disabled={busy} onPress={() => run(async () => { const r = await post<{message: string}>('/api/auth/forgot', {email}); setMsg({text: r.message, kind: 'ok'}); })} />
          <View style={{height: 2, backgroundColor: C.ink}} />
          <T w={800} s={20}>Đã có mã đặt lại?</T>
          <Field label="Mã đặt lại · 8 ký tự"><Input value={f.code} onChangeText={t => set('code')(t.toUpperCase())} maxLength={8} autoCapitalize="characters" autoCorrect={false} style={{letterSpacing: 4}} accessibilityLabel="Mã đặt lại" /></Field>
          <Field label="Mật khẩu mới · ít nhất 8 ký tự"><PasswordInput value={f.newPassword} onChangeText={set('newPassword')} accessibilityLabel="Mật khẩu mới" /></Field>
          <Button full label="Đặt lại mật khẩu" disabled={busy} onPress={() => run(async () => { await post('/api/auth/reset', {email, code: f.code.trim().toUpperCase(), new_password: f.newPassword}); setMode('login'); setMsg({text: 'Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.', kind: 'ok'}); })} />
          <Button tone="ghost" label="← Quay lại đăng nhập" onPress={() => { setMode('login'); setMsg(null); }} />
        </>}
      </View></Card>
      <T s={12} lh={1.45} color={C.ink3} align="center" style={{marginTop: 18}}>Ứng dụng học tập/nghiên cứu, không phải hệ thống hỗ trợ ra quyết định chính thức.</T>
    </Page>
  );
}
