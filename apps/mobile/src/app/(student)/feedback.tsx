import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { ChevronRight, MessageSquareText } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/mobile-ui';
import { colors, palette, radius, spacing, Tone, type } from '@/constants/theme';
import { formatRelativeTime } from '@/lib/format';
import { useMobileQuery } from '@/lib/mobile-api';
import type {
  StudentFeedbackItem,
  StudentFeedbackResponse,
} from '@/lib/mobile-api';

const TASKS_ROUTE = '/student-tasks' as Href;

function statusBadge(status: StudentFeedbackItem['status']): {
  tone: Tone;
  text: string;
} {
  switch (status) {
    case 'APPROVED':
      return { tone: 'positive', text: '승인' };
    case 'NEEDS_REVISION':
      return { tone: 'violet', text: '수정 요청' };
    default:
      return { tone: 'neutral', text: '코멘트' };
  }
}

export default function StudentFeedbackScreen() {
  const { data, error, isLoading, isRefreshing, refresh, retry } =
    useMobileQuery<StudentFeedbackResponse>('/api/mobile/v1/student/feedback');
  const items = data?.items ?? [];

  return (
    <AppScreen
      eyebrow="FEEDBACK"
      onRefresh={() => void refresh()}
      refreshing={isRefreshing}
      subtitle="컨설턴트·관리멘토가 남긴 답변"
      title="받은 피드백">
      {isLoading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void retry()} /> : null}

      {data && items.length === 0 ? (
        <EmptyState
          title="받은 피드백이 없어요"
          message="수행평가를 제출하면 컨설턴트가 검토 후 피드백을 남깁니다."
        />
      ) : null}

      <View style={styles.list}>
        {items.map((fb) => {
          const badge = statusBadge(fb.status);
          return (
            <Card key={fb.id}>
              <View style={styles.top}>
                <Avatar label={fb.authorName.slice(0, 1)} size={36} />
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.author}>{fb.authorName}</Text>
                    <Badge tone={badge.tone}>{badge.text}</Badge>
                    {fb.isNew ? <Badge tone="negative">NEW</Badge> : null}
                  </View>
                  <Text style={styles.time}>{formatRelativeTime(fb.createdAt)}</Text>
                </View>
              </View>

              <Text style={styles.content}>{fb.content}</Text>

              <View
                style={styles.taskRef}
                onTouchEnd={() => router.push(TASKS_ROUTE)}>
                <View style={styles.subjectChip}>
                  <Text style={styles.subjectText}>{fb.subject}</Text>
                </View>
                <Text style={styles.taskTitle} numberOfLines={1}>
                  {fb.taskTitle} · v{fb.version}
                </Text>
                <ChevronRight color={colors.textAssistive} size={16} />
              </View>
            </Card>
          );
        })}
      </View>

      {data && items.length > 0 ? (
        <View style={styles.footer}>
          <MessageSquareText color={colors.textAssistive} size={14} />
          <Text style={styles.footerText}>총 {data.summary.total}건의 피드백</Text>
        </View>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  top: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  nameRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  author: { ...type.label1, color: colors.textNormal },
  time: { ...type.caption2, color: colors.textAssistive, marginTop: 2 },
  content: {
    ...type.body3,
    color: colors.textNormal,
    lineHeight: 21,
    marginTop: spacing.sm,
  },
  taskRef: {
    alignItems: 'center',
    borderTopColor: colors.lineAlt,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
  },
  subjectChip: {
    backgroundColor: palette.blue5,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  subjectText: { ...type.caption2, color: palette.blue50, fontWeight: '700' },
  taskTitle: { ...type.caption1, color: colors.textAssistive, flex: 1 },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  footerText: { ...type.caption2, color: colors.textAssistive },
});
