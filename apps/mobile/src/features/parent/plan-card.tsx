import { Check } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Section, Skeleton, Text, color, radius, space } from '@/design';
import { useChildQuery } from '@/features/parent/child-query';
import { addDays, duration, kstToday } from '@/features/parent/today-format';
import { SUBJECTS } from '@/features/student-planner/planner';
import { DAY_LABELS, dotColor, dowOf } from '@/features/student-plan/format';
import { parentApi } from '@/lib/api/parent-today';
import type { DailyPlan, PlansRangeResponse, TimerState } from '@/lib/api/student-plan';

const MAX_ITEMS = 6;

/** 월요일 */
function mondayOf(key: string) {
  const w = new Date(`${key}T00:00:00Z`).getUTCDay();
  return addDays(key, -((w + 6) % 7));
}

/** 학부모 홈 — 자녀가 쓴 이번 주 공부 계획(읽기 전용): 오늘 할 일 + 월~일 달성 */
export function ChildPlanCard({ studentId }: { studentId: string }) {
  const monday = mondayOf(kstToday());
  const q = useChildQuery<PlansRangeResponse>(parentApi.plans(studentId, monday, addDays(monday, 6)), studentId);
  const data = q.data;
  const todayPlan = data?.days.find((d) => d.date === data.today);
  // 빈 text 는 대시보드 시간표가 만든 빈 줄 — 세지 않는다
  const items = (todayPlan?.items ?? []).filter((it) => it.text.trim());
  const done = items.filter((it) => it.done).length;
  const timer = useChildQuery<TimerState>(parentApi.timer(studentId), studentId).data;

  return (
    <Section
      title="공부 계획"
      description={
        !data ? undefined : items.length > 0 ? `오늘 ${items.length}개 중 ${done}개 완료` : '오늘 계획이 아직 없어요'
      }>
      {!data ? (
        q.isLoading ? (
          <View style={{ gap: space.x3 }}>
            <Skeleton style={{ height: 20, width: 200 }} />
            <Skeleton style={{ height: 20, width: 160 }} />
            <Skeleton style={{ height: 48, borderRadius: radius.r3 }} />
          </View>
        ) : (
          <Text variant="t4-regular" color="neutralSubtle">
            {q.error ?? '공부 계획을 불러오지 못했어요.'}
          </Text>
        )
      ) : (
        <View style={{ gap: space.x4 }}>
          {timer && <TimerLines timer={timer} />}
          {items.length > 0 && (
            <View style={{ gap: space.x2 }}>
              {items.slice(0, MAX_ITEMS).map((it, i) => (
                <View
                  key={it.id || `i${i}`}
                  style={s.item}
                  accessibilityLabel={`${it.subject ? `${it.subject} ` : ''}${it.text} ${it.done ? '완료' : '아직'}`}>
                  <View style={[s.box, it.done && s.boxOn]}>
                    {it.done && <Check color={color.palette.staticWhite} size={12} strokeWidth={3} />}
                  </View>
                  <View style={[s.dot, { backgroundColor: dotColor(it.colorCode) }]} />
                  <Text
                    variant="t4-regular"
                    color={it.done ? 'neutralSubtle' : 'neutral'}
                    numberOfLines={1}
                    style={[{ flex: 1, minWidth: 0 }, it.done && s.strike]}>
                    {it.subject && !it.text.startsWith(it.subject) ? (
                      <Text variant="t4-medium" color="neutralSubtle">
                        {it.subject}
                        {'  '}
                      </Text>
                    ) : null}
                    {it.text}
                  </Text>
                </View>
              ))}
              {items.length > MAX_ITEMS && (
                <Text variant="t3-regular" color="neutralSubtle">
                  외 {items.length - MAX_ITEMS}개
                </Text>
              )}
            </View>
          )}
          <WeekStrip days={data.days} today={data.today} />
        </View>
      )}
    </Section>
  );
}

