import { StyleSheet, View } from 'react-native';

import { Badge, Text, color, space, type Tone } from '@/design';
import type { ParentDay, ParentTodayResponse } from '@/lib/api/parent-today';

import { duration, hm, hmToMinutes } from './today-format';

// 하루 타임라인 — 입실 → 외출/복귀 → 쪽잠 → 퇴실. 예정 시간과 실제 시간을 나란히.
// 홈(오늘)과 출결 달력의 날짜 상세 시트가 같이 쓴다.

type EventState = 'done' | 'now' | 'upcoming' | 'missed';

type TimelineEvent = {
  key: string;
  /** 왼쪽 큰 시각 (실제 우선, 없으면 예정) */
  time: string | null;
  /** 왼쪽 시각이 예정 시각인지 */
  timeIsExpected: boolean;
  title: string;
  detail?: string | null;
  expected?: string | null;
  badge?: { tone: Tone; label: string } | null;
  state: EventState;
  order: number;
};

export function buildTimeline(
  day: ParentDay,
  /** live: 오늘(진행 중) — 아직 없는 기록을 "예정"으로, 지난 날은 "기록 없음"으로 */
  extra?: { naps?: ParentTodayResponse['naps']; overdue?: boolean; now?: string; live?: boolean },
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const live = extra?.live ?? false;
  const nowMin = extra?.now ? hmToMinutes(hm(extra.now)) : null;

  if (day.status === '결석') {
    return [
      {
        key: 'absent',
        time: null,
        timeIsExpected: false,
        title: day.typeLabel ?? '결석',
        detail:
          day.type === 'ABSENT'
            ? '이날은 독서실에 오지 않았어요'
            : '사유가 확인된 결석이에요',
        badge: { tone: day.type === 'ABSENT' ? 'bad' : 'gray', label: day.typeLabel ?? '결석' },
        state: 'done',
        order: 0,
      },
    ];
  }

  const checkIn = hm(day.checkIn);
  events.push({
    key: 'in',
    time: checkIn ?? day.expected.start,
    timeIsExpected: !checkIn,
    title: checkIn ? '입실' : live ? '입실 예정' : '입실 기록 없음',
    detail: checkIn ? null : extra?.overdue ? '아직 입실하지 않았어요' : null,
    expected: checkIn && day.expected.start ? `예정 ${day.expected.start}` : null,
    badge: day.isLate
      ? { tone: 'warn', label: day.lateMinutes ? `지각 ${day.lateMinutes}분` : '지각' }
      : null,
    state: checkIn ? 'done' : extra?.overdue || !live ? 'missed' : 'upcoming',
    order: -1,
  });

  for (const o of day.outings) {
    const start = hm(o.start);
    const end = hm(o.end);
    const expectedRange =
      o.expectedStart && o.expectedEnd ? `${o.expectedStart} – ${o.expectedEnd}` : null;
    if (o.planned) {
      events.push({
        key: `out-${o.sequence}`,
        time: o.expectedStart,
        timeIsExpected: true,
        title: o.reason ? `외출 예정 · ${o.reason}` : '외출 예정',
        detail: expectedRange,
        state: 'upcoming',
        order: hmToMinutes(o.expectedStart) ?? 9000,
      });
      continue;
    }
    const away =
      o.start && o.end
        ? Math.max(0, Math.round((new Date(o.end).getTime() - new Date(o.start).getTime()) / 60000))
        : null;
    events.push({
      key: `out-${o.sequence}`,
      time: start,
      timeIsExpected: false,
      title: o.reason ? `외출 · ${o.reason}` : '외출',
      detail: end
        ? `${end}에 돌아왔어요${away != null ? ` (${duration(away)})` : ''}`
        : '지금 외출 중이에요',
      expected: expectedRange ? `예정 ${expectedRange}` : null,
      state: end ? 'done' : 'now',
      order: hmToMinutes(start) ?? 9000,
    });
  }

  for (const n of extra?.naps ?? []) {
    const startMin = hmToMinutes(n.startTime);
    events.push({
      key: `nap-${n.id}`,
      time: n.startTime,
      timeIsExpected: false,
      title: '쪽잠',
      detail: `${n.durationMin}분 동안 쉬었어요`,
      state:
        nowMin != null && startMin != null
          ? nowMin >= startMin + n.durationMin
            ? 'done'
            : nowMin >= startMin
              ? 'now'
              : 'upcoming'
          : 'done',
      order: startMin ?? 9000,
    });
  }

  const checkOut = hm(day.checkOut);
  if (checkOut || day.expected.end) {
    events.push({
      key: 'leave',
      time: checkOut ?? day.expected.end,
      timeIsExpected: !checkOut,
      title: checkOut ? '퇴실' : live ? '퇴실 예정' : '퇴실 기록 없음',
      expected: checkOut && day.expected.end ? `예정 ${day.expected.end}` : null,
      badge: day.type === 'EARLY_LEAVE' ? { tone: 'violet', label: '조퇴' } : null,
      state: checkOut ? 'done' : 'upcoming',
      order: 99999,
    });
  }

  return events.sort((a, b) => a.order - b.order);
}

