import { CalendarCheck, UserRound } from 'lucide-react-native';
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
import { formatKoreanDateTime } from '@/lib/format';
import { StaffMentoringResponse, useMobileQuery } from '@/lib/mobile-api';

export default function MentoringScreen() {
  const { data, error, isLoading, isRefreshing, refresh, retry } =
    useMobileQuery<StaffMentoringResponse>('/api/mobile/v1/staff/mentoring');

  return (
    <AppScreen
      onRefresh={() => void refresh()}
      refreshing={isRefreshing}
      subtitle="일정 확인과 상담 기록 작성을 처리합니다."
      title="멘토링">
      {data ? (
        <View style={styles.summary}>
          <View>
            <Text style={styles.summaryLabel}>오늘 일정</Text>
            <Text style={styles.summaryValue}>{data.summary.today}건</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryText}>
            <Text style={styles.summaryLabel}>기록 미작성</Text>
            <Text style={[styles.summaryValue, styles.warning]}>
              {data.summary.needsRecord}건
            </Text>
          </View>
          <CalendarCheck color={colors.violet} size={28} />
        </View>
      ) : null}

      <SectionTitle>예정 및 미완료</SectionTitle>
      {isLoading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void retry()} /> : null}
      {data?.items.length === 0 ? (
        <EmptyState message="예정되었거나 기록이 필요한 멘토링이 없습니다." />
      ) : null}
      <View style={styles.list}>
        {data?.items.map((session) => (
          <Card key={session.id} style={styles.session}>
            <View style={styles.sessionTop}>
              <View style={styles.icon}>
                <UserRound color={colors.violet} size={21} />
              </View>
              <View style={styles.sessionText}>
                <Text style={styles.name}>{session.studentName}</Text>
                <Text style={styles.meta}>
                  {formatKoreanDateTime(session.scheduledAt)} · {session.mode}
                </Text>
                <Text style={styles.mentor}>
                  {session.grade} · 담당 {session.mentorName}
                </Text>
              </View>
              <Badge tone={session.status === '기록 필요' ? 'red' : 'violet'}>
                {session.status}
              </Badge>
            </View>
            <PrimaryButton
              onPress={() =>
                Alert.alert(
                  session.status === '기록 필요' ? '상담 기록 작성' : '학생 정보',
                  '상세 조회와 기록 저장은 다음 업데이트에서 연결됩니다.',
                )
              }
              variant="secondary">
              {session.status === '기록 필요' ? '상담 기록 작성' : '학생 정보 보기'}
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
    backgroundColor: colors.violetSoft,
    borderRadius: 8,
    flexDirection: 'row',
    gap: spacing.lg,
    padding: spacing.lg,
  },
  summaryText: {
    flex: 1,
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  summaryValue: {
    color: colors.violet,
    fontSize: 23,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  warning: {
    color: colors.red,
  },
  summaryDivider: {
    backgroundColor: '#D9D0F2',
    height: 42,
    width: 1,
  },
  list: {
    gap: spacing.md,
  },
  session: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  sessionTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  icon: {
    alignItems: 'center',
    backgroundColor: colors.violetSoft,
    borderRadius: 8,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  sessionText: {
    flex: 1,
    gap: 3,
  },
  name: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  meta: {
    color: colors.muted,
    fontSize: 12,
  },
  mentor: {
    color: colors.muted,
    fontSize: 11,
  },
});
