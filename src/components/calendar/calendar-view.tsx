"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from "@/actions/calendar";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "seed-design/ui/switch";
import { cn } from "@/lib/utils";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, X, RefreshCw } from "lucide-react";
import type { CalendarEvent, CalendarEventType } from "@/generated/prisma";
import type { GoogleCalendarEvent } from "@/actions/google-calendar";
import { updateGoogleCalendarEvent, deleteGoogleCalendarEvent, fetchGoogleCalendarEventsForMonth } from "@/actions/google-calendar";
import { EmptyState, FilterChip, FormActions, FormField, Section, Segmented, StatusBadge } from "@/components/backoffice/ui";
import { ConfirmDialog } from "./confirm-dialog";
import { EVENT_COLOR_OPTIONS, eventTone, eventToneByKey, normalizeEventColor, weekdayTextClass } from "./event-tones";

type EventWithStudent = CalendarEvent & {
  student: { id: string; name: string } | null;
};

interface Props {
  initialEvents: EventWithStudent[];
  schools?: string[];
  students?: { id: string; name: string; grade: string }[];
  googleEvents?: GoogleCalendarEvent[];
  googleCalendarConfigured?: boolean;
}

const EVENT_TYPE_CONFIG: Record<CalendarEventType, { label: string }> = {
  SCHOOL_EXAM:  { label: "학교 시험" },
  SCHOOL_EVENT: { label: "학교 행사" },
  PERSONAL:     { label: "개인 일정" },
  PLATFORM:     { label: "플랫폼" },
};

const DEFAULT_COLOR = "blue";

function getEventStyle(event: EventWithStudent) {
  return eventTone(event.color, DEFAULT_COLOR);
}

/** 원형 아이콘 버튼 (이전·다음·닫기 등) */
function IconButton({
  label,
  onClick,
  children,
  className,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        "grid size-x8 shrink-0 place-items-center rounded-full text-fg-neutral-muted transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral disabled:text-fg-disabled",
        className
      )}
    >
      {children}
    </button>
  );
}

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

