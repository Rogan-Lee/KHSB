import { useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  color,
  CONTENT_MAX_WIDTH,
  ErrorState,
  Screen,
  SegmentTabs,
  space,
  TABLET_WIDE,
  useResponsive,
} from '@/design';
import { MySchedulePanel } from '@/features/student-plan/my-schedule-panel';
import { ScheduleSubmitPanel } from '@/features/student-plan/schedule-submit-panel';
import { MyScheduleSkeleton, ScheduleSubmitSkeleton } from '@/features/student-plan/skeletons';
import { STUDENT_SCHEDULE_PATH, type StudentScheduleResponse } from '@/lib/api/student-plan';
import { useMobileQuery } from '@/lib/mobile-api';

// 웹 학생 포털 /s/[token]/schedule 과 같은 구성: 헤더 아래 고정 탭 "내 일정 / 등원 스케줄".
// 두 탭 모두 마운트한 채 보이는 쪽만 그린다 → 작성 중인 스케줄이 탭을 오가도 유지된다(웹 TabsContent 와 동일).
// 이동: router.push('/(student)/schedule') · 등원 스케줄 탭으로 바로: '/(student)/schedule?tab=submit'

type TabKey = 'my' | 'submit';

const TABS: { value: TabKey; label: string }[] = [
  { value: 'my', label: '내 일정' },
  { value: 'submit', label: '등원 스케줄' },
];

export default function StudentScheduleScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<TabKey>(params.tab === 'submit' ? 'submit' : 'my');
  const { isTablet } = useResponsive();
  const insets = useSafeAreaInsets();
  const { data, error, isRefreshing, refresh, retry } =
    useMobileQuery<StudentScheduleResponse>(STUDENT_SCHEDULE_PATH);

  const width = isTablet ? TABLET_WIDE : CONTENT_MAX_WIDTH;
  const widthStyle = { width: '100%' as const, maxWidth: width, alignSelf: 'center' as const };

  const body = (key: TabKey): ReactNode => {
    if (!data) {
      if (error) return <ErrorState message={error} onRetry={() => void retry()} />;
      return key === 'my' ? <MyScheduleSkeleton /> : <ScheduleSubmitSkeleton />;
    }
    return key === 'my' ? (
      <MySchedulePanel data={data} isTablet={isTablet} />
    ) : (
      <ScheduleSubmitPanel data={data} isTablet={isTablet} onSubmitted={() => void refresh()} />
    );
  };

  return (
    <Screen kind="push" title="내 일정" backFallback="/(student)/(tabs)/menu" scroll={false} maxWidth={width}>
      <View style={[s.tabs, widthStyle]}>
        <SegmentTabs tabs={TABS} value={tab} onChange={setTab} />
      </View>
      {TABS.map(({ value: key }) => (
        <ScrollView
          key={key}
          style={[s.scroll, tab !== key && s.hidden]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => void refresh()}
              tintColor={color.fg.neutralSubtle}
              colors={[color.fg.brand]}
            />
          }
          contentContainerStyle={{
            paddingHorizontal: space.x4,
            paddingTop: space.x3,
            paddingBottom: Math.max(insets.bottom, space.x4) + space.x6,
          }}>
          <View style={widthStyle}>{body(key)}</View>
        </ScrollView>
      ))}
    </Screen>
  );
}

const s = StyleSheet.create({
  tabs: { backgroundColor: color.bg.layerBasement },
  scroll: { flex: 1 },
  hidden: { display: 'none' },
});
