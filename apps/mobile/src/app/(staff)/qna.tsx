import { Image, MessageSquareReply } from 'lucide-react-native';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PrimaryButton,
  SectionTitle,
} from '@/components/mobile-ui';
import { colors, spacing } from '@/constants/theme';
import { formatRelativeTime } from '@/lib/format';
import { StaffQuestionsResponse, useMobileQuery } from '@/lib/mobile-api';

export default function StaffQnaScreen() {
  const { data, error, isLoading, isRefreshing, refresh, retry } =
    useMobileQuery<StaffQuestionsResponse>('/api/mobile/v1/staff/questions');

  return (
    <AppScreen
      onRefresh={() => void refresh()}
      refreshing={isRefreshing}
      subtitle="미답변 질문부터 우선 처리합니다."
      title="질의응답">
      {data ? (
        <View style={styles.summary}>
          <Text style={styles.summaryValue}>{data.summary.open}</Text>
          <View style={styles.summaryText}>
            <Text style={styles.summaryTitle}>답변 대기</Text>
            <Text style={styles.summaryCaption}>24시간 경과 {data.summary.overdue}건</Text>
          </View>
          <MessageSquareReply color={colors.blue} size={28} />
        </View>
      ) : null}

      <SectionTitle>답변 대기</SectionTitle>
      {isLoading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void retry()} /> : null}
      {data?.items.length === 0 ? (
        <EmptyState message="현재 답변을 기다리는 질문이 없습니다." />
      ) : null}
      <View style={styles.list}>
        {data?.items.map((question) => (
          <Card key={question.id} style={styles.question}>
            <View style={styles.questionTop}>
              <View style={styles.badges}>
                <Badge tone="blue">{question.subject ?? '과목 미지정'}</Badge>
                <Badge tone="red">미답변</Badge>
              </View>
              <Text style={styles.age}>{formatRelativeTime(question.lastMessageAt)}</Text>
            </View>
            <Text style={styles.title}>{question.title}</Text>
            {question.lastMessage ? (
              <Text numberOfLines={2} style={styles.preview}>
                {question.lastMessage}
              </Text>
            ) : null}
            <View style={styles.meta}>
              <Text style={styles.name}>
                {question.studentName} · {question.grade}
              </Text>
              {question.attachmentCount > 0 ? (
                <View style={styles.attachment}>
                  <Image color={colors.muted} size={14} />
                  <Text style={styles.attachmentText}>
                    사진 {question.attachmentCount}장
                  </Text>
                </View>
              ) : null}
            </View>
            <PrimaryButton
              onPress={() =>
                Alert.alert('답변 작성', '질문 상세와 답변 저장은 다음 업데이트에서 연결됩니다.')
              }
              variant="secondary">
              답변 작성
            </PrimaryButton>
          </Card>
        ))}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  summary: {
    alignItems: 'center',
    backgroundColor: colors.blueSoft,
    borderRadius: 8,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  summaryText: {
    flex: 1,
  },
  summaryValue: {
    color: colors.blue,
    fontSize: 36,
    fontWeight: '900',
  },
  summaryTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  summaryCaption: {
    color: colors.red,
    fontSize: 12,
    marginTop: 3,
  },
  list: {
    gap: spacing.md,
  },
  question: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  questionTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  badges: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  age: {
    color: colors.muted,
    fontSize: 11,
  },
  title: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  preview: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  meta: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  name: {
    color: colors.muted,
    fontSize: 12,
  },
  attachment: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  attachmentText: {
    color: colors.muted,
    fontSize: 11,
  },
});
