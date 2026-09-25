import { Plus, Trash2 } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Button, color, Press, radius, space, Text, TextField } from '@/design';
import type { AttendanceSlot, OutingSlot } from '@/lib/api/student-plan';

import { DAY_FULL, durationLabel, isRangeValid, WEEK_DAYS } from './format';
import { TimeRange } from './time-picker';

// 등하원·학원 외출 편집기 — 웹 ScheduleSlotsEditor variant="portal" 과 같은 구성:
//  등하원 시간(요일 원형 버튼 → 요일별 시간 카드) · 학원·외출 일정(외출 카드 + "외출 추가").

export const DEFAULT_ATTENDANCE = { startTime: '09:00', endTime: '22:00' };
export const DEFAULT_OUTING: OutingSlot = { dayOfWeek: 1, outStart: '18:00', outEnd: '20:00', reason: '' };

export function ScheduleSlotsEditor({
  attendance,
  outings,
  onAttendanceChange,
  onOutingsChange,
  showErrors = false,
  disabled = false,
}: {
  attendance: AttendanceSlot[];
  outings: OutingSlot[];
  onAttendanceChange: (next: AttendanceSlot[]) => void;
  onOutingsChange: (next: OutingSlot[]) => void;
  /** 제출을 한 번 시도한 뒤부터 시간 순서 오류를 표시 */
  showErrors?: boolean;
  disabled?: boolean;
}) {
  const attByDay = new Map(attendance.map((a) => [a.dayOfWeek, a]));
  const selectedDays = WEEK_DAYS.filter((d) => attByDay.has(d.value));

  const toggleDay = (day: number) => {
    if (attByDay.has(day)) onAttendanceChange(attendance.filter((a) => a.dayOfWeek !== day));
    else onAttendanceChange([...attendance, { dayOfWeek: day, ...DEFAULT_ATTENDANCE }]);
  };
  const setAttTime = (day: number, field: 'startTime' | 'endTime', value: string) =>
    onAttendanceChange(attendance.map((a) => (a.dayOfWeek === day ? { ...a, [field]: value } : a)));
  const setOuting = (idx: number, patch: Partial<OutingSlot>) =>
    onOutingsChange(outings.map((o, i) => (i === idx ? { ...o, ...patch } : o)));

  return (
    <View style={{ gap: space.x9 }}>
      {/* 등하원 */}
      <View>
        <GroupHeader title="등하원 시간" description="등원하는 요일을 고르고 시간을 정해 주세요" />
        <View style={[s.dayRow, { marginTop: space.x4 }]} accessibilityLabel="등원 요일">
          {WEEK_DAYS.map((d) => {
            const on = attByDay.has(d.value);
            return (
              <View key={d.value} style={s.dayCell}>
                <Press
                  onPress={() => toggleDay(d.value)}
                  disabled={disabled}
                  scale={0.92}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on, disabled }}
                  accessibilityLabel={DAY_FULL[d.value]}
                  style={[s.dayCircle, { backgroundColor: on ? color.bg.brandSolid : color.bg.neutralWeak }]}>
                  <Text variant="t5-bold" color={on ? 'staticWhite' : 'neutralMuted'}>
                    {d.label}
                  </Text>
                </Press>
              </View>
            );
          })}
        </View>

        {selectedDays.length === 0 ? (
          <View style={[s.fill, s.emptyHint]}>
            <Text variant="t4-regular" color="neutralSubtle" align="center">
              요일을 고르면 시간을 정할 수 있어요
            </Text>
          </View>
        ) : (
          <View style={{ marginTop: space.x4, gap: space.x2 }}>
            {selectedDays.map((d) => {
              const slot = attByDay.get(d.value)!;
              const dur = durationLabel(slot.startTime, slot.endTime);
              const bad = showErrors && !isRangeValid(slot.startTime, slot.endTime);
              return (
                <View key={d.value} style={s.fill}>
                  <View style={s.cardHead}>
                    <Text variant="t5-bold">{DAY_FULL[d.value]}</Text>
                    {dur && (
                      <Text variant="t3-regular" color="neutralSubtle" tabular>
                        {dur}
                      </Text>
                    )}
                  </View>
                  <TimeRange
                    start={slot.startTime}
                    end={slot.endTime}
                    startLabel={`${DAY_FULL[d.value]} 등원 시간`}
                    endLabel={`${DAY_FULL[d.value]} 하원 시간`}
                    disabled={disabled}
                    invalid={bad}
                    onStart={(v) => setAttTime(d.value, 'startTime', v)}
                    onEnd={(v) => setAttTime(d.value, 'endTime', v)}
                  />
                  {bad && (
                    <Text variant="t3-regular" color="critical" style={{ marginTop: space.x2 }}>
                      하원 시간은 등원 시간보다 늦어야 해요
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* 학원·외출 */}
      <View>
        <GroupHeader
          title="학원·외출 일정"
          description="학원처럼 정기적으로 자리를 비우는 시간이 있으면 알려 주세요"
        />

        {outings.length > 0 && (
          <View style={{ marginTop: space.x4, gap: space.x2 }}>
            {outings.map((o, i) => {
              const bad = showErrors && !isRangeValid(o.outStart, o.outEnd);
              return (
                <View key={i} style={s.fill}>
                  <View style={s.cardHead}>
                    <Text variant="t5-bold" tabular>
                      외출 {i + 1}
                    </Text>
                    <Press
                      onPress={() => onOutingsChange(outings.filter((_, j) => j !== i))}
                      disabled={disabled}
                      scale={0}
                      pressedBg
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={`외출 ${i + 1} 삭제`}
                      style={s.iconBtn}>
                      <Trash2 color={color.fg.neutralSubtle} size={18} strokeWidth={2} />
                    </Press>
                  </View>
                  <View style={s.dayRow} accessibilityRole="radiogroup" accessibilityLabel="외출 요일">
                    {WEEK_DAYS.map((d) => {
                      const on = o.dayOfWeek === d.value;
                      return (
                        <View key={d.value} style={s.dayCell}>
                          <Press
                            onPress={() => setOuting(i, { dayOfWeek: d.value })}
                            disabled={disabled}
                            scale={0.92}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: on, disabled }}
                            accessibilityLabel={DAY_FULL[d.value]}
                            style={[s.dayPill, { backgroundColor: on ? color.bg.brandSolid : color.bg.layerDefault }]}>
                            <Text variant="t4-bold" color={on ? 'staticWhite' : 'neutralMuted'}>
                              {d.label}
                            </Text>
                          </Press>
                        </View>
                      );
                    })}
                  </View>
                  <View style={{ marginTop: space.x2 }}>
                    <TimeRange
                      start={o.outStart}
                      end={o.outEnd}
                      startLabel={`외출 ${i + 1} 나가는 시간`}
                      endLabel={`외출 ${i + 1} 돌아오는 시간`}
                      disabled={disabled}
                      invalid={bad}
                      onStart={(v) => setOuting(i, { outStart: v })}
                      onEnd={(v) => setOuting(i, { outEnd: v })}
                    />
                    {bad && (
                      <Text variant="t3-regular" color="critical" style={{ marginTop: space.x2 }}>
                        돌아오는 시간은 나가는 시간보다 늦어야 해요
                      </Text>
                    )}
                  </View>
                  <View style={{ marginTop: space.x2 }}>
                    <TextField
                      value={o.reason ?? ''}
                      onChangeText={(v) => setOuting(i, { reason: v })}
                      placeholder="사유 (예: 수학학원)"
                      accessibilityLabel="외출 사유"
                      maxLength={100}
                      editable={!disabled}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <Button
          variant="gray"
          size="lg"
          block
          icon={Plus}
          disabled={disabled}
          onPress={() => onOutingsChange([...outings, { ...DEFAULT_OUTING }])}
          style={{ marginTop: space.x4 }}>
          외출 추가
        </Button>
      </View>
    </View>
  );
}

function GroupHeader({ title, description }: { title: string; description: string }) {
  return (
    <View style={{ gap: space.x0_5 }}>
      <Text variant="t6-bold" accessibilityRole="header">
        {title}
      </Text>
      <Text variant="t4-regular" color="neutralSubtle">
        {description}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  dayRow: { flexDirection: 'row', marginHorizontal: -2 },
  dayCell: { flex: 1, paddingHorizontal: 2, alignItems: 'center' },
  dayCircle: {
    width: '100%',
    maxWidth: 44,
    aspectRatio: 1,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPill: {
    width: '100%',
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: { borderRadius: radius.r4, backgroundColor: color.bg.layerFill, padding: space.x4 },
  emptyHint: { marginTop: space.x4, paddingVertical: space.x3_5 },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.x2,
    marginBottom: space.x3,
    minHeight: 24,
  },
  iconBtn: {
    width: 36,
    height: 36,
    marginVertical: -6,
    marginRight: -6,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
