import { useState } from 'react';

import { StudyTimeCard } from '@/features/parent/attendance-study-card';
import { useChildQuery } from '@/features/parent/child-query';
import { addDays, kstToday, monthTitle, rangeTitle, shiftMonth } from '@/features/parent/today-format';
import type { ParentStudyStatsResponse, StudyRange } from '@/lib/api/parent-today';
import { studentStudyStatsPath } from '@/lib/api/student-plan';

/** 월요일 */
function mondayOf(key: string) {
  const w = new Date(`${key}T00:00:00Z`).getUTCDay();
  return addDays(key, -((w + 6) % 7));
}

/**
 * 내 공부 시간 — 학부모 출결 화면의 공부 시간 카드와 같은 계산·화면(주간/월간, 기간 이동).
 * 플래너 "기록" 탭의 ScrollView 안에 들어가므로 Screen·ScrollView 없이 카드만.
 */
// ponytail: 이전 기간 이동에 하한 없음(첫 등원 달을 모름) — 지난 기간은 빈 막대로 보일 뿐
export function StudyRecord() {
  const today = kstToday();
  const thisMonth = today.slice(0, 7);
  const [range, setRange] = useState<StudyRange>('week');
  const [weekAnchor, setWeekAnchor] = useState(today);
  const [month, setMonth] = useState(thisMonth);

  const statsDate = range === 'week' ? weekAnchor : month === thisMonth ? today : `${month}-01`;
  const stats = useChildQuery<ParentStudyStatsResponse>(studentStudyStatsPath(range, statsDate), range);

  const weekStart = mondayOf(weekAnchor);
  const weekEnd = addDays(weekStart, 6);
  const isThisWeek = weekStart <= today && today <= weekEnd;

  const stepper =
    range === 'week'
      ? {
          label: isThisWeek ? `이번 주 · ${rangeTitle(weekStart, weekEnd)}` : rangeTitle(weekStart, weekEnd),
          onPrev: () => setWeekAnchor(addDays(weekAnchor, -7)),
          onNext: () => {
            const next = addDays(weekAnchor, 7);
            setWeekAnchor(next > today ? today : next);
          },
          canPrev: true,
          canNext: !isThisWeek,
        }
      : {
          label: monthTitle(month),
          onPrev: () => setMonth(shiftMonth(month, -1)),
          onNext: () => setMonth(shiftMonth(month, 1)),
          canPrev: true,
          canNext: month < thisMonth,
        };

  return (
    <StudyTimeCard
      range={range}
      onRange={setRange}
      stepper={stepper}
      stats={stats.data}
      loading={stats.isLoading}
      stale={stats.isStale}
      error={stats.error}
      selfLabel="내 하루 평균"
    />
  );
}
