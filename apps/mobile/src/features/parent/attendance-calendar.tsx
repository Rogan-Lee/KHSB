import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Press, StatGrid, Text, color, radius, space, type Tone } from '@/design';
import type { ParentAttendanceMonthResponse, ParentDay } from '@/lib/api/parent-today';

import { MARK_COLOR, WEEKDAYS, dayMark } from './today-format';

// 월 달력 — 날짜마다 출결 점(출석·지각·조퇴·결석). 누르면 그날 상세(시트).

/** ‹ 2026년 9월 › — 큰 터치 영역(44) */
export function PeriodStepper({
  label,
  onPrev,
  onNext,
  canPrev = true,
  canNext = true,
  prevLabel = '이전',
  nextLabel = '다음',
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  canPrev?: boolean;
  canNext?: boolean;
  prevLabel?: string;
  nextLabel?: string;
}) {
  return (
    <View style={s.stepper}>
      <Press
        onPress={onPrev}
        disabled={!canPrev}
        scale={0}
        pressedBg
        accessibilityLabel={prevLabel}
        accessibilityState={{ disabled: !canPrev }}
        style={s.stepBtn}>
        <ChevronLeft color={canPrev ? color.fg.neutral : color.fg.disabled} size={24} strokeWidth={2.2} />
      </Press>
      <Text variant="t7-bold" tabular align="center" style={{ flex: 1 }} accessibilityRole="header">
        {label}
      </Text>
      <Press
        onPress={onNext}
        disabled={!canNext}
        scale={0}
        pressedBg
        accessibilityLabel={nextLabel}
        accessibilityState={{ disabled: !canNext }}
        style={s.stepBtn}>
        <ChevronRight color={canNext ? color.fg.neutral : color.fg.disabled} size={24} strokeWidth={2.2} />
      </Press>
    </View>
  );
}

export function MonthSummary({ summary }: { summary: ParentAttendanceMonthResponse['summary'] }) {
  return (
    <StatGrid
      items={[
        { label: '출석', value: `${summary.present}일` },
        { label: '지각', value: `${summary.late}`, tone: summary.late > 0 ? 'warning' : 'neutral' },
        { label: '결석', value: `${summary.absent}`, tone: summary.absent > 0 ? 'critical' : 'neutral' },
        { label: '외출', value: `${summary.outings}` },
      ]}
    />
  );
}

export function MonthCalendar({
  month,
  today,
  items,
  selected,
  onPressDay,
}: {
  month: string;
  today: string;
  items: ParentDay[];
  selected?: string | null;
  onPressDay: (date: string) => void;
}) {
  const byDate = new Map(items.map((d) => [d.date, d]));
  const [y, m] = month.split('-').map(Number);
  const offset = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();

  const cells: (string | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <View>
      <View style={s.weekHead}>
        {WEEKDAYS.map((w) => (
          <Text key={w} variant="t3-medium" color="neutralSubtle" align="center" style={{ flex: 1 }}>
            {w}
          </Text>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={s.week}>
          {week.map((key, di) => {
            if (!key) return <View key={di} style={s.cell} />;
            const day = byDate.get(key);
            const mark = day ? dayMark(day) : null;
            const future = key > today;
            const isToday = key === today;
            const on = key === selected;
            const num = Number(key.slice(8));
            return (
              <Press
                key={key}
                onPress={() => onPressDay(key)}
                disabled={future}
                scale={0}
                pressedBg
                accessibilityLabel={`${m}월 ${num}일${isToday ? ' 오늘' : ''}, ${
                  future ? '아직 오지 않은 날' : (mark?.label ?? '기록 없음')
                }`}
                accessibilityState={{ selected: on, disabled: future }}
                style={[s.cell, s.cellPress, on && s.cellOn]}>
                <View style={[s.num, isToday && s.numToday]}>
                  <Text
                    variant={isToday ? 't5-bold' : 't5-medium'}
                    color={isToday ? 'neutralInverted' : future ? 'placeholder' : 'neutral'}
                    tabular>
                    {num}
                  </Text>
                </View>
                <View
                  style={[
                    s.dot,
                    { backgroundColor: mark ? MARK_COLOR[mark.tone] : 'transparent' },
                  ]}
                />
              </Press>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const LEGEND: { tone: Tone; label: string }[] = [
  { tone: 'ok', label: '출석' },
  { tone: 'warn', label: '지각' },
  { tone: 'violet', label: '조퇴' },
  { tone: 'bad', label: '결석' },
  { tone: 'gray', label: '사유 결석' },
];

export function CalendarLegend() {
  return (
    <View style={s.legend} accessibilityLabel="색 안내: 초록 출석, 노랑 지각, 보라 조퇴, 빨강 결석, 회색 사유 결석">
      {LEGEND.map((l) => (
        <View key={l.label} style={s.legendItem}>
          <View style={[s.dot, { backgroundColor: MARK_COLOR[l.tone] }]} />
          <Text variant="t3-regular" color="neutralMuted">
            {l.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.x2 },
  stepBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  weekHead: { flexDirection: 'row', paddingBottom: space.x2 },
  week: { flexDirection: 'row' },
  cell: { flex: 1, height: 56, alignItems: 'center' },
  cellPress: { justifyContent: 'center', gap: space.x1, borderRadius: radius.r3 },
  cellOn: { backgroundColor: color.bg.neutralWeak },
  num: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  numToday: { backgroundColor: color.bg.neutralInverted },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.x3, rowGap: space.x1_5 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.x1_5 },
});
