"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Icon } from "@seed-design/react";
import { IconPlusLine, IconXmarkLine } from "@karrotmarket/react-monochrome-icon";
import { ActionButton } from "seed-design/ui/action-button";
import { Checkbox } from "seed-design/ui/checkbox";
import { TextField, TextFieldInput } from "seed-design/ui/text-field";
import {
  saveMyDailyPlan,
  type PortalCalendarEvent,
  type PortalDailyPlan,
  type PortalPlanItem,
  type PortalTimetableEntry,
} from "@/actions/student-schedule";
import { Badge, ListRow, Section, Segmented } from "@/components/portal/ui";
import { cn } from "@/lib/utils";

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

// 시간표 colorCode(DB 값) → 점/바 색. SEED 역할 토큰으로 매핑하고,
// SEED 팔레트에 없는 색(pink/teal)만 Tailwind 기본 팔레트를 유지한다.
const DOT_COLORS: Record<string, string> = {
  blue: "bg-bg-informative-solid",
  red: "bg-bg-critical-solid",
  orange: "bg-bg-brand-solid",
  yellow: "bg-bg-warning-solid",
  green: "bg-bg-positive-solid",
  purple: "bg-palette-purple-600",
  pink: "bg-pink-400",
  teal: "bg-teal-400",
};

/** 학교/개인 일정(캘린더 이벤트) 점·바 색 */
const EVENT_DOT = "bg-palette-gray-600";

const EVENT_TYPE_LABEL: Record<string, string> = {
  SCHOOL_EXAM: "학교 시험",
  SCHOOL_EVENT: "학교 행사",
  PERSONAL: "개인 일정",
  PLATFORM: "플랫폼",
};

type ViewKey = "today" | "tomorrow" | "week";

const VIEW_OPTIONS: { value: ViewKey; label: string }[] = [
  { value: "today", label: "오늘" },
  { value: "tomorrow", label: "내일" },
  { value: "week", label: "이번 주" },
];

// ── 날짜 헬퍼 ──────────────────────────────────────────────────────────

function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  return new Date(d.getTime() + n * 86_400_000).toISOString().slice(0, 10);
}

