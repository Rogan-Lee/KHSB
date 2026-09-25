"use client";

import { Fragment, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { saveAttendanceRecord, createDailyOuting, updateDailyOuting, deleteDailyOuting, addOuting, deleteOuting } from "@/actions/attendance";
import { patchStudentTextFields, patchStudentCheckDate, patchStudentAnalysisExempt, resetWeeklyCheckDates, resetCheckDateForAll } from "@/actions/students";
import { createMeritDemerit } from "@/actions/merit-demerit";
import { createStudyPlanReport } from "@/actions/study-plan-reports";
import { toast } from "sonner";
import { cn, MERIT_CATEGORIES } from "@/lib/utils";
import type { Assignment, AttendanceRecord, AttendanceSchedule, AttendanceType, Communication, DailyOuting, OutingSchedule, Student } from "@/generated/prisma";
import { ArrowRightLeft, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ClipboardList, ImagePlus, LogIn, LogOut, MessageSquare, PanelRightOpen, Pin, Plus, Save, Search, SearchX, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KakaoButton } from "@/components/ui/kakao-button";
import { Input, inputBaseClass } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePickerInput } from "@/components/ui/time-picker";
import { CommunicationPanel } from "@/components/communications/communication-panel";
import { AssignmentPanel } from "@/components/assignments/assignment-panel";
import { StudentCalendarPanel } from "@/components/calendar/student-calendar-panel";
import { useColumnWidths } from "@/hooks/use-column-widths";
import { ColResizeHandle } from "@/components/ui/col-resize-handle";
import { Avatar, CountBadge, EmptyState, FilterChip, FormField, Segmented, StatusBadge, TONE_SOFT } from "@/components/backoffice/ui";
import { ACTIVITY_TONE, AttendanceStateBadge, attendanceStateMeta } from "@/components/attendance/attendance-status";

// 입퇴실 표 열 너비 기본값(px). 고정(좌측 sticky) 열은 sticky 오프셋과 맞물려 있어 조절 대상에서 제외.
const ATTENDANCE_COL_DEFAULTS: Record<string, number> = {
  notes: 128, schoolGrade: 96, classGroup: 64, inout: 190, outing: 380,
  memo: 128, dailyChange: 128, plannedChange: 128, planner: 112,
  studyPlan: 80, mockAnalysis: 80, schoolAnalysis: 80, vocab: 92,
};

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
  { value: "APPROVED_ABSENT", label: "공결" },
  { value: "NOTIFIED_ABSENT", label: "미입실" },
];

// 상태 → 역할색(라벨·배지·행 배경)은 ./attendance-status 의 ATTENDANCE_STATE 한 곳에서 정의한다.

// 표 안 시각 입력(TimePickerInput) — SEED TextInput 모양(작은 높이)으로 덮어쓴다.
const TIME_INPUT =
  "h-8 w-[5.5rem] rounded-r2 border-stroke-neutral-weak bg-bg-layer-default px-x2 py-0 t4-medium text-fg-neutral " +
  "focus:border-stroke-neutral-contrast focus:ring-1 focus:ring-stroke-neutral-contrast placeholder:text-fg-placeholder";

// 표 안 아주 작은 보조 동작(오늘·제출·정시·지금 등) — SEED Chip(small) 모양
type CellTone = "neutral" | "warning" | "positive" | "violet" | "informative";
const CELL_TONE: Record<CellTone, string> = {
  neutral:
    "bg-bg-layer-default text-fg-neutral-muted shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] hover:bg-bg-layer-default-pressed",
  warning: "bg-bg-warning-weak text-fg-warning hover:bg-bg-warning-weak-pressed",
  positive: "bg-bg-positive-weak text-fg-positive hover:bg-bg-positive-weak-pressed",
  violet:
    "bg-bg-layer-default text-palette-purple-700 shadow-[inset_0_0_0_1px_var(--seed-color-palette-purple-300)] hover:bg-palette-purple-100",
  informative: "bg-bg-informative-weak text-fg-informative hover:bg-bg-informative-weak-pressed",
};

function CellButton({
  tone = "neutral",
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: CellTone }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex h-7 shrink-0 items-center justify-center gap-x1 rounded-full px-x2_5 t3-medium transition-colors disabled:pointer-events-none disabled:opacity-40",
        CELL_TONE[tone],
        className,
      )}
    >
      {children}
    </button>
  );
}

/** 아이콘만 있는 작은 버튼(취소·삭제 등) — aria-label 필수 */
function IconAction({
  danger = false,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean; "aria-label": string }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-grid size-7 shrink-0 place-items-center rounded-r2 text-fg-neutral-subtle transition-colors disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5",
        danger ? "hover:bg-bg-critical-weak hover:text-fg-critical" : "hover:bg-bg-transparent-pressed hover:text-fg-neutral",
        className,
      )}
    >
      {children}
    </button>
  );
}

// 일괄 초기화 대상(표 머리 「초기화」 버튼)
type ResetTarget = "weeklyPlanDate" | "mockAnalysisDate" | "schoolAnalysisDate";
const RESET_LABEL: Record<ResetTarget, string> = {
  weeklyPlanDate: "공부계획",
  mockAnalysisDate: "모의고사 분석지",
  schoolAnalysisDate: "내신 분석지",
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

const FIXED_TYPES = ["ABSENT", "APPROVED_ABSENT", "NOTIFIED_ABSENT"] as const;

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

  // 조퇴는 수동으로만 설정 (자동 판별 제거)

  return type;
}

type PanelTab = "attendance" | "assignments" | "communications" | "merit" | "schedule" | "studyplan";

interface Props {
  students: StudentWithAttendance[];
  today: string;
  /** 검색줄 왼쪽에 놓을 요소(페이지의 URL 필터 칩 등) */
  toolbarStart?: ReactNode;
}

