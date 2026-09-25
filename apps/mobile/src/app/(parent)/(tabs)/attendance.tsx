import { CalendarDays } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  EmptyState,
  ErrorState,
  Screen,
  Section,
  Skeleton,
  Stack,
  radius,
  space,
} from '@/design';
import {
  CalendarLegend,
  MonthCalendar,
  MonthSummary,
  PeriodStepper,
} from '@/features/parent/attendance-calendar';
import { AttendanceDaySheet } from '@/features/parent/attendance-day-sheet';
import { StudyTimeCard } from '@/features/parent/attendance-study-card';
import { useChildQuery } from '@/features/parent/child-query';
import {
  addDays,
  kstToday,
  lastDayOfMonth,
  monthTitle,
  rangeTitle,
  shiftMonth,
} from '@/features/parent/today-format';
import {
  parentApi,
  type ParentAttendanceMonthResponse,
  type ParentStudyStatsResponse,
  type StudyRange,
} from '@/lib/api/parent-today';
import { ChildSwitcher, useParentChild } from '@/lib/parent-child';
import { useResponsive } from '@/lib/responsive';

/** 월요일 */
function mondayOf(key: string) {
  const w = new Date(`${key}T00:00:00Z`).getUTCDay();
  return addDays(key, -((w + 6) % 7));
}

/** 학부모 출결 — 월 달력(날짜 상세 시트) + 공부 시간 차트(주간·월간) */
export default function ParentAttendanceScreen() {
  const { selected } = useParentChild();
  const { isTablet } = useResponsive();
  const childId = selected?.id ?? null;

  const today = kstToday();
  const thisMonth = today.slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [range, setRange] = useState<StudyRange>('week');
  const [weekAnchor, setWeekAnchor] = useState(today);
  const [sheetDate, setSheetDate] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const attendance = useChildQuery<ParentAttendanceMonthResponse>(
    childId ? parentApi.attendance(childId, month) : null,
    childId,
  );
  const statsDate = range === 'week' ? weekAnchor : month === thisMonth ? today : `${month}-01`;
  const stats = useChildQuery<ParentStudyStatsResponse>(
    childId ? parentApi.studyStats(childId, range, statsDate) : null,
    childId ? `${childId}:${range}` : null,
  );

  const firstMonth = attendance.data?.firstMonth ?? null;
  const canPrevMonth = !firstMonth || month > firstMonth;
  const canNextMonth = month < thisMonth;

  const goMonth = (delta: number) => {
    const next = shiftMonth(month, delta);
    if (next > thisMonth || (firstMonth && next < firstMonth)) return;
    setMonth(next);
    setWeekAnchor(next === thisMonth ? today : lastDayOfMonth(next));
  };

  const weekStart = mondayOf(weekAnchor);
  const weekEnd = addDays(weekStart, 6);
  const isThisWeek = weekStart <= today && today <= weekEnd;
  const firstWeekStart = firstMonth ? mondayOf(`${firstMonth}-01`) : null;
  const goWeek = (delta: number) => {
    const next = addDays(weekAnchor, delta * 7);
    const nextStart = mondayOf(next);
    if (nextStart > today || (firstWeekStart && nextStart < firstWeekStart)) return;
    setWeekAnchor(next > today ? today : next);
    // 달력도 그 주가 걸친 달로 (주의 마지막 날 기준, 미래면 이번 달)
    const m = (addDays(nextStart, 6) > today ? today : addDays(nextStart, 6)).slice(0, 7);
    if (m !== month) setMonth(m);
  };

  const stepper =
    range === 'week'
      ? {
          label: isThisWeek ? `이번 주 · ${rangeTitle(weekStart, weekEnd)}` : rangeTitle(weekStart, weekEnd),
          onPrev: () => goWeek(-1),
          onNext: () => goWeek(1),
          canPrev: !firstWeekStart || weekStart > firstWeekStart,
          canNext: !isThisWeek,
        }
      : {
          label: monthTitle(month),
          onPrev: () => goMonth(-1),
          onNext: () => goMonth(1),
          canPrev: canPrevMonth,
          canNext: canNextMonth,
        };

  const openDay = (date: string) => {
    setSheetDate(date);
    setSheetOpen(true);
  };
  const sheetDay = sheetDate ? (attendance.data?.items.find((d) => d.date === sheetDate) ?? null) : null;

  const onRefresh = () => {
    void Promise.all([attendance.refresh(), stats.refresh()]);
  };

  if (!selected) {
    return (
      <Screen kind="tab" title="출결">
        <EmptyState icon={CalendarDays} title="연결된 자녀가 없어요" description="자녀를 연결하면 출결을 볼 수 있어요." />
      </Screen>
    );
  }

  const calendarCard = (
    <Section>
      <View style={{ gap: space.x4 }}>
        <PeriodStepper
          label={monthTitle(month)}
          onPrev={() => goMonth(-1)}
          onNext={() => goMonth(1)}
          canPrev={canPrevMonth}
          canNext={canNextMonth}
          prevLabel="이전 달"
          nextLabel="다음 달"
        />
        {attendance.data ? (
          <View style={{ gap: space.x4 }}>
            {attendance.isStale ? (
              <Skeleton style={{ height: 76, borderRadius: radius.r4 }} />
            ) : (
              <MonthSummary summary={attendance.data.summary} />
            )}
            <MonthCalendar
              month={month}
              today={today}
              items={attendance.isStale ? [] : attendance.data.items}
              selected={sheetOpen ? sheetDate : null}
              onPressDay={openDay}
            />
            <CalendarLegend />
          </View>
        ) : attendance.error ? (
          <ErrorState message={attendance.error} onRetry={attendance.retry} />
        ) : (
          <CalendarSkeleton />
        )}
      </View>
    </Section>
  );

  const studyCard = (
    <StudyTimeCard
      range={range}
      onRange={setRange}
      stepper={stepper}
      stats={stats.data}
      loading={stats.isLoading}
      stale={stats.isStale}
      error={stats.error}
    />
  );

  return (
    <Screen
      kind="tab"
      title="출결"
      right={<ChildSwitcher />}
      maxWidth={isTablet ? 960 : undefined}
      refreshing={attendance.isRefreshing || stats.isRefreshing}
      onRefresh={onRefresh}>
      {isTablet ? (
        <View style={s.columns}>
          <Stack style={s.col}>{calendarCard}</Stack>
          <Stack style={s.col}>{studyCard}</Stack>
        </View>
      ) : (
        <Stack>
          {calendarCard}
          {studyCard}
        </Stack>
      )}
      <AttendanceDaySheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        date={sheetDate}
        day={sheetDay}
        today={today}
      />
    </Screen>
  );
}

function CalendarSkeleton() {
  return (
    <View style={{ gap: space.x4 }}>
      <Skeleton style={{ height: 76, borderRadius: radius.r4 }} />
      {[0, 1, 2, 3, 4].map((r) => (
        <View key={r} style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          {[0, 1, 2, 3, 4, 5, 6].map((c) => (
            <Skeleton key={c} style={{ width: 28, height: 28, borderRadius: 14 }} />
          ))}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: space.x3 },
  col: { flex: 1, minWidth: 0 },
});
