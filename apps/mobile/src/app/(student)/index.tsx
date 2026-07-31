import {
  Bell,
  BookA,
  BookMarked,
  CalendarClock,
  CircleHelp,
  ClipboardList,
  LayoutGrid,
  Lightbulb,
  LockKeyhole,
  MessageSquareText,
  MessagesSquare,
  UserRound,
  Video,
} from 'lucide-react-native';
import { Href, router } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import {
  Badge,
  Banner,
  Card,
  Divider,
  Dot,
  EmptyState,
  ErrorState,
  HubGrid,
  HubTile,
  LoadingState,
  PrimaryButton,
  SectionTitle,
} from '@/components/mobile-ui';
import { colors, palette, radius, spacing, Tone, type } from '@/constants/theme';
import { formatDueDate, formatKoreanDateTime } from '@/lib/format';
import { StudentOverviewResponse, useMobileQuery } from '@/lib/mobile-api';
import { useSession } from '@/lib/session';

const TASKS_ROUTE = '/student-tasks' as Href;
const CHAT_ROUTE = '/chat' as Href;
const QNA_ROUTE = '/qna' as Href;
const VOCAB_ROUTE = '/vocab' as Href;
const FEEDBACK_ROUTE = '/feedback' as Href;
const SUGGESTIONS_ROUTE = '/suggestions' as Href;
const SURVEY_ROUTE = '/survey' as Href;
const PROGRAMS_ROUTE = '/programs' as Href;
const NOTIFICATIONS_ROUTE = '/notifications' as Href;
const MORE_ROUTE = '/more' as Href;

export default function StudentHomeScreen() {
  const { session } = useSession();
  const { data, error, isLoading, isRefreshing, refresh, retry } =
    useMobileQuery<StudentOverviewResponse>('/api/mobile/v1/student/overview');

  return (
    <AppScreen
      eyebrow="안녕하세요"
      eyebrowMuted
      onRefresh={() => void refresh()}
      refreshing={isRefreshing}
      right={
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(NOTIFICATIONS_ROUTE)}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
            <Bell color={colors.textAlternative} size={20} strokeWidth={2} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(MORE_ROUTE)}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
            <UserRound color={colors.textAlternative} size={20} strokeWidth={2} />
          </Pressable>
        </View>
      }
      title={`${session?.displayName ?? '학생'}님`}>
      {isLoading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void retry()} /> : null}
      {data ? <Content data={data} /> : null}
    </AppScreen>
  );
}