// 주의 월요일 기준 시작일 계산
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=일
  const diff = day === 0 ? -6 : 1 - day; // 월요일 기준
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toDateStr(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function CalendarView({ initialEvents, schools = [], students = [], googleEvents = [], googleCalendarConfigured = false }: Props) {
  const today = new Date();
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(today));
  const [events, setEvents] = useState<EventWithStudent[]>(initialEvents);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<CalendarEventType | "ALL">("ALL");
  const [filterSchool, setFilterSchool] = useState<string>("ALL");
  const [filterStudent, setFilterStudent] = useState<string>("ALL");
  const [isPending, startTransition] = useTransition();
  const [showGoogleEvents, setShowGoogleEvents] = useState(googleCalendarConfigured);
  const [removedGoogleIds, setRemovedGoogleIds] = useState<Set<string>>(new Set());
  const [googleEventOverrides, setGoogleEventOverrides] = useState<Record<string, { title: string; description: string | null; startDate: Date; endDate: Date | null; allDay: boolean }>>({});
  // 동적으로 추가 로드된 Google 이벤트 (초기 prop 범위 밖 이동 시)
  const [extraGoogleEvents, setExtraGoogleEvents] = useState<GoogleCalendarEvent[]>([]);
  const [loadedMonths, setLoadedMonths] = useState<Set<string>>(() => {
    const loaded = new Set<string>();
    const now = new Date();
    for (let i = -6; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      loaded.add(`${d.getFullYear()}-${d.getMonth()}`);
    }
    return loaded;
  });

  // Google Calendar 이벤트를 로컬 EventWithStudent 형태로 변환
  function googleToDisplayEvent(e: GoogleCalendarEvent): EventWithStudent {
    const ov = googleEventOverrides[e.googleEventId];
    return {
      id: `g_${e.googleEventId}`,
      title: ov?.title ?? e.title,
      description: ov !== undefined ? ov.description : (e.description ?? null),
      startDate: ov?.startDate ?? new Date(e.startDate),
      endDate: ov !== undefined ? ov.endDate : (e.endDate ? new Date(e.endDate) : null),
      allDay: ov?.allDay ?? e.allDay,
      type: "PLATFORM" as CalendarEventType,
      studentId: null,
      student: null,
      schoolName: null,
      color: "google",
      googleEventId: e.googleEventId,
      createdById: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  const [form, setForm] = useState({
    title: "",
    description: "",
    startDate: "",
    endDate: "",
    type: "SCHOOL_EXAM" as CalendarEventType,
    schoolName: "",
    studentId: "",
    allDay: true,
    color: DEFAULT_COLOR,
    syncToGoogle: googleCalendarConfigured,
  });

  // ── 월간 뷰 계산 ──
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  function dateStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const allGoogleEvents = [...googleEvents, ...extraGoogleEvents.filter(e => !googleEvents.some(g => g.googleEventId === e.googleEventId))];

  function eventsOnDay(day: number) {
    const ds = dateStr(day);
    const local = events.filter((e) => {
      const start = new Date(e.startDate).toISOString().split("T")[0];
      const end = e.endDate ? new Date(e.endDate).toISOString().split("T")[0] : start;
      const typeOk = filterType === "ALL" || e.type === filterType;
      const schoolOk = filterSchool === "ALL" || e.schoolName === filterSchool;
      const studentOk = filterStudent === "ALL" || e.studentId === filterStudent || e.type !== "PERSONAL";
      return ds >= start && ds <= end && typeOk && schoolOk && studentOk;
    });
    const goog = showGoogleEvents ? allGoogleEvents.filter((e) => {
      const end = e.endDate ?? e.startDate;
      return ds >= e.startDate && ds <= end && !removedGoogleIds.has(e.googleEventId);
    }).map(googleToDisplayEvent) : [];
    return [...local, ...goog];
  }

  // ── 주간 뷰 계산 ──
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // 이번 주에 해당하는 이벤트
  const weekStartStr = toDateStr(weekStart);
  const weekEndStr = toDateStr(addDays(weekStart, 6));

  function eventsInWeek() {
    const local = events.filter((e) => {
      const start = new Date(e.startDate).toISOString().split("T")[0];
      const end = e.endDate ? new Date(e.endDate).toISOString().split("T")[0] : start;
      const typeOk = filterType === "ALL" || e.type === filterType;
      const studentOk = filterStudent === "ALL" || e.studentId === filterStudent || e.type !== "PERSONAL";
      return end >= weekStartStr && start <= weekEndStr && typeOk && studentOk;
    });
    const goog = showGoogleEvents ? allGoogleEvents.filter((e) => {
      const end = e.endDate ?? e.startDate;
      return end >= weekStartStr && e.startDate <= weekEndStr && !removedGoogleIds.has(e.googleEventId);
    }).map(googleToDisplayEvent) : [];
    return [...local, ...goog];
  }

  // 학교 행 목록: schools prop + 이벤트에서 추출한 schoolName
  function getWeekSchoolRows() {
    const weekEvts = eventsInWeek();
    const fromEvents = weekEvts
      .map((e) => e.schoolName)
      .filter((s): s is string => !!s);
    const allSchoolSet = new Set([...schools, ...fromEvents]);
    const sorted = Array.from(allSchoolSet).sort();
    return sorted;
  }

  // 특정 학교 × 특정 날의 이벤트
  function eventsForSchoolDay(schoolName: string | null, dayStr: string) {
    return eventsInWeek().filter((e) => {
      const start = new Date(e.startDate).toISOString().split("T")[0];
      const end = e.endDate ? new Date(e.endDate).toISOString().split("T")[0] : start;
      const schoolMatch = schoolName === null
        ? !e.schoolName
        : e.schoolName === schoolName;
      return dayStr >= start && dayStr <= end && schoolMatch;
    });
  }

  const selectedEvents = selectedDate
    ? [
        ...events.filter((e) => {
          const start = new Date(e.startDate).toISOString().split("T")[0];
          const end = e.endDate ? new Date(e.endDate).toISOString().split("T")[0] : start;
          return selectedDate >= start && selectedDate <= end;
        }),
        ...(showGoogleEvents ? allGoogleEvents.filter((e) => {
          const end = e.endDate ?? e.startDate;
          return selectedDate >= e.startDate && selectedDate <= end && !removedGoogleIds.has(e.googleEventId);
        }).map(googleToDisplayEvent) : []),
      ]
    : [];

  function loadMonthIfNeeded(newYear: number, newMonth: number) {
    const key = `${newYear}-${newMonth}`;
    if (googleCalendarConfigured && !loadedMonths.has(key)) {
      fetchGoogleCalendarEventsForMonth(newYear, newMonth).then((events) => {
        setExtraGoogleEvents((prev) => [
          ...prev,
          ...events.filter((e) => !prev.some((p) => p.googleEventId === e.googleEventId)),
        ]);
        setLoadedMonths((prev) => new Set([...prev, key]));
      });
    }
  }

  function prevMonth() {
    const newYear = month === 0 ? year - 1 : year;
    const newMonth = month === 0 ? 11 : month - 1;
    loadMonthIfNeeded(newYear, newMonth);
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    const newYear = month === 11 ? year + 1 : year;
    const newMonth = month === 11 ? 0 : month + 1;
    loadMonthIfNeeded(newYear, newMonth);
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }
  function prevWeek() { setWeekStart((d) => addDays(d, -7)); }
  function nextWeek() { setWeekStart((d) => addDays(d, 7)); }
  function goToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setWeekStart(getWeekStart(today));
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  function handleAdd() {
    if (!form.title || !form.startDate) {
      toast.error("제목과 시작일은 필수입니다");
      return;
    }
    startTransition(async () => {
      try {
        const created = await createCalendarEvent({
          title: form.title,
          description: form.description || undefined,
          startDate: form.startDate,
          endDate: form.endDate || undefined,
          allDay: form.allDay,
          type: form.type,
          schoolName: form.schoolName || undefined,
          studentId: form.studentId || undefined,
          color: form.color,
          syncToGoogle: form.syncToGoogle,
        });
        const linkedStudent = students.find((s) => s.id === form.studentId) ?? null;
        setEvents((prev) => [...prev, { ...created, student: linkedStudent ? { id: linkedStudent.id, name: linkedStudent.name } : null }]);
        setForm({ title: "", description: "", startDate: selectedDate ?? "", endDate: "", type: "SCHOOL_EXAM", schoolName: "", studentId: "", allDay: true, color: DEFAULT_COLOR, syncToGoogle: googleCalendarConfigured });
        closeForm();
        toast.success("일정이 등록되었습니다");
      } catch {
        toast.error("등록 실패");
      }
    });
  }

  function isGoogleEvent(event: EventWithStudent) {
    return event.id.startsWith("g_");
  }

  function handleEdit(event: EventWithStudent) {
    setEditingId(event.id);
    setForm({
      title: event.title,
      description: event.description ?? "",
      startDate: new Date(event.startDate).toISOString().split("T")[0],
      endDate: event.endDate ? new Date(event.endDate).toISOString().split("T")[0] : "",
      type: event.type,
      schoolName: event.schoolName ?? "",
      studentId: event.studentId ?? "",
      allDay: event.allDay,
      color: event.color ?? DEFAULT_COLOR,
      syncToGoogle: false,
    });
    setShowForm(true);
  }

  function handleUpdate() {
    if (!editingId || !form.title || !form.startDate) {
      toast.error("제목과 시작일은 필수입니다");
      return;
    }
    startTransition(async () => {
      try {
        if (editingId.startsWith("g_")) {
          const googleEventId = editingId.slice(2);
          await updateGoogleCalendarEvent(googleEventId, {
            title: form.title,
            description: form.description || undefined,
            startDate: form.startDate,
            endDate: form.endDate || undefined,
            allDay: form.allDay,
          });
          setGoogleEventOverrides((prev) => ({
            ...prev,
            [googleEventId]: {
              title: form.title,
              description: form.description || null,
              startDate: new Date(form.startDate),
              endDate: form.endDate ? new Date(form.endDate) : null,
              allDay: form.allDay,
            },
          }));
        } else {
          await updateCalendarEvent(editingId, {
            title: form.title,
            description: form.description || undefined,
            startDate: form.startDate,
            endDate: form.endDate || undefined,
            type: form.type,
            schoolName: form.schoolName || undefined,
            studentId: form.studentId || null,
            color: form.color,
          });
          const linkedStudent = students.find((s) => s.id === form.studentId) ?? null;
          setEvents((prev) =>
            prev.map((e) =>
              e.id === editingId
                ? { ...e, title: form.title, description: form.description || null, startDate: new Date(form.startDate), endDate: form.endDate ? new Date(form.endDate) : null, type: form.type, schoolName: form.schoolName || null, studentId: form.studentId || null, student: linkedStudent ? { id: linkedStudent.id, name: linkedStudent.name } : null, color: form.color }
                : e
            )
          );
        }
        setForm({ title: "", description: "", startDate: selectedDate ?? "", endDate: "", type: "SCHOOL_EXAM", schoolName: "", studentId: "", allDay: true, color: DEFAULT_COLOR, syncToGoogle: googleCalendarConfigured });
        closeForm();
        toast.success("수정되었습니다");
      } catch {
        toast.error("수정 실패");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        if (id.startsWith("g_")) {
          const googleEventId = id.slice(2);
          await deleteGoogleCalendarEvent(googleEventId);
          setRemovedGoogleIds((prev) => new Set([...prev, googleEventId]));
        } else {
          await deleteCalendarEvent(id);
          setEvents((prev) => prev.filter((e) => e.id !== id));
        }
        toast.success("삭제되었습니다");
      } catch {
        toast.error("삭제 실패");
      }
    });
  }

  const allSchools = Array.from(new Set([
    ...schools,
    ...events.map((e) => e.schoolName).filter(Boolean) as string[],
  ])).sort();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // 주간 뷰 헤더 레이블
  const weekLabel = (() => {
    const s = weekDays[0];
    const e = weekDays[6];
    if (s.getMonth() === e.getMonth()) {
      return `${s.getFullYear()}년 ${s.getMonth() + 1}월 ${s.getDate()}일 – ${e.getDate()}일`;
    }
    return `${s.getFullYear()}년 ${s.getMonth() + 1}월 ${s.getDate()}일 – ${e.getMonth() + 1}월 ${e.getDate()}일`;
  })();

  // ── 이벤트 상세 팝오버 ──
  const [hoveredEvent, setHoveredEvent] = useState<EventWithStudent | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<EventWithStudent | null>(null);

  // 달력 칸 — 마지막 줄을 7칸으로 채워 격자를 닫는다(표시용)
  const monthCells: (number | null)[] = [...cells, ...Array((7 - (cells.length % 7)) % 7).fill(null)];

  const monthEvents = events.filter((e) => {
    const start = new Date(e.startDate);
    return start.getFullYear() === year && start.getMonth() === month;
  });

  function openAddForm(startDate: string, extra?: Partial<typeof form>) {
    setForm((f) => ({ ...f, startDate, ...extra }));
    setEditingId(null);
    setShowForm(true);
  }

  const eventForm = (
    <EventForm
      form={form}
      setForm={setForm}
      editingId={editingId}
      isPending={isPending}
      allSchools={allSchools}
      students={students}
      onSubmit={editingId ? handleUpdate : handleAdd}
      onClose={closeForm}
      googleCalendarConfigured={googleCalendarConfigured}
    />
  );

  return (
    <div className="flex flex-col gap-x4">
      {/* 상단 — 기간 이동 · 보기 전환 · 일정 추가 */}
      <div className="flex flex-wrap items-center justify-between gap-x3">
        <div className="flex min-w-0 items-center gap-x0_5">
          <IconButton label={viewMode === "month" ? "이전 달" : "이전 주"} onClick={viewMode === "month" ? prevMonth : prevWeek}>
            <ChevronLeft className="size-5" aria-hidden />
          </IconButton>
          <IconButton label={viewMode === "month" ? "다음 달" : "다음 주"} onClick={viewMode === "month" ? nextMonth : nextWeek}>
            <ChevronRight className="size-5" aria-hidden />
          </IconButton>
          <h2 className="ml-x1 truncate t7-bold tabular-nums text-fg-neutral">
            {viewMode === "month" ? `${year}년 ${month + 1}월` : weekLabel}
          </h2>
          <Button variant="outline" size="xs" onClick={goToday} className="ml-x2">
            오늘
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-x2">
          <Segmented
            aria-label="보기 전환"
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: "month", label: "월간" },
              { value: "week", label: "학교별 주간" },
            ]}
            className="w-64 whitespace-nowrap"
          />
          <Button
            onClick={() => {
              setForm((f) => ({
                ...f,
                startDate: selectedDate ?? todayStr,
                studentId: filterStudent !== "ALL" ? filterStudent : f.studentId,
                type: filterStudent !== "ALL" ? "PERSONAL" : f.type,
              }));
              setEditingId(null);
              setShowForm(true);
            }}
          >
            <Plus aria-hidden />
            일정 추가
          </Button>
        </div>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-x2">
        <div className="flex flex-wrap items-center gap-x1_5" role="group" aria-label="일정 유형">
          <FilterChip selected={filterType === "ALL"} onClick={() => setFilterType("ALL")}>
            전체
          </FilterChip>
          {(Object.keys(EVENT_TYPE_CONFIG) as CalendarEventType[]).map((t) => (
            <FilterChip key={t} selected={filterType === t} onClick={() => setFilterType(t)}>
              {EVENT_TYPE_CONFIG[t].label}
            </FilterChip>
          ))}
        </div>

        <div className="flex w-full flex-wrap items-center gap-x2 lg:ml-auto lg:w-auto">
          {/* 학교 필터 (월간 뷰에서만) */}
          {viewMode === "month" && allSchools.length > 0 && (
            <Select value={filterSchool} onValueChange={setFilterSchool}>
              <SelectTrigger className="w-40" aria-label="학교 필터">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">모든 학교</SelectItem>
                {allSchools.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {/* 원생 필터 */}
          {students.length > 0 && (
            <Select value={filterStudent} onValueChange={setFilterStudent}>
              <SelectTrigger className="w-44" aria-label="원생 필터">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">모든 원생</SelectItem>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} · {s.grade}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {googleCalendarConfigured && (
            <div className="flex items-center gap-x1">
              <FilterChip selected={showGoogleEvents} onClick={() => setShowGoogleEvents((v) => !v)}>
                Google 일정
              </FilterChip>
              <IconButton
                label="Google Calendar 새로고침"
                onClick={() => {
                  setIsRefreshing(true);
                  router.refresh();
                  setTimeout(() => setIsRefreshing(false), 1000);
                }}
                disabled={isRefreshing}
              >
                <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} aria-hidden />
              </IconButton>
            </div>
          )}
        </div>
      </div>

      {/* ── 월간 뷰 ── */}
      {viewMode === "month" && (
        <div className="grid grid-cols-1 gap-x4 lg:grid-cols-[1fr_300px] lg:items-start">
          <div className="overflow-hidden rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default">
            <div className="grid grid-cols-7 border-b border-stroke-neutral-muted bg-bg-layer-fill">
              {DAY_NAMES.map((d, i) => (
                <div key={d} className={cn("py-x2 text-center t3-medium", weekdayTextClass(i))}>
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {monthCells.map((day, idx) => {
                const lastCol = (idx + 1) % 7 === 0;
                const lastRow = idx >= monthCells.length - 7;
                const edge = cn("border-stroke-neutral-muted", !lastCol && "border-r", !lastRow && "border-b");
                if (!day) return <div key={`empty-${idx}`} className={cn("min-h-24 bg-bg-layer-fill", edge)} />;

                const ds = dateStr(day);
                const dayEvents = eventsOnDay(day);
                const isToday = ds === todayStr;
                const isSelected = ds === selectedDate;
                const dayOfWeek = (firstDay + day - 1) % 7;

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedDate(isSelected ? null : ds)}
                    aria-pressed={isSelected}
                    aria-label={`${month + 1}월 ${day}일${dayEvents.length > 0 ? `, 일정 ${dayEvents.length}개` : ""}`}
                    className={cn(
                      "flex min-h-24 min-w-0 flex-col gap-x1 p-x1_5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-stroke-focus-ring",
                      edge,
                      isSelected ? "bg-bg-brand-weak" : "hover:bg-bg-layer-default-pressed"
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-x6 shrink-0 place-items-center rounded-full tabular-nums",
                        isToday
                          ? "bg-bg-brand-solid t3-bold text-palette-static-white"
                          : cn(
                              "t3-medium",
                              dayOfWeek === 0 ? "text-fg-critical" : dayOfWeek === 6 ? "text-fg-informative" : "text-fg-neutral"
                            )
                      )}
                    >
                      {day}
                    </span>
                    <span className="flex min-w-0 flex-col gap-x0_5">
                      {dayEvents.slice(0, 3).map((e) => (
                        <span
                          key={e.id}
                          className={cn("block truncate rounded-r1 px-x1_5 py-x0_5 t2-medium", getEventStyle(e).chip)}
                        >
                          {e.type === "PERSONAL" && e.student ? `${e.student.name}: ` : ""}{e.title}
                        </span>
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="px-x1 t2-medium text-fg-neutral-subtle">+{dayEvents.length - 3}개</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 우측 패널 (월간) */}
          <div className="flex flex-col gap-x3">
            {showForm ? (
              <Section>{eventForm}</Section>
            ) : selectedDate ? (
              <Section
                title={new Date(selectedDate + "T00:00:00").toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })}
                actions={
                  <IconButton label="닫기" onClick={() => setSelectedDate(null)} className="-mr-x2">
                    <X className="size-5" aria-hidden />
                  </IconButton>
                }
              >
                {selectedEvents.length === 0 ? (
                  <EmptyState compact icon={CalendarDays} title="이 날은 일정이 없어요" className="py-x6" />
                ) : (
                  <ul className="flex flex-col gap-x2">
                    {selectedEvents.map((e) => {
                      const style = getEventStyle(e);
                      return (
                        <li key={e.id} className="flex items-start gap-x3 rounded-r3 bg-bg-layer-fill p-x3">
                          <span className={cn("mt-x1_5 size-2.5 shrink-0 rounded-full", style.swatch)} aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="truncate t4-medium text-fg-neutral">{e.title}</p>
                            {(e.schoolName || (e.type === "PERSONAL" && e.student)) && (
                              <p className="mt-x0_5 truncate t3-regular text-fg-neutral-subtle">
                                {[e.schoolName, e.type === "PERSONAL" ? e.student?.name : null].filter(Boolean).join(" · ")}
                              </p>
                            )}
                            {e.description && (
                              <p className="mt-x1 whitespace-pre-wrap t3-regular text-fg-neutral-muted">{e.description}</p>
                            )}
                            <div className="mt-x1_5 flex flex-wrap items-center gap-x1">
                              <StatusBadge tone="gray">{EVENT_TYPE_CONFIG[e.type].label}</StatusBadge>
                              {isGoogleEvent(e) && <StatusBadge tone="info">Google</StatusBadge>}
                            </div>
                          </div>
                          <div className="-mr-x1 -mt-x1 flex shrink-0 items-center">
                            <IconButton label="일정 수정" onClick={() => handleEdit(e)} disabled={isPending}>
                              <Pencil className="size-4" aria-hidden />
                            </IconButton>
                            <IconButton
                              label="일정 삭제"
                              onClick={() => setConfirmDelete(e)}
                              disabled={isPending}
                              className="hover:text-fg-critical"
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </IconButton>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-x3 w-full"
                  onClick={() => openAddForm(selectedDate)}
                >
                  <Plus aria-hidden />
                  이 날에 일정 추가
                </Button>
              </Section>
            ) : (
              <Section>
                <EmptyState
                  compact
                  icon={CalendarDays}
                  title="날짜를 선택해 주세요"
                  description="달력에서 날짜를 누르면 그날 일정을 볼 수 있어요"
                  className="py-x6"
                />
              </Section>
            )}

            {/* 이번 달 일정 요약 */}
            <Section title="이번 달 일정" count={monthEvents.length} flush>
              {monthEvents.length === 0 ? (
                <EmptyState compact title="이번 달 일정이 없어요" className="py-x6" />
              ) : (
                <ul className="flex flex-col pb-x3">
                  {monthEvents.slice(0, 8).map((e) => (
                    <li key={e.id} className="flex items-center gap-x2 px-x5 py-x1_5">
                      <span className="w-8 shrink-0 t3-medium tabular-nums text-fg-neutral-subtle">
                        {new Date(e.startDate).getDate()}일
                      </span>
                      <span className={cn("size-2 shrink-0 rounded-full", getEventStyle(e).swatch)} aria-hidden />
                      <span className="min-w-0 flex-1 truncate t4-regular text-fg-neutral">
                        {e.type === "PERSONAL" && e.student ? `${e.student.name}: ` : ""}{e.title}
                      </span>
                      <span className="shrink-0 t2-regular text-fg-neutral-subtle">{EVENT_TYPE_CONFIG[e.type].label}</span>
                    </li>
                  ))}
                  {monthEvents.length > 8 && (
                    <li className="px-x5 pt-x1 t3-regular text-fg-neutral-subtle">외 {monthEvents.length - 8}건</li>
                  )}
                </ul>
              )}
            </Section>
          </div>
        </div>
      )}

      {/* ── 학교별 주간 뷰 ── */}
      {viewMode === "week" && (
        <div className="grid grid-cols-1 items-start gap-x4 lg:grid-cols-[1fr_280px]">
          {/* 주간 그리드 */}
          <div className="max-h-[calc(100vh-220px)] overflow-auto rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="sticky top-0 z-20 bg-bg-layer-fill">
                  {/* 학교 헤더 셀 */}
                  <th className="sticky left-0 z-30 w-28 border-b border-r border-stroke-neutral-muted bg-bg-layer-fill px-x3 py-x2_5 text-left t3-medium text-fg-neutral-subtle">
                    학교
                  </th>
                  {weekDays.map((d) => {
                    const ds = toDateStr(d);
                    const isToday = ds === todayStr;
                    const dow = d.getDay();
                    return (
                      <th
                        key={ds}
                        className="min-w-[120px] border-b border-r border-stroke-neutral-muted bg-bg-layer-fill px-x2 py-x2 text-center last:border-r-0"
                      >
                        <div className={cn("t2-medium", weekdayTextClass(dow))}>{DAY_NAMES[dow]}</div>
                        <div
                          className={cn(
                            "mx-auto mt-x0_5 grid size-x7 place-items-center rounded-full t4-bold tabular-nums",
                            isToday ? "bg-bg-brand-solid text-palette-static-white" : "text-fg-neutral"
                          )}
                        >
                          {d.getDate()}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {/* 공통 행 (schoolName이 없는 이벤트) */}
                {(() => {
                  const hasCommon = weekDays.some((d) => eventsForSchoolDay(null, toDateStr(d)).length > 0);
                  if (!hasCommon) return null;
                  return (
                    <tr className="border-b border-stroke-neutral-muted">
                      <td className="sticky left-0 z-10 border-r border-stroke-neutral-muted bg-bg-layer-default px-x3 py-x2 align-top">
                        <span className="t3-medium text-fg-neutral-subtle">공통</span>
                      </td>
                      {weekDays.map((d) => {
                        const ds = toDateStr(d);
                        const cellEvts = eventsForSchoolDay(null, ds);
                        return (
                          <WeekCell
                            key={ds}
                            events={cellEvts}
                            onEventClick={setHoveredEvent}
                            onAddClick={() => {
                              setForm((f) => ({ ...f, startDate: ds }));
                              setEditingId(null);
                              setHoveredEvent(null);
                              setShowForm(true);
                            }}
                          />
                        );
                      })}
                    </tr>
                  );
                })()}

                {/* 학교별 행 */}
                {getWeekSchoolRows().map((school) => (
                  <tr key={school} className="border-b border-stroke-neutral-muted last:border-b-0">
                    <td className="sticky left-0 z-10 border-r border-stroke-neutral-muted bg-bg-layer-default px-x3 py-x2 align-top">
                      <span className="t3-bold text-fg-neutral">{school}</span>
                    </td>
                    {weekDays.map((d) => {
                      const ds = toDateStr(d);
                      const cellEvts = eventsForSchoolDay(school, ds);
                      return (
                        <WeekCell
                          key={ds}
                          events={cellEvts}
                          onEventClick={setHoveredEvent}
                          onAddClick={() => {
                            setForm((f) => ({ ...f, startDate: ds, schoolName: school }));
                            setEditingId(null);
                            setHoveredEvent(null);
                            setShowForm(true);
                          }}
                        />
                      );
                    })}
                  </tr>
                ))}

                {/* 학교 행이 없을 때 */}
                {getWeekSchoolRows().length === 0 && !weekDays.some((d) => eventsForSchoolDay(null, toDateStr(d)).length > 0) && (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState
                        compact
                        icon={CalendarDays}
                        title="이번 주 등록된 일정이 없어요"
                        description="위의 일정 추가 버튼으로 등록할 수 있어요"
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 우측 패널 (주간) */}
          <div className="flex flex-col gap-x3">
            {showForm ? (
              <Section>{eventForm}</Section>
            ) : hoveredEvent ? (
              <Section>
                <div className="flex items-start justify-between gap-x2">
                  <div className="flex flex-wrap items-center gap-x1">
                    <span className={cn("inline-flex rounded-r1 px-x1_5 py-x0_5 t2-medium", getEventStyle(hoveredEvent).chip)}>
                      {EVENT_TYPE_CONFIG[hoveredEvent.type].label}
                    </span>
                    {isGoogleEvent(hoveredEvent) && <StatusBadge tone="info">Google</StatusBadge>}
                  </div>
                  <IconButton label="닫기" onClick={() => setHoveredEvent(null)} className="-mr-x2 -mt-x1">
                    <X className="size-5" aria-hidden />
                  </IconButton>
                </div>
                <p className="mt-x2 t5-bold text-fg-neutral">{hoveredEvent.title}</p>
                {hoveredEvent.schoolName && (
                  <p className="mt-x0_5 t4-regular text-fg-neutral-subtle">{hoveredEvent.schoolName}</p>
                )}
                {hoveredEvent.type === "PERSONAL" && hoveredEvent.student && (
                  <p className="mt-x0_5 t4-regular text-fg-neutral-subtle">{hoveredEvent.student.name}</p>
                )}
                <p className="mt-x1 t4-regular tabular-nums text-fg-neutral-muted">
                  {new Date(hoveredEvent.startDate).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}
                  {hoveredEvent.endDate && ` – ${new Date(hoveredEvent.endDate).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}`}
                </p>
                {hoveredEvent.description && (
                  <p className="mt-x3 whitespace-pre-wrap t4-regular text-fg-neutral-muted">{hoveredEvent.description}</p>
                )}
                <div className="mt-x4 flex gap-x2 border-t border-stroke-neutral-muted pt-x4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => { handleEdit(hoveredEvent); setHoveredEvent(null); }}
                    disabled={isPending}
                  >
                    <Pencil aria-hidden />
                    수정
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 text-fg-critical"
                    onClick={() => setConfirmDelete(hoveredEvent)}
                    disabled={isPending}
                  >
                    <Trash2 aria-hidden />
                    삭제
                  </Button>
                </div>
              </Section>
            ) : (
              <Section>
                <EmptyState
                  compact
                  icon={CalendarDays}
                  title="일정을 선택해 주세요"
                  description={"표에서 일정을 누르면\n자세한 내용을 볼 수 있어요"}
                  className="py-x6"
                />
              </Section>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        title="이 일정을 삭제할까요?"
        description={
          confirmDelete
            ? isGoogleEvent(confirmDelete)
              ? `'${confirmDelete.title}' 일정이 Google Calendar에서도 삭제돼요.`
              : `'${confirmDelete.title}' 일정이 캘린더에서 사라져요.`
            : undefined
        }
        pending={isPending}
        onConfirm={() => {
          if (confirmDelete) {
            handleDelete(confirmDelete.id);
            if (hoveredEvent?.id === confirmDelete.id) setHoveredEvent(null);
          }
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}

// ── 주간 그리드 셀 ──
function WeekCell({
  events,
  onEventClick,
  onAddClick,
}: {
  events: EventWithStudent[];
  onEventClick: (e: EventWithStudent) => void;
  onAddClick: () => void;
}) {
  return (
    <td
      className="group cursor-pointer border-r border-stroke-neutral-muted px-x1_5 py-x1_5 align-top last:border-r-0"
      onClick={() => { if (events.length === 0) onAddClick(); }}
    >
      <div className="flex min-h-11 flex-col gap-x0_5">
        {events.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={(ev) => { ev.stopPropagation(); onEventClick(e); }}
            className={cn(
              "w-full truncate rounded-r1 px-x1_5 py-x1 text-left t2-medium transition-[filter] hover:brightness-95",
              getEventStyle(e).chip
            )}
          >
            {e.title}
          </button>
        ))}
        {events.length === 0 && (
          <button
            type="button"
            onClick={(ev) => { ev.stopPropagation(); onAddClick(); }}
            aria-label="이 칸에 일정 추가"
            className="grid h-10 w-full place-items-center rounded-r1 text-fg-placeholder opacity-0 transition-opacity hover:bg-bg-transparent-pressed focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        )}
      </div>
    </td>
  );
}

// ── 인라인 날짜 범위 선택 ──
function InlineDateRangePicker({
  startDate,
  endDate,
  onChange,
}: {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
}) {
  const todayPicker = new Date();
  const [pickerYear, setPickerYear] = useState(
    startDate ? parseInt(startDate.split("-")[0]) : todayPicker.getFullYear()
  );
  const [pickerMonth, setPickerMonth] = useState(
    startDate ? parseInt(startDate.split("-")[1]) - 1 : todayPicker.getMonth()
  );
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [step, setStep] = useState<"start" | "end">("start");

  function toDs(y: number, m: number, d: number) {
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function handleDayClick(ds: string) {
    if (step === "start" || !startDate) {
      onChange(ds, "");
      setStep("end");
    } else {
      if (ds >= startDate) {
        onChange(startDate, ds);
      } else {
        onChange(ds, "");
      }
      setStep("start");
    }
  }

  function prevMonth() {
    if (pickerMonth === 0) { setPickerYear(y => y - 1); setPickerMonth(11); }
    else setPickerMonth(m => m - 1);
  }
  function nextMonth() {
    if (pickerMonth === 11) { setPickerYear(y => y + 1); setPickerMonth(0); }
    else setPickerMonth(m => m + 1);
  }

  // 호버 미리보기 범위 계산
  const previewStart = step === "end" && startDate && hoverDate && hoverDate >= startDate ? startDate : null;
  const previewEnd   = step === "end" && startDate && hoverDate && hoverDate >= startDate ? hoverDate : null;

  const firstDay = new Date(pickerYear, pickerMonth, 1).getDay();
  const daysInMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const todayDs = toDs(todayPicker.getFullYear(), todayPicker.getMonth(), todayPicker.getDate());

  function formatDs(ds: string) {
    if (!ds) return "";
    const [y, m, d] = ds.split("-");
    return `${y}.${m}.${d}`;
  }

  const rangeBox = (active: boolean, filled: boolean) =>
    cn(
      "flex-1 rounded-r2 px-x3 py-x2 text-center t3-medium tabular-nums transition-shadow",
      active
        ? "bg-bg-layer-default shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-contrast)]"
        : "bg-bg-layer-fill",
      filled ? "text-fg-neutral" : "text-fg-placeholder"
    );

  return (
    <div className="flex flex-col gap-x2">
      {/* 선택된 범위 표시 */}
      <div className="flex items-center gap-x1_5">
        <div className={rangeBox(step === "start", !!startDate)}>
          {startDate ? formatDs(startDate) : "시작일"}
        </div>
        <span className="t3-regular text-fg-neutral-subtle" aria-hidden>→</span>
        <div className={rangeBox(step === "end", !!endDate)}>
          {endDate ? formatDs(endDate) : "종료일"}
        </div>
        {startDate && (
          <button
            type="button"
            onClick={() => { onChange("", ""); setStep("start"); }}
            className="grid size-x8 shrink-0 place-items-center rounded-full text-fg-neutral-subtle transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral"
            title="초기화"
            aria-label="날짜 초기화"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {/* 캘린더 */}
      <div className="select-none overflow-hidden rounded-r3 border border-stroke-neutral-muted">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-stroke-neutral-muted px-x1_5 py-x1">
          <button
            type="button"
            onClick={prevMonth}
            aria-label="이전 달"
            className="grid size-x8 place-items-center rounded-full text-fg-neutral-muted transition-colors hover:bg-bg-transparent-pressed"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <span className="t4-bold tabular-nums text-fg-neutral">{pickerYear}년 {pickerMonth + 1}월</span>
          <button
            type="button"
            onClick={nextMonth}
            aria-label="다음 달"
            className="grid size-x8 place-items-center rounded-full text-fg-neutral-muted transition-colors hover:bg-bg-transparent-pressed"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>

        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 bg-bg-layer-fill">
          {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
            <div key={d} className={cn("py-x1_5 text-center t2-medium", weekdayTextClass(i))}>{d}</div>
          ))}
        </div>

        {/* 날짜 그리드 */}
        <div className="grid grid-cols-7 py-x1">
          {cells.map((day, idx) => {
            if (!day) return <div key={`e-${idx}`} className="h-9" />;
            const ds = toDs(pickerYear, pickerMonth, day);
            const dow = idx % 7;
            const isStart = ds === startDate;
            const isEnd   = ds === endDate;
            const inRange = startDate && endDate && ds > startDate && ds < endDate;
            const inPreview = previewStart && previewEnd && ds > previewStart && ds < previewEnd;
            const isToday = ds === todayDs;

            return (
              <button
                key={day}
                type="button"
                className="relative flex h-9 items-center justify-center"
                onClick={() => handleDayClick(ds)}
                onMouseEnter={() => setHoverDate(ds)}
                onMouseLeave={() => setHoverDate(null)}
                aria-label={`${pickerMonth + 1}월 ${day}일`}
                aria-pressed={isStart || isEnd}
              >
                {/* 범위 배경 */}
                {(inRange || inPreview) && <span className="absolute inset-x-0 inset-y-1 bg-bg-brand-weak" aria-hidden />}
                {isStart && (endDate || previewEnd) && <span className="absolute inset-y-1 left-1/2 right-0 bg-bg-brand-weak" aria-hidden />}
                {isEnd && startDate && <span className="absolute inset-y-1 left-0 right-1/2 bg-bg-brand-weak" aria-hidden />}
                <span
                  className={cn(
                    "relative z-10 grid size-x7 place-items-center rounded-full tabular-nums transition-colors",
                    (isStart || isEnd)
                      ? "bg-bg-brand-solid t3-bold text-palette-static-white"
                      : isToday
                        ? "t3-bold text-fg-brand ring-1 ring-inset ring-stroke-brand-solid"
                        : cn(
                            "t3-medium hover:bg-bg-transparent-pressed",
                            dow === 0 ? "text-fg-critical" : dow === 6 ? "text-fg-informative" : "text-fg-neutral"
                          )
                  )}
                >
                  {day}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="t2-regular text-fg-neutral-subtle">
        {step === "start" ? "시작일을 눌러 주세요" : "종료일을 눌러 주세요 (없으면 시작일만 저장돼요)"}
      </p>
    </div>
  );
}

// ── 이벤트 폼 ──
function EventForm({
  form,
  setForm,
  editingId,
  isPending,
  allSchools,
  students,
  onSubmit,
  onClose,
  googleCalendarConfigured,
}: {
  form: {
    title: string;
    description: string;
    startDate: string;
    endDate: string;
    type: CalendarEventType;
    schoolName: string;
    studentId: string;
    allDay: boolean;
    color: string;
    syncToGoogle: boolean;
  };
  setForm: React.Dispatch<React.SetStateAction<typeof form>>;
  editingId: string | null;
  isPending: boolean;
  allSchools: string[];
  students: { id: string; name: string; grade: string }[];
  onSubmit: () => void;
  onClose: () => void;
  googleCalendarConfigured?: boolean;
}) {
  const NONE = "__none__";
  const selectedColor = normalizeEventColor(form.color, DEFAULT_COLOR);

  return (
    <div className="flex flex-col gap-x4">
      <div className="flex items-center justify-between gap-x2">
        <h3 className="t6-bold text-fg-neutral">{editingId ? "일정 수정" : "일정 등록"}</h3>
        <IconButton label="닫기" onClick={onClose} className="-mr-x2">
          <X className="size-5" aria-hidden />
        </IconButton>
      </div>

      <FormField label="제목" required htmlFor="event-title">
        <Input
          id="event-title"
          type="text"
          placeholder="일정 제목"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
      </FormField>

      <FormField label="기간" required>
        <InlineDateRangePicker
          startDate={form.startDate}
          endDate={form.endDate}
          onChange={(start, end) => setForm((f) => ({ ...f, startDate: start, endDate: end }))}
        />
      </FormField>

      {!editingId?.startsWith("g_") && (
        <>
          <FormField label="유형">
            <Select
              value={form.type}
              onValueChange={(v) => setForm((f) => ({ ...f, type: v as CalendarEventType, studentId: "", schoolName: "" }))}
            >
              <SelectTrigger aria-label="일정 유형">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(EVENT_TYPE_CONFIG) as CalendarEventType[]).map((t) => (
                  <SelectItem key={t} value={t}>{EVENT_TYPE_CONFIG[t].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {/* 학교 일정이면 학교명, 개인 일정이면 원생 선택 */}
          {form.type === "PERSONAL" ? (
            <FormField label="원생" hint="선택하지 않아도 돼요">
              <Select
                value={form.studentId || NONE}
                onValueChange={(v) => setForm((f) => ({ ...f, studentId: v === NONE ? "" : v }))}
              >
                <SelectTrigger aria-label="원생 선택">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>선택 안 함</SelectItem>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} · {s.grade}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          ) : (
            <FormField label="학교명" htmlFor="event-school" hint="선택하지 않아도 돼요">
              <Input
                id="event-school"
                type="text"
                placeholder="학교명"
                value={form.schoolName}
                onChange={(e) => setForm((f) => ({ ...f, schoolName: e.target.value }))}
                list="school-list-form"
              />
              <datalist id="school-list-form">
                {allSchools.map((s) => <option key={s} value={s} />)}
              </datalist>
            </FormField>
          )}

          {/* 컬러 선택 */}
          <FormField label="카드 색상">
            <div className="flex flex-col gap-x2">
              <div role="radiogroup" aria-label="카드 색상" className="flex flex-wrap items-center gap-x2">
                {EVENT_COLOR_OPTIONS.map((key) => {
                  const c = eventToneByKey(key);
                  const selected = selectedColor === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={c.label}
                      title={c.label}
                      onClick={() => setForm((f) => ({ ...f, color: key }))}
                      className={cn(
                        "grid size-x7 place-items-center rounded-full transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring",
                        c.swatch,
                        selected ? "scale-100" : "scale-90 hover:scale-100"
                      )}
                    >
                      {selected && <Check className="size-3.5 text-palette-static-white" strokeWidth={3} aria-hidden />}
                    </button>
                  );
                })}
              </div>
              <span
                className={cn(
                  "inline-flex max-w-full self-start truncate rounded-r1 px-x2 py-x0_5 t3-medium",
                  eventTone(form.color, DEFAULT_COLOR).chip
                )}
              >
                {form.title || "미리보기"}
              </span>
            </div>
          </FormField>
        </>
      )}

      <FormField label="설명" htmlFor="event-description">
        <Textarea
          id="event-description"
          placeholder="설명 (선택)"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={3}
          className="min-h-0 resize-none"
        />
      </FormField>

      {/* Google Calendar 동기화 토글 (새 이벤트에서만, Google 설정된 경우만) */}
      {!editingId && googleCalendarConfigured && (
        <div className="flex items-center justify-between gap-x3 rounded-r2 bg-bg-layer-fill px-x3 py-x2_5">
          <span className="t4-medium text-fg-neutral">Google Calendar에 동기화</span>
          <Switch
            size="24"
            checked={form.syncToGoogle}
            onCheckedChange={(v) => setForm((f) => ({ ...f, syncToGoogle: v }))}
            inputProps={{ "aria-label": "Google Calendar에 동기화" }}
          />
        </div>
      )}

      <FormActions>
        <Button variant="ghost" onClick={onClose}>취소</Button>
        <Button onClick={onSubmit} disabled={isPending}>
          {isPending ? "저장 중…" : editingId ? "저장" : "등록"}
        </Button>
      </FormActions>
    </div>
  );
}
