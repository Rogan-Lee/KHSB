"use client";

import { useState, useEffect, useTransition, useRef, useCallback } from "react";
import { getDailyPlan, upsertDailyPlan, PlanItem } from "@/actions/daily-plan";
import {
  createTimetableEntry,
  updateTimetableEntry,
  deleteTimetableEntry,
  type SchoolEventInfo,
} from "@/actions/timetable";
import { TimetableEntry } from "./timetable-grid";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, Plus, Trash2,
  CheckCircle2, Circle, Clock, BookOpen, X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, ProgressBar, Section, StatCard, StatusBadge } from "@/components/backoffice/ui";
import { ConfirmDialog } from "@/components/calendar/confirm-dialog";
import { EntryFormFields } from "./entry-form";
import { COLOR_OPTIONS, normalizeColor, schoolEventTone, timetableTone, weekdayTextClass } from "./tones";

// ── Constants ──────────────────────────────────────────────────────────────
const START_HOUR = 6;
const END_HOUR = 23;
const HOUR_HEIGHT = 72;
const TIME_COL_W = 60;
const SNAP = 15;
const TOTAL_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT;

const DAYS = [1, 2, 3, 4, 5, 6, 0];
const DAY_FULL = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"];

// ── Helpers ────────────────────────────────────────────────────────────────
function timeToMin(t: string) {
  if (!t) return START_HOUR * 60;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return START_HOUR * 60;
  return h * 60 + m;
}
function minToTime(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
function minToY(min: number) {
  return ((min - START_HOUR * 60) / 60) * HOUR_HEIGHT;
}
function yToMin(y: number) {
  const raw = (y / HOUR_HEIGHT) * 60 + START_HOUR * 60;
  const snapped = Math.round(raw / SNAP) * SNAP;
  return Math.max(START_HOUR * 60, Math.min(END_HOUR * 60 - SNAP, snapped));
}
function nowMinutes() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}
function isAllDay(e: { allDay?: boolean; startTime: string; endTime: string }) {
  return e.allDay === true || (e.startTime === "00:00" && e.endTime === "23:59");
}
function dateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}
function formatDateKo(d: Date) {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// ── Types ──────────────────────────────────────────────────────────────────
type EntryPanel =
  | { mode: "create"; startTime: string; endTime: string }
  | { mode: "edit"; entry: TimetableEntry };

interface Props {
  studentId: string;
  entries: TimetableEntry[];
  initialDate?: string; // "YYYY-MM-DD" — for mentoring page
  schoolEvents?: SchoolEventInfo[];
  hidePlan?: boolean; // hide right-side study plan panel (for embedded use)
}

// ── Component ──────────────────────────────────────────────────────────────
export function DayView({ studentId, entries: initialEntries, initialDate, schoolEvents = [], hidePlan = false }: Props) {
  const [date, setDate] = useState(() => {
    if (initialDate) {
      const d = new Date(initialDate + "T00:00:00");
      return d;
    }
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [entries, setEntries] = useState<TimetableEntry[]>(initialEntries);

  // Drag state
  const [dragCreate, setDragCreate] = useState<{ anchorMin: number; currentMin: number } | null>(null);
  const dragCreateRef = useRef(dragCreate);
  useEffect(() => { dragCreateRef.current = dragCreate; }, [dragCreate]);

  // Entry panel
  const [entryPanel, setEntryPanel] = useState<EntryPanel | null>(null);
  const [entryForm, setEntryForm] = useState({ subject: "", details: "", colorCode: "blue", allDay: false });
  const [isEntryPending, startEntryTransition] = useTransition();

  // Plan state
  const [items, setItems] = useState<PlanItem[]>([]);
  const [notes, setNotes] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loadedKey, setLoadedKey] = useState("");
  const [, startPlanTransition] = useTransition();

  // Other
  const [currentMin, setCurrentMin] = useState(nowMinutes());
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isToday = dateKey(date) === dateKey(today);
  const dayOfWeek = date.getDay();
  const dayIdx = DAYS.indexOf(dayOfWeek);

  const timedEntries = entries.filter((e) => e.dayOfWeek === dayOfWeek && !isAllDay(e));
  const allDayEntries = entries.filter((e) => e.dayOfWeek === dayOfWeek && isAllDay(e));
  const curDateKey = dateKey(date);
  const dateSchoolEvents = schoolEvents.filter((ev) => {
    const start = dateKey(new Date(ev.startDate));
    const end = ev.endDate ? dateKey(new Date(ev.endDate)) : start;
    return curDateKey >= start && curDateKey <= end;
  });
  const nowInRange = currentMin >= START_HOUR * 60 && currentMin < END_HOUR * 60;
  const hourLabels = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

  // Update current time
  useEffect(() => {
    const id = setInterval(() => setCurrentMin(nowMinutes()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Scroll to center current time on mount
  useEffect(() => {
    requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      const half = scrollRef.current.clientHeight / 2;
      scrollRef.current.scrollTop = Math.max(0, minToY(currentMin) - half);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load plan when date/student changes
  useEffect(() => {
    const key = `${studentId}:${dateKey(date)}`;
    if (key === loadedKey) return;
    startPlanTransition(async () => {
      const plan = await getDailyPlan(studentId, date);
      setItems(plan.items);
      setNotes(plan.notes);
      setLoadedKey(key);
      setDirty(false);
    });
  }, [studentId, date]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save plan
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = useCallback(
    (nextItems: PlanItem[], nextNotes: string) => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => {
        startPlanTransition(async () => {
          try {
            await upsertDailyPlan(studentId, date, nextItems, nextNotes);
            setDirty(false);
          } catch {
            toast.error("저장 실패");
          }
        });
      }, 800);
    },
    [studentId, date]
  );

  function updateItems(next: PlanItem[]) { setItems(next); setDirty(true); save(next, notes); }
  function updateNotes(val: string) { setNotes(val); setDirty(true); save(items, val); }

  function addItem() {
    const next: PlanItem = { id: nanoid(), text: "", done: false, colorCode: "blue" };
    const updated = [...items, next];
    setItems(updated);
    setDirty(true);
    save(updated, notes);
    setTimeout(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>("[data-plan-item]");
      inputs[inputs.length - 1]?.focus();
    }, 50);
  }

  function toggleItem(id: string) { updateItems(items.map((it) => it.id === id ? { ...it, done: !it.done } : it)); }
  function updateItemText(id: string, text: string) { updateItems(items.map((it) => it.id === id ? { ...it, text } : it)); }
  function updateItemDuration(id: string, raw: string) {
    const duration = parseInt(raw) || undefined;
    updateItems(items.map((it) => it.id === id ? { ...it, duration } : it));
  }
  function updateItemColor(id: string, colorCode: string) { updateItems(items.map((it) => it.id === id ? { ...it, colorCode } : it)); }
  function removeItem(id: string) { updateItems(items.filter((it) => it.id !== id)); }

  // ── Drag helpers ──
  function getBodyY(clientY: number): number {
    if (!bodyRef.current) return 0;
    return clientY - bodyRef.current.getBoundingClientRect().top;
  }

  // Global mouse events for drag-to-create
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const dc = dragCreateRef.current;
      if (!dc) return;
      setDragCreate((d) => d ? { ...d, currentMin: yToMin(getBodyY(e.clientY)) } : null);
    }
    function onUp() {
      const dc = dragCreateRef.current;
      if (dc) {
        const startMin = Math.min(dc.anchorMin, dc.currentMin);
        const endMin = Math.max(dc.anchorMin, dc.currentMin) + SNAP;
        if (endMin - startMin >= SNAP) {
          setEntryPanel({ mode: "create", startTime: minToTime(startMin), endTime: minToTime(endMin) });
          setEntryForm({ subject: "", details: "", colorCode: "blue", allDay: false });
        }
        setDragCreate(null);
      }
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleColMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    setDragCreate({ anchorMin: yToMin(getBodyY(e.clientY)), currentMin: yToMin(getBodyY(e.clientY)) });
  }

  function openEditEntry(entry: TimetableEntry) {
    setEntryPanel({ mode: "edit", entry });
    setEntryForm({ subject: entry.subject, details: entry.details ?? "", colorCode: entry.colorCode, allDay: entry.allDay ?? false });
  }

  function handleCreateEntry() {
    if (!entryPanel || entryPanel.mode !== "create") return;
    if (!entryForm.subject.trim()) { toast.error("과목명을 입력하세요"); return; }
    startEntryTransition(async () => {
      try {
        const entry = await createTimetableEntry({
          studentId,
          dayOfWeek,
          startTime: entryForm.allDay ? "00:00" : entryPanel.startTime,
          endTime: entryForm.allDay ? "23:59" : entryPanel.endTime,
          subject: entryForm.subject.trim(),
          details: entryForm.details.trim() || undefined,
          colorCode: entryForm.colorCode,
          allDay: entryForm.allDay,
        });
        const newEntry = { ...entry, details: entry.details ?? null };
        setEntries((prev) => [...prev, newEntry]);
        setEntryPanel({ mode: "edit", entry: newEntry });
        toast.success("등록되었습니다");
      } catch { toast.error("등록 실패"); }
    });
  }

  function handleUpdateEntry() {
    if (!entryPanel || entryPanel.mode !== "edit") return;
    if (!entryForm.subject.trim()) { toast.error("과목명을 입력하세요"); return; }
    startEntryTransition(async () => {
      try {
        const updated = {
          subject: entryForm.subject.trim(),
          details: entryForm.details.trim() || null,
          colorCode: entryForm.colorCode,
          allDay: entryForm.allDay,
          startTime: entryForm.allDay ? "00:00" : entryPanel.entry.startTime,
          endTime: entryForm.allDay ? "23:59" : entryPanel.entry.endTime,
        };
        await updateTimetableEntry(entryPanel.entry.id, updated);
        setEntries((prev) => prev.map((e) => e.id === entryPanel.entry.id ? { ...e, ...updated } : e));
        setEntryPanel((p) => p?.mode === "edit" ? { ...p, entry: { ...p.entry, ...updated } } : p);
        toast.success("수정되었습니다");
      } catch { toast.error("수정 실패"); }
    });
  }

  function handleDeleteEntry(id: string) {
    startEntryTransition(async () => {
      try {
        await deleteTimetableEntry(id);
        setEntries((prev) => prev.filter((e) => e.id !== id));
        setEntryPanel(null);
        toast.success("삭제되었습니다");
      } catch { toast.error("삭제 실패"); }
    });
  }

  // Plan stats
  const done = items.filter((it) => it.done).length;
  const totalMin = items.reduce((s, it) => s + (it.duration ?? 0), 0);
  const doneMin = items.filter((it) => it.done).reduce((s, it) => s + (it.duration ?? 0), 0);


  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const entryFields = entryPanel && (
    <EntryFormFields
      mode={entryPanel.mode}
      dayLabel={DAY_FULL[dayIdx]}
      startTime={entryPanel.mode === "create" ? entryPanel.startTime : entryPanel.entry.startTime}
      endTime={entryPanel.mode === "create" ? entryPanel.endTime : entryPanel.entry.endTime}
      form={entryForm}
      setForm={setEntryForm}
      onSubmit={entryPanel.mode === "create" ? handleCreateEntry : handleUpdateEntry}
      onDelete={entryPanel.mode === "edit" ? () => setConfirmDeleteId(entryPanel.entry.id) : undefined}
      isPending={isEntryPending}
      detailsRows={2}
    />
  );

  const fmtMin = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;

  return (
    <div className={hidePlan ? "flex flex-col gap-x3" : "flex flex-col gap-x4 lg:flex-row lg:items-start"}>
      {/* ── Timeline ── */}
      <div className="min-w-0 flex-1 overflow-hidden rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default">
        {/* Date nav header */}
        <div className="relative z-40 flex items-center justify-between gap-x2 border-b border-stroke-neutral-muted px-x3 py-x2">
          <div className="flex min-w-0 items-center gap-x0_5">
            <button
              type="button"
              onClick={() => setDate((d) => addDays(d, -1))}
              aria-label="이전 날"
              className="grid size-x9 shrink-0 place-items-center rounded-full text-fg-neutral-muted transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setDate((d) => addDays(d, 1))}
              aria-label="다음 날"
              className="grid size-x9 shrink-0 place-items-center rounded-full text-fg-neutral-muted transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
            <h3 className="ml-x1 truncate t5-bold tabular-nums text-fg-neutral">
              {formatDateKo(date)}{" "}
              <span className={cn("t5-medium", weekdayTextClass(dayOfWeek))}>{DAY_FULL[dayIdx]}</span>
            </h3>
          </div>

          {isToday ? (
            <StatusBadge tone="brand">오늘</StatusBadge>
          ) : (
            <Button
              variant="outline"
              size="xs"
              onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setDate(d); }}
            >
              오늘
            </Button>
          )}
        </div>

        {/* All-day strip */}
        <div className="relative z-40 flex min-h-11 flex-wrap items-center gap-x1_5 border-b border-stroke-neutral-muted bg-bg-layer-fill px-x3 py-x2">
          <span className="shrink-0 text-right t2-medium text-fg-neutral-subtle" style={{ width: TIME_COL_W - 12 }}>
            종일
          </span>
          {/* School events (read-only chips) */}
          {dateSchoolEvents.map((ev) => (
            <span
              key={ev.id}
              className={cn("rounded-full px-x2_5 py-x1 t3-medium ring-1 ring-inset", schoolEventTone(ev.type))}
              title={ev.title}
            >
              {ev.title}
            </span>
          ))}
          {allDayEntries.map((entry) => {
            const t = timetableTone(entry.colorCode);
            const isSelected = entryPanel?.mode === "edit" && entryPanel.entry.id === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => openEditEntry(entry)}
                className={cn(
                  "rounded-full px-x2_5 py-x1 t3-bold ring-inset transition-[filter] hover:brightness-95",
                  t.block,
                  t.title,
                  isSelected ? cn("ring-2", t.ring) : "ring-1"
                )}
              >
                {entry.subject}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setEntryPanel({ mode: "create", startTime: "00:00", endTime: "23:59" });
              setEntryForm({ subject: "", details: "", colorCode: "blue", allDay: true });
            }}
            className="grid size-7 place-items-center rounded-full text-fg-placeholder transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral-muted"
            title="종일 일정 추가"
            aria-label="종일 일정 추가"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>

        {/* Timeline */}
        <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 320px)" }}>
          <div
            ref={bodyRef}
            className="grid"
            style={{ gridTemplateColumns: `${TIME_COL_W}px 1fr`, height: TOTAL_HEIGHT }}
          >
            {/* Time labels */}
            <div className="relative border-r border-stroke-neutral-muted">
              {hourLabels.map((h) => (
                <div
                  key={h}
                  className="absolute flex w-full items-center justify-end pr-x2_5"
                  style={{ top: (h - START_HOUR) * HOUR_HEIGHT - 8, height: 16 }}
                >
                  <span className="t2-regular tabular-nums text-fg-neutral-subtle">
                    {String(h).padStart(2, "0")}:00
                  </span>
                </div>
              ))}
              {/* Current time label */}
              {isToday && nowInRange && (
                <div
                  className="pointer-events-none absolute z-30 flex w-full items-center justify-end pr-x1"
                  style={{ top: minToY(currentMin), transform: "translateY(-50%)" }}
                >
                  <span className="rounded-full bg-bg-brand-solid px-x1_5 py-x0_5 t2-bold tabular-nums text-palette-static-white">
                    {minToTime(currentMin)}
                  </span>
                </div>
              )}
            </div>

            {/* Event column */}
            <div
              className="relative cursor-crosshair"
              onMouseDown={handleColMouseDown}
            >
              {/* Hour lines */}
              {hourLabels.map((h) => (
                <div key={h} className="absolute w-full border-t border-stroke-neutral-muted" style={{ top: (h - START_HOUR) * HOUR_HEIGHT }} />
              ))}
              {/* Half-hour dashed lines */}
              {hourLabels.map((h) => (
                <div
                  key={`${h}h`}
                  className="absolute w-full border-t border-stroke-neutral-subtle"
                  style={{ top: (h - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2, borderStyle: "dashed" }}
                />
              ))}

              {/* Current time line */}
              {isToday && nowInRange && (
                <div className="pointer-events-none absolute left-0 right-0 z-30" style={{ top: minToY(currentMin) }}>
                  <div className="flex -translate-y-1/2 items-center">
                    <div className="-ml-1.5 size-3 shrink-0 rounded-full bg-bg-brand-solid" />
                    <div className="h-0.5 flex-1 bg-bg-brand-solid" />
                  </div>
                </div>
              )}

              {/* Timed entries */}
              {timedEntries.map((entry) => {
                const top = minToY(timeToMin(entry.startTime));
                const height = Math.max(28, minToY(timeToMin(entry.endTime)) - top);
                const t = timetableTone(entry.colorCode);
                const isSelected = entryPanel?.mode === "edit" && entryPanel.entry.id === entry.id;
                return (
                  <div
                    key={entry.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${entry.subject} ${entry.startTime}–${entry.endTime}`}
                    className={cn(
                      "absolute left-2 right-2 cursor-pointer overflow-hidden rounded-r2 ring-inset transition-[filter] hover:brightness-95",
                      t.block,
                      isSelected ? cn("ring-2", t.ring) : "ring-1"
                    )}
                    style={{ top, height, zIndex: 10 }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => openEditEntry(entry)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openEditEntry(entry);
                      }
                    }}
                  >
                    <div className="flex h-full flex-col overflow-hidden px-x3 py-x1_5">
                      <p className={cn("truncate t4-bold", t.title)}>{entry.subject}</p>
                      {height > 48 && entry.details && (
                        <p className={cn("mt-x0_5 truncate t3-regular", t.sub)}>{entry.details}</p>
                      )}
                      {height > 34 && (
                        <p className={cn("mt-auto t2-regular tabular-nums", t.sub)}>{entry.startTime} – {entry.endTime}</p>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Drag ghost */}
              {dragCreate && (() => {
                const startMin = Math.min(dragCreate.anchorMin, dragCreate.currentMin);
                const endMin = Math.max(dragCreate.anchorMin, dragCreate.currentMin) + SNAP;
                const top = minToY(startMin);
                const height = Math.max((SNAP / 60) * HOUR_HEIGHT, minToY(endMin) - top);
                return (
                  <div
                    className="pointer-events-none absolute left-2 right-2 rounded-r2 border-2 border-dashed border-stroke-brand-solid bg-bg-brand-weak"
                    style={{ top, height, zIndex: 20 }}
                  >
                    <p className="px-x2 pt-x1 t2-bold tabular-nums text-fg-brand">
                      {minToTime(startMin)} – {minToTime(endMin)}
                    </p>
                  </div>
                );
              })()}

              {/* Preview block (create panel open, not all-day) */}
              {!dragCreate && entryPanel?.mode === "create" && !entryForm.allDay && (() => {
                const top = minToY(timeToMin(entryPanel.startTime));
                const height = Math.max((SNAP / 60) * HOUR_HEIGHT, minToY(timeToMin(entryPanel.endTime)) - top);
                const t = timetableTone(entryForm.colorCode);
                return (
                  <div
                    className={cn("pointer-events-none absolute left-2 right-2 rounded-r2 opacity-80 ring-2 ring-inset", t.block, t.ring)}
                    style={{ top, height, zIndex: 15 }}
                  >
                    <div className="px-x3 py-x1_5">
                      <p className={cn("t4-bold", t.title)}>{entryForm.subject || "새 일정"}</p>
                      <p className={cn("mt-x0_5 t2-regular tabular-nums", t.sub)}>{entryPanel.startTime} – {entryPanel.endTime}</p>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* ── Entry form dialog (when hidePlan) ── */}
      {hidePlan && (
        <Dialog open={!!entryPanel} onOpenChange={(open) => { if (!open) setEntryPanel(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="t6-bold">
                {entryPanel?.mode === "create" ? "새 일정 추가" : "일정 수정"}
              </DialogTitle>
            </DialogHeader>
            {entryFields}
          </DialogContent>
        </Dialog>
      )}

      {/* ── Right panel ── */}
      {!hidePlan && (
        <div className="flex w-full shrink-0 flex-col gap-x3 lg:max-h-[calc(100vh-180px)] lg:w-80 lg:overflow-y-auto">
          {/* Entry form */}
          {entryPanel && (
            <section className="rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default">
              <div className="flex items-center justify-between gap-x2 px-x5 pb-x3 pt-x4">
                <h3 className="t6-bold text-fg-neutral">
                  {entryPanel.mode === "create" ? "새 일정 추가" : "일정 수정"}
                </h3>
                <button
                  type="button"
                  onClick={() => setEntryPanel(null)}
                  aria-label="닫기"
                  className="-mr-x2 grid size-x8 place-items-center rounded-full text-fg-neutral-muted transition-colors hover:bg-bg-transparent-pressed"
                >
                  <X className="size-5" aria-hidden />
                </button>
              </div>
              <div className="px-x5 pb-x5">{entryFields}</div>
            </section>
          )}

          {/* Study plan card */}
          <Section
            title="오늘의 학습 계획"
            flush
            actions={
              dirty ? (
                <span className="t2-regular text-fg-neutral-subtle">저장 중…</span>
              ) : loadedKey ? (
                <span className="t2-regular text-fg-placeholder">저장됨</span>
              ) : null
            }
          >
            {items.length > 0 && (
              <div className="px-x5 pb-x3">
                <div className="mb-x2 flex items-center justify-between gap-x2 t3-regular tabular-nums text-fg-neutral-subtle">
                  <span>
                    <span className="t3-bold text-fg-neutral">{done}</span>/{items.length}개 완료
                  </span>
                  {totalMin > 0 && <span>{fmtMin(doneMin)} / {fmtMin(totalMin)}</span>}
                </div>
                <ProgressBar value={items.length > 0 ? done / items.length : 0} />
              </div>
            )}

            <div className="flex max-h-80 flex-col gap-x1_5 overflow-y-auto px-x3 pb-x2">
              {items.length === 0 && (
                <EmptyState
                  compact
                  icon={BookOpen}
                  title="아직 학습 계획이 없어요"
                  description="공부할 과목이나 내용을 추가해 보세요"
                />
              )}

              {items.map((item) => {
                const t = timetableTone(item.colorCode);
                const itemColor = normalizeColor(item.colorCode);
                return (
                  <div
                    key={item.id}
                    className="group flex items-start gap-x2 rounded-r2 bg-bg-layer-fill px-x3 py-x2_5"
                  >
                    <button
                      type="button"
                      onClick={() => toggleItem(item.id)}
                      aria-label={item.done ? "완료 취소" : "완료로 표시"}
                      className={cn("mt-x0_5 shrink-0 transition-colors", item.done ? "text-fg-neutral-subtle" : t.fg)}
                    >
                      {item.done ? <CheckCircle2 className="size-5" aria-hidden /> : <Circle className="size-5" aria-hidden />}
                    </button>

                    <div className="flex min-w-0 flex-1 flex-col gap-x1">
                      <input
                        data-plan-item
                        type="text"
                        value={item.text}
                        onChange={(e) => updateItemText(item.id, e.target.value)}
                        placeholder="과목 또는 내용"
                        aria-label="계획 내용"
                        className={cn(
                          "w-full bg-transparent t4-medium outline-none placeholder:text-fg-placeholder",
                          item.done ? "text-fg-neutral-subtle line-through" : "text-fg-neutral"
                        )}
                        onKeyDown={(e) => { if (e.key === "Enter") addItem(); }}
                      />
                      <div className="flex items-center gap-x1_5">
                        <Clock className="size-3.5 shrink-0 text-fg-placeholder" aria-hidden />
                        <input
                          type="number"
                          value={item.duration ?? ""}
                          onChange={(e) => updateItemDuration(item.id, e.target.value)}
                          placeholder="시간(분)"
                          aria-label="예상 시간(분)"
                          min={0}
                          className="w-16 bg-transparent t3-regular tabular-nums text-fg-neutral-muted outline-none placeholder:text-fg-placeholder"
                        />
                        {item.duration && (
                          <span className="t3-regular tabular-nums text-fg-neutral-subtle">
                            {item.duration >= 60
                              ? `${Math.floor(item.duration / 60)}h ${item.duration % 60 > 0 ? `${item.duration % 60}m` : ""}`.trim()
                              : `${item.duration}m`}
                          </span>
                        )}
                        <div className="ml-auto flex gap-x1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                          {COLOR_OPTIONS.map((opt) => (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => updateItemColor(item.id, opt.key)}
                              aria-label={`${opt.label}으로 표시`}
                              title={opt.label}
                              className={cn(
                                "size-3.5 rounded-full transition-transform",
                                timetableTone(opt.key).solid,
                                itemColor === opt.key && "scale-125 ring-2 ring-offset-1 ring-offset-bg-layer-fill ring-stroke-neutral-contrast"
                              )}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      aria-label="계획 삭제"
                      className="mt-x0_5 shrink-0 text-fg-placeholder opacity-0 transition-all hover:text-fg-critical group-focus-within:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="px-x3 pb-x3">
              <Button variant="secondary" size="sm" className="w-full" onClick={addItem}>
                <Plus aria-hidden />
                계획 추가
              </Button>
            </div>
          </Section>

          {/* Notes card */}
          <Section title="메모">
            <Textarea
              value={notes}
              onChange={(e) => updateNotes(e.target.value)}
              placeholder="오늘 공부하면서 느낀 점, 복습할 내용 등을 자유롭게 남겨보세요"
              rows={5}
              aria-label="메모"
              className="resize-none"
            />
          </Section>

          {/* Summary card */}
          {items.some((it) => it.done) && (
            <StatCard
              label="오늘 공부한 시간"
              tone="brand"
              value={
                <>
                  {Math.floor(doneMin / 60)}
                  <span className="t5-medium text-fg-neutral-subtle">시간</span>
                  {doneMin % 60 > 0 && (
                    <>
                      {" "}{doneMin % 60}
                      <span className="t5-medium text-fg-neutral-subtle">분</span>
                    </>
                  )}
                </>
              }
              sub={`목표 ${Math.floor(totalMin / 60)}시간 ${totalMin % 60 > 0 ? `${totalMin % 60}분` : ""} 중`}
            />
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        onOpenChange={(o) => { if (!o) setConfirmDeleteId(null); }}
        title="이 일정을 삭제할까요?"
        description="삭제하면 시간표에서 바로 사라져요."
        pending={isEntryPending}
        onConfirm={() => {
          if (confirmDeleteId) handleDeleteEntry(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
      />
    </div>
  );
}
