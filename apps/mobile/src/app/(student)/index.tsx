import { BookOpenCheck, CalendarClock, MessageSquareText } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { ActionRow, Badge, Card, SectionTitle, StatCard } from '@/components/mobile-ui';
import { colors, spacing } from '@/constants/theme';
import { useSession } from '@/lib/session';

export default function StudentHomeScreen() {
  const { session } = useSession();

  return (
    <AppScreen
      eyebrow="6월 19일 금요일"
      subtitle="오늘 해야 할 학습과 상담 일정을 확인하세요."
      title={`${session?.displayName ?? '학생'}님`}>
      <View style={styles.stats}>
        <StatCard caption="완료한 과제" tone="primary" value="3/5" />
        <StatCard caption="이번 주 학습" tone="blue" value="18h" />
        <StatCard caption="미확인 피드백" tone="amber" value="2" />
      </View>

      <SectionTitle>오늘의 학습</SectionTitle>
      <Card>
        <View style={styles.task}>
          <View style={styles.taskTop}>
            <Badge tone="red">오늘 마감</Badge>
            <Text style={styles.taskTime}>23:00까지</Text>
          </View>
          <Text style={styles.taskTitle}>수학 오답노트 3단원</Text>
          <Text style={styles.taskCaption}>사진 1장 이상과 풀이 과정을 제출하세요.</Text>
          <View style={styles.progressTrack}>
            <View style={styles.progressValue} />
          </View>
        </View>
      </Card>

      <SectionTitle>다가오는 일정</SectionTitle>
      <Card>
        <ActionRow
          caption="오늘 20:30 · Google Meet"
          icon={CalendarClock}
          title="주간 온라인 멘토링"
          tone="violet"
        />
        <View style={styles.divider} />
        <ActionRow
          caption="새 답변 1개"
          icon={MessageSquareText}
          title="수학 질문 답변 확인"
          tone="blue"
        />
        <View style={styles.divider} />
        <ActionRow
          caption="담당 멘토가 작성한 학습 코멘트"
          icon={BookOpenCheck}
          title="이번 주 피드백"
          tone="primary"
        />
      </Card>
    </AppScreen>
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
  taskTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  taskCaption: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
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
    width: '60%',
  },
  divider: {
    backgroundColor: colors.line,
    height: StyleSheet.hairlineWidth,
    marginLeft: 64,
  },
});
