import {useCallback, useEffect, useState} from 'react';
import {Alert, Linking, ScrollView, View} from 'react-native';
import * as Sharing from 'expo-sharing';
import {useRouter} from 'expo-router';
import {Block, Button, Callout, Card, Field, Input, PasswordInput, Page, PageHead, Reveal, Segmented, Select, T, Table, Tag, C, BW, useToast, type Col} from '@/ds';
import {del, get, post, session, type User} from '@/lib/api';
import {API_BASE} from '@/lib/config';
import {useSession} from '@/lib/session';
import {useData} from '@/components/DataProvider';
import {INDEX, INDICES, YEARS, dmy, pct, valid} from '@/lib/format';

const when = (iso?: string | null) => iso ? new Date(iso).toLocaleString('vi-VN', {dateStyle: 'short', timeStyle: 'short'}) : '—';
const EVENTS: Record<string, string> = {register: 'Đăng ký', login: 'Đăng nhập', login_failed: 'Đăng nhập sai', password_changed: 'Đổi mật khẩu', reset_requested: 'Yêu cầu đặt lại', reset_issued: 'Cấp mã đặt lại', user_created: 'Admin tạo tài khoản',
  reset_cancelled: 'Hủy yêu cầu', password_reset: 'Đã đặt lại mật khẩu', role_changed: 'Đổi vai trò', activated: 'Kích hoạt', deactivated: 'Vô hiệu hóa', user_deleted: 'Xóa tài khoản', admin_created: 'Tạo quản trị viên'};
type Tab = 'overview' | 'users' | 'data' | 'content' | 'events';
interface ResetRow {id: number; email: string; display_name: string; status: string; requested_at: string; expires_at: string | null}
interface EventRow {created_at: string; event: string; email: string | null; detail: string | null}

/** Admin console (accounts, password-reset requests, data coverage, notice and area notes, security log). Same sections as the web admin page. */
export default function Admin() {
  const router = useRouter();
  const toast = useToast();
  const s = useSession();
  const [tab, setTab] = useState<Tab>('overview');
  const [users, setUsers] = useState<User[]>([]);
  const [resets, setResets] = useState<ResetRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState('');
  const [code, setCode] = useState<{email: string; code: string; minutes: number} | null>(null);
  const refresh = useCallback(async () => {
    try { const [u, r, e, i] = await Promise.all([get<User[]>('/api/admin/users'), get<ResetRow[]>('/api/admin/resets'), get<EventRow[]>('/api/admin/events'), get('/api/info')]); setUsers(u); setResets(r); setEvents(e); setInfo(i); setError(''); }
    catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { if (s.user?.role === 'admin') refresh(); }, [s.user?.role, refresh]);
  const act = async (fn: () => Promise<any>, ok?: string) => { try { await fn(); if (ok) toast(ok); await refresh(); } catch (e: any) { toast(e.message, {error: true}); } };
  if (s.user?.role !== 'admin') return <Page><PageHead eyebrow="Quản trị" title="Bạn không có quyền quản trị" /><Button label="Về bản đồ" onPress={() => router.replace('/' as any)} /></Page>;
  const pending = resets.filter(r => r.status === 'pending').length;
  const TABS = [{value: 'overview', label: 'Tổng quan'}, {value: 'users', label: pending ? `Tài khoản (${pending})` : 'Tài khoản'}, {value: 'data', label: 'Dữ liệu'}, {value: 'content', label: 'Nội dung'}, {value: 'events', label: 'Nhật ký'}] as const;
  return (
    <Page back={{label: 'Tài khoản', href: '/tai-khoan'}}>
      <PageHead eyebrow="Khu vực dành cho quản trị viên" title="Trang quản trị" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingBottom: 6}}><Segmented options={TABS.map(t => ({value: t.value, label: t.label}))} value={tab} onChange={setTab} label="Mục quản trị" /></ScrollView>
      {error ? <View style={{marginTop: 14}}><Callout tone="err">{error}</Callout></View> : null}
      <View style={{height: 16}} />
      {tab === 'overview' && <Overview users={users} resets={resets} onGo={t => setTab(t)} />}
      {tab === 'users' && <Users users={users} resets={resets} me={s.user!.id} act={act} code={code} setCode={setCode} />}
      {tab === 'data' && <DataTab info={info} />}
      {tab === 'content' && <Content act={act} />}
      {tab === 'events' && <Events events={events} />}
    </Page>
  );
}

