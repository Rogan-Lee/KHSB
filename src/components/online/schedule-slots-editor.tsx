"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TimePickerInput } from "@/components/ui/time-picker";
import { PortalTimeField } from "@/components/portal/time-field";
import { Button as PortalButton } from "@/components/portal/ui";
import { cn } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";
import { Icon, PrefixIcon } from "@seed-design/react";
import { IconPlusFill, IconTrashcanLine } from "@karrotmarket/react-monochrome-icon";
import { ActionButton } from "seed-design/ui/action-button";
import { TextField, TextFieldInput } from "seed-design/ui/text-field";

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
  variant = "default",
}: {
  attendance: AttendanceSlot[];
  outings: OutingSlot[];
  onAttendanceChange?: (next: AttendanceSlot[]) => void;
  onOutingsChange?: (next: OutingSlot[]) => void;
  readOnly?: boolean;
  /** "portal" = 학생 포털(Toss 스타일). 직원/학부모 화면은 default */
  variant?: "default" | "portal";
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

  if (variant === "portal") {
    return (
      <PortalSlotsEditor
        attByDay={attByDay}
        outings={outings}
        readOnly={readOnly}
        onToggleDay={toggleDay}
        onAttTime={setAttTime}
        onAddOuting={addOuting}
        onSetOuting={setOuting}
        onRemoveOuting={removeOuting}
      />
    );
  }

  // 직원 화면(등원 스케줄 검토) — 읽기 전용이면 입력칸 대신 글자로 보여 준다
  const dayLabel = (v: number) => DAYS.find((d) => d.value === v)?.label ?? "";
  return (
    <div className="flex flex-col gap-x6">
      <div>
        <p className="mb-x2 t4-bold text-fg-neutral">주간 등하원 시간</p>
        <ul className="divide-y divide-stroke-neutral-subtle">
          {DAYS.map((d) => {
            const slot = attByDay.get(d.value);
            const on = !!slot;
            return (
              <li key={d.value} className="flex min-h-12 flex-wrap items-center gap-x3 py-x2">
                {readOnly ? (
                  <span className={cn("w-x8 shrink-0", on ? "t4-bold text-fg-neutral" : "t4-regular text-fg-neutral-subtle")}>
                    {d.label}
                  </span>
                ) : (
                  <label className="flex w-x14 shrink-0 cursor-pointer select-none items-center gap-x2">
                    <Checkbox
                      checked={on}
                      onCheckedChange={(v) => toggleDay(d.value, v === true)}
                      aria-label={`${d.label}요일 등원`}
                    />
                    <span className={on ? "t4-bold text-fg-neutral" : "t4-regular text-fg-neutral-subtle"}>{d.label}</span>
                  </label>
                )}
                {on ? (
                  readOnly ? (
                    <span className="t4-regular tabular-nums text-fg-neutral">
                      {slot!.startTime} ~ {slot!.endTime}
                    </span>
                  ) : (
                    <div className="flex items-center gap-x1_5">
                      <TimePickerInput size="sm" value={slot!.startTime} onChange={(v) => setAttTime(d.value, "startTime", v)} />
                      <span className="t4-regular text-fg-neutral-subtle" aria-hidden>~</span>
                      <TimePickerInput size="sm" value={slot!.endTime} onChange={(v) => setAttTime(d.value, "endTime", v)} />
                    </div>
                  )
                ) : (
                  <span className="t3-regular text-fg-placeholder">등원 안 함</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <div className="mb-x2 flex items-center justify-between gap-x2">
          <p className="t4-bold text-fg-neutral">
            학원·외출 일정
            {outings.length > 0 && <span className="ml-x1 tabular-nums text-fg-neutral-subtle">{outings.length}</span>}
          </p>
          {!readOnly && (
            <Button type="button" size="xs" variant="outline" onClick={addOuting}>
              <Plus />
              외출 추가
            </Button>
          )}
        </div>
        {outings.length === 0 ? (
          <p className="rounded-r3 bg-bg-layer-fill px-x4 py-x3 t3-regular text-fg-neutral-subtle">외출 일정이 없어요</p>
        ) : readOnly ? (
          <ul className="divide-y divide-stroke-neutral-subtle">
            {outings.map((o, i) => (
              <li key={i} className="flex min-h-11 flex-wrap items-center gap-x3 py-x2">
                <span className="w-x8 shrink-0 t4-bold text-fg-neutral">{dayLabel(o.dayOfWeek)}</span>
                <span className="t4-regular tabular-nums text-fg-neutral">{o.outStart} ~ {o.outEnd}</span>
                {o.reason?.trim() && <span className="t3-regular text-fg-neutral-subtle">{o.reason}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <ul className="flex flex-col gap-x2">
            {outings.map((o, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x1_5 rounded-r3 bg-bg-layer-fill p-x2">
                <Select value={String(o.dayOfWeek)} onValueChange={(v) => setOuting(i, { dayOfWeek: Number(v) })}>
                  <SelectTrigger aria-label={`외출 ${i + 1} 요일`} className="h-x8 w-x16 px-x2 t3-regular">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d) => <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <TimePickerInput size="sm" value={o.outStart} onChange={(v) => setOuting(i, { outStart: v })} />
                <span className="t4-regular text-fg-neutral-subtle" aria-hidden>~</span>
                <TimePickerInput size="sm" value={o.outEnd} onChange={(v) => setOuting(i, { outEnd: v })} />
                <Input
                  placeholder="사유 (예: 수학학원)"
                  aria-label={`외출 ${i + 1} 사유`}
                  value={o.reason ?? ""}
                  onChange={(e) => setOuting(i, { reason: e.target.value })}
                  className="h-x8 min-w-[120px] flex-1 t3-regular"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeOuting(i)}
                  aria-label={`외출 ${i + 1} 삭제`}
                  className="size-x8 text-fg-neutral-subtle hover:text-fg-critical"
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── 학생 포털 (SEED Design) ──────────────────────────────────────────

const DAY_FULL: Record<number, string> = {
  0: "일요일", 1: "월요일", 2: "화요일", 3: "수요일", 4: "목요일", 5: "금요일", 6: "토요일",
};

function toMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function durationLabel(start: string, end: string): string | null {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s == null || e == null || e <= s) return null;
  const h = Math.floor((e - s) / 60);
  const m = (e - s) % 60;
  return h === 0 ? `${m}분` : m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

function PortalGroupHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="t6-bold text-fg-neutral">{title}</h3>
      <p className="mt-x0_5 t4-regular text-fg-neutral-subtle">{description}</p>
    </div>
  );
}

function PortalTimeRange({
  start,
  end,
  disabled,
  onStart,
  onEnd,
}: {
  start: string;
  end: string;
  disabled: boolean;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-x2">
      <PortalTimeField value={start} disabled={disabled} onChange={onStart} className="min-w-0 flex-1" />
      <span className="shrink-0 t5-regular text-fg-neutral-subtle" aria-hidden>~</span>
      <PortalTimeField value={end} disabled={disabled} onChange={onEnd} className="min-w-0 flex-1" />
    </div>
  );
}

// 요일 원형 버튼 — SEED 에 요일 선택 컴포넌트가 없고, Chip 은 pill 패딩 때문에 360px 폭의 7열 그리드에 들어가지 않아
// SEED 토큰으로 직접 그린다.
const DAY_BUTTON =
  "rounded-full transition-[transform,background-color,color] duration-d3 active:scale-[0.92] disabled:active:scale-100";

function PortalSlotsEditor({
  attByDay,
  outings,
  readOnly,
  onToggleDay,
  onAttTime,
  onAddOuting,
  onSetOuting,
  onRemoveOuting,
}: {
  attByDay: Map<number, AttendanceSlot>;
  outings: OutingSlot[];
  readOnly: boolean;
  onToggleDay: (day: number, on: boolean) => void;
  onAttTime: (day: number, field: "startTime" | "endTime", value: string) => void;
  onAddOuting: () => void;
  onSetOuting: (idx: number, patch: Partial<OutingSlot>) => void;
  onRemoveOuting: (idx: number) => void;
}) {
  const selectedDays = DAYS.filter((d) => attByDay.has(d.value));

  return (
    <div className="flex flex-col gap-x9">
      {/* 등하원 */}
      <div>
        <PortalGroupHeader title="등하원 시간" description="등원하는 요일을 고르고 시간을 정해 주세요" />
        <div className="mt-x4 grid grid-cols-7 gap-x1" role="group" aria-label="등원 요일">
          {DAYS.map((d) => {
            const on = attByDay.has(d.value);
            return (
              <button
                key={d.value}
                type="button"
                disabled={readOnly}
                aria-pressed={on}
                aria-label={DAY_FULL[d.value]}
                onClick={() => onToggleDay(d.value, !on)}
                className={cn(
                  DAY_BUTTON,
                  "mx-auto flex aspect-square w-full max-w-11 items-center justify-center t5-bold",
                  on
                    ? "bg-bg-brand-solid text-palette-static-white"
                    : "bg-bg-neutral-weak text-fg-neutral-muted"
                )}
              >
                {d.label}
              </button>
            );
          })}
        </div>

        {selectedDays.length === 0 ? (
          <p className="mt-x4 rounded-r4 bg-bg-layer-fill px-x4 py-x3_5 text-center t4-regular text-fg-neutral-subtle">
            요일을 고르면 시간을 정할 수 있어요
          </p>
        ) : (
          <div className="mt-x4 flex flex-col gap-x2">
            {selectedDays.map((d) => {
              const slot = attByDay.get(d.value)!;
              const dur = durationLabel(slot.startTime, slot.endTime);
              return (
                <div key={d.value} className="rounded-r4 bg-bg-layer-fill p-x4">
                  <div className="mb-x3 flex items-center justify-between gap-x2">
                    <p className="t5-bold text-fg-neutral">{DAY_FULL[d.value]}</p>
                    {dur && <span className="t3-regular text-fg-neutral-subtle tabular-nums">{dur}</span>}
                  </div>
                  <PortalTimeRange
                    start={slot.startTime}
                    end={slot.endTime}
                    disabled={readOnly}
                    onStart={(v) => onAttTime(d.value, "startTime", v)}
                    onEnd={(v) => onAttTime(d.value, "endTime", v)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 학원·외출 */}
      <div>
        <PortalGroupHeader title="학원·외출 일정" description="학원처럼 정기적으로 자리를 비우는 시간이 있으면 알려 주세요" />

        {outings.length === 0 && readOnly && (
          <p className="mt-x4 t4-regular text-fg-neutral-subtle">외출 일정이 없어요</p>
        )}

        {outings.length > 0 && (
          <div className="mt-x4 flex flex-col gap-x2">
            {outings.map((o, i) => (
              <div key={i} className="rounded-r4 bg-bg-layer-fill p-x4">
                <div className="mb-x3 flex items-center justify-between gap-x2">
                  <p className="t5-bold text-fg-neutral">
                    외출 <span className="tabular-nums">{i + 1}</span>
                  </p>
                  {!readOnly && (
                    <ActionButton
                      variant="ghost"
                      size="small"
                      layout="iconOnly"
                      color="fg.neutralSubtle"
                      onClick={() => onRemoveOuting(i)}
                      aria-label={`외출 ${i + 1} 삭제`}
                      className="-my-1.5 -mr-1.5"
                    >
                      <Icon svg={<IconTrashcanLine />} />
                    </ActionButton>
                  )}
                </div>
                <div className="grid grid-cols-7 gap-x1" role="radiogroup" aria-label="외출 요일">
                  {DAYS.map((d) => {
                    const on = o.dayOfWeek === d.value;
                    return (
                      <button
                        key={d.value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={DAY_FULL[d.value]}
                        disabled={readOnly}
                        onClick={() => onSetOuting(i, { dayOfWeek: d.value })}
                        className={cn(
                          DAY_BUTTON,
                          "h-x9 w-full t4-bold",
                          on
                            ? "bg-bg-brand-solid text-palette-static-white"
                            : "bg-bg-layer-default text-fg-neutral-muted"
                        )}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-x2">
                  <PortalTimeRange
                    start={o.outStart}
                    end={o.outEnd}
                    disabled={readOnly}
                    onStart={(v) => onSetOuting(i, { outStart: v })}
                    onEnd={(v) => onSetOuting(i, { outEnd: v })}
                  />
                </div>
                <div className="mt-x2">
                  <TextField
                    value={o.reason ?? ""}
                    onValueChange={({ value }) => onSetOuting(i, { reason: value })}
                    disabled={readOnly}
                    className="bg-bg-layer-default"
                  >
                    <TextFieldInput type="text" placeholder="사유 (예: 수학학원)" aria-label="외출 사유" />
                  </TextField>
                </div>
              </div>
            ))}
          </div>
        )}

        {!readOnly && (
          <PortalButton variant="gray" size="lg" block className="mt-x4" onClick={onAddOuting}>
            <PrefixIcon svg={<IconPlusFill />} />
            외출 추가
          </PortalButton>
        )}
      </div>
    </div>
  );
}
