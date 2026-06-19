import { CalendarCheck, Video } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { Badge, Card, PrimaryButton, SectionTitle } from '@/components/mobile-ui';
import { colors, spacing } from '@/constants/theme';

const sessions = [
  { mode: '온라인', name: '김학생', status: '예정', time: '19:30' },
  { mode: '대면', name: '박서준', status: '예정', time: '20:10' },
  { mode: '온라인', name: '이수빈', status: '기록 필요', time: '어제 21:00' },
];

export default function MentoringScreen() {
  return (
    <AppScreen subtitle="일정 확인과 상담 기록 작성을 처리합니다." title="멘토링">
      <View style={styles.summary}>
        <View>
          <Text style={styles.summaryLabel}>오늘 일정</Text>
          <Text style={styles.summaryValue}>5건</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryText}>
          <Text style={styles.summaryLabel}>기록 미작성</Text>
          <Text style={[styles.summaryValue, styles.warning]}>2건</Text>
        </View>
        <CalendarCheck color={colors.violet} size={28} />
      </View>

      <SectionTitle>예정 및 미완료</SectionTitle>
      <View style={styles.list}>
        {sessions.map((session) => (
          <Card key={`${session.name}-${session.time}`} style={styles.session}>
            <View style={styles.sessionTop}>
              <View style={styles.icon}>
                <Video color={colors.violet} size={21} />
              </View>
              <View style={styles.sessionText}>
                <Text style={styles.name}>{session.name}</Text>
                <Text style={styles.meta}>
                  {session.time} · {session.mode}
                </Text>
              </View>
              <Badge tone={session.status === '기록 필요' ? 'red' : 'violet'}>
                {session.status}
              </Badge>
            </View>
            <PrimaryButton variant="secondary">
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
});
