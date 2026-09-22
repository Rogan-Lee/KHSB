import { router } from 'expo-router';
import { LogOut } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import {
  Badge,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  ListRow,
  LoadingState,
  Segmented,
} from '@/components/mobile-ui';
import { colors, spacing, Tone, type } from '@/constants/theme';
import { formatKstTime, formatShortDateTime } from '@/lib/format';
import { ParentOverviewResponse, useMobileQuery } from '@/lib/mobile-api';
import { useSession } from '@/lib/session';

const STATUS_TONE: Record<string, Tone> = {
  입실: 'positive',
  퇴실: 'neutral',
  결석: 'negative',
  미입실: 'warning',
};

export default function ParentHomeScreen() {
  const { session, signOut } = useSession();
  const { data, error, isLoading, isRefreshing, refresh, retry } =
    useMobileQuery<ParentOverviewResponse>('/api/mobile/v1/parent/overview');

  const kids = data?.children ?? session?.children ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const childId = selectedId ?? kids[0]?.id;
  const child = data?.children.find((c) => c.id === childId) ?? null;

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
            onPress={() => void signOut()}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
            <LogOut color={colors.textAlternative} size={20} strokeWidth={2} />
          </Pressable>
        </View>
      }
      title={`${session?.displayName ?? '학부모'}님`}>
      {isLoading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void retry()} /> : null}
      {data ? (
        kids.length === 0 ? (
          <EmptyState title="연결된 자녀가 없습니다" message="관리자에게 문의하세요." />
        ) : (
          <>
            {kids.length > 1 ? (
              <Segmented
                options={kids.map((k) => ({ label: k.name, value: k.id }))}
                value={childId ?? ''}
                onChange={setSelectedId}
              />
            ) : null}

            {child ? (
              <Card>
                <View style={styles.childHead}>
                  <Text style={styles.childName}>{child.name}</Text>
                  <Text style={styles.childMeta}>
                    {child.grade}
                    {child.seat ? ` · ${child.seat}번 좌석` : ''}
                  </Text>
                </View>
                <Divider />
                <ListRow
                  title="오늘 출결"
                  caption={
                    child.todayAttendance.checkIn
                      ? `입실 ${formatKstTime(child.todayAttendance.checkIn)}${
                          child.todayAttendance.checkOut
                            ? ` · 퇴실 ${formatKstTime(child.todayAttendance.checkOut)}`
                            : ''
                        }`
                      : undefined
                  }
                  right={
                    <Badge tone={STATUS_TONE[child.todayAttendance.status] ?? 'neutral'}>
                      {child.todayAttendance.status}
                    </Badge>
                  }
                />
                <Divider />
                <ListRow
                  title="이번 달 상벌점"
                  right={`상점 ${child.monthPoints.merit} · 벌점 ${child.monthPoints.demerit}`}
                />
                <Divider />
                <ListRow
                  title="최근 리포트"
                  right={
                    child.latestReportAt
                      ? formatShortDateTime(child.latestReportAt)
                      : '없음'
                  }
                  onPress={() => router.push('/(parent)/reports')}
                />
              </Card>
            ) : null}
          </>
        )
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconBtn: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  pressed: {
    opacity: 0.7,
  },
  childHead: {
    gap: 2,
    paddingBottom: spacing.sm,
  },
  childName: { ...type.heading2, color: colors.textNormal },
  childMeta: { ...type.caption1, color: colors.textAlternative },
});
