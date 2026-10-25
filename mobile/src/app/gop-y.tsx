/** "Góp ý hoặc báo lỗi": any signed-in person can tell the team about wrong-looking data, a suggestion or an app problem. Admins read these on the admin page. */
import {useState} from 'react';
import {View} from 'react-native';
import {useRouter} from 'expo-router';
import {Block, Button, Callout, Card, Field, Input, Page, PageHead, Segmented, T, C, useToast} from '@/ds';
import {useData} from '@/components/DataProvider';
import {post} from '@/lib/api';
import {shortName} from '@/lib/format';
import {useSession} from '@/lib/session';
import {useStore} from '@/lib/store';

const KINDS = [
  {value: 'data_error', label: 'Số liệu có vẻ sai'},
  {value: 'suggestion', label: 'Đề xuất cải tiến'},
  {value: 'ui_error', label: 'Lỗi hiển thị / ứng dụng'},
];
const HINT: Record<string, string> = {
  data_error: 'Nói rõ khu vực, năm và chỉ số bạn thấy chưa hợp lý, kèm lý do nếu có.',
  suggestion: 'Bạn muốn app có thêm chức năng hoặc dễ dùng hơn ở chỗ nào?',
  ui_error: 'Màn hình nào, bấm vào đâu thì xảy ra lỗi? Tên điện thoại và phiên bản Android giúp nhóm sửa nhanh hơn.',
};

export default function Feedback() {
  const router = useRouter();
  const toast = useToast();
  const session = useSession();
  const {data} = useData();
  const selected = useStore(s => s.selected);
  const feature = data?.geo.features.find(f => f.properties.code === selected);
  const [kind, setKind] = useState('data_error');
  const [withArea, setWithArea] = useState('none');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const signedIn = !!session.user;

  const send = async () => {
    const text = message.trim();
    if (text.length < 5) return toast('Nội dung góp ý cần từ 5 ký tự trở lên.', {error: true});
    setBusy(true);
    try {
      await post('/api/feedback', {kind, code: withArea === 'sel' && feature ? feature.properties.code : null, message: text});
      toast('Đã gửi góp ý cho nhóm. Cảm ơn bạn!');
      setMessage('');
    } catch (e: any) { toast(e.message, {error: true}); }
    setBusy(false);
  };

  return (
    <Page back={{label: 'Giới thiệu', href: '/du-lieu'}}>
      <PageHead eyebrow="Góp ý" title="Góp ý hoặc báo lỗi" intro="Thấy số liệu chưa hợp lý, có ý tưởng hay gặp lỗi khi dùng app? Hãy cho nhóm biết. Quản trị viên sẽ đọc và xử lý góp ý của bạn." />
      <Block>
        {!signedIn ? (
          <Card><View style={{gap: 12}}>
            <Callout>Bạn cần đăng nhập để gửi góp ý, để nhóm có thể chống gửi trùng lặp và liên hệ lại khi cần.</Callout>
            <Button tone="primary" icon="user" label="Đăng nhập" onPress={() => router.navigate('/dang-nhap' as any)} />
          </View></Card>
        ) : (
          <Card><View style={{gap: 14}}>
            <Field label="Loại góp ý"><Segmented layout="col" options={KINDS} value={kind} onChange={setKind} label="Loại góp ý" /></Field>
            {feature && (
              <Field label="Khu vực liên quan"><Segmented options={[{value: 'none', label: 'Không chọn'}, {value: 'sel', label: shortName(feature.properties.name)}]} value={withArea} onChange={setWithArea} label="Khu vực liên quan" /></Field>
            )}
            <Field label="Nội dung"><Input multiline value={message} onChangeText={setMessage} maxLength={1000} placeholder={HINT[kind]} /></Field>
            <T s={12} color={C.ink3}>{`${message.trim().length}/1000 ký tự`}</T>
            <Button tone="dark" label="Gửi góp ý" disabled={busy} onPress={send} />
          </View></Card>
        )}
      </Block>
    </Page>
  );
}
