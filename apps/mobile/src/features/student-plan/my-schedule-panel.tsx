import { Check, Plus, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  color,
  Columns,
  ListRow,
  Press,
  radius,
  Section,
  Segmented,
  space,
  Text,
  TextField,
  toast,
} from '@/design';
import {
  saveStudentPlan,
  type CalendarEvent,
  type PlanItem,
  type StudentScheduleResponse,
  type TimetableEntry,
} from '@/lib/api/student-plan';

import {
  addDaysStr,
  DAY_LABELS,
  dotColor,
  dowOf,
  EVENT_DOT,
  EVENT_TYPE_LABEL,
  eventsOn,
  fmtDateLong,
  fmtMonthDay,
  newPlanId,
} from './format';

// 웹 포털 MySchedulePanel 과 같은 구성: 오늘 / 내일 / 이번 주 → 그날 일정(시간표 + 학교·개인 일정) + 공부 계획.
// 태블릿: 왼쪽 오늘/내일(일정 + 공부 계획), 오른쪽 이번 주 일정을 항상 함께 보여 준다.

type PlanDay = 'today' | 'tomorrow';
type ViewKey = PlanDay | 'week';

const PHONE_OPTIONS: { value: ViewKey; label: string }[] = [
  { value: 'today', label: '오늘' },
  { value: 'tomorrow', label: '내일' },
  { value: 'week', label: '이번 주' },
];
const TABLET_OPTIONS: { value: ViewKey; label: string }[] = PHONE_OPTIONS.slice(0, 2);

const SAVE_DELAY = 600;

export function MySchedulePanel({ data, isTablet }: { data: StudentScheduleResponse; isTablet: boolean }) {
  const [view, setView] = useState<ViewKey>('today');
  const planDay: PlanDay = view === 'tomorrow' ? 'tomorrow' : 'today';
  const plans = usePlanEditor(data);

  const dayPanel = <DayPanel data={data} plan={plans.get(planDay)} onChange={plans.update} saving={plans.saving} />;

  if (isTablet) {
    return (
      <Columns
        left={
          <>
            <Segmented options={TABLET_OPTIONS} value={planDay} onChange={setView} />
            {dayPanel}
          </>
        }
        right={<WeekSection data={data} />}
      />
    );
  }

  return (
    <View style={{ gap: space.x3 }}>
      <Segmented options={PHONE_OPTIONS} value={view} onChange={setView} />
      {view === 'week' ? <WeekSection data={data} /> : dayPanel}
    </View>
  );
}

// ── 공부 계획 편집 상태 ────────────────────────────────────────────────────
// 웹처럼 오늘·내일 두 날짜의 목록을 화면 상태로 들고, 바뀔 때마다 날짜별로 0.6초 뒤 저장(항목 전체 교체).
// 편집한 날짜는 이 화면이 떠 있는 동안 서버 재조회 값보다 로컬 값을 우선한다.

function usePlanEditor(data: StudentScheduleResponse) {
  const [edits, setEdits] = useState<Record<string, PlanItem[]>>({});
  const [saving, setSaving] = useState(false);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inflight = useRef(0);

  const get = (day: PlanDay) => {
    const plan = data.plans[day];
    return { date: plan.date, items: edits[plan.date] ?? plan.items };
  };

  const update = (date: string, items: PlanItem[]) => {
    setEdits((prev) => ({ ...prev, [date]: items }));
    setSaving(true);
    const prev = timers.current.get(date);
    if (prev) clearTimeout(prev);
    timers.current.set(
      date,
      setTimeout(() => {
        timers.current.delete(date);
        inflight.current += 1;
        saveStudentPlan(date, items)
          .catch((e: unknown) => toast(e instanceof Error ? e.message : '저장하지 못했어요', 'error'))
          .finally(() => {
            inflight.current -= 1;
            if (inflight.current === 0 && timers.current.size === 0) setSaving(false);
          });
      }, SAVE_DELAY),
    );
  };

  return { get, update, saving };
}

// ── 오늘/내일: 일정 + 공부 계획 ───────────────────────────────────────────