function Stat({value, label, signal}: {value: string; label: string; signal?: boolean}) {
  return <View style={{width: '47.5%', backgroundColor: signal ? C.signal : '#fff', borderWidth: BW, borderColor: C.ink, borderRadius: 14, padding: 14, gap: 4}}><T mono w={800} s={value.length > 6 ? 17 : 26} numberOfLines={1}>{value}</T><T mono w={600} s={10.5} ls={0.08} upper color={C.ink2}>{label}</T></View>;
}
function Overview({users, resets, onGo}: {users: User[]; resets: ResetRow[]; onGo: (t: Tab) => void}) {
  const router = useRouter();
  return (
    <View style={{gap: 16}}>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 12}}><Stat value={String(users.length)} label="Tài khoản" /><Stat value={String(users.filter(u => u.role === 'admin').length)} label="Quản trị viên" signal /><Stat value={String(users.filter(u => u.is_active).length)} label="Đang hoạt động" /><Stat value={String(resets.filter(r => r.status === 'pending').length)} label="Yêu cầu chờ xử lý" /></View>
      <T w={800} s={22}>Việc quản trị viên làm được</T>
      {[['Tài khoản', 'tạo, đổi vai trò, khóa/mở, xóa; cấp mã khi người dùng quên mật khẩu.', 'users'], ['Dữ liệu', 'xem năm nào đã nạp, khu vực nào còn ít dữ liệu. Số liệu vệ tinh 2020–2025 chỉ đọc, không sửa qua ứng dụng; năm mới được nạp bằng script.', 'data'], ['Nội dung', 'thông báo đầu trang và ghi chú theo khu vực (hiện trong thẻ khu vực trên bản đồ). Đây là mô tả của quản trị viên, không phải số liệu vệ tinh.', 'content']].map(([t, d, go]) => (
        <Card key={t} pad={14}><View style={{gap: 6}}><T w={800} s={16}>{t}</T><T s={14} lh={1.5} color={C.ink3}>{d}</T><Button sm label="Mở" onPress={() => onGo(go as Tab)} /></View></Card>
      ))}
      <T w={800} s={22}>Công cụ thử nghiệm</T>
      <T s={14} lh={1.5} color={C.ink3}>Giả lập kịch bản nằm ngoài đề cương và không phải dự báo; chỉ quản trị viên dùng.</T>
      <Button icon="flask" label="Mở Giả lập" onPress={() => router.navigate('/gia-lap' as any)} />
    </View>
  );
}

