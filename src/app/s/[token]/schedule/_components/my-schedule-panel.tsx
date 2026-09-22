"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  saveMyDailyPlan,
  type PortalCalendarEvent,
  type PortalDailyPlan,
  type PortalPlanItem,
  type PortalTimetableEntry,
} from "@/actions/student-schedule";

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

const DOT_COLORS: Record<string, string> = {
  blue: "bg-blue-400",
  red: "bg-red-400",
  orange: "bg-orange-400",
  yellow: "bg-yellow-400",
  green: "bg-green-400",
  purple: "bg-purple-400",
  pink: "bg-pink-400",
  teal: "bg-teal-400",
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  SCHOOL_EXAM: "학교 시험",
  SCHOOL_EVENT: "학교 행사",
  PERSONAL: "개인 일정",
  PLATFORM: "플랫폼",
};

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

// ── 일정 행 ────────────────────────────────────────────────────────────

function EntryRow({ entry }: { entry: PortalTimetableEntry }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT_COLORS[entry.colorCode] ?? DOT_COLORS.blue}`} />
      <span className="font-medium">{entry.subject}</span>
      {entry.details && <span className="truncate text-xs text-ink-4">{entry.details}</span>}
      <span className="ml-auto shrink-0 text-xs text-ink-4 tabular-nums">
        {entry.allDay ? "종일" : `${entry.startTime}–${entry.endTime}`}
      </span>
    </li>
  );
}

function EventRow({ event }: { event: PortalCalendarEvent }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="h-2 w-2 shrink-0 rounded-full bg-slate-400" />
      <span className="font-medium">{event.title}</span>
      <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
        {EVENT_TYPE_LABEL[event.type] ?? event.type}
      </span>
    </li>
  );
}

function DaySchedule({
  entries,
  events,
}: {
  entries: PortalTimetableEntry[];
  events: PortalCalendarEvent[];
}) {
  if (entries.length === 0 && events.length === 0) {
    return <p className="text-xs text-ink-4">일정 없음</p>;
  }
  return (
    <ul className="space-y-1.5">
      {events.map((ev) => (
        <EventRow key={ev.id} event={ev} />
      ))}
      {entries.map((en) => (
        <EntryRow key={en.id} entry={en} />
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
  const weekDates = Array.from({ length: 7 }, (_, i) => addDaysStr(weekStart, i));

  return (
    <div className="space-y-4">
      {/* 주간/일간 토글 */}
      <div className="flex rounded-full border border-line bg-panel p-1 text-sm">
        {(["day", "week"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`flex-1 rounded-full py-1.5 font-medium transition-colors ${
              view === v ? "bg-slate-900 text-white" : "text-ink-3"
            }`}
          >
            {v === "day" ? "일간" : "주간"}
          </button>
        ))}
      </div>

      {view === "week" ? (
        <div className="space-y-2">
          {weekDates.map((dateStr) => {
            const d = new Date(dateStr);
            const dow = d.getUTCDay();
            const isToday = dateStr === todayStr;
            return (
              <div
                key={dateStr}
                className={`rounded-[14px] border p-3 ${
                  isToday ? "border-slate-900 bg-panel" : "border-line bg-panel"
                }`}
              >
                <p className="mb-1.5 text-sm font-semibold">
                  {DAY_LABELS[dow]}{" "}
                  <span className="text-xs font-normal text-ink-4 tabular-nums">
                    {dateStr.slice(5).replace("-", "/")}
                  </span>
                  {isToday && (
                    <span className="ml-1.5 rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      오늘
                    </span>
                  )}
                </p>
                <DaySchedule
                  entries={timetable.filter((t) => t.dayOfWeek === dow)}
                  events={eventsOn(events, dateStr)}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {/* 오늘/내일 토글 */}
          <div className="flex gap-1.5">
            {(["today", "tomorrow"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setPlanDay(d)}
                className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                  planDay === d
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-line bg-panel text-ink-3"
                }`}
              >
                {d === "today" ? "오늘" : "내일"}
              </button>
            ))}
            <span className="ml-auto self-center text-xs text-ink-4 tabular-nums">{planDate}</span>
          </div>

          {/* 해당 날짜 일정 */}
          <div className="rounded-[14px] border border-line bg-panel p-4">
            <p className="mb-2 text-sm font-medium">일정</p>
            <DaySchedule
              entries={timetable.filter((t) => t.dayOfWeek === new Date(planDate).getUTCDay())}
              events={eventsOn(events, planDate)}
            />
          </div>

          {/* 공부 계획 */}
          <div className="rounded-[14px] border border-line bg-panel p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">공부 계획</p>
              {saving && <span className="text-[11px] text-ink-4">저장 중…</span>}
            </div>

            {items.length === 0 && (
              <p className="mb-2 text-xs text-ink-4">아직 계획이 없어요. 아래에서 추가해 보세요.</p>
            )}

            <ul className="space-y-2">
              {items.map((it) => (
                <li key={it.id} className="flex items-center gap-2.5">
                  <Checkbox
                    checked={it.done}
                    onCheckedChange={(checked) =>
                      updateItems(
                        items.map((x) => (x.id === it.id ? { ...x, done: checked === true } : x))
                      )
                    }
                  />
                  <span className={`flex-1 text-sm ${it.done ? "text-ink-4 line-through" : ""}`}>
                    {it.text}
                  </span>
                  <button
                    type="button"
                    aria-label="삭제"
                    onClick={() => updateItems(items.filter((x) => x.id !== it.id))}
                    className="text-ink-4 hover:text-rose-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>

            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addItem();
              }}
            >
              <Input
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="예: 수학 문제집 30p"
                maxLength={200}
              />
              <Button type="submit" size="icon" variant="outline" aria-label="추가">
                <Plus className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
