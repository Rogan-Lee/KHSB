"use client";

import { useState, useTransition, useEffect } from "react";
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getStudentCalendarEvents,
} from "@/actions/calendar";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  X,
  LayoutGrid,
  Calendar,
} from "lucide-react";
import type { CalendarEvent, CalendarEventType } from "@/generated/prisma";

type EventWithStudent = CalendarEvent & {
  student: { id: string; name: string } | null;
};

const NOTION_COLORS: Record<
  string,
  { label: string; bg: string; border: string; text: string; dot: string }
> = {
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

const DEFAULT_COLOR = "purple";

const EVENT_TYPE_CONFIG: Record<CalendarEventType, { label: string }> = {
  SCHOOL_EXAM:  { label: "학교 시험" },
  SCHOOL_EVENT: { label: "학교 행사" },
  PERSONAL:     { label: "개인 일정" },
  PLATFORM:     { label: "플랫폼" },
};

function getEventStyle(event: EventWithStudent) {
  const key =
    event.color && NOTION_COLORS[event.color] ? event.color : DEFAULT_COLOR;
  return NOTION_COLORS[key];
}

function parseSchoolName(school: string | null): string | null {
  if (!school) return null;
  return school.replace(/\d+$/, "").trim() || null;
}

function toDateStr(date: Date): string {
  return date.toISOString().split("T")[0];
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

interface Props {
  studentId: string;
  studentName: string;
  school: string | null;
}

type FormState = {
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  type: CalendarEventType;
  studentId: string;
  schoolName: string;
  color: string;
};

export function StudentCalendarPanel({ studentId, studentName, school }: Props) {
  const schoolName = parseSchoolName(school);
  const today = new Date();
  const todayStr = toDateStr(today);

  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(today));
  const [events, setEvents] = useState<EventWithStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const blankForm: FormState = {
    title: "",
    description: "",
    startDate: todayStr,
    endDate: "",
    type: "PERSONAL",
    studentId,
    schoolName: "",
    color: DEFAULT_COLOR,
  };
  const [form, setForm] = useState<FormState>(blankForm);

  useEffect(() => {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month + 2, 0);
    setLoading(true);
    getStudentCalendarEvents({ studentId, schoolName, startDate: start, endDate: end })
      .then(setEvents)
      .catch(() => toast.error("일정 불러오기 실패"))
      .finally(() => setLoading(false));
  }, [year, month, studentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Month grid
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  function dateStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function eventsOnDate(ds: string) {
    return events.filter((e) => {
      const start = toDateStr(new Date(e.startDate));
      const end = e.endDate ? toDateStr(new Date(e.endDate)) : start;
      return ds >= start && ds <= end;
    });
  }

  // Week days
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekDayFirst = weekDays[0];
  const weekDayLast = weekDays[6];
  const weekLabel =
    weekDayFirst.getMonth() === weekDayLast.getMonth()
      ? `${weekDayFirst.getMonth() + 1}월 ${weekDayFirst.getDate()}–${weekDayLast.getDate()}일`
      : `${weekDayFirst.getMonth() + 1}/${weekDayFirst.getDate()} – ${weekDayLast.getMonth() + 1}/${weekDayLast.getDate()}`;

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

  function openAdd(ds?: string) {
    setEditingId(null);
    setForm({ ...blankForm, startDate: ds ?? selectedDate ?? todayStr });
    setShowForm(true);
  }

  function openEdit(event: EventWithStudent) {
    setEditingId(event.id);
    setForm({
      title: event.title,
      description: event.description ?? "",
      startDate: toDateStr(new Date(event.startDate)),
      endDate: event.endDate ? toDateStr(new Date(event.endDate)) : "",
      type: event.type,
      studentId: event.studentId ?? studentId,
      schoolName: event.schoolName ?? "",
      color: event.color ?? DEFAULT_COLOR,
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  function handleSubmit() {
    if (!form.title || !form.startDate) {
      toast.error("제목과 시작일은 필수입니다");
      return;
    }
    startTransition(async () => {
      try {
        const isPersonal = form.type === "PERSONAL";
        if (editingId) {
          await updateCalendarEvent(editingId, {
            title: form.title,
            description: form.description || undefined,
            startDate: form.startDate,
            endDate: form.endDate || undefined,
            type: form.type,
            schoolName: isPersonal ? undefined : form.schoolName || undefined,
            studentId: isPersonal ? studentId : null,
            color: form.color,
          });
          setEvents((prev) =>
            prev.map((e) =>
              e.id === editingId
                ? {
                    ...e,
                    title: form.title,
                    description: form.description || null,
                    startDate: new Date(form.startDate),
                    endDate: form.endDate ? new Date(form.endDate) : null,
                    type: form.type,
                    schoolName: isPersonal ? null : form.schoolName || null,
                    studentId: isPersonal ? studentId : null,
                    color: form.color,
                  }
                : e
            )
          );
          toast.success("수정되었습니다");
        } else {
          const created = await createCalendarEvent({
            title: form.title,
            description: form.description || undefined,
            startDate: form.startDate,
            endDate: form.endDate || undefined,
            allDay: true,
            type: form.type,
            schoolName: isPersonal ? undefined : form.schoolName || undefined,
            studentId: isPersonal ? studentId : undefined,
            color: form.color,
          });
          setEvents((prev) => [
            ...prev,
            { ...created, student: { id: studentId, name: studentName } },
          ]);
          toast.success("등록되었습니다");
        }
        closeForm();
      } catch {
        toast.error("저장 실패");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteCalendarEvent(id);
        setEvents((prev) => prev.filter((e) => e.id !== id));
        toast.success("삭제되었습니다");
      } catch {
        toast.error("삭제 실패");
      }
    });
  }

  const selectedEvents = selectedDate ? eventsOnDate(selectedDate) : [];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-0.5">
          <button
            onClick={viewMode === "month" ? prevMonth : prevWeek}
            className="p-1 rounded hover:bg-accent transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold min-w-[110px] text-center">
            {viewMode === "month" ? `${year}년 ${month + 1}월` : weekLabel}
          </span>
          <button
            onClick={viewMode === "month" ? nextMonth : nextWeek}
            className="p-1 rounded hover:bg-accent transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={goToday}
            className="text-xs px-2 py-1 border rounded hover:bg-accent transition-colors text-muted-foreground"
          >
            오늘
          </button>
          <div className="flex rounded-md border overflow-hidden">
            <button
              onClick={() => setViewMode("month")}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-xs transition-colors",
                viewMode === "month"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              <LayoutGrid className="h-3 w-3" />
              월
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-xs transition-colors border-l",
                viewMode === "week"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              <Calendar className="h-3 w-3" />
              주
            </button>
          </div>
          <Button
            size="sm"
            className="h-7 text-xs gap-1 px-2"
            onClick={() => openAdd()}
          >
            <Plus className="h-3 w-3" />
            추가
          </Button>
        </div>
      </div>

      {loading && (
        <p className="text-xs text-muted-foreground text-center py-4">
          불러오는 중...
        </p>
      )}

      {/* Month View */}
      {!loading && viewMode === "month" && (
        <>
          <div className="rounded-lg border overflow-hidden">
            <div className="grid grid-cols-7 text-center text-[10px] font-medium bg-muted/50">
              {DAY_NAMES.map((d, i) => (
                <div
                  key={d}
                  className={cn(
                    "py-1.5",
                    i === 0
                      ? "text-red-500"
                      : i === 6
                      ? "text-blue-500"
                      : "text-muted-foreground"
                  )}
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 border-t">
              {cells.map((day, idx) => {
                if (!day)
                  return (
                    <div
                      key={`e-${idx}`}
                      className="border-b border-r min-h-[60px] bg-muted/10"
                    />
                  );
                const ds = dateStr(day);
                const dayEvts = eventsOnDate(ds);
                const isToday = ds === todayStr;
                const isSelected = ds === selectedDate;
                const dow = (firstDay + day - 1) % 7;
                return (
                  <div
                    key={day}
                    onClick={() => {
                      setSelectedDate(isSelected ? null : ds);
                      setShowForm(false);
                    }}
                    className={cn(
                      "border-b border-r min-h-[60px] p-1 cursor-pointer transition-colors",
                      isSelected
                        ? "bg-primary/5 ring-1 ring-inset ring-primary/30"
                        : "hover:bg-accent/40",
                      (idx + 1) % 7 === 0 && "border-r-0"
                    )}
                  >
                    <div
                      className={cn(
                        "w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-medium mb-0.5",
                        isToday ? "bg-primary text-primary-foreground" : "",
                        !isToday && dow === 0 ? "text-red-500" : "",
                        !isToday && dow === 6 ? "text-blue-500" : ""
                      )}
                    >
                      {day}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvts.slice(0, 2).map((e) => {
                        const style = getEventStyle(e);
                        return (
                          <div
                            key={e.id}
                            className={cn(
                              "text-[9px] px-1 py-0.5 rounded truncate border leading-tight",
                              style.bg,
                              style.border,
                              style.text
                            )}
                          >
                            {e.title}
                          </div>
                        );
                      })}
                      {dayEvts.length > 2 && (
                        <div className="text-[9px] text-muted-foreground px-1">
                          +{dayEvts.length - 2}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected date events or form */}
          {showForm ? (
            <PanelEventForm
              form={form}
              setForm={setForm}
              editingId={editingId}
              isPending={isPending}
              onSubmit={handleSubmit}
              onClose={closeForm}
            />
          ) : selectedDate ? (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium">
                  {new Date(
                    selectedDate + "T00:00:00"
                  ).toLocaleDateString("ko-KR", {
                    month: "long",
                    day: "numeric",
                    weekday: "short",
                  })}
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => openAdd(selectedDate)}
                    className="flex items-center gap-0.5 text-xs text-primary hover:underline"
                  >
                    <Plus className="h-3 w-3" />
                    추가
                  </button>
                  <button
                    onClick={() => setSelectedDate(null)}
                    className="text-muted-foreground hover:text-foreground p-0.5"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {selectedEvents.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">
                  일정 없음
                </p>
              ) : (
                <div className="space-y-1.5">
                  {selectedEvents.map((e) => {
                    const style = getEventStyle(e);
                    return (
                      <div
                        key={e.id}
                        className={cn(
                          "flex items-start justify-between gap-2 p-2 rounded-md border",
                          style.bg,
                          style.border
                        )}
                      >
                        <div className="min-w-0">
                          <p
                            className={cn(
                              "text-xs font-medium truncate",
                              style.text
                            )}
                          >
                            {e.title}
                          </p>
                          {e.schoolName && (
                            <p className="text-[10px] text-muted-foreground">
                              {e.schoolName}
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground/70">
                            {EVENT_TYPE_CONFIG[e.type].label}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => openEdit(e)}
                            disabled={isPending}
                            className="text-muted-foreground hover:text-primary transition-colors"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleDelete(e.id)}
                            disabled={isPending}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </>
      )}

      {/* Week View */}
      {!loading && viewMode === "week" && (
        <div className="space-y-2">
          {showForm ? (
            <PanelEventForm
              form={form}
              setForm={setForm}
              editingId={editingId}
              isPending={isPending}
              onSubmit={handleSubmit}
              onClose={closeForm}
            />
          ) : (
            weekDays.map((d) => {
              const ds = toDateStr(d);
              const dayEvts = eventsOnDate(ds);
              const isToday = ds === todayStr;
              const dow = d.getDay();
              return (
                <div
                  key={ds}
                  className={cn(
                    "rounded-lg border overflow-hidden",
                    isToday && "border-primary/40"
                  )}
                >
                  <div
                    className={cn(
                      "flex items-center justify-between px-3 py-1.5",
                      isToday ? "bg-primary/5" : "bg-muted/30"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-xs font-semibold",
                          isToday
                            ? "text-primary"
                            : dow === 0
                            ? "text-red-500"
                            : dow === 6
                            ? "text-blue-500"
                            : "text-foreground"
                        )}
                      >
                        {d.getMonth() + 1}/{d.getDate()} (
                        {DAY_NAMES[dow]})
                      </span>
                      {isToday && (
                        <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                          오늘
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => openAdd(ds)}
                      className="text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {dayEvts.length > 0 ? (
                    <div className="px-3 py-2 space-y-1.5">
                      {dayEvts.map((e) => {
                        const style = getEventStyle(e);
                        return (
                          <div
                            key={e.id}
                            className={cn(
                              "flex items-center justify-between gap-2 px-2 py-1.5 rounded border",
                              style.bg,
                              style.border
                            )}
                          >
                            <div className="min-w-0">
                              <p
                                className={cn(
                                  "text-xs font-medium truncate",
                                  style.text
                                )}
                              >
                                {e.title}
                              </p>
                              {e.schoolName && (
                                <p className="text-[10px] text-muted-foreground">
                                  {e.schoolName}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => openEdit(e)}
                                disabled={isPending}
                                className="text-muted-foreground hover:text-primary transition-colors"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => handleDelete(e.id)}
                                disabled={isPending}
                                className="text-muted-foreground hover:text-destructive transition-colors"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-3 py-2 text-[10px] text-muted-foreground">
                      일정 없음
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// Compact inline event form for the panel
function PanelEventForm({
  form,
  setForm,
  editingId,
  isPending,
  onSubmit,
  onClose,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  editingId: string | null;
  isPending: boolean;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const NOTION_COLORS_LOCAL = NOTION_COLORS;

  return (
    <div className="rounded-lg border p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">
          {editingId ? "일정 수정" : "일정 등록"}
        </p>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <input
        type="text"
        placeholder="제목 *"
        value={form.title}
        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        className="w-full border rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-background"
      />

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">시작일 *</label>
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-background"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">종료일</label>
          <input
            type="date"
            value={form.endDate}
            onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
            className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-background"
          />
        </div>
      </div>

      <select
        value={form.type}
        onChange={(e) =>
          setForm((f) => ({
            ...f,
            type: e.target.value as CalendarEventType,
            schoolName: "",
          }))
        }
        className="w-full border rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-background"
      >
        <option value="PERSONAL">개인 일정</option>
        <option value="SCHOOL_EXAM">학교 시험</option>
        <option value="SCHOOL_EVENT">학교 행사</option>
        <option value="PLATFORM">플랫폼</option>
      </select>

      {form.type !== "PERSONAL" && (
        <input
          type="text"
          placeholder="학교명 (선택)"
          value={form.schoolName}
          onChange={(e) => setForm((f) => ({ ...f, schoolName: e.target.value }))}
          className="w-full border rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-background"
        />
      )}

      <textarea
        placeholder="설명 (선택)"
        value={form.description}
        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        rows={2}
        className="w-full border rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-background resize-none"
      />

      {/* Color picker */}
      <div className="space-y-1">
        <label className="text-[10px] text-muted-foreground">색상</label>
        <div className="flex items-center gap-1.5 flex-wrap">
          {Object.entries(NOTION_COLORS_LOCAL).map(([key, c]) => (
            <button
              key={key}
              type="button"
              title={c.label}
              onClick={() => setForm((f) => ({ ...f, color: key }))}
              className={cn(
                "w-4 h-4 rounded-full transition-all duration-150 border-2",
                c.dot,
                form.color === key
                  ? "border-foreground scale-125 shadow-sm"
                  : "border-transparent hover:scale-110 opacity-70 hover:opacity-100"
              )}
            />
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={onClose}
        >
          취소
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={onSubmit}
          disabled={isPending}
        >
          {editingId ? "저장" : "등록"}
        </Button>
      </div>
    </div>
  );
}