/** 지금 시각 — 1분마다 (student-life/network-sections 와 같은 방식) */
function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** 공부 타이머 — 지금 공부 중인지 + 오늘 과목별 합계. 아무것도 없으면 그리지 않는다 */
function TimerLines({ timer }: { timer: TimerState }) {
  const tick = useNow();
  // 기기 시계 대신 서버 시각 기준 — 응답이 올 때의 서버·기기 차이를 기억해 둔다(렌더 중 파생 상태)
  const [base, setBase] = useState({ key: timer.now, offset: Date.parse(timer.now) - tick });
  if (base.key !== timer.now) setBase({ key: timer.now, offset: Date.parse(timer.now) - tick });
  // ponytail: 1분 단위 갱신이라 경과 시간이 최대 1분 어긋날 수 있다 — 분 단위 표시라 둔다
  const active = timer.active;
  const elapsed = active ? Math.max(0, Math.floor((tick + base.offset - Date.parse(active.startedAt)) / 60_000)) : 0;
  if (!active && timer.totalMinutes === 0) return null;

  return (
    <View style={{ gap: space.x2 }}>
      {active && (
        <View style={s.liveRow}>
          <View style={[s.dot, { backgroundColor: color.bg.brandSolid }]} />
          <Text variant="t4-bold" color="brand" style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>
            {`지금 ${active.subject ?? '과목 없음'} 공부 중 · ${elapsed > 0 ? `${duration(elapsed)}째` : '방금 시작'}`}
          </Text>
        </View>
      )}
      {timer.totalMinutes > 0 && (
        <View style={{ gap: space.x1_5 }}>
          <Text variant="t4-medium" color="neutralMuted">
            {`오늘 타이머 ${duration(timer.totalMinutes)}`}
          </Text>
          <View style={s.subjects}>
            {timer.bySubject.map((b) => {
              const sub = SUBJECTS.find((x) => x.name === b.subject);
              return (
                <View key={b.subject ?? '-'} style={s.subject}>
                  <View style={[s.dot, { backgroundColor: sub ? dotColor(sub.color) : color.fg.placeholder }]} />
                  <Text variant="t3-medium" color="neutralSubtle">
                    {`${b.subject ?? '과목 없음'} ${duration(b.minutes)}`}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

function WeekStrip({ days, today }: { days: DailyPlan[]; today: string }) {
  return (
    <View style={s.strip}>
      {days.map((d) => {
        const list = d.items.filter((it) => it.text.trim());
        const doneN = list.filter((it) => it.done).length;
        const ratio = list.length ? doneN / list.length : 0;
        const isToday = d.date === today;
        const future = d.date > today;
        return (
          <View
            key={d.date}
            style={[s.day, future && { opacity: 0.5 }]}
            accessibilityLabel={`${DAY_LABELS[dowOf(d.date)]}요일 ${list.length ? `${list.length}개 중 ${doneN}개 완료` : '계획 없음'}`}>
            <Text variant="t3-bold" color={isToday ? 'brand' : 'neutralSubtle'}>
              {DAY_LABELS[dowOf(d.date)]}
            </Text>
            <View style={s.track}>
              <View
                style={[
                  s.fill,
                  { width: `${Math.round(ratio * 100)}%`, backgroundColor: isToday ? color.bg.brandSolid : color.bg.positiveSolid },
                ]}
              />
            </View>
            <Text variant="t2-medium" color={list.length ? 'neutralMuted' : 'placeholder'} tabular>
              {list.length ? `${doneN}/${list.length}` : '–'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: space.x2, minHeight: 24 },
  box: {
    width: 18,
    height: 18,
    borderRadius: radius.r1_5,
    borderWidth: 1.5,
    borderColor: color.stroke.neutralMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: color.bg.brandSolid, borderColor: color.bg.brandSolid },
  dot: { width: space.x2, height: space.x2, borderRadius: radius.full },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: space.x2 },
  subjects: { flexDirection: 'row', flexWrap: 'wrap', gap: space.x3 },
  subject: { flexDirection: 'row', alignItems: 'center', gap: space.x1_5 },
  strike: { textDecorationLine: 'line-through', textDecorationColor: color.fg.placeholder },
  strip: {
    flexDirection: 'row',
    gap: space.x1_5,
    padding: space.x3,
    borderRadius: radius.r4,
    backgroundColor: color.bg.layerFill,
  },
  day: { flex: 1, minWidth: 0, alignItems: 'center', gap: space.x1_5 },
  track: { width: '100%', height: 4, borderRadius: radius.full, backgroundColor: color.stroke.neutralWeak, overflow: 'hidden' },
  fill: { height: 4, borderRadius: radius.full },
});
