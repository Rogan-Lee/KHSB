"use client";

import { useState, useTransition } from "react";
import {
  getWeeklyPlanData,
  scheduleWeeklyMentoring,
  cancelWeeklyMentoring,
  type WeeklyPlanMentor,
  type WeeklyPlanStudent,
} from "@/actions/mentoring-plan";
import { saveMentorScheduleForMentor, deleteMentorScheduleById } from "@/actions/mentors";
import { DAY_NAMES } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronLeft, ChevronRight, Copy, Check, Settings2, Plus, X, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

// Mon-Sun display order for Korean work week
const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0] as const;

// v4 priority palette — calmer pastel, 2px left stripe model
const PRIORITY_COLORS = {
  1: "bg-bad-soft text-bad-ink hover:brightness-[0.98]",
  2: "bg-warn-soft text-warn-ink hover:brightness-[0.98]",
  3: "bg-ok-soft text-ok-ink hover:brightness-[0.98]",
} as const;

const PRIORITY_DOT = {
  1: "bg-bad",
  2: "bg-warn",
  3: "bg-ok",
} as const;

// KST today (UTC+9) weekday (0=Sun..6=Sat)
function getKstTodayDow(): number {
  const nowKst = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  return nowKst.getUTCDay();
}

function addWeeks(weekStart: string, delta: number): string {
  const d = new Date(weekStart);
  d.setUTCDate(d.getUTCDate() + delta * 7);
  return d.toISOString().slice(0, 10);
}

function getDayDate(weekStart: string, dayOfWeek: number): string {
  // weekStart is always Monday (day 1)
  const start = new Date(weekStart);
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return new Date(start.getTime() + offset * 86400000).toISOString().slice(0, 10);
}

function formatWeekHeader(weekStart: string) {
  const s = new Date(weekStart);
  const e = new Date(s.getTime() + 6 * 86400000);
  return {
    label: `${s.getUTCFullYear()}년 ${s.getUTCMonth() + 1}월 ${s.getUTCDate()}일 ~ ${e.getUTCMonth() + 1}월 ${e.getUTCDate()}일`,
    dayDates: WEEK_DAYS.map((dow) => {
      const d = new Date(s.getTime() + (dow === 0 ? 6 : dow - 1) * 86400000);
      return { dow, date: `${d.getUTCMonth() + 1}/${d.getUTCDate()}` };
    }),
  };
}

