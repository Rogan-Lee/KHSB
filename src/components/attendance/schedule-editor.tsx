"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { inputBaseClass } from "@/components/ui/input";
import { TimePickerInput } from "@/components/ui/time-picker";
import { EmptyState, FormActions, Section, StatusBadge } from "@/components/backoffice/ui";
import { saveAttendanceSchedule, saveOutingSchedules } from "@/actions/attendance";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { AttendanceSchedule, OutingSchedule, Student } from "@/generated/prisma";
import { CalendarClock, ChevronDown, Plus, Trash2 } from "lucide-react";

type StudentWithSchedules = Student & {
  schedules: AttendanceSchedule[];
  outings: OutingSchedule[];
};

interface Props {
  students: StudentWithSchedules[];
}

// 시각 입력(TimePickerInput) — SEED TextInput 모양(작은 높이)으로 덮어쓴다
const TIME_INPUT =
  "h-9 w-[5.5rem] rounded-r2 border-stroke-neutral-weak bg-bg-layer-default px-x2 py-0 t4-medium text-fg-neutral " +
  "focus:border-stroke-neutral-contrast focus:ring-1 focus:ring-stroke-neutral-contrast placeholder:text-fg-placeholder";

const TH = "h-10 whitespace-nowrap px-x3 text-left align-middle t3-medium text-fg-neutral-subtle";

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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rowMap, setRowMap] = useState<Record<string, Record<number, DayRow>>>(
    Object.fromEntries(students.map((s) => [s.id, initRows(s.schedules, s.outings)]))
  );
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

    startTransition(async () => {
      try {
        await Promise.all([
          saveAttendanceSchedule(studentId, schedules),
          saveOutingSchedules(studentId, outings),
        ]);
        toast.success("저장되었습니다");
      } catch {
        toast.error("저장 실패");
      }
    });
  }

  return (
    <Section
      flush
      title="원생별 일정"
      count={students.length}
      description="이름을 누르면 요일별 등원·외출 일정을 고칠 수 있어요."
    >
      {students.length === 0 ? (
        <EmptyState compact icon={CalendarClock} title="재원 중인 원생이 없어요" description="원생을 등록하면 여기서 등원 일정을 정할 수 있어요." />
      ) : (
      <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
      {students.map((student) => {
        const isExpanded = expandedId === student.id;
        const rows = rowMap[student.id];
        const enabledDays = DAYS.filter((d) => rows[d.value].enabled);
        const outingCount = DAYS.reduce((sum, d) => sum + rows[d.value].outings.filter((o) => o.outStart).length, 0);

        return (
          <li key={student.id}>
            <button
              type="button"
              aria-expanded={isExpanded}
              className={cn(
                "flex w-full items-center gap-x3 px-x5 py-x3_5 text-left transition-colors hover:bg-bg-layer-default-pressed",
                isExpanded && "bg-bg-layer-fill",
              )}
              onClick={() => setExpandedId(isExpanded ? null : student.id)}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-x1_5 sm:flex-row sm:items-center sm:gap-x4">
                <div className="flex shrink-0 items-baseline gap-x2 sm:w-40">
                  <span className="truncate t5-bold text-fg-neutral">{student.name}</span>
                  <span className="shrink-0 t3-regular text-fg-neutral-subtle">{student.grade}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x1">
                  {enabledDays.map((d) => {
                    const fs = rows[d.value].flexStart;
                    const fe = rows[d.value].flexEnd;
                    const tag = fs && fe ? "(자율)" : fs ? "(입실 자율)" : fe ? "(퇴실 자율)" : "";
                    return (
                      <StatusBadge
                        key={d.value}
                        tone={tag ? "violet" : "gray"}
                        className={tag ? "bg-palette-purple-100 text-palette-purple-700" : undefined}
                      >
                        {d.label}{tag}
                      </StatusBadge>
                    );
                  })}
                  {enabledDays.length === 0 && <span className="t3-regular text-fg-neutral-subtle">일정 없음</span>}
                  {outingCount > 0 && (
                    <StatusBadge tone="info">외출 {outingCount}건</StatusBadge>
                  )}
                </div>
              </div>
              <ChevronDown
                aria-hidden
                className={cn("size-5 shrink-0 text-fg-neutral-subtle transition-transform", isExpanded && "rotate-180")}
              />
            </button>

            {isExpanded && (
              <div className="border-t border-stroke-neutral-muted bg-bg-layer-fill px-x4 py-x4 sm:px-x5">
                <div className="overflow-x-auto rounded-r3 border border-stroke-neutral-muted bg-bg-layer-default">
                  <table className="w-full border-collapse t4-regular text-fg-neutral">
                    <thead>
                      <tr className="border-b border-stroke-neutral-muted bg-bg-layer-fill">
                        <th className={cn(TH, "w-12 text-center")}>등원</th>
                        <th className={cn(TH, "w-16")}>요일</th>
                        <th className={TH}>입실 약속</th>
                        <th className={TH}>퇴실 약속</th>
                        <th className={TH}>외출 일정</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DAYS.map((d) => {
                        const row = rows[d.value];
                        return (
                          <tr key={d.value} className="border-b border-stroke-neutral-muted align-top last:border-0">
                            <td className="px-x3 py-x3 text-center">
                              <Checkbox
                                checked={row.enabled}
                                onCheckedChange={(c) => updateDay(student.id, d.value, "enabled", c === true)}
                                aria-label={`${d.label}요일 등원`}
                                className="mt-x2"
                              />
                            </td>
                            <td className="whitespace-nowrap px-x3 py-x3">
                              <span className={cn("inline-block pt-x2 t4-bold", row.enabled ? "text-fg-neutral" : "text-fg-neutral-subtle")}>
                                {d.label}요일
                              </span>
                            </td>
                            <td className="px-x3 py-x3">
                              <div className="flex flex-col gap-x1_5">
                                {row.flexStart ? (
                                  <span className="inline-flex h-9 items-center t4-medium text-palette-purple-700">자율(미정)</span>
                                ) : (
                                  <TimePickerInput value={row.startTime} onChange={(v) => updateDay(student.id, d.value, "startTime", v)} disabled={!row.enabled} size="sm" className={TIME_INPUT} />
                                )}
                                {row.enabled && (
                                  <label className="inline-flex cursor-pointer items-center gap-x1_5">
                                    <Checkbox
                                      checked={row.flexStart}
                                      onCheckedChange={(c) => toggleFlex(student.id, d.value, "flexStart", c === true)}
                                    />
                                    <span className="t3-medium text-fg-neutral-muted">입실 자율</span>
                                  </label>
                                )}
                              </div>
                            </td>
                            <td className="px-x3 py-x3">
                              <div className="flex flex-col gap-x1_5">
                                {row.flexEnd ? (
                                  <span className="inline-flex h-9 items-center t4-medium text-palette-purple-700">자율(미정)</span>
                                ) : (
                                  <TimePickerInput value={row.endTime} onChange={(v) => updateDay(student.id, d.value, "endTime", v)} disabled={!row.enabled} size="sm" className={TIME_INPUT} />
                                )}
                                {row.enabled && (
                                  <label className="inline-flex cursor-pointer items-center gap-x1_5">
                                    <Checkbox
                                      checked={row.flexEnd}
                                      onCheckedChange={(c) => toggleFlex(student.id, d.value, "flexEnd", c === true)}
                                    />
                                    <span className="t3-medium text-fg-neutral-muted">퇴실 자율</span>
                                  </label>
                                )}
                              </div>
                            </td>
                            <td className="px-x3 py-x3">
                              <div className="flex flex-col gap-x1_5">
                              {row.outings.map((o, idx) => (
                                <div key={idx} className="flex items-center gap-x1_5">
                                  <TimePickerInput
                                    value={o.outStart}
                                    onChange={(v) => updateOuting(student.id, d.value, idx, "outStart", v)}
                                    disabled={!row.enabled}
                                    size="sm"
                                    className={TIME_INPUT}
                                  />
                                  <span className="t3-regular text-fg-neutral-subtle">~</span>
                                  <TimePickerInput
                                    value={o.outEnd}
                                    onChange={(v) => updateOuting(student.id, d.value, idx, "outEnd", v)}
                                    disabled={!row.enabled}
                                    size="sm"
                                    className={TIME_INPUT}
                                  />
                                  <input
                                    type="text"
                                    value={o.reason}
                                    onChange={(e) => updateOuting(student.id, d.value, idx, "reason", e.target.value)}
                                    disabled={!row.enabled}
                                    placeholder="사유"
                                    aria-label="외출 사유"
                                    className={cn(inputBaseClass, "h-9 w-28 px-x2 t3-regular")}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeOuting(student.id, d.value, idx)}
                                    aria-label="외출 일정 삭제"
                                    className="grid size-8 shrink-0 place-items-center rounded-r2 text-fg-neutral-subtle transition-colors hover:bg-bg-critical-weak hover:text-fg-critical"
                                  >
                                    <Trash2 className="size-4" />
                                  </button>
                                </div>
                              ))}
                              {row.enabled && (
                                <button
                                  type="button"
                                  onClick={() => addOuting(student.id, d.value)}
                                  className="inline-flex h-9 w-fit items-center gap-x1 rounded-r2 px-x1 t3-medium text-fg-neutral-muted transition-colors hover:text-fg-neutral"
                                >
                                  <Plus className="size-4" aria-hidden />외출 추가
                                </button>
                              )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <FormActions className="pt-x4">
                  <Button variant="outline" onClick={() => setExpandedId(null)}>닫기</Button>
                  <Button onClick={() => save(student.id)} disabled={isPending}>
                    {isPending ? "저장 중…" : "저장"}
                  </Button>
                </FormActions>
              </div>
            )}
          </li>
        );
      })}
      </ul>
      )}
    </Section>
  );
}
