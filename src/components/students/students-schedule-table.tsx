"use client";

import { useState, useTransition } from "react";
import { saveAttendanceSchedule } from "@/actions/attendance";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TimePickerInput } from "@/components/ui/time-picker";
import type { AttendanceSchedule, Student } from "@/generated/prisma";
import { Check, X, Pencil } from "lucide-react";

const DAYS = [
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
  { value: 0, label: "일" },
];

type DayState = { enabled: boolean; startTime: string; endTime: string };
type ScheduleMap = Record<number, DayState>;

type StudentWithSchedule = Student & { schedules: AttendanceSchedule[] };

function buildScheduleMap(schedules: AttendanceSchedule[]): ScheduleMap {
  const map: ScheduleMap = {};
  for (const d of DAYS) {
    const s = schedules.find((sc) => sc.dayOfWeek === d.value);
    map[d.value] = { enabled: !!s, startTime: s?.startTime ?? "09:00", endTime: s?.endTime ?? "22:00" };
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
    setEditMap(buildScheduleMap(student.schedules));
    setEditingId(student.id);
  }

  function cancelEdit() { setEditingId(null); }

  function toggle(day: number) {
    setEditMap((prev) => ({ ...prev, [day]: { ...prev[day], enabled: !prev[day].enabled } }));
  }

  function updateTime(day: number, field: "startTime" | "endTime", value: string) {
    setEditMap((prev) => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  }

  function save(studentId: string) {
    const schedules = DAYS.filter((d) => editMap[d.value]?.enabled).map((d) => ({
      dayOfWeek: d.value,
      startTime: editMap[d.value].startTime,
      endTime: editMap[d.value].endTime,
    }));
    startTransition(async () => {
      try {
        await saveAttendanceSchedule(studentId, schedules);
        toast.success("일정이 저장되었습니다");
        setEditingId(null);
      } catch {
        toast.error("저장 실패");
      }
    });
  }

  return (
    <div className="rounded-lg border overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
            <th className="px-3 py-2 text-center w-10">좌석</th>
            <th className="px-3 py-2 text-left w-20">이름</th>
            <th className="px-3 py-2 text-left">학교/학년</th>
            {DAYS.map((d) => (
              <th key={d.value} className="px-2 py-2 text-center w-28">{d.label}요일</th>
            ))}
            <th className="px-3 py-2 w-16"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((student) => {
            const isEditing = editingId === student.id;
            const schMap = buildScheduleMap(student.schedules);

            if (isEditing) {
              return (
                <tr key={student.id} className="border-b bg-blue-50/60 align-top">
                  <td className="px-3 py-2 text-center text-xs text-muted-foreground font-mono">
                    {student.seat ?? "-"}
                  </td>
                  <td className="px-3 py-2 font-medium text-xs">{student.name}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {[student.school, student.grade].filter(Boolean).join(" ")}
                  </td>
                  {DAYS.map((d) => {
                    const day = editMap[d.value];
                    return (
                      <td key={d.value} className="px-2 py-1.5">
                        <div className="flex flex-col gap-1">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={day?.enabled ?? false}
                              onChange={() => toggle(d.value)}
                              className="w-3.5 h-3.5 accent-blue-500"
                            />
                            <span className="text-xs text-muted-foreground">등원</span>
                          </label>
                          {day?.enabled && (
                            <>
                              <TimePickerInput
                                value={day.startTime}
                                onChange={(v) => updateTime(d.value, "startTime", v)}
                                size="sm"
                                className="w-full"
                              />
                              <TimePickerInput
                                value={day.endTime}
                                onChange={(v) => updateTime(d.value, "endTime", v)}
                                size="sm"
                                className="w-full"
                              />
                            </>
                          )}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-2 py-2">
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => save(student.id)}
                        disabled={isPending}
                        className="p-1 rounded bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50"
                        title="저장"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="p-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700"
                        title="취소"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            }

            return (
              <tr
                key={student.id}
                className="border-b hover:bg-muted/30 cursor-pointer group transition-colors"
                onClick={() => startEdit(student)}
              >
                <td className="px-3 py-2.5 text-center text-xs text-muted-foreground font-mono">
                  {student.seat ?? "-"}
                </td>
                <td className="px-3 py-2.5 font-medium text-sm">{student.name}</td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {[student.school, student.grade].filter(Boolean).join(" ")}
                </td>
                {DAYS.map((d) => {
                  const s = schMap[d.value];
                  return (
                    <td key={d.value} className="px-2 py-2.5 text-center">
                      {s.enabled ? (
                        <div className="text-xs">
                          <div className="text-foreground font-medium">{s.startTime}</div>
                          <div className="text-muted-foreground">~{s.endTime}</div>
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-2.5 text-right">
                  <Pencil className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors inline" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground px-3 py-2 border-t">
        행 클릭 → 인라인 편집 · 체크박스로 등원 요일 설정
      </p>
    </div>
  );
}
