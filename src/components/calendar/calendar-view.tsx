"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from "@/actions/calendar";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, X, Calendar, LayoutGrid, RefreshCw } from "lucide-react";
import type { CalendarEvent, CalendarEventType } from "@/generated/prisma";
import type { GoogleCalendarEvent } from "@/actions/google-calendar";
import { updateGoogleCalendarEvent, deleteGoogleCalendarEvent } from "@/actions/google-calendar";

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

// 노션 태그 컬러 팔레트
const NOTION_COLORS: Record<string, { label: string; bg: string; border: string; text: string; dot: string }> = {
  google: { label: "Google", bg: "bg-[#e8f0fe]", border: "border-[#c5d8fd]", text: "text-[#1a73e8]", dot: "bg-[#4285f4]" },
  gray:   { label: "회색", bg: "bg-gray-100",   border: "border-gray-200",   text: "text-gray-700",   dot: "bg-gray-400"   },
  red:    { label: "빨강", bg: "bg-red-100",    border: "border-red-200",    text: "text-red-700",    dot: "bg-red-400"    },
  orange: { label: "주황", bg: "bg-orange-100", border: "border-orange-200", text: "text-orange-700", dot: "bg-orange-400" },
  yellow: { label: "노랑", bg: "bg-yellow-100", border: "border-yellow-200", text: "text-yellow-700", dot: "bg-yellow-400" },
  green:  { label: "초록", bg: "bg-green-100",  border: "border-green-200",  text: "text-green-700",  dot: "bg-green-400"  },
  blue:   { label: "파랑", bg: "bg-blue-100",   border: "border-blue-200",   text: "text-blue-700",   dot: "bg-blue-400"   },
  purple: { label: "보라", bg: "bg-purple-100", border: "border-purple-200", text: "text-purple-700", dot: "bg-purple-400" },
  pink:   { label: "분홍", bg: "bg-pink-100",   border: "border-pink-200",   text: "text-pink-700",   dot: "bg-pink-400"   },
  brown:  { label: "갈색", bg: "bg-amber-100",  border: "border-amber-200",  text: "text-amber-800",  dot: "bg-amber-600"  },
};

const DEFAULT_COLOR = "blue";

