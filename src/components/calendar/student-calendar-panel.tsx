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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import { Check, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, X } from "lucide-react";
import type { CalendarEvent, CalendarEventType } from "@/generated/prisma";
import { FormActions, FormField, Segmented, Skeleton, StatusBadge } from "@/components/backoffice/ui";
import { ConfirmDialog } from "./confirm-dialog";
import { EVENT_COLOR_OPTIONS, eventTone, eventToneByKey, normalizeEventColor, weekdayTextClass } from "./event-tones";

type EventWithStudent = CalendarEvent & {
  student: { id: string; name: string } | null;
};

const DEFAULT_COLOR = "purple";

const EVENT_TYPE_CONFIG: Record<CalendarEventType, { label: string }> = {
  SCHOOL_EXAM:  { label: "학교 시험" },
  SCHOOL_EVENT: { label: "학교 행사" },
  PERSONAL:     { label: "개인 일정" },
  PLATFORM:     { label: "플랫폼" },
};

function getEventStyle(event: EventWithStudent) {
  return eventTone(event.color, DEFAULT_COLOR);
}

const iconBtn =
  "grid size-x8 shrink-0 place-items-center rounded-full text-fg-neutral-muted transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral disabled:text-fg-disabled";

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
  // 불러오기 완료된 조회 범위 — 현재 범위와 다르면 로딩 중(effect 안에서 동기 setState 를 하지 않기 위해 파생값으로 계산)
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
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

  const rangeKey = `${studentId}:${year}-${month}`;
  const loading = loadedKey !== rangeKey;

  useEffect(() => {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month + 2, 0);
    getStudentCalendarEvents({ studentId, schoolName, startDate: start, endDate: end })
      .then(setEvents)
      .catch(() => toast.error("일정 불러오기 실패"))
      .finally(() => setLoadedKey(rangeKey));
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

  const [confirmDelete, setConfirmDelete] = useState<EventWithStudent | null>(null);

  // 달력 칸 — 마지막 줄을 7칸으로 채워 격자를 닫는다(표시용)
  const monthCells: (number | null)[] = [...cells, ...Array((7 - (cells.length % 7)) % 7).fill(null)];

  const eventForm = (
    <PanelEventForm
      form={form}
      setForm={setForm}
      editingId={editingId}
      isPending={isPending}
      onSubmit={handleSubmit}
      onClose={closeForm}
    />
  );

  // 일정 한 줄 — 렌더 함수(컴포넌트로 만들면 매 렌더마다 다시 마운트된다)
  function renderEventRow(e: EventWithStudent) {
    const style = getEventStyle(e);
    return (
      <div key={e.id} className="flex items-start gap-x2 rounded-r2 bg-bg-layer-default px-x2_5 py-x2">
        <span className={cn("mt-x1_5 size-2 shrink-0 rounded-full", style.swatch)} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate t3-medium text-fg-neutral">{e.title}</p>
          <p className="truncate t2-regular text-fg-neutral-subtle">
            {[EVENT_TYPE_CONFIG[e.type].label, e.schoolName].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="-my-x1 -mr-x1 flex shrink-0 items-center">
          <button type="button" onClick={() => openEdit(e)} disabled={isPending} aria-label="일정 수정" className={iconBtn}>
            <Pencil className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(e)}
            disabled={isPending}
            aria-label="일정 삭제"
            className={cn(iconBtn, "hover:text-fg-critical")}
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-x3">
      {/* Header */}
      <div className="flex flex-col gap-x2">
        <div className="flex items-center justify-between gap-x2">
          <div className="flex min-w-0 items-center">
            <button
              type="button"
              onClick={viewMode === "month" ? prevMonth : prevWeek}
              aria-label={viewMode === "month" ? "이전 달" : "이전 주"}
              className={iconBtn}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <span className="min-w-0 truncate px-x1 t5-bold tabular-nums text-fg-neutral">
              {viewMode === "month" ? `${year}년 ${month + 1}월` : weekLabel}
            </span>
            <button
              type="button"
              onClick={viewMode === "month" ? nextMonth : nextWeek}
              aria-label={viewMode === "month" ? "다음 달" : "다음 주"}
              className={iconBtn}
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
          <Button variant="outline" size="xs" onClick={goToday}>
            오늘
          </Button>
        </div>
        <div className="flex items-center gap-x2">
          <Segmented
            aria-label="보기 전환"
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: "month", label: "월" },
              { value: "week", label: "주" },
            ]}
            className="flex-1"
          />
          <Button size="sm" onClick={() => openAdd()}>
            <Plus aria-hidden />
            일정 추가
          </Button>
        </div>
      </div>

      {loading && (
        <div className="flex flex-col gap-x2" aria-busy="true" aria-label="일정 불러오는 중">
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {/* Month View */}
      {!loading && viewMode === "month" && (
        <>
          <div className="overflow-hidden rounded-r3 border border-stroke-neutral-muted bg-bg-layer-default">
            <div className="grid grid-cols-7 border-b border-stroke-neutral-muted bg-bg-layer-fill">
              {DAY_NAMES.map((d, i) => (
                <div key={d} className={cn("py-x1_5 text-center t2-medium", weekdayTextClass(i))}>
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {monthCells.map((day, idx) => {
                const lastCol = (idx + 1) % 7 === 0;
                const lastRow = idx >= monthCells.length - 7;
                const edge = cn("border-stroke-neutral-muted", !lastCol && "border-r", !lastRow && "border-b");
                if (!day) return <div key={`e-${idx}`} className={cn("min-h-16 bg-bg-layer-fill", edge)} />;
                const ds = dateStr(day);
                const dayEvts = eventsOnDate(ds);
                const isToday = ds === todayStr;
                const isSelected = ds === selectedDate;
                const dow = (firstDay + day - 1) % 7;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      setSelectedDate(isSelected ? null : ds);
                      setShowForm(false);
                    }}
                    aria-pressed={isSelected}
                    aria-label={`${month + 1}월 ${day}일${dayEvts.length > 0 ? `, 일정 ${dayEvts.length}개` : ""}`}
                    className={cn(
                      "flex min-h-16 min-w-0 flex-col gap-x0_5 p-x1 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-stroke-focus-ring",
                      edge,
                      isSelected ? "bg-bg-brand-weak" : "hover:bg-bg-layer-default-pressed"
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-x5 shrink-0 place-items-center rounded-full tabular-nums",
                        isToday
                          ? "bg-bg-brand-solid t2-bold text-palette-static-white"
                          : cn("t2-medium", dow === 0 ? "text-fg-critical" : dow === 6 ? "text-fg-informative" : "text-fg-neutral")
                      )}
                    >
                      {day}
                    </span>
                    {dayEvts.slice(0, 2).map((e) => (
                      <span
                        key={e.id}
                        className={cn("block truncate rounded-r1 px-x1 t1-medium", getEventStyle(e).chip)}
                      >
                        {e.title}
                      </span>
                    ))}
                    {dayEvts.length > 2 && (
                      <span className="px-x1 t1-medium text-fg-neutral-subtle">+{dayEvts.length - 2}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected date events or form */}
          {showForm ? (
            <div className="rounded-r3 bg-bg-layer-fill p-x4">{eventForm}</div>
          ) : selectedDate ? (
            <div className="flex flex-col gap-x2 rounded-r3 bg-bg-layer-fill p-x3">
              <div className="flex items-center justify-between gap-x2">
                <p className="t4-bold text-fg-neutral">
                  {new Date(selectedDate + "T00:00:00").toLocaleDateString("ko-KR", {
                    month: "long",
                    day: "numeric",
                    weekday: "short",
                  })}
                </p>
                <div className="flex items-center">
                  <Button variant="ghost" size="xs" onClick={() => openAdd(selectedDate)}>
                    <Plus aria-hidden />
                    추가
                  </Button>
                  <button type="button" onClick={() => setSelectedDate(null)} aria-label="닫기" className={iconBtn}>
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
              </div>
              {selectedEvents.length === 0 ? (
                <p className="py-x3 text-center t3-regular text-fg-neutral-subtle">이 날은 일정이 없어요</p>
              ) : (
                <div className="flex flex-col gap-x1_5">
                  {selectedEvents.map(renderEventRow)}
                </div>
              )}
            </div>
          ) : null}
        </>
      )}

      {/* Week View */}
      {!loading && viewMode === "week" && (
        <div className="flex flex-col gap-x2">
          {showForm ? (
            <div className="rounded-r3 bg-bg-layer-fill p-x4">{eventForm}</div>
          ) : (
            weekDays.map((d) => {
              const ds = toDateStr(d);
              const dayEvts = eventsOnDate(ds);
              const isToday = ds === todayStr;
              const dow = d.getDay();
              return (
                <div key={ds} className="rounded-r3 bg-bg-layer-fill px-x3 py-x2">
                  <div className="flex items-center justify-between gap-x2">
                    <div className="flex items-center gap-x1_5">
                      <span
                        className={cn(
                          "t3-bold tabular-nums",
                          isToday ? "text-fg-brand" : dow === 0 ? "text-fg-critical" : dow === 6 ? "text-fg-informative" : "text-fg-neutral"
                        )}
                      >
                        {d.getMonth() + 1}/{d.getDate()} ({DAY_NAMES[dow]})
                      </span>
                      {isToday && <StatusBadge tone="brand">오늘</StatusBadge>}
                    </div>
                    <button
                      type="button"
                      onClick={() => openAdd(ds)}
                      aria-label={`${d.getMonth() + 1}월 ${d.getDate()}일에 일정 추가`}
                      className={cn(iconBtn, "-mr-x1 size-x7")}
                    >
                      <Plus className="size-4" aria-hidden />
                    </button>
                  </div>
                  {dayEvts.length > 0 ? (
                    <div className="mt-x1_5 flex flex-col gap-x1_5">
                      {dayEvts.map(renderEventRow)}
                    </div>
                  ) : (
                    <p className="t2-regular text-fg-placeholder">일정 없음</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        title="이 일정을 삭제할까요?"
        description={confirmDelete ? `'${confirmDelete.title}' 일정이 캘린더에서 사라져요.` : undefined}
        pending={isPending}
        onConfirm={() => {
          if (confirmDelete) handleDelete(confirmDelete.id);
          setConfirmDelete(null);
        }}
      />
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
  const selectedColor = normalizeEventColor(form.color, DEFAULT_COLOR);

  return (
    <div className="flex flex-col gap-x3">
      <div className="flex items-center justify-between gap-x2">
        <p className="t5-bold text-fg-neutral">{editingId ? "일정 수정" : "일정 등록"}</p>
        <button type="button" onClick={onClose} aria-label="닫기" className={cn(iconBtn, "-mr-x2")}>
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <FormField label="제목" required htmlFor="panel-event-title">
        <Input
          id="panel-event-title"
          type="text"
          placeholder="일정 제목"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-x2">
        <FormField label="시작일" required>
          <DatePicker value={form.startDate || null} onChange={(d) => setForm((f) => ({ ...f, startDate: d ?? "" }))} placeholder="날짜 선택" />
        </FormField>
        <FormField label="종료일">
          <DatePicker value={form.endDate || null} onChange={(d) => setForm((f) => ({ ...f, endDate: d ?? "" }))} placeholder="날짜 선택" />
        </FormField>
      </div>

      <FormField label="유형">
        <Select
          value={form.type}
          onValueChange={(v) =>
            setForm((f) => ({
              ...f,
              type: v as CalendarEventType,
              schoolName: "",
            }))
          }
        >
          <SelectTrigger aria-label="일정 유형">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PERSONAL">개인 일정</SelectItem>
            <SelectItem value="SCHOOL_EXAM">학교 시험</SelectItem>
            <SelectItem value="SCHOOL_EVENT">학교 행사</SelectItem>
            <SelectItem value="PLATFORM">플랫폼</SelectItem>
          </SelectContent>
        </Select>
      </FormField>

      {form.type !== "PERSONAL" && (
        <FormField label="학교명" htmlFor="panel-event-school">
          <Input
            id="panel-event-school"
            type="text"
            placeholder="학교명 (선택)"
            value={form.schoolName}
            onChange={(e) => setForm((f) => ({ ...f, schoolName: e.target.value }))}
          />
        </FormField>
      )}

      <FormField label="설명" htmlFor="panel-event-description">
        <Textarea
          id="panel-event-description"
          placeholder="설명 (선택)"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={2}
          className="min-h-0 resize-none"
        />
      </FormField>

      {/* Color picker */}
      <FormField label="색상">
        <div role="radiogroup" aria-label="색상" className="flex flex-wrap items-center gap-x1_5">
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
                  "grid size-x6 place-items-center rounded-full transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring",
                  c.swatch,
                  selected ? "scale-100" : "scale-90 hover:scale-100"
                )}
              >
                {selected && <Check className="size-3 text-palette-static-white" strokeWidth={3} aria-hidden />}
              </button>
            );
          })}
        </div>
      </FormField>

      <FormActions className="pt-x1">
        <Button variant="ghost" size="sm" onClick={onClose}>
          취소
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={isPending}>
          {isPending ? "저장 중…" : editingId ? "저장" : "등록"}
        </Button>
      </FormActions>
    </div>
  );
}
