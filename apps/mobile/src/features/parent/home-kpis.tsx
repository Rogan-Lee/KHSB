import type { Href } from 'expo-router';
import { BookOpen, CalendarRange, LogIn, Medal } from 'lucide-react-native';

import { KpiRow, KpiTile } from '@/design';
import type { ParentStudyStatsResponse, ParentTodayResponse } from '@/lib/api/parent-today';

import { duration, hm } from './today-format';

const ATTENDANCE_TAB = '/(parent)/(tabs)/attendance' as Href;
const GROWTH_TAB = '/(parent)/(tabs)/growth' as Href;

/** 큰 숫자 타일용 — 3시간 20분 → { value: '3', unit: '시간 20분' } */
function minutesParts(minutes: number) {
  const safe = Math.max(0, Math.round(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h === 0) return { value: String(m), unit: '분' };
  return { value: String(h), unit: m === 0 ? '시간' : `시간 ${m}분` };
}

/** 태블릿 학부모 홈 숫자 타일 — 입실 · 오늘 공부 · 이번 주 공부 · 이번 달 상벌점 */
export function ParentKpis({
  today,
  week,
  month,
  points,
}: {
  today: ParentTodayResponse;
  week: ParentStudyStatsResponse | null;
  month: number;
  points: { merit: number; demerit: number } | null;
}) {
  const checkIn = hm(today.checkIn);
  const study = minutesParts(today.studyMinutes);
  const weekStudy = week ? minutesParts(week.totalMinutes) : null;
  const net = points ? points.merit - points.demerit : null;

  return (
    <KpiRow>
      <KpiTile
        label="오늘 입실"
        value={checkIn ?? '—'}
        tone={today.isLate ? 'critical' : checkIn ? 'positive' : 'neutral'}
        icon={LogIn}
        iconTone={today.isLate ? 'bad' : 'ok'}
        caption={
          today.isLate && today.lateMinutes
            ? `${today.lateMinutes}분 늦었어요`
            : today.expected.start
              ? `예정 ${today.expected.start}`
              : '정해진 등원 시간 없음'
        }
        href={ATTENDANCE_TAB}
      />
      <KpiTile
        label="오늘 공부"
        value={study.value}
        unit={study.unit}
        icon={BookOpen}
        iconTone="info"
        caption={today.status === '입실' ? '지금도 공부 중이에요' : '오늘 공부한 시간'}
        href={ATTENDANCE_TAB}
      />
      <KpiTile
        label="이번 주 공부"
        value={weekStudy?.value ?? '—'}
        unit={weekStudy?.unit}
        icon={CalendarRange}
        iconTone="violet"
        caption={week && week.dailyAverageMinutes > 0 ? `하루 평균 ${duration(week.dailyAverageMinutes)}` : '이번 주 합계'}
        href={ATTENDANCE_TAB}
      />
      <KpiTile
        label={`${month}월 상벌점`}
        value={net == null ? '—' : `${net > 0 ? '+' : ''}${net}`}
        tone={net == null || net === 0 ? 'neutral' : net > 0 ? 'positive' : 'critical'}
        icon={Medal}
        iconTone="warn"
        caption={points ? `상점 ${points.merit} · 벌점 ${points.demerit}` : '리포트에 공개된 기록'}
        href={GROWTH_TAB}
      />
    </KpiRow>
  );
}