function Content({ data }: { data: StudentOverviewResponse }) {
  const { stats, nextTask, nextSession } = data;
  const unread = stats.unreadFeedbacks + stats.unreadQuestions;

  const todos: { key: string; label: string; dot: string; badge: { tone: Tone; text: string } }[] = [];
  if (nextTask) {
    todos.push({
      key: 'task',
      label: nextTask.subject ? `${nextTask.subject} · ${nextTask.title}` : nextTask.title,
      dot: palette.redOrange50,
      badge: {
        tone: nextTask.status === 'NEEDS_REVISION' ? 'violet' : 'warning',
        text: formatDueDate(nextTask.dueDate),
      },
    });
  }
  if (stats.unreadFeedbacks > 0) {
    todos.push({
      key: 'feedback',
      label: '학습 피드백 확인',
      dot: palette.blue50,
      badge: { tone: 'blue', text: `${stats.unreadFeedbacks}건` },
    });
  }
  if (stats.unreadQuestions > 0) {
    todos.push({
      key: 'answer',
      label: '질문 새 답변',
      dot: palette.green50,
      badge: { tone: 'positive', text: `${stats.unreadQuestions}건` },
    });
  }

  return (
    <>
      <Banner icon={LockKeyhole} text="매직링크로 로그인 없이 이용 중" right="안전" tone="primary" />

      <Card>
        <Text style={styles.cardLabel}>오늘 할 일</Text>
        {todos.length ? (
          todos.map((t, i) => (
            <View key={t.key}>
              {i > 0 ? <Divider style={styles.tightDivider} /> : <View style={{ height: 11 }} />}
              <View style={styles.todoRow}>
                <Dot color={t.dot} />
                <Text style={styles.todoLabel} numberOfLines={1}>
                  {t.label}
                </Text>
                <Badge tone={t.badge.tone}>{t.badge.text}</Badge>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.empty}>오늘 처리할 항목이 없어요. 잘하고 있어요 👏</Text>
        )}
      </Card>

      <SectionTitle>빠른 메뉴</SectionTitle>
      <HubGrid>
        <HubTile icon={BookMarked} label="과제" tone="warning" badge={stats.openTasks}
          onPress={() => router.push(TASKS_ROUTE)} />
        <HubTile icon={MessagesSquare} label="멘토 채팅" tone="blue" badge={stats.unreadQuestions}
          onPress={() => router.push(CHAT_ROUTE)} />
        <HubTile icon={CircleHelp} label="내 질문" tone="positive" badge={stats.openQuestions}
          onPress={() => router.push(QNA_ROUTE)} />
        <HubTile icon={MessageSquareText} label="피드백" tone="violet" badge={stats.unreadFeedbacks}
          onPress={() => router.push(FEEDBACK_ROUTE)} />
        <HubTile icon={BookA} label="단어 시험" tone="info"
          onPress={() => router.push(VOCAB_ROUTE)} />
        <HubTile icon={Lightbulb} label="건의사항" tone="amber"
          onPress={() => router.push(SUGGESTIONS_ROUTE)} />
        <HubTile icon={ClipboardList} label="초기 설문" tone="violet"
          onPress={() => router.push(SURVEY_ROUTE)} />
        <HubTile icon={LayoutGrid} label="프로그램" tone="primary"
          onPress={() => router.push(PROGRAMS_ROUTE)} />
        <HubTile icon={UserRound} label="내 정보" tone="neutral"
          onPress={() => router.push(MORE_ROUTE)} />
      </HubGrid>

      <SectionTitle>다가오는 멘토링</SectionTitle>
      {nextSession ? (
        <Card>
          <View style={styles.sessionRow}>
            <View style={styles.sessionIcon}>
              <CalendarClock color={palette.violet50} size={20} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sessionTitle}>{nextSession.hostName} 멘토링</Text>
              <Text style={styles.sessionCaption}>
                {formatKoreanDateTime(nextSession.scheduledAt)} · {nextSession.durationMinutes}분
              </Text>
            </View>
          </View>
          {nextSession.meetUrl ? (
            <View style={{ marginTop: spacing.md }}>
              <PrimaryButton onPress={() => void Linking.openURL(nextSession.meetUrl!)} size="md">
                <View style={styles.meetBtn}>
                  <Video color={colors.textOncolor} size={18} strokeWidth={2.2} />
                  <Text style={styles.meetBtnText}>Meet 입장</Text>
                </View>
              </PrimaryButton>
            </View>
          ) : null}
        </Card>
      ) : (
        <EmptyState title="예정된 멘토링이 없습니다" message="새 일정이 잡히면 여기에 표시돼요." />
      )}

      {unread > 0 ? (
        <Pressable onPress={() => router.push(TASKS_ROUTE)} style={({ pressed }) => pressed && styles.pressed}>
          <Banner
            icon={MessagesSquare}
            text={`확인하지 않은 소식 ${unread}건`}
            right="보기"
            tone="warning"
          />
        </Pressable>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: { ...type.label1, color: colors.textNormal },
  tightDivider: { marginVertical: 11 },
  todoRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  todoLabel: { ...type.body3, color: colors.textNormal, flex: 1 },
  empty: { ...type.body3, color: colors.textAssistive, marginTop: 11 },

  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sessionIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    backgroundColor: palette.violet5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionTitle: { ...type.label1, color: colors.textNormal },
  sessionCaption: { ...type.caption1, color: colors.textAssistive, marginTop: 2 },
  meetBtn: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  meetBtnText: { ...type.label1, color: colors.textOncolor, fontWeight: '700' },

  pressed: { opacity: 0.72 },
});
