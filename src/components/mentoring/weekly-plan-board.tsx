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
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TimePickerInput } from "@/components/ui/time-picker";
import { EmptyState, StatusBadge } from "@/components/backoffice/ui";
import { CalendarX, ChevronLeft, ChevronRight, Copy, Check, Settings2, Plus, X, Trash2, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PRIORITY, PriorityDot } from "./mentoring-status";
import { ConfirmDialog } from "./confirm-dialog";

// Mon-Sun display order for Korean work week
const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0] as const;

// 입실 예정(미배정) 칩 — 우선순위별 SEED 약한 배경
const PRIORITY_COLORS = {
  1: "bg-bg-critical-weak text-fg-critical hover:bg-bg-critical-weak-pressed",
  2: "bg-bg-warning-weak text-fg-warning hover:bg-bg-warning-weak-pressed",
  3: "bg-bg-positive-weak text-fg-positive hover:bg-bg-positive-weak-pressed",
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
  const todayDow = getKstTodayDow();
  const isThisWeek = weekStart === initialWeekStart;

  return (
    <>
      {/* ── 주 이동 · 범례 · 요약 복사 ── */}
      <div className="mb-x4 flex flex-wrap items-center gap-x3">
        <div className="flex items-center gap-x1">
          <Button
            variant="outline"
            size="icon"
            className="size-9"
            onClick={() => navigateWeek(-1)}
            disabled={isPending}
            aria-label="이전 주"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setWeekStart(initialWeekStart); refresh(initialWeekStart); }}
            disabled={isPending}
          >
            이번 주
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-9"
            onClick={() => navigateWeek(1)}
            disabled={isPending}
            aria-label="다음 주"
          >
            <ChevronRight />
          </Button>
        </div>
        <span className="t5-bold tabular-nums text-fg-neutral">{label}</span>
        {isPending && (
          <span className="inline-flex items-center gap-x1 t3-regular text-fg-neutral-subtle" role="status">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            불러오는 중
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-x4">
          <div className="flex flex-wrap items-center gap-x3 t3-regular text-fg-neutral-subtle">
            <span className="inline-flex items-center gap-x1_5"><PriorityDot priority={1} />P1 · 7일↑</span>
            <span className="inline-flex items-center gap-x1_5"><PriorityDot priority={2} />P2 · 3~6일</span>
            <span className="inline-flex items-center gap-x1_5"><PriorityDot priority={3} />P3 · ~3일</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleCopy} disabled={isPending}>
            {copied ? <Check className="text-fg-positive" /> : <Copy />}
            {copied ? "복사됨" : "요약 복사"}
          </Button>
        </div>
      </div>

      {!readonly && mentors.length > 0 && (
        <p className="mb-x3 t3-regular text-fg-neutral-subtle">
          색 칩은 그날 입실 예정인 담당 원생이에요. 누르면 멘토링이 배정되고 흰 칩으로 바뀌어요.
        </p>
      )}

      {/* ── Grid ── */}
      {mentors.length === 0 ? (
        <div className="rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default">
          <EmptyState
            icon={CalendarX}
            title="이번 주 근무 스케줄이 있는 멘토가 없어요"
            description="멘토 스케줄 관리에서 근무 일정을 먼저 등록해 주세요"
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/mentoring/schedule">멘토 스케줄 관리</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default">
          <table className="w-full border-collapse t4-regular" style={{ minWidth: 860 }}>
            <thead>
              <tr className="border-b border-stroke-neutral-muted bg-bg-layer-fill">
                <th className="sticky left-0 z-10 w-[170px] border-r border-stroke-neutral-muted bg-bg-layer-fill px-x4 py-x3 text-left t3-medium text-fg-neutral-subtle">
                  멘토
                </th>
                {dayDates.map(({ dow, date }) => {
                  const isToday = isThisWeek && dow === todayDow;
                  const isWeekend = dow === 0 || dow === 6;
                  return (
                    <th
                      key={dow}
                      aria-current={isToday ? "date" : undefined}
                      className={cn(
                        "w-[120px] border-r border-stroke-neutral-muted px-x3 py-x2_5 text-center last:border-r-0",
                        isToday && "bg-bg-brand-weak"
                      )}
                    >
                      <div
                        className={cn(
                          "t4-bold",
                          isToday ? "text-fg-brand" : isWeekend ? "text-fg-critical" : "text-fg-neutral"
                        )}
                      >
                        {DAY_NAMES[dow]}
                        {isToday && <span className="ml-x1 t2-bold">오늘</span>}
                      </div>
                      <div className={cn("mt-x0_5 t3-regular tabular-nums", isToday ? "text-fg-brand" : "text-fg-neutral-subtle")}>
                        {date}
                      </div>
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
                  todayDow={isThisWeek ? todayDow : null}
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
  todayDow,
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
  /** 표시 중인 주가 이번 주일 때만 오늘 요일 (그 외 null) */
  todayDow: number | null;
  onSchedule: (studentId: string, dayOfWeek: number) => void;
  onCancel: (mentoringId: string) => void;
  onEditSchedule: () => void;
  onAddAndSchedule: (student: AllStudent, dayOfWeek: number) => void;
}) {
  const workDayMap = new Map(mentor.workDays.map((w) => [w.dayOfWeek, w]));
  const totalScheduled = mentor.students.reduce((n, s) => n + s.scheduledMentorings.length, 0);
  const mentorStudentIds = new Set(mentor.students.map((s) => s.id));
  const extraStudents = allStudents.filter((s) => !mentorStudentIds.has(s.id));
  const load = mentor.students.length;

  return (
    <tr className={cn("align-top", !isLast && "border-b border-stroke-neutral-muted")}>
      {/* Mentor name cell — sticky */}
      <td className="sticky left-0 z-10 border-r border-stroke-neutral-muted bg-bg-layer-default px-x4 py-x3">
        <div className="flex items-start justify-between gap-x1">
          <div className="min-w-0">
            <p className="truncate t4-bold text-fg-neutral">{mentor.name}</p>
            <p className="mt-x0_5 flex items-center gap-x1_5 t3-regular tabular-nums text-fg-neutral-subtle">
              <span>담당 {load}명</span>
              {totalScheduled > 0 && (
                <span className="t3-bold text-fg-neutral-muted">배정 {totalScheduled}건</span>
              )}
            </p>
            {/* Load bar: students assigned vs capacity (fallback capacity=10) */}
            <div className="mt-x2 flex w-[120px] items-center gap-x1_5" title={`담당 원생 ${load}/10명`}>
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-bg-neutral-weak">
                <span
                  className={cn(
                    "block h-full rounded-full",
                    load >= 10 ? "bg-bg-critical-solid" :
                    load >= 7 ? "bg-bg-warning-solid" : "bg-bg-positive-solid"
                  )}
                  style={{ width: `${Math.min(100, (load / 10) * 100)}%` }}
                />
              </span>
              <span className="t2-regular tabular-nums text-fg-neutral-subtle">{load}/10</span>
            </div>
          </div>
          {!readonly && (
            <Button
              variant="ghost"
              size="icon"
              className="-mr-2 -mt-1 size-8 text-fg-neutral-subtle"
              onClick={onEditSchedule}
              title="근무 스케줄 편집"
              aria-label={`${mentor.name} 근무 스케줄 편집`}
            >
              <Settings2 />
            </Button>
          )}
        </div>
        {/* Work days summary */}
        {mentor.workDays.length > 0 && (
          <div className="mt-x2 flex flex-wrap gap-x0_5">
            {mentor.workDays.map((w) => (
              <span key={w.dayOfWeek} className="rounded-r1 bg-bg-neutral-weak px-x1_5 t2-medium text-fg-neutral-muted">
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

        const isToday = dow === todayDow;

        if (!workDay) {
          return (
            <td
              key={dow}
              className={cn(
                "border-r border-stroke-neutral-muted px-x3 py-x3 text-center last:border-r-0",
                isToday ? "bg-bg-brand-weak" : isWeekend ? "bg-bg-layer-fill" : "bg-bg-layer-default"
              )}
            >
              <span className="t3-regular text-fg-placeholder" aria-label="근무 없음">—</span>
            </td>
          );
        }

        return (
          <DayCell
            key={dow}
            dow={dow}
            isToday={isToday}
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
  isToday,
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
  isToday: boolean;
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

  return (
    <td className={cn(
      "border-r border-stroke-neutral-muted px-x2 py-x2_5 align-top last:border-r-0",
      isToday && "bg-bg-brand-weak"
    )}>
      {/* Work time badge */}
      <div className="mb-x2 text-center t2-regular tabular-nums text-fg-neutral-subtle">
        {workDay.timeStart}–{workDay.timeEnd}
      </div>

      <div className="flex min-h-10 flex-col gap-x1">
        {/* Already scheduled */}
        {scheduledStudents.map((s) => {
          const m = s.scheduledMentorings.find((m) => m.dayOfWeek === dow)!;
          return (
            <div
              key={s.id}
              className="group flex items-center gap-x1_5 rounded-r2 border border-stroke-neutral-muted bg-bg-layer-default py-x1 pl-x2 pr-x1 t3-medium text-fg-neutral"
            >
              <PriorityDot priority={s.priority} />
              <span className="w-4 shrink-0 t2-regular tabular-nums text-fg-neutral-subtle">{studentSeatMap.get(s.id)}</span>
              <span className="flex-1 truncate">{s.name}</span>
              {!readonly && (
                <button
                  type="button"
                  onClick={() => onCancel(m.id)}
                  disabled={isPending}
                  className="grid size-5 shrink-0 place-items-center rounded-full text-fg-neutral-subtle opacity-0 transition-opacity hover:bg-bg-transparent-pressed hover:text-fg-critical focus-visible:opacity-100 disabled:opacity-40 group-hover:opacity-100"
                  title="삭제"
                  aria-label={`${s.name} 배정 취소`}
                >
                  <X className="size-3" />
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
                "flex w-full items-center gap-x1_5 rounded-r2 py-x1 pl-x2 pr-x2 t3-medium",
                PRIORITY_COLORS[s.priority]
              )}
            >
              <PriorityDot priority={s.priority} />
              <span className="w-4 shrink-0 t2-regular tabular-nums opacity-70">{studentSeatMap.get(s.id)}</span>
              <span className="flex-1 truncate text-left">{s.name}</span>
              <span className="t2-regular opacity-70">{s.grade}</span>
            </div>
          ) : (
            <button
              type="button"
              key={s.id}
              onClick={() => onSchedule(s.id)}
              disabled={isPending}
              className={cn(
                "flex w-full items-center gap-x1_5 rounded-r2 py-x1 pl-x2 pr-x2 t3-medium transition-colors",
                "cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
                PRIORITY_COLORS[s.priority]
              )}
              title={`클릭하여 멘토링 배정 (마지막: ${s.daysSinceLast === null ? "기록없음" : s.daysSinceLast + "일 전"})`}
            >
              <PriorityDot priority={s.priority} />
              <span className="w-4 shrink-0 t2-regular tabular-nums opacity-70">{studentSeatMap.get(s.id)}</span>
              <span className="flex-1 truncate text-left">{s.name}</span>
              <span className="t2-regular opacity-70">{s.grade}</span>
            </button>
          )
        )}

        {/* Add button — hidden in readonly mode */}
        {!readonly && <Popover open={popoverOpen} onOpenChange={(o) => { setPopoverOpen(o); if (!o) setQuery(""); }}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={isPending}
              className="flex w-full items-center justify-center gap-x1 rounded-r2 border border-dashed border-stroke-neutral-weak px-x2 py-x1 t3-medium text-fg-neutral-subtle transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral disabled:opacity-50"
            >
              <Plus className="size-3" aria-hidden />
              {otherUnscheduled.length > 0 ? `${otherUnscheduled.length}명 더` : "추가"}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-x2" align="start">
            {/* Search input */}
            <label className="mb-x2 flex h-9 items-center gap-x1_5 rounded-r2 bg-bg-neutral-weak px-x2_5">
              <Search className="size-3.5 shrink-0 text-fg-neutral-subtle" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="이름 또는 학년"
                aria-label="원생 검색"
                className="min-w-0 flex-1 bg-transparent t3-regular text-fg-neutral outline-none placeholder:text-fg-placeholder"
                autoFocus
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="검색어 지우기"
                  className="text-fg-neutral-subtle hover:text-fg-neutral"
                >
                  <X className="size-3" />
                </button>
              )}
            </label>

            <div className="flex max-h-52 flex-col gap-x0_5 overflow-y-auto">
              {/* 담당 학생 (입실 예정 없는 날) */}
              {filteredOther.length > 0 && (
                <>
                  {q && <p className="px-x2 pb-x1 t2-medium text-fg-neutral-subtle">담당 학생</p>}
                  {filteredOther.map((s) => (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => { onSchedule(s.id); handleClose(); }}
                      disabled={isPending}
                      className="flex w-full items-center gap-x2 rounded-r2 px-x2 py-x1_5 text-left t3-regular transition-colors hover:bg-bg-transparent-pressed disabled:opacity-50"
                    >
                      <PriorityDot priority={s.priority} />
                      <span className="flex-1 t3-medium text-fg-neutral">{s.name}</span>
                      <span className="text-fg-neutral-subtle">{s.grade}</span>
                      <StatusBadge tone={PRIORITY[s.priority].tone}>{PRIORITY[s.priority].short}</StatusBadge>
                    </button>
                  ))}
                </>
              )}

              {/* 담당 외 학생 (검색 시에만) */}
              {filteredExtra.length > 0 && (
                <>
                  {filteredOther.length > 0 && <div className="my-x1 border-t border-stroke-neutral-muted" />}
                  <p className="px-x2 pb-x1 t2-medium text-fg-neutral-subtle">다른 학생</p>
                  {filteredExtra.map((s) => (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => { onAddAndSchedule(s); handleClose(); }}
                      disabled={isPending}
                      className="flex w-full items-center gap-x2 rounded-r2 px-x2 py-x1_5 text-left t3-regular transition-colors hover:bg-bg-transparent-pressed disabled:opacity-50"
                    >
                      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-bg-neutral-solid-muted" />
                      <span className="flex-1 t3-medium text-fg-neutral">{s.name}</span>
                      <span className="text-fg-neutral-subtle">{s.grade}</span>
                    </button>
                  ))}
                </>
              )}

              {/* 빈 상태 */}
              {filteredOther.length === 0 && filteredExtra.length === 0 && (
                <p className="py-x3 text-center t3-regular text-fg-neutral-subtle">
                  {q ? "검색 결과가 없어요" : "배정할 학생이 없어요"}
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
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);

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
        setDeleteTarget(null);
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
        <SheetHeader className="pb-x4">
          <SheetTitle>{mentor.name} 근무 스케줄</SheetTitle>
          <SheetDescription>요일별 멘토링 가능 시간을 설정해요. 바꾸면 계획표가 바로 새로고침돼요.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-x1_5">
          {ALL_DAYS.map(({ dow, label, weekend }) => {
            const sch = scheduleMap.get(dow);
            const isEditing = editDay === dow;

            return (
              <div
                key={dow}
                className={cn(
                  "flex min-h-13 items-center gap-x3 rounded-r3 border px-x4 py-x2_5",
                  isEditing
                    ? "border-stroke-neutral-contrast bg-bg-layer-default"
                    : "border-transparent bg-bg-layer-fill"
                )}
              >
                <span className={cn("w-14 shrink-0 t4-bold", weekend ? "text-fg-critical" : "text-fg-neutral")}>
                  {label}
                </span>

                {isEditing ? (
                  <div className="flex flex-1 flex-wrap items-center gap-x2">
                    <TimePickerInput value={editStart} onChange={setEditStart} size="sm" />
                    <span className="t3-regular text-fg-neutral-subtle">~</span>
                    <TimePickerInput value={editEnd} onChange={setEditEnd} size="sm" />
                    <Button size="xs" onClick={handleSave} disabled={isPending}>
                      {isPending ? "저장 중…" : "저장"}
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => setEditDay(null)}>
                      취소
                    </Button>
                  </div>
                ) : sch ? (
                  <>
                    <span className="flex-1 t4-medium tabular-nums text-fg-neutral">
                      {sch.timeStart} ~ {sch.timeEnd}
                    </span>
                    <Button size="xs" variant="ghost" onClick={() => startEdit(dow)}>
                      수정
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-fg-neutral-subtle hover:text-fg-critical"
                      onClick={() => setDeleteTarget({ id: sch.id, label })}
                      disabled={isPending}
                      aria-label={`${label} 스케줄 삭제`}
                    >
                      <Trash2 />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 t4-regular text-fg-placeholder">미등록</span>
                    <Button size="xs" variant="outline" onClick={() => startEdit(dow)}>
                      <Plus />
                      등록
                    </Button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
          title="스케줄 삭제"
          description={deleteTarget ? `${mentor.name} 멘토의 ${deleteTarget.label} 근무 시간을 삭제할까요?` : undefined}
          pending={isPending}
          onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
        />
      </SheetContent>
    </Sheet>
  );
}
