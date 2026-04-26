"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import {
  createTimetableEntry,
  updateTimetableEntry,
  deleteTimetableEntry,
} from "@/actions/timetable";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Download, Trash2, X, Clock, Plus, CalendarDays } from "lucide-react";
import type { SchoolEventInfo } from "@/actions/timetable";

// ── Constants ──────────────────────────────────────────────────────────────
const START_HOUR = 6;
const END_HOUR = 23;
const HOUR_HEIGHT = 72; // px per hour
const SNAP = 15;
const TOTAL_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT;
const TIME_COL_W = 60;
const HEADER_H = 44;

const DAYS = [1, 2, 3, 4, 5, 6, 0]; // Mon…Sat, Sun
const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

// Tailwind-safe color definitions
const COLORS: Record<string, {
  bg: string; border: string; text: string; subtext: string;
  handle: string; dot: string; previewBg: string; previewBorder: string;
}> = {
  blue:   { bg: "bg-blue-50",   border: "border-blue-300",   text: "text-blue-800",   subtext: "text-blue-500",   handle: "bg-blue-400",   dot: "bg-blue-400",   previewBg: "bg-blue-100/70",   previewBorder: "border-blue-400"   },
  red:    { bg: "bg-red-50",    border: "border-red-300",    text: "text-red-800",    subtext: "text-red-400",    handle: "bg-red-400",    dot: "bg-red-400",    previewBg: "bg-red-100/70",    previewBorder: "border-red-400"    },
  orange: { bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-800", subtext: "text-orange-400", handle: "bg-orange-400", dot: "bg-orange-400", previewBg: "bg-orange-100/70", previewBorder: "border-orange-400" },
  yellow: { bg: "bg-yellow-50", border: "border-yellow-300", text: "text-yellow-800", subtext: "text-yellow-400", handle: "bg-yellow-400", dot: "bg-yellow-400", previewBg: "bg-yellow-100/70", previewBorder: "border-yellow-400" },
  green:  { bg: "bg-green-50",  border: "border-green-300",  text: "text-green-800",  subtext: "text-green-500",  handle: "bg-green-400",  dot: "bg-green-400",  previewBg: "bg-green-100/70",  previewBorder: "border-green-400"  },
  purple: { bg: "bg-purple-50", border: "border-purple-300", text: "text-purple-800", subtext: "text-purple-400", handle: "bg-purple-400", dot: "bg-purple-400", previewBg: "bg-purple-100/70", previewBorder: "border-purple-400" },
  pink:   { bg: "bg-pink-50",   border: "border-pink-300",   text: "text-pink-800",   subtext: "text-pink-400",   handle: "bg-pink-400",   dot: "bg-pink-400",   previewBg: "bg-pink-100/70",   previewBorder: "border-pink-400"   },
  teal:   { bg: "bg-teal-50",   border: "border-teal-300",   text: "text-teal-800",   subtext: "text-teal-500",   handle: "bg-teal-400",   dot: "bg-teal-400",   previewBg: "bg-teal-100/70",   previewBorder: "border-teal-400"   },
};

// ── Helpers ────────────────────────────────────────────────────────────────
function timeToMin(t: string): number {
  if (!t) return START_HOUR * 60;
  const [h, m] = t.split(":").map(Number);
  // "FLEXIBLE" 등 비HH:MM 문자열이 들어오면 NaN → 캔버스 위치/높이 망가짐. 안전한 기본값.
  if (Number.isNaN(h) || Number.isNaN(m)) return START_HOUR * 60;
  return h * 60 + m;
}
function minToTime(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
function yToMin(y: number): number {
  const raw = (y / HOUR_HEIGHT) * 60 + START_HOUR * 60;
  const snapped = Math.round(raw / SNAP) * SNAP;
  return Math.max(START_HOUR * 60, Math.min(END_HOUR * 60 - SNAP, snapped));
}
function minToY(min: number): number {
  return ((min - START_HOUR * 60) / 60) * HOUR_HEIGHT;
}
function nowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}
function isAllDay(e: { allDay?: boolean; startTime: string; endTime: string }) {
  return e.allDay === true || (e.startTime === "00:00" && e.endTime === "23:59");
}
function todayDayOfWeek(): number {
  return new Date().getDay();
}
// Returns the date (midnight) for a given day-of-week in the current week (Mon–Sun)
function getThisWeekDate(dow: number): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayDow = today.getDay(); // 0=Sun
  const mondayOffset = todayDow === 0 ? -6 : 1 - todayDow;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  const offset = dow === 0 ? 6 : dow - 1;
  const d = new Date(monday);
  d.setDate(monday.getDate() + offset);
  return d;
}
function dateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

