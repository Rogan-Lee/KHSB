import { router } from 'expo-router';
import {
  Banknote,
  ClipboardList,
  LogOut,
  MessageSquareText,
  ScanLine,
  Settings,
  TimerReset,
} from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { ActionRow, Card, SectionTitle } from '@/components/mobile-ui';
import { colors } from '@/constants/theme';
import { useSession } from '@/lib/session';

export default function StaffMoreScreen() {
  const { session, signOut } = useSession();

  const logout = async () => {
    await signOut();
    router.replace('/(auth)');
  };

  return (
    <AppScreen subtitle="관리자 계정" title={session?.displayName ?? '관리자'}>
      <SectionTitle>근무</SectionTitle>
      <Card>
        <ActionRow caption="오늘 09:02 출근" icon={TimerReset} title="근무 기록" tone="blue" />
        <Divider />
        <ActionRow caption="이번 달 86시간" icon={Banknote} title="근무 시간·급여" tone="primary" />
        <Divider />
        <ActionRow icon={ScanLine} title="순찰 QR 스캔" tone="violet" />
      </Card>

      <SectionTitle>운영</SectionTitle>
      <Card>
        <ActionRow icon={ClipboardList} title="할 일·인수인계" tone="amber" />
        <Divider />
        <ActionRow icon={MessageSquareText} title="건의사항 관리" tone="blue" />
        <Divider />
        <ActionRow icon={Settings} title="앱 설정" />
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