function Users({users, resets, me, act, code, setCode}: {users: User[]; resets: ResetRow[]; me: number; act: (fn: () => Promise<any>, ok?: string) => Promise<void>; code: {email: string; code: string; minutes: number} | null; setCode: (c: any) => void}) {
  const toast = useToast();
  const [f, setF] = useState({email: '', display_name: '', password: '', role: 'customer'});
  const [open, setOpen] = useState(false);
  const confirm = (title: string, ok: () => void) => Alert.alert(title, undefined, [{text: 'Hủy', style: 'cancel'}, {text: 'Đồng ý', style: 'destructive', onPress: ok}]);
  return (
    <View style={{gap: 14}}>
      <Button icon="plus" label={open ? 'Đóng biểu mẫu' : 'Tạo tài khoản mới'} onPress={() => setOpen(o => !o)} />
      {open && <Card pad={14}><View style={{gap: 12}}>
        <Field label="Email"><Input value={f.email} onChangeText={v => setF({...f, email: v})} keyboardType="email-address" autoCapitalize="none" accessibilityLabel="Email" /></Field>
        <Field label="Tên hiển thị"><Input value={f.display_name} onChangeText={v => setF({...f, display_name: v})} maxLength={100} accessibilityLabel="Tên hiển thị" /></Field>
        <Field label="Mật khẩu tạm (ít nhất 12 ký tự)"><PasswordInput value={f.password} onChangeText={v => setF({...f, password: v})} accessibilityLabel="Mật khẩu tạm" /></Field>
        <Field label="Vai trò"><Select label="Vai trò" value={f.role} onChange={v => setF({...f, role: v})} options={[{value: 'customer', label: 'Khách hàng'}, {value: 'admin', label: 'Quản trị viên'}]} /></Field>
        <Button tone="primary" label="Tạo tài khoản" onPress={() => act(async () => { await post('/api/admin/users', f); setF({email: '', display_name: '', password: '', role: 'customer'}); setOpen(false); }, 'Đã tạo tài khoản.')} />
        <T s={12.5} lh={1.5} color={C.ink3}>Gửi mật khẩu tạm cho người dùng qua kênh riêng và nhắc họ đổi sau khi đăng nhập.</T>
      </View></Card>}
      {users.map(u => {
        const self = u.id === me;
        return (
          <Card key={u.id} pad={14}><View style={{gap: 8}}>
            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center'}}><T w={800} s={16}>{u.display_name + (self ? ' (bạn)' : '')}</T><Tag tone={u.role === 'admin' ? 'signal' : 'plain'}>{u.role === 'admin' ? 'Quản trị' : 'Khách hàng'}</Tag><Tag tone={u.is_active ? 'ok' : 'missing'}>{u.is_active ? 'Hoạt động' : 'Đã khóa'}</Tag></View>
            <T mono s={12} color={C.ink2}>{u.email}</T>
            <T s={12} color={C.ink3}>{`Tạo ${when(u.created_at)} · đăng nhập gần nhất ${when(u.last_login_at)}`}</T>
            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center'}}>
              <View style={{minWidth: 170}}><Select label={'Vai trò của ' + u.display_name} value={u.role} onChange={v => act(() => post(`/api/admin/users/${u.id}/role`, {role: v}), 'Đã đổi vai trò.')} options={[{value: 'customer', label: 'Khách hàng'}, {value: 'admin', label: 'Quản trị viên'}]} /></View>
              <Button sm label={u.is_active ? 'Vô hiệu hóa' : 'Kích hoạt'} disabled={self} onPress={() => act(() => post(`/api/admin/users/${u.id}/active`, {active: !u.is_active}), u.is_active ? 'Đã vô hiệu hóa.' : 'Đã kích hoạt.')} />
              <Button sm tone="danger" label="Xóa" disabled={self} onPress={() => confirm(`Xóa tài khoản ${u.email}? Không hoàn tác được.`, () => act(() => del(`/api/admin/users/${u.id}`), 'Đã xóa tài khoản.'))} />
            </View>
          </View></Card>
        );
      })}
      <T s={12.5} lh={1.5} color={C.ink3}>Phải còn ít nhất một quản trị viên đang hoạt động. Vô hiệu hóa tài khoản sẽ đăng xuất người đó ngay.</T>
      <T w={800} s={22} style={{marginTop: 10}}>Yêu cầu quên mật khẩu</T>
      {code && <Callout tone="ok"><View style={{gap: 6}}><T w={800} s={14}>{`Mã đặt lại cho ${code.email}`}</T><T mono w={800} s={26} ls={0.2}>{code.code}</T><T s={13}>{`Hiệu lực ${code.minutes} phút. Chỉ hiển thị một lần; gửi mã này cho người dùng qua kênh riêng.`}</T><Button sm label="Chia sẻ mã" onPress={async () => { try { await Sharing.isAvailableAsync(); toast('Hãy đọc hoặc chép mã trên màn hình.'); } catch { /* noop */ } }} /></View></Callout>}
      {resets.length === 0 && <T s={14} color={C.ink3}>Không có yêu cầu nào đang chờ.</T>}
      {resets.map(r => (
        <Card key={r.id} pad={14}><View style={{gap: 6}}>
          <T w={800} s={15}>{r.display_name}</T><T mono s={12} color={C.ink2}>{r.email}</T>
          <View style={{flexDirection: 'row', gap: 6}}><Tag tone={r.status === 'pending' ? 'low' : 'ok'}>{r.status === 'pending' ? 'Chờ cấp mã' : 'Đã cấp mã'}</Tag></View>
          <T s={12} color={C.ink3}>{`Yêu cầu ${when(r.requested_at)} · hết hạn ${r.expires_at ? when(r.expires_at) : '—'}`}</T>
          <View style={{flexDirection: 'row', gap: 8}}>
            <Button sm tone="primary" label={r.status === 'issued' ? 'Cấp mã mới' : 'Cấp mã'} onPress={() => act(async () => { const res = await post<{code: string; valid_minutes: number}>(`/api/admin/resets/${r.id}/issue`); setCode({email: r.email, code: res.code, minutes: res.valid_minutes}); })} />
            <Button sm label="Hủy" onPress={() => act(() => post(`/api/admin/resets/${r.id}/cancel`), 'Đã hủy yêu cầu.')} />
          </View>
        </View></Card>
      ))}
      <T s={12.5} lh={1.5} color={C.ink3}>Bấm “Cấp mã”, rồi gửi mã cho người dùng qua kênh riêng. Mã chỉ hiện một lần, dùng được một lần, hiệu lực 30 phút.</T>
    </View>
  );
}