// ── Types ──────────────────────────────────────────────────────────────────
export type TimetableEntry = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  subject: string;
  details: string | null;
  colorCode: string;
  allDay?: boolean;
};

export type AutoBlock = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  type: "ATTENDANCE" | "OUTING";
  label: string;
};

type DragCreate = { dayIdx: number; anchorMin: number; currentMin: number };
type DragResize = { id: string; startMin: number; currentEndMin: number };

type Panel =
  | { mode: "create"; dayOfWeek: number; startTime: string; endTime: string }
  | { mode: "edit"; entry: TimetableEntry }
  | { mode: "auto"; block: AutoBlock; dayLabel: string };

// ── Component ─────────────────────────────────────────────────────────────
interface Props {
  studentId: string;
  studentName: string;
  initialEntries: TimetableEntry[];
  autoBlocks?: AutoBlock[];
  compact?: boolean;
  schoolEvents?: SchoolEventInfo[];
}

export function TimetableGrid({
  studentId,
  studentName,
  initialEntries,
  autoBlocks = [],
  compact = false,
  schoolEvents = [],
}: Props) {
  const [entries, setEntries] = useState<TimetableEntry[]>(initialEntries);
  const [dragCreate, setDragCreate] = useState<DragCreate | null>(null);
  const [dragResize, setDragResize] = useState<DragResize | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [form, setForm] = useState({ subject: "", details: "", colorCode: "blue", allDay: false });
  const [isPending, startTransition] = useTransition();
  const [currentMin, setCurrentMin] = useState(nowMinutes());

  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null); // wraps only the grid (no panel)
  const gridOnlyRef = useRef<HTMLDivElement>(null); // the rounded border container
  const dragCreateRef = useRef(dragCreate);
  const dragResizeRef = useRef(dragResize);

  useEffect(() => { dragCreateRef.current = dragCreate; }, [dragCreate]);
  useEffect(() => { dragResizeRef.current = dragResize; }, [dragResize]);

  // Update current time every minute
  useEffect(() => {
    const id = setInterval(() => setCurrentMin(nowMinutes()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Scroll to current time on mount
  useEffect(() => {
    if (!scrollRef.current) return;
    const y = minToY(currentMin) - 120;
    scrollRef.current.scrollTop = Math.max(0, y);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function getBodyY(clientY: number): number {
    if (!bodyRef.current) return 0;
    return clientY - bodyRef.current.getBoundingClientRect().top;
  }

  // ── Global mouse events ──
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const dc = dragCreateRef.current;
      const dr = dragResizeRef.current;
      if (!dc && !dr) return;
      const pos = yToMin(getBodyY(e.clientY));
      if (dc) setDragCreate((d) => d ? { ...d, currentMin: pos } : null);
      if (dr) {
        const newEnd = Math.max(dr.startMin + SNAP, pos + SNAP);
        setDragResize((d) => d ? { ...d, currentEndMin: newEnd } : null);
      }
    }
    function onUp() {
      const dc = dragCreateRef.current;
      const dr = dragResizeRef.current;
      if (dc) {
        const startMin = Math.min(dc.anchorMin, dc.currentMin);
        const endMin = Math.max(dc.anchorMin, dc.currentMin) + SNAP;
        if (endMin - startMin >= SNAP) {
          setPanel({
            mode: "create",
            dayOfWeek: DAYS[dc.dayIdx],
            startTime: minToTime(startMin),
            endTime: minToTime(endMin),
          });
          setForm({ subject: "", details: "", colorCode: "blue", allDay: false });
        }
        setDragCreate(null);
      }
      if (dr) {
        const newEndTime = minToTime(dr.currentEndMin);
        const id = dr.id;
        startTransition(async () => {
          try {
            await updateTimetableEntry(id, { endTime: newEndTime });
            setEntries((prev) => prev.map((e) => e.id === id ? { ...e, endTime: newEndTime } : e));
            setPanel((p) =>
              p?.mode === "edit" && p.entry.id === id
                ? { ...p, entry: { ...p.entry, endTime: newEndTime } }
                : p
            );
          } catch { toast.error("저장 실패"); }
        });
        setDragResize(null);
      }
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleColMouseDown(e: React.MouseEvent, dayIdx: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    const min = yToMin(getBodyY(e.clientY));
    setDragCreate({ dayIdx, anchorMin: min, currentMin: min });
  }

  function handleResizeMouseDown(e: React.MouseEvent, entry: TimetableEntry) {
    e.preventDefault();
    e.stopPropagation();
    setDragResize({
      id: entry.id,
      startMin: timeToMin(entry.startTime),
      currentEndMin: timeToMin(entry.endTime),
    });
  }

  function handleCreate() {
    if (!panel || panel.mode !== "create") return;
    if (!form.subject.trim()) { toast.error("과목명을 입력하세요"); return; }
    startTransition(async () => {
      try {
        const entry = await createTimetableEntry({
          studentId,
          dayOfWeek: panel.dayOfWeek,
          startTime: panel.startTime,
          endTime: panel.endTime,
          subject: form.subject.trim(),
          details: form.details.trim() || undefined,
          colorCode: form.colorCode,
        });
        const newEntry = { ...entry, details: entry.details ?? null };
        setEntries((prev) => [...prev, newEntry]);
        setPanel({ mode: "edit", entry: newEntry });
        toast.success("등록되었습니다");
      } catch { toast.error("등록 실패"); }
    });
  }

  function handleUpdate() {
    if (!panel || panel.mode !== "edit") return;
    if (!form.subject.trim()) { toast.error("과목명을 입력하세요"); return; }
    startTransition(async () => {
      try {
        const updated = {
          subject: form.subject.trim(),
          details: form.details.trim() || null,
          colorCode: form.colorCode,
          allDay: form.allDay,
          startTime: form.allDay ? "00:00" : panel.entry.startTime,
          endTime: form.allDay ? "23:59" : panel.entry.endTime,
        };
        await updateTimetableEntry(panel.entry.id, updated);
        setEntries((prev) => prev.map((e) => e.id === panel.entry.id ? { ...e, ...updated } : e));
        setPanel((p) => p?.mode === "edit" ? { ...p, entry: { ...p.entry, ...updated } } : p);
        toast.success("수정되었습니다");
      } catch { toast.error("수정 실패"); }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteTimetableEntry(id);
        setEntries((prev) => prev.filter((e) => e.id !== id));
        setPanel(null);
        toast.success("삭제되었습니다");
      } catch { toast.error("삭제 실패"); }
    });
  }

  function openEdit(entry: TimetableEntry) {
    setPanel({ mode: "edit", entry });
    setForm({ subject: entry.subject, details: entry.details ?? "", colorCode: entry.colorCode, allDay: entry.allDay ?? false });
  }

  async function exportPDF() {
    const target = gridOnlyRef.current;
    const scroller = scrollRef.current;
    if (!target || !scroller) return;
    try {
      const { toPng } = await import("html-to-image");
      const { jsPDF } = await import("jspdf");
      toast.info("PDF 생성 중...");

      // Expand scroll container so full content is captured
      const prevMaxHeight = scroller.style.maxHeight;
      const prevOverflow = scroller.style.overflowY;
      scroller.style.maxHeight = "none";
      scroller.style.overflowY = "visible";
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));

      // html-to-image uses the browser's rendering pipeline → handles oklch/lab colors
      const dataUrl = await toPng(target, { pixelRatio: 1.5, skipFonts: false });

      // Restore scroll
      scroller.style.maxHeight = prevMaxHeight;
      scroller.style.overflowY = prevOverflow;

      const img = new Image();
      img.src = dataUrl;
      await new Promise((r) => { img.onload = r; });

      const imgW = img.naturalWidth / 1.5;
      const imgH = img.naturalHeight / 1.5;
      const pdf = new jsPDF({
        orientation: imgW > imgH ? "landscape" : "portrait",
        unit: "px",
        format: [imgW, imgH],
      });
      pdf.addImage(dataUrl, "PNG", 0, 0, imgW, imgH);
      pdf.save(`${studentName}_시간표.pdf`);
      toast.success("PDF 저장 완료");
    } catch (e) {
      console.error(e);
      toast.error("PDF 내보내기 실패");
    }
  }

  const hourLabels = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  const today = todayDayOfWeek();
  const nowInRange = currentMin >= START_HOUR * 60 && currentMin < END_HOUR * 60;

  // Preview block while create panel is open
  const previewColor = COLORS[form.colorCode] ?? COLORS.blue;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      {!compact && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>빈 칸을 드래그해서 일정을 추가하세요</span>
          </div>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={exportPDF}>
            <Download className="h-3.5 w-3.5" />
            PDF 내보내기
          </Button>
        </div>
      )}

      <div className="flex gap-4 items-start">
        {/* ── Grid ── */}
        <div
          ref={gridOnlyRef}
          className="flex-1 min-w-0 rounded-xl border border-border/60 overflow-hidden bg-white dark:bg-background shadow-sm"
        >
          <div
            ref={scrollRef}
            className="overflow-y-auto"
            style={{ maxHeight: compact ? "440px" : "calc(100vh - 200px)" }}
          >
            {/* Sticky header + all-day row */}
            <div className="sticky top-0 z-40 bg-white dark:bg-background">
              {/* Day labels */}
              <div
                className="border-b border-border/60"
                style={{ gridTemplateColumns: `${TIME_COL_W}px repeat(7, 1fr)`, display: "grid" }}
              >
                <div style={{ height: HEADER_H, width: TIME_COL_W }} />
                {DAY_LABELS.map((label, i) => {
                  const isToday = DAYS[i] === today;
                  return (
                    <div
                      key={label}
                      className="flex items-center justify-center gap-2 border-l border-border/40 first:border-l-0"
                      style={{ height: HEADER_H }}
                    >
                      <span
                        className={cn(
                          "text-sm font-bold tracking-wide",
                          isToday ? "text-blue-600" : i === 5 ? "text-blue-400" : i === 6 ? "text-red-400" : "text-muted-foreground"
                        )}
                      >
                        {label}
                      </span>
                      {isToday && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
                          ●
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* All-day row */}
              <div
                className="border-b border-border/40 bg-muted/5"
                style={{ gridTemplateColumns: `${TIME_COL_W}px repeat(7, 1fr)`, display: "grid" }}
              >
                <div className="flex items-center justify-end pr-2 text-[10px] text-muted-foreground/50 font-medium border-r border-border/30" style={{ minHeight: 36 }}>
                  종일
                </div>
                {DAYS.map((day) => {
                  const dayAllDay = entries.filter((e) => e.dayOfWeek === day && isAllDay(e));
                  const isColToday = day === today;
                  const dayDate = getThisWeekDate(day);
                  const dayKey = dateKey(dayDate);
                  const daySchoolEvts = schoolEvents.filter((ev) => {
                    const start = dateKey(new Date(ev.startDate));
                    const end = ev.endDate ? dateKey(new Date(ev.endDate)) : start;
                    return dayKey >= start && dayKey <= end;
                  });
                  return (
                    <div
                      key={day}
                      className={cn(
                        "border-l border-border/30 first:border-l-0 px-1 py-1 flex flex-col gap-0.5",
                        isColToday && "bg-blue-50/20"
                      )}
                      style={{ minHeight: 36 }}
                    >
                      {/* School events (read-only) */}
                      {daySchoolEvts.map((ev) => {
                        const isExam = ev.type === "SCHOOL_EXAM";
                        return (
                          <div
                            key={ev.id}
                            className={cn(
                              "w-full text-left text-[11px] font-semibold px-2 py-0.5 rounded border truncate",
                              isExam
                                ? "bg-red-50 border-red-200 text-red-700"
                                : "bg-purple-50 border-purple-200 text-purple-700"
                            )}
                            title={ev.title}
                          >
                            {ev.title}
                          </div>
                        );
                      })}
                      {/* User all-day entries */}
                      {dayAllDay.map((entry) => {
                        const c = COLORS[entry.colorCode] ?? COLORS.blue;
                        const isSel = panel?.mode === "edit" && panel.entry.id === entry.id;
                        return (
                          <button
                            key={entry.id}
                            onClick={() => openEdit(entry)}
                            className={cn(
                              "w-full text-left text-[11px] font-semibold px-2 py-0.5 rounded border transition-all truncate",
                              c.bg, c.border, c.text,
                              isSel && "ring-1 ring-blue-400"
                            )}
                          >
                            {entry.subject}
                          </button>
                        );
                      })}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPanel({ mode: "create", dayOfWeek: day, startTime: "00:00", endTime: "23:59" });
                          setForm({ subject: "", details: "", colorCode: "blue", allDay: true });
                        }}
                        className="self-end text-muted-foreground/30 hover:text-muted-foreground transition-colors p-0.5 rounded mt-auto"
                        title="종일 일정 추가"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Body */}
            <div
              ref={bodyRef}
              className="grid"
              style={{ gridTemplateColumns: `${TIME_COL_W}px repeat(7, 1fr)`, height: TOTAL_HEIGHT }}
            >
              {/* Time labels */}
              <div className="relative">
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
                {nowInRange && (
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

              {/* Day columns */}
              {DAYS.map((day, dayIdx) => {
                const dayEntries = entries.filter((e) => e.dayOfWeek === day && !isAllDay(e));
                const dayAutoBlocks = autoBlocks.filter((b) => b.dayOfWeek === day);
                const isToday = day === today;

                // Drag ghost (during drag, before mouseup)
                const ghost =
                  dragCreate && dragCreate.dayIdx === dayIdx
                    ? {
                        top: minToY(Math.min(dragCreate.anchorMin, dragCreate.currentMin)),
                        height: Math.max(
                          (SNAP / 60) * HOUR_HEIGHT,
                          minToY(Math.max(dragCreate.anchorMin, dragCreate.currentMin) + SNAP) -
                            minToY(Math.min(dragCreate.anchorMin, dragCreate.currentMin))
                        ),
                        startMin: Math.min(dragCreate.anchorMin, dragCreate.currentMin),
                        endMin: Math.max(dragCreate.anchorMin, dragCreate.currentMin) + SNAP,
                      }
                    : null;

                // Preview block (after mouseup, while create panel is open)
                const preview =
                  !dragCreate &&
                  panel?.mode === "create" &&
                  panel.dayOfWeek === day
                    ? {
                        top: minToY(timeToMin(panel.startTime)),
                        height: Math.max(
                          (SNAP / 60) * HOUR_HEIGHT,
                          minToY(timeToMin(panel.endTime)) - minToY(timeToMin(panel.startTime))
                        ),
                      }
                    : null;

                return (
                  <div
                    key={day}
                    className={cn(
                      "relative border-l border-border/40 cursor-crosshair",
                      isToday && "bg-blue-50/30 dark:bg-blue-950/10"
                    )}
                    style={{ height: TOTAL_HEIGHT }}
                    onMouseDown={(e) => handleColMouseDown(e, dayIdx)}
                  >
                    {/* Hour lines */}
                    {hourLabels.map((h) => (
                      <div
                        key={h}
                        className="absolute w-full border-t border-border/30"
                        style={{ top: (h - START_HOUR) * HOUR_HEIGHT }}
                      />
                    ))}
                    {/* Half-hour dashed lines */}
                    {hourLabels.map((h) => (
                      <div
                        key={`${h}h`}
                        className="absolute w-full border-t border-border/15"
                        style={{ top: (h - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2, borderStyle: "dashed" }}
                      />
                    ))}

                    {/* Current time indicator */}
                    {isToday && nowInRange && (
                      <div
                        className="absolute left-0 right-0 z-30 pointer-events-none"
                        style={{ top: minToY(currentMin) }}
                      >
                        <div className="flex items-center">
                          <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shrink-0" />
                          <div className="flex-1 h-px bg-red-400" />
                        </div>
                      </div>
                    )}

                    {/* Auto blocks */}
                    {dayAutoBlocks.map((block, i) => {
                      const top = minToY(timeToMin(block.startTime));
                      const height = Math.max(
                        (SNAP / 60) * HOUR_HEIGHT,
                        minToY(timeToMin(block.endTime)) - top
                      );
                      const isAttend = block.type === "ATTENDANCE";
                      return (
                        <div
                          key={i}
                          className={cn(
                            "absolute left-0.5 right-0.5 rounded cursor-pointer transition-opacity",
                            isAttend
                              ? "bg-emerald-50 border border-emerald-200 hover:bg-emerald-100"
                              : "bg-amber-50 border border-amber-200 hover:bg-amber-100"
                          )}
                          style={{ top, height, zIndex: 2 }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPanel({ mode: "auto", block, dayLabel: DAY_LABELS[dayIdx] });
                          }}
                        >
                          <div className={cn(
                            "px-1.5 py-1 h-full overflow-hidden",
                          )}>
                            <div className={cn(
                              "flex items-center gap-1",
                              isAttend ? "text-emerald-600" : "text-amber-600"
                            )}>
                              <div className={cn("w-1 h-1 rounded-full shrink-0", isAttend ? "bg-emerald-400" : "bg-amber-400")} />
                              <p className="text-xs font-semibold truncate">{block.label}</p>
                            </div>
                            {height > 36 && (
                              <p className={cn("text-[10px] font-mono mt-0.5 opacity-70", isAttend ? "text-emerald-500" : "text-amber-500")}>
                                {block.startTime}–{block.endTime}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Timetable entries */}
                    {dayEntries.map((entry) => {
                      const startMin = timeToMin(entry.startTime);
                      const endMin =
                        dragResize && dragResize.id === entry.id
                          ? dragResize.currentEndMin
                          : timeToMin(entry.endTime);
                      const top = minToY(startMin);
                      const height = Math.max((SNAP / 60) * HOUR_HEIGHT, minToY(endMin) - top);
                      const c = COLORS[entry.colorCode] ?? COLORS.blue;
                      const isSelected = panel?.mode === "edit" && panel.entry.id === entry.id;
                      return (
                        <div
                          key={entry.id}
                          className={cn(
                            "absolute left-1 right-1 rounded-md border-l-[3px] overflow-hidden cursor-pointer",
                            "shadow-sm hover:shadow-md transition-shadow",
                            c.bg, c.border,
                            isSelected && "ring-2 ring-offset-1 ring-blue-400"
                          )}
                          style={{ top, height, zIndex: 10 }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={() => openEdit(entry)}
                        >
                          <div className="px-2 py-1.5 h-full flex flex-col overflow-hidden">
                            <p className={cn("text-xs font-bold leading-tight truncate", c.text)}>
                              {entry.subject}
                            </p>
                            {height > 50 && entry.details && (
                              <p className={cn("text-[11px] leading-tight truncate mt-0.5", c.subtext)}>
                                {entry.details}
                              </p>
                            )}
                            {height > 36 && (
                              <p className={cn("text-[10px] font-mono mt-auto", c.subtext)}>
                                {entry.startTime} – {entry.endTime}
                              </p>
                            )}
                          </div>
                          <div
                            className={cn("absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 hover:opacity-100 transition-opacity rounded-b", c.handle)}
                            onMouseDown={(e) => handleResizeMouseDown(e, entry)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      );
                    })}

                    {/* Drag ghost (during drag) */}
                    {ghost && (
                      <div
                        className="absolute left-1 right-1 rounded-md border-2 border-dashed border-blue-400/60 bg-blue-100/40 pointer-events-none"
                        style={{ top: ghost.top, height: ghost.height, zIndex: 20 }}
                      >
                        <p className="text-xs text-blue-600 font-mono px-2 pt-1">
                          {minToTime(ghost.startMin)} – {minToTime(ghost.endMin)}
                        </p>
                      </div>
                    )}

                    {/* Preview block (panel open, before saving) */}
                    {preview && (
                      <div
                        className={cn(
                          "absolute left-1 right-1 rounded-md border-l-[3px] border pointer-events-none",
                          previewColor.previewBg, previewColor.previewBorder
                        )}
                        style={{ top: preview.top, height: preview.height, zIndex: 15 }}
                      >
                        <div className="px-2 py-1">
                          <p className={cn("text-xs font-bold leading-tight truncate", previewColor.text)}>
                            {form.subject || "새 일정"}
                          </p>
                          <p className={cn("text-[10px] font-mono", previewColor.subtext)}>
                            {panel?.mode === "create" ? `${panel.startTime} – ${panel.endTime}` : ""}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Right panel ── */}
        {panel && (
          <div className="w-72 shrink-0 rounded-xl border border-border/60 bg-white dark:bg-background shadow-sm overflow-hidden sticky top-4">
            {/* Panel header */}
            <div className={cn(
              "flex items-center justify-between px-4 py-3 border-b border-border/60",
              panel.mode === "auto"
                ? panel.block.type === "ATTENDANCE" ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-amber-50 dark:bg-amber-950/20"
                : "bg-muted/30"
            )}>
              <p className="font-semibold text-sm">
                {panel.mode === "create" && "새 일정 추가"}
                {panel.mode === "edit" && "일정 수정"}
                {panel.mode === "auto" && (panel.block.type === "ATTENDANCE" ? "등원 일정" : "외출 일정")}
              </p>
              <button onClick={() => setPanel(null)} className="text-muted-foreground hover:text-foreground rounded-md p-0.5 hover:bg-muted/50">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* ── Auto block (read-only) ── */}
              {panel.mode === "auto" && (
                <>
                  <div className={cn(
                    "rounded-lg p-3 border",
                    panel.block.type === "ATTENDANCE"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                      : "bg-amber-50 border-amber-200 text-amber-800"
                  )}>
                    <p className="font-semibold text-sm">{panel.block.label}</p>
                    <p className="text-xs mt-1 font-mono opacity-80">
                      {panel.dayLabel}요일 · {panel.block.startTime} – {panel.block.endTime}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed bg-muted/40 rounded-lg px-3 py-2.5">
                    자동 등록된 일정입니다.<br />
                    출결 일정 관리 페이지에서 수정하세요.
                  </p>
                </>
              )}

              {/* ── Create / Edit ── */}
              {(panel.mode === "create" || panel.mode === "edit") && (
                <>
                  {/* Time badge / AllDay badge */}
                  {form.allDay ? (
                    <div className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2 border border-blue-100">
                      <CalendarDays className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      <span className="text-xs text-blue-600 font-medium">
                        {DAY_LABELS[DAYS.indexOf(panel.mode === "create" ? panel.dayOfWeek : panel.entry.dayOfWeek)]}요일 · 종일
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {DAY_LABELS[DAYS.indexOf(panel.mode === "create" ? panel.dayOfWeek : panel.entry.dayOfWeek)]}요일
                        </span>
                        {" · "}
                        <span className="font-mono">
                          {panel.mode === "create" ? panel.startTime : panel.entry.startTime}
                          {" – "}
                          {panel.mode === "create" ? panel.endTime : panel.entry.endTime}
                        </span>
                      </span>
                      {panel.mode === "edit" && (
                        <span className="ml-auto text-[9px] text-muted-foreground/50 leading-tight text-right">
                          하단 핸들로<br/>시간 조정
                        </span>
                      )}
                    </div>
                  )}

                  {/* AllDay toggle */}
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">종일 일정</label>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, allDay: !f.allDay }))}
                      className={cn(
                        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                        form.allDay ? "bg-blue-500" : "bg-muted border border-border"
                      )}
                    >
                      <span className={cn(
                        "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                        form.allDay ? "translate-x-4" : "translate-x-0.5"
                      )} />
                    </button>
                  </div>

                  {/* Subject */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">과목명 *</label>
                    <input
                      type="text"
                      placeholder="수학, 영어, 자습 등"
                      value={form.subject}
                      onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") panel.mode === "create" ? handleCreate() : handleUpdate(); }}
                      autoFocus
                      className="w-full rounded-lg border border-border/70 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 bg-background transition-all"
                    />
                  </div>

                  {/* Details */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">메모</label>
                    <textarea
                      placeholder="선생님, 교재, 숙제 내용 등"
                      value={form.details}
                      onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
                      rows={3}
                      className="w-full rounded-lg border border-border/70 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 bg-background resize-none transition-all"
                    />
                  </div>

                  {/* Color picker */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">색상</label>
                    <div className="flex gap-2 flex-wrap">
                      {Object.entries(COLORS).map(([key, c]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, colorCode: key }))}
                          className={cn(
                            "w-6 h-6 rounded-full transition-all",
                            c.dot,
                            form.colorCode === key
                              ? "ring-2 ring-offset-2 ring-foreground/30 scale-110"
                              : "opacity-50 hover:opacity-80"
                          )}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-1 border-t border-border/40">
                    {panel.mode === "edit" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 h-8 px-2"
                        onClick={() => handleDelete(panel.entry.id)}
                        disabled={isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        삭제
                      </Button>
                    ) : (
                      <div />
                    )}
                    <Button
                      size="sm"
                      className="h-8 px-4"
                      onClick={panel.mode === "create" ? handleCreate : handleUpdate}
                      disabled={isPending}
                    >
                      {panel.mode === "create" ? "추가하기" : "저장하기"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
