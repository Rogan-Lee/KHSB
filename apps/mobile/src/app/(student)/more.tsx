import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { Bell, ClipboardList, Lightbulb, LogOut, MessageSquareHeart, ShieldCheck } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { AccountSecurity } from '@/components/account-security';
import { ActionRow, Card, SectionTitle } from '@/components/mobile-ui';
import { colors } from '@/constants/theme';
import { useSession } from '@/lib/session';

const NOTIFICATIONS_ROUTE = '/notifications' as Href;
const FEEDBACK_ROUTE = '/feedback' as Href;
const SUGGESTIONS_ROUTE = '/suggestions' as Href;
const SURVEY_ROUTE = '/survey' as Href;

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
        <ActionRow
          icon={ClipboardList}
          onPress={() => router.push(SURVEY_ROUTE)}
          title="초기 설문"
          tone="violet"
        />
        <Divider />
        <ActionRow
          icon={MessageSquareHeart}
          onPress={() => router.push(FEEDBACK_ROUTE)}
          title="받은 피드백"
        />
        <Divider />
        <ActionRow
          icon={Lightbulb}
          onPress={() => router.push(SUGGESTIONS_ROUTE)}
          title="건의사항"
          tone="amber"
        />
      </Card>

      <SectionTitle>앱 설정</SectionTitle>
      <Card>
        <ActionRow
          caption="과제·답변·멘토링 알림"
          icon={Bell}
          onPress={() => router.push(NOTIFICATIONS_ROUTE)}
          title="알림 설정"
          tone="blue"
        />
        <Divider />
        <ActionRow caption="기기 보안 저장소 사용 중" icon={ShieldCheck} title="로그인 보안" />
        <Divider />
        <ActionRow icon={LogOut} onPress={logout} title="로그아웃" tone="red" />
      </Card>
      <AccountSecurity />
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
