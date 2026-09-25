import {
  Bell,
  CalendarCheck,
  CalendarClock,
  FileText,
  GraduationCap,
  Megaphone,
  MessageCircle,
  TrendingUp,
  UserPlus,
  Users,
  UtensilsCrossed,
} from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  EmptyState,
  ErrorState,
  HeaderIconButton,
  Screen,
  Section,
  ShortcutGrid,
  Skeleton,
  Stack,
  color,
  radius,
  space,
} from '@/design';
import { useChildQuery } from '@/features/parent/child-query';
import {
  LatestReportCard,
  MonthPointsCard,
  NoticeCard,
  TodayTimelineCard,
  WeekStudyCard,
} from '@/features/parent/today-cards';
import { kstToday } from '@/features/parent/today-format';
import { TodayHero } from '@/features/parent/today-hero';
import {
  parentApi,
  type ParentStudyStatsResponse,
  type ParentTodayResponse,
} from '@/lib/api/parent-today';
import { useParentBadges } from '@/lib/badges';
import { useMobileQuery, type ParentOverviewResponse } from '@/lib/mobile-api';
import { ChildSwitcher, useParentChild } from '@/lib/parent-child';
import { useResponsive } from '@/lib/responsive';

/** 학부모 홈(오늘) — 지금 상태 · 오늘 타임라인 · 이번 주 공부 시간 · 상벌점 · 리포트 · 공지 */
export default function ParentHomeScreen() {
  const { selected } = useParentChild();
  const { isTablet } = useResponsive();
  const childId = selected?.id ?? null;

  const today = useChildQuery<ParentTodayResponse>(
    childId ? parentApi.today(childId) : null,
    childId,
    { pollMs: 60_000 },
  );
  const week = useChildQuery<ParentStudyStatsResponse>(
    childId ? parentApi.studyStats(childId, 'week') : null,
    childId,
  );
  const overview = useMobileQuery<ParentOverviewResponse>('/api/mobile/v1/parent/overview');
  const badges = useParentBadges();

  const right = (
    <>
      <ChildSwitcher />
      <HeaderIconButton icon={Bell} href="/notifications" label="알림 설정" />
    </>
  );

  if (!selected) {
    return (
      <Screen kind="home" right={right}>
        <EmptyState
          icon={Users}
          title="연결된 자녀가 없어요"
          description="독서실에서 받은 학부모 초대 코드로 자녀를 연결해 주세요."
          action={
            <Button icon={UserPlus} href="/(parent)/link-child" size="md">
              자녀 연결하기
            </Button>
          }
        />
      </Screen>
    );
  }

  const onRefresh = () => {
    void Promise.all([today.refresh(), week.refresh(), overview.refresh()]);
  };
  const t = today.data;
  const overviewChild = overview.data?.children.find((c) => c.id === childId) ?? null;
  const month = Number((t?.date ?? kstToday()).slice(5, 7));

  let body;
  if (!t) {
    body = today.error ? <ErrorState message={today.error} onRetry={today.retry} /> : <HomeSkeleton />;
  } else {
    // 바로가기 — 학생·직원 홈과 같은 그리드 (새 리포트·승인 대기 스케줄은 점)
    const shortcuts = (
      <Section title="바로가기">
        <ShortcutGrid
          items={[
            { key: 'attendance', label: '출결', icon: CalendarCheck, tone: 'ok', href: '/(parent)/(tabs)/attendance' },
            { key: 'reports', label: '리포트', icon: FileText, tone: 'brand', href: '/(parent)/(tabs)/reports', dot: badges.reports > 0 },
            { key: 'growth', label: '성적·생활', icon: TrendingUp, tone: 'info', href: '/(parent)/(tabs)/growth' },
            { key: 'lunch', label: '도시락', icon: UtensilsCrossed, tone: 'warn', href: '/(parent)/lunch' },
            { key: 'schedule', label: '등원 스케줄', icon: CalendarClock, tone: 'violet', href: '/(parent)/schedule', dot: badges.menu > 0 },
            { key: 'exams', label: '모의고사', icon: GraduationCap, tone: 'info', href: '/(parent)/exams' },
            { key: 'inquiries', label: '원장님 문의', icon: MessageCircle, tone: 'brand', href: '/(parent)/inquiries' },
            { key: 'notices', label: '공지', icon: Megaphone, tone: 'gray', href: '/(parent)/notices' },
          ]}
        />
      </Section>
    );
    const main = (
      <>
        <TodayHero today={t} />
        {!isTablet && shortcuts}
        <TodayTimelineCard today={t} />
      </>
    );
    const side = (
      <>
        {isTablet && shortcuts}
        <WeekStudyCard stats={week.data} loading={week.isLoading} />
        <MonthPointsCard month={month} points={overviewChild?.monthPoints ?? null} />
        <LatestReportCard
          latestReportAt={overview.data ? (overviewChild?.latestAnyReportAt ?? overviewChild?.latestReportAt ?? null) : undefined}
          now={t.now}
        />
        {t.notice && <NoticeCard notice={t.notice} />}
      </>
    );
    body = isTablet ? (
      <View style={s.columns}>
        <Stack style={s.col}>{main}</Stack>
        <Stack style={s.col}>{side}</Stack>
      </View>
    ) : (
      <Stack>
        {main}
        {side}
      </Stack>
    );
  }

  return (
    <Screen
      kind="home"
      right={right}
      maxWidth={isTablet ? 960 : undefined}
      refreshing={today.isRefreshing || week.isRefreshing || overview.isRefreshing}
      onRefresh={onRefresh}>
      {body}
    </Screen>
  );
}

function HomeSkeleton() {
  return (
    <Stack>
      <View style={s.skelCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3 }}>
          <Skeleton style={{ width: 44, height: 44, borderRadius: 22 }} />
          <View style={{ gap: space.x1_5 }}>
            <Skeleton style={{ width: 88, height: 18 }} />
            <Skeleton style={{ width: 120, height: 14 }} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: space.x4 }}>
          <Skeleton style={{ width: 56, height: 56, borderRadius: 28 }} />
          <View style={{ flex: 1, gap: space.x2 }}>
            <Skeleton style={{ width: '85%', height: 26 }} />
            <Skeleton style={{ width: '60%', height: 18 }} />
          </View>
        </View>
        <Skeleton style={{ height: 76, borderRadius: radius.r4 }} />
      </View>
      <View style={s.skelCard}>
        <Skeleton style={{ width: 96, height: 22 }} />
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flexDirection: 'row', gap: space.x3, alignItems: 'center' }}>
            <Skeleton style={{ width: 44, height: 18 }} />
            <Skeleton style={{ width: 14, height: 14, borderRadius: 7 }} />
            <Skeleton style={{ flex: 1, height: 18 }} />
          </View>
        ))}
      </View>
      <View style={s.skelCard}>
        <Skeleton style={{ width: 140, height: 22 }} />
        <Skeleton style={{ height: 96, borderRadius: radius.r3 }} />
      </View>
    </Stack>
  );
}

const s = StyleSheet.create({
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: space.x3 },
  col: { flex: 1, minWidth: 0 },
  skelCard: {
    backgroundColor: color.bg.layerDefault,
    borderRadius: radius.r5,
    padding: space.x5,
    gap: space.x4,
  },
});
