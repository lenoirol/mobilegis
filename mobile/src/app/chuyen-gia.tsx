import {Pressable, View} from 'react-native';
import {useRouter} from 'expo-router';
import {Button, Card, Icon, Page, PageHead, Reveal, T, C, type IconName} from '@/ds';
import {useSession} from '@/lib/session';

const CARDS: {href: string; icon: IconName; title: string; text: string; admin?: boolean}[] = [
  {href: '/bang-so-lieu', icon: 'table', title: 'Bảng số liệu', text: 'Giá trị nhiệt độ, độ xanh, độ khô của từng xã/phường theo năm, kèm bảng tổng, xếp hạng và tải CSV.'},
  {href: '/thong-ke', icon: 'chart', title: 'Thống kê', text: 'Biểu đồ diễn biến, so sánh nhiều khu vực, tương quan nhiệt độ – độ xanh và sàng lọc khu vực có độ khô cao.'},
  {href: '/gia-lap', icon: 'flask', title: 'Kịch bản giả lập', text: 'Công cụ thử nghiệm của quản trị viên, nằm ngoài đề cương. Không phải dự báo.', admin: true},
];
export default function Experts() {
  const router = useRouter();
  const session = useSession();
  return (
    <Page>
      <PageHead eyebrow="Dành cho chuyên gia" title="Số liệu chi tiết" intro="Các bảng và thống kê dành cho người có chuyên môn. Bản đồ vẫn là cách nhanh nhất để xem kết quả; những trang này giúp đối chiếu và kiểm tra." />
      <View style={{gap: 18}}>
        {CARDS.filter(c => !c.admin || session.user?.role === 'admin').map((c, i) => (
          <Reveal key={c.href} index={i}>
            <Pressable onPress={() => router.navigate(c.href as any)} accessibilityRole="link" accessibilityLabel={c.title}>
              <Card><View style={{gap: 10}}><Icon name={c.icon} size={28} /><T w={800} s={24} ls={-0.02}>{c.title}</T><T s={15} lh={1.5} color={C.ink3}>{c.text}</T><Button sm label="Mở" onPress={() => router.navigate(c.href as any)} /></View></Card>
            </Pressable>
          </Reveal>
        ))}
      </View>
    </Page>
  );
}