function getEventStyle(event: EventWithStudent) {
  const key = event.color && NOTION_COLORS[event.color] ? event.color : DEFAULT_COLOR;
  return NOTION_COLORS[key];
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
    const goog = showGoogleEvents ? googleEvents.filter((e) => {
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
    const goog = showGoogleEvents ? googleEvents.filter((e) => {
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
        ...(showGoogleEvents ? googleEvents.filter((e) => {
          const end = e.endDate ?? e.startDate;
          return selectedDate >= e.startDate && selectedDate <= end && !removedGoogleIds.has(e.googleEventId);
        }).map(googleToDisplayEvent) : []),
      ]
    : [];

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
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

  return (
    <div className="space-y-4">
      {/* 상단 컨트롤 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {/* 탐색 */}
          <button
            onClick={viewMode === "month" ? prevMonth : prevWeek}
            className="p-1.5 rounded hover:bg-accent transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="text-base font-bold min-w-[200px] text-center">
            {viewMode === "month" ? `${year}년 ${month + 1}월` : weekLabel}
          </h2>
          <button
            onClick={viewMode === "month" ? nextMonth : nextWeek}
            className="p-1.5 rounded hover:bg-accent transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={goToday}
            className="text-xs px-2 py-1 border rounded hover:bg-accent transition-colors text-muted-foreground"
          >
            오늘
          </button>

          {/* 뷰 토글 */}
          <div className="flex rounded-md border overflow-hidden ml-1">
            <button
              onClick={() => setViewMode("month")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 text-xs transition-colors",
                viewMode === "month" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              <LayoutGrid className="h-3 w-3" />
              월간
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 text-xs transition-colors border-l",
                viewMode === "week" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              <Calendar className="h-3 w-3" />
              학교별 주간
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* 유형 필터 */}
          <div className="flex gap-1">
            <button
              onClick={() => setFilterType("ALL")}
              className={cn("px-2 py-1 text-xs rounded border transition-colors", filterType === "ALL" ? "bg-primary/10 text-primary border-primary/30" : "border-border text-muted-foreground hover:bg-muted")}
            >
              전체
            </button>
            {(Object.keys(EVENT_TYPE_CONFIG) as CalendarEventType[]).map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={cn("px-2 py-1 text-xs rounded border transition-colors", filterType === t ? "bg-primary/10 text-primary border-primary/30" : "border-border text-muted-foreground hover:bg-muted")}
              >
                {EVENT_TYPE_CONFIG[t].label}
              </button>
            ))}
          </div>

          {/* 학교 필터 (월간 뷰에서만) */}
          {viewMode === "month" && allSchools.length > 0 && (
            <select
              value={filterSchool}
              onChange={(e) => setFilterSchool(e.target.value)}
              className="text-xs border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="ALL">모든 학교</option>
              {allSchools.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}

          {/* 원생 필터 */}
          {students.length > 0 && (
            <select
              value={filterStudent}
              onChange={(e) => setFilterStudent(e.target.value)}
              className="text-xs border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="ALL">모든 원생</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.grade}
                </option>
              ))}
            </select>
          )}

          {googleCalendarConfigured && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowGoogleEvents((v) => !v)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs transition-colors",
                  showGoogleEvents
                    ? "bg-[#e8f0fe] border-[#c5d8fd] text-[#1a73e8]"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                <span className="font-bold tracking-tight">G</span>
                Google
              </button>
              <button
                onClick={() => {
                  setIsRefreshing(true);
                  router.refresh();
                  setTimeout(() => setIsRefreshing(false), 1000);
                }}
                disabled={isRefreshing}
                title="Google Calendar 새로고침"
                className="p-1.5 rounded border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn("h-3 w-3", isRefreshing && "animate-spin")} />
              </button>
            </div>
          )}

          <Button
            size="sm"
            className="h-7 text-xs gap-1"
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
            <Plus className="h-3.5 w-3.5" />
            일정 추가
          </Button>
        </div>
      </div>

      {/* ── 월간 뷰 ── */}
      {viewMode === "month" && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
          <div className="rounded-lg border overflow-hidden">
            <div className="grid grid-cols-7 text-center text-xs font-medium bg-muted/50">
              {DAY_NAMES.map((d, i) => (
                <div key={d} className={cn("py-2", i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-muted-foreground")}>
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 border-t">
              {cells.map((day, idx) => {
                if (!day) return <div key={`empty-${idx}`} className="border-b border-r min-h-[90px] bg-muted/10" />;

                const ds = dateStr(day);
                const dayEvents = eventsOnDay(day);
                const isToday = ds === todayStr;
                const isSelected = ds === selectedDate;
                const dayOfWeek = (firstDay + day - 1) % 7;

                return (
                  <div
                    key={day}
                    onClick={() => setSelectedDate(isSelected ? null : ds)}
                    className={cn(
                      "border-b border-r min-h-[90px] p-1 cursor-pointer transition-colors",
                      isSelected ? "bg-primary/5" : "hover:bg-accent/40",
                      (idx + 1) % 7 === 0 && "border-r-0"
                    )}
                  >
                    <div className={cn(
                      "w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium mb-1",
                      isToday ? "bg-primary text-primary-foreground" : "",
                      !isToday && dayOfWeek === 0 ? "text-red-500" : "",
                      !isToday && dayOfWeek === 6 ? "text-blue-500" : "",
                    )}>
                      {day}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map((e) => {
                        const style = getEventStyle(e);
                        return (
                          <div
                            key={e.id}
                            className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded truncate border",
                              style.bg, style.border, style.text
                            )}
                          >
                            {e.type === "PERSONAL" && e.student ? `${e.student.name}: ` : ""}{e.title}
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <div className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3}개</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 우측 패널 (월간) */}
          <div className="space-y-3">
            {showForm ? (
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
            ) : selectedDate ? (
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    {new Date(selectedDate + "T00:00:00").toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })}
                  </p>
                  <button onClick={() => setSelectedDate(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {selectedEvents.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">일정이 없습니다</p>
                ) : (
                  <div className="space-y-2">
                    {selectedEvents.map((e) => {
                      const style = getEventStyle(e);
                      return (
                        <div key={e.id} className={cn("p-2.5 rounded-lg border", style.bg, style.border)}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className={cn("text-sm font-medium truncate", style.text)}>{e.title}</p>
                              {e.schoolName && <p className="text-xs text-muted-foreground">{e.schoolName}</p>}
                              {e.type === "PERSONAL" && e.student && (
                                <p className="text-xs text-muted-foreground">{e.student.name}</p>
                              )}
                              {e.description && <p className="text-xs text-muted-foreground mt-0.5">{e.description}</p>}
                              <p className="text-[10px] text-muted-foreground/70 mt-1">{EVENT_TYPE_CONFIG[e.type].label}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {isGoogleEvent(e) && (
                                <span className="text-[10px] font-bold text-[#1a73e8] bg-[#e8f0fe] px-1.5 py-0.5 rounded">G</span>
                              )}
                              <>
                                <button onClick={() => handleEdit(e)} disabled={isPending} className="text-muted-foreground hover:text-primary transition-colors">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => handleDelete(e.id)} disabled={isPending} className="text-muted-foreground hover:text-destructive transition-colors">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <button
                  onClick={() => {
                    setForm((f) => ({ ...f, startDate: selectedDate }));
                    setEditingId(null);
                    setShowForm(true);
                  }}
                  className="w-full text-xs text-primary hover:underline text-center"
                >
                  + 이 날에 일정 추가
                </button>
              </div>
            ) : (
              <div className="rounded-lg border p-4 text-center">
                <p className="text-xs text-muted-foreground">날짜를 클릭하면 일정을 확인할 수 있습니다</p>
              </div>
            )}

            {/* 이번 달 일정 요약 */}
            <div className="rounded-lg border p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">이번 달 일정</p>
              {(() => {
                const monthEvents = events.filter((e) => {
                  const start = new Date(e.startDate);
                  return start.getFullYear() === year && start.getMonth() === month;
                });
                if (monthEvents.length === 0) return <p className="text-xs text-muted-foreground">일정 없음</p>;
                return monthEvents.slice(0, 8).map((e) => {
                  const style = getEventStyle(e);
                  return (
                    <div key={e.id} className="flex items-start gap-2">
                      <span className="text-xs text-muted-foreground whitespace-nowrap mt-0.5">
                        {new Date(e.startDate).getDate()}일
                      </span>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded border shrink-0", style.bg, style.border, style.text)}>
                        {EVENT_TYPE_CONFIG[e.type].label}
                      </span>
                      <span className="text-xs truncate">
                        {e.type === "PERSONAL" && e.student ? `${e.student.name}: ` : ""}{e.title}
                      </span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── 학교별 주간 뷰 ── */}
      {viewMode === "week" && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 items-start">
          {/* 주간 그리드 */}
          <div className="rounded-lg border overflow-auto max-h-[calc(100vh-220px)]">
            <table className="w-full border-collapse min-w-[640px]">
              <thead>
                <tr className="bg-muted/40 sticky top-0 z-20">
                  {/* 학교 헤더 셀 */}
                  <th className="text-xs font-medium text-muted-foreground text-left px-3 py-2.5 border-b border-r w-[110px] sticky left-0 bg-muted/40 z-30">
                    학교
                  </th>
                  {weekDays.map((d, i) => {
                    const ds = toDateStr(d);
                    const isToday = ds === todayStr;
                    const dow = d.getDay();
                    return (
                      <th key={ds} className="border-b border-r last:border-r-0 px-2 py-2 text-center min-w-[120px] bg-muted/40">
                        <div className={cn(
                          "text-[10px] font-medium",
                          dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-muted-foreground"
                        )}>
                          {DAY_NAMES[dow]}
                        </div>
                        <div className={cn(
                          "mx-auto mt-0.5 w-7 h-7 flex items-center justify-center rounded-full text-sm font-semibold",
                          isToday ? "bg-primary text-primary-foreground" : "text-foreground"
                        )}>
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
                    <tr className="border-b hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2 border-r sticky left-0 bg-card z-10">
                        <span className="text-xs font-medium text-muted-foreground">공통</span>
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
                  <tr key={school} className="border-b last:border-b-0 hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 border-r sticky left-0 bg-card z-10">
                      <span className="text-xs font-semibold text-foreground">{school}</span>
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
                    <td colSpan={8} className="text-center py-10 text-sm text-muted-foreground">
                      이번 주 등록된 일정이 없습니다
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 우측 패널 (주간) */}
          <div className="space-y-3">
            {showForm ? (
              <div className="rounded-lg border p-4">
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
              </div>
            ) : hoveredEvent ? (
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {(() => {
                      const style = getEventStyle(hoveredEvent);
                      return (
                        <span className={cn("inline-flex text-[10px] px-1.5 py-0.5 rounded border mb-1.5", style.bg, style.border, style.text)}>
                          {EVENT_TYPE_CONFIG[hoveredEvent.type].label}
                        </span>
                      );
                    })()}
                    <p className="text-sm font-semibold">{hoveredEvent.title}</p>
                    {hoveredEvent.schoolName && (
                      <p className="text-xs text-muted-foreground mt-0.5">{hoveredEvent.schoolName}</p>
                    )}
                    {hoveredEvent.type === "PERSONAL" && hoveredEvent.student && (
                      <p className="text-xs text-muted-foreground mt-0.5">{hoveredEvent.student.name}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(hoveredEvent.startDate).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}
                      {hoveredEvent.endDate && ` – ${new Date(hoveredEvent.endDate).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}`}
                    </p>
                    {hoveredEvent.description && (
                      <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{hoveredEvent.description}</p>
                    )}
                  </div>
                  <button onClick={() => setHoveredEvent(null)} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex gap-2 pt-1 border-t">
                  {isGoogleEvent(hoveredEvent) && (
                    <span className="text-[10px] font-bold text-[#1a73e8] bg-[#e8f0fe] px-1.5 py-0.5 rounded self-center">G</span>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs flex-1 gap-1"
                    onClick={() => { handleEdit(hoveredEvent); setHoveredEvent(null); }}
                    disabled={isPending}
                  >
                    <Pencil className="h-3 w-3" />
                    수정
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs flex-1 gap-1 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
                    onClick={() => { handleDelete(hoveredEvent.id); setHoveredEvent(null); }}
                    disabled={isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                    삭제
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border p-4 text-center">
                <p className="text-xs text-muted-foreground">일정을 클릭하면<br />상세 내용을 확인할 수 있습니다</p>
              </div>
            )}
          </div>
        </div>
      )}
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
      className="border-r last:border-r-0 px-1.5 py-1.5 align-top min-h-[56px] group cursor-pointer"
      onClick={() => { if (events.length === 0) onAddClick(); }}
    >
      <div className="space-y-0.5 min-h-[44px]">
        {events.map((e) => {
          const style = getEventStyle(e);
          return (
            <button
              key={e.id}
              type="button"
              onClick={(ev) => { ev.stopPropagation(); onEventClick(e); }}
              className={cn(
                "w-full text-left text-[11px] px-1.5 py-1 rounded border leading-tight truncate transition-opacity hover:opacity-80",
                style.bg, style.border, style.text
              )}
            >
              {e.title}
            </button>
          );
        })}
        {events.length === 0 && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center h-10">
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
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

  return (
    <div className="space-y-2">
      {/* 선택된 범위 표시 */}
      <div className="flex items-center gap-1.5 text-xs">
        <div className={cn(
          "flex-1 rounded border px-2 py-1.5 text-center font-mono transition-colors",
          step === "start" ? "border-primary ring-1 ring-primary bg-primary/5" : "border-border",
          !startDate && "text-muted-foreground"
        )}>
          {startDate ? formatDs(startDate) : "시작일"}
        </div>
        <span className="text-muted-foreground">→</span>
        <div className={cn(
          "flex-1 rounded border px-2 py-1.5 text-center font-mono transition-colors",
          step === "end" ? "border-primary ring-1 ring-primary bg-primary/5" : "border-border",
          !endDate && "text-muted-foreground"
        )}>
          {endDate ? formatDs(endDate) : "종료일"}
        </div>
        {startDate && (
          <button
            type="button"
            onClick={() => { onChange("", ""); setStep("start"); }}
            className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent transition-colors"
            title="초기화"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* 캘린더 */}
      <div className="rounded-lg border overflow-hidden select-none">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b">
          <button type="button" onClick={prevMonth} className="p-1 rounded hover:bg-accent transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="text-xs font-semibold">{pickerYear}년 {pickerMonth + 1}월</span>
          <button type="button" onClick={nextMonth} className="p-1 rounded hover:bg-accent transition-colors">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 bg-muted/10">
          {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
            <div key={d} className={cn(
              "text-center py-1.5 text-[10px] font-medium",
              i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-muted-foreground"
            )}>{d}</div>
          ))}
        </div>

        {/* 날짜 그리드 */}
        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            if (!day) return <div key={`e-${idx}`} className="h-8" />;
            const ds = toDs(pickerYear, pickerMonth, day);
            const dow = idx % 7;
            const isStart = ds === startDate;
            const isEnd   = ds === endDate;
            const inRange = startDate && endDate && ds > startDate && ds < endDate;
            const inPreview = previewStart && previewEnd && ds > previewStart && ds < previewEnd;
            const isToday = ds === todayDs;

            return (
              <div
                key={day}
                className={cn(
                  "relative h-8 flex items-center justify-center cursor-pointer",
                  // 범위 배경
                  (inRange || inPreview) && "bg-primary/10",
                  isStart && (endDate || (previewEnd)) && "bg-gradient-to-r from-transparent to-primary/10",
                  isEnd && startDate && "bg-gradient-to-l from-transparent to-primary/10",
                )}
                onClick={() => handleDayClick(ds)}
                onMouseEnter={() => setHoverDate(ds)}
                onMouseLeave={() => setHoverDate(null)}
              >
                <span className={cn(
                  "w-7 h-7 flex items-center justify-center rounded-full text-[11px] font-medium transition-colors z-10 relative",
                  (isStart || isEnd) ? "bg-primary text-primary-foreground shadow-sm" :
                  isToday ? "ring-1 ring-primary text-primary" :
                  dow === 0 ? "text-red-500 hover:bg-red-50" :
                  dow === 6 ? "text-blue-500 hover:bg-blue-50" :
                  "hover:bg-accent"
                )}>
                  {day}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground">
        {step === "start" ? "시작일을 클릭하세요" : "종료일을 클릭하세요 (없으면 시작일만 저장)"}
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
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{editingId ? "일정 수정" : "일정 등록"}</p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-2.5">
        <input
          type="text"
          placeholder="제목 *"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          className="w-full border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background"
        />
        <InlineDateRangePicker
          startDate={form.startDate}
          endDate={form.endDate}
          onChange={(start, end) => setForm((f) => ({ ...f, startDate: start, endDate: end }))}
        />
        {!editingId?.startsWith("g_") && (
          <>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as CalendarEventType, studentId: "", schoolName: "" }))}
              className="w-full border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background"
            >
              {(Object.keys(EVENT_TYPE_CONFIG) as CalendarEventType[]).map((t) => (
                <option key={t} value={t}>{EVENT_TYPE_CONFIG[t].label}</option>
              ))}
            </select>

            {/* 학교 일정이면 학교명, 개인 일정이면 원생 선택 */}
            {form.type === "PERSONAL" ? (
              <select
                value={form.studentId}
                onChange={(e) => setForm((f) => ({ ...f, studentId: e.target.value }))}
                className="w-full border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background"
              >
                <option value="">원생 선택 (선택)</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} · {s.grade}</option>
                ))}
              </select>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="학교명 (선택)"
                  value={form.schoolName}
                  onChange={(e) => setForm((f) => ({ ...f, schoolName: e.target.value }))}
                  className="w-full border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background"
                  list="school-list-form"
                />
                <datalist id="school-list-form">
                  {allSchools.map((s) => <option key={s} value={s} />)}
                </datalist>
              </>
            )}

            {/* 컬러 선택 */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">카드 색상</label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {Object.entries(NOTION_COLORS).map(([key, c]) => (
                  <button
                    key={key}
                    type="button"
                    title={c.label}
                    onClick={() => setForm((f) => ({ ...f, color: key }))}
                    className={cn(
                      "w-5 h-5 rounded-full transition-all duration-150 border-2",
                      c.dot,
                      form.color === key
                        ? "border-foreground scale-125 shadow-sm"
                        : "border-transparent hover:scale-110 opacity-70 hover:opacity-100"
                    )}
                  />
                ))}
              </div>
              <div className={cn(
                "inline-flex text-xs px-2 py-0.5 rounded border",
                NOTION_COLORS[form.color]?.bg ?? "bg-blue-100",
                NOTION_COLORS[form.color]?.border ?? "border-blue-200",
                NOTION_COLORS[form.color]?.text ?? "text-blue-700"
              )}>
                {form.title || "미리보기"}
              </div>
            </div>
          </>
        )}

        <textarea
          placeholder="설명 (선택)"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          className="w-full border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background resize-none min-h-[56px]"
        />
      </div>
      {/* Google Calendar 동기화 토글 (새 이벤트에서만, Google 설정된 경우만) */}
      {!editingId && googleCalendarConfigured && (
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <div
            onClick={() => setForm((f) => ({ ...f, syncToGoogle: !f.syncToGoogle }))}
            className={cn(
              "relative w-8 h-4.5 rounded-full transition-colors",
              form.syncToGoogle ? "bg-[#1a73e8]" : "bg-muted-foreground/30"
            )}
          >
            <span className={cn(
              "absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform",
              form.syncToGoogle ? "translate-x-4" : "translate-x-0.5"
            )} />
          </div>
          <span className="text-xs text-muted-foreground">Google Calendar에 동기화</span>
        </label>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClose}>취소</Button>
        <Button size="sm" className="h-7 text-xs" onClick={onSubmit} disabled={isPending}>
          {editingId ? "저장" : "등록"}
        </Button>
      </div>
    </div>
  );
}
