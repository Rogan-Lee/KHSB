"use client";

import { Fragment, useState, useTransition } from "react";
import { saveAttendanceRecord, createDailyOuting, updateDailyOuting, deleteDailyOuting } from "@/actions/attendance";
import { createMeritDemerit } from "@/actions/merit-demerit";
import { toast } from "sonner";
import { cn, MERIT_CATEGORIES } from "@/lib/utils";
import type { Assignment, AttendanceRecord, AttendanceSchedule, AttendanceType, Communication, DailyOuting, OutingSchedule, Student } from "@/generated/prisma";
import { ArrowRightLeft, Check, ChevronDown, ChevronUp, ClipboardList, LogIn, LogOut, MessageSquare, Plus, Star, StickyNote, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TimePickerInput } from "@/components/ui/time-picker";
import { CommunicationPanel } from "@/components/communications/communication-panel";
import { AssignmentPanel } from "@/components/assignments/assignment-panel";

type StudentWithAttendance = Student & {
  attendances: AttendanceRecord[];
  schedules: AttendanceSchedule[];
  outings: OutingSchedule[];
  dailyOutings: DailyOuting[];
  communications: Communication[];
  assignments: Assignment[];
};

const TYPE_OPTIONS: { value: AttendanceType; label: string }[] = [
  { value: "NORMAL", label: "정상" },
  { value: "ABSENT", label: "결석" },
  { value: "TARDY", label: "지각" },
  { value: "EARLY_LEAVE", label: "조퇴" },
  { value: "APPROVED_ABSENT", label: "공결" },
];

const TYPE_BADGE: Record<string, string> = {
  NORMAL: "bg-green-100 text-green-800 border-green-200",
  ABSENT: "bg-red-100 text-red-800 border-red-200",
  TARDY: "bg-orange-100 text-orange-800 border-orange-200",
  EARLY_LEAVE: "bg-blue-100 text-blue-800 border-blue-200",
  APPROVED_ABSENT: "bg-gray-100 text-gray-600 border-gray-200",
  UNRECORDED: "bg-yellow-100 text-yellow-800 border-yellow-200",
  NO_SCHEDULE: "bg-gray-50 text-gray-400 border-gray-100",
  OUTING: "bg-orange-100 text-orange-700 border-orange-200",
};

function toTimeString(dt: Date | null | undefined): string {
  if (!dt) return "";
  return new Date(dt).toTimeString().slice(0, 5);
}

