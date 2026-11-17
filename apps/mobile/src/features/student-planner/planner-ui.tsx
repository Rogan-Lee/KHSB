import { ArrowRight, Check, ChevronLeft, ChevronRight, History, Plus, Trash2 } from 'lucide-react-native';
import { memo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, type TextInput } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import {
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  color,
  Notice,
  Press,
  ProgressBar,
  radius,
  Section,
  space,
  Text,
  TextField,
} from '@/design';
import { addDaysStr, DAY_LABELS, dotColor, dowOf, fmtDateLong, fmtMonthDay } from '@/features/student-plan/format';
import type { PlanItem } from '@/lib/api/student-plan';

import {
  carryOver,
  DURATIONS,
  fmtMinutes,
  isEditable,
  leftovers,
  moveItem,
  newItemId,
  ordered,
  progressOf,
  removeItem,
  replaceItem,
  SUBJECTS,
  toggleItem,
  type Planner,
} from './planner';

// ── 주 이동 + 요일 칸 ──────────────────────────────────────────────────────

export function WeekStrip({
  p,
  weekStart,
  selected,
  onSelect,
}: {
  p: Planner;
  weekStart: string;
  selected: string;
  onSelect: (date: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDaysStr(weekStart, i));
  const thisWeek = days.includes(p.today);
  return (
    <Section>
      <View style={s.weekHead}>
        <Press
          onPress={() => onSelect(addDaysStr(weekStart, -7))}
          scale={0}
          pressedBg
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="지난주"
          style={s.navBtn}>
          <ChevronLeft color={color.fg.neutralSubtle} size={20} strokeWidth={2.2} />
        </Press>
        <Text variant="t5-bold" tabular style={{ flex: 1, textAlign: 'center' }}>
          {fmtMonthDay(days[0])} – {fmtMonthDay(days[6])}
        </Text>
        {!thisWeek && (
          <Press onPress={() => onSelect(p.today)} scale={0} pressedBg style={s.todayBtn} accessibilityRole="button">
            <Text variant="t3-bold" color="brand">
              오늘
            </Text>
          </Press>
        )}
        <Press
          onPress={() => onSelect(addDaysStr(weekStart, 7))}
          scale={0}
          pressedBg
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="다음 주"
          style={s.navBtn}>
          <ChevronRight color={color.fg.neutralSubtle} size={20} strokeWidth={2.2} />
        </Press>
      </View>

      <View style={s.days}>
        {days.map((d) => {
          const on = d === selected;
          const isToday = d === p.today;
          const dow = dowOf(d);
          const prog = progressOf(p.itemsOf(d));
          return (
            <Press
              key={d}
              onPress={() => onSelect(d)}
              scale={0.94}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${fmtDateLong(d)}${isToday ? ' 오늘' : ''}, 계획 ${prog.total}개 중 ${prog.done}개 완료`}
              style={s.day}>
              <Text
                variant="t3-medium"
                color={isToday ? 'brand' : dow === 0 ? 'critical' : dow === 6 ? 'informative' : 'neutralSubtle'}>
                {DAY_LABELS[dow]}
              </Text>
              <View style={[s.dateCircle, on && { backgroundColor: color.bg.neutralInverted }]}>
                <Text variant="t5-bold" tabular color={on ? 'neutralInverted' : isToday ? 'brand' : 'neutral'}>
                  {Number(d.slice(8))}
                </Text>
              </View>
              {/* 달성 막대 — 계획이 없으면 비움 */}
              <View style={[s.dayBar, prog.total === 0 && { backgroundColor: 'transparent' }]}>
                {prog.total > 0 && (
                  <View
                    style={{
                      width: `${Math.round(prog.ratio * 100)}%`,
                      height: '100%',
                      borderRadius: radius.full,
                      backgroundColor: prog.ratio === 1 ? color.bg.positiveSolid : color.bg.brandSolid,
                    }}
                  />
                )}
              </View>
            </Press>
          );
        })}
      </View>
    </Section>
  );
}

// ── 하루 ─────────────────────────────────────────────────────────────────

export function DayPanel({ p, date }: { p: Planner; date: string }) {
  const items = p.itemsOf(date);
  const editable = isEditable(date, p.today);
  const prog = progressOf(items);
  const list = ordered(items);
  const yesterday = addDaysStr(date, -1);
  const left = date === p.today && editable ? leftovers(p, yesterday, date) : [];
  const [editing, setEditing] = useState<PlanItem | null>(null);

  const set = (next: PlanItem[]) => p.commit([{ date, items: next }]);
  const postpone = (id: string) => {
    const days = moveItem(p, date, addDaysStr(date, 1), id);
    if (days && isEditable(days[1].date, p.today)) p.commit(days);
  };

  return (
    <View style={{ gap: space.x3 }}>
      <Section
        title={date === p.today ? `오늘 · ${fmtDateLong(date)}` : fmtDateLong(date)}
        description={
          prog.total === 0
            ? '아직 계획이 없어요'
            : `${prog.total}개 중 ${prog.done}개 완료${prog.minutes ? ` · 목표 ${fmtMinutes(prog.minutes)}` : ''}`
        }
        action={
          p.saving ? (
            <Text variant="t3-regular" color="neutralSubtle">
              저장 중…
            </Text>
          ) : undefined
        }>
        {prog.total > 0 && <ProgressBar value={prog.ratio} tone={prog.ratio === 1 ? 'ok' : 'brand'} />}
      </Section>

      {left.length > 0 && (
        <Notice tone="brand" icon={History} onPress={() => {
          const days = carryOver(p, yesterday, date);
          if (days) p.commit(days);
        }}>
          어제 못 한 계획 {left.length}개 · 눌러서 오늘로 가져오기
        </Notice>
      )}

      {!editable && (
        <Notice tone="gray">지난 7일보다 오래된 계획은 볼 수만 있어요.</Notice>
      )}

      {/* 밀어서 나오는 버튼·줄 배경이 카드 모서리 밖으로 나오지 않게 */}
      <Section flush style={{ overflow: 'hidden' }}>
        {editable && <AddBar onAdd={(it) => set([...items, it])} />}
        {list.length === 0 ? (
          <Text variant="t4-regular" color="neutralSubtle" style={s.empty}>
            {editable ? '할 일을 적고 엔터를 누르면 바로 추가돼요.' : '이날은 계획이 없었어요.'}
          </Text>
        ) : (
          list.map((it) => (
            <PlanRow
              key={it.id}
              item={it}
              editable={editable}
              onToggle={() => set(toggleItem(items, it.id))}
              onPress={() => setEditing(it)}
              onDelete={() => set(removeItem(items, it.id))}
              onPostpone={() => postpone(it.id)}
            />
          ))
        )}
      </Section>

      <EditSheet
        item={editing}
        onClose={() => setEditing(null)}
        onSave={(next) => {
          set(replaceItem(items, next));
          setEditing(null);
        }}
        onDelete={(id) => {
          set(removeItem(items, id));
          setEditing(null);
        }}
        onPostpone={(id) => {
          postpone(id);
          setEditing(null);
        }}
      />
    </View>
  );
}

/** 과목을 골라 두고 연달아 입력 — 엔터마다 추가되고 키보드는 그대로 */
function AddBar({ onAdd }: { onAdd: (item: PlanItem) => void }) {
  const [text, setText] = useState('');
  const [subject, setSubject] = useState<string | null>(null);
  const input = useRef<TextInput>(null);

  const add = () => {
    const t = text.trim();
    if (!t) return;
    const sub = SUBJECTS.find((x) => x.name === subject);
    onAdd({ id: newItemId(), text: t, done: false, colorCode: sub?.color ?? 'blue', ...(sub ? { subject: sub.name } : {}) });
    setText('');
    input.current?.focus();
  };

  return (
    <View style={s.addBar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.subjects}>
        {SUBJECTS.map((sub) => (
          <Chip key={sub.name} size="sm" selected={subject === sub.name} onPress={() => setSubject(subject === sub.name ? null : sub.name)}>
            <View style={s.chipInner}>
              <View style={[s.dot, { backgroundColor: dotColor(sub.color) }]} />
              <Text variant="t3-medium" color={subject === sub.name ? 'neutralInverted' : 'neutral'}>
                {sub.name}
              </Text>
            </View>
          </Chip>
        ))}
      </ScrollView>
      <View style={s.addRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <TextField
            ref={input}
            value={text}
            onChangeText={setText}
            placeholder={subject ? `${subject} 할 일 추가` : '할 일 추가 (예: 수학 문제집 30p)'}
            maxLength={200}
            accessibilityLabel="공부 계획 추가"
            returnKeyType="done"
            submitBehavior="submit"
            onSubmitEditing={add}
          />
        </View>
        <Button variant="weak" size="lg" icon={Plus} accessibilityLabel="추가" disabled={!text.trim()} onPress={add} />
      </View>
    </View>
  );
}

/** 할 일 한 줄 — 체크 · 눌러서 고치기 · 왼쪽으로 밀어 내일로/삭제 */
const PlanRow = memo(function PlanRow({
  item,
  editable,
  onToggle,
  onPress,
  onDelete,
  onPostpone,
}: {
  item: PlanItem;
  editable: boolean;
  onToggle: () => void;
  onPress: () => void;
  onDelete: () => void;
  onPostpone: () => void;
}) {
  const row = (
    <View style={s.row}>
      <Press
        onPress={onToggle}
        disabled={!editable}
        scale={0}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.done, disabled: !editable }}
        accessibilityLabel={item.text}
        style={s.checkHit}>
        <View style={[s.box, item.done && s.boxOn]}>
          {item.done && <Check color={color.palette.staticWhite} size={16} strokeWidth={3} />}
        </View>
      </Press>
      <Press onPress={onPress} disabled={!editable} scale={0} pressedBg style={s.rowBody} accessibilityRole="button" accessibilityHint="눌러서 고치기">
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          {item.subject ? (
            <View style={s.subjectLine}>
              <View style={[s.dot, { backgroundColor: dotColor(item.colorCode) }]} />
              <Text variant="t2-medium" color="neutralSubtle">
                {item.subject}
              </Text>
            </View>
          ) : null}
          <Text variant="t5-regular" color={item.done ? 'neutralSubtle' : 'neutral'} style={item.done && s.strike}>
            {item.text}
          </Text>
        </View>
        {item.duration ? (
          <Text variant="t3-medium" color="neutralSubtle" tabular>
            {fmtMinutes(item.duration)}
          </Text>
        ) : null}
      </Press>
    </View>
  );

  if (!editable) return row;
  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={(_p, _t, methods) => (
        <View style={s.actions}>
          <Press
            onPress={() => {
              methods.close();
              onPostpone();
            }}
            scale={0}
            accessibilityRole="button"
            accessibilityLabel="내일로 미루기"
            style={[s.action, { backgroundColor: color.bg.neutralSolid }]}>
            <ArrowRight color={color.palette.staticWhite} size={18} strokeWidth={2.2} />
            <Text variant="t2-bold" color="staticWhite">
              내일로
            </Text>
          </Press>
          <Press
            onPress={() => {
              methods.close();
              onDelete();
            }}
            scale={0}
            accessibilityRole="button"
            accessibilityLabel="삭제"
            style={[s.action, { backgroundColor: color.bg.criticalSolid }]}>
            <Trash2 color={color.palette.staticWhite} size={18} strokeWidth={2.2} />
            <Text variant="t2-bold" color="staticWhite">
              삭제
            </Text>
          </Press>
        </View>
      )}>
      {row}
    </ReanimatedSwipeable>
  );
});

function EditSheet({
  item,
  onClose,
  onSave,
  onDelete,
  onPostpone,
}: {
  item: PlanItem | null;
  onClose: () => void;
  onSave: (item: PlanItem) => void;
  onDelete: (id: string) => void;
  onPostpone: (id: string) => void;
}) {
  // 열 때마다 그 항목으로 초기화 (렌더 중 파생 상태)
  const [draft, setDraft] = useState<PlanItem | null>(item);
  const [shown, setShown] = useState<string | null>(item?.id ?? null);
  if ((item?.id ?? null) !== shown) {
    setShown(item?.id ?? null);
    if (item) setDraft(item);
  }
  const d = draft;

  return (
    <BottomSheet
      open={!!item}
      onClose={onClose}
      title="계획 고치기"
      footer={
        d ? (
          <>
            <Button variant="gray" size="xl" style={{ flex: 1 }} onPress={() => onDelete(d.id)}>
              삭제
            </Button>
            <Button
              size="xl"
              style={{ flex: 2 }}
              disabled={!d.text.trim()}
              onPress={() => onSave({ ...d, text: d.text.trim() })}>
              저장
            </Button>
          </>
        ) : null
      }>
      {d && (
        <View style={{ gap: space.x5 }}>
          <TextField
            label="할 일"
            value={d.text}
            onChangeText={(text) => setDraft({ ...d, text })}
            maxLength={200}
            multiline
            minHeight={64}
          />
          <View style={{ gap: space.x2 }}>
            <Text variant="t4-bold">과목</Text>
            <ChipGroup>
              {SUBJECTS.map((sub) => {
                const on = d.subject === sub.name;
                return (
                  <Chip
                    key={sub.name}
                    size="sm"
                    selected={on}
                    onPress={() =>
                      setDraft(
                        on
                          ? { ...d, subject: undefined, colorCode: 'blue' }
                          : { ...d, subject: sub.name, colorCode: sub.color },
                      )
                    }>
                    {sub.name}
                  </Chip>
                );
              })}
            </ChipGroup>
          </View>
          <View style={{ gap: space.x2 }}>
            <Text variant="t4-bold">목표 시간</Text>
            <ChipGroup>
              <Chip size="sm" selected={!d.duration} onPress={() => setDraft({ ...d, duration: undefined })}>
                없음
              </Chip>
              {DURATIONS.map((m) => (
                <Chip key={m} size="sm" selected={d.duration === m} onPress={() => setDraft({ ...d, duration: m })}>
                  {fmtMinutes(m)}
                </Chip>
              ))}
            </ChipGroup>
          </View>
          <Button variant="weak" size="lg" icon={ArrowRight} onPress={() => onPostpone(d.id)}>
            내일로 미루기
          </Button>
        </View>
      )}
    </BottomSheet>
  );
}

// ── 일주일 ───────────────────────────────────────────────────────────────

export function WeekPanel({
  p,
  weekStart,
  onOpenDay,
}: {
  p: Planner;
  weekStart: string;
  onOpenDay: (date: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDaysStr(weekStart, i));
  const all = days.flatMap((d) => p.itemsOf(d));
  const prog = progressOf(all);

  // 과목별 목표 시간
  const bySubject = new Map<string, number>();
  ordered(all).forEach((it) => {
    if (!it.duration) return;
    const key = it.subject ?? '과목 없음';
    bySubject.set(key, (bySubject.get(key) ?? 0) + it.duration);
  });

  return (
    <View style={{ gap: space.x3 }}>
      <Section
        title="이번 주 계획"
        description={
          prog.total === 0
            ? '아직 계획이 없어요'
            : `${prog.total}개 중 ${prog.done}개 완료 (${Math.round(prog.ratio * 100)}%)${
                prog.minutes ? ` · 목표 ${fmtMinutes(prog.minutes)}` : ''
              }`
        }>
        {prog.total > 0 && <ProgressBar value={prog.ratio} tone={prog.ratio === 1 ? 'ok' : 'brand'} />}
        {bySubject.size > 0 && (
          <View style={s.subjectTotals}>
            {[...bySubject.entries()].map(([name, min]) => {
              const sub = SUBJECTS.find((x) => x.name === name);
              return (
                <View key={name} style={s.subjectLine}>
                  <View style={[s.dot, { backgroundColor: sub ? dotColor(sub.color) : color.fg.placeholder }]} />
                  <Text variant="t3-medium" color="neutralSubtle">
                    {name} {fmtMinutes(min)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </Section>

      {days.map((d) => {
        const items = p.itemsOf(d);
        const list = ordered(items);
        const dp = progressOf(items);
        const editable = isEditable(d, p.today);
        const dow = dowOf(d);
        return (
          <Section
            key={d}
            flush
            title={
              <Press onPress={() => onOpenDay(d)} scale={0} style={s.weekDayHead} accessibilityRole="button">
                <Text variant="t5-bold" color={d === p.today ? 'brand' : dow === 0 ? 'critical' : 'neutral'}>
                  {fmtMonthDay(d)} {DAY_LABELS[dow]}
                  {d === p.today ? ' · 오늘' : ''}
                </Text>
                <ChevronRight color={color.fg.neutralSubtle} size={16} strokeWidth={2.2} />
              </Press>
            }
            action={
              dp.total > 0 ? (
                <Text variant="t3-medium" color={dp.ratio === 1 ? 'positive' : 'neutralSubtle'} tabular>
                  {dp.done}/{dp.total}
                </Text>
              ) : editable ? (
                <Press onPress={() => onOpenDay(d)} scale={0} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${fmtMonthDay(d)} 계획 추가`}>
                  <Plus color={color.fg.neutralSubtle} size={18} strokeWidth={2.2} />
                </Press>
              ) : undefined
            }>
            {list.map((it) => (
              <View key={it.id} style={s.weekItem}>
                <Press
                  onPress={() => p.commit([{ date: d, items: toggleItem(items, it.id) }])}
                  disabled={!editable}
                  scale={0}
                  hitSlop={8}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: it.done, disabled: !editable }}
                  accessibilityLabel={it.text}>
                  <View style={[s.boxSm, it.done && s.boxOn]}>
                    {it.done && <Check color={color.palette.staticWhite} size={12} strokeWidth={3} />}
                  </View>
                </Press>
                {it.subject ? <View style={[s.dot, { backgroundColor: dotColor(it.colorCode) }]} /> : null}
                <Text
                  variant="t4-regular"
                  color={it.done ? 'neutralSubtle' : 'neutral'}
                  numberOfLines={1}
                  style={[{ flex: 1, minWidth: 0 }, it.done && s.strike]}>
                  {it.text}
                </Text>
                {it.duration ? (
                  <Text variant="t2-medium" color="neutralSubtle" tabular>
                    {fmtMinutes(it.duration)}
                  </Text>
                ) : null}
              </View>
            ))}
          </Section>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  weekHead: { flexDirection: 'row', alignItems: 'center', gap: space.x2, marginBottom: space.x3 },
  navBtn: { width: 36, height: 36, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  todayBtn: { paddingHorizontal: space.x2_5, height: 28, borderRadius: radius.full, justifyContent: 'center', backgroundColor: color.bg.brandWeak },
  days: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { flex: 1, alignItems: 'center', gap: space.x1, paddingVertical: space.x1 },
  dateCircle: { width: 36, height: 36, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  dayBar: { width: 22, height: 4, borderRadius: radius.full, backgroundColor: color.bg.neutralWeak, overflow: 'hidden' },
  empty: { paddingHorizontal: space.x5, paddingVertical: space.x4 },
  addBar: { paddingHorizontal: space.x4, paddingTop: space.x2, paddingBottom: space.x2, gap: space.x2_5 },
  subjects: { gap: space.x1_5, paddingRight: space.x2 },
  chipInner: { flexDirection: 'row', alignItems: 'center', gap: space.x1_5 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: space.x2 },
  dot: { width: 8, height: 8, borderRadius: radius.full, flexShrink: 0 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: color.bg.layerDefault, paddingLeft: space.x2 },
  checkHit: { width: 44, height: 52, alignItems: 'center', justifyContent: 'center' },
  rowBody: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    minHeight: 52,
    paddingVertical: space.x2,
    paddingRight: space.x5,
  },
  subjectLine: { flexDirection: 'row', alignItems: 'center', gap: space.x1_5 },
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.r1_5,
    borderWidth: 1.5,
    borderColor: color.stroke.neutralMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxSm: {
    width: 18,
    height: 18,
    borderRadius: radius.r1,
    borderWidth: 1.5,
    borderColor: color.stroke.neutralMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: color.bg.brandSolid, borderColor: color.bg.brandSolid },
  strike: { textDecorationLine: 'line-through', textDecorationColor: color.fg.placeholder },
  actions: { flexDirection: 'row' },
  action: { width: 72, alignItems: 'center', justifyContent: 'center', gap: 2 },
  subjectTotals: { flexDirection: 'row', flexWrap: 'wrap', gap: space.x3, marginTop: space.x3 },
  weekDayHead: { flexDirection: 'row', alignItems: 'center', gap: space.x1, alignSelf: 'flex-start' },
  weekItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2_5,
    paddingHorizontal: space.x5,
    paddingVertical: space.x2,
  },
});
