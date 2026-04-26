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
import { nanoid } from "nanoid";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, Plus, Trash2,
  CheckCircle2, Circle, Clock, StickyNote, BookOpen, X, CalendarDays,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ── Constants ──────────────────────────────────────────────────────────────
const START_HOUR = 6;
const END_HOUR = 23;
const HOUR_HEIGHT = 72;
const TIME_COL_W = 60;
const SNAP = 15;
const TOTAL_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT;

const DAYS = [1, 2, 3, 4, 5, 6, 0];
const DAY_FULL = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"];

const COLORS: Record<string, { bg: string; border: string; text: string; subtext: string; dot: string }> = {
  blue:   { bg: "bg-blue-50",   border: "border-blue-300",   text: "text-blue-800",   subtext: "text-blue-500",   dot: "bg-blue-400"   },
  red:    { bg: "bg-red-50",    border: "border-red-300",    text: "text-red-800",    subtext: "text-red-400",    dot: "bg-red-400"    },
  orange: { bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-800", subtext: "text-orange-400", dot: "bg-orange-400" },
  yellow: { bg: "bg-yellow-50", border: "border-yellow-300", text: "text-yellow-800", subtext: "text-yellow-400", dot: "bg-yellow-400" },
  green:  { bg: "bg-green-50",  border: "border-green-300",  text: "text-green-800",  subtext: "text-green-500",  dot: "bg-green-400"  },
  purple: { bg: "bg-purple-50", border: "border-purple-300", text: "text-purple-800", subtext: "text-purple-400", dot: "bg-purple-400" },
  pink:   { bg: "bg-pink-50",   border: "border-pink-300",   text: "text-pink-800",   subtext: "text-pink-400",   dot: "bg-pink-400"   },
  teal:   { bg: "bg-teal-50",   border: "border-teal-300",   text: "text-teal-800",   subtext: "text-teal-500",   dot: "bg-teal-400"   },
};

const PLAN_COLORS: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  blue:   { bg: "bg-blue-50",   text: "text-blue-700",   dot: "bg-blue-400",   border: "border-blue-200"   },
  red:    { bg: "bg-red-50",    text: "text-red-700",    dot: "bg-red-400",    border: "border-red-200"    },
  orange: { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-400", border: "border-orange-200" },
  yellow: { bg: "bg-yellow-50", text: "text-yellow-700", dot: "bg-yellow-400", border: "border-yellow-200" },
  green:  { bg: "bg-green-50",  text: "text-green-700",  dot: "bg-green-400",  border: "border-green-200"  },
  purple: { bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-400", border: "border-purple-200" },
  pink:   { bg: "bg-pink-50",   text: "text-pink-700",   dot: "bg-pink-400",   border: "border-pink-200"   },
  teal:   { bg: "bg-teal-50",   text: "text-teal-700",   dot: "bg-teal-400",   border: "border-teal-200"   },
};

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

  return (
    <div className={hidePlan ? "flex flex-col gap-3" : "flex gap-4 items-start"}>
      {/* ── Timeline ── */}
      <div className="flex-1 min-w-0 rounded-xl border border-border/60 bg-white dark:bg-background shadow-sm overflow-hidden">
        {/* Date nav header */}
        <div className="relative z-40 flex items-center justify-between px-4 border-b border-border/60 bg-muted/20" style={{ height: 48 }}>
          <button
            onClick={() => setDate((d) => addDays(d, -1))}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-3">
            <div className="text-center">
              <p className="text-sm font-bold leading-tight">{formatDateKo(date)}</p>
              <p className={cn(
                "text-xs font-semibold mt-0.5",
                dayIdx === 5 ? "text-blue-500" : dayIdx === 6 ? "text-red-500" : "text-muted-foreground"
              )}>
                {DAY_FULL[dayIdx]}
              </p>
            </div>
            {!isToday && (
              <button
                onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setDate(d); }}
                className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 font-medium hover:bg-blue-100 transition-colors border border-blue-200"
              >
                오늘
              </button>
            )}
            {isToday && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500 text-white font-medium">오늘</span>
            )}
          </div>

          <button
            onClick={() => setDate((d) => addDays(d, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* All-day strip */}
        <div className="relative z-40 border-b border-border/40 bg-muted/5 px-3 py-2 flex items-center flex-wrap gap-1.5" style={{ minHeight: 44 }}>
          <span className="text-[10px] text-muted-foreground/50 font-medium shrink-0" style={{ width: TIME_COL_W - 12, textAlign: "right" }}>
            종일
          </span>
          {/* School events (read-only chips) */}
          {dateSchoolEvents.map((ev) => {
            const isExam = ev.type === "SCHOOL_EXAM";
            return (
              <span
                key={ev.id}
                className={cn(
                  "text-xs font-semibold px-3 py-1 rounded-full border",
                  isExam
                    ? "bg-red-50 border-red-200 text-red-700"
                    : "bg-purple-50 border-purple-200 text-purple-700"
                )}
                title={ev.title}
              >
                {ev.title}
              </span>
            );
          })}
          {allDayEntries.map((entry) => {
            const c = COLORS[entry.colorCode] ?? COLORS.blue;
            const isSelected = entryPanel?.mode === "edit" && entryPanel.entry.id === entry.id;
            return (
              <button
                key={entry.id}
                onClick={() => openEditEntry(entry)}
                className={cn(
                  "text-xs font-semibold px-3 py-1 rounded-full border transition-all",
                  c.bg, c.border, c.text,
                  isSelected && "ring-2 ring-blue-400 ring-offset-1"
                )}
              >
                {entry.subject}
              </button>
            );
          })}
          <button
            onClick={() => {
              setEntryPanel({ mode: "create", startTime: "00:00", endTime: "23:59" });
              setEntryForm({ subject: "", details: "", colorCode: "blue", allDay: true });
            }}
            className="text-muted-foreground/40 hover:text-muted-foreground transition-colors p-1 rounded-md hover:bg-muted/50"
            title="종일 일정 추가"
          >
            <Plus className="h-3.5 w-3.5" />
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
            <div className="relative border-r border-border/40">
              {hourLabels.map((h) => (
                <div
                  key={h}
                  className="absolute w-full flex items-center justify-end pr-3"
                  style={{ top: (h - START_HOUR) * HOUR_HEIGHT - 8, height: 16 }}
                >
                  <span className="text-xs text-muted-foreground/70 font-mono tabular-nums">
                    {String(h).padStart(2, "0")}:00
                  </span>
                </div>
              ))}
              {/* Current time label */}
              {isToday && nowInRange && (
                <div
                  className="absolute w-full flex items-center justify-end pr-2 z-30 pointer-events-none"
                  style={{ top: minToY(currentMin), transform: "translateY(-50%)" }}
                >
                  <span className="text-[10px] font-bold text-red-500 font-mono tabular-nums bg-white dark:bg-background px-0.5 leading-none">
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
                <div key={h} className="absolute w-full border-t border-border/30" style={{ top: (h - START_HOUR) * HOUR_HEIGHT }} />
              ))}
              {/* Half-hour dashed lines */}
              {hourLabels.map((h) => (
                <div
                  key={`${h}h`}
                  className="absolute w-full border-t border-border/15"
                  style={{ top: (h - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2, borderStyle: "dashed" }}
                />
              ))}

              {/* Current time line */}
              {isToday && nowInRange && (
                <div className="absolute left-0 right-0 z-30 pointer-events-none" style={{ top: minToY(currentMin) }}>
                  <div className="flex items-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1 shrink-0" />
                    <div className="flex-1 h-px bg-red-400" />
                  </div>
                </div>
              )}

              {/* Timed entries */}
              {timedEntries.map((entry) => {
                const top = minToY(timeToMin(entry.startTime));
                const height = Math.max(28, minToY(timeToMin(entry.endTime)) - top);
                const c = COLORS[entry.colorCode] ?? COLORS.blue;
                const isSelected = entryPanel?.mode === "edit" && entryPanel.entry.id === entry.id;
                return (
                  <div
                    key={entry.id}
                    className={cn(
                      "absolute left-2 right-2 rounded-md border-l-[3px] shadow-sm cursor-pointer hover:shadow-md transition-shadow overflow-hidden",
                      c.bg, c.border,
                      isSelected && "ring-2 ring-offset-1 ring-blue-400"
                    )}
                    style={{ top, height, zIndex: 10 }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => openEditEntry(entry)}
                  >
                    <div className="px-2.5 py-1.5 h-full flex flex-col overflow-hidden">
                      <p className={cn("text-sm font-bold leading-tight truncate", c.text)}>{entry.subject}</p>
                      {height > 48 && entry.details && (
                        <p className={cn("text-xs leading-tight truncate mt-0.5", c.subtext)}>{entry.details}</p>
                      )}
                      {height > 34 && (
                        <p className={cn("text-[11px] font-mono mt-auto", c.subtext)}>{entry.startTime} – {entry.endTime}</p>
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
                    className="absolute left-2 right-2 rounded border-2 border-dashed border-blue-400/60 bg-blue-100/40 pointer-events-none"
                    style={{ top, height, zIndex: 20 }}
                  >
                    <p className="text-xs text-blue-600 font-mono px-2 pt-1">
                      {minToTime(startMin)} – {minToTime(endMin)}
                    </p>
                  </div>
                );
              })()}

              {/* Preview block (create panel open, not all-day) */}
              {!dragCreate && entryPanel?.mode === "create" && !entryForm.allDay && (() => {
                const top = minToY(timeToMin(entryPanel.startTime));
                const height = Math.max((SNAP / 60) * HOUR_HEIGHT, minToY(timeToMin(entryPanel.endTime)) - top);
                const c = COLORS[entryForm.colorCode] ?? COLORS.blue;
                return (
                  <div
                    className={cn("absolute left-2 right-2 rounded-md border-l-[3px] pointer-events-none opacity-70", c.bg, c.border)}
                    style={{ top, height, zIndex: 15 }}
                  >
                    <div className="px-2.5 py-1.5">
                      <p className={cn("text-sm font-bold leading-tight", c.text)}>{entryForm.subject || "새 일정"}</p>
                      <p className={cn("text-[11px] font-mono mt-0.5", c.subtext)}>{entryPanel.startTime} – {entryPanel.endTime}</p>
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
              <DialogTitle className="text-base">
                {entryPanel?.mode === "create" ? "새 일정 추가" : "일정 수정"}
              </DialogTitle>
            </DialogHeader>
            {entryPanel && (
              <div className="space-y-3 pt-1">
                {entryForm.allDay ? (
                  <div className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2 border border-blue-100">
                    <CalendarDays className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                    <span className="text-xs text-blue-600 font-medium">{DAY_FULL[dayIdx]} · 종일</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs font-mono text-muted-foreground">
                      {entryPanel.mode === "create" ? entryPanel.startTime : entryPanel.entry.startTime}
                      {" – "}
                      {entryPanel.mode === "create" ? entryPanel.endTime : entryPanel.entry.endTime}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">종일 일정</label>
                  <button
                    type="button"
                    onClick={() => setEntryForm((f) => ({ ...f, allDay: !f.allDay }))}
                    className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors", entryForm.allDay ? "bg-blue-500" : "bg-muted border border-border")}
                  >
                    <span className={cn("inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform", entryForm.allDay ? "translate-x-4" : "translate-x-0.5")} />
                  </button>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">과목명 *</label>
                  <input
                    type="text"
                    placeholder="수학, 영어, 자습 등"
                    value={entryForm.subject}
                    onChange={(e) => setEntryForm((f) => ({ ...f, subject: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") entryPanel.mode === "create" ? handleCreateEntry() : handleUpdateEntry(); }}
                    autoFocus
                    className="w-full rounded-lg border border-border/70 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 bg-background"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">메모</label>
                  <textarea
                    placeholder="선생님, 교재, 숙제 내용 등"
                    value={entryForm.details}
                    onChange={(e) => setEntryForm((f) => ({ ...f, details: e.target.value }))}
                    rows={2}
                    className="w-full rounded-lg border border-border/70 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 bg-background resize-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">색상</label>
                  <div className="flex gap-2 flex-wrap">
                    {Object.entries(COLORS).map(([key, c]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setEntryForm((f) => ({ ...f, colorCode: key }))}
                        className={cn(
                          "w-6 h-6 rounded-full transition-all border",
                          c.bg, c.border,
                          entryForm.colorCode === key
                            ? "ring-2 ring-offset-2 ring-foreground/30 scale-110"
                            : "opacity-50 hover:opacity-80"
                        )}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-border/40">
                  {entryPanel.mode === "edit" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 h-8 px-2"
                      onClick={() => handleDeleteEntry(entryPanel.entry.id)}
                      disabled={isEntryPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />삭제
                    </Button>
                  ) : <div />}
                  <Button
                    size="sm"
                    className="h-8 px-4"
                    onClick={entryPanel.mode === "create" ? handleCreateEntry : handleUpdateEntry}
                    disabled={isEntryPending}
                  >
                    {entryPanel.mode === "create" ? "추가하기" : "저장하기"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* ── Right panel ── */}
      {!hidePlan && <div className="w-80 shrink-0 flex flex-col gap-3 overflow-y-auto" style={{ maxHeight: "calc(100vh - 180px)" }}>

        {/* Entry form */}
        {entryPanel && (
          <div className="rounded-xl border border-border/60 bg-white dark:bg-background shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/30">
              <p className="font-semibold text-sm">
                {entryPanel.mode === "create" ? "새 일정 추가" : "일정 수정"}
              </p>
              <button
                onClick={() => setEntryPanel(null)}
                className="text-muted-foreground hover:text-foreground rounded-md p-0.5 hover:bg-muted/50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {/* Time / AllDay badge */}
              {entryForm.allDay ? (
                <div className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2 border border-blue-100">
                  <CalendarDays className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  <span className="text-xs text-blue-600 font-medium">
                    {DAY_FULL[dayIdx]} · 종일
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs font-mono text-muted-foreground">
                    {entryPanel.mode === "create" ? entryPanel.startTime : entryPanel.entry.startTime}
                    {" – "}
                    {entryPanel.mode === "create" ? entryPanel.endTime : entryPanel.entry.endTime}
                  </span>
                </div>
              )}

              {/* AllDay toggle */}
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">종일 일정</label>
                <button
                  type="button"
                  onClick={() => setEntryForm((f) => ({ ...f, allDay: !f.allDay }))}
                  className={cn(
                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                    entryForm.allDay ? "bg-blue-500" : "bg-muted border border-border"
                  )}
                >
                  <span className={cn(
                    "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                    entryForm.allDay ? "translate-x-4" : "translate-x-0.5"
                  )} />
                </button>
              </div>

              {/* Subject */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">과목명 *</label>
                <input
                  type="text"
                  placeholder="수학, 영어, 자습 등"
                  value={entryForm.subject}
                  onChange={(e) => setEntryForm((f) => ({ ...f, subject: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") entryPanel.mode === "create" ? handleCreateEntry() : handleUpdateEntry(); }}
                  autoFocus
                  className="w-full rounded-lg border border-border/70 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 bg-background"
                />
              </div>

              {/* Details */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">메모</label>
                <textarea
                  placeholder="선생님, 교재, 숙제 내용 등"
                  value={entryForm.details}
                  onChange={(e) => setEntryForm((f) => ({ ...f, details: e.target.value }))}
                  rows={2}
                  className="w-full rounded-lg border border-border/70 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 bg-background resize-none"
                />
              </div>

              {/* Color */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">색상</label>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(COLORS).map(([key, c]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setEntryForm((f) => ({ ...f, colorCode: key }))}
                      className={cn(
                        "w-6 h-6 rounded-full transition-all border",
                        c.bg, c.border,
                        entryForm.colorCode === key
                          ? "ring-2 ring-offset-2 ring-foreground/30 scale-110"
                          : "opacity-50 hover:opacity-80"
                      )}
                    />
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-1 border-t border-border/40">
                {entryPanel.mode === "edit" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 h-8 px-2"
                    onClick={() => handleDeleteEntry(entryPanel.entry.id)}
                    disabled={isEntryPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    삭제
                  </Button>
                ) : <div />}
                <Button
                  size="sm"
                  className="h-8 px-4"
                  onClick={entryPanel.mode === "create" ? handleCreateEntry : handleUpdateEntry}
                  disabled={isEntryPending}
                >
                  {entryPanel.mode === "create" ? "추가하기" : "저장하기"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Study plan card */}
        <div className="rounded-xl border border-border/60 bg-white dark:bg-background shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/20">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <p className="font-bold text-sm">오늘의 학습 계획</p>
            </div>
            <div className="flex items-center gap-2">
              {dirty && <span className="text-[10px] text-muted-foreground animate-pulse">저장 중...</span>}
              {!dirty && loadedKey && <span className="text-[10px] text-muted-foreground/50">저장됨</span>}
            </div>
          </div>

          {items.length > 0 && (
            <div className="px-4 py-2.5 border-b border-border/40 bg-muted/10">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground">{done}/{items.length}개 완료</span>
                {totalMin > 0 && (
                  <span className="text-xs text-muted-foreground font-mono">
                    {Math.floor(doneMin / 60)}h {doneMin % 60}m / {Math.floor(totalMin / 60)}h {totalMin % 60}m
                  </span>
                )}
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${items.length > 0 ? (done / items.length) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          <div className="p-3 space-y-1.5 max-h-80 overflow-y-auto">
            {items.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground/50">
                <BookOpen className="h-6 w-6" />
                <p className="text-xs">학습 계획을 추가해보세요</p>
              </div>
            )}

            {items.map((item) => {
              const c = PLAN_COLORS[item.colorCode] ?? PLAN_COLORS.blue;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "group flex items-start gap-2 rounded-lg p-2.5 border transition-all",
                    item.done ? "bg-muted/30 border-border/30 opacity-60" : cn(c.bg, c.border)
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleItem(item.id)}
                    className={cn("mt-0.5 shrink-0 transition-colors", item.done ? "text-muted-foreground" : c.text)}
                  >
                    {item.done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                  </button>

                  <div className="flex-1 min-w-0 space-y-1">
                    <input
                      data-plan-item
                      type="text"
                      value={item.text}
                      onChange={(e) => updateItemText(item.id, e.target.value)}
                      placeholder="과목 또는 내용"
                      className={cn(
                        "w-full bg-transparent text-sm font-medium focus:outline-none placeholder:text-muted-foreground/40",
                        item.done ? "line-through text-muted-foreground" : c.text
                      )}
                      onKeyDown={(e) => { if (e.key === "Enter") addItem(); }}
                    />
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                      <input
                        type="number"
                        value={item.duration ?? ""}
                        onChange={(e) => updateItemDuration(item.id, e.target.value)}
                        placeholder="시간(분)"
                        min={0}
                        className="w-20 bg-transparent text-xs text-muted-foreground focus:outline-none placeholder:text-muted-foreground/30"
                      />
                      {item.duration && (
                        <span className="text-xs text-muted-foreground/60 font-mono">
                          {item.duration >= 60
                            ? `${Math.floor(item.duration / 60)}h ${item.duration % 60 > 0 ? `${item.duration % 60}m` : ""}`.trim()
                            : `${item.duration}m`}
                        </span>
                      )}
                      <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {Object.entries(PLAN_COLORS).map(([key, col]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => updateItemColor(item.id, key)}
                            className={cn(
                              "w-3 h-3 rounded-full transition-transform",
                              col.dot,
                              item.colorCode === key ? "scale-125 ring-1 ring-offset-1 ring-foreground/30" : ""
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="mt-0.5 shrink-0 text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="px-3 pb-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-8 text-xs gap-1.5 border border-dashed border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/30"
              onClick={addItem}
            >
              <Plus className="h-3.5 w-3.5" />
              계획 추가
            </Button>
          </div>
        </div>

        {/* Notes card */}
        <div className="rounded-xl border border-border/60 bg-white dark:bg-background shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/60 bg-muted/20">
            <StickyNote className="h-4 w-4 text-muted-foreground" />
            <p className="font-semibold text-sm">메모</p>
          </div>
          <div className="p-3">
            <textarea
              value={notes}
              onChange={(e) => updateNotes(e.target.value)}
              placeholder="오늘 공부하면서 느낀 점, 복습할 내용 등을 자유롭게 남겨보세요"
              rows={5}
              className="w-full bg-transparent text-sm text-foreground resize-none focus:outline-none placeholder:text-muted-foreground/40 leading-relaxed"
            />
          </div>
        </div>

        {/* Summary card */}
        {items.some((it) => it.done) && (
          <div className="rounded-xl border border-border/60 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 p-4">
            <p className="text-sm font-bold text-blue-800 dark:text-blue-300 mb-1">오늘 공부한 시간</p>
            <p className="text-2xl font-black text-blue-600 tabular-nums">
              {Math.floor(doneMin / 60)}
              <span className="text-base font-semibold">시간</span>
              {" "}
              {doneMin % 60 > 0 && (
                <>{doneMin % 60}<span className="text-base font-semibold">분</span></>
              )}
            </p>
            <p className="text-xs text-blue-600/70 mt-1">
              목표 {Math.floor(totalMin / 60)}시간 {totalMin % 60 > 0 ? `${totalMin % 60}분` : ""} 중
            </p>
          </div>
        )}
      </div>}
    </div>
  );
}
