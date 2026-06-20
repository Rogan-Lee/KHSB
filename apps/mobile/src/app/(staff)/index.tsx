import { useRouter } from 'expo-router';
import { CircleHelp, Clock3, ScanLine, UsersRound } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import {
  ActionRow,
  Badge,
  Card,
  ErrorState,
  LoadingState,
  SectionTitle,
  StatCard,
} from '@/components/mobile-ui';
import { colors, spacing } from '@/constants/theme';
import { formatKoreanDay } from '@/lib/format';
import { StaffOverviewResponse, useMobileQuery } from '@/lib/mobile-api';
import { useSession } from '@/lib/session';

export default function StaffHomeScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { data, error, isLoading, isRefreshing, refresh, retry } =
    useMobileQuery<StaffOverviewResponse>('/api/mobile/v1/staff/overview');

  return (
    <AppScreen
      eyebrow={`KHSB · ${formatKoreanDay()}`}
      onRefresh={() => void refresh()}
      refreshing={isRefreshing}
      subtitle="오늘 처리할 업무를 확인하세요."
      title={`${session?.displayName ?? '관리자'}님`}>
      {isLoading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void retry()} /> : null}
      {data ? (
        <>
          <View style={styles.stats}>
            <StatCard
              caption="현재 입실"
              tone="primary"
              value={`${data.stats.currentAttendance}`}
            />
            <StatCard
              caption="미답변 질문"
              tone="red"
              value={`${data.stats.openQuestions}`}
            />
            <StatCard
              caption="오늘 멘토링"
              tone="violet"
              value={`${data.stats.todayMentoring}`}
            />
          </View>

          <SectionTitle>빠른 업무</SectionTitle>
          <View style={styles.quickGrid}>
            <QuickAction icon={ScanLine} label="순찰 QR" tone="primary" />
            <QuickAction
              icon={Clock3}
              label="입퇴실"
              onPress={() => router.push('/(staff)/attendance')}
              tone="blue"
            />
            <QuickAction
              icon={UsersRound}
              label="멘토링"
              onPress={() => router.push('/(staff)/mentoring')}
              tone="violet"
            />
            <QuickAction
              icon={CircleHelp}
              label="질문 답변"
              onPress={() => router.push('/(staff)/qna')}
              tone="amber"
            />
          </View>

          <SectionTitle
            action={
              data.priorities.lateStudents + data.priorities.openQuestions > 0 ? (
                <Badge tone="red">
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
              tone={data.priorities.lateStudents > 0 ? 'red' : 'primary'}
            />
            <View style={styles.divider} />
            <ActionRow
              caption="등록 순서대로 확인하세요."
              icon={CircleHelp}
              onPress={() => router.push('/(staff)/qna')}
              title={`미답변 질문 ${data.priorities.openQuestions}건`}
              tone={data.priorities.openQuestions > 0 ? 'amber' : 'primary'}
            />
          </Card>
        </>
      ) : null}
    </AppScreen>
  );
}

type QuickActionProps = {
  icon: typeof ScanLine;
  label: string;
  onPress?: () => void;
  tone: 'primary' | 'blue' | 'amber' | 'violet';
};

const quickTones = {
  primary: { background: colors.primarySoft, foreground: colors.primary },
  blue: { background: colors.blueSoft, foreground: colors.blue },
  amber: { background: colors.amberSoft, foreground: colors.amber },
  violet: { background: colors.violetSoft, foreground: colors.violet },
};

function QuickAction({ icon: Icon, label, onPress, tone }: QuickActionProps) {
  const content = (
    <>
      <Icon color={quickTones[tone].foreground} size={23} />
      <Text style={styles.quickLabel}>{label}</Text>
    </>
  );
  const style = [
    styles.quickAction,
    { backgroundColor: quickTones[tone].background },
  ];

  if (!onPress) {
    return <View style={style}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        ...style,
        pressed && styles.pressed,
      ]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stats: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickAction: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 82,
  },
  quickLabel: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.72,
  },
  divider: {
    backgroundColor: colors.line,
    height: StyleSheet.hairlineWidth,
    marginLeft: 64,
  },
});
