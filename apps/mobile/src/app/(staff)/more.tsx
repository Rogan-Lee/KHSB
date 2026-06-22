import { router } from 'expo-router';
import type { Href } from 'expo-router';
import {
  Banknote,
  Bell,
  BookOpenCheck,
  ClipboardList,
  LogOut,
  MessageSquareText,
  ScanLine,
  Settings,
  TimerReset,
} from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { AccountSecurity } from '@/components/account-security';
import { HandoverSheet } from '@/components/staff/handover-sheet';
import { PatrolSheet } from '@/components/staff/patrol-sheet';
import { WorkSheet } from '@/components/staff/work-sheet';
import { ActionRow, Card, PrimaryButton, SectionTitle } from '@/components/mobile-ui';
import { colors, spacing } from '@/constants/theme';
import { formatMinutes } from '@/lib/format';
import { StaffOperationsResponse, useMobileQuery } from '@/lib/mobile-api';
import { useSession } from '@/lib/session';

const STAFF_TASKS_ROUTE = '/staff-tasks' as Href;
const NOTIFICATIONS_ROUTE = '/notifications' as Href;

export default function StaffMoreScreen() {
  const { session, signOut } = useSession();
  const canManageOnlineTasks = [
    'SUPER_ADMIN',
    'DIRECTOR',
    'CONSULTANT',
    'MANAGER_MENTOR',
  ].includes(session?.staffRole ?? '');
  const canWriteTaskFeedback = ['SUPER_ADMIN', 'DIRECTOR', 'CONSULTANT'].includes(
    session?.staffRole ?? '',
  );
  const [sheet, setSheet] = useState<'work' | 'handover' | 'patrol' | null>(null);
  const { data, error, isRefreshing, refresh, retry } =
    useMobileQuery<StaffOperationsResponse>('/api/mobile/v1/staff/operations');

  const logout = async () => {
    await signOut();
    router.replace('/(auth)');
  };

  return (
    <AppScreen
      onRefresh={() => void refresh()}
      refreshing={isRefreshing}
      subtitle="관리자 계정"
      title={session?.displayName ?? '관리자'}>
      {error && !data ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <PrimaryButton onPress={() => void retry()} variant="secondary">
            다시 시도
          </PrimaryButton>
        </Card>
      ) : null}
      <SectionTitle>근무</SectionTitle>
      <Card>
        <ActionRow
          caption={
            data?.clock.lastTag
              ? data.clock.isWorking
                ? '현재 근무 중'
                : '현재 퇴근 상태'
              : '출퇴근 기록 없음'
          }
          icon={TimerReset}
          onPress={data ? () => setSheet('work') : undefined}
          title="근무 기록"
          tone="blue"
        />
        <Divider />
        <ActionRow
          caption={
            data
              ? `${data.month.month}월 ${formatMinutes(data.month.totalMinutes)}`
              : '이번 달 내역 불러오는 중'
          }
          icon={Banknote}
          onPress={data ? () => setSheet('work') : undefined}
          title="근무 시간·급여"
          tone="primary"
        />
        <Divider />
        <ActionRow
          caption={
            data?.patrol
              ? `진행 중 · ${data.patrol.checkedCount}/${data.patrol.rosterCount}명`
              : '진행 중인 회차 없음'
          }
          icon={ScanLine}
          onPress={data ? () => setSheet('patrol') : undefined}
          title="순찰 QR 스캔"
          tone="violet"
        />
      </Card>

      <SectionTitle>운영</SectionTitle>
      <Card>
        <ActionRow
          caption={
            data
              ? `오늘 ${data.handovers.today}건 · 미확인 ${data.handovers.unread}건`
              : '최근 내역 불러오는 중'
          }
          icon={ClipboardList}
          onPress={data ? () => setSheet('handover') : undefined}
          title="할 일·인수인계"
          tone="amber"
        />
        <Divider />
        {canManageOnlineTasks ? (
          <>
            <ActionRow
              caption={
                canWriteTaskFeedback
                  ? '제출물 확인·수정 요청·승인'
                  : '학생 제출물 확인'
              }
              icon={BookOpenCheck}
              onPress={() => router.push(STAFF_TASKS_ROUTE)}
              title="수행평가 관리"
              tone="violet"
            />
            <Divider />
          </>
        ) : null}
        <ActionRow icon={MessageSquareText} title="건의사항 관리" tone="blue" />
        <Divider />
        <ActionRow
          caption="질의응답·수행평가 알림"
          icon={Bell}
          onPress={() => router.push(NOTIFICATIONS_ROUTE)}
          title="알림 설정"
          tone="blue"
        />
        <Divider />
        <ActionRow icon={Settings} title="앱 설정" />
        <Divider />
        <ActionRow icon={LogOut} onPress={logout} title="로그아웃" tone="red" />
      </Card>
      <AccountSecurity />
      {data && sheet === 'work' ? (
        <WorkSheet
          data={data}
          onChanged={refresh}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === 'handover' ? (
        <HandoverSheet onChanged={refresh} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === 'patrol' ? (
        <PatrolSheet onChanged={refresh} onClose={() => setSheet(null)} />
      ) : null}
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
  errorCard: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  errorText: {
    color: colors.red,
    fontSize: 13,
    lineHeight: 19,
  },
});
