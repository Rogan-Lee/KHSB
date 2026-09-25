"use client";

import { useState, useTransition } from "react";
import { saveAttendanceSchedule, saveOutingSchedules } from "@/actions/attendance";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { inputBaseClass } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TimePickerInput } from "@/components/ui/time-picker";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
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

  const flexToggle = (day: number, field: "flexStart" | "flexEnd", checked: boolean) =>
    setRows((prev) => ({ ...prev, [day]: { ...prev[day], [field]: checked } }));

  // 표는 카드(Section flush) 가장자리까지 붙고, 저장 버튼은 아래 줄 오른쪽
  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16 text-center">등원</TableHead>
            <TableHead className="w-20">요일</TableHead>
            <TableHead>입실 약속</TableHead>
            <TableHead>퇴실 약속</TableHead>
            <TableHead>외출 일정</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {DAYS.map((d) => {
            const row = rows[d.value];
            return (
              <TableRow key={d.value} className="align-top hover:bg-transparent">
                <TableCell className="text-center">
                  <Checkbox
                    checked={row.enabled}
                    onCheckedChange={(v) => updateDay(d.value, "enabled", v === true)}
                    aria-label={`${d.label}요일 등원`}
                    className="mt-x1_5"
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <span className={cn("inline-block pt-x1_5 t4-medium", row.enabled ? "text-fg-neutral" : "text-fg-neutral-subtle")}>
                    {d.label}요일
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-x1_5">
                    {row.flexStart ? (
                      <span className="inline-flex h-8 items-center t3-medium text-palette-purple-700">자율(미정)</span>
                    ) : (
                      <TimePickerInput value={row.startTime} onChange={(v) => updateDay(d.value, "startTime", v)} disabled={!row.enabled} size="sm" />
                    )}
                    {row.enabled && (
                      <label className="flex cursor-pointer items-center gap-x1_5">
                        <Checkbox checked={row.flexStart} onCheckedChange={(v) => flexToggle(d.value, "flexStart", v === true)} />
                        <span className="t3-medium text-fg-neutral-muted">자율</span>
                      </label>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-x1_5">
                    {row.flexEnd ? (
                      <span className="inline-flex h-8 items-center t3-medium text-palette-purple-700">자율(미정)</span>
                    ) : (
                      <TimePickerInput value={row.endTime} onChange={(v) => updateDay(d.value, "endTime", v)} disabled={!row.enabled} size="sm" />
                    )}
                    {row.enabled && (
                      <label className="flex cursor-pointer items-center gap-x1_5">
                        <Checkbox checked={row.flexEnd} onCheckedChange={(v) => flexToggle(d.value, "flexEnd", v === true)} />
                        <span className="t3-medium text-fg-neutral-muted">자율</span>
                      </label>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-x1_5">
                    {row.outings.map((o, idx) => (
                      <div key={idx} className="flex flex-wrap items-center gap-x1_5">
                        <TimePickerInput
                          value={o.outStart}
                          onChange={(v) => updateOuting(d.value, idx, "outStart", v)}
                          disabled={!row.enabled}
                          size="sm"
                        />
                        <span className="t3-regular text-fg-neutral-subtle">~</span>
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
                          aria-label={`${d.label}요일 외출 사유`}
                          className={cn(inputBaseClass, "h-8 w-28 px-x2 t3-regular")}
                        />
                        <button
                          type="button"
                          onClick={() => removeOuting(d.value, idx)}
                          className="grid size-8 place-items-center rounded-full text-fg-neutral-subtle transition-colors hover:bg-bg-transparent-pressed hover:text-fg-critical"
                          aria-label={`${d.label}요일 외출 삭제`}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))}
                    {row.enabled ? (
                      <button
                        type="button"
                        onClick={() => addOuting(d.value)}
                        className="inline-flex h-8 items-center gap-x1 self-start rounded-r2 t3-medium text-fg-neutral-muted transition-colors hover:text-fg-neutral"
                      >
                        <Plus className="size-3.5" />외출 추가
                      </button>
                    ) : (
                      row.outings.length === 0 && <span className="inline-flex h-8 items-center t3-regular text-fg-placeholder">—</span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <div className="flex justify-end border-t border-stroke-neutral-muted px-x5 py-x4">
        <Button onClick={save} disabled={isPending}>
          {isPending ? "저장 중…" : "일정 저장"}
        </Button>
      </div>
    </div>
  );
}