function nowHHMM() {
  return new Date().toTimeString().slice(0, 5);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

const FIXED_TYPES = ["ABSENT", "APPROVED_ABSENT"] as const;

/** 입실/퇴실 시간을 바탕으로 출결 상태를 자동 계산 */
function calcAutoType(
  checkIn: string,
  checkOut: string,
  schedIn: string | undefined,
  schedOut: string | undefined,
  currentType: AttendanceType
): AttendanceType {
  // 결석·공결은 자동 변경하지 않음
  if ((FIXED_TYPES as readonly string[]).includes(currentType)) return currentType;

  let type = currentType;

  if (checkIn && schedIn) {
    if (toMinutes(checkIn) >= toMinutes(schedIn) + 5) {
      type = "TARDY";
    } else if (type === "TARDY") {
      type = "NORMAL";
    }
  }

  if (checkOut && schedOut) {
    if (toMinutes(checkOut) < toMinutes(schedOut)) {
      type = "EARLY_LEAVE";
    } else if (type === "EARLY_LEAVE") {
      type = checkIn && schedIn && toMinutes(checkIn) >= toMinutes(schedIn) + 5 ? "TARDY" : "NORMAL";
    }
  }

  return type;
}

type PanelTab = "attendance" | "assignments" | "communications" | "merit";

interface Props {
  students: StudentWithAttendance[];
  today: string;
}

export function AttendanceTable({ students, today }: Props) {
  const todayDate = new Date(today).toISOString().split("T")[0];
  const nowTime = nowHHMM();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>("attendance");
  const [editValues, setEditValues] = useState({
    checkIn: "", checkOut: "",
    type: "NORMAL" as AttendanceType, notes: "",
  });
  const [isPending, startTransition] = useTransition();

  // 테이블 인라인 편집용 로컬 상태
  type LocalTime = { checkIn: string; checkOut: string; type: AttendanceType };
  type LocalOuting = { id: string | null; outStart: Date | null; outEnd: Date | null };

  const [localTimes, setLocalTimes] = useState<Map<string, LocalTime>>(() => {
    const map = new Map<string, LocalTime>();
    students.forEach((s) => {
      const att = s.attendances[0];
      map.set(s.id, {
        checkIn: toTimeString(att?.checkIn),
        checkOut: toTimeString(att?.checkOut),
        type: att?.type ?? "NORMAL",
      });
    });
    return map;
  });

  const [localOutings, setLocalOutings] = useState<Map<string, LocalOuting[]>>(() => {
    const map = new Map<string, LocalOuting[]>();
    students.forEach((s) =>
      map.set(s.id, s.dailyOutings.map((o) => ({ id: o.id, outStart: o.outStart, outEnd: o.outEnd })))
    );
    return map;
  });

  const [quickPending, setQuickPending] = useState<string | null>(null);
  const [expandedTimelines, setExpandedTimelines] = useState<Set<string>>(new Set());

  function toggleTimeline(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setExpandedTimelines((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const sorted = [...students].sort((a, b) => {
    const na = parseInt(a.seat ?? "9999");
    const nb = parseInt(b.seat ?? "9999");
    return isNaN(na) || isNaN(nb) ? (a.seat ?? "").localeCompare(b.seat ?? "") : na - nb;
  });

  const selected = sorted.find((s) => s.id === selectedId) ?? null;

  function selectStudent(student: StudentWithAttendance) {
    if (selectedId === student.id) {
      setSelectedId(null);
      return;
    }
    const lt = localTimes.get(student.id);
    const att = student.attendances[0];
    setEditValues({
      checkIn: lt?.checkIn ?? toTimeString(att?.checkIn),
      checkOut: lt?.checkOut ?? toTimeString(att?.checkOut),
      type: lt?.type ?? att?.type ?? "NORMAL",
      notes: att?.notes ?? "",
    });
    setSelectedId(student.id);
    setPanelTab("attendance");
  }

  function getState(s: StudentWithAttendance) {
    const att = s.attendances[0];
    const outings = localOutings.get(s.id) ?? s.dailyOutings;
    const activeOuting = outings.find((o) => o.outStart && !o.outEnd);
    if (activeOuting) return "OUTING";
    const sch = s.outings[0];
    if (sch && (!att || att.type === "NORMAL") && nowTime >= sch.outStart && nowTime <= sch.outEnd) return "OUTING";
    const lt = localTimes.get(s.id);
    const type = lt?.type ?? (att?.type as string | undefined);
    if (type) return type;
    if (!s.schedules.length) return "NO_SCHEDULE";
    return "UNRECORDED";
  }

  function getStateLabel(state: string) {
    if (state === "OUTING") return "외출 중";
    if (state === "NO_SCHEDULE") return "비등원일";
    if (state === "UNRECORDED") return "미기록";
    return TYPE_OPTIONS.find((o) => o.value === state)?.label ?? state;
  }

  function saveEdit() {
    if (!selectedId) return;
    // Optimistic update — table reflects immediately
    setLocalTimes((prev) => {
      const m = new Map(prev);
      m.set(selectedId, { checkIn: editValues.checkIn, checkOut: editValues.checkOut, type: editValues.type });
      return m;
    });
    startTransition(async () => {
      try {
        await saveAttendanceRecord({
          studentId: selectedId,
          date: todayDate,
          checkIn: editValues.checkIn || undefined,
          checkOut: editValues.checkOut || undefined,
          type: editValues.type,
          notes: editValues.notes || undefined,
        });
        toast.success("저장되었습니다");
      } catch {
        toast.error("저장 실패");
      }
    });
  }

  async function quickSaveField(student: StudentWithAttendance, field: "checkIn" | "checkOut") {
    if (quickPending) return;
    const time = nowHHMM();
    const curr = localTimes.get(student.id) ?? { checkIn: "", checkOut: "", type: "NORMAL" as AttendanceType };

    let newType: AttendanceType = curr.type;
    const isFixed = (FIXED_TYPES as readonly string[]).includes(curr.type);

    if (!isFixed) {
      if (field === "checkIn") {
        const schedIn = student.schedules[0]?.startTime;
        newType = (schedIn && toMinutes(time) >= toMinutes(schedIn) + 5) ? "TARDY" : "NORMAL";
      } else if (field === "checkOut") {
        const schedOut = student.schedules[0]?.endTime;
        if (schedOut && toMinutes(time) < toMinutes(schedOut)) {
          newType = "EARLY_LEAVE";
        }
      }
    }

    const updated = { ...curr, [field]: time, type: newType };
    setLocalTimes((prev) => { const m = new Map(prev); m.set(student.id, updated); return m; });
    if (selectedId === student.id) setEditValues((v) => ({ ...v, [field]: time, type: newType }));
    setQuickPending(student.id);
    try {
      await saveAttendanceRecord({
        studentId: student.id, date: todayDate,
        checkIn: updated.checkIn || undefined,
        checkOut: updated.checkOut || undefined,
        type: updated.type,
      });
      const label = field === "checkIn"
        ? (newType === "TARDY" ? "입실 기록됨 (지각)" : "입실 기록됨")
        : (newType === "EARLY_LEAVE" ? "퇴실 기록됨 (조퇴)" : "퇴실 기록됨");
      toast.success(label);
    } catch { toast.error("저장 실패"); }
    setQuickPending(null);
  }

  async function quickStartOuting(student: StudentWithAttendance) {
    if (quickPending) return;
    const time = nowHHMM();
    setQuickPending(student.id);
    try {
      const created = await createDailyOuting({ studentId: student.id, date: todayDate, outStart: time });
      setLocalOutings((prev) => {
        const m = new Map(prev);
        m.set(student.id, [...(m.get(student.id) ?? []), { id: created.id, outStart: created.outStart, outEnd: null }]);
        return m;
      });
      toast.success("외출 시작");
    } catch { toast.error("저장 실패"); }
    setQuickPending(null);
  }

  async function quickEndOuting(student: StudentWithAttendance) {
    if (quickPending) return;
    const outings = localOutings.get(student.id) ?? [];
    const active = outings.find((o) => o.outStart && !o.outEnd);
    if (!active?.id) return;
    const time = nowHHMM();
    setQuickPending(student.id);
    try {
      await updateDailyOuting(active.id, { date: todayDate, outEnd: time });
      setLocalOutings((prev) => {
        const m = new Map(prev);
        m.set(student.id, outings.map((o) =>
          o.id === active.id ? { ...o, outEnd: new Date(`${todayDate}T${time}:00`) } : o
        ));
        return m;
      });

      // 예정 복귀 시간보다 늦으면 지각 처리
      const outSch = student.outings[0];
      const curr = localTimes.get(student.id) ?? { checkIn: "", checkOut: "", type: "NORMAL" as AttendanceType };
      const isFixed = (FIXED_TYPES as readonly string[]).includes(curr.type);
      if (!isFixed && outSch?.outEnd && toMinutes(time) > toMinutes(outSch.outEnd)) {
        const updatedType: AttendanceType = "TARDY";
        setLocalTimes((prev) => { const m = new Map(prev); m.set(student.id, { ...curr, type: updatedType }); return m; });
        if (selectedId === student.id) setEditValues((v) => ({ ...v, type: updatedType }));
        await saveAttendanceRecord({
          studentId: student.id, date: todayDate,
          checkIn: curr.checkIn || undefined,
          checkOut: curr.checkOut || undefined,
          type: updatedType,
        });
        toast.success("복귀 처리됨 (지각)");
      } else {
        toast.success("복귀 처리됨");
      }
    } catch { toast.error("저장 실패"); }
    setQuickPending(null);
  }

  const pendingAssignments = selected?.assignments.filter((a) => !a.isCompleted).length ?? 0;
  const pendingComms = selected?.communications.filter((c) => !c.isChecked).length ?? 0;

  const TABS: { key: PanelTab; label: string; badge?: number; badgeColor?: string }[] = [
    { key: "attendance", label: "입퇴실" },
    { key: "merit", label: "상벌점" },
    { key: "assignments", label: "과제", badge: pendingAssignments, badgeColor: "bg-orange-500" },
    { key: "communications", label: "요청/전달", badge: pendingComms, badgeColor: "bg-red-500" },
  ];

  return (
    <>
      {/* 테이블 — 항상 고정 */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b bg-muted/50 text-muted-foreground text-xs font-medium">
              <th className="w-8 shrink-0" />
              <th className="px-3 py-2.5 text-center w-12 shrink-0">좌석</th>
              <th className="px-3 py-2.5 text-left">이름</th>
              <th className="px-3 py-2.5 text-center w-24">입실 예정</th>
              <th className="px-3 py-2.5 text-left w-32">입실</th>
              <th className="px-3 py-2.5 text-center w-24">퇴실 예정</th>
              <th className="px-3 py-2.5 text-left w-32">퇴실</th>
              <th className="px-3 py-2.5 text-left w-36">외출 예정</th>
              <th className="px-3 py-2.5 text-left w-36">복귀 예정</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((student) => {
              const state = getState(student);
              const isSelected = selectedId === student.id;
              const isQuickLoading = quickPending === student.id;
              const lt = localTimes.get(student.id);
              const checkInTime = lt?.checkIn ?? "";
              const checkOutTime = lt?.checkOut ?? "";
              const schedIn = student.schedules[0]?.startTime;
              const schedOut = student.schedules[0]?.endTime;
              const outSch = student.outings[0];
              const localOut = localOutings.get(student.id) ?? [];
              const activeOuting = localOut.find((o) => o.outStart && !o.outEnd);
              const lastOuting = localOut[localOut.length - 1];
              const commCount = student.communications.filter((c) => !c.isChecked).length;
              const assignCount = student.assignments.filter((a) => !a.isCompleted).length;
              const schoolGrade = [student.school, student.grade].filter(Boolean).join(" ");

              const isExpanded = expandedTimelines.has(student.id);
              const isLate = !!(checkInTime && schedIn && toMinutes(checkInTime) >= toMinutes(schedIn) + 5);
              const isEarlyLeave = !!(checkOutTime && schedOut && toMinutes(checkOutTime) < toMinutes(schedOut));

              return (
                <Fragment key={student.id}>
                <tr
                  onClick={() => selectStudent(student)}
                  className={cn(
                    "border-b transition-colors cursor-pointer",
                    isSelected ? "bg-blue-50 border-l-2 border-l-blue-500" : "hover:bg-accent/50",
                    state === "NO_SCHEDULE" && "opacity-50"
                  )}
                >
                  {/* 타임라인 토글 */}
                  <td className="pl-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => toggleTimeline(student.id, e)}
                      className="p-1 rounded hover:bg-accent text-muted-foreground transition-colors"
                      title="일과 타임라인"
                    >
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  </td>
                  {/* 좌석 */}
                  <td className="px-3 py-3 text-center text-sm text-muted-foreground font-mono font-medium">
                    {student.seat ?? "—"}
                  </td>

                  {/* 이름 + 학교/학년 + 배지 */}
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="font-semibold text-sm truncate">{student.name}</p>
                        {commCount > 0 && (
                          <span className="flex items-center gap-0.5 bg-orange-100 text-orange-700 text-[10px] px-1.5 py-0.5 rounded-full border border-orange-200 font-medium shrink-0">
                            <MessageSquare className="h-2.5 w-2.5" />{commCount}
                          </span>
                        )}
                        {assignCount > 0 && (
                          <span className="flex items-center gap-0.5 bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-full border border-blue-200 font-medium shrink-0">
                            <ClipboardList className="h-2.5 w-2.5" />{assignCount}
                          </span>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5">
                        {schoolGrade && (
                          <span className="text-xs text-muted-foreground">{schoolGrade}</span>
                        )}
                        <span className={cn("inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] whitespace-nowrap", TYPE_BADGE[state])}>
                          {state === "OUTING" && <ArrowRightLeft className="h-2.5 w-2.5" />}
                          {getStateLabel(state)}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* 입실 예정 */}
                  <td className="px-3 py-3 text-center">
                    <span className="text-sm font-mono text-muted-foreground">
                      {schedIn ?? <span className="text-gray-300">—</span>}
                    </span>
                  </td>

                  {/* 입실 실제 + 지금 */}
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-sm font-mono tabular-nums w-10 text-right", checkInTime ? "text-foreground font-semibold" : "text-gray-300")}>
                        {checkInTime || "—"}
                      </span>
                      <button
                        onClick={() => quickSaveField(student, "checkIn")}
                        disabled={isQuickLoading}
                        className="flex items-center gap-0.5 px-2 py-1 text-xs rounded-md bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 shrink-0 transition-colors disabled:opacity-40 font-medium"
                      >
                        <LogIn className="h-3 w-3" />지금
                      </button>
                    </div>
                  </td>

                  {/* 퇴실 예정 */}
                  <td className="px-3 py-3 text-center">
                    <span className="text-sm font-mono text-muted-foreground">
                      {schedOut ?? <span className="text-gray-300">—</span>}
                    </span>
                  </td>

                  {/* 퇴실 실제 + 지금 */}
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-sm font-mono tabular-nums w-10 text-right", checkOutTime ? "text-foreground font-semibold" : "text-gray-300")}>
                        {checkOutTime || "—"}
                      </span>
                      <button
                        onClick={() => quickSaveField(student, "checkOut")}
                        disabled={isQuickLoading || !checkInTime}
                        className="flex items-center gap-0.5 px-2 py-1 text-xs rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 shrink-0 transition-colors disabled:opacity-40 font-medium"
                      >
                        <LogOut className="h-3 w-3" />지금
                      </button>
                    </div>
                  </td>

                  {/* 외출 예정 + 실제 외출 */}
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-muted-foreground w-10 text-right">
                        {outSch?.outStart ?? <span className="text-gray-300">—</span>}
                      </span>
                      {activeOuting ? (
                        <span className="text-sm font-mono font-semibold text-orange-600">
                          {toTimeString(activeOuting.outStart)}
                        </span>
                      ) : lastOuting?.outStart ? (
                        <span className="text-sm font-mono text-muted-foreground">
                          {toTimeString(lastOuting.outStart)}
                        </span>
                      ) : (
                        <button
                          onClick={() => quickStartOuting(student)}
                          disabled={isQuickLoading || !checkInTime}
                          className="flex items-center gap-0.5 px-2 py-1 text-xs rounded-md bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 shrink-0 transition-colors disabled:opacity-40 font-medium"
                        >
                          <ArrowRightLeft className="h-3 w-3" />외출
                        </button>
                      )}
                    </div>
                  </td>

                  {/* 복귀 예정 + 실제 복귀 */}
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-muted-foreground w-10 text-right">
                        {outSch?.outEnd ?? <span className="text-gray-300">—</span>}
                      </span>
                      <span className={cn("text-sm font-mono tabular-nums w-10", lastOuting?.outEnd ? "text-foreground font-semibold" : "text-gray-300")}>
                        {lastOuting?.outEnd ? toTimeString(lastOuting.outEnd) : "—"}
                      </span>
                      <button
                        onClick={() => quickEndOuting(student)}
                        disabled={isQuickLoading || !activeOuting || !checkInTime}
                        className="flex items-center gap-0.5 px-2 py-1 text-xs rounded-md bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 shrink-0 transition-colors disabled:opacity-40 font-medium"
                      >
                        <LogIn className="h-3 w-3" />지금
                      </button>
                    </div>
                  </td>
                </tr>

                {/* 타임라인 확장 행 */}
                {isExpanded && (
                  <tr className={cn("border-b", isSelected ? "bg-blue-50/60" : "bg-muted/30")}>
                    <td colSpan={9} className="px-4 py-3">
                      <div className="flex items-center gap-1 flex-wrap text-xs">

                        {/* 입실 */}
                        <div className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border font-medium",
                          checkInTime
                            ? isLate
                              ? "bg-orange-50 border-orange-200 text-orange-800"
                              : "bg-green-50 border-green-200 text-green-800"
                            : "bg-muted border-border text-muted-foreground"
                        )}>
                          <LogIn className="h-3 w-3 shrink-0" />
                          <span className="font-mono">{checkInTime || "—"}</span>
                          <span className="opacity-70">입실</span>
                          {isLate && <span className="text-[10px] bg-orange-200 text-orange-800 rounded px-1">지각</span>}
                        </div>

                        {/* 외출/복귀 루프 */}
                        {localOut.length > 0 ? localOut.map((o, i) => (
                          <Fragment key={i}>
                            <div className="h-px w-4 bg-border shrink-0" />
                            <div className="flex items-center gap-1 bg-orange-50 border border-orange-200 text-orange-800 rounded-full px-2.5 py-1.5 font-medium">
                              <ArrowRightLeft className="h-3 w-3 shrink-0" />
                              <span className="font-mono">{o.outStart ? toTimeString(o.outStart) : "—"}</span>
                              <span className="opacity-70">외출{localOut.length > 1 ? ` ${i + 1}` : ""}</span>
                            </div>
                            <div className="h-px w-4 bg-border shrink-0" />
                            <div className={cn(
                              "flex items-center gap-1 rounded-full px-2.5 py-1.5 border font-medium",
                              o.outEnd
                                ? "bg-green-50 border-green-200 text-green-800"
                                : "bg-muted border-border text-muted-foreground"
                            )}>
                              <LogIn className="h-3 w-3 shrink-0" />
                              <span className="font-mono">{o.outEnd ? toTimeString(o.outEnd) : "—"}</span>
                              <span className="opacity-70">복귀</span>
                            </div>
                          </Fragment>
                        )) : outSch ? (
                          <>
                            <div className="h-px w-4 bg-border shrink-0" />
                            <div className="flex items-center gap-1 bg-muted border border-border text-muted-foreground rounded-full px-2.5 py-1.5">
                              <ArrowRightLeft className="h-3 w-3 shrink-0" />
                              <span className="font-mono">{outSch.outStart}</span>
                              <span className="opacity-70">외출 예정</span>
                            </div>
                            <div className="h-px w-4 bg-border shrink-0" />
                            <div className="flex items-center gap-1 bg-muted border border-border text-muted-foreground rounded-full px-2.5 py-1.5">
                              <LogIn className="h-3 w-3 shrink-0" />
                              <span className="font-mono">{outSch.outEnd}</span>
                              <span className="opacity-70">복귀 예정</span>
                            </div>
                          </>
                        ) : null}

                        {/* 퇴실 */}
                        <div className="h-px w-4 bg-border shrink-0" />
                        <div className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border font-medium",
                          checkOutTime
                            ? isEarlyLeave
                              ? "bg-blue-50 border-blue-200 text-blue-800"
                              : "bg-blue-50 border-blue-200 text-blue-800"
                            : "bg-muted border-border text-muted-foreground"
                        )}>
                          <LogOut className="h-3 w-3 shrink-0" />
                          <span className="font-mono">{checkOutTime || "—"}</span>
                          <span className="opacity-70">퇴실</span>
                          {isEarlyLeave && <span className="text-[10px] bg-blue-200 text-blue-800 rounded px-1">조퇴</span>}
                        </div>

                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 오버레이 패널 */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full bg-background border-l shadow-2xl z-50 flex flex-col transition-transform duration-200",
          "w-[460px]",
          selected ? "translate-x-0" : "translate-x-full"
        )}
      >
        {selected && (
          <>
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b bg-muted/20 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold shrink-0">
                  {selected.name[0]}
                </div>
                <div>
                  <p className="font-semibold">{selected.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[selected.school, selected.grade, selected.seat ? `${selected.seat}번 좌석` : ""].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedId(null)}
                className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-accent transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 탭 */}
            <div className="flex border-b shrink-0">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setPanelTab(tab.key)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors border-b-2",
                    panelTab === tab.key
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label}
                  {tab.badge ? (
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none text-white", tab.badgeColor)}>
                      {tab.badge}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            {/* 탭 내용 */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {panelTab === "attendance" && (() => {
                const schedIn = selected.schedules[0]?.startTime;
                const schedOut = selected.schedules[0]?.endTime;
                const outSch = selected.outings[0];
                const panelLocalOut = localOutings.get(selected.id) ?? [];
                const isLate = !!(editValues.checkIn && schedIn && toMinutes(editValues.checkIn) >= toMinutes(schedIn) + 5);
                const isEarlyLeave = !!(editValues.checkOut && schedOut && toMinutes(editValues.checkOut) < toMinutes(schedOut));
                const mergedOutings = panelLocalOut
                  .filter((lo): lo is { id: string; outStart: Date | null; outEnd: Date | null } => lo.id !== null)
                  .map((lo) => {
                    const original = selected.dailyOutings.find((d) => d.id === lo.id);
                    return { id: lo.id, outStart: lo.outStart, outEnd: lo.outEnd, reason: original?.reason ?? null };
                  });

                return (
                  <div className="space-y-4">
                    {/* 출결 상태 */}
                    <div className="flex items-center justify-between py-1 border-b pb-3">
                      <span className="text-sm text-muted-foreground">출결 상태</span>
                      <select
                        value={editValues.type}
                        onChange={(e) => setEditValues((v) => ({ ...v, type: e.target.value as AttendanceType }))}
                        className="border rounded-md px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        {TYPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* 타임라인 로그 */}
                    <div className="relative pl-10">
                      {/* 수직선 */}
                      <div className="absolute left-[18px] top-4 bottom-4 w-px bg-border" />

                      {/* ── 입실 ── */}
                      <div className="relative mb-4">
                        <div className="absolute -left-10 top-1 w-8 h-8 rounded-full bg-green-100 border border-green-200 flex items-center justify-center shrink-0">
                          <LogIn className="h-4 w-4 text-green-600" />
                        </div>
                        <div className="border rounded-lg p-3 bg-background space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold">입실</span>
                              {isLate && (
                                <span className="text-[11px] bg-orange-100 text-orange-700 border border-orange-200 rounded-full px-2 py-0.5 font-medium">지각</span>
                              )}
                            </div>
                            {schedIn && (
                              <span className="text-xs text-muted-foreground font-mono">예정 {schedIn}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <TimePickerInput
                              value={editValues.checkIn}
                              onChange={(v) => {
                                const newType = calcAutoType(v, editValues.checkOut, schedIn, schedOut, editValues.type);
                                setEditValues((prev) => ({ ...prev, checkIn: v, type: newType }));
                                setLocalTimes((prev) => { const m = new Map(prev); const c = m.get(selected.id) ?? { checkIn: "", checkOut: "", type: "NORMAL" as AttendanceType }; m.set(selected.id, { ...c, checkIn: v, type: newType }); return m; });
                              }}
                            />
                            <button
                              onClick={() => {
                                const t = nowHHMM();
                                const newType = calcAutoType(t, editValues.checkOut, schedIn, schedOut, editValues.type);
                                setEditValues((v) => ({ ...v, checkIn: t, type: newType }));
                                setLocalTimes((prev) => { const m = new Map(prev); const c = m.get(selected.id) ?? { checkIn: "", checkOut: "", type: "NORMAL" as AttendanceType }; m.set(selected.id, { ...c, checkIn: t, type: newType }); return m; });
                              }}
                              className="px-2.5 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md shrink-0 font-medium"
                            >
                              지금
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* ── 외출 / 복귀 ── */}
                      <div className="relative mb-4">
                        <div className="absolute -left-10 top-1 w-8 h-8 rounded-full bg-orange-100 border border-orange-200 flex items-center justify-center shrink-0">
                          <ArrowRightLeft className="h-4 w-4 text-orange-600" />
                        </div>
                        <div className="border rounded-lg bg-background overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2.5 border-b bg-muted/30">
                            <span className="text-sm font-semibold">외출 / 복귀</span>
                            {outSch && (
                              <span className="text-xs text-muted-foreground font-mono">예정 {outSch.outStart} ~ {outSch.outEnd}</span>
                            )}
                          </div>
                          <div className="p-2">
                            <OutingTablePanel
                              key={panelLocalOut.map((o) => o.id).join(",")}
                              studentId={selected.id}
                              todayDate={todayDate}
                              scheduledOutings={selected.outings}
                              dailyOutings={mergedOutings}
                              onDelete={(id) => setLocalOutings((prev) => {
                                const m = new Map(prev);
                                m.set(selected.id, (m.get(selected.id) ?? []).filter((o) => o.id !== id));
                                return m;
                              })}
                              onUpsert={(outing) => setLocalOutings((prev) => {
                                const m = new Map(prev);
                                const cur = m.get(selected.id) ?? [];
                                if (cur.find((o) => o.id === outing.id)) {
                                  m.set(selected.id, cur.map((o) => o.id === outing.id ? { ...o, ...outing } : o));
                                } else {
                                  m.set(selected.id, [...cur, outing]);
                                }
                                return m;
                              })}
                            />
                          </div>
                        </div>
                      </div>

                      {/* ── 퇴실 ── */}
                      <div className="relative">
                        <div className="absolute -left-10 top-1 w-8 h-8 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center shrink-0">
                          <LogOut className="h-4 w-4 text-blue-600" />
                        </div>
                        <div className="border rounded-lg p-3 bg-background space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold">퇴실</span>
                              {isEarlyLeave && (
                                <span className="text-[11px] bg-blue-100 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5 font-medium">조퇴</span>
                              )}
                            </div>
                            {schedOut && (
                              <span className="text-xs text-muted-foreground font-mono">예정 {schedOut}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <TimePickerInput
                              value={editValues.checkOut}
                              onChange={(v) => {
                                const newType = calcAutoType(editValues.checkIn, v, schedIn, schedOut, editValues.type);
                                setEditValues((prev) => ({ ...prev, checkOut: v, type: newType }));
                                setLocalTimes((prev) => { const m = new Map(prev); const c = m.get(selected.id) ?? { checkIn: "", checkOut: "", type: "NORMAL" as AttendanceType }; m.set(selected.id, { ...c, checkOut: v, type: newType }); return m; });
                              }}
                            />
                            <button
                              onClick={() => {
                                const t = nowHHMM();
                                const newType = calcAutoType(editValues.checkIn, t, schedIn, schedOut, editValues.type);
                                setEditValues((v) => ({ ...v, checkOut: t, type: newType }));
                                setLocalTimes((prev) => { const m = new Map(prev); const c = m.get(selected.id) ?? { checkIn: "", checkOut: "", type: "NORMAL" as AttendanceType }; m.set(selected.id, { ...c, checkOut: t, type: newType }); return m; });
                              }}
                              className="px-2.5 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md shrink-0 font-medium"
                            >
                              지금
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 비고 */}
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                        <StickyNote className="h-3.5 w-3.5" /> 비고
                      </label>
                      <input
                        type="text"
                        value={editValues.notes}
                        onChange={(e) => setEditValues((v) => ({ ...v, notes: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); }}
                        placeholder="특이사항 메모"
                        className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    <Button onClick={saveEdit} disabled={isPending} className="w-full">
                      {isPending ? "저장 중..." : "저장"}
                    </Button>
                  </div>
                );
              })()}

              {panelTab === "merit" && (
                <MeritPanel studentId={selected.id} studentName={selected.name} />
              )}

              {panelTab === "assignments" && (
                <AssignmentPanel
                  studentId={selected.id}
                  studentName={selected.name}
                  initialItems={selected.assignments}
                  compact
                />
              )}

              {panelTab === "communications" && (
                <CommunicationPanel
                  studentId={selected.id}
                  initialItems={selected.communications}
                  compact
                />
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

type MinimalOuting = { id: string; outStart: Date | null; outEnd: Date | null; reason: string | null };

function OutingTablePanel({
  studentId,
  todayDate,
  scheduledOutings,
  dailyOutings: initialDailyOutings,
  onDelete,
  onUpsert,
}: {
  studentId: string;
  todayDate: string;
  scheduledOutings: OutingSchedule[];
  dailyOutings: MinimalOuting[];
  onDelete?: (id: string) => void;
  onUpsert?: (outing: { id: string; outStart: Date | null; outEnd: Date | null }) => void;
}) {
  type OutingRow = { id: string | null; outStart: string; outEnd: string; reason: string; dirty: boolean };

  const [rows, setRows] = useState<OutingRow[]>(() =>
    initialDailyOutings.map((o) => ({
      id: o.id,
      outStart: toTimeString(o.outStart),
      outEnd: toTimeString(o.outEnd),
      reason: o.reason ?? "",
      dirty: false,
    }))
  );
  const [isPending, startTransition] = useTransition();

  const numRows = Math.max(scheduledOutings.length, rows.length);

  function updateRow(idx: number, patch: Partial<OutingRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch, dirty: true } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { id: null, outStart: "", outEnd: "", reason: "", dirty: false }]);
  }

  function saveRow(idx: number) {
    const row = rows[idx];
    startTransition(async () => {
      try {
        if (row.id) {
          await updateDailyOuting(row.id, {
            date: todayDate,
            outStart: row.outStart || undefined,
            outEnd: row.outEnd || undefined,
            reason: row.reason || undefined,
          });
          setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, dirty: false } : r)));
          onUpsert?.({ id: row.id, outStart: row.outStart ? new Date(`${todayDate}T${row.outStart}:00`) : null, outEnd: row.outEnd ? new Date(`${todayDate}T${row.outEnd}:00`) : null });
          toast.success("저장되었습니다");
        } else {
          const created = await createDailyOuting({
            studentId,
            date: todayDate,
            outStart: row.outStart || undefined,
            outEnd: row.outEnd || undefined,
            reason: row.reason || undefined,
          });
          setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, id: created.id, dirty: false } : r)));
          onUpsert?.({ id: created.id, outStart: created.outStart, outEnd: created.outEnd });
          toast.success("외출 추가됨");
        }
      } catch {
        toast.error("저장 실패");
      }
    });
  }

  function deleteRow(idx: number) {
    const row = rows[idx];
    startTransition(async () => {
      try {
        if (row.id) {
          await deleteDailyOuting(row.id);
          onDelete?.(row.id);
        }
        setRows((prev) => prev.filter((_, i) => i !== idx));
        toast.success("삭제되었습니다");
      } catch {
        toast.error("삭제 실패");
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">외출</p>
        <button
          onClick={addRow}
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Plus className="h-3.5 w-3.5" /> 추가
        </button>
      </div>

      {numRows === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3 rounded-md border border-dashed">
          오늘 외출 기록 없음
        </p>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-muted/40 text-muted-foreground">
                <th className="px-2 py-1.5 text-center font-medium w-5">#</th>
                <th className="px-2 py-1.5 text-center font-medium">예정 외출</th>
                <th className="px-2 py-1.5 text-center font-medium">예정 복귀</th>
                <th className="px-2 py-1.5 text-center font-medium">실제 외출</th>
                <th className="px-2 py-1.5 text-center font-medium">실제 복귀</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: numRows }, (_, i) => {
                const sched = scheduledOutings[i];
                const row = rows[i];
                return (
                  <Fragment key={i}>
                    <tr className="border-t">
                      <td className="px-2 py-2 text-center text-muted-foreground">{i + 1}</td>
                      <td className="px-2 py-2 text-center font-mono text-muted-foreground">
                        {sched?.outStart ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-2 py-2 text-center font-mono text-muted-foreground">
                        {sched?.outEnd ?? <span className="text-gray-300">—</span>}
                      </td>
                      {/* 실제 외출 */}
                      <td className="px-1 py-1">
                        {row ? (
                          <div className="flex gap-0.5 items-center">
                            <TimePickerInput
                              value={row.outStart}
                              onChange={(v) => updateRow(i, { outStart: v })}
                              size="sm"
                            />
                            <button
                              onClick={() => updateRow(i, { outStart: nowHHMM() })}
                              className="shrink-0 px-1 py-1 text-[9px] bg-orange-50 text-orange-700 rounded border border-orange-200 leading-none"
                            >
                              지금
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-300 px-2">—</span>
                        )}
                      </td>
                      {/* 실제 복귀 */}
                      <td className="px-1 py-1">
                        {row ? (
                          <div className="flex gap-0.5 items-center">
                            <TimePickerInput
                              value={row.outEnd}
                              onChange={(v) => updateRow(i, { outEnd: v })}
                              size="sm"
                            />
                            <button
                              onClick={() => updateRow(i, { outEnd: nowHHMM() })}
                              className="shrink-0 px-1 py-1 text-[9px] bg-orange-50 text-orange-700 rounded border border-orange-200 leading-none"
                            >
                              지금
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-300 px-2">—</span>
                        )}
                      </td>
                      {/* actions */}
                      <td className="px-1 py-1">
                        {row && (
                          <div className="flex items-center gap-1 justify-center">
                            {row.dirty && (
                              <button
                                onClick={() => saveRow(i)}
                                disabled={isPending}
                                title="저장"
                                className="text-primary hover:text-primary/70 transition-colors"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => deleteRow(i)}
                              disabled={isPending}
                              title="삭제"
                              className="text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {/* 사유 행 */}
                    {row && (
                      <tr className="bg-muted/10">
                        <td colSpan={6} className="px-2 pb-1.5 pt-0">
                          <input
                            type="text"
                            placeholder="사유 (예: 수학학원)"
                            value={row.reason}
                            onChange={(e) => updateRow(i, { reason: e.target.value })}
                            className="w-full border rounded px-2 py-1 text-[11px] bg-background focus:outline-none focus:ring-1 focus:ring-primary text-muted-foreground placeholder:text-gray-300"
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MeritPanel({ studentId, studentName }: { studentId: string; studentName: string }) {
  const [type, setType] = useState<"MERIT" | "DEMERIT">("MERIT");
  const [points, setPoints] = useState(1);
  const [category, setCategory] = useState("");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  const todayStr = new Date().toISOString().split("T")[0];

  function handleSubmit() {
    if (!reason.trim()) { toast.error("사유를 입력하세요"); return; }
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("studentId", studentId);
        fd.append("date", todayStr);
        fd.append("type", type);
        fd.append("points", String(points));
        fd.append("reason", reason.trim());
        if (category) fd.append("category", category);
        await createMeritDemerit(fd);
        setReason("");
        setPoints(1);
        setCategory("");
        toast.success(`${studentName}에게 ${type === "MERIT" ? "상점" : "벌점"} ${points}점 부여`);
      } catch {
        toast.error("저장 실패");
      }
    });
  }

  const QUICK_POINTS = [1, 2, 3, 5, 10];

  return (
    <div className="space-y-5">
      {/* 상점 / 벌점 토글 */}
      <div className="flex rounded-lg border overflow-hidden">
        <button
          onClick={() => setType("MERIT")}
          className={cn(
            "flex-1 py-2.5 text-sm font-medium transition-colors",
            type === "MERIT"
              ? "bg-green-500 text-white"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          상점
        </button>
        <button
          onClick={() => setType("DEMERIT")}
          className={cn(
            "flex-1 py-2.5 text-sm font-medium transition-colors border-l",
            type === "DEMERIT"
              ? "bg-red-500 text-white"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          벌점
        </button>
      </div>

      {/* 점수 */}
      <div className="space-y-2">
        <label className="flex items-center gap-1.5 text-sm font-medium">
          <Star className="h-3.5 w-3.5 text-muted-foreground" />
          점수
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={100}
            value={points}
            onChange={(e) => setPoints(Math.max(1, Math.min(100, Number(e.target.value))))}
            className="w-20 border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary text-center font-mono"
          />
          <div className="flex gap-1">
            {QUICK_POINTS.map((p) => (
              <button
                key={p}
                onClick={() => setPoints(p)}
                className={cn(
                  "px-2.5 py-1.5 text-xs rounded-md border transition-colors",
                  points === p
                    ? type === "MERIT"
                      ? "bg-green-500 text-white border-green-500"
                      : "bg-red-500 text-white border-red-500"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 카테고리 */}
      <div className="space-y-2">
        <label className="text-sm font-medium">카테고리 (선택)</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">카테고리 없음</option>
          {MERIT_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* 사유 */}
      <div className="space-y-2">
        <label className="text-sm font-medium">사유 *</label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          placeholder="사유를 입력하세요"
          className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <Button
        onClick={handleSubmit}
        disabled={isPending || !reason.trim()}
        className={cn(
          "w-full",
          type === "MERIT"
            ? "bg-green-500 hover:bg-green-600 text-white"
            : "bg-red-500 hover:bg-red-600 text-white"
        )}
      >
        {isPending ? "저장 중..." : `${type === "MERIT" ? "상점" : "벌점"} ${points}점 부여`}
      </Button>
    </div>
  );
}
