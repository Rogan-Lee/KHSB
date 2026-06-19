import { CircleHelp, ClipboardCheck, Clock3, ScanLine, UsersRound } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { ActionRow, Badge, Card, SectionTitle, StatCard } from '@/components/mobile-ui';
import { colors, spacing } from '@/constants/theme';
import { useSession } from '@/lib/session';

export default function StaffHomeScreen() {
  const { session } = useSession();

  return (
    <AppScreen
      eyebrow="KHSB 운영 현황"
      subtitle="오늘 처리할 업무를 확인하세요."
      title={`${session?.displayName ?? '관리자'}님`}>
      <View style={styles.stats}>
        <StatCard caption="현재 입실" tone="primary" value="42" />
        <StatCard caption="미답변 질문" tone="red" value="7" />
        <StatCard caption="오늘 멘토링" tone="violet" value="5" />
      </View>

      <SectionTitle>빠른 업무</SectionTitle>
      <View style={styles.quickGrid}>
        <QuickAction icon={ScanLine} label="순찰 QR" tone="primary" />
        <QuickAction icon={Clock3} label="입퇴실" tone="blue" />
        <QuickAction icon={UsersRound} label="멘토링" tone="violet" />
        <QuickAction icon={CircleHelp} label="질문 답변" tone="amber" />
      </View>

      <SectionTitle action={<Badge tone="red">3건</Badge>}>우선 처리</SectionTitle>
      <Card>
        <ActionRow
          caption="입실 예정 시각에서 30분 지남"
          icon={Clock3}
          title="지각 확인 필요 2명"
          tone="red"
        />
        <View style={styles.divider} />
        <ActionRow
          caption="오늘 20:00까지 작성"
          icon={ClipboardCheck}
          title="학습 보고서 승인 1건"
          tone="amber"
        />
      </Card>
    </AppScreen>
  );
}

type QuickActionProps = {
  icon: typeof ScanLine;
  label: string;
  tone: 'primary' | 'blue' | 'amber' | 'violet';
};

const quickTones = {
  primary: { background: colors.primarySoft, foreground: colors.primary },
  blue: { background: colors.blueSoft, foreground: colors.blue },
  amber: { background: colors.amberSoft, foreground: colors.amber },
  violet: { background: colors.violetSoft, foreground: colors.violet },
};

function QuickAction({ icon: Icon, label, tone }: QuickActionProps) {
  return (
    <View style={[styles.quickAction, { backgroundColor: quickTones[tone].background }]}>
      <Icon color={quickTones[tone].foreground} size={23} />
      <Text style={styles.quickLabel}>{label}</Text>
    </View>
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
    minHeight: 82,
    justifyContent: 'center',
  },
  quickLabel: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  divider: {
    backgroundColor: colors.line,
    height: StyleSheet.hairlineWidth,
    marginLeft: 64,
  },
});
