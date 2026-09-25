"use client";

import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ko } from "react-day-picker/locale";

interface DatePickerProps {
  value?: string | null;
  onChange?: (date: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  compact?: boolean;
  /** form 전송용 hidden input name */
  name?: string;
  required?: boolean;
  /** 기본값 (비제어 모드) */
  defaultValue?: string;
  /** 트리거 높이 — md(기본, 40px · 입력칸 규격) / sm(32px · 표 안 등 좁은 곳) */
  size?: "sm" | "md";
}

// SEED TextInput / SelectTrigger 와 같은 규격 — 높이 40, r2, 1px stroke-neutral-weak, 포커스·열림 2px stroke-neutral-contrast
const FIELD_TRIGGER =
  "inline-flex min-w-36 items-center gap-x2 rounded-r2 border-0 bg-bg-layer-default text-left text-fg-neutral tabular-nums outline-none transition-shadow " +
  "shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] " +
  "focus-visible:shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-contrast)] data-[state=open]:shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-contrast)] " +
  "disabled:cursor-not-allowed disabled:bg-bg-disabled disabled:text-fg-disabled";

/** "2026-09-25" → "2026.09.25" */
function formatLabel(value: string): string {
  const d = new Date(value + "T00:00:00");
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export function DatePicker({
  value,
  onChange,
  disabled,
  placeholder = "날짜 선택",
  className,
  compact,
  name,
  required,
  defaultValue,
  size = "md",
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue ?? null);
  const current = value !== undefined ? value : internalValue;
  const selected = current ? new Date(current + "T00:00:00") : undefined;

  function handleSelect(day: Date | undefined) {
    if (!day) {
      onChange?.(null);
      setInternalValue(null);
    } else {
      const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      onChange?.(iso);
      setInternalValue(iso);
    }
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* required 검증을 위해 hidden 대신 sr-only — 브라우저는 type=hidden 의 required 를 무시함 */}
      {name && (
        <input
          type="text"
          name={name}
          value={current ?? ""}
          required={required}
          readOnly
          tabIndex={-1}
          aria-hidden="true"
          onChange={() => {}}
          className="sr-only absolute pointer-events-none"
        />
      )}
      <PopoverTrigger asChild disabled={disabled}>
        {compact ? (
          <button
            type="button"
            className={cn(
              "inline-flex size-8 shrink-0 items-center justify-center rounded-r2 bg-bg-layer-default text-fg-neutral-muted outline-none transition-[background-color,box-shadow]",
              "shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] hover:bg-bg-layer-default-pressed",
              "focus-visible:shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-contrast)] data-[state=open]:shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-contrast)]",
              "disabled:cursor-not-allowed disabled:bg-bg-disabled disabled:text-fg-disabled",
              className
            )}
            title={placeholder}
            aria-label={placeholder}
          >
            <CalendarIcon className="size-4" />
          </button>
        ) : (
          <button
            type="button"
            className={cn(
              FIELD_TRIGGER,
              size === "sm" ? "h-8 px-x2_5 t3-regular" : "h-10 px-x3 t4-regular",
              className
            )}
          >
            <CalendarIcon className={cn("size-4 shrink-0", current ? "text-fg-neutral-muted" : "text-fg-neutral-subtle")} />
            <span className={cn("truncate", !current && "text-fg-placeholder")}>
              {current ? formatLabel(current) : placeholder}
            </span>
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-x3" align="start" sideOffset={6}>
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          defaultMonth={selected}
          locale={ko}
          captionLayout="dropdown"
        />
      </PopoverContent>
    </Popover>
  );
}
