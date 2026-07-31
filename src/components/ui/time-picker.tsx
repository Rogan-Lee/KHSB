"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

// ponytail: 예전엔 텍스트 필드 + 15분 슬롯 드롭다운 커스텀 위젯이었으나,
// 15분 단위로만 선택돼 외출 등 임의 분(分) 입력이 불가능했다.
// 네이티브 <input type="time">로 교체 → 시/분 독립 입력 + 접근성 확보.

interface TimePickerInputProps {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  disabled?: boolean;
  className?: string;
  placeholder?: string; // API 호환용 (네이티브 input엔 미적용)
  size?: "sm" | "default";
  minHour?: number;
}

export function TimePickerInput({
  value,
  onChange,
  name,
  disabled = false,
  className,
  size = "default",
  minHour,
}: TimePickerInputProps) {
  return (
    <input
      type="time"
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      min={minHour && minHour > 0 ? `${String(minHour).padStart(2, "0")}:00` : undefined}
      className={cn(
        "border rounded bg-background font-mono text-center",
        "focus:outline-none focus:ring-1 focus:ring-primary transition-colors",
        "disabled:opacity-30 disabled:cursor-not-allowed",
        size === "sm" ? "px-1.5 py-1 text-xs w-[5.5rem]" : "px-2 py-1.5 text-sm w-[6.5rem]",
        className
      )}
    />
  );
}

// datetime-local 대체용 (날짜 + 시간 분리 입력)
interface DateTimePickerInputProps {
  name: string;
  defaultValue?: string;
  className?: string;
}

export function DateTimePickerInput({ name, defaultValue, className }: DateTimePickerInputProps) {
  const [date, setDate] = useState(defaultValue?.slice(0, 10) ?? "");
  const [time, setTime] = useState(defaultValue?.slice(11, 16) ?? "");
  const combined = date ? (time ? `${date}T${time}` : `${date}T00:00`) : "";

  return (
    <div className={cn("flex gap-2", className)}>
      <input type="hidden" name={name} value={combined} />
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="flex-1 border rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary min-w-0"
      />
      <TimePickerInput value={time} onChange={setTime} />
    </div>
  );
}