function buildSummaryText(weekStart: string, mentors: WeeklyPlanMentor[]): string {
  const { label } = formatWeekHeader(weekStart);
  const lines = [`📋 멘토링 주간 계획 (${label})`, ""];
  for (const mentor of mentors) {
    if (mentor.students.length === 0) continue;
    const workStr = mentor.workDays
      .map((w) => `${DAY_NAMES[w.dayOfWeek]} ${w.timeStart}-${w.timeEnd}`)
      .join(", ") || "근무 미등록";
    lines.push(`[${mentor.name}] ${workStr}`);
    for (const s of mentor.students) {
      const days = s.scheduledMentorings.map((m) => DAY_NAMES[m.dayOfWeek]).join(", ") || "미배정";
      const ago = s.daysSinceLast === null ? "기록없음" : `${s.daysSinceLast}일 전`;
      lines.push(`  • ${s.name} (${s.grade}, P${s.priority}, ${ago}) → ${days}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Board
// ─────────────────────────────────────────────────────────────────────────────

type AllStudent = { id: string; name: string; grade: string; seat: string | null; mentorId: string | null };

export function WeeklyPlanBoard({
  initialMentors,
  initialWeekStart,
  allStudents,
  readonly = false,
}: {
  initialMentors: WeeklyPlanMentor[];
  initialWeekStart: string;
  allStudents: AllStudent[];
  readonly?: boolean;
}) {
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [mentors, setMentors] = useState(initialMentors);
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [editMentor, setEditMentor] = useState<WeeklyPlanMentor | null>(null);

  function refresh(week: string) {
    startTransition(async () => {
      setMentors(await getWeeklyPlanData(week));
    });
  }

  function navigateWeek(delta: number) {
    const next = addWeeks(weekStart, delta);
    setWeekStart(next);
    refresh(next);
  }

  function handleSchedule(studentId: string, mentorId: string, dayOfWeek: number) {
    const workDay = mentors
      .find((m) => m.id === mentorId)
      ?.workDays.find((w) => w.dayOfWeek === dayOfWeek);
    const date = getDayDate(weekStart, dayOfWeek);
    startTransition(async () => {
      try {
        await scheduleWeeklyMentoring(
          studentId,
          mentorId,
          date,
          workDay?.timeStart,
          workDay?.timeEnd
        );
        setMentors(await getWeeklyPlanData(weekStart));
        toast.success("일정이 추가되었습니다.");
      } catch {
        toast.error("오류가 발생했습니다.");
        // 낙관적 상태를 DB와 동기화 (실패 시 롤백)
        try { setMentors(await getWeeklyPlanData(weekStart)); } catch { /* 무시 */ }
      }
    });
  }

  function handleCancel(mentoringId: string) {
    startTransition(async () => {
      try {
        await cancelWeeklyMentoring(mentoringId);
        setMentors(await getWeeklyPlanData(weekStart));
        toast.success("일정이 삭제되었습니다.");
      } catch {
        toast.error("오류가 발생했습니다.");
      }
    });
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildSummaryText(weekStart, mentors));
      setCopied(true);
      toast.success("클립보드에 복사되었습니다.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("복사 실패");
    }
  }

  function handleAddAndSchedule(student: AllStudent, mentorId: string, dayOfWeek: number) {
    // 로컬 state에 즉시 추가 (UI 피드백)
    setMentors((prev) =>
      prev.map((m) => {
        if (m.id !== mentorId) return m;
        if (m.students.some((s) => s.id === student.id)) return m;
        return {
          ...m,
          students: [
            ...m.students,
            {
              id: student.id,
              name: student.name,
              grade: student.grade,
              seat: student.seat,
              priority: 1 as const,
              daysSinceLast: null,
              lastMentoringDate: null,
              expectedDays: [],
              scheduledMentorings: [],
            },
          ],
        };
      })
    );
    // 멘토링 일정 배정 (DB 저장 + 새로고침)
    handleSchedule(student.id, mentorId, dayOfWeek);
  }

  const { label, dayDates } = formatWeekHeader(weekStart);

  return (
    <>
      {/* ── Header Controls ── */}
      <div className="flex items-center gap-3 flex-wrap pb-3">
        <div className="inline-flex items-center gap-[2px] p-[3px] bg-panel border border-line rounded-[9px] shadow-[var(--shadow-xs)]">
          <button
            type="button"
            onClick={() => navigateWeek(-1)}
            disabled={isPending}
            className="h-[26px] w-[28px] grid place-items-center rounded-[6px] text-ink-3 hover:bg-canvas-2 hover:text-ink-2 transition-colors disabled:opacity-50"
            aria-label="이전 주"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => { setWeekStart(initialWeekStart); refresh(initialWeekStart); }}
            disabled={isPending}
            className="h-[26px] px-3 text-[11.5px] font-medium rounded-[6px] text-ink-2 hover:bg-canvas-2 transition-colors disabled:opacity-50"
          >
            이번 주
          </button>
          <button
            type="button"
            onClick={() => navigateWeek(1)}
            disabled={isPending}
            className="h-[26px] w-[28px] grid place-items-center rounded-[6px] text-ink-3 hover:bg-canvas-2 hover:text-ink-2 transition-colors disabled:opacity-50"
            aria-label="다음 주"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <span className="text-[13px] font-semibold text-ink tracking-[-0.01em]">{label}</span>
        <div className="flex-1" />
        <div className="flex items-center gap-3 text-[11px] text-ink-4">
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-bad" />P1 · 7일↑</span>
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-warn" />P2 · 3~6일</span>
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-ok" />P3 · ~3일</span>
        </div>
        <Button variant="outline" size="compact" onClick={handleCopy} disabled={isPending}>
          {copied ? <><Check className="h-3 w-3 text-ok" />복사됨</> : <><Copy className="h-3 w-3" />요약 복사</>}
        </Button>
        {isPending && <span className="text-[11px] text-ink-4 animate-pulse">로딩 중</span>}
      </div>

      {/* ── Grid ── */}
      {mentors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
          <p className="text-sm">이번 주 근무 스케줄이 있는 멘토가 없습니다.</p>
          <p className="text-xs">멘토 스케줄 관리 페이지에서 근무 일정을 먼저 설정해주세요.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[12px] border border-line bg-panel shadow-[var(--shadow-xs)]">
          <table className="w-full border-collapse text-sm" style={{ minWidth: 860 }}>
            <thead>
              <tr className="border-b border-line bg-panel-2">
                <th className="px-4 py-3 text-left w-[170px] text-[11px] font-semibold text-ink-4 sticky left-0 bg-panel-2 z-10 border-r border-line-2">
                  멘토
                </th>
                {dayDates.map(({ dow, date }) => {
                  const isToday = dow === getKstTodayDow();
                  return (
                    <th
                      key={dow}
                      className={cn(
                        "px-3 py-3 text-center text-[11px] font-semibold w-[120px] border-r border-line-2 last:border-r-0",
                        isToday ? "bg-brand-softer" : "",
                        dow === 0 || dow === 6 ? "text-bad" : "text-ink-4"
                      )}
                    >
                      <div className={cn("text-[12.5px] font-[650]", isToday ? "text-brand-2" : "text-ink")}>
                        {DAY_NAMES[dow]}
                      </div>
                      <div className={cn(
                        "text-[11px] font-mono tabular-nums mt-0.5",
                        isToday ? "text-brand" : "text-ink-4"
                      )}>{date}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {mentors.map((mentor, i) => (
                <MentorRow
                  key={mentor.id}
                  mentor={mentor}
                  allStudents={allStudents}
                  isLast={i === mentors.length - 1}
                  isPending={isPending}
                  readonly={readonly}
                  onSchedule={(sid, dow) => handleSchedule(sid, mentor.id, dow)}
                  onCancel={handleCancel}
                  onEditSchedule={() => setEditMentor(mentor)}
                  onAddAndSchedule={(student, dow) => handleAddAndSchedule(student, mentor.id, dow)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Schedule Edit Sheet (admin/director only) ── */}
      {!readonly && (
        <ScheduleEditSheet
          mentor={editMentor}
          onClose={() => setEditMentor(null)}
          onSaved={() => refresh(weekStart)}
        />
      )}

    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mentor Row
// ─────────────────────────────────────────────────────────────────────────────

function MentorRow({
  mentor,
  allStudents,
  isLast,
  isPending,
  readonly,
  onSchedule,
  onCancel,
  onEditSchedule,
  onAddAndSchedule,
}: {
  mentor: WeeklyPlanMentor;
  allStudents: AllStudent[];
  isLast: boolean;
  isPending: boolean;
  readonly: boolean;
  onSchedule: (studentId: string, dayOfWeek: number) => void;
  onCancel: (mentoringId: string) => void;
  onEditSchedule: () => void;
  onAddAndSchedule: (student: AllStudent, dayOfWeek: number) => void;
}) {
  const workDayMap = new Map(mentor.workDays.map((w) => [w.dayOfWeek, w]));
  const totalScheduled = mentor.students.reduce((n, s) => n + s.scheduledMentorings.length, 0);
  const mentorStudentIds = new Set(mentor.students.map((s) => s.id));
  const extraStudents = allStudents.filter((s) => !mentorStudentIds.has(s.id));

  return (
    <tr className={cn("align-top", !isLast && "border-b border-line-2")}>
      {/* Mentor name cell — sticky */}
      <td className="px-4 py-3 sticky left-0 bg-panel z-10 border-r border-line-2">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <p className="font-semibold text-[12.5px] text-ink leading-tight tracking-[-0.01em] truncate">{mentor.name}</p>
            <p className="text-[11px] text-ink-4 mt-0.5 flex items-center gap-1.5 font-mono tabular-nums">
              <span>{mentor.students.length}명</span>
              {totalScheduled > 0 && (
                <span className="text-ink-3 font-semibold">{totalScheduled}건</span>
              )}
            </p>
            {/* Load bar: students assigned vs capacity (fallback capacity=10) */}
            <div className="mt-2 flex items-center gap-1.5 w-[120px]">
              <span className="flex-1 h-[3px] rounded-[2px] bg-line-2 overflow-hidden">
                <span
                  className={cn(
                    "block h-full rounded-[2px]",
                    mentor.students.length >= 10 ? "bg-bad" :
                    mentor.students.length >= 7 ? "bg-warn" : "bg-ok"
                  )}
                  style={{ width: `${Math.min(100, (mentor.students.length / 10) * 100)}%` }}
                />
              </span>
              <span className="font-mono text-[10px] text-ink-4 tabular-nums">{mentor.students.length}/10</span>
            </div>
          </div>
          {!readonly && (
            <button
              onClick={onEditSchedule}
              className="text-ink-4 hover:text-ink-2 transition-colors mt-0.5 shrink-0"
              title="근무 스케줄 편집"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {/* Work days summary */}
        {mentor.workDays.length > 0 && (
          <div className="flex flex-wrap gap-0.5 mt-1.5">
            {mentor.workDays.map((w) => (
              <span key={w.dayOfWeek} className="text-[10px] font-medium px-1.5 py-px bg-canvas-2 text-ink-3 rounded-[4px]">
                {DAY_NAMES[w.dayOfWeek]}
              </span>
            ))}
          </div>
        )}
      </td>

      {/* Day cells */}
      {WEEK_DAYS.map((dow) => {
        const workDay = workDayMap.get(dow);
        const isWeekend = dow === 0 || dow === 6;

        const isToday = dow === getKstTodayDow();

        if (!workDay) {
          return (
            <td
              key={dow}
              className={cn(
                "px-3 py-3 text-center border-r border-line-2 last:border-r-0",
                isToday ? "bg-brand-softer" : isWeekend ? "bg-panel-2" : "bg-panel"
              )}
            >
              <span className="text-ink-5 text-xs">—</span>
            </td>
          );
        }

        return (
          <DayCell
            key={dow}
            dow={dow}
            workDay={workDay}
            students={mentor.students}
            extraStudents={extraStudents}
            isPending={isPending}
            readonly={readonly}
            onSchedule={(sid) => onSchedule(sid, dow)}
            onCancel={onCancel}
            onAddAndSchedule={(student) => onAddAndSchedule(student, dow)}
          />
        );
      })}
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Day Cell
// ─────────────────────────────────────────────────────────────────────────────

function DayCell({
  dow,
  workDay,
  students,
  extraStudents,
  isPending,
  readonly,
  onSchedule,
  onCancel,
  onAddAndSchedule,
}: {
  dow: number;
  workDay: { id: string; dayOfWeek: number; timeStart: string; timeEnd: string };
  students: WeeklyPlanStudent[];
  extraStudents: AllStudent[];
  isPending: boolean;
  readonly: boolean;
  onSchedule: (studentId: string) => void;
  onCancel: (mentoringId: string) => void;
  onAddAndSchedule: (student: AllStudent) => void;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [query, setQuery] = useState("");

  const studentSeatMap = new Map(students.map((s) => [s.id, s.seat || "—"]));
  const scheduledStudents = students.filter((s) =>
    s.scheduledMentorings.some((m) => m.dayOfWeek === dow)
  );
  const expectedUnscheduled = students.filter(
    (s) =>
      s.expectedDays.includes(dow) &&
      !s.scheduledMentorings.some((m) => m.dayOfWeek === dow)
  );
  const otherUnscheduled = students.filter(
    (s) =>
      !s.expectedDays.includes(dow) &&
      !s.scheduledMentorings.some((m) => m.dayOfWeek === dow)
  );

  const q = query.trim();
  const scheduledIds = new Set(scheduledStudents.map((s) => s.id));

  const filteredOther = q
    ? otherUnscheduled.filter((s) => s.name.includes(q) || s.grade.includes(q))
    : otherUnscheduled;

  const filteredExtra = q
    ? extraStudents.filter(
        (s) => !scheduledIds.has(s.id) && (s.name.includes(q) || s.grade.includes(q))
      )
    : [];

  function handleClose() {
    setPopoverOpen(false);
    setQuery("");
  }

  const isToday = dow === getKstTodayDow();

  return (
    <td className={cn(
      "px-2 py-2.5 align-top border-r border-line-2 last:border-r-0",
      isToday && "bg-brand-softer"
    )}>
      {/* Work time badge */}
      <div className="text-[10px] text-ink-4 font-mono tabular-nums mb-2 text-center">
        {workDay.timeStart}–{workDay.timeEnd}
      </div>

      <div className="space-y-1 min-h-[40px]">
        {/* Already scheduled */}
        {scheduledStudents.map((s) => {
          const m = s.scheduledMentorings.find((m) => m.dayOfWeek === dow)!;
          return (
            <div
              key={s.id}
              className="relative flex items-center gap-1.5 pl-[10px] pr-1.5 py-1 rounded-[7px] bg-panel border border-line text-ink text-[11.5px] font-medium group"
            >
              <span className={cn("absolute left-[2px] top-1 bottom-1 w-[2px] rounded-[2px]", PRIORITY_DOT[s.priority])} />
              <span className="text-[10px] text-ink-4 font-mono tabular-nums w-3 shrink-0">{studentSeatMap.get(s.id)}</span>
              <span className="truncate flex-1 tracking-[-0.01em]">{s.name}</span>
              {!readonly && (
                <button
                  onClick={() => onCancel(m.id)}
                  disabled={isPending}
                  className="shrink-0 text-ink-4 hover:text-bad transition-colors disabled:opacity-40 opacity-0 group-hover:opacity-100"
                  title="삭제"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}

        {/* Expected students (clickable to schedule, or display-only when readonly) */}
        {expectedUnscheduled.map((s) =>
          readonly ? (
            <div
              key={s.id}
              className={cn(
                "relative w-full flex items-center gap-1.5 pl-[10px] pr-2 py-1 rounded-[7px] text-[11.5px] font-medium",
                PRIORITY_COLORS[s.priority]
              )}
            >
              <span className={cn("absolute left-[2px] top-1 bottom-1 w-[2px] rounded-[2px]", PRIORITY_DOT[s.priority])} />
              <span className="text-[10px] opacity-60 w-3 shrink-0 font-mono">{studentSeatMap.get(s.id)}</span>
              <span className="truncate flex-1 text-left tracking-[-0.01em]">{s.name}</span>
              <span className="text-[10px] opacity-60">{s.grade}</span>
            </div>
          ) : (
            <button
              key={s.id}
              onClick={() => onSchedule(s.id)}
              disabled={isPending}
              className={cn(
                "relative w-full flex items-center gap-1.5 pl-[10px] pr-2 py-1 rounded-[7px] text-[11.5px] font-medium transition-all",
                "cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
                PRIORITY_COLORS[s.priority]
              )}
              title={`클릭하여 멘토링 배정 (마지막: ${s.daysSinceLast === null ? "기록없음" : s.daysSinceLast + "일 전"})`}
            >
              <span className={cn("absolute left-[2px] top-1 bottom-1 w-[2px] rounded-[2px]", PRIORITY_DOT[s.priority])} />
              <span className="text-[10px] opacity-60 w-3 shrink-0 font-mono">{studentSeatMap.get(s.id)}</span>
              <span className="truncate flex-1 text-left tracking-[-0.01em]">{s.name}</span>
              <span className="text-[10px] opacity-60">{s.grade}</span>
            </button>
          )
        )}

        {/* Add button — hidden in readonly mode */}
        {!readonly && <Popover open={popoverOpen} onOpenChange={(o) => { setPopoverOpen(o); if (!o) setQuery(""); }}>
          <PopoverTrigger asChild>
            <button
              disabled={isPending}
              className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded-[7px] border border-dashed border-line-strong text-[11px] text-ink-4 hover:border-ink-4 hover:text-ink-2 transition-colors disabled:opacity-50"
            >
              <Plus className="h-3 w-3" />
              {otherUnscheduled.length > 0 ? `${otherUnscheduled.length}명 더` : "추가"}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-2" align="start">
            {/* Search input */}
            <div className="flex items-center gap-1.5 border rounded-md px-2 py-1 mb-2">
              <Search className="h-3 w-3 text-muted-foreground shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="이름 또는 학년..."
                className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
                autoFocus
              />
              {query && (
                <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <div className="max-h-52 overflow-y-auto space-y-0.5">
              {/* 담당 학생 (입실 예정 없는 날) */}
              {filteredOther.length > 0 && (
                <>
                  {q && <p className="text-[10px] text-muted-foreground px-2 pb-1">담당 학생</p>}
                  {filteredOther.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { onSchedule(s.id); handleClose(); }}
                      disabled={isPending}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted/60 transition-colors text-left disabled:opacity-50"
                    >
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", PRIORITY_DOT[s.priority])} />
                      <span className="flex-1 font-medium">{s.name}</span>
                      <span className="text-muted-foreground">{s.grade}</span>
                      <span className={cn(
                        "text-[10px] px-1 rounded-sm border",
                        s.priority === 1 ? "bg-red-50 border-red-200 text-red-700" :
                        s.priority === 2 ? "bg-amber-50 border-amber-200 text-amber-700" :
                        "bg-emerald-50 border-emerald-200 text-emerald-700"
                      )}>P{s.priority}</span>
                    </button>
                  ))}
                </>
              )}

              {/* 담당 외 학생 (검색 시에만) */}
              {filteredExtra.length > 0 && (
                <>
                  {filteredOther.length > 0 && <div className="border-t my-1" />}
                  <p className="text-[10px] text-muted-foreground px-2 pb-1">다른 학생</p>
                  {filteredExtra.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { onAddAndSchedule(s); handleClose(); }}
                      disabled={isPending}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted/60 transition-colors text-left disabled:opacity-50"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                      <span className="flex-1 font-medium">{s.name}</span>
                      <span className="text-muted-foreground">{s.grade}</span>
                    </button>
                  ))}
                </>
              )}

              {/* 빈 상태 */}
              {filteredOther.length === 0 && filteredExtra.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">
                  {q ? "검색 결과 없음" : "배정할 학생이 없습니다"}
                </p>
              )}
            </div>
          </PopoverContent>
        </Popover>}
      </div>
    </td>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Schedule Edit Sheet (inline mentor schedule editing)
// ─────────────────────────────────────────────────────────────────────────────

const ALL_DAYS = [
  { dow: 1, label: "월요일", weekend: false },
  { dow: 2, label: "화요일", weekend: false },
  { dow: 3, label: "수요일", weekend: false },
  { dow: 4, label: "목요일", weekend: false },
  { dow: 5, label: "금요일", weekend: false },
  { dow: 6, label: "토요일", weekend: true },
  { dow: 0, label: "일요일", weekend: true },
];

function ScheduleEditSheet({
  mentor,
  onClose,
  onSaved,
}: {
  mentor: WeeklyPlanMentor | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [editDay, setEditDay] = useState<number | null>(null);
  const [editStart, setEditStart] = useState("14:00");
  const [editEnd, setEditEnd] = useState("18:00");
  const [isPending, startTransition] = useTransition();

  if (!mentor) return null;

  const scheduleMap = new Map(mentor.workDays.map((w) => [w.dayOfWeek, w]));

  function startEdit(dow: number) {
    const existing = scheduleMap.get(dow);
    setEditStart(existing?.timeStart ?? "14:00");
    setEditEnd(existing?.timeEnd ?? "18:00");
    setEditDay(dow);
  }

  function handleSave() {
    if (editDay === null || !mentor) return;
    const mentorId = mentor.id;
    startTransition(async () => {
      try {
        await saveMentorScheduleForMentor(mentorId, editDay, editStart, editEnd);
        toast.success("저장되었습니다.");
        setEditDay(null);
        onSaved();
      } catch {
        toast.error("저장 실패");
      }
    });
  }

  function handleDelete(scheduleId: string) {
    startTransition(async () => {
      try {
        await deleteMentorScheduleById(scheduleId);
        toast.success("삭제되었습니다.");
        setEditDay(null);
        onSaved();
      } catch {
        toast.error("삭제 실패");
      }
    });
  }

  return (
    <Sheet
      open={!!mentor}
      onOpenChange={(open) => {
        if (!open) { onClose(); setEditDay(null); }
      }}
    >
      <SheetContent className="w-[380px] sm:w-[420px]">
        <SheetHeader className="pb-4">
          <SheetTitle>{mentor.name} 근무 스케줄</SheetTitle>
          <p className="text-sm text-muted-foreground">요일별 멘토링 가능 시간을 설정합니다.</p>
        </SheetHeader>

        <div className="space-y-1">
          {ALL_DAYS.map(({ dow, label, weekend }) => {
            const sch = scheduleMap.get(dow);
            const isEditing = editDay === dow;

            return (
              <div
                key={dow}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg",
                  weekend ? "bg-red-50/40" : "bg-muted/30",
                  isEditing && "ring-1 ring-blue-300 bg-blue-50/30"
                )}
              >
                <span className={cn("text-sm font-medium w-14", weekend ? "text-red-500" : "text-foreground")}>
                  {label}
                </span>

                {isEditing ? (
                  <div className="flex items-center gap-2 flex-1 flex-wrap">
                    <input
                      type="time"
                      value={editStart}
                      onChange={(e) => setEditStart(e.target.value)}
                      className="h-7 text-xs border rounded px-1.5 bg-white w-[90px]"
                    />
                    <span className="text-muted-foreground text-xs">~</span>
                    <input
                      type="time"
                      value={editEnd}
                      onChange={(e) => setEditEnd(e.target.value)}
                      className="h-7 text-xs border rounded px-1.5 bg-white w-[90px]"
                    />
                    <Button size="sm" className="h-7 text-xs px-3" onClick={handleSave} disabled={isPending}>
                      저장
                    </Button>
                    <button
                      onClick={() => setEditDay(null)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      취소
                    </button>
                  </div>
                ) : sch ? (
                  <>
                    <span className="text-sm font-medium flex-1 text-foreground">
                      {sch.timeStart} ~ {sch.timeEnd}
                    </span>
                    <button
                      onClick={() => startEdit(dow)}
                      className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleDelete(sch.id)}
                      disabled={isPending}
                      className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-sm text-muted-foreground/50 flex-1">미등록</span>
                    <button
                      onClick={() => startEdit(dow)}
                      className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                    >
                      등록
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-muted-foreground mt-4 px-1">
          변경 후 그리드가 자동으로 새로고침됩니다.
        </p>
      </SheetContent>
    </Sheet>
  );
}