function DataTab({info}: {info: any}) {
  const {data} = useData();
  const rows = data?.rows ?? [], years = [...new Set(rows.map(r => r.year))].sort(), last = years.at(-1);
  const ok = (r: any, k: string) => typeof r[k + '_coverage'] === 'number' && r[k] != null && r[k + '_coverage'] >= 0.5;
  const dates: Record<number, string> = {};
  for (const r of rows) dates[r.year] = [...new Set([...(dates[r.year] ? dates[r.year].split(', ') : []), ...(r.dates ?? [])])].sort().join(', ');
  const low = rows.filter(r => r.year === last && INDICES.some(k => !ok(r, k))).sort((a, b) => (a.lst_coverage ?? 0) - (b.lst_coverage ?? 0));
  const [tech, setTech] = useState(false);
  return (
    <View style={{gap: 14}}>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 12}}><Stat value={years.length ? `${years[0]}–${years.at(-1)}` : '—'} label="Giai đoạn đã nạp" /><Stat value={String(rows.filter(r => r.year === last).length)} label={`Khu vực trong bộ dữ liệu ${last ?? ''}`} /><Stat signal value={String(low.length)} label={`Khu vực còn ít dữ liệu ${last ?? ''}`} /><Stat value={(data?.products.generated_at ?? '').slice(0, 10) || '—'} label="Bộ dữ liệu tạo ngày" /></View>
      <T w={800} s={22}>Mỗi năm có bao nhiêu khu vực đủ dữ liệu?</T>
      <T s={13} color={C.ink3}>“Đủ dữ liệu” là từ 50% diện tích ảnh dùng được, trên tổng 167 khu vực.</T>
      <Table rowKey={r => String(r.year)} rows={years.map(y => ({year: y}))} cols={[{key: 'y', label: 'Năm', width: 64, render: (r: any) => <T mono w={700} s={13}>{String(r.year)}</T>}, ...INDICES.map(k => ({key: k, label: INDEX[k].label, width: 96, num: true, render: (r: any) => <T mono s={13}>{`${rows.filter(x => x.year === r.year && ok(x, k)).length} / 167`}</T>})), {key: 'd', label: 'Ngày chụp các cảnh', width: 300, render: (r: any) => <T mono s={11.5} lh={1.4}>{dates[r.year] || '—'}</T>}]} />
      <T w={800} s={22}>Khu vực còn ít dữ liệu</T>
      <T s={13} color={C.ink3}>Khu vực có chỉ số dưới 50% độ phủ ở năm gần nhất. Ứng dụng đánh dấu “tin cậy thấp” và không xếp hạng các khu vực này.</T>
      <Table rowKey={r => r.code} rows={low} cols={[{key: 'name', label: 'Khu vực', width: 170, render: (r: any) => <T w={700} s={13}>{r.name}</T>}, ...INDICES.map(k => ({key: k, label: INDEX[k].label, width: 86, num: true, flag: (r: any) => ok(r, k) ? undefined : C.warnBg, render: (r: any) => <T mono s={13}>{pct(r[k + '_coverage'])}</T>}))]} empty="Mọi khu vực đều đủ dữ liệu." />
      <Button label={tech ? 'Thu gọn chi tiết kỹ thuật' : 'Chi tiết kỹ thuật (cơ sở dữ liệu, tài liệu)'} onPress={() => setTech(t => !t)} />
      {tech && info && <Card pad={14}><View style={{gap: 8}}>
        {[['Phiên bản', info.version], ['PostgreSQL / PostGIS', `${info.database.postgres_version} / ${info.database.postgis}`], ['Phiên bản schema', String(info.database.schema_version)], ['Nguồn dữ liệu', info.database.datasets.map((d: any) => `${d.dataset_id}: ${d.rows.toLocaleString('vi-VN')} dòng`).join(' · ')], ['Bảng chỉ số', info.database.metric_tables.map((m: any) => `${m.table}: ${m.rows.toLocaleString('vi-VN')}`).join(' · ')]].map(([k, v]) => <View key={k}><T w={800} s={13}>{k}</T><T mono s={12} color={C.ink2}>{v}</T></View>)}
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>{[['/docs', 'Tài liệu REST API'], ['/api/documents/schema.sql', 'SQL tạo bảng'], ['/api/documents/database_design.md', 'Thiết kế CSDL'], ['/api/documents/gee_script.js', 'Script xuất GEE']].map(([h, l]) => <Button key={h} sm label={l} onPress={() => Linking.openURL(API_BASE + h)} />)}</View>
      </View></Card>}
    </View>
  );
}

