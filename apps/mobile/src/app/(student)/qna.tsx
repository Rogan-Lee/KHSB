import { Camera, CircleCheckBig, Clock3, Plus } from 'lucide-react-native';
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
import { StudentQuestionsResponse, useMobileQuery } from '@/lib/mobile-api';

const STATUS_LABELS = {
  OPEN: '답변 대기',
  ANSWERED: '답변 완료',
  RESOLVED: '해결됨',
  ARCHIVED: '보관됨',
} as const;

export default function StudentQnaScreen() {
  const { data, error, isLoading, isRefreshing, refresh, retry } =
    useMobileQuery<StudentQuestionsResponse>('/api/mobile/v1/student/questions');

  return (
    <AppScreen
      onRefresh={() => void refresh()}
      refreshing={isRefreshing}
      subtitle="담당 멘토와 주고받은 질문을 확인하세요."
      title="질의응답">
      <PrimaryButton
        onPress={() =>
          Alert.alert('새 질문 작성', '질문 작성과 사진 첨부는 다음 업데이트에서 연결됩니다.')
        }>
        새 질문 작성
      </PrimaryButton>

      <SectionTitle>내 질문</SectionTitle>
      {isLoading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void retry()} /> : null}
      {data?.questions.length === 0 ? (
        <EmptyState message="등록한 질문이 없습니다." title="질문 내역이 없습니다" />
      ) : null}
      <View style={styles.list}>
        {data?.questions.map((question) => {
          const answered = question.status !== 'OPEN';
          return (
            <Card key={question.id} style={styles.question}>
              <View style={styles.questionTop}>
                <Badge tone={answered ? 'primary' : 'amber'}>
                  {question.hasUnreadAnswer ? '새 답변' : STATUS_LABELS[question.status]}
                </Badge>
                <Text style={styles.time}>{formatRelativeTime(question.lastMessageAt)}</Text>
              </View>
              <Text style={styles.subject}>{question.subject ?? '과목 미지정'}</Text>
              <Text style={styles.title}>{question.title}</Text>
              {question.lastMessage ? (
                <Text numberOfLines={2} style={styles.preview}>
                  {question.lastMessage}
                </Text>
              ) : null}
              <View style={styles.meta}>
                {answered ? (
                  <CircleCheckBig color={colors.primary} size={15} />
                ) : (
                  <Clock3 color={colors.amber} size={15} />
                )}
                <Text style={styles.metaText}>
                  {question.hasAttachments
                    ? '사진 첨부 · '
                    : ''}
                  {question.lastSenderType === 'STAFF'
                    ? '멘토가 답변했습니다.'
                    : '답변을 기다리고 있습니다.'}
                </Text>
              </View>
            </Card>
          );
        })}
      </View>

      <Card style={styles.photoHint}>
        <Camera color={colors.blue} size={22} />
        <Text style={styles.photoText}>문제 사진과 질문 내용을 함께 등록할 수 있습니다.</Text>
        <Plus color={colors.muted} size={18} />
      </Card>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
  },
  question: {
    gap: spacing.sm,
    padding: spacing.lg,
  },
  questionTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  time: {
    color: colors.muted,
    fontSize: 11,
  },
  subject: {
    color: colors.blue,
    fontSize: 12,
    fontWeight: '800',
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
    gap: spacing.xs,
  },
  metaText: {
    color: colors.muted,
    flex: 1,
    fontSize: 12,
  },
  photoHint: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  photoText: {
    color: colors.muted,
    flex: 1,
    fontSize: 12,
  },
});
