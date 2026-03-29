"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

// 15분 간격 시간 목록 생성
function buildTimes(minHour = 0): string[] {
  const list: string[] = [];
  for (let h = minHour; h < 24; h++) {
    for (const m of [0, 15, 30, 45]) {
      list.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return list;
}
const ALL_TIMES = buildTimes(0);

const DROP_HEIGHT = 208;

function isValidTime(v: string): boolean {
  if (!/^\d{1,2}:\d{2}$/.test(v)) return false;
  const [h, m] = v.split(":").map(Number);
  return h <= 23 && m <= 59;
}

function normalize(v: string): string {
  const [h, m] = v.split(":").map(Number);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function nearestSlot(v: string): string {
  if (!isValidTime(v)) return "";
  const [h, m] = v.split(":").map(Number);
  const snapped = Math.round(m / 15) * 15;
  if (snapped === 60) return `${String((h + 1) % 24).padStart(2, "0")}:00`;
  return `${String(h).padStart(2, "0")}:${String(snapped).padStart(2, "0")}`;
}

interface TimePickerInputProps {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  size?: "sm" | "default";
  minHour?: number;
}

export function TimePickerInput({
  value,
  onChange,
  name,
  disabled = false,
  className,
  placeholder = "--:--",
  size = "default",
  minHour = 0,
}: TimePickerInputProps) {
  const TIMES = minHour > 0 ? buildTimes(minHour) : ALL_TIMES;
  const [open, setOpen] = useState(false);
  const [showAbove, setShowAbove] = useState(false);
  const [inputVal, setInputVal] = useState(value);

  const inputValRef = useRef(value);
  const lastValidRef = useRef(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    inputValRef.current = value;
    lastValidRef.current = value;
    setInputVal(value);
  }, [value]);

  function openDrop() {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setShowAbove(window.innerHeight - rect.bottom < DROP_HEIGHT + 8);
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      selectedRef.current?.scrollIntoView({ block: "center", behavior: "instant" });
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (
        inputRef.current?.contains(e.target as Node) ||
        dropRef.current?.contains(e.target as Node)
      ) return;
      commitOrRestore();
      setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function commitOrRestore() {
    const cur = inputValRef.current;
    if (isValidTime(cur)) {
      const n = normalize(cur);
      inputValRef.current = n;
      lastValidRef.current = n;
      onChange(n);
      setInputVal(n);
    } else {
      const restore = lastValidRef.current;
      inputValRef.current = restore;
      setInputVal(restore);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    inputValRef.current = v;
    setInputVal(v);
    if (isValidTime(v)) {
      const n = normalize(v);
      inputValRef.current = n;
      lastValidRef.current = n;
      onChange(n);
    }
    if (!open) openDrop();
  }

  function handleFocus() {
    openDrop();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      const restore = lastValidRef.current;
      inputValRef.current = restore;
      setInputVal(restore);
      setOpen(false);
      inputRef.current?.blur();
    }
    if (e.key === "Enter") {
      commitOrRestore();
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  function handleBlur() {
    setTimeout(() => {
      if (dropRef.current?.contains(document.activeElement)) return;
      setOpen(false);
      commitOrRestore();
    }, 0);
  }

  function selectTime(t: string) {
    inputValRef.current = t;
    lastValidRef.current = t;
    onChange(t);
    setInputVal(t);
    setOpen(false);
  }

  const activeSlot = nearestSlot(value);

  return (
    <div className={cn("relative inline-block", className)}>
      {name && <input type="hidden" name={name} value={value} />}
      <input
        ref={inputRef}
        type="text"
        value={inputVal}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(
          "border rounded bg-background font-mono text-center",
          "focus:outline-none focus:ring-1 focus:ring-primary transition-colors",
          "disabled:opacity-30 disabled:cursor-not-allowed",
          open && "ring-1 ring-primary border-primary",
          size === "sm" ? "px-1.5 py-1 text-xs w-[4.5rem]" : "px-2 py-1.5 text-sm w-[5.5rem]"
        )}
      />

      {open && (
        <div
          ref={dropRef}
          style={{
            position: "absolute",
            ...(showAbove
              ? { bottom: "calc(100% + 4px)" }
              : { top: "calc(100% + 4px)" }),
            left: 0,
            width: 112,
            maxHeight: DROP_HEIGHT,
            zIndex: 50,
          }}
          className="overflow-y-auto rounded-lg border bg-popover shadow-xl py-1"
        >
          {TIMES.map((t) => {
            const isActive = t === activeSlot;
            return (
              <button
                key={t}
                ref={isActive ? selectedRef : undefined}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectTime(t);
                }}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-sm font-mono transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground font-medium"
                    : "hover:bg-accent"
                )}
              >
                {t}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// datetime-local 대체용
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