function Content({act}: {act: (fn: () => Promise<any>, ok?: string) => Promise<void>}) {
  const {data} = useData();
  const [notice, setNotice] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [code, setCode] = useState('');
  const [text, setText] = useState('');
  useEffect(() => { get<{text: string}>('/api/notice').then(n => setNotice(n.text || '')).catch(() => {}); get<{notes: Record<string, string>}>('/api/content').then(c => setNotes(c.notes || {})).catch(() => {}); }, []);
  return (
    <View style={{gap: 14}}>
      <T w={800} s={22}>Thông báo đầu trang</T>
      <Field label="Nội dung (tối đa 300 ký tự, để trống để gỡ thông báo)"><Input value={notice} onChangeText={setNotice} multiline maxLength={300} accessibilityLabel="Thông báo" /></Field>
      <Button tone="primary" label="Lưu thông báo" onPress={() => act(() => post('/api/admin/notice', {text: notice}), 'Đã lưu thông báo.')} />
      <T s={12.5} lh={1.5} color={C.ink3}>Thông báo hiện ở đầu trang cho mọi người; mỗi người có thể đóng nó. Chỉ là văn bản thuần, không có liên kết hay định dạng.</T>
      <T w={800} s={22} style={{marginTop: 8}}>Ghi chú theo khu vực</T>
      <Field label="Khu vực"><Select label="Khu vực" value={code} onChange={v => { setCode(v); setText(notes[v] || ''); }} options={[{value: '', label: 'Chọn khu vực'}, ...(data?.geo.features ?? []).map(f => ({value: f.properties.code, label: f.properties.full_name}))]} /></Field>
      <Field label="Ghi chú (tối đa 500 ký tự, để trống để xóa)"><Input value={text} onChangeText={setText} multiline maxLength={500} accessibilityLabel="Ghi chú" /></Field>
      <Button tone="primary" label="Lưu ghi chú" disabled={!code} onPress={() => act(async () => { await post('/api/admin/notes', {code, text}); setNotes(n => ({...n, [code]: text})); }, 'Đã lưu ghi chú.')} />
      <T s={12.5} lh={1.5} color={C.ink3}>Ghi chú hiện trong thẻ khu vực trên bản đồ, ví dụ “có công viên lớn”, “khu công nghiệp”. Đây là mô tả của người quản trị, không phải số liệu vệ tinh.</T>
    </View>
  );
}

function Events({events}: {events: EventRow[]}) {
  return (
    <Table rowKey={(e, i) => e.created_at + i} rows={events} empty="Chưa có sự kiện." minWidth={640} cols={[{key: 't', label: 'Thời gian', width: 120, render: (e: EventRow) => <T mono s={12}>{when(e.created_at)}</T>}, {key: 'e', label: 'Sự kiện', width: 150, render: (e: EventRow) => <T w={700} s={13}>{EVENTS[e.event] || e.event}</T>}, {key: 'a', label: 'Tài khoản', width: 190, render: (e: EventRow) => <T mono s={12}>{e.email || '—'}</T>}, {key: 'd', label: 'Chi tiết', width: 180, render: (e: EventRow) => <T s={12}>{e.detail || ''}</T>}]} />
  );
}
