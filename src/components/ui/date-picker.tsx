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
}

function formatLabel(value: string): string {
  const d = new Date(value + "T00:00:00");
  return `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, "0")}`;
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
              "inline-flex items-center justify-center rounded-md border p-1 transition-colors",
              "border-border bg-background hover:bg-accent text-muted-foreground",
              disabled && "opacity-40 cursor-not-allowed",
              className
            )}
            title={placeholder}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              current
                ? "text-green-700 bg-green-50 border-green-200 hover:bg-green-100"
                : "text-muted-foreground bg-background border-border hover:bg-accent",
              disabled && "opacity-40 cursor-not-allowed",
              className
            )}
          >
            <CalendarIcon className="h-3 w-3 shrink-0" />
            {current ? formatLabel(current) : placeholder}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start" sideOffset={6}>
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          defaultMonth={selected}
          locale={ko}
          captionLayout="dropdown"
          className="[--cell-size:2.25rem]"
          classNames={{
            nav: "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1 z-10",
            month_caption: "flex h-9 w-full items-center justify-center px-10",
            week: "mt-1 flex w-full",
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