function DayPanel({
  data,
  plan,
  onChange,
  saving,
}: {
  data: StudentScheduleResponse;
  plan: { date: string; items: PlanItem[] };
  onChange: (date: string, items: PlanItem[]) => void;
  saving: boolean;
}) {
  const { date, items } = plan;
  const [newText, setNewText] = useState('');
  const update = (next: PlanItem[]) => onChange(date, next);

  const addItem = () => {
    const text = newText.trim();
    if (!text) return;
    update([...items, { id: newPlanId(), text, done: false, colorCode: 'blue' }]);
    setNewText('');
  };

  const doneCount = items.filter((it) => it.done).length;
  const dow = dowOf(date);

  return (
    <View style={{ gap: space.x3 }}>
      <Section title={fmtDateLong(date)} flush>
        <DayRows
          entries={data.timetable.filter((t) => t.dayOfWeek === dow)}
          events={eventsOn(data.events, date)}
        />
      </Section>

      <Section
        title="공부 계획"
        description={items.length > 0 ? `${items.length}개 중 ${doneCount}개 완료` : undefined}
        action={
          saving ? (
            <Text variant="t3-regular" color="neutralSubtle">
              저장 중…
            </Text>
          ) : undefined
        }>
        {items.length === 0 ? (
          <Text variant="t4-regular" color="neutralSubtle" style={{ paddingBottom: space.x3 }}>
            아직 계획이 없어요. 아래에서 추가해 보세요.
          </Text>
        ) : (
          <View style={{ marginHorizontal: -space.x2, marginBottom: space.x3 }}>
            {items.map((it, i) => (
              <View key={it.id || `i${i}`} style={s.planRow}>
                <Press
                  onPress={() => update(items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}
                  scale={0}
                  pressedBg
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: it.done }}
                  accessibilityLabel={it.text || '공부 계획'}
                  style={s.planCheck}>
                  <View style={[s.box, it.done && s.boxOn]}>
                    {it.done && <Check color={color.palette.staticWhite} size={16} strokeWidth={3} />}
                  </View>
                  <Text
                    variant="t5-regular"
                    color={it.done ? 'neutralSubtle' : 'neutral'}
                    style={[{ flex: 1, minWidth: 0 }, it.done && s.strike]}>
                    {it.text}
                  </Text>
                </Press>
                <Press
                  onPress={() => update(items.filter((_, j) => j !== i))}
                  scale={0}
                  pressedBg
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityLabel={`${it.text || '공부 계획'} 삭제`}
                  style={s.iconBtn}>
                  <X color={color.fg.placeholder} size={18} strokeWidth={2.2} />
                </Press>
              </View>
            ))}
          </View>
        )}

        <View style={s.addRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <TextField
              value={newText}
              onChangeText={setNewText}
              placeholder="예: 수학 문제집 30p"
              maxLength={200}
              accessibilityLabel="공부 계획 추가"
              returnKeyType="done"
              submitBehavior="submit"
              onSubmitEditing={addItem}
            />
          </View>
          <Button
            variant="weak"
            size="lg"
            icon={Plus}
            accessibilityLabel="추가"
            disabled={!newText.trim()}
            onPress={addItem}
          />
        </View>
      </Section>
    </View>
  );
}

function ColorBar({ tint }: { tint: string }) {
  return <View style={[s.bar, { backgroundColor: tint }]} />;
}

function DayRows({ entries, events }: { entries: TimetableEntry[]; events: CalendarEvent[] }) {
  if (entries.length === 0 && events.length === 0) {
    return (
      <Text variant="t4-regular" color="neutralSubtle" style={s.emptyDay}>
        등록된 일정이 없어요
      </Text>
    );
  }
  return (
    <>
      {events.map((ev) => (
        <ListRow
          key={ev.id}
          leading={<ColorBar tint={EVENT_DOT} />}
          title={ev.title}
          trailing={<Badge>{EVENT_TYPE_LABEL[ev.type] ?? ev.type}</Badge>}
        />
      ))}
      {entries.map((en) => (
        <ListRow
          key={en.id}
          leading={<ColorBar tint={dotColor(en.colorCode)} />}
          title={en.subject}
          description={en.details ?? undefined}
          trailing={
            <Text variant="t4-regular" color="neutralSubtle" tabular>
              {en.allDay ? '종일' : `${en.startTime}–${en.endTime}`}
            </Text>
          }
        />
      ))}
    </>
  );
}

// ── 이번 주 ──────────────────────────────────────────────────────────────

