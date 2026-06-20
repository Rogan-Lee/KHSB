import { BookOpenCheck, CalendarClock, MessageSquareText } from 'lucide-react-native';
import { Href, router } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import {
  ActionRow,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PrimaryButton,
  SectionTitle,
  StatCard,
} from '@/components/mobile-ui';
import { colors, spacing } from '@/constants/theme';
import {
  formatDueDate,
  formatKoreanDateTime,
  formatKoreanDay,
} from '@/lib/format';
import { StudentOverviewResponse, useMobileQuery } from '@/lib/mobile-api';
import { useSession } from '@/lib/session';

const STUDENT_TASKS_ROUTE = '/student-tasks' as Href;

export default function StudentHomeScreen() {
  const { session } = useSession();
  const { data, error, isLoading, isRefreshing, refresh, retry } =
    useMobileQuery<StudentOverviewResponse>('/api/mobile/v1/student/overview');

  return (
    <AppScreen
      eyebrow={formatKoreanDay()}
      onRefresh={() => void refresh()}
      refreshing={isRefreshing}
      subtitle="오늘 해야 할 학습과 상담 일정을 확인하세요."
      title={`${session?.displayName ?? '학생'}님`}>
      {isLoading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void retry()} /> : null}
      {data ? <StudentHomeContent data={data} /> : null}
    </AppScreen>
  );
}

function StudentHomeContent({ data }: { data: StudentOverviewResponse }) {
  const taskProgress = data.stats.totalTasks
    ? Math.round((data.stats.doneTasks / data.stats.totalTasks) * 100)
    : 0;

  return (
    <>
      <View style={styles.stats}>
        <StatCard
          caption="완료한 과제"
          tone="primary"
          value={`${data.stats.doneTasks}/${data.stats.totalTasks}`}
        />
        <StatCard caption="진행 중 과제" tone="blue" value={`${data.stats.openTasks}`} />
        <StatCard
          caption="미확인 소식"
          tone="amber"
          value={`${data.stats.unreadFeedbacks + data.stats.unreadQuestions}`}
        />
      </View>

      <SectionTitle>가장 급한 학습</SectionTitle>
      {data.nextTask ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(STUDENT_TASKS_ROUTE)}
          style={({ pressed }) => pressed && styles.pressed}>
          <Card>
            <View style={styles.task}>
            <View style={styles.taskTop}>
              <Badge tone={data.nextTask.status === 'NEEDS_REVISION' ? 'red' : 'amber'}>
                {formatDueDate(data.nextTask.dueDate)}
              </Badge>
              <Text style={styles.taskTime}>{data.nextTask.statusLabel}</Text>
            </View>
            <Text style={styles.taskSubject}>{data.nextTask.subject}</Text>
            <Text style={styles.taskTitle}>{data.nextTask.title}</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressValue, { width: `${taskProgress}%` }]} />
            </View>
            </View>
          </Card>
        </Pressable>
      ) : (
        <EmptyState
          message={
            data.isOnlineManaged
              ? '현재 진행 중인 수행평가가 없습니다.'
              : '배정된 온라인 관리 과제가 없습니다.'
          }
          title="진행할 과제가 없습니다"
        />
      )}

      <SectionTitle>다가오는 일정</SectionTitle>
      <Card>
        {data.nextSession ? (
          <>
            <ActionRow
              caption={`${formatKoreanDateTime(data.nextSession.scheduledAt)} · ${data.nextSession.durationMinutes}분`}
              icon={CalendarClock}
              onPress={
                data.nextSession.meetUrl
                  ? () => void Linking.openURL(data.nextSession!.meetUrl!)
                  : undefined
              }
              title={`${data.nextSession.hostName} 멘토링`}
              tone="violet"
            />
            {data.nextSession.meetUrl ? (
              <View style={styles.meetButton}>
                <PrimaryButton
                  onPress={() => void Linking.openURL(data.nextSession!.meetUrl!)}
                  variant="secondary">
                  Meet 입장
                </PrimaryButton>
              </View>
            ) : null}
          </>
        ) : (
          <ActionRow
            caption="예정된 일정이 없습니다."
            icon={CalendarClock}
            title="다음 멘토링"
            tone="violet"
          />
        )}
        <View style={styles.divider} />
        <ActionRow
          caption={
            data.stats.unreadQuestions > 0
              ? `새 답변 ${data.stats.unreadQuestions}건`
              : `진행 중인 질문 ${data.stats.openQuestions}건`
          }
          icon={MessageSquareText}
          title="질문 답변 확인"
          tone="blue"
        />
        <View style={styles.divider} />
        <ActionRow
          caption={
            data.stats.unreadFeedbacks > 0
              ? `미확인 피드백 ${data.stats.unreadFeedbacks}건`
              : '새로 도착한 피드백이 없습니다.'
          }
          icon={BookOpenCheck}
          onPress={() => router.push(STUDENT_TASKS_ROUTE)}
          title="학습 피드백"
          tone="primary"
        />
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  stats: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  task: {
    gap: spacing.sm,
    padding: spacing.lg,
  },
  taskTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  taskTime: {
    color: colors.muted,
    fontSize: 12,
  },
  taskSubject: {
    color: colors.blue,
    fontSize: 12,
    fontWeight: '800',
  },
  taskTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  progressTrack: {
    backgroundColor: colors.line,
    borderRadius: 4,
    height: 6,
    overflow: 'hidden',
  },
  progressValue: {
    backgroundColor: colors.primary,
    height: '100%',
  },
  meetButton: {
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  divider: {
    backgroundColor: colors.line,
    height: StyleSheet.hairlineWidth,
    marginLeft: 64,
  },
  pressed: {
    opacity: 0.72,
  },
});
