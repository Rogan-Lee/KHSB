import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomSheet, color, Press, radius, space, Text } from '@/design';

import { fmtDateDow, todayKSTStr } from './format';

// 날짜 입력 — 웹 포털의 <input type="date"> 자리. 필드를 누르면 바텀시트 월 달력에서 고른다(고르면 바로 닫힘).

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');

type YM = { y: number; m: number }; // m: 1–12

function ymOf(date: string): YM {
  const [y, m] = date.split('-').map(Number);
  return { y, m };
}

function shiftMonth({ y, m }: YM, n: number): YM {
  const idx = y * 12 + (m - 1) + n;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

/** 달력 칸 — 앞쪽 빈칸(null) + 1..말일, 7칸씩 */
function monthWeeks({ y, m }: YM): (string | null)[][] {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: first }, () => null),
    ...Array.from({ length: days }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function DateField({
  label,
  value,
  onChange,
  min,
  max,
  disabled = false,
}: {
  label: string;
  /** "YYYY-MM-DD" */
  value: string;
  onChange: (value: string) => void;
  /** 고를 수 있는 첫날 "YYYY-MM-DD" */
  min?: string;
  /** 고를 수 있는 마지막 날 "YYYY-MM-DD" */
  max?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<YM>(() => ymOf(value || todayKSTStr()));
  const today = todayKSTStr();

  const show = () => {
    setMonth(ymOf(value || today));
    setOpen(true);
  };

  const monthKey = (ym: YM) => ym.y * 12 + ym.m;
  const canPrev = !min || monthKey(shiftMonth(month, -1)) >= monthKey(ymOf(min));
  const canNext = !max || monthKey(shiftMonth(month, 1)) <= monthKey(ymOf(max));
  const isOff = (d: string) => (!!min && d < min) || (!!max && d > max);

  return (
    <>
      <Press
        onPress={show}
        disabled={disabled}
        scale={0}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value ? fmtDateDow(value) : '선택 안 함'}`}
        accessibilityState={{ disabled, expanded: open }}
        style={[
          s.box,
          open ? s.boxOpen : null,
          { backgroundColor: disabled ? color.bg.disabled : color.bg.layerDefault },
        ]}>
        <Text
          variant="t5-regular"
          tabular
          color={!value ? 'placeholder' : disabled ? 'disabled' : 'neutral'}
          numberOfLines={1}
          style={{ flex: 1 }}>
          {value ? `${fmtDateDow(value)}${value === today ? ' · 오늘' : ''}` : '날짜 선택'}
        </Text>
        <CalendarDays color={color.fg.neutralSubtle} size={18} strokeWidth={2} />
      </Press>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={label}>
        <View style={s.stepper}>
          <Press
            onPress={() => setMonth((mm) => shiftMonth(mm, -1))}
            disabled={!canPrev}
            scale={0}
            pressedBg
            accessibilityLabel="이전 달"
            accessibilityState={{ disabled: !canPrev }}
            style={s.stepBtn}>
            <ChevronLeft color={canPrev ? color.fg.neutral : color.fg.disabled} size={22} strokeWidth={2.2} />
          </Press>
          <Text variant="t6-bold" tabular align="center" style={{ flex: 1 }} accessibilityRole="header">
            {month.y}년 {month.m}월
          </Text>
          <Press
            onPress={() => setMonth((mm) => shiftMonth(mm, 1))}
            disabled={!canNext}
            scale={0}
            pressedBg
            accessibilityLabel="다음 달"
            accessibilityState={{ disabled: !canNext }}
            style={s.stepBtn}>
            <ChevronRight color={canNext ? color.fg.neutral : color.fg.disabled} size={22} strokeWidth={2.2} />
          </Press>
        </View>

        <View>
          <View style={s.week}>
            {WEEKDAYS.map((w) => (
              <View key={w} style={s.cell}>
                <Text variant="t3-medium" color="neutralSubtle">
                  {w}
                </Text>
              </View>
            ))}
          </View>
          {monthWeeks(month).map((week, wi) => (
            <View key={wi} style={s.week}>
              {week.map((d, di) =>
                d ? (
                  <DayCell
                    key={d}
                    date={d}
                    selected={d === value}
                    today={d === today}
                    off={isOff(d)}
                    onPress={() => {
                      onChange(d);
                      setOpen(false);
                    }}
                  />
                ) : (
                  <View key={`e${di}`} style={s.cell} />
                )
              )}
            </View>
          ))}
        </View>
      </BottomSheet>
    </>
  );
}

function DayCell({
  date,
  selected,
  today,
  off,
  onPress,
}: {
  date: string;
  selected: boolean;
  today: boolean;
  off: boolean;
  onPress: () => void;
}) {
  const day = Number(date.slice(8));
  return (
    <View style={s.cell}>
      <Press
        onPress={onPress}
        disabled={off}
        scale={0}
        pressedBg={!selected}
        accessibilityRole="button"
        accessibilityLabel={`${fmtDateDow(date)}${today ? ', 오늘' : ''}`}
        accessibilityState={{ selected, disabled: off }}
        style={[s.day, selected && s.dayOn]}>
        <Text
          variant={selected || today ? 't5-bold' : 't5-medium'}
          color={selected ? 'neutralInverted' : off ? 'disabled' : today ? 'brand' : 'neutral'}
          tabular>
          {day}
        </Text>
      </Press>
    </View>
  );
}

const s = StyleSheet.create({
  box: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2,
    paddingHorizontal: space.x4,
    borderRadius: radius.r3,
    borderWidth: 1,
    borderColor: color.stroke.neutralWeak,
  },
  boxOpen: { borderWidth: 2, borderColor: color.stroke.neutralContrast, paddingHorizontal: space.x4 - 1 },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  week: { flexDirection: 'row' },
  cell: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' },
  day: { width: 44, maxWidth: '100%', height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: color.bg.neutralInverted },
});