/** ISO datetime → KST 기준 "YYYY-MM-DD" */
function kstDateStr(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

function eventsOn(events: PortalCalendarEvent[], dateStr: string): PortalCalendarEvent[] {
  return events.filter((ev) => {
    const start = kstDateStr(ev.startDate);
    const end = ev.endDate ? kstDateStr(ev.endDate) : start;
    return start <= dateStr && dateStr <= end;
  });
}

/** "YYYY-MM-DD" → "9월 24일" */
function fmtMonthDay(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${m}월 ${d}일`;
}

/** "YYYY-MM-DD" → "9월 24일 수요일" */
function fmtDateLong(dateStr: string): string {
  return `${fmtMonthDay(dateStr)} ${DAY_LABELS[new Date(dateStr).getUTCDay()]}요일`;
}

function dotColor(code: string): string {
  return DOT_COLORS[code] ?? DOT_COLORS.blue;
}

// ── 일간: 일정 행 (Section flush 안) ────────────────────────────────────

function ColorBar({ className }: { className: string }) {
  return (
    <span aria-hidden className={cn("min-h-9 w-x1 shrink-0 self-stretch rounded-full", className)} />
  );
}

function DayRows({
  entries,
  events,
}: {
  entries: PortalTimetableEntry[];
  events: PortalCalendarEvent[];
}) {
  if (entries.length === 0 && events.length === 0) {
    return <p className="px-x5 pb-x3 pt-x1 t4-regular text-fg-neutral-subtle">등록된 일정이 없어요</p>;
  }
  return (
    <>
      {events.map((ev) => (
        <ListRow
          key={ev.id}
          leading={<ColorBar className={EVENT_DOT} />}
          title={ev.title}
          trailing={<Badge>{EVENT_TYPE_LABEL[ev.type] ?? ev.type}</Badge>}
        />
      ))}
      {entries.map((en) => (
        <ListRow
          key={en.id}
          leading={<ColorBar className={dotColor(en.colorCode)} />}
          title={en.subject}
          description={en.details ?? undefined}
          trailing={
            <span className="tabular-nums">
              {en.allDay ? "종일" : `${en.startTime}–${en.endTime}`}
            </span>
          }
        />
      ))}
    </>
  );
}

// ── 주간: 요일 행 안의 촘촘한 목록 ───────────────────────────────────────

function CompactSchedule({
  entries,
  events,
}: {
  entries: PortalTimetableEntry[];
  events: PortalCalendarEvent[];
}) {
  if (entries.length === 0 && events.length === 0) {
    return <p className="t4-regular text-fg-placeholder">일정 없음</p>;
  }
  return (
    <ul className="flex flex-col gap-x2">
      {events.map((ev) => (
        <li key={ev.id} className="flex items-center gap-x2">
          <span className={cn("size-x2 shrink-0 rounded-full", EVENT_DOT)} />
          <span className="min-w-0 truncate t5-medium text-fg-neutral">{ev.title}</span>
          <Badge size="xs" className="ml-auto">
            {EVENT_TYPE_LABEL[ev.type] ?? ev.type}
          </Badge>
        </li>
      ))}
      {entries.map((en) => (
        <li key={en.id} className="flex items-center gap-x2">
          <span className={cn("size-x2 shrink-0 rounded-full", dotColor(en.colorCode))} />
          <span className="min-w-0 truncate t5-medium text-fg-neutral">
            {en.subject}
            {en.details && (
              <span className="ml-x1_5 t3-regular text-fg-neutral-subtle">{en.details}</span>
            )}
          </span>
          <span className="ml-auto shrink-0 pl-x2 t3-regular text-fg-neutral-subtle tabular-nums">
            {en.allDay ? "종일" : `${en.startTime}–${en.endTime}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── 메인 패널 ──────────────────────────────────────────────────────────

export function MySchedulePanel({
  token,
  weekStart,
  todayStr,
  timetable,
  events,
  plans,
}: {
  token: string;
  weekStart: string; // 월요일 "YYYY-MM-DD"
  todayStr: string; // KST 오늘 "YYYY-MM-DD"
  timetable: PortalTimetableEntry[];
  events: PortalCalendarEvent[];
  plans: { today: PortalDailyPlan; tomorrow: PortalDailyPlan };
}) {
  const [view, setView] = useState<"day" | "week">("day");
  const [planDay, setPlanDay] = useState<"today" | "tomorrow">("today");
  const [planItems, setPlanItems] = useState<Record<"today" | "tomorrow", PortalPlanItem[]>>({
    today: plans.today.items,
    tomorrow: plans.tomorrow.items,
  });
  const [newText, setNewText] = useState("");
  const [saving, startSaving] = useTransition();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const planDate = planDay === "today" ? plans.today.date : plans.tomorrow.date;

  const save = useCallback(
    (day: "today" | "tomorrow", items: PortalPlanItem[]) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const date = day === "today" ? plans.today.date : plans.tomorrow.date;
      saveTimer.current = setTimeout(() => {
        startSaving(async () => {
          try {
            await saveMyDailyPlan({ token, date, items });
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "저장 실패");
          }
        });
      }, 600);
    },
    [token, plans.today.date, plans.tomorrow.date]
  );

  function updateItems(items: PortalPlanItem[]) {
    setPlanItems((prev) => ({ ...prev, [planDay]: items }));
    save(planDay, items);
  }

  function addItem() {
    const text = newText.trim();
    if (!text) return;
    updateItems([
      ...planItems[planDay],
      { id: crypto.randomUUID(), text, done: false, colorCode: "blue" },
    ]);
    setNewText("");
  }

  const items = planItems[planDay];
  const doneCount = items.filter((it) => it.done).length;
  const weekDates = Array.from({ length: 7 }, (_, i) => addDaysStr(weekStart, i));

  return (
    <div className="flex flex-col gap-x3">
      {/* 오늘 / 내일 / 이번 주 */}
      <Segmented
        options={VIEW_OPTIONS}
        value={view === "week" ? "week" : planDay}
        onChange={(v) => {
          if (v === "week") {
            setView("week");
          } else {
            setView("day");
            setPlanDay(v);
          }
        }}
        aria-label="일정 보기"
      />

      {view === "week" ? (
        <Section
          title="이번 주 일정"
          description={`${fmtMonthDay(weekDates[0])} – ${fmtMonthDay(weekDates[6])}`}
          flush
        >
          {weekDates.map((dateStr) => {
            const dow = new Date(dateStr).getUTCDay();
            const isToday = dateStr === todayStr;
            return (
              <div key={dateStr} className="mx-x2 flex gap-x3_5 rounded-r4 px-x3 py-x3">
                <div className="flex w-x9 shrink-0 flex-col items-center">
                  <span
                    className={cn(
                      "t3-bold",
                      isToday
                        ? "text-fg-brand"
                        : dow === 0
                          ? "text-fg-critical"
                          : dow === 6
                            ? "text-fg-informative"
                            : "text-fg-neutral-subtle"
                    )}
                  >
                    {DAY_LABELS[dow]}
                  </span>
                  <span
                    className={cn(
                      "mt-x1 inline-flex size-x8 items-center justify-center rounded-full t5-bold tabular-nums",
                      isToday ? "bg-bg-brand-solid text-palette-static-white" : "text-fg-neutral"
                    )}
                    aria-label={isToday ? "오늘" : undefined}
                  >
                    {Number(dateStr.slice(8))}
                  </span>
                </div>
                <div className="min-w-0 flex-1 self-center py-x1">
                  <CompactSchedule
                    entries={timetable.filter((t) => t.dayOfWeek === dow)}
                    events={eventsOn(events, dateStr)}
                  />
                </div>
              </div>
            );
          })}
        </Section>
      ) : (
        <>
          {/* 해당 날짜 일정 */}
          <Section title={fmtDateLong(planDate)} flush>
            <DayRows
              entries={timetable.filter((t) => t.dayOfWeek === new Date(planDate).getUTCDay())}
              events={eventsOn(events, planDate)}
            />
          </Section>

          {/* 공부 계획 */}
          <Section
            title="공부 계획"
            description={
              items.length > 0 ? `${items.length}개 중 ${doneCount}개 완료` : undefined
            }
            action={
              saving ? <span className="shrink-0 t3-regular text-fg-neutral-subtle">저장 중…</span> : undefined
            }
          >
            {items.length === 0 ? (
              <p className="pb-x3 t4-regular text-fg-neutral-subtle">
                아직 계획이 없어요. 아래에서 추가해 보세요.
              </p>
            ) : (
              <ul className="-mx-2 mb-x3">
                {items.map((it) => (
                  <li key={it.id} className="flex items-center gap-x1">
                    <Checkbox
                      checked={it.done}
                      onCheckedChange={(checked) =>
                        updateItems(
                          items.map((x) => (x.id === it.id ? { ...x, done: checked } : x))
                        )
                      }
                      tone="brand"
                      size="large"
                      className="min-w-0 flex-1 rounded-r3_5 px-x2 py-x1 transition-colors duration-d3 active:bg-bg-transparent-pressed"
                      label={
                        <span
                          className={cn(
                            "wrap-anywhere",
                            it.done &&
                              "text-fg-neutral-subtle line-through decoration-fg-placeholder"
                          )}
                        >
                          {it.text}
                        </span>
                      }
                    />
                    <ActionButton
                      variant="ghost"
                      size="small"
                      layout="iconOnly"
                      color="fg.placeholder"
                      aria-label="삭제"
                      onClick={() => updateItems(items.filter((x) => x.id !== it.id))}
                      className="shrink-0"
                    >
                      <Icon svg={<IconXmarkLine />} />
                    </ActionButton>
                  </li>
                ))}
              </ul>
            )}

            <form
              className="flex gap-x2"
              onSubmit={(e) => {
                e.preventDefault();
                addItem();
              }}
            >
              <div className="min-w-0 flex-1">
                <TextField value={newText} onValueChange={({ value }) => setNewText(value)}>
                  <TextFieldInput
                    placeholder="예: 수학 문제집 30p"
                    maxLength={200}
                    aria-label="공부 계획 추가"
                    enterKeyHint="done"
                  />
                </TextField>
              </div>
              <ActionButton
                type="submit"
                variant="neutralWeak"
                size="large"
                layout="iconOnly"
                aria-label="추가"
                disabled={!newText.trim()}
                className="shrink-0"
              >
                <Icon svg={<IconPlusLine />} />
              </ActionButton>
            </form>
          </Section>
        </>
      )}
    </div>
  );
}
