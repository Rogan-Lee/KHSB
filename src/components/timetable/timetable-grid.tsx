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
import { Notice, StatusBadge } from "@/components/backoffice/ui";
import { ConfirmDialog } from "@/components/calendar/confirm-dialog";
import { Download, X, Clock, Plus } from "lucide-react";
import type { SchoolEventInfo } from "@/actions/timetable";
import { EntryFormFields } from "./entry-form";
import { AUTO_BLOCK_TONE, LEGEND, schoolEventTone, timetableTone, weekdayTextClass } from "./tones";

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


  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const hourLabels = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  const today = todayDayOfWeek();
  const nowInRange = currentMin >= START_HOUR * 60 && currentMin < END_HOUR * 60;

  // Preview block while create panel is open
  const previewTone = timetableTone(form.colorCode);

  const panelTitle =
    panel?.mode === "create"
      ? "새 일정 추가"
      : panel?.mode === "edit"
        ? "일정 수정"
        : panel?.mode === "auto"
          ? `${AUTO_BLOCK_TONE[panel.block.type].label} 일정`
          : "";

  return (
    <div className="flex flex-col gap-x3">
      {/* Toolbar — 범례 · 도움말 · 내보내기 */}
      {!compact && (
        <div className="flex flex-wrap items-center justify-between gap-x3">
          <div className="flex flex-wrap items-center gap-x1_5" aria-label="범례">
            {LEGEND.map((l) => (
              <span
                key={l.label}
                className="inline-flex h-7 items-center gap-x1_5 rounded-full bg-bg-layer-fill px-x2_5 t3-medium text-fg-neutral-muted"
              >
                <span className={cn("size-3 rounded-r1 ring-1 ring-inset", l.swatch)} aria-hidden />
                {l.label}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-x3">
            <span className="hidden items-center gap-x1_5 t3-regular text-fg-neutral-subtle md:inline-flex">
              <Clock className="size-3.5" aria-hidden />
              빈 칸을 드래그해 일정을 추가해요
            </span>
            <Button variant="outline" size="sm" onClick={exportPDF}>
              <Download aria-hidden />
              PDF 저장
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-x4 lg:flex-row lg:items-start">
        {/* ── Grid ── */}
        <div
          ref={gridOnlyRef}
          className="min-w-0 flex-1 overflow-hidden rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default"
        >
          <div
            ref={scrollRef}
            className="overflow-y-auto"
            style={{ maxHeight: compact ? "440px" : "calc(100vh - 200px)" }}
          >
            {/* Sticky header + all-day row */}
            <div className="sticky top-0 z-40 bg-bg-layer-default">
              {/* Day labels */}
              <div
                className="border-b border-stroke-neutral-muted"
                style={{ gridTemplateColumns: `${TIME_COL_W}px repeat(7, 1fr)`, display: "grid" }}
              >
                <div style={{ height: HEADER_H, width: TIME_COL_W }} />
                {DAY_LABELS.map((label, i) => {
                  const isToday = DAYS[i] === today;
                  return (
                    <div
                      key={label}
                      className="flex items-center justify-center border-l border-stroke-neutral-muted"
                      style={{ height: HEADER_H }}
                    >
                      {isToday ? (
                        <span className="inline-flex h-7 items-center gap-x1 rounded-full bg-bg-brand-solid px-x2_5 t4-bold text-palette-static-white">
                          {label}
                          <span className="sr-only">(오늘)</span>
                        </span>
                      ) : (
                        <span className={cn("t4-bold", weekdayTextClass(DAYS[i]))}>{label}</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* All-day row */}
              <div
                className="border-b border-stroke-neutral-muted bg-bg-layer-fill"
                style={{ gridTemplateColumns: `${TIME_COL_W}px repeat(7, 1fr)`, display: "grid" }}
              >
                <div
                  className="flex items-center justify-end pr-x2 t2-medium text-fg-neutral-subtle"
                  style={{ minHeight: 40 }}
                >
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
                        "group/allday flex flex-col gap-x0_5 border-l border-stroke-neutral-muted p-x1",
                        isColToday && "bg-bg-brand-weak/40"
                      )}
                      style={{ minHeight: 40 }}
                    >
                      {/* School events (read-only) */}
                      {daySchoolEvts.map((ev) => (
                        <div
                          key={ev.id}
                          className={cn(
                            "w-full truncate rounded-r1 px-x1_5 py-x0_5 text-left t2-medium ring-1 ring-inset",
                            schoolEventTone(ev.type)
                          )}
                          title={ev.title}
                        >
                          {ev.title}
                        </div>
                      ))}
                      {/* User all-day entries */}
                      {dayAllDay.map((entry) => {
                        const t = timetableTone(entry.colorCode);
                        const isSel = panel?.mode === "edit" && panel.entry.id === entry.id;
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => openEdit(entry)}
                            className={cn(
                              "w-full truncate rounded-r1 px-x1_5 py-x0_5 text-left t2-bold ring-inset transition-[filter] hover:brightness-95",
                              t.block,
                              t.title,
                              isSel ? cn("ring-2", t.ring) : "ring-1"
                            )}
                          >
                            {entry.subject}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPanel({ mode: "create", dayOfWeek: day, startTime: "00:00", endTime: "23:59" });
                          setForm({ subject: "", details: "", colorCode: "blue", allDay: true });
                        }}
                        className="mt-auto grid size-6 place-items-center self-end rounded-r1 text-fg-placeholder transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral-muted"
                        title="종일 일정 추가"
                        aria-label="종일 일정 추가"
                      >
                        <Plus className="size-3.5" aria-hidden />
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
                    className="absolute flex w-full items-center justify-end pr-x2_5"
                    style={{ top: (h - START_HOUR) * HOUR_HEIGHT - 8, height: 16 }}
                  >
                    <span className="t2-regular tabular-nums text-fg-neutral-subtle">
                      {String(h).padStart(2, "0")}:00
                    </span>
                  </div>
                ))}
                {/* Current time label */}
                {nowInRange && (
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
                      "relative cursor-crosshair border-l border-stroke-neutral-muted",
                      isToday && "bg-bg-brand-weak/40"
                    )}
                    style={{ height: TOTAL_HEIGHT }}
                    onMouseDown={(e) => handleColMouseDown(e, dayIdx)}
                  >
                    {/* Hour lines */}
                    {hourLabels.map((h) => (
                      <div
                        key={h}
                        className="absolute w-full border-t border-stroke-neutral-muted"
                        style={{ top: (h - START_HOUR) * HOUR_HEIGHT }}
                      />
                    ))}
                    {/* Half-hour dashed lines */}
                    {hourLabels.map((h) => (
                      <div
                        key={`${h}h`}
                        className="absolute w-full border-t border-stroke-neutral-subtle"
                        style={{ top: (h - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2, borderStyle: "dashed" }}
                      />
                    ))}

                    {/* Current time indicator */}
                    {isToday && nowInRange && (
                      <div
                        className="pointer-events-none absolute left-0 right-0 z-30"
                        style={{ top: minToY(currentMin) }}
                      >
                        <div className="flex -translate-y-1/2 items-center">
                          <div className="-ml-1.5 size-2.5 shrink-0 rounded-full bg-bg-brand-solid" />
                          <div className="h-0.5 flex-1 bg-bg-brand-solid" />
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
                      const tone = AUTO_BLOCK_TONE[block.type];
                      return (
                        <div
                          key={i}
                          role="button"
                          tabIndex={0}
                          aria-label={`${block.label} ${block.startTime}–${block.endTime}`}
                          className={cn(
                            "absolute left-0.5 right-0.5 cursor-pointer rounded-r1_5 ring-1 ring-inset transition-[filter] hover:brightness-95",
                            tone.block
                          )}
                          style={{ top, height, zIndex: 2 }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPanel({ mode: "auto", block, dayLabel: DAY_LABELS[dayIdx] });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setPanel({ mode: "auto", block, dayLabel: DAY_LABELS[dayIdx] });
                            }
                          }}
                        >
                          <div className="h-full overflow-hidden px-x1_5 py-x1">
                            <div className={cn("flex items-center gap-x1", tone.fg)}>
                              <span className={cn("size-1.5 shrink-0 rounded-full", tone.dot)} aria-hidden />
                              <p className="truncate t3-medium">{block.label}</p>
                            </div>
                            {height > 36 && (
                              <p className={cn("mt-x0_5 t2-regular tabular-nums", tone.fg)}>
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
                      const t = timetableTone(entry.colorCode);
                      const isSelected = panel?.mode === "edit" && panel.entry.id === entry.id;
                      return (
                        <div
                          key={entry.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`${entry.subject} ${entry.startTime}–${entry.endTime}`}
                          className={cn(
                            "group absolute left-1 right-1 cursor-pointer overflow-hidden rounded-r1_5 ring-inset transition-[filter] hover:brightness-95",
                            t.block,
                            isSelected ? cn("ring-2", t.ring) : "ring-1"
                          )}
                          style={{ top, height, zIndex: 10 }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={() => openEdit(entry)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openEdit(entry);
                            }
                          }}
                        >
                          <div className="flex h-full flex-col overflow-hidden px-x2 py-x1_5">
                            <p className={cn("truncate t3-bold", t.title)}>
                              {entry.subject}
                            </p>
                            {height > 50 && entry.details && (
                              <p className={cn("mt-x0_5 truncate t2-regular", t.sub)}>
                                {entry.details}
                              </p>
                            )}
                            {height > 36 && (
                              <p className={cn("mt-auto t2-regular tabular-nums", t.sub)}>
                                {entry.startTime} – {entry.endTime}
                              </p>
                            )}
                          </div>
                          <div
                            className="absolute bottom-0 left-0 right-0 flex h-2.5 cursor-ns-resize items-end justify-center pb-0.5 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100"
                            onMouseDown={(e) => handleResizeMouseDown(e, entry)}
                            onClick={(e) => e.stopPropagation()}
                            aria-hidden
                          >
                            <span className={cn("h-1 w-6 rounded-full", t.solid)} />
                          </div>
                        </div>
                      );
                    })}

                    {/* Drag ghost (during drag) */}
                    {ghost && (
                      <div
                        className="pointer-events-none absolute left-1 right-1 rounded-r1_5 border-2 border-dashed border-stroke-brand-solid bg-bg-brand-weak"
                        style={{ top: ghost.top, height: ghost.height, zIndex: 20 }}
                      >
                        <p className="px-x2 pt-x1 t2-bold tabular-nums text-fg-brand">
                          {minToTime(ghost.startMin)} – {minToTime(ghost.endMin)}
                        </p>
                      </div>
                    )}

                    {/* Preview block (panel open, before saving) */}
                    {preview && (
                      <div
                        className={cn(
                          "pointer-events-none absolute left-1 right-1 rounded-r1_5 opacity-80 ring-2 ring-inset",
                          previewTone.block,
                          previewTone.ring
                        )}
                        style={{ top: preview.top, height: preview.height, zIndex: 15 }}
                      >
                        <div className="px-x2 py-x1">
                          <p className={cn("truncate t3-bold", previewTone.title)}>
                            {form.subject || "새 일정"}
                          </p>
                          <p className={cn("t2-regular tabular-nums", previewTone.sub)}>
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
          <aside className="w-full shrink-0 rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default lg:sticky lg:top-4 lg:w-80">
            {/* Panel header */}
            <div className="flex items-center justify-between gap-x2 px-x5 pb-x3 pt-x4">
              <div className="flex min-w-0 items-center gap-x2">
                <h3 className="truncate t6-bold text-fg-neutral">{panelTitle}</h3>
                {panel.mode === "auto" && <StatusBadge tone="gray">자동</StatusBadge>}
              </div>
              <button
                type="button"
                onClick={() => setPanel(null)}
                aria-label="닫기"
                className="-mr-x2 grid size-x8 shrink-0 place-items-center rounded-full text-fg-neutral-muted transition-colors hover:bg-bg-transparent-pressed"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>

            <div className="px-x5 pb-x5">
              {/* ── Auto block (read-only) ── */}
              {panel.mode === "auto" && (
                <div className="flex flex-col gap-x3">
                  <div
                    className={cn(
                      "rounded-r2 px-x3 py-x2_5 ring-1 ring-inset",
                      AUTO_BLOCK_TONE[panel.block.type].block
                    )}
                  >
                    <p className={cn("t4-bold", AUTO_BLOCK_TONE[panel.block.type].fg)}>{panel.block.label}</p>
                    <p className={cn("mt-x0_5 t3-regular tabular-nums", AUTO_BLOCK_TONE[panel.block.type].fg)}>
                      {panel.dayLabel}요일 · {panel.block.startTime} – {panel.block.endTime}
                    </p>
                  </div>
                  <Notice tone="gray">
                    자동으로 등록된 일정이에요. 출결 일정 관리 페이지에서 수정해 주세요.
                  </Notice>
                </div>
              )}

              {/* ── Create / Edit ── */}
              {(panel.mode === "create" || panel.mode === "edit") && (
                <EntryFormFields
                  mode={panel.mode}
                  dayLabel={`${DAY_LABELS[DAYS.indexOf(panel.mode === "create" ? panel.dayOfWeek : panel.entry.dayOfWeek)]}요일`}
                  startTime={panel.mode === "create" ? panel.startTime : panel.entry.startTime}
                  endTime={panel.mode === "create" ? panel.endTime : panel.entry.endTime}
                  form={form}
                  setForm={setForm}
                  onSubmit={panel.mode === "create" ? handleCreate : handleUpdate}
                  onDelete={panel.mode === "edit" ? () => setConfirmDeleteId(panel.entry.id) : undefined}
                  isPending={isPending}
                  showResizeHint={panel.mode === "edit"}
                />
              )}
            </div>
          </aside>
        )}
      </div>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        onOpenChange={(o) => { if (!o) setConfirmDeleteId(null); }}
        title="이 일정을 삭제할까요?"
        description="삭제하면 시간표에서 바로 사라져요."
        pending={isPending}
        onConfirm={() => {
          if (confirmDeleteId) handleDelete(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
      />
    </div>
  );
}