function WeekSection({ data }: { data: StudentScheduleResponse }) {
  const weekDates = Array.from({ length: 7 }, (_, i) => addDaysStr(data.weekStart, i));
  return (
    <Section
      title="이번 주 일정"
      description={`${fmtMonthDay(weekDates[0])} – ${fmtMonthDay(weekDates[6])}`}
      flush>
      {weekDates.map((dateStr) => {
        const dow = dowOf(dateStr);
        const isToday = dateStr === data.todayStr;
        return (
          <View key={dateStr} style={s.weekRow}>
            <View style={s.weekDay}>
              <Text
                variant="t3-bold"
                color={isToday ? 'brand' : dow === 0 ? 'critical' : dow === 6 ? 'informative' : 'neutralSubtle'}>
                {DAY_LABELS[dow]}
              </Text>
              <View
                style={[s.dateCircle, isToday && { backgroundColor: color.bg.brandSolid }]}
                accessibilityLabel={isToday ? '오늘' : undefined}>
                <Text variant="t5-bold" color={isToday ? 'staticWhite' : 'neutral'} tabular>
                  {Number(dateStr.slice(8))}
                </Text>
              </View>
            </View>
            <View style={s.weekBody}>
              <CompactSchedule
                entries={data.timetable.filter((t) => t.dayOfWeek === dow)}
                events={eventsOn(data.events, dateStr)}
              />
            </View>
          </View>
        );
      })}
    </Section>
  );
}

function CompactSchedule({ entries, events }: { entries: TimetableEntry[]; events: CalendarEvent[] }) {
  if (entries.length === 0 && events.length === 0) {
    return (
      <Text variant="t4-regular" color="placeholder">
        일정 없음
      </Text>
    );
  }
  return (
    <View style={{ gap: space.x2 }}>
      {events.map((ev) => (
        <View key={ev.id} style={s.compactRow}>
          <View style={[s.dot, { backgroundColor: EVENT_DOT }]} />
          <Text variant="t5-medium" numberOfLines={1} style={{ flexShrink: 1 }}>
            {ev.title}
          </Text>
          <Badge style={{ marginLeft: 'auto', alignSelf: 'center' }}>
            {EVENT_TYPE_LABEL[ev.type] ?? ev.type}
          </Badge>
        </View>
      ))}
      {entries.map((en) => (
        <View key={en.id} style={s.compactRow}>
          <View style={[s.dot, { backgroundColor: dotColor(en.colorCode) }]} />
          <Text variant="t5-medium" numberOfLines={1} style={{ flexShrink: 1 }}>
            {en.subject}
            {en.details ? (
              <Text variant="t3-regular" color="neutralSubtle">
                {'  '}
                {en.details}
              </Text>
            ) : null}
          </Text>
          <Text variant="t3-regular" color="neutralSubtle" tabular style={s.compactTime}>
            {en.allDay ? '종일' : `${en.startTime}–${en.endTime}`}
          </Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { width: space.x1, minHeight: 36, alignSelf: 'stretch', borderRadius: radius.full },
  emptyDay: { paddingHorizontal: space.x5, paddingBottom: space.x3, paddingTop: space.x1 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: space.x1 },
  planCheck: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    minHeight: 44,
    paddingHorizontal: space.x2,
    paddingVertical: space.x1_5,
    borderRadius: radius.r3_5,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.r1_5,
    borderWidth: 1.5,
    borderColor: color.stroke.neutralMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: color.bg.brandSolid, borderColor: color.bg.brandSolid },
  strike: { textDecorationLine: 'line-through', textDecorationColor: color.fg.placeholder },
  iconBtn: { width: 36, height: 36, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: space.x2 },
  weekRow: {
    flexDirection: 'row',
    gap: space.x3_5,
    marginHorizontal: space.x2,
    paddingHorizontal: space.x3,
    paddingVertical: space.x3,
    borderRadius: radius.r4,
  },
  weekDay: { width: space.x9, alignItems: 'center', flexShrink: 0 },
  dateCircle: {
    marginTop: space.x1,
    width: space.x8,
    height: space.x8,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekBody: { flex: 1, minWidth: 0, alignSelf: 'center', paddingVertical: space.x1 },
  compactRow: { flexDirection: 'row', alignItems: 'center', gap: space.x2 },
  dot: { width: space.x2, height: space.x2, borderRadius: radius.full, flexShrink: 0 },
  compactTime: { marginLeft: 'auto', paddingLeft: space.x2, flexShrink: 0 },
});
