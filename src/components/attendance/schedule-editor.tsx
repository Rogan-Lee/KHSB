"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { saveAttendanceSchedule } from "@/actions/attendance";
import { DAY_NAMES } from "@/lib/utils";
import { toast } from "sonner";
import type { AttendanceSchedule, Student } from "@/generated/prisma";
import { Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";

type StudentWithSchedules = Student & { schedules: AttendanceSchedule[] };

interface Props {
  students: StudentWithSchedules[];
}

export function ScheduleEditor({ students }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [scheduleMap, setScheduleMap] = useState<
    Record<string, { dayOfWeek: number; startTime: string; endTime: string }[]>
  >(
    Object.fromEntries(
      students.map((s) => [
        s.id,
        s.schedules.map((sc) => ({
          dayOfWeek: sc.dayOfWeek,
          startTime: sc.startTime,
          endTime: sc.endTime,
        })),
      ])
    )
  );
  const [isPending, startTransition] = useTransition();

  function addSchedule(studentId: string) {
    setScheduleMap((prev) => ({
      ...prev,
      [studentId]: [
        ...(prev[studentId] || []),
        { dayOfWeek: 1, startTime: "09:00", endTime: "22:00" },
      ],
    }));
  }

  function removeSchedule(studentId: string, idx: number) {
    setScheduleMap((prev) => ({
      ...prev,
      [studentId]: prev[studentId].filter((_, i) => i !== idx),
    }));
  }

  function updateSchedule(
    studentId: string,
    idx: number,
    field: "dayOfWeek" | "startTime" | "endTime",
    value: string | number
  ) {
    setScheduleMap((prev) => ({
      ...prev,
      [studentId]: prev[studentId].map((s, i) =>
        i === idx ? { ...s, [field]: value } : s
      ),
    }));
  }

  function saveStudentSchedule(studentId: string) {
    startTransition(async () => {
      try {
        await saveAttendanceSchedule(studentId, scheduleMap[studentId] || []);
        toast.success("일정이 저장되었습니다");
      } catch {
        toast.error("저장에 실패했습니다");
      }
    });
  }

  return (
    <div className="space-y-2">
      {students.map((student) => {
        const isExpanded = expandedId === student.id;
        const schedules = scheduleMap[student.id] || [];

        return (
          <div key={student.id} className="border rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors"
              onClick={() => setExpandedId(isExpanded ? null : student.id)}
            >
              <div className="flex items-center gap-3">
                <span className="font-medium">{student.name}</span>
                <span className="text-sm text-muted-foreground">{student.grade}</span>
                <div className="flex gap-1">
                  {schedules.map((s, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {DAY_NAMES[s.dayOfWeek]}
                    </Badge>
                  ))}
                  {schedules.length === 0 && (
                    <span className="text-xs text-muted-foreground">일정 없음</span>
                  )}
                </div>
              </div>
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 pt-2 bg-muted/20 space-y-3">
                {schedules.map((schedule, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      className="border rounded px-2 py-1.5 text-sm bg-background"
                      value={schedule.dayOfWeek}
                      onChange={(e) =>
                        updateSchedule(student.id, idx, "dayOfWeek", Number(e.target.value))
                      }
                    >
                      {DAY_NAMES.map((d, i) => (
                        <option key={i} value={i}>{d}요일</option>
                      ))}
                    </select>
                    <Input
                      type="time"
                      value={schedule.startTime}
                      onChange={(e) => updateSchedule(student.id, idx, "startTime", e.target.value)}
                      className="w-32 text-sm"
                    />
                    <span className="text-muted-foreground">~</span>
                    <Input
                      type="time"
                      value={schedule.endTime}
                      onChange={(e) => updateSchedule(student.id, idx, "endTime", e.target.value)}
                      className="w-32 text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSchedule(student.id, idx)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}

                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addSchedule(student.id)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    요일 추가
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => saveStudentSchedule(student.id)}
                    disabled={isPending}
                  >
                    저장
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
