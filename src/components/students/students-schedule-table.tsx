"use client";

import { useState, useTransition } from "react";
import { saveScheduleAndOutings } from "@/actions/attendance";
import { toast } from "sonner";
import { TimePickerInput } from "@/components/ui/time-picker";
import type { AttendanceSchedule, OutingSchedule, Student } from "@/generated/prisma";
import { X, Pencil, Plus, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { inputBaseClass } from "@/components/ui/input";
import { EmptyState, TableCard } from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";

const DAYS = [
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
  { value: 0, label: "일" },
];

type OutingEntry = { outStart: string; outEnd: string; reason: string };
type DayState = { enabled: boolean; flexStart: boolean; flexEnd: boolean; startTime: string; endTime: string; outings: OutingEntry[] };
type ScheduleMap = Record<number, DayState>;

type StudentWithSchedule = Student & { schedules: AttendanceSchedule[]; outings: OutingSchedule[] };

function buildScheduleMap(schedules: AttendanceSchedule[], outings: OutingSchedule[]): ScheduleMap {
  const map: ScheduleMap = {};
  for (const d of DAYS) {
    const s = schedules.find((sc) => sc.dayOfWeek === d.value);
    const dayOutings = outings
      .filter((o) => o.dayOfWeek === d.value)
      .map((o) => ({ outStart: o.outStart, outEnd: o.outEnd, reason: o.reason ?? "" }));
    map[d.value] = {
      enabled: !!s,
      flexStart: s?.startTime === "FLEXIBLE",
      flexEnd: s?.endTime === "FLEXIBLE",
      startTime: s?.startTime === "FLEXIBLE" ? "09:00" : (s?.startTime ?? "09:00"),
      endTime: s?.endTime === "FLEXIBLE" ? "22:00" : (s?.endTime ?? "22:00"),
      outings: dayOutings,
    };
  }
  return map;
}

interface Props {
  students: StudentWithSchedule[];
}

export function StudentsScheduleTable({ students }: Props) {
  const sorted = [...students].sort((a, b) => {
    const na = parseInt(a.seat ?? "9999"), nb = parseInt(b.seat ?? "9999");
    return isNaN(na) || isNaN(nb) ? (a.seat ?? "").localeCompare(b.seat ?? "") : na - nb;
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMap, setEditMap] = useState<ScheduleMap>({});
  const [isPending, startTransition] = useTransition();

  function startEdit(student: StudentWithSchedule) {
    setEditMap(buildScheduleMap(student.schedules, student.outings));
    setEditingId(student.id);
  }

  function cancelEdit() { setEditingId(null); }

  function toggle(day: number) {
    setEditMap((prev) => ({ ...prev, [day]: { ...prev[day], enabled: !prev[day].enabled } }));
  }

  function updateTime(day: number, field: "startTime" | "endTime", value: string) {
    setEditMap((prev) => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  }

  function addOuting(day: number) {
    setEditMap((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        outings: [...prev[day].outings, { outStart: "12:00", outEnd: "13:00", reason: "" }],
      },
    }));
  }

  function removeOuting(day: number, index: number) {
    setEditMap((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        outings: prev[day].outings.filter((_, i) => i !== index),
      },
    }));
  }

  function updateOuting(day: number, index: number, field: "outStart" | "outEnd" | "reason", value: string) {
    setEditMap((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        outings: prev[day].outings.map((o, i) => (i === index ? { ...o, [field]: value } : o)),
      },
    }));
  }

  function toggleFlex(day: number, field: "flexStart" | "flexEnd") {
    setEditMap((prev) => ({ ...prev, [day]: { ...prev[day], [field]: !prev[day][field] } }));
  }

  function save(studentId: string) {
    const schedules = DAYS.filter((d) => editMap[d.value]?.enabled).map((d) => ({
      dayOfWeek: d.value,
      startTime: editMap[d.value].flexStart ? "FLEXIBLE" : editMap[d.value].startTime,
      endTime: editMap[d.value].flexEnd ? "FLEXIBLE" : editMap[d.value].endTime,
    }));
    const allOutings = DAYS.filter((d) => editMap[d.value]?.enabled).flatMap((d) =>
      editMap[d.value].outings
        .filter((o) => o.outStart && o.outEnd)
        .map((o) => ({ dayOfWeek: d.value, outStart: o.outStart, outEnd: o.outEnd, reason: o.reason }))
    );
    startTransition(async () => {
      try {
        await saveScheduleAndOutings(studentId, schedules, allOutings);
        toast.success("일정이 저장되었습니다");
        setEditingId(null);
      } catch {
        toast.error("저장 실패");
      }
    });
  }

  if (sorted.length === 0) {
    return (
      <TableCard>
        <EmptyState
          icon={CalendarClock}
          title="재원 중인 원생이 없어요"
          description="재원생이 생기면 요일별 입실·퇴실 약속을 여기서 관리할 수 있어요."
        />
      </TableCard>
    );
  }

  const flexLabel = "t2-medium text-palette-purple-700";

  return (
    <TableCard
      footer={
        <span className="t3-regular text-fg-neutral-subtle">
          행을 누르면 바로 수정할 수 있어요 · 입퇴실 시간과 외출 일정을 요일별로 정해요
        </span>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse t4-regular text-fg-neutral tabular-nums">
          <thead className="bg-bg-layer-fill">
            <tr className="border-b border-stroke-neutral-muted">
              <th className="h-10 w-14 whitespace-nowrap px-x3 text-left t3-medium text-fg-neutral-subtle">좌석</th>
              <th className="h-10 w-24 whitespace-nowrap px-x3 text-left t3-medium text-fg-neutral-subtle">이름</th>
              <th className="h-10 whitespace-nowrap px-x3 text-left t3-medium text-fg-neutral-subtle">학교/학년</th>
              {DAYS.map((d) => (
                <th key={d.value} className="h-10 w-28 whitespace-nowrap px-x2 text-center t3-medium text-fg-neutral-subtle">
                  {d.label}요일
                </th>
              ))}
              <th className="h-10 w-20 px-x3"><span className="sr-only">편집</span></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((student) => {
              const isEditing = editingId === student.id;
              const schMap = buildScheduleMap(student.schedules, student.outings);

              if (isEditing) {
                return (
                  <tr key={student.id} className="border-b border-stroke-neutral-muted bg-bg-layer-fill align-top last:border-0">
                    <td className="px-x3 py-x3 t4-medium">{student.seat ?? "-"}</td>
                    <td className="whitespace-nowrap px-x3 py-x3 t4-medium">{student.name}</td>
                    <td className="px-x3 py-x3 t3-regular text-fg-neutral-muted">
                      {[student.school, student.grade].filter(Boolean).join(" ")}
                    </td>
                    {DAYS.map((d) => {
                      const day = editMap[d.value];
                      return (
                        <td key={d.value} className="px-x2 py-x2">
                          <div className="flex flex-col gap-x1_5">
                            <label className="flex cursor-pointer items-center gap-x1_5">
                              <Checkbox checked={day?.enabled ?? false} onCheckedChange={() => toggle(d.value)} />
                              <span className="t3-medium text-fg-neutral-muted">등원</span>
                            </label>
                            {day?.enabled && (
                              <>
                                <div className="flex flex-col gap-x1">
                                  <label className="flex cursor-pointer items-center gap-x1">
                                    <Checkbox checked={day.flexStart} onCheckedChange={() => toggleFlex(d.value, "flexStart")} />
                                    <span className={flexLabel}>입실 자율</span>
                                  </label>
                                  {day.flexStart ? (
                                    <span className="t3-medium text-palette-purple-700">자율(미정)</span>
                                  ) : (
                                    <TimePickerInput value={day.startTime} onChange={(v) => updateTime(d.value, "startTime", v)} size="sm" className="w-full" />
                                  )}
                                  <label className="mt-x1 flex cursor-pointer items-center gap-x1">
                                    <Checkbox checked={day.flexEnd} onCheckedChange={() => toggleFlex(d.value, "flexEnd")} />
                                    <span className={flexLabel}>퇴실 자율</span>
                                  </label>
                                  {day.flexEnd ? (
                                    <span className="t3-medium text-palette-purple-700">자율(미정)</span>
                                  ) : (
                                    <TimePickerInput value={day.endTime} onChange={(v) => updateTime(d.value, "endTime", v)} size="sm" className="w-full" />
                                  )}
                                </div>

                                {/* 외출 일정 */}
                                {day.outings.map((o, i) => (
                                  <div key={i} className="flex flex-col gap-x1 border-t border-stroke-neutral-muted pt-x1_5">
                                    <div className="flex items-center justify-between">
                                      <span className="t2-medium text-fg-warning">외출</span>
                                      <button
                                        type="button"
                                        onClick={() => removeOuting(d.value, i)}
                                        className="grid size-5 place-items-center rounded-full text-fg-neutral-subtle hover:bg-bg-transparent-pressed hover:text-fg-critical"
                                        aria-label={`${d.label}요일 외출 삭제`}
                                      >
                                        <X className="size-3" />
                                      </button>
                                    </div>
                                    <TimePickerInput
                                      value={o.outStart}
                                      onChange={(v) => updateOuting(d.value, i, "outStart", v)}
                                      size="sm"
                                      className="w-full"
                                    />
                                    <TimePickerInput
                                      value={o.outEnd}
                                      onChange={(v) => updateOuting(d.value, i, "outEnd", v)}
                                      size="sm"
                                      className="w-full"
                                    />
                                    <input
                                      type="text"
                                      placeholder="사유 (선택)"
                                      value={o.reason}
                                      onChange={(e) => updateOuting(d.value, i, "reason", e.target.value)}
                                      className={cn(inputBaseClass, "h-7 px-x2 t2-regular")}
                                    />
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => addOuting(d.value)}
                                  className="flex items-center gap-x0_5 self-start rounded-r1 t2-medium text-fg-neutral-muted hover:text-fg-neutral"
                                >
                                  <Plus className="size-3" />외출 추가
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-x2 py-x2">
                      <div className="flex flex-col gap-x1">
                        <Button size="xs" onClick={() => save(student.id)} disabled={isPending}>
                          {isPending ? "저장 중…" : "저장"}
                        </Button>
                        <Button size="xs" variant="ghost" onClick={cancelEdit} disabled={isPending}>
                          취소
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              }

              return (
                <tr
                  key={student.id}
                  className="group cursor-pointer border-b border-stroke-neutral-muted transition-colors last:border-0 hover:bg-bg-layer-default-pressed"
                  onClick={() => startEdit(student)}
                >
                  <td className="px-x3 py-x3 t4-medium">{student.seat ?? "-"}</td>
                  <td className="whitespace-nowrap px-x3 py-x3 t4-medium">{student.name}</td>
                  <td className="whitespace-nowrap px-x3 py-x3 t3-regular text-fg-neutral-muted">
                    {[student.school, student.grade].filter(Boolean).join(" ")}
                  </td>
                  {DAYS.map((d) => {
                    const s = schMap[d.value];
                    return (
                      <td key={d.value} className="px-x2 py-x3 text-center">
                        {s.enabled ? (
                          <div className="flex flex-col gap-x0_5">
                            <span className={s.flexStart ? "t3-medium text-palette-purple-700" : "t3-medium text-fg-neutral"}>
                              {s.flexStart ? "자율" : s.startTime}
                            </span>
                            <span className={s.flexEnd ? "t3-medium text-palette-purple-700" : "t3-regular text-fg-neutral-subtle"}>
                              {s.flexEnd ? "~자율" : `~${s.endTime}`}
                            </span>
                            {s.outings.map((o, i) => (
                              <span key={i} className="t2-regular text-fg-warning">
                                외출 {o.outStart}~{o.outEnd}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="t3-regular text-fg-placeholder">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-x3 py-x3 text-right">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); startEdit(student); }}
                      className="grid size-8 place-items-center rounded-full text-fg-placeholder transition-colors group-hover:text-fg-neutral-muted hover:bg-bg-transparent-pressed focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
                      aria-label={`${student.name} 일정 수정`}
                    >
                      <Pencil className="size-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </TableCard>
  );
}
