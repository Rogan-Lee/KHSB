"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";

export type AttendanceSlot = { dayOfWeek: number; startTime: string; endTime: string };
export type OutingSlot = { dayOfWeek: number; outStart: string; outEnd: string; reason?: string | null };

const DAYS: { value: number; label: string }[] = [
  { value: 1, label: "월" }, { value: 2, label: "화" }, { value: 3, label: "수" },
  { value: 4, label: "목" }, { value: 5, label: "금" }, { value: 6, label: "토" }, { value: 0, label: "일" },
];

export function ScheduleSlotsEditor({
  attendance,
  outings,
  onAttendanceChange,
  onOutingsChange,
  readOnly = false,
}: {
  attendance: AttendanceSlot[];
  outings: OutingSlot[];
  onAttendanceChange?: (next: AttendanceSlot[]) => void;
  onOutingsChange?: (next: OutingSlot[]) => void;
  readOnly?: boolean;
}) {
  const attByDay = new Map(attendance.map((a) => [a.dayOfWeek, a]));

  function toggleDay(day: number, on: boolean) {
    if (!onAttendanceChange) return;
    if (on) onAttendanceChange([...attendance.filter((a) => a.dayOfWeek !== day), { dayOfWeek: day, startTime: "09:00", endTime: "22:00" }]);
    else onAttendanceChange(attendance.filter((a) => a.dayOfWeek !== day));
  }
  function setAttTime(day: number, field: "startTime" | "endTime", value: string) {
    if (!onAttendanceChange) return;
    onAttendanceChange(attendance.map((a) => (a.dayOfWeek === day ? { ...a, [field]: value } : a)));
  }
  function addOuting() {
    onOutingsChange?.([...outings, { dayOfWeek: 1, outStart: "18:00", outEnd: "20:00", reason: "" }]);
  }
  function setOuting(idx: number, patch: Partial<OutingSlot>) {
    onOutingsChange?.(outings.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  }
  function removeOuting(idx: number) {
    onOutingsChange?.(outings.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-medium">주간 등하원 시간</p>
        <div className="space-y-1.5">
          {DAYS.map((d) => {
            const slot = attByDay.get(d.value);
            const on = !!slot;
            return (
              <div key={d.value} className="flex items-center gap-2 text-sm">
                <label className="flex w-12 items-center gap-1.5 select-none">
                  <input type="checkbox" checked={on} disabled={readOnly} onChange={(e) => toggleDay(d.value, e.target.checked)} className="h-3.5 w-3.5" />
                  <span className={on ? "font-medium" : "text-muted-foreground"}>{d.label}</span>
                </label>
                {on ? (
                  <div className="flex items-center gap-1.5">
                    <Input type="time" value={slot!.startTime} disabled={readOnly} onChange={(e) => setAttTime(d.value, "startTime", e.target.value)} className="h-8 w-28" />
                    <span className="text-muted-foreground">~</span>
                    <Input type="time" value={slot!.endTime} disabled={readOnly} onChange={(e) => setAttTime(d.value, "endTime", e.target.value)} className="h-8 w-28" />
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">등원 안 함</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium">학원·외출 일정</p>
          {!readOnly && (
            <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={addOuting}>
              <Plus className="h-3.5 w-3.5" />추가
            </Button>
          )}
        </div>
        {outings.length === 0 ? (
          <p className="text-xs text-muted-foreground">외출 일정이 없습니다</p>
        ) : (
          <div className="space-y-1.5">
            {outings.map((o, i) => (
              <div key={i} className="flex flex-wrap items-center gap-1.5 text-sm">
                <select value={o.dayOfWeek} disabled={readOnly} onChange={(e) => setOuting(i, { dayOfWeek: Number(e.target.value) })} className="h-8 rounded-md border border-input bg-background px-2 text-sm">
                  {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
                <Input type="time" value={o.outStart} disabled={readOnly} onChange={(e) => setOuting(i, { outStart: e.target.value })} className="h-8 w-28" />
                <span className="text-muted-foreground">~</span>
                <Input type="time" value={o.outEnd} disabled={readOnly} onChange={(e) => setOuting(i, { outEnd: e.target.value })} className="h-8 w-28" />
                <Input placeholder="사유 (예: 수학학원)" value={o.reason ?? ""} disabled={readOnly} onChange={(e) => setOuting(i, { reason: e.target.value })} className="h-8 flex-1 min-w-[120px]" />
                {!readOnly && (
                  <button type="button" onClick={() => removeOuting(i)} className="p-1 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
