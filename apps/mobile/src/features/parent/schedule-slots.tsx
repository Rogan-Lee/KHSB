import { StyleSheet, View } from 'react-native';

import { Badge, color, radius, space, Text } from '@/design';
import type { AttendanceSlot, OutingSlot } from '@/lib/api/parent-services';

// 등원 스케줄 표 — 요일별 등하원 시간(지금 ↔ 바뀔 스케줄)과 학원·외출 목록.

const DAY_LABEL = ['일', '월', '화', '수', '목', '금', '토'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function slotText(slots: AttendanceSlot[], day: number) {
  const list = slots
    .filter((s) => s.dayOfWeek === day)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map((s) => `${s.startTime}~${s.endTime}`);
  return list.length ? list.join('\n') : null;
}

export type ScheduleDayRow = { day: number; before: string | null; after: string | null; changed: boolean };

export function scheduleDayRows(current: AttendanceSlot[], proposed: AttendanceSlot[]): ScheduleDayRow[] {
  return DAY_ORDER.map((day) => {
    const before = slotText(current, day);
    const after = slotText(proposed, day);
    return { day, before, after, changed: before !== after };
  });
}

/** 지금 ↔ 바뀔 스케줄 비교 표. 바뀐 요일은 강조 + "변경" 배지 */
export function ScheduleDiffTable({ rows }: { rows: ScheduleDayRow[] }) {
  return (
    <View style={s.table} accessibilityRole="list">
      <View style={[s.row, s.headRow]}>
        <Text variant="t3-bold" color="neutralSubtle" style={s.dayCol}>
          요일
        </Text>
        <Text variant="t3-bold" color="neutralSubtle" style={s.col}>
          지금
        </Text>
        <Text variant="t3-bold" color="neutralSubtle" style={s.col}>
          바뀔 스케줄
        </Text>
      </View>
      {rows.map((r) => (
        <View
          key={r.day}
          style={[s.row, r.changed && s.changedRow]}
          accessible
          accessibilityLabel={`${DAY_LABEL[r.day]}요일, 지금 ${r.before ?? '등원 없음'}, 바뀔 스케줄 ${r.after ?? '등원 없음'}${r.changed ? ', 변경됨' : ''}`}>
          <View style={s.dayCol}>
            <Text variant="t5-bold" color={r.day === 0 ? 'critical' : 'neutral'}>
              {DAY_LABEL[r.day]}
            </Text>
          </View>
          <Text
            variant="t4-regular"
            color={r.changed ? 'neutralSubtle' : 'neutralMuted'}
            tabular
            style={[s.col, r.changed && r.before ? s.strike : null]}>
            {r.before ?? '—'}
          </Text>
          <View style={[s.col, { flexDirection: 'row', alignItems: 'center', gap: space.x1_5, flexWrap: 'wrap' }]}>
            <Text variant={r.changed ? 't4-bold' : 't4-regular'} color={r.changed ? 'neutral' : 'neutralMuted'} tabular>
              {r.after ?? (r.changed ? '등원 안 함' : '—')}
            </Text>
            {r.changed && <Badge tone="brand">변경</Badge>}
          </View>
        </View>
      ))}
    </View>
  );
}

/** 요일별 등하원 (한 가지 스케줄만) */
export function ScheduleWeekTable({ slots }: { slots: AttendanceSlot[] }) {
  return (
    <View style={s.table}>
      {DAY_ORDER.map((day) => {
        const text = slotText(slots, day);
        return (
          <View key={day} style={s.row} accessible accessibilityLabel={`${DAY_LABEL[day]}요일 ${text ?? '등원 없음'}`}>
            <View style={s.dayCol}>
              <Text variant="t5-bold" color={day === 0 ? 'critical' : 'neutral'}>
                {DAY_LABEL[day]}
              </Text>
            </View>
            <Text variant="t5-regular" color={text ? 'neutral' : 'neutralSubtle'} tabular style={{ flex: 1 }}>
              {text ?? '등원 없음'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const outingKey = (o: OutingSlot) => `${o.dayOfWeek}|${o.outStart}|${o.outEnd}|${o.reason ?? ''}`;

function sortOutings(list: OutingSlot[]) {
  return [...list].sort(
    (a, b) => DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek) || a.outStart.localeCompare(b.outStart),
  );
}

/** 학원·외출 목록. before 를 주면 새로 생긴 것 "추가", 없어진 것 "빠짐" 표시 */
export function ScheduleOutingList({ outings, before }: { outings: OutingSlot[]; before?: OutingSlot[] }) {
  const beforeKeys = before ? new Set(before.map(outingKey)) : null;
  const afterKeys = new Set(outings.map(outingKey));
  const removed = before ? sortOutings(before.filter((o) => !afterKeys.has(outingKey(o)))) : [];
  const items: { o: OutingSlot; mark: 'added' | 'removed' | null }[] = [
    ...sortOutings(outings).map((o) => ({
      o,
      mark: beforeKeys && !beforeKeys.has(outingKey(o)) ? ('added' as const) : null,
    })),
    ...removed.map((o) => ({ o, mark: 'removed' as const })),
  ];

  if (items.length === 0) {
    return (
      <Text variant="t4-regular" color="neutralSubtle">
        학원·외출 일정이 없어요
      </Text>
    );
  }
  return (
    <View style={{ gap: space.x2 }}>
      {items.map(({ o, mark }, i) => (
        <View key={`${outingKey(o)}-${i}`} style={[s.outing, mark === 'removed' && { opacity: 0.6 }]}>
          <Text variant="t5-bold" color={o.dayOfWeek === 0 ? 'critical' : 'neutral'} style={s.dayCol}>
            {DAY_LABEL[o.dayOfWeek]}
          </Text>
          <View style={{ flex: 1, minWidth: 0, gap: space.x0_5 }}>
            <Text variant="t5-medium" tabular style={mark === 'removed' ? s.strike : undefined}>
              {o.outStart}~{o.outEnd}
            </Text>
            {!!o.reason && (
              <Text variant="t4-regular" color="neutralSubtle" numberOfLines={2}>
                {o.reason}
              </Text>
            )}
          </View>
          {mark === 'added' && <Badge tone="brand">추가</Badge>}
          {mark === 'removed' && <Badge tone="gray">빠짐</Badge>}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  table: { borderRadius: radius.r4, overflow: 'hidden', borderWidth: 1, borderColor: color.stroke.neutralSubtle },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2,
    minHeight: 48,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2,
    borderTopWidth: 1,
    borderTopColor: color.stroke.neutralSubtle,
  },
  headRow: { minHeight: 36, borderTopWidth: 0, backgroundColor: color.bg.layerFill },
  changedRow: { backgroundColor: color.bg.brandWeak },
  dayCol: { width: 32 },
  col: { flex: 1, minWidth: 0 },
  strike: { textDecorationLine: 'line-through' },
  outing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2,
    minHeight: 52,
    paddingHorizontal: space.x3_5,
    paddingVertical: space.x2_5,
    borderRadius: radius.r3_5,
    backgroundColor: color.bg.layerFill,
  },
});
