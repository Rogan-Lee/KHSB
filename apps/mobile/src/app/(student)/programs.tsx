import {
  BookMarked,
  ClipboardCheck,
  MessageCircleMore,
  NotebookTabs,
  Speech,
} from 'lucide-react-native';
import { Href, router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import {
  ActionRow,
  Card,
  ErrorState,
  LoadingState,
  SectionTitle,
} from '@/components/mobile-ui';
import { colors } from '@/constants/theme';
import { StudentOverviewResponse, useMobileQuery } from '@/lib/mobile-api';

const STUDENT_TASKS_ROUTE = '/student-tasks' as Href;

export default function StudentProgramsScreen() {
  const { data, error, isLoading, isRefreshing, refresh, retry } =
    useMobileQuery<StudentOverviewResponse>('/api/mobile/v1/student/overview');

  return (
    <AppScreen
      onRefresh={() => void refresh()}
      refreshing={isRefreshing}
      subtitle="배정된 프로그램의 현재 상태입니다."
      title="관리 프로그램">
      {isLoading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void retry()} /> : null}
      {data ? (
        <>
          <SectionTitle>학습</SectionTitle>
          <Card>
            <ActionRow
              caption={`${data.stats.openTasks}건 진행 중 · ${data.stats.doneTasks}건 완료`}
              icon={ClipboardCheck}
              onPress={() => router.push(STUDENT_TASKS_ROUTE)}
              title="수행평가"
            />
            <Divider />
            <ActionRow
              caption={
                data.stats.unreadFeedbacks > 0
                  ? `${data.stats.unreadFeedbacks}건 확인 필요`
                  : '미확인 피드백 없음'
              }
              icon={NotebookTabs}
              onPress={() => router.push(STUDENT_TASKS_ROUTE)}
              title="과제 피드백"
              tone="violet"
            />
            <Divider />
            <ActionRow
              caption={data.isOnlineManaged ? '온라인 관리 대상' : '현재 배정되지 않음'}
              icon={BookMarked}
              title="주간 학습 관리"
              tone="amber"
            />
          </Card>

          <SectionTitle>소통</SectionTitle>
          <Card>
            <ActionRow
              caption={`진행 중 ${data.stats.openQuestions}건 · 새 답변 ${data.stats.unreadQuestions}건`}
              icon={MessageCircleMore}
              title="질의응답"
              tone="blue"
            />
            <Divider />
            <ActionRow
              caption={
                data.nextSession
                  ? `${data.nextSession.hostName} 멘토 일정 배정됨`
                  : '예정된 멘토링 없음'
              }
              icon={Speech}
              title="온라인 멘토링"
              tone="primary"
            />
          </Card>
        </>
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
});
