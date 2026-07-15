"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TimePickerInput } from "@/components/ui/time-picker";
import { scheduleScheduleChange, cancelScheduledChange } from "@/actions/attendance";
import { toast } from "sonner";
import type { AttendanceSchedule, OutingSchedule, Student } from "@/generated/prisma";
import { CalendarClock, ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";

type ScheduledChange = { id: string; effectiveDate: Date | string };

type StudentWithSchedules = Student & {
  schedules: AttendanceSchedule[];
  outings: OutingSchedule[];
  scheduledChanges: ScheduledChange[];
};

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

// 오늘(KST) YYYY-MM-DD — <input type="date"> min 값
function todayKSTStr(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

interface Props {
  students: StudentWithSchedules[];
}

const DAYS = [
  { value: 0, label: "일" },
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
];

type OutingEntry = { outStart: string; outEnd: string; reason: string };

type DayRow = {
  enabled: boolean;
  flexStart: boolean;
  flexEnd: boolean;
  startTime: string;
  endTime: string;
  outings: OutingEntry[];
};

function initRows(schedules: AttendanceSchedule[], outings: OutingSchedule[]): Record<number, DayRow> {
  const map: Record<number, DayRow> = {};
  for (const d of DAYS) {
    const sch = schedules.find((s) => s.dayOfWeek === d.value);
    const dayOutings = outings
      .filter((o) => o.dayOfWeek === d.value)
      .map((o) => ({ outStart: o.outStart, outEnd: o.outEnd, reason: o.reason ?? "" }));
    map[d.value] = {
      enabled: !!sch,
      flexStart: sch?.startTime === "FLEXIBLE",
      flexEnd: sch?.endTime === "FLEXIBLE",
      startTime: sch?.startTime === "FLEXIBLE" ? "09:00" : (sch?.startTime ?? "09:00"),
      endTime: sch?.endTime === "FLEXIBLE" ? "22:00" : (sch?.endTime ?? "22:00"),
      outings: dayOutings,
    };
  }
  return map;
}

export function ScheduleEditor({ students }: Props) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rowMap, setRowMap] = useState<Record<string, Record<number, DayRow>>>(
    Object.fromEntries(students.map((s) => [s.id, initRows(s.schedules, s.outings)]))
  );
  // 학생별 실행 예정일 ("" = 즉시 적용)
  const [effDate, setEffDate] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function updateDay(studentId: string, day: number, field: "enabled" | "startTime" | "endTime", value: string | boolean) {
    setRowMap((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], [day]: { ...prev[studentId][day], [field]: value } },
    }));
  }

  function addOuting(studentId: string, day: number) {
    setRowMap((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [day]: {
          ...prev[studentId][day],
          outings: [...prev[studentId][day].outings, { outStart: "", outEnd: "", reason: "" }],
        },
      },
    }));
  }

  function removeOuting(studentId: string, day: number, idx: number) {
    setRowMap((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [day]: {
          ...prev[studentId][day],
          outings: prev[studentId][day].outings.filter((_, i) => i !== idx),
        },
      },
    }));
  }

  function updateOuting(studentId: string, day: number, idx: number, field: keyof OutingEntry, value: string) {
    setRowMap((prev) => {
      const outings = prev[studentId][day].outings.map((o, i) => i === idx ? { ...o, [field]: value } : o);
      return { ...prev, [studentId]: { ...prev[studentId], [day]: { ...prev[studentId][day], outings } } };
    });
  }

  function toggleFlex(studentId: string, day: number, field: "flexStart" | "flexEnd", checked: boolean) {
    setRowMap((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [day]: { ...prev[studentId][day], [field]: checked },
      },
    }));
  }

  function save(studentId: string) {
    const rows = rowMap[studentId];
    const schedules = DAYS.filter((d) => rows[d.value].enabled).map((d) => ({
      dayOfWeek: d.value,
      startTime: rows[d.value].flexStart ? "FLEXIBLE" : rows[d.value].startTime,
      endTime: rows[d.value].flexEnd ? "FLEXIBLE" : rows[d.value].endTime,
    }));
    const outings = DAYS.flatMap((d) =>
      rows[d.value].enabled
        ? rows[d.value].outings.filter((o) => o.outStart).map((o) => ({ dayOfWeek: d.value, ...o }))
        : []
    );

    const date = effDate[studentId] || null;
    startTransition(async () => {
      try {
        const res = await scheduleScheduleChange(studentId, date, schedules, outings);
        if (res.applied) {
          toast.success("저장되었습니다");
        } else {
          toast.success(`${fmtDate(res.effectiveDate)}에 적용 예약되었습니다`);
        }
        setEffDate((prev) => ({ ...prev, [studentId]: "" }));
        router.refresh();
      } catch {
        toast.error("저장 실패");
      }
    });
  }

  function cancelReservation(id: string) {
    startTransition(async () => {
      try {
        await cancelScheduledChange(id);
        toast.success("예약이 취소되었습니다");
        router.refresh();
      } catch {
        toast.error("취소 실패");
      }
    });
  }

  return (
    <div className="space-y-2">
      {students.map((student) => {
        const isExpanded = expandedId === student.id;
        const rows = rowMap[student.id];
        const enabledDays = DAYS.filter((d) => rows[d.value].enabled);
        const outingCount = DAYS.reduce((sum, d) => sum + rows[d.value].outings.filter((o) => o.outStart).length, 0);

        return (
          <div key={student.id} className="border rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors text-left"
              onClick={() => setExpandedId(isExpanded ? null : student.id)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-medium text-sm shrink-0">{student.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">{student.grade}</span>
                <div className="flex gap-1 flex-wrap">
                  {enabledDays.map((d) => {
                    const fs = rows[d.value].flexStart;
                    const fe = rows[d.value].flexEnd;
                    const tag = fs && fe ? "(자율)" : fs ? "(입실 자율)" : fe ? "(퇴실 자율)" : "";
                    return (
                      <Badge key={d.value} variant="secondary" className={`text-xs ${tag ? "bg-violet-100 text-violet-700" : ""}`}>
                        {d.label}{tag}
                      </Badge>
                    );
                  })}
                  {enabledDays.length === 0 && <span className="text-xs text-muted-foreground">일정 없음</span>}
                </div>
                {outingCount > 0 && (
                  <Badge variant="outline" className="text-xs text-orange-600 border-orange-300 shrink-0">
                    외출 {outingCount}건
                  </Badge>
                )}
                {student.scheduledChanges.length > 0 && (
                  <Badge variant="outline" className="text-xs text-info border-info/40 shrink-0 gap-1">
                    <CalendarClock className="h-3 w-3" />
                    {student.scheduledChanges.length === 1
                      ? `${fmtDate(student.scheduledChanges[0].effectiveDate)} 예약`
                      : `예약 ${student.scheduledChanges.length}건`}
                  </Badge>
                )}
              </div>
              {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
            </button>

            {isExpanded && (
              <div className="border-t bg-muted/10">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                        <th className="px-3 py-2 text-center w-10">등원</th>
                        <th className="px-3 py-2 text-left w-14">요일</th>
                        <th className="px-3 py-2 text-left whitespace-nowrap">입실 약속</th>
                        <th className="px-3 py-2 text-left whitespace-nowrap">퇴실 약속</th>
                        <th className="px-3 py-2 text-left">외출 일정</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DAYS.map((d) => {
                        const row = rows[d.value];
                        return (
                          <tr key={d.value} className="border-b last:border-0 align-top">
                            <td className="px-3 py-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={row.enabled}
                                onChange={(e) => updateDay(student.id, d.value, "enabled", e.target.checked)}
                                className="w-4 h-4 accent-blue-500 cursor-pointer mt-0.5"
                              />
                            </td>
                            <td className="px-3 py-2.5 font-medium whitespace-nowrap">
                              <span className={row.enabled ? "" : "text-muted-foreground"}>{d.label}요일</span>
                            </td>
                            <td className="px-3 py-2.5">
                              {row.enabled && (
                                <label className="flex items-center gap-1 cursor-pointer mb-1">
                                  <input type="checkbox" checked={row.flexStart}
                                    onChange={(e) => toggleFlex(student.id, d.value, "flexStart", e.target.checked)}
                                    className="w-3 h-3 accent-violet-500" />
                                  <span className="text-[10px] text-violet-600">자율</span>
                                </label>
                              )}
                              {row.flexStart ? (
                                <span className="text-xs text-violet-600 font-medium">자율(미정)</span>
                              ) : (
                                <TimePickerInput value={row.startTime} onChange={(v) => updateDay(student.id, d.value, "startTime", v)} disabled={!row.enabled} size="sm" />
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              {row.enabled && (
                                <label className="flex items-center gap-1 cursor-pointer mb-1">
                                  <input type="checkbox" checked={row.flexEnd}
                                    onChange={(e) => toggleFlex(student.id, d.value, "flexEnd", e.target.checked)}
                                    className="w-3 h-3 accent-violet-500" />
                                  <span className="text-[10px] text-violet-600">자율</span>
                                </label>
                              )}
                              {row.flexEnd ? (
                                <span className="text-xs text-violet-600 font-medium">자율(미정)</span>
                              ) : (
                                <TimePickerInput value={row.endTime} onChange={(v) => updateDay(student.id, d.value, "endTime", v)} disabled={!row.enabled} size="sm" />
                              )}
                            </td>
                            <td className="px-3 py-2 space-y-1.5">
                              {row.outings.map((o, idx) => (
                                <div key={idx} className="flex items-center gap-1.5">
                                  <TimePickerInput
                                    value={o.outStart}
                                    onChange={(v) => updateOuting(student.id, d.value, idx, "outStart", v)}
                                    disabled={!row.enabled}
                                    size="sm"
                                  />
                                  <span className="text-xs text-muted-foreground">~</span>
                                  <TimePickerInput
                                    value={o.outEnd}
                                    onChange={(v) => updateOuting(student.id, d.value, idx, "outEnd", v)}
                                    disabled={!row.enabled}
                                    size="sm"
                                  />
                                  <input
                                    type="text"
                                    value={o.reason}
                                    onChange={(e) => updateOuting(student.id, d.value, idx, "reason", e.target.value)}
                                    disabled={!row.enabled}
                                    placeholder="사유"
                                    className="border rounded px-2 py-1 text-xs w-24 disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-blue-400 bg-background"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeOuting(student.id, d.value, idx)}
                                    className="text-muted-foreground hover:text-destructive"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ))}
                              {row.enabled && (
                                <button
                                  type="button"
                                  onClick={() => addOuting(student.id, d.value)}
                                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                >
                                  <Plus className="h-3 w-3" />외출 추가
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 border-t space-y-3">
                  {student.scheduledChanges.length > 0 && (
                    <div className="space-y-1">
                      {student.scheduledChanges.map((c) => (
                        <div key={c.id} className="flex items-center gap-2 text-xs text-info">
                          <CalendarClock className="h-3.5 w-3.5" />
                          <span>{fmtDate(c.effectiveDate)}에 변경 적용 예약됨</span>
                          <button
                            type="button"
                            onClick={() => cancelReservation(c.id)}
                            disabled={isPending}
                            className="text-muted-foreground hover:text-destructive inline-flex items-center gap-0.5"
                          >
                            <X className="h-3 w-3" />취소
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      실행 예정일
                      <input
                        type="date"
                        min={todayKSTStr()}
                        value={effDate[student.id] ?? ""}
                        onChange={(e) => setEffDate((prev) => ({ ...prev, [student.id]: e.target.value }))}
                        className="border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </label>
                    <Button size="sm" onClick={() => save(student.id)} disabled={isPending}>
                      {effDate[student.id] ? "적용 예약" : "저장"}
                    </Button>
                    {effDate[student.id] && (
                      <span className="text-[11px] text-muted-foreground">
                        지정일 00시에 자동 반영됩니다
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
