"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAttendanceRecord, createDailyOuting, updateDailyOuting, deleteDailyOuting } from "@/actions/attendance";
import { patchStudentTextFields, patchStudentCheckDate } from "@/actions/students";
import { createMeritDemerit } from "@/actions/merit-demerit";
import { createStudyPlanReport } from "@/actions/study-plan-reports";
import { toast } from "sonner";
import { cn, MERIT_CATEGORIES } from "@/lib/utils";
import type { Assignment, AttendanceRecord, AttendanceSchedule, AttendanceType, Communication, DailyOuting, OutingSchedule, Student } from "@/generated/prisma";
import { ArrowRightLeft, Check, ChevronDown, ChevronUp, ClipboardList, LogIn, LogOut, MessageSquare, PanelRightOpen, Pin, Plus, Save, Search, Star, StickyNote, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { TimePickerInput } from "@/components/ui/time-picker";
import { CommunicationPanel } from "@/components/communications/communication-panel";
import { AssignmentPanel } from "@/components/assignments/assignment-panel";
import { StudentCalendarPanel } from "@/components/calendar/student-calendar-panel";

type StudentWithAttendance = Student & {
  attendances: AttendanceRecord[];
  schedules: AttendanceSchedule[];
  outings: OutingSchedule[];
  dailyOutings: DailyOuting[];
  communications: Communication[];
  assignments: Assignment[];
  merits: { type: string; points: number; date: Date }[];
  vocabEnrollment?: { isActive: boolean } | null;
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
  FLEXIBLE: "bg-violet-50 text-violet-600 border-violet-200",
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

type PanelTab = "attendance" | "assignments" | "communications" | "merit" | "schedule" | "studyplan";

interface Props {
  students: StudentWithAttendance[];
  today: string;
}

export function AttendanceTable({ students, today }: Props) {
  const todayDate = new Date(today).toISOString().split("T")[0];
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // 자정 넘김 감지: 서버에서 받은 날짜와 현재 KST 날짜가 다르면 자동 새로고침
  useEffect(() => {
    const check = () => {
      const now = new Date();
      const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const kstDate = kst.toISOString().split("T")[0];
      if (kstDate !== todayDate) {
        router.refresh();
      }
    };
    const timer = setInterval(check, 60_000); // 1분마다 체크
    return () => clearInterval(timer);
  }, [todayDate, router]);

  // Shift+휠로 가로 스크롤
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function scrollBy(delta: number) {
    scrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  }
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>("attendance");
  const [infoModalId, setInfoModalId] = useState<string | null>(null);
  const [infoModalText, setInfoModalText] = useState("");
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

  type StudentTextField = { studentInfo: string; changeNote: string; academySchedule: string };
  const [localStudentFields, setLocalStudentFields] = useState<Map<string, StudentTextField>>(() => {
    const map = new Map<string, StudentTextField>();
    students.forEach((s) => map.set(s.id, {
      studentInfo: s.studentInfo ?? "",
      changeNote: s.changeNote ?? "",
      academySchedule: s.academySchedule ?? "",
    }));
    return map;
  });

  type CheckDateKey = "vocabTestDate" | "pledgeDate" | "mockAnalysisDate" | "schoolAnalysisDate" | "plannerSentDate" | "weeklyPlanDate";
  type CheckDateState = Record<CheckDateKey, string | null>;

  // 매주 화요일 초기화 대상 키
  const WEEKLY_KEYS = new Set<CheckDateKey>(["vocabTestDate", "plannerSentDate", "weeklyPlanDate"]);

  // 이번 주 화요일 기준일 계산
  function getLastTuesday(): Date {
    const now = new Date();
    const day = now.getDay(); // 0=일, 1=월, 2=화 ...
    const daysBack = day >= 2 ? day - 2 : day + 5;
    const lastTue = new Date(now);
    lastTue.setDate(now.getDate() - daysBack);
    lastTue.setHours(0, 0, 0, 0);
    return lastTue;
  }

  // 해당 항목이 "이번 주 완료" 상태인지 판단
  function isDoneThisWeek(key: CheckDateKey, dateVal: string | null): boolean {
    if (!dateVal) return false;
    if (!WEEKLY_KEYS.has(key)) return true; // 서약서·분석지는 날짜 있으면 항상 완료
    return new Date(dateVal) >= getLastTuesday();
  }

  const [localCheckDates, setLocalCheckDates] = useState<Map<string, CheckDateState>>(() => {
    const map = new Map<string, CheckDateState>();
    const toISO = (d: Date | null | undefined) => d ? new Date(d).toISOString().split("T")[0] : null;
    students.forEach((s) => map.set(s.id, {
      vocabTestDate: toISO(s.vocabTestDate),
      pledgeDate: toISO(s.pledgeDate),
      mockAnalysisDate: toISO(s.mockAnalysisDate),
      schoolAnalysisDate: toISO(s.schoolAnalysisDate),
      plannerSentDate: toISO(s.plannerSentDate),
      weeklyPlanDate: toISO((s as unknown as Record<string, unknown>).weeklyPlanDate as Date | null | undefined),
    }));
    return map;
  });
  const [checkDatePending, setCheckDatePending] = useState<string | null>(null); // "studentId:key"

  type EditFocus = "attendance" | "notes" | "changeNote" | "academySchedule";
  const [expandFocus, setExpandFocus] = useState<Map<string, EditFocus>>(new Map());
  const [studentFieldPending, setStudentFieldPending] = useState<string | null>(null);
  const [expandedTimelines, setExpandedTimelines] = useState<Set<string>>(new Set());

  const [tooltip, setTooltip] = useState<{ text: string; rect: DOMRect } | null>(null);

  const [quickPending, setQuickPending] = useState<string | null>(null);

  type InlineTimeEdit = { studentId: string; field: "checkIn" | "checkOut"; value: string };
  const [inlineTimeEdit, setInlineTimeEdit] = useState<InlineTimeEdit | null>(null);

  type InlineOutingEdit = { studentId: string; field: "outStart" | "outEnd"; value: string };
  const [inlineOutingEdit, setInlineOutingEdit] = useState<InlineOutingEdit | null>(null);

  const [query, setQuery] = useState("");

  // 현재 시각 (매분 갱신) — 입실 임박 하이라이트용
  const [nowMinutes, setNowMinutes] = useState(() => toMinutes(nowHHMM()));
  useEffect(() => {
    const id = setInterval(() => setNowMinutes(toMinutes(nowHHMM())), 60_000);
    return () => clearInterval(id);
  }, []);

  const sorted = [...students].sort((a, b) => {
    const na = parseInt(a.seat ?? "9999");
    const nb = parseInt(b.seat ?? "9999");
    return isNaN(na) || isNaN(nb) ? (a.seat ?? "").localeCompare(b.seat ?? "") : na - nb;
  });

  const q = query.trim().toLowerCase();
  const displayStudents = q
    ? sorted.filter((s) =>
        [s.name, s.school, s.grade, s.seat].some((v) => v?.toLowerCase().includes(q))
      )
    : sorted;

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
    const lt = localTimes.get(s.id);
    const checkInTime = lt?.checkIn ?? toTimeString(att?.checkIn);
    const hasCheckIn = !!checkInTime;

    // 자율입퇴실 여부
    const isFlexStart = s.schedules.length > 0 && s.schedules[0].startTime === "FLEXIBLE";

    // 입실 기록이 없으면 결석 (입실 자율은 미기록)
    if (!hasCheckIn) {
      if (!s.schedules.length) return "NO_SCHEDULE";
      const type = lt?.type ?? (att?.type as string | undefined);
      // 명시적으로 결석/공결로 설정된 경우는 그대로
      if (type === "ABSENT" || type === "APPROVED_ABSENT") return type;
      if (isFlexStart) return "FLEXIBLE";
      return "ABSENT";
    }

    // 입실한 경우: 실제 외출 기록(outStart 있고 outEnd 없음)이 있을 때만 외출중
    const outings = localOutings.get(s.id) ?? s.dailyOutings;
    const activeOuting = outings.find((o) => o.outStart && !o.outEnd);
    if (activeOuting) return "OUTING";

    const type = lt?.type ?? (att?.type as string | undefined);
    if (type) return type;
    return "NORMAL";
  }

  function getStateLabel(state: string) {
    if (state === "OUTING") return "외출 중";
    if (state === "NO_SCHEDULE") return "비등원일";
    if (state === "FLEXIBLE") return "자율(미정)";
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

  function startInlineEdit(student: StudentWithAttendance, field: "checkIn" | "checkOut") {
    if (quickPending) return;
    setInlineTimeEdit({ studentId: student.id, field, value: nowHHMM() });
  }

  async function confirmInlineEdit(student: StudentWithAttendance) {
    if (!inlineTimeEdit || inlineTimeEdit.studentId !== student.id) return;
    await quickSaveField(student, inlineTimeEdit.field, inlineTimeEdit.value);
    setInlineTimeEdit(null);
  }

  async function quickSaveField(student: StudentWithAttendance, field: "checkIn" | "checkOut", time: string = nowHHMM()) {
    if (quickPending) return;
    const curr = localTimes.get(student.id) ?? { checkIn: "", checkOut: "", type: "NORMAL" as AttendanceType };

    let newType: AttendanceType = curr.type;
    const isFixed = (FIXED_TYPES as readonly string[]).includes(curr.type);

    if (!isFixed) {
      if (field === "checkIn") {
        const schedIn = student.schedules[0]?.startTime;
        newType = (schedIn && schedIn !== "FLEXIBLE" && toMinutes(time) >= toMinutes(schedIn) + 5) ? "TARDY" : "NORMAL";
      } else if (field === "checkOut") {
        const schedOut = student.schedules[0]?.endTime;
        if (schedOut && schedOut !== "FLEXIBLE" && toMinutes(time) < toMinutes(schedOut)) {
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

  async function quickStartOuting(student: StudentWithAttendance, time: string = nowHHMM()) {
    if (quickPending) return;
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

  async function quickEndOuting(student: StudentWithAttendance, time: string = nowHHMM()) {
    if (quickPending) return;
    const outings = localOutings.get(student.id) ?? [];
    const active = outings.find((o) => o.outStart && !o.outEnd);
    if (!active?.id) return;
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

  const CHECK_ITEMS: { key: CheckDateKey; label: string; permanent?: boolean }[] = [
    { key: "weeklyPlanDate",     label: "주간 공부계획" },   // 매주 화요일 초기화
    { key: "plannerSentDate",    label: "플래너 전송" },     // 매주 화요일 초기화
    { key: "vocabTestDate",      label: "영단어 테스트" },   // 매주 화요일 초기화
    { key: "pledgeDate",         label: "서약서 제출" },   // 수동 관리
    { key: "mockAnalysisDate",   label: "모의고사 분석지" }, // 수동 관리
    { key: "schoolAnalysisDate", label: "내신 분석지" },     // 수동 관리
  ];

  function fmtCheckDate(iso: string): string {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, "0")}`;
  }

  function toggleTimeline(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setExpandedTimelines((prev) => {
      const next = new Set<string>();
      if (!prev.has(id)) next.add(id);
      return next;
    });
  }

  function expandAndFocus(id: string, focus: EditFocus, e: React.MouseEvent) {
    e.stopPropagation();
    setExpandedTimelines(new Set([id]));
    setExpandFocus((prev) => { const m = new Map(prev); m.set(id, focus); return m; });
  }

  async function saveStudentFields(student: StudentWithAttendance) {
    const fields = localStudentFields.get(student.id) ?? { studentInfo: "", changeNote: "", academySchedule: "" };
    setStudentFieldPending(student.id);
    try {
      await patchStudentTextFields(student.id, fields);
      toast.success("저장되었습니다");
    } catch { toast.error("저장 실패"); }
    setStudentFieldPending(null);
  }

  async function saveCheckDate(studentId: string, key: CheckDateKey, value: string | null) {
    const pendingKey = `${studentId}:${key}`;
    setCheckDatePending(pendingKey);
    try {
      await patchStudentCheckDate(studentId, key, value);
      setLocalCheckDates((prev) => {
        const m = new Map(prev);
        m.set(studentId, { ...(m.get(studentId)!), [key]: value });
        return m;
      });
    } catch { toast.error("저장 실패"); }
    setCheckDatePending(null);
  }

  function showTooltip(e: React.MouseEvent, text: string) {
    if (!text) return;
    setTooltip({ text, rect: e.currentTarget.getBoundingClientRect() });
  }

  const pendingAssignments = selected?.assignments.filter((a) => !a.isCompleted).length ?? 0;
  const pendingComms = selected?.communications.filter((c) => !c.isChecked).length ?? 0;

  const TABS: { key: PanelTab; label: string; badge?: number; badgeColor?: string }[] = [
    { key: "attendance", label: "입퇴실" },
    { key: "merit", label: "상벌점" },
    { key: "studyplan", label: "공부계획" },
    { key: "assignments", label: "과제", badge: pendingAssignments, badgeColor: "bg-orange-500" },
    { key: "communications", label: "요청/전달", badge: pendingComms, badgeColor: "bg-red-500" },
    { key: "schedule", label: "일정" },
  ];

  return (
    <>
      {/* 검색 */}
      <div className="flex items-center gap-2 mb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="이름, 학교, 학년, 좌석 검색..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-8 w-60 text-sm"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {q && (
          <span className="text-xs text-muted-foreground">{displayStudents.length}명 검색됨</span>
        )}
      </div>
      {/* 테이블 — 가로 스크롤 */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 flex flex-col pointer-events-none z-10">
          <button onClick={() => scrollBy(-240)} style={{ position: "sticky", top: "calc(50vh - 16px)" }} className="pointer-events-auto h-8 w-6 flex items-center justify-center bg-background/80 border border-border rounded-r shadow-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">‹</button>
        </div>
        <div className="absolute inset-y-0 right-0 flex flex-col pointer-events-none z-10">
          <button onClick={() => scrollBy(240)} style={{ position: "sticky", top: "calc(50vh - 16px)" }} className="pointer-events-auto h-8 w-6 flex items-center justify-center bg-background/80 border border-border rounded-l shadow-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">›</button>
        </div>
        <div ref={scrollRef} className="rounded-lg border overflow-hidden overflow-x-auto mx-6">
        <table className="text-sm border-collapse min-w-max w-full">
          <thead>
            <tr className="border-b bg-muted/50 text-muted-foreground text-xs font-medium">
              <th className="w-8 shrink-0" />
              <th className="px-2 py-2.5 text-center w-16">상벌점</th>
              <th className="px-3 py-2.5 text-center w-12">좌석</th>
              <th className="px-3 py-2.5 text-left w-28">이름</th>
              <th className="px-3 py-2.5 text-center w-28">플래너 전송</th>
              <th className="px-3 py-2.5 text-left w-24">학교·학년</th>
              <th className="px-3 py-2.5 text-left w-16">반</th>
              <th className="px-3 py-2.5 text-center w-20">입실약속</th>
              <th className="px-3 py-2.5 text-left w-36">입실</th>
              <th className="px-3 py-2.5 text-center w-20">퇴실약속</th>
              <th className="px-3 py-2.5 text-left w-36">퇴실</th>
              <th className="px-3 py-2.5 text-left w-40">외출</th>
              <th className="px-3 py-2.5 text-left w-40">복귀</th>
              <th className="px-3 py-2.5 text-left w-36">입퇴실 메모</th>
              <th className="px-3 py-2.5 text-left w-36">추후 변동 예정</th>
              <th className="px-3 py-2.5 text-left w-36">학원일정</th>
              <th className="px-3 py-2.5 text-left w-36">특이사항</th>
            </tr>
          </thead>
          <tbody>
            {displayStudents.map((student) => {
              const state = getState(student);
              const isSelected = selectedId === student.id;
              const isQuickLoading = quickPending === student.id;
              const lt = localTimes.get(student.id);
              const checkInTime = lt?.checkIn ?? "";
              const checkOutTime = lt?.checkOut ?? "";
              const schedIn = student.schedules[0]?.startTime;
              const schedOut = student.schedules[0]?.endTime;
              const localOut = localOutings.get(student.id) ?? [];
              const activeOuting = localOut.find((o) => o.outStart && !o.outEnd);
              const commCount = student.communications.filter((c) => !c.isChecked).length;
              const assignCount = student.assignments.filter((a) => !a.isCompleted).length;
              const schoolGrade = [student.school, student.grade].filter(Boolean).join(" ");
              // 이달 상벌점만 집계 (매월 1일 초기화)
              const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
              const meritBalance = student.merits
                .filter((m) => new Date(m.date) >= monthStart)
                .reduce((sum, m) => sum + (m.type === "MERIT" ? m.points : -m.points), 0);
              const attNotes = student.attendances[0]?.notes ?? "";
              const isExpanded = expandedTimelines.has(student.id);
              // 입실 임박: 아직 미입실 + 예정 입실 0~10분 이내
              const schedInDiff = schedIn && schedIn !== "FLEXIBLE" ? toMinutes(schedIn) - nowMinutes : null;
              const isCheckInImminent =
                !checkInTime &&
                schedInDiff !== null &&
                schedInDiff >= 0 &&
                schedInDiff <= 10 &&
                lt?.type !== "ABSENT" &&
                lt?.type !== "APPROVED_ABSENT";
              const plannerDate = localCheckDates.get(student.id)?.plannerSentDate ?? null;
              const plannerDone = isDoneThisWeek("plannerSentDate", plannerDate);
              const plannerPending = checkDatePending === `${student.id}:plannerSentDate`;

              // 영단어 시험 대상자 여부 (VocabTestEnrollment 기반)
              const isVocabTarget = student.vocabEnrollment?.isActive ?? false;
              const vocabChecks = localCheckDates.get(student.id);
              const vocabDone = vocabChecks ? isDoneThisWeek("vocabTestDate", vocabChecks.vocabTestDate) : false;

              return (
                <Fragment key={student.id}>
                <tr
                  onClick={(e) => toggleTimeline(student.id, e)}
                  className={cn(
                    "border-b transition-colors cursor-pointer",
                    isSelected ? "bg-blue-50 border-l-2 border-l-blue-500" : isExpanded ? "bg-muted/30" : "hover:bg-accent/50",
                    state === "NO_SCHEDULE" && "opacity-50",
                    isCheckInImminent && !isSelected && "bg-red-50/60 hover:bg-red-50",
                    isVocabTarget && !vocabDone && !isSelected && !isCheckInImminent && "bg-orange-50/60"
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
                  {/* 상벌점 */}
                  <td className="px-2 py-3 text-center">
                    <span className={cn(
                      "text-sm font-semibold tabular-nums",
                      meritBalance > 0 ? "text-blue-600" : meritBalance < 0 ? "text-red-600" : "text-muted-foreground"
                    )}>
                      {meritBalance > 0 ? `+${meritBalance}` : meritBalance === 0 ? "—" : meritBalance}
                    </span>
                  </td>

                  {/* 좌석 */}
                  <td className="px-3 py-3 text-center text-sm text-muted-foreground font-mono font-medium">
                    {student.seat ?? "—"}
                  </td>

                  {/* 이름 + 배지 */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="font-semibold text-sm truncate">{student.name}</p>
                      <span className={cn("inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] whitespace-nowrap shrink-0", TYPE_BADGE[state])}>
                        {state === "OUTING" && <ArrowRightLeft className="h-2.5 w-2.5" />}
                        {getStateLabel(state)}
                      </span>
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
                      <button
                        onClick={(e) => { e.stopPropagation(); selectStudent(student); }}
                        className={cn(
                          "shrink-0 p-1 rounded transition-colors",
                          isSelected ? "text-blue-600 bg-blue-100" : "text-muted-foreground hover:text-foreground hover:bg-accent"
                        )}
                        title="상세 보기"
                      >
                        <PanelRightOpen className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>

                  {/* 플래너 전송 */}
                  <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    {plannerDone ? (
                      <div className="inline-flex items-center gap-1">
                        <input
                          type="date"
                          value={plannerDate ?? ""}
                          onChange={(e) => saveCheckDate(student.id, "plannerSentDate", e.target.value || null)}
                          disabled={plannerPending}
                          className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5 w-[115px] focus:outline-none focus:ring-1 focus:ring-green-400 disabled:opacity-40"
                        />
                        <button
                          onClick={() => saveCheckDate(student.id, "plannerSentDate", null)}
                          disabled={plannerPending}
                          title="취소"
                          className="p-0.5 text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-40"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => saveCheckDate(student.id, "plannerSentDate", new Date().toISOString().split("T")[0])}
                          disabled={plannerPending}
                          className="px-2 py-0.5 text-[10px] rounded border border-border bg-background hover:bg-accent text-muted-foreground font-medium transition-colors disabled:opacity-40"
                        >
                          {plannerPending ? "..." : "오늘"}
                        </button>
                        <input
                          type="date"
                          value=""
                          onChange={(e) => { if (e.target.value) saveCheckDate(student.id, "plannerSentDate", e.target.value); }}
                          disabled={plannerPending}
                          className="text-xs text-muted-foreground bg-background border border-border rounded px-1 py-0.5 w-7 focus:outline-none disabled:opacity-40 cursor-pointer"
                          title="날짜 직접 선택"
                        />
                      </div>
                    )}
                  </td>

                  {/* 학교·학년 */}
                  <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {schoolGrade || "—"}
                  </td>

                  {/* 반 */}
                  <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {student.classGroup || "—"}
                  </td>

                  {/* 입실 예정 */}
                  <td className="px-3 py-3 text-center">
                    <span className={cn(
                      "text-sm font-mono",
                      !checkInTime && schedIn ? "text-red-500 font-medium" :
                      checkInTime && lt?.type === "TARDY" ? "text-amber-600 font-semibold underline decoration-dotted" :
                      "text-muted-foreground"
                    )}>
                      {schedIn ?? <span className="text-gray-300">—</span>}
                    </span>
                  </td>

                  {/* 입실 실제 + 지금 */}
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    {inlineTimeEdit?.studentId === student.id && inlineTimeEdit.field === "checkIn" ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="time"
                          value={inlineTimeEdit.value}
                          onChange={(e) => setInlineTimeEdit((prev) => prev ? { ...prev, value: e.target.value } : null)}
                          className="text-xs border rounded px-1 py-0.5 w-28 font-mono focus:outline-none focus:ring-1 focus:ring-primary bg-background"
                        />
                        <button
                          onClick={() => confirmInlineEdit(student)}
                          disabled={isQuickLoading}
                          className="p-0.5 text-green-700 hover:text-green-900 disabled:opacity-40"
                          title="저장"
                        ><Check className="h-3.5 w-3.5" /></button>
                        <button
                          onClick={() => setInlineTimeEdit(null)}
                          className="p-0.5 text-muted-foreground hover:text-foreground"
                          title="취소"
                        ><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-sm font-mono tabular-nums w-10 text-right",
                          checkInTime ? "text-foreground font-semibold" : "text-gray-300"
                        )}>
                          {checkInTime || "—"}
                        </span>
                        <button
                          onClick={() => startInlineEdit(student, "checkIn")}
                          disabled={isQuickLoading}
                          className="flex items-center gap-0.5 px-2 py-1 text-xs rounded-md bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 shrink-0 transition-colors disabled:opacity-40 font-medium"
                        >
                          <LogIn className="h-3 w-3" />지금
                        </button>
                      </div>
                    )}
                  </td>

                  {/* 퇴실 예정 */}
                  <td className="px-3 py-3 text-center">
                    <span className="text-sm font-mono text-muted-foreground">
                      {schedOut ?? <span className="text-gray-300">—</span>}
                    </span>
                  </td>

                  {/* 퇴실 실제 + 지금 */}
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    {inlineTimeEdit?.studentId === student.id && inlineTimeEdit.field === "checkOut" ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="time"
                          value={inlineTimeEdit.value}
                          onChange={(e) => setInlineTimeEdit((prev) => prev ? { ...prev, value: e.target.value } : null)}
                          className="text-xs border rounded px-1 py-0.5 w-28 font-mono focus:outline-none focus:ring-1 focus:ring-primary bg-background"
                        />
                        <button
                          onClick={() => confirmInlineEdit(student)}
                          disabled={isQuickLoading}
                          className="p-0.5 text-green-700 hover:text-green-900 disabled:opacity-40"
                          title="저장"
                        ><Check className="h-3.5 w-3.5" /></button>
                        <button
                          onClick={() => setInlineTimeEdit(null)}
                          className="p-0.5 text-muted-foreground hover:text-foreground"
                          title="취소"
                        ><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className={cn("text-sm font-mono tabular-nums w-10 text-right", checkOutTime ? "text-foreground font-semibold" : "text-gray-300")}>
                          {checkOutTime || "—"}
                        </span>
                        <button
                          onClick={() => startInlineEdit(student, "checkOut")}
                          disabled={isQuickLoading || !checkInTime}
                          className="flex items-center gap-0.5 px-2 py-1 text-xs rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 shrink-0 transition-colors disabled:opacity-40 font-medium"
                        >
                          <LogOut className="h-3 w-3" />지금
                        </button>
                      </div>
                    )}
                  </td>

                  {/* 외출 — 여러 외출 기록 표시 */}
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col gap-1">
                        {localOut.length > 0 ? localOut.map((o, i) => (
                          <span key={o.id ?? i} className={cn(
                            "text-xs font-mono tabular-nums",
                            o.outStart && !o.outEnd ? "text-orange-600 font-semibold" : "text-muted-foreground"
                          )}>
                            {toTimeString(o.outStart) || "—"}
                          </span>
                        )) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </div>
                      {!activeOuting && (
                        inlineOutingEdit?.studentId === student.id && inlineOutingEdit.field === "outStart" ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="time"
                              value={inlineOutingEdit.value}
                              onChange={(e) => setInlineOutingEdit((prev) => prev ? { ...prev, value: e.target.value } : null)}
                              className="text-xs border rounded px-1 py-0.5 w-28 font-mono focus:outline-none focus:ring-1 focus:ring-primary bg-background"
                            />
                            <button
                              onClick={() => { quickStartOuting(student, inlineOutingEdit.value); setInlineOutingEdit(null); }}
                              disabled={isQuickLoading}
                              className="p-0.5 text-green-700 hover:text-green-900 disabled:opacity-40"
                              title="저장"
                            ><Check className="h-3.5 w-3.5" /></button>
                            <button
                              onClick={() => setInlineOutingEdit(null)}
                              className="p-0.5 text-muted-foreground hover:text-foreground"
                              title="취소"
                            ><X className="h-3.5 w-3.5" /></button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setInlineOutingEdit({ studentId: student.id, field: "outStart", value: nowHHMM() })}
                            disabled={isQuickLoading || !checkInTime}
                            className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 shrink-0 transition-colors disabled:opacity-40 font-medium"
                          >
                            <ArrowRightLeft className="h-2.5 w-2.5" />외출
                          </button>
                        )
                      )}
                    </div>
                  </td>

                  {/* 복귀 — 여러 외출 기록에 대한 복귀 시간 */}
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col gap-1">
                        {localOut.length > 0 ? localOut.map((o, i) => (
                          <span key={o.id ?? i} className={cn(
                            "text-xs font-mono tabular-nums",
                            o.outEnd ? "text-foreground font-semibold" : "text-gray-300"
                          )}>
                            {o.outEnd ? toTimeString(o.outEnd) : "—"}
                          </span>
                        )) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </div>
                      {activeOuting && (
                        inlineOutingEdit?.studentId === student.id && inlineOutingEdit.field === "outEnd" ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="time"
                              value={inlineOutingEdit.value}
                              onChange={(e) => setInlineOutingEdit((prev) => prev ? { ...prev, value: e.target.value } : null)}
                              className="text-xs border rounded px-1 py-0.5 w-28 font-mono focus:outline-none focus:ring-1 focus:ring-primary bg-background"
                            />
                            <button
                              onClick={() => { quickEndOuting(student, inlineOutingEdit.value); setInlineOutingEdit(null); }}
                              disabled={isQuickLoading}
                              className="p-0.5 text-green-700 hover:text-green-900 disabled:opacity-40"
                              title="저장"
                            ><Check className="h-3.5 w-3.5" /></button>
                            <button
                              onClick={() => setInlineOutingEdit(null)}
                              className="p-0.5 text-muted-foreground hover:text-foreground"
                              title="취소"
                            ><X className="h-3.5 w-3.5" /></button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setInlineOutingEdit({ studentId: student.id, field: "outEnd", value: nowHHMM() })}
                            disabled={isQuickLoading || !checkInTime}
                            className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 shrink-0 transition-colors disabled:opacity-40 font-medium"
                          >
                            <LogIn className="h-2.5 w-2.5" />복귀
                          </button>
                        )
                      )}
                    </div>
                  </td>

                  {/* 입퇴실 메모 */}
                  <td
                    className="px-3 py-3 cursor-pointer"
                    onClick={(e) => expandAndFocus(student.id, "notes", e)}
                    onMouseEnter={(e) => showTooltip(e, attNotes)}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    {attNotes ? (
                      <span className="text-xs text-foreground truncate block max-w-[130px]">{attNotes}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>

                  {/* 추후 변동 예정 */}
                  <td
                    className="px-3 py-3 cursor-pointer"
                    onClick={(e) => expandAndFocus(student.id, "changeNote", e)}
                    onMouseEnter={(e) => showTooltip(e, student.changeNote ?? "")}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    {student.changeNote ? (
                      <span className="text-xs text-amber-700 truncate block max-w-[130px]">{student.changeNote}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>

                  {/* 학원일정 */}
                  <td
                    className="px-3 py-3 cursor-pointer"
                    onClick={(e) => expandAndFocus(student.id, "academySchedule", e)}
                    onMouseEnter={(e) => showTooltip(e, student.academySchedule ?? "")}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    {student.academySchedule ? (
                      <span className="text-xs text-muted-foreground truncate block max-w-[130px]">{student.academySchedule}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>

                  {/* 특이사항 */}
                  <td
                    className="px-3 py-3 cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); setInfoModalId(student.id); setInfoModalText(student.studentInfo ?? ""); }}
                  >
                    {student.studentInfo ? (
                      <div className="flex items-center gap-1">
                        <Pin className="h-3 w-3 text-violet-500 shrink-0" />
                        <span className="text-xs text-foreground truncate block max-w-[130px]">{student.studentInfo}</span>
                      </div>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>

                </tr>

                {/* 타임라인 + 인라인 편집 확장 행 */}
                {isExpanded && (
                  <tr className={cn("border-b", isSelected ? "bg-blue-50/60" : "bg-muted/20")}>
                    <td colSpan={17} className="px-4 py-4">
                      {(() => {
                        const focus = expandFocus.get(student.id);
                        const focusLabel: Record<EditFocus, string> = {
                          attendance: "출결 상태", notes: "입퇴실 메모",
                          changeNote: "추후 변동 예정", academySchedule: "학원일정",
                        };
                        return (
                          <div className="pt-3 border-t" onClick={(e) => e.stopPropagation()}>
                            {focus && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5 mb-2 w-fit">
                                <span className="opacity-60">편집 중:</span> {focusLabel[focus]}
                              </span>
                            )}
                            <div className="flex items-stretch gap-3 w-full">
                              {/* 왼쪽: 체크 항목 */}
                              <div className="flex flex-col justify-center gap-2 shrink-0 rounded-md border border-border bg-muted/30 px-4 py-3">
                                {CHECK_ITEMS.map(({ key, label, permanent }) => {
                                  const dateVal = localCheckDates.get(student.id)?.[key] ?? null;
                                  const isPending = checkDatePending === `${student.id}:${key}`;
                                  const todayISO = new Date().toISOString().split("T")[0];
                                  const done = dateVal ? isDoneThisWeek(key, dateVal) : false;
                                  return (
                                    <div key={key} className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground w-24 shrink-0">{label}</span>
                                      {done ? (
                                        permanent ? (
                                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded px-2 py-0.5">
                                            <Check className="h-3 w-3" />{fmtCheckDate(dateVal!)}
                                          </span>
                                        ) : (
                                          <button
                                            onClick={() => saveCheckDate(student.id, key, null)}
                                            disabled={isPending}
                                            title="클릭하여 취소"
                                            className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded px-2 py-0.5 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-40"
                                          >
                                            <Check className="h-3 w-3" />{fmtCheckDate(dateVal!)}
                                          </button>
                                        )
                                      ) : (
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            onClick={() => saveCheckDate(student.id, key, todayISO)}
                                            disabled={isPending}
                                            className="px-2 py-0.5 text-[10px] rounded border border-border bg-background hover:bg-accent text-muted-foreground font-medium transition-colors disabled:opacity-40"
                                          >
                                            {isPending ? "..." : "확인"}
                                          </button>
                                          {dateVal && WEEKLY_KEYS.has(key) && (
                                            <span className="text-[10px] text-muted-foreground/60">마지막: {fmtCheckDate(dateVal)}</span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {/* 가운데: 요청/전달 */}
                              <div className="w-72 shrink-0 rounded-md border border-border bg-muted/30 px-3 py-3 overflow-y-auto max-h-56">
                                <CommunicationPanel
                                  studentId={student.id}
                                  initialItems={student.communications}
                                  compact
                                />
                              </div>

                              {/* 오른쪽: 학원일정 + 추후 변동 예정 */}
                              <div className="flex-1 min-w-[320px] flex flex-col gap-2">
                                {(
                                  [
                                    { key: "academySchedule", label: "학원일정", ph: "학원일정", af: focus === "academySchedule" },
                                    { key: "changeNote", label: "추후 변동 예정", ph: "추후 변동 예정", af: focus === "changeNote" },
                                  ] as { key: keyof StudentTextField; label: string; ph: string; af: boolean }[]
                                ).map(({ key, label, ph, af }) => (
                                  <div key={key} className={cn(
                                    "flex flex-col gap-1 rounded-md border px-3 py-2 flex-1 transition-colors",
                                    af ? "border-primary/30 bg-primary/[0.04]" : "border-border bg-muted/30"
                                  )}>
                                    <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
                                    <textarea
                                      value={localStudentFields.get(student.id)?.[key] ?? ""}
                                      onChange={(e) => setLocalStudentFields((prev) => { const m = new Map(prev); m.set(student.id, { ...(m.get(student.id) ?? { studentInfo: "", changeNote: "", academySchedule: "" }), [key]: e.target.value }); return m; })}
                                      autoFocus={isExpanded && af}
                                      placeholder={ph}
                                      rows={2}
                                      className={cn(
                                        "w-full flex-1 border rounded-md px-2 py-1.5 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none",
                                        af && "ring-2 ring-primary"
                                      )}
                                    />
                                  </div>
                                ))}
                                <button onClick={() => saveStudentFields(student)} disabled={studentFieldPending === student.id} className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-medium disabled:opacity-50 transition-colors shrink-0">
                                  <Save className="h-3 w-3" />{studentFieldPending === student.id ? "저장 중..." : "저장"}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      </div> {/* relative wrapper */}

      {/* 호버 툴팁 (position:fixed — overflow-hidden 테이블 밖에 렌더링) */}
      {tooltip && tooltip.text && (
        <div
          style={{
            position: "fixed",
            top: tooltip.rect.top - 6,
            left: tooltip.rect.left,
            transform: "translateY(-100%)",
            zIndex: 9999,
            pointerEvents: "none",
          }}
          className="bg-popover border rounded-md shadow-lg px-2.5 py-1.5 text-xs text-popover-foreground max-w-xs whitespace-pre-wrap break-words"
        >
          {tooltip.text}
        </div>
      )}

      {/* 특이사항 모달 */}
      <Dialog
        open={!!infoModalId}
        onOpenChange={(open) => { if (!open) setInfoModalId(null); }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pin className="h-4 w-4 text-violet-500" />
              {students.find((s) => s.id === infoModalId)?.name} 특이사항
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={infoModalText}
            onChange={(e) => setInfoModalText(e.target.value)}
            placeholder="학생 특이사항, 성향, 주의사항 등..."
            rows={6}
          />
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setInfoModalId(null)}
            >
              닫기
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!infoModalId) return;
                startTransition(async () => {
                  try {
                    await patchStudentTextFields(infoModalId, { studentInfo: infoModalText });
                    toast.success("특이사항이 저장되었습니다");
                    setInfoModalId(null);
                  } catch {
                    toast.error("저장 실패");
                  }
                });
              }}
              disabled={isPending}
            >
              {isPending ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                const isLate = !!(editValues.checkIn && schedIn && schedIn !== "FLEXIBLE" && toMinutes(editValues.checkIn) >= toMinutes(schedIn) + 5);
                const isEarlyLeave = !!(editValues.checkOut && schedOut && schedOut !== "FLEXIBLE" && toMinutes(editValues.checkOut) < toMinutes(schedOut));
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
                              <span className="text-xs text-muted-foreground font-mono">
                                예정 {schedIn === "FLEXIBLE" ? "자율(미정)" : schedIn}
                              </span>
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

              {panelTab === "studyplan" && (
                <StudyPlanSharePanel studentId={selected.id} studentName={selected.name} />
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

              {panelTab === "schedule" && (
                <StudentCalendarPanel
                  key={selected.id}
                  studentId={selected.id}
                  studentName={selected.name}
                  school={selected.school ?? null}
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
  const [deleteConfirmIdx, setDeleteConfirmIdx] = useState<number | null>(null);

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
        toast.success("외출 기록이 삭제되었습니다");
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
                            {deleteConfirmIdx === i ? (
                              <>
                                <button
                                  onClick={() => { deleteRow(i); setDeleteConfirmIdx(null); }}
                                  disabled={isPending}
                                  className="text-[10px] px-1.5 py-0.5 bg-destructive text-white rounded"
                                >
                                  삭제
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmIdx(null)}
                                  className="text-[10px] px-1.5 py-0.5 bg-muted rounded"
                                >
                                  취소
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirmIdx(i)}
                                disabled={isPending}
                                title="삭제"
                                className="text-muted-foreground hover:text-destructive transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
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
  const [lastSaved, setLastSaved] = useState<{ type: "MERIT" | "DEMERIT"; points: number; reason: string } | null>(null);

  const todayStr = new Date().toISOString().split("T")[0];

  function handleSubmit() {
    if (!reason.trim()) { toast.error("사유를 입력하세요"); return; }
    const savedType = type;
    const savedPoints = points;
    const savedReason = reason.trim();
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("studentId", studentId);
        fd.append("date", todayStr);
        fd.append("type", savedType);
        fd.append("points", String(savedPoints));
        fd.append("reason", savedReason);
        if (category) fd.append("category", category);
        await createMeritDemerit(fd);
        setReason("");
        setPoints(1);
        setCategory("");
        setLastSaved({ type: savedType, points: savedPoints, reason: savedReason });
        toast.success(`${studentName}에게 ${savedType === "MERIT" ? "상점" : "벌점"} ${savedPoints}점 부여`);
      } catch {
        toast.error("저장 실패");
      }
    });
  }

  async function handleShare() {
    if (!lastSaved) return;
    const typeLabel = lastSaved.type === "MERIT" ? "상점" : "벌점";
    const text = `[강한선배 관리형 독서실] 안녕하세요 ${studentName} 학생이 ${typeLabel} ${lastSaved.points}점을 받았습니다.\n사유: ${lastSaved.reason}`;
    if (navigator.share) {
      try { await navigator.share({ text }); } catch { /* 취소 */ }
    } else {
      await navigator.clipboard.writeText(text);
      toast.success("복사되었습니다. 카카오톡에 붙여넣기 하세요.");
    }
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

      {lastSaved && (
        <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
            <Check className="h-3.5 w-3.5" />
            {lastSaved.type === "MERIT" ? "상점" : "벌점"} {lastSaved.points}점 부여 완료
          </div>
          <Button
            size="sm"
            className="w-full gap-2 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-semibold"
            onClick={handleShare}
          >
            카카오톡으로 학부모에게 알리기
          </Button>
        </div>
      )}
    </div>
  );
}

function StudyPlanSharePanel({ studentId, studentName }: { studentId: string; studentName: string }) {
  const [imageItems, setImageItems] = useState<{ file: File; previewUrl: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const newItems = files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
    setImageItems((prev) => [...prev, ...newItems]);
    e.target.value = "";
  }

  function removeImage(idx: number) {
    setImageItems((prev) => {
      URL.revokeObjectURL(prev[idx].previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  }

  async function handleShare() {
    if (imageItems.length === 0) { toast.error("공유할 이미지를 선택하세요"); return; }
    setIsUploading(true);
    try {
      const uploadedUrls: string[] = [];
      for (const item of imageItems) {
        const fd = new FormData();
        fd.append("file", item.file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) throw new Error("업로드 실패");
        const { url } = await res.json();
        uploadedUrls.push(url as string);
      }
      const { token } = await createStudyPlanReport(studentId, uploadedUrls);
      const reportUrl = `${window.location.origin}/sp/${token}`;
      const text = `[강한선배 관리형 독서실] ${studentName} 학생의 공부 계획입니다.\n\n${reportUrl}`;
      if (navigator.share) {
        try { await navigator.share({ text }); } catch { /* 취소 */ }
      } else {
        await navigator.clipboard.writeText(text);
        toast.success("복사되었습니다. 카카오톡에 붙여넣기 하세요.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "공유에 실패했습니다");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        공부 계획 이미지를 업로드하고 카카오톡으로 학부모에게 전송합니다.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed rounded-lg py-4 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
      >
        이미지 선택 (복수 선택 가능)
      </button>

      {imageItems.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {imageItems.map((item, idx) => (
            <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.previewUrl} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(idx)}
                className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Button
        onClick={handleShare}
        disabled={isUploading || imageItems.length === 0}
        className="w-full gap-2 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-semibold"
      >
        {isUploading ? "업로드 중..." : "카카오톡으로 보내기"}
      </Button>
    </div>
  );
}
