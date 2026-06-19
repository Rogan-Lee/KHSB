import { router } from 'expo-router';
import { Bell, CalendarDays, Lightbulb, LogOut, MessageSquareHeart, ShieldCheck } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { ActionRow, Card, SectionTitle } from '@/components/mobile-ui';
import { colors } from '@/constants/theme';
import { useSession } from '@/lib/session';

export default function StudentMoreScreen() {
  const { session, signOut } = useSession();

  const logout = async () => {
    await signOut();
    router.replace('/(auth)');
  };

  return (
    <AppScreen subtitle="온라인 관리 학생" title={session?.displayName ?? '학생'}>
      <SectionTitle>학생 관리</SectionTitle>
      <Card>
        <ActionRow icon={CalendarDays} title="멘토링 일정" tone="violet" />
        <Divider />
        <ActionRow icon={MessageSquareHeart} title="받은 피드백" />
        <Divider />
        <ActionRow icon={Lightbulb} title="건의사항" tone="amber" />
      </Card>

      <SectionTitle>앱 설정</SectionTitle>
      <Card>
        <ActionRow caption="과제·답변·멘토링 알림" icon={Bell} title="알림 설정" tone="blue" />
        <Divider />
        <ActionRow caption="기기 보안 저장소 사용 중" icon={ShieldCheck} title="로그인 보안" />
        <Divider />
        <ActionRow icon={LogOut} onPress={logout} title="로그아웃" tone="red" />
      </Card>
    </AppScreen>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  divider: {
    backgroundColor: colors.line,
    height: StyleSheet.hairlineWidth,
    marginLeft: 64,
  },
});