const DOT = 14;

function Dot({ state }: { state: EventState }) {
  const style =
    state === 'done'
      ? { backgroundColor: color.fg.neutral, borderColor: color.fg.neutral }
      : state === 'now'
        ? { backgroundColor: color.bg.brandSolid, borderColor: color.bg.brandWeakPressed }
        : state === 'missed'
          ? { backgroundColor: color.bg.layerDefault, borderColor: color.fg.warning }
          : { backgroundColor: color.bg.layerDefault, borderColor: color.palette.gray500 };
  return <View style={[s.dot, style, state === 'now' && s.dotNow]} />;
}

/** 세로 타임라인. events 가 비면 아무것도 그리지 않는다 */
export function DayTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return null;
  return (
    <View accessibilityRole="list">
      {events.map((e, i) => {
        const last = i === events.length - 1;
        const muted = e.state === 'upcoming';
        const a11y = [
          e.title,
          e.time ? `${e.timeIsExpected ? '예정 ' : ''}${e.time}` : null,
          e.detail,
          e.expected,
          e.badge?.label,
        ]
          .filter(Boolean)
          .join(', ');
        return (
          <View key={e.key} style={s.row} accessible accessibilityLabel={a11y}>
            <View style={s.timeCol}>
              <Text
                variant={muted ? 't5-medium' : 't5-bold'}
                color={muted ? 'neutralSubtle' : 'neutral'}
                tabular
                numberOfLines={1}>
                {e.time ?? '—'}
              </Text>
            </View>
            <View style={s.rail}>
              <Dot state={e.state} />
              {!last && <View style={s.line} />}
            </View>
            <View style={[s.body, !last && { paddingBottom: space.x5 }]}>
              <View style={s.titleRow}>
                <Text
                  variant="t5-bold"
                  color={muted ? 'neutralMuted' : 'neutral'}
                  style={{ flexShrink: 1 }}>
                  {e.title}
                </Text>
                {e.badge && <Badge tone={e.badge.tone}>{e.badge.label}</Badge>}
                {e.state === 'now' && (
                  <Badge tone="brand" solid>
                    지금
                  </Badge>
                )}
              </View>
              {e.detail != null && (
                <Text variant="t4-regular" color={e.state === 'missed' ? 'warning' : 'neutralMuted'}>
                  {e.detail}
                </Text>
              )}
              {e.expected != null && (
                <Text variant="t3-regular" color="neutralSubtle" tabular>
                  {e.expected}
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch' },
  timeCol: { width: 56, paddingTop: 1 },
  rail: { width: 24, alignItems: 'center' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 2, marginTop: 4 },
  dotNow: { borderWidth: 3 },
  line: { flex: 1, width: 2, marginTop: 4, marginBottom: -4, backgroundColor: color.stroke.neutralWeak },
  body: { flex: 1, minWidth: 0, gap: space.x0_5, paddingLeft: space.x2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.x1_5 },
});
