import { useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  color,
  Columns,
  CONTENT_MAX_WIDTH,
  ErrorState,
  Screen,
  SegmentTabs,
  Skeleton,
  space,
  TABLET_WIDE,
  useResponsive,
} from '@/design';
import { kstToday, mondayOf, usePlanner } from '@/features/student-planner/planner';
import { DayPanel, WeekPanel, WeekStrip } from '@/features/student-planner/planner-ui';
import { StudyRecord } from '@/features/student-planner/study-record';

// 공부 플래너 — 하루(할 일) · 일주일(요일별 계획) · 기록(입퇴실 기준 공부 시간).
// 태블릿은 하루 | 일주일을 나란히 두고 탭은 플래너 · 기록 둘.
// 이동: router.push('/(student)/planner')

type TabKey = 'day' | 'week' | 'record';

const PHONE_TABS: { value: TabKey; label: string }[] = [
  { value: 'day', label: '하루' },
  { value: 'week', label: '일주일' },
  { value: 'record', label: '기록' },
];
const TABLET_TABS: { value: TabKey; label: string }[] = [
  { value: 'day', label: '플래너' },
  { value: 'record', label: '기록' },
];

export default function StudentPlannerScreen() {
  const { isTablet } = useResponsive();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabKey>('day');
  const [date, setDate] = useState(kstToday);
  const weekStart = mondayOf(date);
  const p = usePlanner(weekStart);

  const width = isTablet ? TABLET_WIDE : CONTENT_MAX_WIDTH;
  const widthStyle = { width: '100%' as const, maxWidth: width, alignSelf: 'center' as const };
  const activeTab = isTablet && tab === 'week' ? 'day' : tab;

  const openDay = (d: string) => {
    setDate(d);
    setTab('day');
  };

  let body: ReactNode;
  if (activeTab === 'record') {
    body = <StudyRecord />;
  } else if (!p.loaded) {
    body = p.error ? <ErrorState message={p.error} onRetry={() => void p.retry()} /> : <PlannerSkeleton />;
  } else {
    const strip = <WeekStrip p={p} weekStart={weekStart} selected={date} onSelect={setDate} />;
    body = isTablet ? (
      <Columns
        left={
          <>
            {strip}
            <DayPanel p={p} date={date} />
          </>
        }
        right={<WeekPanel p={p} weekStart={weekStart} onOpenDay={setDate} />}
      />
    ) : (
      <View style={{ gap: space.x3 }}>
        {strip}
        {activeTab === 'day' ? <DayPanel p={p} date={date} /> : <WeekPanel p={p} weekStart={weekStart} onOpenDay={openDay} />}
      </View>
    );
  }

  return (
    <Screen kind="push" title="공부 플래너" backFallback="/(student)/(tabs)" scroll={false} maxWidth={width}>
      <View style={[s.tabs, widthStyle]}>
        <SegmentTabs tabs={isTablet ? TABLET_TABS : PHONE_TABS} value={activeTab} onChange={setTab} />
      </View>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        refreshControl={
          activeTab === 'record' ? undefined : (
            <RefreshControl
              refreshing={p.isRefreshing}
              onRefresh={() => void p.refresh()}
              tintColor={color.fg.neutralSubtle}
              colors={[color.fg.brand]}
            />
          )
        }
        contentContainerStyle={{
          paddingHorizontal: space.x4,
          paddingTop: space.x3,
          paddingBottom: Math.max(insets.bottom, space.x4) + space.x6,
        }}>
        <View style={widthStyle}>{body}</View>
      </ScrollView>
    </Screen>
  );
}

function PlannerSkeleton() {
  return (
    <View style={{ gap: space.x3 }}>
      <Skeleton style={{ height: 120, borderRadius: 20 }} />
      <Skeleton style={{ height: 72, borderRadius: 20 }} />
      <Skeleton style={{ height: 240, borderRadius: 20 }} />
    </View>
  );
}

const s = StyleSheet.create({
  tabs: { backgroundColor: color.bg.layerBasement },
});
