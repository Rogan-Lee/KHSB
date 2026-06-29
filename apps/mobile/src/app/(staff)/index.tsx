import { useRouter } from 'expo-router';
import {
  Banknote,
  BookOpenCheck,
  CircleHelp,
  ClipboardList,
  Clock3,
  MessagesSquare,
  MoreHorizontal,
  ScanLine,
  UsersRound,
} from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import {
  ActionRow,
  Badge,
  Card,
  ErrorState,
  HubGrid,
  HubTile,
  LoadingState,
  SectionTitle,
  StatCard,
} from '@/components/mobile-ui';
import { colors, spacing } from '@/constants/theme';
import { isStaffCapabilities } from '@/lib/capabilities';
import { formatKoreanDay } from '@/lib/format';
import { StaffOverviewResponse, useMobileQuery } from '@/lib/mobile-api';
import { useSession } from '@/lib/session';

export default function StaffHomeScreen() {
  const router = useRouter();
  const { session } = useSession();
  const caps =
    session && isStaffCapabilities(session.capabilities) ? session.capabilities : null;
  const { data, error, isLoading, isRefreshing, refresh, retry } =
    useMobileQuery<StaffOverviewResponse>('/api/mobile/v1/staff/overview');

  return (
    <AppScreen
      eyebrow={`KHSB · ${formatKoreanDay()}`}
      onRefresh={() => void refresh()}
      refreshing={isRefreshing}
      subtitle="오늘 처리할 업무를 한곳에서."
      title={`${session?.displayName ?? '관리자'}님`}>
      {isLoading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void retry()} /> : null}
      {data ? (
        <>
          <View style={styles.stats}>
            <StatCard caption="현재 입실" tone="positive" value={`${data.stats.currentAttendance}`} />
            <StatCard caption="미답변 질문" tone="negative" value={`${data.stats.openQuestions}`} />
            <StatCard caption="오늘 멘토링" tone="violet" value={`${data.stats.todayMentoring}`} />
          </View>

          <SectionTitle>업무 바로가기</SectionTitle>
          <HubGrid>
            <HubTile
              icon={Clock3}
              label="입퇴실"
              tone="blue"
              badge={data.priorities.lateStudents}
              onPress={() => router.push('/(staff)/attendance')}
            />
            <HubTile
              icon={UsersRound}
              label="멘토링"
              tone="violet"
              badge={data.stats.todayMentoring}
              onPress={() => router.push('/(staff)/mentoring')}
            />
            <HubTile
              icon={CircleHelp}
              label="질문 답변"
              tone="warning"
              badge={data.stats.openQuestions}
              onPress={() => router.push('/(staff)/qna')}
            />
            <HubTile
              icon={MessagesSquare}
              label="학생 채팅"
              tone="info"
              onPress={() => router.push('/(staff)/chat')}
            />
            <HubTile
              icon={ScanLine}
              label="순찰 QR"
              tone="info"
              onPress={() => router.push({ pathname: '/more', params: { sheet: 'patrol' } })}
            />
            <HubTile
              icon={ClipboardList}
              label="인수인계"
              tone="amber"
              onPress={() => router.push({ pathname: '/more', params: { sheet: 'handover' } })}
            />
            <HubTile
              icon={Banknote}
              label="근무·급여"
              tone="primary"
              onPress={() => router.push({ pathname: '/more', params: { sheet: 'work' } })}
            />
            {caps?.onlineModule ? (
              <HubTile
                icon={BookOpenCheck}
                label="수행평가"
                tone="positive"
                onPress={() => router.push('/staff-tasks')}
              />
            ) : null}
            <HubTile
              icon={MoreHorizontal}
              label="더보기"
              tone="neutral"
              onPress={() => router.push('/more')}
            />
          </HubGrid>

          <SectionTitle
            action={
              data.priorities.lateStudents + data.priorities.openQuestions > 0 ? (
                <Badge tone="negative">
                  {data.priorities.lateStudents + data.priorities.openQuestions}건
                </Badge>
              ) : undefined
            }>
            우선 처리
          </SectionTitle>
          <Card>
            <ActionRow
              caption="입실 예정 시각에서 30분 이상 지남"
              icon={Clock3}
              onPress={() => router.push('/(staff)/attendance')}
              title={`지각 확인 필요 ${data.priorities.lateStudents}명`}
              tone={data.priorities.lateStudents > 0 ? 'negative' : 'primary'}
            />
            <View style={styles.divider} />
            <ActionRow
              caption="등록 순서대로 확인하세요."
              icon={CircleHelp}
              onPress={() => router.push('/(staff)/qna')}
              title={`미답변 질문 ${data.priorities.openQuestions}건`}
              tone={data.priorities.openQuestions > 0 ? 'warning' : 'primary'}
            />
          </Card>
        </>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: spacing.sm },
  divider: { height: 1, backgroundColor: colors.lineAlt, marginLeft: 64 },
});
