"use client";

// 규칙 적용 시간 입력 — 규칙 추가와 시간 변경이 같이 쓴다.

import type { AccessRuleInput } from "@/actions/access-control";
import { FilterChip, FormField, Segmented } from "@/components/backoffice/ui";
import { TimePickerInput } from "@/components/ui/time-picker";
import { DAY_NAMES } from "@/lib/utils";

export type ScheduleValue = {
  mode: "ALWAYS" | "CUSTOM";
  /** 0(일)~6(토). 비어 있으면 매일 */
  days: number[];
  startTime: string;
  endTime: string;
};

export const ALWAYS_SCHEDULE: ScheduleValue = { mode: "ALWAYS", days: [], startTime: "", endTime: "" };

/** 서버에 보낼 요일·시간 — "항상"이면 모두 비운다 */
export function scheduleInputOf(value: ScheduleValue): Pick<AccessRuleInput, "daysOfWeek" | "startTime" | "endTime"> {
  if (value.mode === "ALWAYS") return { daysOfWeek: [], startTime: null, endTime: null };
  return { daysOfWeek: value.days, startTime: value.startTime || null, endTime: value.endTime || null };
}

export function ScheduleFields({
  value,
  onChange,
}: {
  value: ScheduleValue;
  onChange: (next: ScheduleValue) => void;
}) {
  const overnight = !!value.startTime && !!value.endTime && value.endTime < value.startTime;

  function toggleDay(day: number) {
    const days = value.days.includes(day) ? value.days.filter((d) => d !== day) : [...value.days, day].sort();
    onChange({ ...value, days });
  }

  return (
    <FormField label="적용 시간">
      <Segmented
        aria-label="적용 시간"
        value={value.mode}
        onChange={(mode) => onChange({ ...value, mode })}
        options={[
          { value: "ALWAYS", label: "항상" },
          { value: "CUSTOM", label: "요일·시간 지정" },
        ]}
      />
      {value.mode === "CUSTOM" && (
        <div className="flex flex-col gap-x3 rounded-r3 bg-bg-layer-fill p-x4">
          <div className="flex flex-col gap-x2">
            <p className="t3-medium text-fg-neutral-subtle">요일</p>
            <div className="flex flex-wrap gap-x1_5" role="group" aria-label="요일">
              {DAY_NAMES.map((name, day) => (
                <FilterChip
                  key={name}
                  selected={value.days.includes(day)}
                  onClick={() => toggleDay(day)}
                  className="w-10 justify-center px-0"
                >
                  {name}
                </FilterChip>
              ))}
            </div>
            <p className="t3-regular text-fg-neutral-subtle">고르지 않으면 매일 적용돼요.</p>
          </div>
          <div className="flex flex-col gap-x2">
            <p className="t3-medium text-fg-neutral-subtle">시간</p>
            <div className="flex items-center gap-x2">
              <TimePickerInput
                value={value.startTime}
                onChange={(startTime) => onChange({ ...value, startTime })}
                placeholder="시작"
              />
              <span className="t4-regular text-fg-neutral-subtle" aria-hidden>
                ~
              </span>
              <TimePickerInput
                value={value.endTime}
                onChange={(endTime) => onChange({ ...value, endTime })}
                placeholder="종료"
              />
            </div>
            <p className="t3-regular text-fg-neutral-subtle">
              {overnight
                ? `자정을 넘겨 다음 날 ${value.endTime}까지 적용돼요.`
                : "비워 두면 하루 종일이에요. 종료가 시작보다 이르면 자정을 넘겨 다음 날까지 이어져요."}
            </p>
          </div>
        </div>
      )}
    </FormField>
  );
}
