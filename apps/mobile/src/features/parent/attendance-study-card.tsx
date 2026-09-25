import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Section, Segmented, Skeleton, Text, color, radius, space } from '@/design';
import type { ParentStudyStatsResponse, StudyRange } from '@/lib/api/parent-today';

import { PeriodStepper } from './attendance-calendar';
import { StudyBars, StudySummary } from './attendance-study-chart';
import { dayShort, duration } from './today-format';

type Stepper = {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
};

/** 공부 시간 카드 — 주간/월간 전환 · 기간 이동 · 막대 그래프(학년 평균 기준선) */
export function StudyTimeCard({
  range,
  onRange,
  stepper,
  stats,
  loading,
  stale,
  error,
}: {
  range: StudyRange;
  onRange: (r: StudyRange) => void;
  stepper: Stepper;
  stats: ParentStudyStatsResponse | null;
  loading: boolean;
  stale: boolean;
  error: string | null;
}) {
  return (
    <Section title="공부 시간" description="입실부터 퇴실까지에서 외출 시간을 뺐어요">
      <View style={{ gap: space.x4 }}>
        <Segmented
          options={[
            { value: 'week', label: '주간' },
            { value: 'month', label: '월간' },
          ]}
          value={range}
          onChange={onRange}
        />
        <PeriodStepper
          {...stepper}
          prevLabel={range === 'week' ? '이전 주' : '이전 달'}
          nextLabel={range === 'week' ? '다음 주' : '다음 달'}
        />
        {stats && stats.range === range ? (
          <View style={{ opacity: stale ? 0.5 : 1 }}>
            <StudyBody key={`${stats.range}-${stats.start}`} stats={stats} />
          </View>
        ) : loading ? (
          <View style={{ gap: space.x3 }}>
            <Skeleton style={{ width: 90, height: 16 }} />
            <Skeleton style={{ width: 180, height: 36 }} />
            <Skeleton style={{ height: 190, borderRadius: radius.r3 }} />
          </View>
        ) : (
          <Text variant="t4-regular" color="neutralSubtle">
            {error ?? '공부 시간을 불러오지 못했어요.'}
          </Text>
        )}
      </View>
    </Section>
  );
}

function StudyBody({ stats }: { stats: ParentStudyStatsResponse }) {
  const past = stats.days.filter((d) => !d.future);
  const initial =
    stats.days.find((d) => d.today)?.date ??
    [...past].reverse().find((d) => d.attended)?.date ??
    past[past.length - 1]?.date ??
    null;
  const [selected, setSelected] = useState<string | null>(initial);
  const sel = stats.days.find((d) => d.date === selected) ?? null;
  const label =
    stats.range === 'week'
      ? stats.inProgress
        ? '이번 주 합계'
        : '이 주 합계'
      : stats.inProgress
        ? '이번 달 합계'
        : '이 달 합계';

  return (
    <View style={{ gap: space.x5 }}>
      <StudySummary stats={stats} label={label} />

      <View style={{ gap: space.x2 }}>
        <View style={s.selRow} accessibilityLiveRegion="polite">
          <Text variant="t4-medium" color="neutralMuted">
            {sel ? dayShort(sel.date) : '막대를 눌러 보세요'}
          </Text>
          {sel && (
            <Text variant="t5-bold" tabular>
              {sel.attended ? duration(sel.minutes) : '기록 없음'}
            </Text>
          )}
        </View>
        <StudyBars
          days={stats.days}
          mode={stats.range}
          selected={selected}
          onSelect={setSelected}
          referenceMinutes={stats.gradeAverage?.dailyMinutes ?? null}
        />
      </View>

      <View style={s.legend}>
        <View style={s.legendRow}>
          <View style={s.swatch} />
          <Text variant="t4-regular" color="neutralMuted" style={{ flex: 1 }}>
            우리 아이 하루 평균
          </Text>
          <Text variant="t4-bold" tabular>
            {stats.dailyAverageMinutes > 0 ? duration(stats.dailyAverageMinutes) : '—'}
          </Text>
        </View>
        <View style={s.legendRow}>
          <View style={s.refKey} />
          <Text variant="t4-regular" color="neutralMuted" style={{ flex: 1 }}>
            같은 학년 하루 평균
          </Text>
          <Text variant="t4-bold" tabular>
            {stats.gradeAverage ? duration(stats.gradeAverage.dailyMinutes) : '—'}
          </Text>
        </View>
        <View style={s.legendRow}>
          <View style={s.swatch} />
          <Text variant="t4-regular" color="neutralMuted" style={{ flex: 1 }}>
            등원한 날
          </Text>
          <Text variant="t4-bold" tabular>
            {stats.attendedDays}일
          </Text>
        </View>
        {!stats.gradeAverage && (
          <Text variant="t3-regular" color="neutralSubtle">
            같은 학년 학생이 적은 기간에는 개인 정보 보호를 위해 평균을 보여주지 않아요.
          </Text>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  selRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.x2 },
  legend: {
    gap: space.x2,
    padding: space.x4,
    borderRadius: radius.r4,
    backgroundColor: color.bg.layerFill,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: space.x2 },
  swatch: { width: 10 },
  refKey: { width: 10, height: 2, backgroundColor: color.fg.neutralMuted },
});