export function AttendanceTable({ students, today, toolbarStart }: Props) {
  const todayDate = new Date(today).toISOString().split("T")[0];
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  // 입퇴실 표 열 너비 커스텀(localStorage 저장). 고정 sticky 열 제외 전 열 드래그 조절.
  const { widths: colW, setWidth: setColW, reset: resetColW } = useColumnWidths(
    "attendance-table-col-widths",
    ATTENDANCE_COL_DEFAULTS,
  );

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

  // 펼침 패널·외출 서브행을 "보이는 영역 폭"에 고정하기 위한 측정값.
  // 14열 테이블의 가로 스크롤 폭과 무관하게, 사이드바 접힘까지 ResizeObserver로 추적.
  const [viewportW, setViewportW] = useState<number>(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setViewportW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  const stickyWidth = viewportW ? `${viewportW}px` : "100%";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>("attendance");
  const [infoModalId, setInfoModalId] = useState<string | null>(null);
  const [infoModalText, setInfoModalText] = useState("");
  const [notifiedAbsentId, setNotifiedAbsentId] = useState<string | null>(null);
  const [notifiedAbsentReason, setNotifiedAbsentReason] = useState("");
  const [editValues, setEditValues] = useState({
    checkIn: "", checkOut: "",
    type: "NORMAL" as AttendanceType, notes: "",
  });
  const [isPending, startTransition] = useTransition();

  // 테이블 인라인 편집용 로컬 상태
  type LocalTime = { checkIn: string; checkOut: string; type: AttendanceType };
  type LocalOuting = { id: string | null; outStart: Date | null; outEnd: Date | null; sequence?: number; reason?: string | null };

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
      map.set(
        s.id,
        [...s.dailyOutings]
          .sort((a, b) => (a.sequence ?? 1) - (b.sequence ?? 1))
          .map((o) => ({ id: o.id, outStart: o.outStart, outEnd: o.outEnd, sequence: o.sequence, reason: o.reason }))
      )
    );
    return map;
  });

  type StudentTextField = { studentInfo: string; changeNote: string; dailyNote: string };
  const [localStudentFields, setLocalStudentFields] = useState<Map<string, StudentTextField>>(() => {
    const map = new Map<string, StudentTextField>();
    // KST 오늘 날짜 (YYYY-MM-DD)
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const todayISO = kst.toISOString().split("T")[0];
    students.forEach((s) => {
      const noteDateISO = s.dailyNoteDate ? new Date(s.dailyNoteDate).toISOString().split("T")[0] : null;
      const isToday = noteDateISO === todayISO;
      map.set(s.id, {
        studentInfo: s.studentInfo ?? "",
        changeNote: s.changeNote ?? "",
        dailyNote: isToday ? (s.dailyNote ?? "") : "",
      });
    });
    return map;
  });

  type CheckDateKey = "vocabTestDate" | "pledgeDate" | "mockAnalysisDate" | "schoolAnalysisDate" | "plannerSentDate" | "weeklyPlanDate";
  type CheckDateState = Record<CheckDateKey, string | null>;

  // 매주 화요일 초기화 대상 키 (공부계획은 수동 초기화만)
  const WEEKLY_KEYS = new Set<CheckDateKey>(["vocabTestDate", "plannerSentDate"]);

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

  // 분석지 정시 면제 상태 (mock/school 각각)
  type AnalysisExemptState = { mockAnalysisExempt: boolean; schoolAnalysisExempt: boolean };
  const [localExempt, setLocalExempt] = useState<Map<string, AnalysisExemptState>>(() => {
    const map = new Map<string, AnalysisExemptState>();
    students.forEach((s) => map.set(s.id, {
      mockAnalysisExempt: (s as unknown as Record<string, unknown>).mockAnalysisExempt as boolean ?? false,
      schoolAnalysisExempt: (s as unknown as Record<string, unknown>).schoolAnalysisExempt as boolean ?? false,
    }));
    return map;
  });
  const [exemptPending, setExemptPending] = useState<string | null>(null); // "studentId:key"

  async function toggleAnalysisExempt(studentId: string, exemptKey: "mockAnalysisExempt" | "schoolAnalysisExempt", next: boolean) {
    const pendingKey = `${studentId}:${exemptKey}`;
    setExemptPending(pendingKey);
    try {
      await patchStudentAnalysisExempt(studentId, exemptKey, next);
      setLocalExempt((prev) => {
        const m = new Map(prev);
        const curr = m.get(studentId) ?? { mockAnalysisExempt: false, schoolAnalysisExempt: false };
        m.set(studentId, { ...curr, [exemptKey]: next });
        return m;
      });
      // 면제 설정 시 동일 카테고리 일자도 클라이언트 상태에서 비움
      if (next) {
        const dateKey = exemptKey === "mockAnalysisExempt" ? "mockAnalysisDate" : "schoolAnalysisDate";
        setLocalCheckDates((prev) => {
          const m = new Map(prev);
          const curr = m.get(studentId);
          if (curr) m.set(studentId, { ...curr, [dateKey]: null });
          return m;
        });
      }
      toast.success(next ? "정시 처리됨" : "정시 해제됨");
    } catch { toast.error("저장 실패"); }
    setExemptPending(null);
  }

  type EditFocus = "attendance" | "notes" | "changeNote" | "dailyNote";
  const [expandFocus, setExpandFocus] = useState<Map<string, EditFocus>>(new Map());
  const [studentFieldPending, setStudentFieldPending] = useState<string | null>(null);
  const [expandedTimelines, setExpandedTimelines] = useState<Set<string>>(new Set());

  const [tooltip, setTooltip] = useState<{ text: string; rect: DOMRect } | null>(null);

  const [quickPending, setQuickPending] = useState<string | null>(null);

  type InlineTimeEdit = { studentId: string; field: "checkIn" | "checkOut"; value: string };
  const [inlineTimeEdit, setInlineTimeEdit] = useState<InlineTimeEdit | null>(null);

  type InlineOutingEdit = { studentId: string; field: "outStart" | "outEnd"; value: string };
  const [inlineOutingEdit, setInlineOutingEdit] = useState<InlineOutingEdit | null>(null);

  // 추가 외출(2차+) 인라인 폼 상태
  type AddOutingDraft = { studentId: string; outStart: string; outEnd: string; reason: string };
  const [addOutingDraft, setAddOutingDraft] = useState<AddOutingDraft | null>(null);
  const [addOutingPending, setAddOutingPending] = useState<string | null>(null);

  async function submitAddOuting(student: StudentWithAttendance) {
    if (!addOutingDraft || addOutingDraft.studentId !== student.id) return;
    const { outStart, outEnd, reason } = addOutingDraft;
    if (!outStart || !/^\d{2}:\d{2}$/.test(outStart)) { toast.error("외출 시작 시간을 입력하세요"); return; }
    setAddOutingPending(student.id);
    try {
      const created = await addOuting(student.id, new Date(todayDate), {
        outStart,
        outEnd: outEnd && /^\d{2}:\d{2}$/.test(outEnd) ? outEnd : null,
        reason: reason || undefined,
      });
      setLocalOutings((prev) => {
        const m = new Map(prev);
        const list = m.get(student.id) ?? [];
        m.set(student.id, [
          ...list,
          { id: created.id, outStart: created.outStart, outEnd: created.outEnd, sequence: created.sequence, reason: created.reason },
        ]);
        return m;
      });
      toast.success(`${created.sequence}차 외출 추가됨`);
      setAddOutingDraft(null);
    } catch { toast.error("저장 실패"); }
    setAddOutingPending(null);
  }

  async function removeOuting(student: StudentWithAttendance, outingId: string) {
    setAddOutingPending(student.id);
    try {
      await deleteOuting(outingId);
      setLocalOutings((prev) => {
        const m = new Map(prev);
        m.set(student.id, (m.get(student.id) ?? []).filter((o) => o.id !== outingId));
        return m;
      });
      toast.success("외출 기록 삭제됨");
    } catch { toast.error("삭제 실패"); }
    setAddOutingPending(null);
  }

  // 하단 액션바용: 현재 포커스된 시간 입력
  type ActiveTimeInput = { studentId: string; field: "checkIn" | "checkOut" | "outing" | "return"; studentName: string };
  const [activeTimeInput, setActiveTimeInput] = useState<ActiveTimeInput | null>(null);

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
      if (type === "ABSENT" || type === "APPROVED_ABSENT" || type === "NOTIFIED_ABSENT") return type;
      if (isFlexStart) return "FLEXIBLE";
      return "ABSENT";
    }

    // 입실한 경우: 실제 외출 기록(outStart 있고 outEnd 없음)이 있을 때만 외출중
    const outings = localOutings.get(s.id) ?? s.dailyOutings;
    const activeOuting = outings.find((o) => o.outStart && !o.outEnd);
    if (activeOuting) return "OUTING";

    const type = lt?.type ?? (att?.type as string | undefined);
    if (type === "EARLY_LEAVE") {
      // 기존 EARLY_LEAVE 데이터: 입실 시간 기준으로 지각 여부 재판단
      const schedIn = s.schedules[0]?.startTime;
      if (schedIn && schedIn !== "FLEXIBLE" && checkInTime && toMinutes(checkInTime) >= toMinutes(schedIn) + 5) {
        return "TARDY";
      }
      return "NORMAL";
    }
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
        : "퇴실 기록됨";
      toast.success(label);
    } catch { toast.error("저장 실패"); }
    setQuickPending(null);
  }

  async function clearField(student: StudentWithAttendance, field: "checkIn" | "checkOut") {
    if (quickPending) return;
    const curr = localTimes.get(student.id) ?? { checkIn: "", checkOut: "", type: "NORMAL" as AttendanceType };
    const updated = { ...curr, [field]: "", type: "NORMAL" as AttendanceType };
    // 퇴실 클리어 시 타입 유지, 입실 클리어 시 NORMAL로
    if (field === "checkOut") updated.type = curr.type;
    setLocalTimes((prev) => { const m = new Map(prev); m.set(student.id, updated); return m; });
    if (selectedId === student.id) setEditValues((v) => ({ ...v, [field]: "", type: updated.type }));
    setQuickPending(student.id);
    try {
      await saveAttendanceRecord({
        studentId: student.id, date: todayDate,
        checkIn: updated.checkIn || undefined,
        checkOut: updated.checkOut || undefined,
        type: updated.type,
      });
      toast.success(field === "checkIn" ? "입실 기록 삭제됨" : "퇴실 기록 삭제됨");
    } catch { toast.error("삭제 실패"); }
    setQuickPending(null);
  }

  async function quickStartOuting(student: StudentWithAttendance, time: string = nowHHMM()) {
    if (quickPending) return;
    setQuickPending(student.id);
    try {
      const created = await createDailyOuting({ studentId: student.id, date: todayDate, outStart: time });
      setLocalOutings((prev) => {
        const m = new Map(prev);
        m.set(student.id, [
          ...(m.get(student.id) ?? []).filter((o) => o.id !== null),
          { id: created.id, outStart: created.outStart, outEnd: null },
        ]);
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
    const fields = localStudentFields.get(student.id) ?? { studentInfo: "", changeNote: "", dailyNote: "" };
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

  const TABS: { key: PanelTab; label: string; badge?: number }[] = [
    { key: "attendance", label: "입퇴실" },
    { key: "merit", label: "상벌점" },
    { key: "studyplan", label: "공부계획" },
    { key: "assignments", label: "과제", badge: pendingAssignments },
    { key: "communications", label: "요청/전달", badge: pendingComms },
    { key: "schedule", label: "일정" },
  ];

  // 표 머리 「초기화」 — 확인 다이얼로그를 거쳐 전체 원생의 해당 체크를 비운다.
  const [resetTarget, setResetTarget] = useState<ResetTarget | null>(null);
  const [resetPending, setResetPending] = useState(false);

  async function runReset(target: ResetTarget) {
    setResetPending(true);
    try {
      if (target === "weeklyPlanDate") {
        await resetWeeklyCheckDates();
        setLocalCheckDates((prev) => {
          const m = new Map(prev);
          for (const [id, dates] of m) m.set(id, { ...dates, weeklyPlanDate: null });
          return m;
        });
        toast.success("공부계획이 초기화되었습니다");
      } else if (target === "mockAnalysisDate") {
        await resetCheckDateForAll("mockAnalysisDate");
        setLocalCheckDates((prev) => {
          const m = new Map(prev);
          for (const [id, dates] of m) m.set(id, { ...dates, mockAnalysisDate: null });
          return m;
        });
        toast.success("모의고사 분석지가 초기화되었습니다");
      } else {
        await resetCheckDateForAll("schoolAnalysisDate");
        setLocalCheckDates((prev) => {
          const m = new Map(prev);
          for (const [id, dates] of m) m.set(id, { ...dates, schoolAnalysisDate: null });
          return m;
        });
        toast.success("내신 분석지가 초기화되었습니다");
      }
      setResetTarget(null);
    } finally {
      setResetPending(false);
    }
  }

  // 곧 입실/퇴실 예정 (30분 이내) — nowMinutes(60초 갱신) 기준. 검색 필터와 무관하게 전체 대상.
  const imminentIn: { name: string; time: string; mins: number }[] = [];
  const imminentOut: { name: string; time: string; mins: number }[] = [];
  for (const s of students) {
    const lt = localTimes.get(s.id);
    const checkIn = lt?.checkIn ?? "";
    const checkOut = lt?.checkOut ?? "";
    const schedIn = s.schedules[0]?.startTime;
    const schedOut = s.schedules[0]?.endTime;
    const isAbsent = lt?.type === "ABSENT" || lt?.type === "APPROVED_ABSENT" || lt?.type === "NOTIFIED_ABSENT";
    // 입실 예정: 미입실 + 결석류 아님 + 예정 입실 0~30분 이내
    if (!checkIn && schedIn && schedIn !== "FLEXIBLE" && !isAbsent) {
      const d = toMinutes(schedIn) - nowMinutes;
      if (d >= 0 && d <= 30) imminentIn.push({ name: s.name, time: schedIn, mins: d });
    }
    // 퇴실 예정: 입실했고 미퇴실 + 예정 퇴실 0~30분 이내
    if (checkIn && !checkOut && schedOut && schedOut !== "FLEXIBLE") {
      const d = toMinutes(schedOut) - nowMinutes;
      if (d >= 0 && d <= 30) imminentOut.push({ name: s.name, time: schedOut, mins: d });
    }
  }
  imminentIn.sort((a, b) => a.mins - b.mins);
  imminentOut.sort((a, b) => a.mins - b.mins);
  const hasImminent = imminentIn.length > 0 || imminentOut.length > 0;

  // 표 머리 셀 공통 — ui/table TableHead 규격(t3 medium · subtle · h-10)
  const TH = "h-10 whitespace-nowrap px-x3 text-left align-middle t3-medium text-fg-neutral-subtle";

  return (
    <>
      {/* 곧 입실/퇴실 예정 (30분 이내) — 둘 다 비면 렌더 안 함 */}
      {hasImminent && (
        <section
          aria-label="곧 입실·퇴실 예정"
          className="mb-x4 flex flex-col gap-x4 rounded-r4 bg-bg-layer-fill px-x5 py-x4 sm:flex-row sm:gap-x8"
        >
          {imminentIn.length > 0 && (
            <div className="min-w-0 flex-1">
              <p className="mb-x2 flex items-center gap-x1_5 t4-bold text-fg-neutral">
                <LogIn className="size-4 text-fg-positive" aria-hidden />
                곧 입실
                <span className="tabular-nums text-fg-positive">{imminentIn.length}명</span>
                <span className="t3-regular text-fg-neutral-subtle">30분 이내</span>
              </p>
              <div className="flex flex-wrap gap-x1_5">
                {imminentIn.map((i, idx) => (
                  <span
                    key={`in-${idx}`}
                    className={cn("inline-flex h-8 items-center gap-x1_5 rounded-full px-x3 t3-regular", TONE_SOFT[ACTIVITY_TONE.checkIn])}
                  >
                    <span className="t3-bold">{i.name}</span>
                    <span className="tabular-nums">{i.time}</span>
                    <span className="tabular-nums opacity-80">{i.mins}분 후</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {imminentOut.length > 0 && (
            <div className="min-w-0 flex-1">
              <p className="mb-x2 flex items-center gap-x1_5 t4-bold text-fg-neutral">
                <LogOut className="size-4 text-fg-neutral-muted" aria-hidden />
                곧 퇴실
                <span className="tabular-nums text-fg-neutral-muted">{imminentOut.length}명</span>
                <span className="t3-regular text-fg-neutral-subtle">30분 이내</span>
              </p>
              <div className="flex flex-wrap gap-x1_5">
                {imminentOut.map((i, idx) => (
                  <span
                    key={`out-${idx}`}
                    className={cn("inline-flex h-8 items-center gap-x1_5 rounded-full px-x3 t3-regular", TONE_SOFT[ACTIVITY_TONE.checkOut])}
                  >
                    <span className="t3-bold text-fg-neutral">{i.name}</span>
                    <span className="tabular-nums">{i.time}</span>
                    <span className="tabular-nums opacity-80">{i.mins}분 후</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 도구 줄 — 필터 칩 · 검색 · 열 너비 초기화. 스크롤해도 상단(앱 헤더 아래)에 붙어 있다 */}
      <div className="sticky top-14 z-10 flex flex-wrap items-center gap-x2 bg-bg-layer-default py-x3">
        {toolbarStart}
        <div className="flex w-full flex-wrap items-center gap-x2 sm:ml-auto sm:w-auto">
          {q && (
            <span className="t3-regular tabular-nums text-fg-neutral-subtle">{displayStudents.length}명 검색됨</span>
          )}
          <TableSearch value={query} onChange={setQuery} placeholder="이름, 학교, 학년, 좌석 검색" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={resetColW}
            title="열 너비를 기본값으로 되돌립니다"
            className="text-fg-neutral-muted"
          >
            <ArrowRightLeft />
            열 너비 초기화
          </Button>
        </div>
      </div>

      {/* 행 왼쪽 표시 안내 */}
      <div className="mb-x2 flex flex-wrap items-center justify-end gap-x4 t2-regular text-fg-neutral-subtle">
        <span className="inline-flex items-center gap-x1_5">
          <span aria-hidden className="h-3 w-1 rounded-full bg-bg-critical-solid" /> 10분 안에 입실 예정
        </span>
        <span className="inline-flex items-center gap-x1_5">
          <span aria-hidden className="h-3 w-1 rounded-full bg-bg-warning-solid" /> 영단어 시험 대상(미응시)
        </span>
      </div>

      {/* 테이블 — 가로 스크롤 */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-[4] flex flex-col">
          <button
            type="button"
            onClick={() => scrollBy(-240)}
            aria-label="표 왼쪽으로 스크롤"
            style={{ position: "sticky", top: "calc(50vh - 20px)" }}
            className="pointer-events-auto grid h-10 w-6 place-items-center rounded-full bg-bg-layer-floating text-fg-neutral-muted shadow-[var(--seed-shadow-s2)] transition-colors hover:text-fg-neutral"
          >
            <ChevronLeft className="size-4" />
          </button>
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 z-[4] flex flex-col">
          <button
            type="button"
            onClick={() => scrollBy(240)}
            aria-label="표 오른쪽으로 스크롤"
            style={{ position: "sticky", top: "calc(50vh - 20px)" }}
            className="pointer-events-auto grid h-10 w-6 place-items-center rounded-full bg-bg-layer-floating text-fg-neutral-muted shadow-[var(--seed-shadow-s2)] transition-colors hover:text-fg-neutral"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div
          ref={scrollRef}
          className="mx-x6 overflow-x-auto rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default"
        >
        <table className="w-full min-w-max border-collapse t4-regular text-fg-neutral">
          <colgroup>
            <col style={{ width: 40 }} />
            <col style={{ width: 56 }} />
            <col style={{ width: 184 }} />
            <col style={{ width: colW.notes }} />
            <col style={{ width: colW.schoolGrade }} />
            <col style={{ width: colW.classGroup }} />
            <col style={{ width: colW.inout }} />
            <col style={{ width: colW.outing }} />
            <col style={{ width: colW.memo }} />
            <col style={{ width: colW.dailyChange }} />
            <col style={{ width: colW.plannedChange }} />
            <col style={{ width: colW.planner }} />
            <col style={{ width: colW.studyPlan }} />
            <col style={{ width: colW.mockAnalysis }} />
            <col style={{ width: colW.schoolAnalysis }} />
            <col style={{ width: colW.vocab }} />
          </colgroup>
          <thead>
            <tr className="border-b border-stroke-neutral-muted bg-bg-layer-fill">
              <th className="sticky left-0 z-[3] bg-bg-layer-fill">
                <span className="sr-only">일과 펼치기</span>
              </th>
              <th className={cn(TH, "sticky left-10 z-[3] bg-bg-layer-fill px-x2 text-center")}>좌석</th>
              <th className={cn(TH, "sticky left-24 z-[3] bg-bg-layer-fill shadow-[inset_-1px_0_0_var(--seed-color-stroke-neutral-muted)]")}>
                이름 · 상태
              </th>
              <th className={cn(TH, "relative hidden lg:table-cell")}>특이사항<ColResizeHandle current={colW.notes} onResize={(w) => setColW("notes", w)} /></th>
              <th className={cn(TH, "relative hidden md:table-cell")}>학교·학년<ColResizeHandle current={colW.schoolGrade} onResize={(w) => setColW("schoolGrade", w)} /></th>
              <th className={cn(TH, "relative hidden lg:table-cell")}>반<ColResizeHandle current={colW.classGroup} onResize={(w) => setColW("classGroup", w)} /></th>
              <th className={cn(TH, "relative")}>입퇴실<ColResizeHandle current={colW.inout} onResize={(w) => setColW("inout", w)} /></th>
              <th className={cn(TH, "relative")}>외출<ColResizeHandle current={colW.outing} onResize={(w) => setColW("outing", w)} /></th>
              <th className={cn(TH, "relative hidden lg:table-cell")}>메모<ColResizeHandle current={colW.memo} onResize={(w) => setColW("memo", w)} /></th>
              <th className={cn(TH, "relative hidden lg:table-cell")}>당일변동<ColResizeHandle current={colW.dailyChange} onResize={(w) => setColW("dailyChange", w)} /></th>
              <th className={cn(TH, "relative hidden xl:table-cell")}>변동예정<ColResizeHandle current={colW.plannedChange} onResize={(w) => setColW("plannedChange", w)} /></th>
              <th className={cn(TH, "relative hidden text-center md:table-cell")}>플래너 전송<ColResizeHandle current={colW.planner} onResize={(w) => setColW("planner", w)} /></th>
              {(
                [
                  { key: "weeklyPlanDate", label: "공부계획", w: colW.studyPlan, col: "studyPlan" },
                  { key: "mockAnalysisDate", label: "모의 분석", w: colW.mockAnalysis, col: "mockAnalysis" },
                  { key: "schoolAnalysisDate", label: "내신 분석", w: colW.schoolAnalysis, col: "schoolAnalysis" },
                ] as const
              ).map((h) => (
                <th key={h.key} className={cn(TH, "relative hidden px-x2 text-center md:table-cell")}>
                  <ColResizeHandle current={h.w} onResize={(w) => setColW(h.col, w)} />
                  <div className="flex flex-col items-center gap-x0_5 py-x1">
                    <span>{h.label}</span>
                    <button
                      type="button"
                      onClick={() => setResetTarget(h.key)}
                      className="rounded-r1_5 px-x1_5 t2-medium text-fg-critical transition-colors hover:bg-bg-critical-weak"
                    >
                      초기화
                    </button>
                  </div>
                </th>
              ))}
              <th className={cn(TH, "relative px-x2 text-center")}>
                <ColResizeHandle current={colW.vocab} onResize={(w) => setColW("vocab", w)} />
                영단어
              </th>
            </tr>
          </thead>
          <tbody>
            {displayStudents.length === 0 && (
              <tr>
                <td colSpan={16} className="p-0">
                  <div className="sticky left-0" style={{ width: stickyWidth }}>
                    <EmptyState
                      compact
                      icon={SearchX}
                      title={q ? "검색 결과가 없어요" : "표시할 원생이 없어요"}
                      description={q ? "이름·학교·학년·좌석으로 다시 찾아보세요." : "필터를 바꾸거나 전체 보기로 돌아가 보세요."}
                      action={
                        q ? (
                          <Button variant="outline" size="sm" onClick={() => setQuery("")}>
                            검색어 지우기
                          </Button>
                        ) : undefined
                      }
                    />
                  </div>
                </td>
              </tr>
            )}
            {displayStudents.map((student) => {
              const state = getState(student);
              const isSelected = selectedId === student.id;
              const lt = localTimes.get(student.id);
              const checkInTime = lt?.checkIn ?? "";
              const checkOutTime = lt?.checkOut ?? "";
              const schedIn = student.schedules[0]?.startTime;
              const schedOut = student.schedules[0]?.endTime;
              const localOut = localOutings.get(student.id) ?? [];
              // 진행 중인 외출(시작만 있고 복귀 없음) + 예정 외출(회색 힌트용)
              const activeOuting = localOut.find((o) => o.outStart && !o.outEnd);
              const outSch = student.outings[0];
              const commCount = student.communications.filter((c) => !c.isChecked).length;
              const assignCount = student.assignments.filter((a) => !a.isCompleted).length;
              const schoolGrade = [student.school, student.grade].filter(Boolean).join(" ");
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
              const plannerHasDate = !!plannerDate;
              const plannerCurrentWeek = plannerHasDate && isDoneThisWeek("plannerSentDate", plannerDate);
              const plannerPending = checkDatePending === `${student.id}:plannerSentDate`;

              // 영단어 시험 대상자 여부 (VocabTestEnrollment 기반)
              const isVocabTarget = student.vocabEnrollment?.isActive ?? false;
              const vocabChecks = localCheckDates.get(student.id);
              const vocabDone = vocabChecks ? isDoneThisWeek("vocabTestDate", vocabChecks.vocabTestDate) : false;

              // 행 배경 = 출결 상태색(ATTENDANCE_STATE). 선택/펼침(상호작용 피드백)이 최상위.
              // 좌측 고정 셀(펼침/좌석/이름)에도 같은 배경을 깔아 가로 스크롤 시에도 일관되게 보이게 한다
              // (sticky 셀은 불투명해야 뒤로 스크롤되는 내용이 비치지 않음 — SEED *-weak 는 불투명).
              const rowBg = isSelected
                ? "bg-bg-brand-weak"
                : isExpanded
                ? "bg-bg-neutral-weak"
                : attendanceStateMeta(state).row;
              // 행 왼쪽 표시(첫 sticky 셀 안쪽 3px): 선택 > 입실 임박 > 영단어 시험 대상(미응시)
              const rowMark = isSelected
                ? "shadow-[inset_3px_0_0_var(--seed-color-stroke-brand-solid)]"
                : isCheckInImminent
                ? "shadow-[inset_3px_0_0_var(--seed-color-bg-critical-solid)]"
                : isVocabTarget && !vocabDone
                ? "shadow-[inset_3px_0_0_var(--seed-color-bg-warning-solid)]"
                : null;
              const noSchedule = state === "NO_SCHEDULE";

              return (
                <Fragment key={student.id}>
                <tr
                  onClick={(e) => toggleTimeline(student.id, e)}
                  className={cn("group cursor-pointer border-b border-stroke-neutral-muted transition-colors", rowBg)}
                >
                  {/* 타임라인 토글 */}
                  <td className={cn("sticky left-0 z-[2] px-x1 py-x2 text-center", rowBg, rowMark)} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={(e) => toggleTimeline(student.id, e)}
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? `${student.name} 일과 접기` : `${student.name} 일과 펼치기`}
                      title="일과 타임라인"
                      className="inline-grid size-8 place-items-center rounded-r2 text-fg-neutral-subtle transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral"
                    >
                      {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </button>
                  </td>
                  {/* 좌석 */}
                  <td
                    className={cn(
                      "sticky left-10 z-[2] px-x2 py-x2 text-center t5-bold tabular-nums",
                      noSchedule ? "text-fg-neutral-subtle" : "text-fg-neutral",
                      rowBg,
                    )}
                  >
                    {student.seat ?? "—"}
                  </td>

                  {/* 이름 + 상태 + 배지 */}
                  <td className={cn("sticky left-24 z-[2] px-x3 py-x2 shadow-[inset_-1px_0_0_var(--seed-color-stroke-neutral-muted)]", rowBg)}>
                    <div className="flex min-w-0 items-center gap-x1">
                      <p className={cn("truncate t5-bold", noSchedule ? "text-fg-neutral-subtle" : "text-fg-neutral")}>
                        {student.name}
                      </p>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); selectStudent(student); }}
                        aria-pressed={isSelected}
                        aria-label={`${student.name} 상세 보기`}
                        title="상세 보기"
                        className={cn(
                          "ml-auto inline-grid size-7 shrink-0 place-items-center rounded-r2 transition-colors",
                          isSelected
                            ? "bg-bg-brand-solid text-palette-static-white"
                            : "text-fg-neutral-subtle hover:bg-bg-transparent-pressed hover:text-fg-neutral",
                        )}
                      >
                        <PanelRightOpen className="size-4" />
                      </button>
                    </div>
                    <div className="mt-x1 flex flex-wrap items-center gap-x1">
                      <AttendanceStateBadge state={state} label={getStateLabel(state)} />
                      {commCount > 0 && (
                        <span title={`확인하지 않은 요청/전달 ${commCount}건`}>
                          <StatusBadge tone="brand">
                            <MessageSquare aria-hidden />
                            {commCount}
                          </StatusBadge>
                        </span>
                      )}
                      {assignCount > 0 && (
                        <span title={`진행 중인 과제 ${assignCount}건`}>
                          <StatusBadge tone="info">
                            <ClipboardList aria-hidden />
                            {assignCount}
                          </StatusBadge>
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 특이사항 */}
                  <td
                    className="group/info hidden cursor-pointer px-x3 py-x2 lg:table-cell"
                    onClick={(e) => { e.stopPropagation(); setInfoModalId(student.id); setInfoModalText(student.studentInfo ?? ""); }}
                  >
                    {student.studentInfo ? (
                      <div className="flex items-center gap-x1">
                        <Pin className="size-3.5 shrink-0 text-fg-neutral-subtle" aria-hidden />
                        <span className="block max-w-[130px] truncate t3-regular text-fg-neutral">{student.studentInfo}</span>
                      </div>
                    ) : (
                      <span className="t3-regular text-fg-placeholder transition-colors group-hover/info:text-fg-neutral-muted">메모 추가</span>
                    )}
                  </td>

                  {/* 학교·학년 */}
                  <td className="hidden whitespace-nowrap px-x3 py-x2 t3-regular text-fg-neutral-muted md:table-cell">
                    {schoolGrade || "—"}
                  </td>

                  {/* 반 */}
                  <td className="hidden whitespace-nowrap px-x3 py-x2 t3-regular text-fg-neutral-muted lg:table-cell">
                    {student.classGroup || "—"}
                  </td>

                  {/* 입퇴실 — 입실/퇴실 세로 배치 */}
                  <td className="px-x2 py-x2 align-top" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-col gap-x1">
                      {/* 입실 */}
                      <div className="flex items-center gap-x1_5">
                        <span className="w-6 shrink-0 t2-medium text-fg-neutral-subtle">입실</span>
                        <span className={cn("w-10 shrink-0 text-right t2-regular tabular-nums",
                          !schedIn ? "invisible" :
                          schedIn === "FLEXIBLE" ? "text-palette-purple-700" :
                          !checkInTime ? "text-fg-critical" :
                          lt?.type === "TARDY" ? "text-fg-warning" : "text-fg-neutral-subtle"
                        )}>{schedIn === "FLEXIBLE" ? "자율" : schedIn ?? "00:00"}</span>
                        <TimePickerInput
                          value={checkInTime}
                          onChange={(v) => {
                            setLocalTimes((prev) => { const m = new Map(prev); const c = m.get(student.id) ?? { checkIn: "", checkOut: "", type: "NORMAL" as AttendanceType }; m.set(student.id, { ...c, checkIn: v }); return m; });
                            if (v) quickSaveField(student, "checkIn", v);
                          }}
                          onFocus={() => setActiveTimeInput({ studentId: student.id, field: "checkIn", studentName: student.name })}
                          onBlur={() => {
                            setTimeout(() => setActiveTimeInput((prev) => prev?.studentId === student.id && prev?.field === "checkIn" ? null : prev), 200);
                          }}
                          size="sm"
                          className={cn(TIME_INPUT, checkInTime ? "t4-bold text-fg-neutral" : "text-fg-placeholder")}
                        />
                      </div>

                      {/* 퇴실 */}
                      <div className="flex items-center gap-x1_5">
                        <span className="w-6 shrink-0 t2-medium text-fg-neutral-subtle">퇴실</span>
                        <span className={cn("w-10 shrink-0 text-right t2-regular tabular-nums",
                          !schedOut ? "invisible" :
                          schedOut === "FLEXIBLE" ? "text-palette-purple-700" : "text-fg-neutral-subtle"
                        )}>{schedOut === "FLEXIBLE" ? "자율" : schedOut ?? "00:00"}</span>
                        <TimePickerInput
                          value={checkOutTime}
                          onChange={(v) => {
                            setLocalTimes((prev) => { const m = new Map(prev); const c = m.get(student.id) ?? { checkIn: "", checkOut: "", type: "NORMAL" as AttendanceType }; m.set(student.id, { ...c, checkOut: v }); return m; });
                            if (v) quickSaveField(student, "checkOut", v);
                          }}
                          onFocus={() => setActiveTimeInput({ studentId: student.id, field: "checkOut", studentName: student.name })}
                          onBlur={() => {
                            setTimeout(() => setActiveTimeInput((prev) => prev?.studentId === student.id && prev?.field === "checkOut" ? null : prev), 200);
                          }}
                          size="sm"
                          className={cn(TIME_INPUT, checkOutTime ? "t4-bold text-fg-neutral" : "text-fg-placeholder")}
                        />
                        {student.attendances[0]?.isAutoClosed && (
                          <span title="자정 크론에 의해 자동 퇴실 처리됨">
                            <StatusBadge tone="gray">자동</StatusBadge>
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* 외출 — 전용 열: 좌(시작/복귀 입력 + 추가) · 우(기록된 외출 목록) */}
                  <td className="px-x2 py-x2 align-top" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-start gap-x3">
                      <div className="flex shrink-0 flex-col gap-x1">
                      {/* 외출 (진행 중 / 새 외출 시작) */}
                      <div className="flex items-center gap-x1_5">
                        <span className="w-6 shrink-0 t2-medium text-fg-neutral-subtle">외출</span>
                        <span className={cn("w-10 shrink-0 text-right t2-regular tabular-nums",
                          outSch?.outStart ? "text-fg-neutral-subtle" : "invisible"
                        )}>{outSch?.outStart ?? "00:00"}</span>
                        <TimePickerInput
                          value={activeOuting ? toTimeString(activeOuting.outStart) ?? "" : ""}
                          onChange={(v) => {
                            if (!v) return;
                            if (activeOuting?.id) {
                              // 진행 중 외출의 시작 시간 수정
                              setLocalOutings((prev) => {
                                const m = new Map(prev);
                                m.set(student.id, (m.get(student.id) ?? []).map((o) =>
                                  o.id === activeOuting.id ? { ...o, outStart: new Date(`${todayDate}T${v}:00`) } : o
                                ));
                                return m;
                              });
                              updateDailyOuting(activeOuting.id, { date: todayDate, outStart: v });
                            } else {
                              // 진행 중 외출이 없으면 새 외출 시작 (1차/2차/…)
                              quickStartOuting(student, v);
                            }
                          }}
                          size="sm"
                          className={cn(TIME_INPUT, activeOuting ? "t4-bold text-fg-informative" : "text-fg-placeholder")}
                          placeholder="—"
                        />
                        {!activeOuting && checkInTime && (
                          <CellButton
                            tone="informative"
                            onClick={(e) => { e.stopPropagation(); quickStartOuting(student); }}
                            disabled={!!quickPending}
                            className="h-8"
                            title="현재 시각으로 외출 시작"
                          >지금</CellButton>
                        )}
                      </div>

                      {/* 복귀 */}
                      <div className="flex items-center gap-x1_5">
                        <span className="w-6 shrink-0 t2-medium text-fg-neutral-subtle">복귀</span>
                        <span className={cn("w-10 shrink-0 text-right t2-regular tabular-nums",
                          outSch?.outEnd ? "text-fg-neutral-subtle" : "invisible"
                        )}>{outSch?.outEnd ?? "00:00"}</span>
                        <TimePickerInput
                          value=""
                          disabled={!activeOuting}
                          onChange={(v) => {
                            if (activeOuting?.id && v) {
                              quickEndOuting(student, v); // 진행 중 외출 복귀 처리(지각 자동판정 포함)
                            }
                          }}
                          size="sm"
                          className={cn(TIME_INPUT, activeOuting ? "text-fg-neutral-muted" : "bg-bg-layer-fill text-fg-placeholder")}
                          placeholder={activeOuting ? "복귀 시각" : "—"}
                        />
                        {activeOuting && (
                          <CellButton
                            tone="informative"
                            onClick={(e) => { e.stopPropagation(); quickEndOuting(student); }}
                            disabled={!!quickPending}
                            className="h-8"
                            title="현재 시각으로 복귀"
                          >지금</CellButton>
                        )}
                      </div>
                      {/* 외출 추가 — 시작·복귀·사유 한 번에 */}
                      {(() => {
                        const isAdding = addOutingDraft?.studentId === student.id;
                        const isAddPending = addOutingPending === student.id;
                        const hasCheckIn = !!checkInTime;
                        return (
                          <div className="mt-x0_5">
                            {isAdding ? (
                              <div className="flex flex-wrap items-center gap-x1 pt-x1" onClick={(e) => e.stopPropagation()}>
                                <TimePickerInput
                                  value={addOutingDraft!.outStart}
                                  onChange={(v) => setAddOutingDraft((d) => d && { ...d, outStart: v })}
                                  size="sm"
                                  className={cn(TIME_INPUT, "w-20")}
                                  placeholder="시작"
                                />
                                <span className="t3-regular text-fg-neutral-subtle">–</span>
                                <TimePickerInput
                                  value={addOutingDraft!.outEnd}
                                  onChange={(v) => setAddOutingDraft((d) => d && { ...d, outEnd: v })}
                                  size="sm"
                                  className={cn(TIME_INPUT, "w-20")}
                                  placeholder="복귀"
                                />
                                <input
                                  type="text"
                                  value={addOutingDraft!.reason}
                                  onChange={(e) => setAddOutingDraft((d) => d && { ...d, reason: e.target.value })}
                                  placeholder="사유"
                                  aria-label="외출 사유"
                                  className={cn(inputBaseClass, "h-8 min-w-0 max-w-[140px] flex-1 px-x2 t3-regular")}
                                />
                                <CellButton
                                  tone="informative"
                                  onClick={() => submitAddOuting(student)}
                                  disabled={isAddPending}
                                  className="h-8"
                                >
                                  {isAddPending ? "저장 중…" : "저장"}
                                </CellButton>
                                <CellButton onClick={() => setAddOutingDraft(null)} className="h-8">
                                  취소
                                </CellButton>
                              </div>
                            ) : (
                              (localOut.length > 0 || hasCheckIn) && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setAddOutingDraft({ studentId: student.id, outStart: nowHHMM(), outEnd: "", reason: "" });
                                  }}
                                  className="inline-flex items-center gap-x0_5 rounded-r1_5 py-x0_5 t3-medium text-fg-informative hover:underline"
                                >
                                  <Plus className="size-3.5" aria-hidden /> 외출 추가
                                </button>
                              )
                            )}
                          </div>
                        );
                      })()}
                      </div>
                      {/* 우: 기록된 외출 목록(완료 건) */}
                      {(() => {
                        const recorded = localOut
                          .filter((o) => o.id && o.outEnd)
                          .slice()
                          .sort((a, b) => (a.outStart ? toMinutes(toTimeString(a.outStart)) : 0) - (b.outStart ? toMinutes(toTimeString(b.outStart)) : 0));
                        if (recorded.length === 0) return null;
                        return (
                          <div className="flex min-w-0 flex-col gap-x0_5 border-l border-stroke-neutral-muted pl-x2">
                            {recorded.map((o, i) => (
                              <div key={o.id} className="flex items-center gap-x1 t3-regular text-fg-neutral-muted">
                                <span className="shrink-0 t3-bold text-fg-informative">{i + 1}차</span>
                                <span className="tabular-nums">{toTimeString(o.outStart) || "—"}–{toTimeString(o.outEnd) || "—"}</span>
                                {o.reason && <span className="max-w-[72px] truncate text-fg-neutral-subtle">({o.reason})</span>}
                                <IconAction
                                  danger
                                  aria-label="외출 삭제"
                                  title="외출 삭제"
                                  className="ml-auto size-6"
                                  onClick={(e) => { e.stopPropagation(); if (o.id) removeOuting(student, o.id); }}
                                >
                                  <Trash2 />
                                </IconAction>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </td>

                  {/* 입퇴실 메모 */}
                  <td
                    className="hidden cursor-pointer px-x3 py-x2 lg:table-cell"
                    onClick={(e) => expandAndFocus(student.id, "notes", e)}
                    onMouseEnter={(e) => showTooltip(e, attNotes)}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    {attNotes ? (
                      <span className="block max-w-[130px] truncate t3-regular text-fg-neutral">{attNotes}</span>
                    ) : (
                      <span className="t3-regular text-fg-placeholder">—</span>
                    )}
                  </td>

                  {/* 당일 변동 (오늘 기록만 표시) */}
                  {(() => {
                    const noteDateISO = student.dailyNoteDate ? new Date(student.dailyNoteDate).toISOString().split("T")[0] : null;
                    const now = new Date();
                    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
                    const todayISO = kst.toISOString().split("T")[0];
                    const showDailyNote = noteDateISO === todayISO && student.dailyNote;
                    return (
                      <td
                        className="hidden cursor-pointer px-x3 py-x2 lg:table-cell"
                        onClick={(e) => expandAndFocus(student.id, "dailyNote", e)}
                        onMouseEnter={(e) => showTooltip(e, showDailyNote ? student.dailyNote ?? "" : "")}
                        onMouseLeave={() => setTooltip(null)}
                      >
                        {showDailyNote ? (
                          <span className="block max-w-[130px] truncate t3-medium text-fg-critical">{student.dailyNote}</span>
                        ) : (
                          <span className="t3-regular text-fg-placeholder">—</span>
                        )}
                      </td>
                    );
                  })()}

                  {/* 추후 변동 예정 */}
                  <td
                    className="hidden cursor-pointer px-x3 py-x2 xl:table-cell"
                    onClick={(e) => expandAndFocus(student.id, "changeNote", e)}
                    onMouseEnter={(e) => showTooltip(e, student.changeNote ?? "")}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    {student.changeNote ? (
                      <span className="block max-w-[130px] truncate t3-regular text-fg-warning">{student.changeNote}</span>
                    ) : (
                      <span className="t3-regular text-fg-placeholder">—</span>
                    )}
                  </td>

                  {/* 플래너 전송 */}
                  <td className="hidden px-x3 py-x2 text-center md:table-cell" onClick={(e) => e.stopPropagation()}>
                    {plannerHasDate ? (
                      <div className="inline-flex items-center gap-x1">
                        <DatePicker
                          value={plannerDate}
                          onChange={(d) => saveCheckDate(student.id, "plannerSentDate", d)}
                          disabled={plannerPending}
                          className={
                            plannerCurrentWeek
                              ? "!rounded-full !border-stroke-positive-weak !bg-bg-positive-weak !text-fg-positive"
                              : "!rounded-full !border-stroke-warning-weak !bg-bg-warning-weak !text-fg-warning"
                          }
                        />
                        <IconAction
                          aria-label="플래너 전송 취소"
                          title="취소"
                          danger
                          onClick={() => saveCheckDate(student.id, "plannerSentDate", null)}
                          disabled={plannerPending}
                        >
                          <X />
                        </IconAction>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-x1">
                        <CellButton
                          onClick={() => saveCheckDate(student.id, "plannerSentDate", new Date().toISOString().split("T")[0])}
                          disabled={plannerPending}
                        >
                          {plannerPending ? "…" : "오늘"}
                        </CellButton>
                        <DatePicker
                          value={null}
                          onChange={(d) => { if (d) saveCheckDate(student.id, "plannerSentDate", d); }}
                          disabled={plannerPending}
                          compact
                          className="size-7 rounded-r2 border-stroke-neutral-weak bg-bg-layer-default text-fg-neutral-subtle hover:bg-bg-layer-default-pressed"
                        />
                      </div>
                    )}
                  </td>

                  {/* 주간 공부계획 체크 */}
                  <td className="hidden px-x2 py-x2 text-center md:table-cell" onClick={(e) => e.stopPropagation()}>
                    {(() => {
                      const wpDate = localCheckDates.get(student.id)?.weeklyPlanDate ?? null;
                      const wpDone = wpDate && isDoneThisWeek("weeklyPlanDate", wpDate);
                      const wpPending = checkDatePending === `${student.id}:weeklyPlanDate`;
                      return wpDone ? (
                        <div className="inline-flex items-center gap-x0_5">
                          <Check className="size-4 text-fg-positive" aria-label="제출함" />
                          <IconAction
                            aria-label="공부계획 제출 취소"
                            title="취소"
                            danger
                            onClick={() => saveCheckDate(student.id, "weeklyPlanDate", null)}
                            disabled={wpPending}
                          ><X /></IconAction>
                        </div>
                      ) : (
                        <CellButton
                          tone={wpDate && !wpDone ? "warning" : "neutral"}
                          onClick={() => saveCheckDate(student.id, "weeklyPlanDate", new Date().toISOString().split("T")[0])}
                          disabled={wpPending}
                        >{wpPending ? "…" : "제출"}</CellButton>
                      );
                    })()}
                  </td>

                  {/* 모의고사/내신 분석지 — 내신만 정시 면제 3-state, 모의는 제출/미제출 2-state */}
                  {(["mockAnalysisDate", "schoolAnalysisDate"] as const).map((analysisKey) => {
                    const aDate = localCheckDates.get(student.id)?.[analysisKey] ?? null;
                    const aPending = checkDatePending === `${student.id}:${analysisKey}`;
                    // 정시는 내신 분석에만 적용 — 정시 학생도 모의고사 분석은 필요
                    const supportsExempt = analysisKey === "schoolAnalysisDate";
                    const exemptKey = "schoolAnalysisExempt" as const;
                    const isExempt = supportsExempt && (localExempt.get(student.id)?.[exemptKey] ?? false);
                    const ePending = exemptPending === `${student.id}:${exemptKey}`;
                    return (
                      <td key={analysisKey} className="hidden px-x2 py-x2 text-center md:table-cell" onClick={(e) => e.stopPropagation()}>
                        {isExempt ? (
                          <div className="inline-flex items-center gap-x0_5">
                            <StatusBadge tone="violet" className="bg-palette-purple-100 text-palette-purple-700">정시</StatusBadge>
                            <IconAction
                              aria-label="정시 해제"
                              title="정시 해제"
                              danger
                              onClick={() => toggleAnalysisExempt(student.id, exemptKey, false)}
                              disabled={ePending}
                            ><X /></IconAction>
                          </div>
                        ) : aDate ? (
                          <div className="inline-flex items-center gap-x0_5">
                            <span className="inline-flex items-center gap-x1 text-fg-positive">
                              <Check className="size-4" aria-label="제출함" />
                              <span className="t2-regular tabular-nums text-fg-neutral-subtle">{fmtCheckDate(aDate)}</span>
                            </span>
                            <IconAction
                              aria-label="분석지 제출 취소"
                              title="취소"
                              danger
                              onClick={() => saveCheckDate(student.id, analysisKey, null)}
                              disabled={aPending}
                            ><X /></IconAction>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-x1">
                            <CellButton
                              onClick={() => saveCheckDate(student.id, analysisKey, new Date().toISOString().split("T")[0])}
                              disabled={aPending || ePending}
                            >{aPending ? "…" : "제출"}</CellButton>
                            {supportsExempt && (
                              <CellButton
                                tone="violet"
                                onClick={() => toggleAnalysisExempt(student.id, exemptKey, true)}
                                disabled={aPending || ePending}
                                title="이 학생은 정시 지원이라 내신 분석지 제출 면제"
                              >{ePending ? "…" : "정시"}</CellButton>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}

                  {/* 영단어 시험 상태 (이번 주) — 미대상/미응시/완료. 클릭 시 완료 토글(vocabTestDate). 추후 온라인 시험 상태와 연동. */}
                  <td className="px-x2 py-x2 text-center align-middle">
                    {!isVocabTarget ? (
                      <span className="t3-regular text-fg-placeholder">—</span>
                    ) : (
                      <CellButton
                        tone={vocabDone ? "positive" : "warning"}
                        onClick={(e) => { e.stopPropagation(); saveCheckDate(student.id, "vocabTestDate", vocabDone ? null : new Date().toISOString().split("T")[0]); }}
                        disabled={checkDatePending === `${student.id}:vocabTestDate`}
                        title={vocabDone ? "완료 해제" : "완료로 표시"}
                      >
                        {checkDatePending === `${student.id}:vocabTestDate` ? "…" : vocabDone ? "완료" : "미응시"}
                      </CellButton>
                    )}
                  </td>
                </tr>

                {/* 타임라인 + 인라인 편집 확장 행 */}
                {isExpanded && (
                  <tr className="border-b border-stroke-neutral-muted bg-bg-layer-fill">
                    <td colSpan={16} className="p-0">
                      {/* 보이는 영역 폭에 고정 → 14열 가로 스크롤과 무관하게 패널은 좌우 스크롤 불요 */}
                      <div className="sticky left-0 px-x4 py-x4" style={{ width: stickyWidth }}>
                      {(() => {
                        const focus = expandFocus.get(student.id);
                        const focusLabel: Record<EditFocus, string> = {
                          attendance: "출결 상태", notes: "입퇴실 메모",
                          changeNote: "추후 변동 예정", dailyNote: "당일 변동",
                        };
                        return (
                          <div onClick={(e) => e.stopPropagation()}>
                            {focus && (
                              <StatusBadge tone="brand" className="mb-x3">
                                편집 중: {focusLabel[focus]}
                              </StatusBadge>
                            )}
                            <div className="flex w-full flex-wrap items-stretch gap-x3">
                              {/* 왼쪽: 체크 항목 (주간 공부계획/플래너 전송 제외) */}
                              <div className="flex flex-col justify-center gap-x2 rounded-r3 bg-bg-layer-default px-x4 py-x3">
                                {CHECK_ITEMS.filter(({ key }) => key !== "weeklyPlanDate" && key !== "plannerSentDate" && key !== "mockAnalysisDate" && key !== "schoolAnalysisDate").map(({ key, label, permanent }) => {
                                  const dateVal = localCheckDates.get(student.id)?.[key] ?? null;
                                  const isPending = checkDatePending === `${student.id}:${key}`;
                                  const todayISO = new Date().toISOString().split("T")[0];
                                  const hasDate = !!dateVal;
                                  const isCurrentWeek = hasDate && isDoneThisWeek(key, dateVal);
                                  return (
                                    <div key={key} className="flex items-center gap-x2">
                                      <span className="w-24 shrink-0 t3-medium text-fg-neutral-muted">{label}</span>
                                      {hasDate ? (
                                        <div className="inline-flex items-center gap-x1">
                                          <DatePicker
                                            value={dateVal}
                                            onChange={(d) => saveCheckDate(student.id, key, d)}
                                            disabled={isPending || !!permanent}
                                            className={
                                              !isCurrentWeek && WEEKLY_KEYS.has(key)
                                                ? "!rounded-full !border-stroke-warning-weak !bg-bg-warning-weak !text-fg-warning"
                                                : "!rounded-full !border-stroke-positive-weak !bg-bg-positive-weak !text-fg-positive"
                                            }
                                          />
                                          {!isCurrentWeek && WEEKLY_KEYS.has(key) && (
                                            <span className="t2-medium text-fg-warning">지난주</span>
                                          )}
                                          {!permanent && (
                                            <IconAction
                                              aria-label={`${label} 취소`}
                                              title="취소"
                                              danger
                                              onClick={() => saveCheckDate(student.id, key, null)}
                                              disabled={isPending}
                                            >
                                              <X />
                                            </IconAction>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="inline-flex items-center gap-x1">
                                          <CellButton
                                            onClick={() => saveCheckDate(student.id, key, todayISO)}
                                            disabled={isPending}
                                          >
                                            {isPending ? "…" : "오늘"}
                                          </CellButton>
                                          <DatePicker
                                            value={null}
                                            onChange={(d) => { if (d) saveCheckDate(student.id, key, d); }}
                                            disabled={isPending}
                                            compact
                                            className="size-7 rounded-r2 border-stroke-neutral-weak bg-bg-layer-default text-fg-neutral-subtle hover:bg-bg-layer-default-pressed"
                                          />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {/* 요청/전달 */}
                              <div className="max-h-56 w-full shrink-0 overflow-y-auto rounded-r3 bg-bg-layer-default px-x3 py-x3 sm:w-72">
                                <CommunicationPanel
                                  studentId={student.id}
                                  initialItems={student.communications}
                                  compact
                                />
                              </div>

                              {/* 오른쪽: 당일 변동 + 추후 변동 예정 */}
                              <div className="flex min-w-0 flex-1 basis-[320px] flex-col gap-x2">
                                {(
                                  [
                                    { key: "dailyNote", label: "당일 변동 (00시 자동 초기화)", ph: "오늘 학원 때문에 늦어요 등 당일 변동사항", af: focus === "dailyNote" },
                                    { key: "changeNote", label: "추후 변동 예정", ph: "추후 변동 예정", af: focus === "changeNote" },
                                  ] as { key: keyof StudentTextField; label: string; ph: string; af: boolean }[]
                                ).map(({ key, label, ph, af }) => (
                                  <label
                                    key={key}
                                    className={cn(
                                      "flex flex-1 flex-col gap-x1 rounded-r3 bg-bg-layer-default px-x3 py-x2 transition-shadow",
                                      af && "shadow-[inset_0_0_0_2px_var(--seed-color-stroke-brand-solid)]",
                                    )}
                                  >
                                    <span className={cn("t2-medium", af ? "text-fg-brand" : "text-fg-neutral-subtle")}>{label}</span>
                                    <Textarea
                                      value={localStudentFields.get(student.id)?.[key] ?? ""}
                                      onChange={(e) => setLocalStudentFields((prev) => { const m = new Map(prev); m.set(student.id, { ...(m.get(student.id) ?? { studentInfo: "", changeNote: "", dailyNote: "" }), [key]: e.target.value }); return m; })}
                                      autoFocus={isExpanded && af}
                                      placeholder={ph}
                                      rows={2}
                                      className="min-h-16 flex-1 resize-none t3-regular"
                                    />
                                  </label>
                                ))}
                                <Button
                                  size="sm"
                                  onClick={() => saveStudentFields(student)}
                                  disabled={studentFieldPending === student.id}
                                  className="self-end"
                                >
                                  <Save />{studentFieldPending === student.id ? "저장 중…" : "저장"}
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
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
          className="max-w-xs whitespace-pre-wrap break-words rounded-r2 bg-bg-neutral-inverted px-x3 py-x2 t3-regular text-fg-neutral-inverted shadow-[var(--seed-shadow-s2)]"
        >
          {tooltip.text}
        </div>
      )}

      {/* 일괄 초기화 확인 */}
      <Dialog open={!!resetTarget} onOpenChange={(open) => { if (!open && !resetPending) setResetTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{resetTarget ? RESET_LABEL[resetTarget] : ""} 체크를 초기화할까요?</DialogTitle>
            <DialogDescription>모든 원생의 {resetTarget ? RESET_LABEL[resetTarget] : ""} 체크가 지워져요. 되돌릴 수 없어요.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)} disabled={resetPending}>
              취소
            </Button>
            <Button variant="destructive" onClick={() => resetTarget && runReset(resetTarget)} disabled={resetPending}>
              {resetPending ? "초기화 중…" : "초기화"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 미입실 사유 모달 */}
      <Dialog
        open={!!notifiedAbsentId}
        onOpenChange={(open) => { if (!open) setNotifiedAbsentId(null); }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {students.find((s) => s.id === notifiedAbsentId)?.name} 미입실 처리
            </DialogTitle>
            <DialogDescription>사유를 남기면 미입실(사전 연락)로 기록돼요.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={notifiedAbsentReason}
            onChange={(e) => setNotifiedAbsentReason(e.target.value)}
            placeholder="미입실 사유를 입력하세요 (예: 학교 시험, 병원 등)"
            rows={3}
            aria-label="미입실 사유"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotifiedAbsentId(null)}>
              취소
            </Button>
            <Button
              disabled={isPending || !notifiedAbsentReason.trim()}
              onClick={() => {
                if (!notifiedAbsentId) return;
                startTransition(async () => {
                  try {
                    await saveAttendanceRecord({
                      studentId: notifiedAbsentId,
                      date: todayDate,
                      type: "NOTIFIED_ABSENT",
                      notes: notifiedAbsentReason.trim(),
                    });
                    setLocalTimes((prev) => {
                      const m = new Map(prev);
                      m.set(notifiedAbsentId, { checkIn: "", checkOut: "", type: "NOTIFIED_ABSENT" });
                      return m;
                    });
                    toast.success("미입실 처리되었습니다");
                    setNotifiedAbsentId(null);
                  } catch {
                    toast.error("저장 실패");
                  }
                });
              }}
            >
              {isPending ? "저장 중…" : "미입실 처리"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 특이사항 모달 — 하단 슬라이드업 */}
      {infoModalId && (() => {
        const infoStudent = students.find((s) => s.id === infoModalId);
        if (!infoStudent) return null;
        return (
          <div className="fixed inset-0 z-50" onClick={() => setInfoModalId(null)}>
            <div className="absolute inset-0 bg-bg-overlay animate-in fade-in duration-150" />
            <div
              role="dialog"
              aria-label={`${infoStudent.name} 특이사항`}
              className="absolute inset-x-0 bottom-0 mx-auto max-w-lg rounded-t-r5 bg-bg-layer-floating p-x5 shadow-[var(--seed-shadow-s3)] animate-in slide-in-from-bottom duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-x3 flex items-center justify-between">
                <div className="flex items-center gap-x2">
                  <span className="t6-bold text-fg-neutral">{infoStudent.name}</span>
                  <span className="t4-regular text-fg-neutral-subtle">특이사항</span>
                </div>
                <button
                  type="button"
                  onClick={() => setInfoModalId(null)}
                  aria-label="닫기"
                  className="grid size-9 place-items-center rounded-full text-fg-neutral-muted transition-colors hover:bg-bg-transparent-pressed"
                >
                  <X className="size-5" />
                </button>
              </div>
              <Textarea
                autoFocus
                value={infoModalText}
                onChange={(e) => setInfoModalText(e.target.value)}
                placeholder="학생 특이사항, 성향, 주의사항 등..."
                rows={4}
                aria-label="특이사항"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    startTransition(async () => {
                      try {
                        await patchStudentTextFields(infoModalId, { studentInfo: infoModalText });
                        toast.success("저장됨");
                        setInfoModalId(null);
                      } catch { toast.error("저장 실패"); }
                    });
                  }
                }}
              />
              <div className="mt-x3 flex items-center justify-between gap-x3">
                <span className="t3-regular text-fg-neutral-subtle">⌘+Enter로 저장</span>
                <Button
                  onClick={() => {
                    startTransition(async () => {
                      try {
                        await patchStudentTextFields(infoModalId, { studentInfo: infoModalText });
                        toast.success("저장됨");
                        setInfoModalId(null);
                      } catch { toast.error("저장 실패"); }
                    });
                  }}
                  disabled={isPending}
                >
                  {isPending ? "저장 중…" : "저장"}
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 하단 액션 바 — 시간 입력 포커스 시 표시 */}
      {activeTimeInput && (() => {
        const s = students.find((s) => s.id === activeTimeInput.studentId);
        if (!s) return null;
        const f = activeTimeInput.field;
        const fieldLabels = { checkIn: "입실", checkOut: "퇴실", outing: "외출", return: "복귀" } as const;
        const lo = localOutings.get(s.id) ?? [];
        const hasActiveOuting = lo.some((o) => o.outStart && !o.outEnd);
        const deleteCls = "text-fg-critical";

        return (
          <div className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center border-t border-stroke-neutral-muted bg-bg-layer-floating px-x4 py-x3 shadow-[var(--seed-shadow-s3)] animate-in slide-in-from-bottom-2 duration-150">
            <div className="flex flex-wrap items-center justify-center gap-x2">
              <span className="mr-x1 t4-medium text-fg-neutral">
                {activeTimeInput.studentName}
                <span className="text-fg-neutral-subtle"> · {fieldLabels[f]}</span>
              </span>

              {/* 입실 */}
              {f === "checkIn" && (
                <>
                  <Button
                    onMouseDown={(e) => { e.preventDefault(); quickSaveField(s, "checkIn", nowHHMM()); setActiveTimeInput(null); }}
                  ><LogIn />입실 지금 <span className="tabular-nums">({nowHHMM()})</span></Button>
                  {(localTimes.get(s.id)?.checkIn ?? "") && (
                    <Button
                      variant="soft"
                      className={deleteCls}
                      onMouseDown={(e) => { e.preventDefault(); clearField(s, "checkIn"); setActiveTimeInput(null); }}
                    ><Trash2 />삭제</Button>
                  )}
                  {!(localTimes.get(s.id)?.checkIn) && s.schedules.length > 0 && (
                    <Button
                      variant="outline"
                      onMouseDown={(e) => { e.preventDefault(); setNotifiedAbsentId(s.id); setNotifiedAbsentReason(""); setActiveTimeInput(null); }}
                    >미입실 처리</Button>
                  )}
                </>
              )}

              {/* 퇴실 */}
              {f === "checkOut" && (
                <>
                  <Button
                    onMouseDown={(e) => { e.preventDefault(); quickSaveField(s, "checkOut", nowHHMM()); setActiveTimeInput(null); }}
                  ><LogOut />퇴실 지금 <span className="tabular-nums">({nowHHMM()})</span></Button>
                  {(localTimes.get(s.id)?.checkOut ?? "") && (
                    <Button
                      variant="soft"
                      className={deleteCls}
                      onMouseDown={(e) => { e.preventDefault(); clearField(s, "checkOut"); setActiveTimeInput(null); }}
                    ><Trash2 />삭제</Button>
                  )}
                </>
              )}

              {/* 외출 */}
              {f === "outing" && (
                <>
                  {!hasActiveOuting && lo.length === 0 && (localTimes.get(s.id)?.checkIn ?? "") && (
                    <Button
                      onMouseDown={(e) => { e.preventDefault(); quickStartOuting(s); setActiveTimeInput(null); }}
                    ><ArrowRightLeft />외출 시작 <span className="tabular-nums">({nowHHMM()})</span></Button>
                  )}
                  {(hasActiveOuting || lo.length > 0) && (
                    <span className="t3-regular text-fg-neutral-subtle">시간을 직접 수정할 수 있습니다</span>
                  )}
                  {lo.length > 0 && (
                    <Button
                      variant="soft"
                      className={deleteCls}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const last = lo[lo.length - 1];
                        if (last?.id) {
                          deleteDailyOuting(last.id);
                          setLocalOutings((prev) => {
                            const m = new Map(prev);
                            m.set(s.id, (m.get(s.id) ?? []).filter((o) => o.id !== last.id));
                            return m;
                          });
                          toast.success("외출 기록 삭제됨");
                        }
                        setActiveTimeInput(null);
                      }}
                    ><Trash2 />외출 삭제</Button>
                  )}
                  {!(localTimes.get(s.id)?.checkIn ?? "") && lo.length === 0 && (
                    <span className="t3-regular text-fg-neutral-subtle">입실 기록 후 외출 가능</span>
                  )}
                </>
              )}

              {/* 복귀 */}
              {f === "return" && (
                <>
                  {hasActiveOuting && (
                    <Button
                      onMouseDown={(e) => { e.preventDefault(); quickEndOuting(s); setActiveTimeInput(null); }}
                    ><LogIn />복귀 완료 <span className="tabular-nums">({nowHHMM()})</span></Button>
                  )}
                  {!hasActiveOuting && lo.length > 0 && (
                    <>
                      <span className="t3-regular text-fg-neutral-subtle">시간을 직접 수정할 수 있습니다</span>
                      <Button
                        variant="soft"
                        className={deleteCls}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          const last = lo[lo.length - 1];
                          if (last?.id) {
                            updateDailyOuting(last.id, { date: todayDate, outEnd: undefined });
                            setLocalOutings((prev) => {
                              const m = new Map(prev);
                              m.set(s.id, (m.get(s.id) ?? []).map((o) =>
                                o.id === last.id ? { ...o, outEnd: null } : o
                              ));
                              return m;
                            });
                            toast.success("복귀 기록 삭제됨");
                          }
                          setActiveTimeInput(null);
                        }}
                      ><Trash2 />복귀 삭제</Button>
                    </>
                  )}
                  {!hasActiveOuting && lo.length === 0 && (
                    <span className="t3-regular text-fg-neutral-subtle">외출 기록이 없습니다</span>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* 오버레이 패널 — 원생 상세 */}
      <aside
        aria-label="원생 상세"
        aria-hidden={!selected}
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-stroke-neutral-muted bg-bg-layer-floating transition-transform duration-200 sm:w-[460px]",
          selected ? "translate-x-0 shadow-[var(--seed-shadow-s3)]" : "translate-x-full"
        )}
      >
        {selected && (
          <>
            {/* 헤더 */}
            <div className="flex shrink-0 items-center justify-between gap-x3 border-b border-stroke-neutral-muted px-x5 py-x4">
              <div className="flex min-w-0 items-center gap-x3">
                <Avatar name={selected.name} size={40} />
                <div className="min-w-0">
                  <div className="flex items-center gap-x2">
                    <p className="truncate t6-bold text-fg-neutral">{selected.name}</p>
                    <AttendanceStateBadge state={getState(selected)} label={getStateLabel(getState(selected))} />
                  </div>
                  <p className="truncate t3-regular text-fg-neutral-subtle">
                    {[selected.school, selected.grade, selected.seat ? `${selected.seat}번 좌석` : ""].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="상세 닫기"
                className="grid size-9 shrink-0 place-items-center rounded-full text-fg-neutral-muted transition-colors hover:bg-bg-transparent-pressed"
              >
                <X className="size-5" />
              </button>
            </div>

            <Tabs value={panelTab} onValueChange={(v) => setPanelTab(v as PanelTab)} className="flex min-h-0 flex-1 flex-col">
              {/* 탭 */}
              <TabsList className="shrink-0 px-x3">
                {TABS.map((tab) => (
                  <TabsTrigger key={tab.key} value={tab.key} className="px-x2 t4-bold">
                    {tab.label}
                    {tab.badge ? <CountBadge count={tab.badge} /> : null}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* 탭 내용 */}
              <div className="flex-1 overflow-y-auto px-x5 py-x5">
              {panelTab === "attendance" && (() => {
                const schedIn = selected.schedules[0]?.startTime;
                const schedOut = selected.schedules[0]?.endTime;
                const outSch = selected.outings[0];
                const panelLocalOut = localOutings.get(selected.id) ?? [];
                const isLate = !!(editValues.checkIn && schedIn && schedIn !== "FLEXIBLE" && toMinutes(editValues.checkIn) >= toMinutes(schedIn) + 5);
                // 조퇴는 수동 설정만 가능 (자동 판별 제거)
                const mergedOutings = panelLocalOut
                  .filter((lo): lo is { id: string; outStart: Date | null; outEnd: Date | null } => lo.id !== null)
                  .map((lo) => {
                    const original = selected.dailyOutings.find((d) => d.id === lo.id);
                    return { id: lo.id, outStart: lo.outStart, outEnd: lo.outEnd, reason: original?.reason ?? null };
                  });

                return (
                  <div className="flex flex-col gap-x5">
                    {/* 출결 상태 */}
                    <div className="flex items-center justify-between gap-x3 border-b border-stroke-neutral-muted pb-x4">
                      <label htmlFor="att-panel-type" className="t4-medium text-fg-neutral-muted">출결 상태</label>
                      <select
                        id="att-panel-type"
                        value={editValues.type}
                        onChange={(e) => setEditValues((v) => ({ ...v, type: e.target.value as AttendanceType }))}
                        className={cn(inputBaseClass, "h-10 w-auto min-w-32")}
                      >
                        {TYPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* 타임라인 로그 */}
                    <ol className="relative flex flex-col gap-x4 pl-x14">
                      {/* 수직선 */}
                      <span aria-hidden className="absolute bottom-5 left-5 top-5 w-px bg-stroke-neutral-muted" />

                      {/* ── 입실 ── */}
                      <li className="relative">
                        <span aria-hidden className={cn("absolute -left-14 top-x2 grid size-x10 place-items-center rounded-full", TONE_SOFT[ACTIVITY_TONE.checkIn])}>
                          <LogIn className="size-5" />
                        </span>
                        <div className="flex flex-col gap-x3 rounded-r3 border border-stroke-neutral-muted bg-bg-layer-default p-x4">
                          <div className="flex items-center justify-between gap-x2">
                            <div className="flex items-center gap-x2">
                              <span className="t5-bold text-fg-neutral">입실</span>
                              {isLate && <AttendanceStateBadge state="TARDY" />}
                            </div>
                            {schedIn && (
                              <span className="t3-regular tabular-nums text-fg-neutral-subtle">
                                예정 {schedIn === "FLEXIBLE" ? "자율(미정)" : schedIn}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-x2">
                            <TimePickerInput
                              value={editValues.checkIn}
                              onChange={(v) => {
                                const newType = calcAutoType(v, editValues.checkOut, schedIn, schedOut, editValues.type);
                                setEditValues((prev) => ({ ...prev, checkIn: v, type: newType }));
                                setLocalTimes((prev) => { const m = new Map(prev); const c = m.get(selected.id) ?? { checkIn: "", checkOut: "", type: "NORMAL" as AttendanceType }; m.set(selected.id, { ...c, checkIn: v, type: newType }); return m; });
                              }}
                              className={cn(TIME_INPUT, "h-10 w-28 t5-bold")}
                            />
                            <Button
                              variant="soft"
                              size="sm"
                              onClick={() => {
                                const t = nowHHMM();
                                const newType = calcAutoType(t, editValues.checkOut, schedIn, schedOut, editValues.type);
                                setEditValues((v) => ({ ...v, checkIn: t, type: newType }));
                                setLocalTimes((prev) => { const m = new Map(prev); const c = m.get(selected.id) ?? { checkIn: "", checkOut: "", type: "NORMAL" as AttendanceType }; m.set(selected.id, { ...c, checkIn: t, type: newType }); return m; });
                              }}
                            >
                              지금
                            </Button>
                            {editValues.checkIn && (
                              <IconAction
                                danger
                                aria-label="입실 기록 삭제"
                                title="입실 기록 삭제"
                                className="size-9 [&_svg]:size-4"
                                onClick={() => {
                                  setEditValues((v) => ({ ...v, checkIn: "", type: "NORMAL" as AttendanceType }));
                                  setLocalTimes((prev) => { const m = new Map(prev); const c = m.get(selected.id) ?? { checkIn: "", checkOut: "", type: "NORMAL" as AttendanceType }; m.set(selected.id, { ...c, checkIn: "", type: "NORMAL" as AttendanceType }); return m; });
                                }}
                              >
                                <Trash2 />
                              </IconAction>
                            )}
                          </div>
                        </div>
                      </li>

                      {/* ── 외출 / 복귀 ── */}
                      <li className="relative">
                        <span aria-hidden className={cn("absolute -left-14 top-x2 grid size-x10 place-items-center rounded-full", TONE_SOFT[ACTIVITY_TONE.outing])}>
                          <ArrowRightLeft className="size-5" />
                        </span>
                        <div className="overflow-hidden rounded-r3 border border-stroke-neutral-muted bg-bg-layer-default">
                          <div className="flex items-center justify-between gap-x2 border-b border-stroke-neutral-muted px-x4 py-x3">
                            <span className="t5-bold text-fg-neutral">외출 / 복귀</span>
                            {outSch && (
                              <span className="t3-regular tabular-nums text-fg-neutral-subtle">예정 {outSch.outStart} ~ {outSch.outEnd}</span>
                            )}
                          </div>
                          <div className="p-x3">
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
                      </li>

                      {/* ── 퇴실 ── */}
                      <li className="relative">
                        <span aria-hidden className={cn("absolute -left-14 top-x2 grid size-x10 place-items-center rounded-full", TONE_SOFT[ACTIVITY_TONE.checkOut])}>
                          <LogOut className="size-5" />
                        </span>
                        <div className="flex flex-col gap-x3 rounded-r3 border border-stroke-neutral-muted bg-bg-layer-default p-x4">
                          <div className="flex items-center justify-between gap-x2">
                            <span className="t5-bold text-fg-neutral">퇴실</span>
                            {schedOut && (
                              <span className="t3-regular tabular-nums text-fg-neutral-subtle">예정 {schedOut}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-x2">
                            <TimePickerInput
                              value={editValues.checkOut}
                              onChange={(v) => {
                                const newType = calcAutoType(editValues.checkIn, v, schedIn, schedOut, editValues.type);
                                setEditValues((prev) => ({ ...prev, checkOut: v, type: newType }));
                                setLocalTimes((prev) => { const m = new Map(prev); const c = m.get(selected.id) ?? { checkIn: "", checkOut: "", type: "NORMAL" as AttendanceType }; m.set(selected.id, { ...c, checkOut: v, type: newType }); return m; });
                              }}
                              className={cn(TIME_INPUT, "h-10 w-28 t5-bold")}
                            />
                            <Button
                              variant="soft"
                              size="sm"
                              onClick={() => {
                                const t = nowHHMM();
                                const newType = calcAutoType(editValues.checkIn, t, schedIn, schedOut, editValues.type);
                                setEditValues((v) => ({ ...v, checkOut: t, type: newType }));
                                setLocalTimes((prev) => { const m = new Map(prev); const c = m.get(selected.id) ?? { checkIn: "", checkOut: "", type: "NORMAL" as AttendanceType }; m.set(selected.id, { ...c, checkOut: t, type: newType }); return m; });
                              }}
                            >
                              지금
                            </Button>
                            {editValues.checkOut && (
                              <IconAction
                                danger
                                aria-label="퇴실 기록 삭제"
                                title="퇴실 기록 삭제"
                                className="size-9 [&_svg]:size-4"
                                onClick={() => {
                                  setEditValues((v) => ({ ...v, checkOut: "" }));
                                  setLocalTimes((prev) => { const m = new Map(prev); const c = m.get(selected.id) ?? { checkIn: "", checkOut: "", type: "NORMAL" as AttendanceType }; m.set(selected.id, { ...c, checkOut: "" }); return m; });
                                }}
                              >
                                <Trash2 />
                              </IconAction>
                            )}
                          </div>
                        </div>
                      </li>
                    </ol>

                    {/* 비고 */}
                    <FormField label="비고" htmlFor="att-panel-notes">
                      <Input
                        id="att-panel-notes"
                        type="text"
                        value={editValues.notes}
                        onChange={(e) => setEditValues((v) => ({ ...v, notes: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); }}
                        placeholder="특이사항 메모"
                      />
                    </FormField>

                    <Button size="lg" onClick={saveEdit} disabled={isPending} className="w-full">
                      {isPending ? "저장 중…" : "저장"}
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
            </Tabs>
          </>
        )}
      </aside>
    </>
  );
}

/** 표 위 검색 — backoffice SearchField 모양 + 지우기 버튼 */
function TableSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex h-10 w-full min-w-0 items-center gap-x2 rounded-r2 bg-bg-neutral-weak px-x3 transition-shadow focus-within:bg-bg-layer-default focus-within:shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-contrast)] sm:w-72">
      <Search className="size-4 shrink-0 text-fg-neutral-subtle" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="원생 검색"
        className="h-full min-w-0 flex-1 bg-transparent t4-regular text-fg-neutral outline-none placeholder:text-fg-placeholder [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="검색어 지우기"
          className="grid size-6 shrink-0 place-items-center rounded-full text-fg-neutral-subtle transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral"
        >
          <X className="size-4" />
        </button>
      )}
    </label>
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

  const cellInput = cn(TIME_INPUT, "w-[4.75rem]");

  return (
    <div className="flex flex-col gap-x2">
      <div className="flex items-center justify-between">
        <p className="t4-medium text-fg-neutral-muted">오늘 외출</p>
        <Button variant="ghost" size="xs" onClick={addRow}>
          <Plus /> 추가
        </Button>
      </div>

      {numRows === 0 ? (
        <p className="rounded-r2 bg-bg-layer-fill py-x4 text-center t3-regular text-fg-neutral-subtle">
          오늘 외출 기록이 없어요
        </p>
      ) : (
        <div className="overflow-x-auto rounded-r2 border border-stroke-neutral-muted">
          <table className="w-full border-collapse t3-regular">
            <thead>
              <tr className="bg-bg-layer-fill">
                <th className="w-5 px-x2 py-x1_5 text-center t2-medium text-fg-neutral-subtle">#</th>
                <th className="px-x2 py-x1_5 text-center t2-medium text-fg-neutral-subtle">예정 외출</th>
                <th className="px-x2 py-x1_5 text-center t2-medium text-fg-neutral-subtle">예정 복귀</th>
                <th className="px-x2 py-x1_5 text-center t2-medium text-fg-neutral-subtle">실제 외출</th>
                <th className="px-x2 py-x1_5 text-center t2-medium text-fg-neutral-subtle">실제 복귀</th>
                <th className="w-10"><span className="sr-only">동작</span></th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: numRows }, (_, i) => {
                const sched = scheduledOutings[i];
                const row = rows[i];
                return (
                  <Fragment key={i}>
                    <tr className="border-t border-stroke-neutral-muted">
                      <td className="px-x2 py-x2 text-center tabular-nums text-fg-neutral-subtle">{i + 1}</td>
                      <td className="px-x2 py-x2 text-center tabular-nums text-fg-neutral-muted">
                        {sched?.outStart ?? <span className="text-fg-placeholder">—</span>}
                      </td>
                      <td className="px-x2 py-x2 text-center tabular-nums text-fg-neutral-muted">
                        {sched?.outEnd ?? <span className="text-fg-placeholder">—</span>}
                      </td>
                      {/* 실제 외출 */}
                      <td className="px-x1 py-x1">
                        {row ? (
                          <div className="flex items-center gap-x0_5">
                            <TimePickerInput
                              value={row.outStart}
                              onChange={(v) => updateRow(i, { outStart: v })}
                              size="sm"
                              className={cellInput}
                            />
                            <CellButton tone="informative" onClick={() => updateRow(i, { outStart: nowHHMM() })} className="h-7 px-x2 t2-medium">
                              지금
                            </CellButton>
                          </div>
                        ) : (
                          <span className="px-x2 text-fg-placeholder">—</span>
                        )}
                      </td>
                      {/* 실제 복귀 */}
                      <td className="px-x1 py-x1">
                        {row ? (
                          <div className="flex items-center gap-x0_5">
                            <TimePickerInput
                              value={row.outEnd}
                              onChange={(v) => updateRow(i, { outEnd: v })}
                              size="sm"
                              className={cellInput}
                            />
                            <CellButton tone="informative" onClick={() => updateRow(i, { outEnd: nowHHMM() })} className="h-7 px-x2 t2-medium">
                              지금
                            </CellButton>
                          </div>
                        ) : (
                          <span className="px-x2 text-fg-placeholder">—</span>
                        )}
                      </td>
                      {/* actions */}
                      <td className="px-x1 py-x1">
                        {row && (
                          <div className="flex items-center justify-center gap-x1">
                            {row.dirty && (
                              <IconAction
                                aria-label="저장"
                                title="저장"
                                onClick={() => saveRow(i)}
                                disabled={isPending}
                                className="text-fg-brand hover:text-fg-brand"
                              >
                                <Check />
                              </IconAction>
                            )}
                            {deleteConfirmIdx === i ? (
                              <>
                                <CellButton
                                  onClick={() => { deleteRow(i); setDeleteConfirmIdx(null); }}
                                  disabled={isPending}
                                  className="bg-bg-critical-solid text-palette-static-white shadow-none hover:bg-bg-critical-solid-pressed"
                                >
                                  삭제
                                </CellButton>
                                <CellButton onClick={() => setDeleteConfirmIdx(null)}>
                                  취소
                                </CellButton>
                              </>
                            ) : (
                              <IconAction
                                danger
                                aria-label="외출 기록 삭제"
                                title="삭제"
                                onClick={() => setDeleteConfirmIdx(i)}
                                disabled={isPending}
                              >
                                <Trash2 />
                              </IconAction>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                    {/* 사유 행 */}
                    {row && (
                      <tr>
                        <td colSpan={6} className="px-x2 pb-x2 pt-0">
                          <input
                            type="text"
                            placeholder="사유 (예: 수학학원)"
                            value={row.reason}
                            onChange={(e) => updateRow(i, { reason: e.target.value })}
                            aria-label="외출 사유"
                            className={cn(inputBaseClass, "h-8 px-x2 t3-regular")}
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
    <div className="flex flex-col gap-x5">
      {/* 상점 / 벌점 토글 */}
      <Segmented
        aria-label="상점 또는 벌점"
        options={[
          { value: "MERIT", label: "상점" },
          { value: "DEMERIT", label: "벌점" },
        ]}
        value={type}
        onChange={setType}
      />

      {/* 점수 */}
      <FormField label="점수" htmlFor="merit-points">
        <div className="flex flex-wrap items-center gap-x2">
          <Input
            id="merit-points"
            type="number"
            min={1}
            max={100}
            value={points}
            onChange={(e) => setPoints(Math.max(1, Math.min(100, Number(e.target.value))))}
            className="w-20 text-center tabular-nums"
          />
          {QUICK_POINTS.map((p) => (
            <FilterChip key={p} selected={points === p} onClick={() => setPoints(p)} className="h-9 min-w-10 justify-center tabular-nums">
              {p}
            </FilterChip>
          ))}
        </div>
      </FormField>

      {/* 카테고리 */}
      <FormField label="카테고리 (선택)" htmlFor="merit-category">
        <select
          id="merit-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={cn(inputBaseClass, "h-10")}
        >
          <option value="">카테고리 없음</option>
          {MERIT_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </FormField>

      {/* 사유 */}
      <FormField label="사유" required htmlFor="merit-reason">
        <Input
          id="merit-reason"
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          placeholder="사유를 입력하세요"
        />
      </FormField>

      <Button
        size="lg"
        variant={type === "MERIT" ? "default" : "destructive"}
        onClick={handleSubmit}
        disabled={isPending || !reason.trim()}
        className="w-full"
      >
        {isPending ? "저장 중…" : `${type === "MERIT" ? "상점" : "벌점"} ${points}점 부여`}
      </Button>

      {lastSaved && (
        <div className="flex flex-col gap-x3 rounded-r3 bg-bg-positive-weak p-x4">
          <p className="flex items-center gap-x1_5 t4-bold text-fg-positive">
            <Check className="size-4" aria-hidden />
            {lastSaved.type === "MERIT" ? "상점" : "벌점"} {lastSaved.points}점 부여 완료
          </p>
          <KakaoButton className="w-full" onClick={handleShare}>
            카카오톡으로 학부모에게 알리기
          </KakaoButton>
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
    <div className="flex flex-col gap-x4">
      <p className="t4-regular text-fg-neutral-muted">
        공부 계획 이미지를 올리면 학부모에게 카카오톡으로 보낼 수 있어요.
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
        className="flex w-full flex-col items-center justify-center gap-x1_5 rounded-r3 border border-dashed border-stroke-neutral-weak py-x6 t4-medium text-fg-neutral-muted transition-colors hover:bg-bg-layer-default-pressed hover:text-fg-neutral"
      >
        <ImagePlus className="size-5" aria-hidden />
        이미지 선택 (여러 장 가능)
      </button>

      {imageItems.length > 0 && (
        <div className="grid grid-cols-3 gap-x2">
          {imageItems.map((item, idx) => (
            <div key={idx} className="relative aspect-square overflow-hidden rounded-r3 border border-stroke-neutral-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(idx)}
                aria-label="이미지 빼기"
                className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-bg-overlay text-palette-static-white"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <KakaoButton
        size="lg"
        onClick={handleShare}
        disabled={isUploading || imageItems.length === 0}
        className="w-full"
      >
        {isUploading ? "업로드 중…" : "카카오톡으로 보내기"}
      </KakaoButton>
    </div>
  );
}
