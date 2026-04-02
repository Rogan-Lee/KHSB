"use client";

import { useState, useTransition } from "react";
import { saveAttendanceSchedule, saveOutingSchedules } from "@/actions/attendance";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TimePickerInput } from "@/components/ui/time-picker";
import { Plus, Trash2 } from "lucide-react";
import type { AttendanceSchedule, OutingSchedule } from "@/generated/prisma";

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

interface Props {
  studentId: string;
  schedules: AttendanceSchedule[];
  outings: OutingSchedule[];
}

export function StudentScheduleEditor({ studentId, schedules, outings }: Props) {
  const [rows, setRows] = useState(() => initRows(schedules, outings));
  const [isPending, startTransition] = useTransition();

  function updateDay(day: number, field: "enabled" | "startTime" | "endTime", value: string | boolean) {
    setRows((prev) => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  }

  function addOuting(day: number) {
    setRows((prev) => ({
      ...prev,
      [day]: { ...prev[day], outings: [...prev[day].outings, { outStart: "", outEnd: "", reason: "" }] },
    }));
  }

  function removeOuting(day: number, idx: number) {
    setRows((prev) => ({
      ...prev,
      [day]: { ...prev[day], outings: prev[day].outings.filter((_, i) => i !== idx) },
    }));
  }

  function updateOuting(day: number, idx: number, field: keyof OutingEntry, value: string) {
    setRows((prev) => {
      const outings = prev[day].outings.map((o, i) => i === idx ? { ...o, [field]: value } : o);
      return { ...prev, [day]: { ...prev[day], outings } };
    });
  }

  function save() {
    const scheduleData = DAYS.filter((d) => rows[d.value].enabled).map((d) => ({
      dayOfWeek: d.value,
      startTime: rows[d.value].flexStart ? "FLEXIBLE" : rows[d.value].startTime,
      endTime: rows[d.value].flexEnd ? "FLEXIBLE" : rows[d.value].endTime,
    }));
    const outingData = DAYS.flatMap((d) =>
      rows[d.value].enabled
        ? rows[d.value].outings.filter((o) => o.outStart).map((o) => ({ dayOfWeek: d.value, ...o }))
        : []
    );

    startTransition(async () => {
      try {
        await Promise.all([
          saveAttendanceSchedule(studentId, scheduleData),
          saveOutingSchedules(studentId, outingData),
        ]);
        toast.success("저장되었습니다");
      } catch {
        toast.error("저장 실패");
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        등원 요일을 체크하고 입·퇴실 시간을 입력하세요. 외출 약속이 있으면 해당 요일에 외출을 추가하세요.
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-muted/50 border-b text-xs text-muted-foreground">
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
                      onChange={(e) => updateDay(d.value, "enabled", e.target.checked)}
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
                          onChange={(e) => setRows((prev) => ({ ...prev, [d.value]: { ...prev[d.value], flexStart: e.target.checked } }))}
                          className="w-3 h-3 accent-violet-500" />
                        <span className="text-[10px] text-violet-600">자율</span>
                      </label>
                    )}
                    {row.flexStart ? (
                      <span className="text-xs text-violet-600 font-medium">자율(미정)</span>
                    ) : (
                      <TimePickerInput value={row.startTime} onChange={(v) => updateDay(d.value, "startTime", v)} disabled={!row.enabled} size="sm" />
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {row.enabled && (
                      <label className="flex items-center gap-1 cursor-pointer mb-1">
                        <input type="checkbox" checked={row.flexEnd}
                          onChange={(e) => setRows((prev) => ({ ...prev, [d.value]: { ...prev[d.value], flexEnd: e.target.checked } }))}
                          className="w-3 h-3 accent-violet-500" />
                        <span className="text-[10px] text-violet-600">자율</span>
                      </label>
                    )}
                    {row.flexEnd ? (
                      <span className="text-xs text-violet-600 font-medium">자율(미정)</span>
                    ) : (
                      <TimePickerInput value={row.endTime} onChange={(v) => updateDay(d.value, "endTime", v)} disabled={!row.enabled} size="sm" />
                    )}
                  </td>
                  <td className="px-3 py-2 space-y-1.5">
                    {row.outings.map((o, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <TimePickerInput
                          value={o.outStart}
                          onChange={(v) => updateOuting(d.value, idx, "outStart", v)}
                          disabled={!row.enabled}
                          size="sm"
                        />
                        <span className="text-xs text-muted-foreground">~</span>
                        <TimePickerInput
                          value={o.outEnd}
                          onChange={(v) => updateOuting(d.value, idx, "outEnd", v)}
                          disabled={!row.enabled}
                          size="sm"
                        />
                        <input
                          type="text"
                          value={o.reason}
                          onChange={(e) => updateOuting(d.value, idx, "reason", e.target.value)}
                          disabled={!row.enabled}
                          placeholder="사유"
                          className="border rounded px-2 py-1 text-xs w-24 disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-blue-400 bg-background"
                        />
                        <button
                          type="button"
                          onClick={() => removeOuting(d.value, idx)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {row.enabled && (
                      <button
                        type="button"
                        onClick={() => addOuting(d.value)}
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
      <Button onClick={save} disabled={isPending} size="sm">
        {isPending ? "저장 중..." : "일정 저장"}
      </Button>
    </div>
  );
}
