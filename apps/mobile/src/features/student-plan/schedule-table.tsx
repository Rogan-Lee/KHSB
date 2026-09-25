import { StyleSheet, View } from 'react-native';

import { color, radius, space, Text } from '@/design';
import type { AttendanceSlot, OutingSlot, ScheduleSlots } from '@/lib/api/student-plan';

import { DAY_FULL, sortAttendance, sortOutings, WEEK_DAYS } from './format';

// 등원 스케줄 읽기 전용 표 — 폰: 요일별 줄(등하원 + 그 요일 외출), 태블릿: 월–일 7칸 격자.

function dayTone(day: number): 'critical' | 'informative' | 'neutral' {
  return day === 0 ? 'critical' : day === 6 ? 'informative' : 'neutral';
}

function daySlots(slots: AttendanceSlot[], day: number) {
  return sortAttendance(slots.filter((s) => s.dayOfWeek === day));
}

function dayOutings(outings: OutingSlot[], day: number) {
  return sortOutings(outings.filter((o) => o.dayOfWeek === day));
}

export function ScheduleView({ slots, layout = 'rows' }: { slots: ScheduleSlots; layout?: 'rows' | 'grid' }) {
  return layout === 'grid' ? <WeekGrid slots={slots} /> : <WeekRows slots={slots} />;
}

/** 요일별 줄 — 요일 · 등하원 시간 · 외출 */
function WeekRows({ slots }: { slots: ScheduleSlots }) {
  return (
    <View style={s.table}>
      {WEEK_DAYS.map((d, i) => {
        const att = daySlots(slots.attendance, d.value);
        const outs = dayOutings(slots.outings, d.value);
        const label = att.length
          ? att.map((a) => `${a.startTime}~${a.endTime}`).join(', ')
          : '등원 안 함';
        return (
          <View
            key={d.value}
            style={[s.row, i > 0 && s.rowBorder]}
            accessible
            accessibilityLabel={`${DAY_FULL[d.value]} ${label}${
              outs.length
                ? `, 외출 ${outs.map((o) => `${o.outStart}~${o.outEnd} ${o.reason ?? ''}`).join(', ')}`
                : ''
            }`}>
            <Text variant="t5-bold" color={dayTone(d.value)} style={s.dayCol}>
              {d.label}
            </Text>
            <View style={{ flex: 1, minWidth: 0, gap: space.x1 }}>
              {att.length ? (
                att.map((a, j) => (
                  <Text key={j} variant="t5-medium" tabular>
                    {a.startTime} ~ {a.endTime}
                  </Text>
                ))
              ) : (
                <Text variant="t5-regular" color="neutralSubtle">
                  등원 안 함
                </Text>
              )}
              {outs.map((o, j) => (
                <Text key={`o${j}`} variant="t3-regular" color="neutralSubtle" numberOfLines={2}>
                  <Text variant="t3-medium" color="neutralMuted" tabular>
                    외출 {o.outStart}~{o.outEnd}
                  </Text>
                  {o.reason ? ` · ${o.reason}` : ''}
                </Text>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** 태블릿 — 월–일 7칸 격자 */
function WeekGrid({ slots }: { slots: ScheduleSlots }) {
  return (
    <View style={s.grid}>
      {WEEK_DAYS.map((d, i) => {
        const att = daySlots(slots.attendance, d.value);
        const outs = dayOutings(slots.outings, d.value);
        return (
          <View
            key={d.value}
            style={[s.gridCol, i > 0 && s.gridColBorder]}
            accessible
            accessibilityLabel={`${DAY_FULL[d.value]} ${
              att.length ? att.map((a) => `${a.startTime}부터 ${a.endTime}까지`).join(', ') : '등원 안 함'
            }${outs.length ? `, 외출 ${outs.map((o) => `${o.outStart}~${o.outEnd} ${o.reason ?? ''}`).join(', ')}` : ''}`}>
            <View style={s.gridHead}>
              <Text variant="t3-bold" color={dayTone(d.value)}>
                {d.label}
              </Text>
            </View>
            <View style={s.gridBody}>
              {att.length ? (
                att.map((a, j) => (
                  <View key={j} style={{ alignItems: 'center' }}>
                    <Text variant="t4-bold" tabular>
                      {a.startTime}
                    </Text>
                    <Text variant="t3-regular" color="neutralSubtle" tabular>
                      ~{a.endTime}
                    </Text>
                  </View>
                ))
              ) : (
                <Text variant="t4-regular" color="placeholder" align="center">
                  —
                </Text>
              )}
              {outs.map((o, j) => (
                <View key={`o${j}`} style={s.outChip}>
                  <Text variant="t1-bold" color="neutralMuted" tabular align="center">
                    {o.outStart}~{o.outEnd}
                  </Text>
                  {o.reason ? (
                    <Text variant="t1-regular" color="neutralSubtle" numberOfLines={2} align="center">
                      {o.reason}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  table: {
    borderRadius: radius.r4,
    borderWidth: 1,
    borderColor: color.stroke.neutralSubtle,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.x3,
    minHeight: 48,
    paddingHorizontal: space.x4,
    paddingVertical: space.x3,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: color.stroke.neutralSubtle },
  dayCol: { width: 24 },
  grid: {
    flexDirection: 'row',
    borderRadius: radius.r4,
    borderWidth: 1,
    borderColor: color.stroke.neutralSubtle,
    overflow: 'hidden',
  },
  gridCol: { flex: 1, minWidth: 0 },
  gridColBorder: { borderLeftWidth: 1, borderLeftColor: color.stroke.neutralSubtle },
  gridHead: {
    alignItems: 'center',
    paddingVertical: space.x2,
    backgroundColor: color.bg.layerFill,
  },
  gridBody: { alignItems: 'stretch', gap: space.x2, paddingHorizontal: space.x1, paddingVertical: space.x3, minHeight: 72 },
  outChip: {
    borderRadius: radius.r2,
    backgroundColor: color.bg.neutralWeak,
    paddingHorizontal: space.x1,
    paddingVertical: space.x1,
    gap: space.x0_5,
  },
});
