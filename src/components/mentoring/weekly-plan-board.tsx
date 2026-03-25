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
import { ChevronLeft, ChevronRight, Copy, Check, Settings2, Plus, X, Trash2 } from "lucide-react";
import { toast } from "sonner";

// Mon-Sun display order for Korean work week
const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0] as const;

const PRIORITY_COLORS = {
  1: "bg-red-50 border-red-200 text-red-800 hover:bg-red-100",
  2: "bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100",
  3: "bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100",
} as const;

const PRIORITY_DOT = {
  1: "bg-red-400",
  2: "bg-amber-400",
  3: "bg-emerald-400",
} as const;

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

export function WeeklyPlanBoard({
  initialMentors,
  initialWeekStart,
}: {
  initialMentors: WeeklyPlanMentor[];
  initialWeekStart: string;
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

  const { label, dayDates } = formatWeekHeader(weekStart);

  return (
    <>
      {/* ── Header Controls ── */}
      <div className="flex items-center gap-2 flex-wrap pb-1">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => navigateWeek(-1)} disabled={isPending} className="h-8 px-2.5">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium px-2 min-w-[230px] text-center">{label}</span>
          <Button variant="outline" size="sm" onClick={() => navigateWeek(1)} disabled={isPending} className="h-8 px-2.5">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" />P1: 7일↑</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />P2: 3~6일</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" />P3: ~3일</span>
        </div>
        <Button variant="outline" size="sm" onClick={handleCopy} disabled={isPending} className="h-8">
          {copied ? <><Check className="h-3.5 w-3.5 mr-1.5 text-green-600" />복사됨</> : <><Copy className="h-3.5 w-3.5 mr-1.5" />요약 복사</>}
        </Button>
        {isPending && <span className="text-xs text-muted-foreground animate-pulse">로딩 중...</span>}
      </div>

      {/* ── Grid ── */}
      {mentors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
          <p className="text-sm">이번 주 근무 스케줄이 있는 멘토가 없습니다.</p>
          <p className="text-xs">멘토 스케줄 관리 페이지에서 근무 일정을 먼저 설정해주세요.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
          <table className="w-full border-collapse text-sm" style={{ minWidth: 860 }}>
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left w-[170px] text-xs font-semibold text-muted-foreground sticky left-0 bg-muted/40 z-10">
                  멘토
                </th>
                {dayDates.map(({ dow, date }) => (
                  <th
                    key={dow}
                    className={cn(
                      "px-3 py-3 text-center text-xs font-semibold w-[120px]",
                      dow === 0 || dow === 6 ? "text-red-500" : "text-muted-foreground"
                    )}
                  >
                    <div>{DAY_NAMES[dow]}</div>
                    <div className="text-[11px] font-normal text-muted-foreground/70">{date}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mentors.map((mentor, i) => (
                <MentorRow
                  key={mentor.id}
                  mentor={mentor}
                  isLast={i === mentors.length - 1}
                  isPending={isPending}
                  onSchedule={(sid, dow) => handleSchedule(sid, mentor.id, dow)}
                  onCancel={handleCancel}
                  onEditSchedule={() => setEditMentor(mentor)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Schedule Edit Sheet ── */}
      <ScheduleEditSheet
        mentor={editMentor}
        onClose={() => setEditMentor(null)}
        onSaved={() => refresh(weekStart)}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mentor Row
// ─────────────────────────────────────────────────────────────────────────────

function MentorRow({
  mentor,
  isLast,
  isPending,
  onSchedule,
  onCancel,
  onEditSchedule,
}: {
  mentor: WeeklyPlanMentor;
  isLast: boolean;
  isPending: boolean;
  onSchedule: (studentId: string, dayOfWeek: number) => void;
  onCancel: (mentoringId: string) => void;
  onEditSchedule: () => void;
}) {
  const workDayMap = new Map(mentor.workDays.map((w) => [w.dayOfWeek, w]));
  const totalScheduled = mentor.students.reduce((n, s) => n + s.scheduledMentorings.length, 0);

  return (
    <tr className={cn("align-top", !isLast && "border-b")}>
      {/* Mentor name cell — sticky */}
      <td className="px-4 py-3 sticky left-0 bg-white z-10 border-r">
        <div className="flex items-start justify-between gap-1">
          <div>
            <p className="font-semibold text-[13px] leading-tight">{mentor.name}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {mentor.students.length}명 담당
              {totalScheduled > 0 && (
                <span className="ml-1.5 text-blue-600 font-medium">{totalScheduled}건 계획</span>
              )}
            </p>
          </div>
          <button
            onClick={onEditSchedule}
            className="text-muted-foreground hover:text-foreground transition-colors mt-0.5 shrink-0"
            title="근무 스케줄 편집"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </div>
        {/* Work days summary */}
        {mentor.workDays.length > 0 && (
          <div className="flex flex-wrap gap-0.5 mt-1.5">
            {mentor.workDays.map((w) => (
              <span key={w.dayOfWeek} className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded border border-blue-100">
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

        if (!workDay) {
          return (
            <td
              key={dow}
              className={cn(
                "px-3 py-3 text-center",
                isWeekend ? "bg-muted/30" : "bg-muted/10"
              )}
            >
              <span className="text-muted-foreground/30 text-xs">—</span>
            </td>
          );
        }

        return (
          <DayCell
            key={dow}
            dow={dow}
            workDay={workDay}
            students={mentor.students}
            isPending={isPending}
            onSchedule={(sid) => onSchedule(sid, dow)}
            onCancel={onCancel}
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
  isPending,
  onSchedule,
  onCancel,
}: {
  dow: number;
  workDay: { id: string; dayOfWeek: number; timeStart: string; timeEnd: string };
  students: WeeklyPlanStudent[];
  isPending: boolean;
  onSchedule: (studentId: string) => void;
  onCancel: (mentoringId: string) => void;
}) {
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

  return (
    <td className="px-2.5 py-2.5 align-top">
      {/* Work time badge */}
      <div className="text-[10px] text-blue-600 font-medium mb-2 text-center">
        {workDay.timeStart}–{workDay.timeEnd}
      </div>

      <div className="space-y-1 min-h-[40px]">
        {/* Already scheduled */}
        {scheduledStudents.map((s) => {
          const m = s.scheduledMentorings.find((m) => m.dayOfWeek === dow)!;
          return (
            <div
              key={s.id}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 border border-blue-200 text-blue-800 text-xs font-medium group"
            >
              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", PRIORITY_DOT[s.priority])} />
              <span className="truncate flex-1">{s.name}</span>
              <button
                onClick={() => onCancel(m.id)}
                disabled={isPending}
                className="shrink-0 text-blue-400 hover:text-red-500 transition-colors disabled:opacity-40 opacity-0 group-hover:opacity-100"
                title="삭제"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}

        {/* Expected students (clickable to schedule) */}
        {expectedUnscheduled.map((s) => (
          <button
            key={s.id}
            onClick={() => onSchedule(s.id)}
            disabled={isPending}
            className={cn(
              "w-full flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-medium transition-all",
              "cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
              PRIORITY_COLORS[s.priority]
            )}
            title={`클릭하여 멘토링 배정 (마지막: ${s.daysSinceLast === null ? "기록없음" : s.daysSinceLast + "일 전"})`}
          >
            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", PRIORITY_DOT[s.priority])} />
            <span className="truncate flex-1 text-left">{s.name}</span>
            <span className="text-[10px] opacity-50">{s.grade}</span>
          </button>
        ))}

        {/* Add other students (not expected this day) */}
        {otherUnscheduled.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                disabled={isPending}
                className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded-md border border-dashed border-muted-foreground/30 text-[11px] text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground transition-colors disabled:opacity-50"
              >
                <Plus className="h-3 w-3" />
                {otherUnscheduled.length}명 더
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1.5" align="start">
              <p className="text-[10px] text-muted-foreground px-2 pb-1.5">입실 예정 없는 담당 학생</p>
              <div className="space-y-0.5">
                {otherUnscheduled.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onSchedule(s.id)}
                    disabled={isPending}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted/60 transition-colors text-left",
                      "disabled:opacity-50"
                    )}
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
              </div>
            </PopoverContent>
          </Popover>
        )}
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
