import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import {
  Badge,
  Button,
  Chip,
  ChipGroup,
  ErrorState,
  Screen,
  Section,
  Stack,
  Text,
  color,
  space,
} from '@/design';
import { usePullRefresh } from '@/features/staff-home/hooks';
import {
  WEEKDAYS,
  addDaysKey,
  formatRangeKey,
  kstTodayKey,
  weekStartKey,
} from '@/features/staff-home/format';
import { EventRow, ListSkeleton, MentorShiftList } from '@/features/staff-home/ui';
import {
  STAFF_API,
  type CalendarEventType,
  type StaffCalendarDay,
  type StaffCalendarResponse,
} from '@/lib/api/staff-home';
import { useMobileQuery } from '@/lib/mobile-api';
import { useResponsive } from '@/lib/responsive';

type Filter = 'ALL' | CalendarEventType;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'SCHOOL_EXAM', label: '학교 시험' },
  { value: 'SCHOOL_EVENT', label: '학교 행사' },
  { value: 'PERSONAL', label: '개인 일정' },
  { value: 'PLATFORM', label: '플랫폼' },
];

/** 일정 — 주 단위 아젠다(오늘 강조) · 학교 시험/행사/개인 일정 · 요일별 근무 멘토 */
export default function StaffCalendarScreen() {
  const { isTablet } = useResponsive();
  const [thisWeek] = useState(() => weekStartKey(kstTodayKey()));
  const [weekStart, setWeekStart] = useState(thisWeek);
  const [filter, setFilter] = useState<Filter>('ALL');
  const to = addDaysKey(weekStart, 6);
  const { data, error, refresh, retry } = useMobileQuery<StaffCalendarResponse>(
    STAFF_API.calendar(weekStart, to)
  );
  const { refreshing, onRefresh } = usePullRefresh(refresh);
  // 주를 바꾸면 새 응답이 올 때까지 이전 주 데이터를 보여 주지 않는다
  const current = data && data.from === weekStart ? data : null;

  const total = current
    ? current.days.reduce(
        (sum, d) => sum + d.events.filter((e) => filter === 'ALL' || e.type === filter).length,
        0
      )
    : 0;

  return (
    <Screen
      kind="push"
      title="일정"
      backFallback="/(staff)/(tabs)"
      maxWidth={isTablet ? 720 : undefined}
      refreshing={refreshing}
      onRefresh={onRefresh}>
      <Stack>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x1 }}>
          <Button
            size="sm"
            variant="ghost"
            icon={ChevronLeft}
            accessibilityLabel="지난주"
            onPress={() => setWeekStart((w) => addDaysKey(w, -7))}
          />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text variant="t6-bold" tabular numberOfLines={1}>
              {formatRangeKey(weekStart, to)}
            </Text>
            {current ? (
              <Text variant="t3-regular" color="neutralSubtle" tabular>
                {total > 0 ? `일정 ${total}건` : '등록된 일정 없음'}
              </Text>
            ) : null}
          </View>
          <Button
            size="sm"
            variant="ghost"
            icon={ChevronRight}
            accessibilityLabel="다음 주"
            onPress={() => setWeekStart((w) => addDaysKey(w, 7))}
          />
        </View>

        <ChipGroup>
          {weekStart !== thisWeek && (
            <Chip selected={false} size="sm" onPress={() => setWeekStart(thisWeek)}>
              이번 주로
            </Chip>
          )}
          {FILTERS.map((f) => (
            <Chip key={f.value} size="sm" selected={filter === f.value} onPress={() => setFilter(f.value)}>
              {f.label}
            </Chip>
          ))}
        </ChipGroup>

        {!current ? (
          error ? (
            <ErrorState message={error} onRetry={() => void retry()} />
          ) : (
            <Stack>
              <ListSkeleton rows={2} />
              <ListSkeleton rows={1} />
              <ListSkeleton rows={2} />
            </Stack>
          )
        ) : (
          current.days.map((day) => <DayCard key={day.date} day={day} filter={filter} />)
        )}
      </Stack>
    </Screen>
  );
}

function DayCard({ day, filter }: { day: StaffCalendarDay; filter: Filter }) {
  const events = day.events.filter((e) => filter === 'ALL' || e.type === filter);
  const dayNum = Number(day.date.slice(8, 10));
  const weekday = WEEKDAYS[day.dayOfWeek];
  const tint = day.dayOfWeek === 0 ? 'critical' : day.dayOfWeek === 6 ? 'informative' : 'neutral';

  return (
    <Section
      style={day.isToday ? { borderWidth: 1.5, borderColor: color.stroke.brandWeak } : undefined}
      title={
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.x2 }}
          accessibilityRole="header"
          accessibilityLabel={`${day.date.slice(5, 7)}월 ${dayNum}일 ${weekday}요일${day.isToday ? ', 오늘' : ''}`}>
          <Text variant="t6-bold" color={tint} tabular>
            {`${dayNum}일 ${weekday}요일`}
          </Text>
          {day.isToday ? (
            <Badge tone="brand" solid>
              오늘
            </Badge>
          ) : null}
        </View>
      }>
      {events.length === 0 && day.mentors.length === 0 ? (
        <Text variant="t4-regular" color="neutralSubtle">
          일정이 없어요
        </Text>
      ) : (
        <Stack gap={space.x3}>
          {events.length > 0 ? (
            <View>
              {events.map((e) => (
                <EventRow key={e.id} event={e} dayKey={day.date} />
              ))}
            </View>
          ) : (
            <Text variant="t4-regular" color="neutralSubtle">
              일정이 없어요
            </Text>
          )}
          {day.mentors.length > 0 && (
            <View style={{ gap: space.x2 }}>
              <Text variant="t4-bold" color="neutralMuted">
                근무 멘토
              </Text>
              <MentorShiftList mentors={day.mentors} />
            </View>
          )}
        </Stack>
      )}
    </Section>
  );
}
