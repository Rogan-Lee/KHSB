"use client";

import { useState, useRef, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Search } from "lucide-react";

interface Option {
  value: string;
  label: string;
}

interface Props {
  options: Option[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
}

// SEED SelectTrigger(ui/select) 와 같은 규격 — 높이 40, r2, 1px stroke-neutral-weak, 포커스·열림 2px stroke-neutral-contrast
const TRIGGER =
  "flex h-10 w-full items-center justify-between gap-x2 rounded-r2 border-0 bg-bg-layer-default px-x3 text-left t4-regular text-fg-neutral outline-none transition-shadow " +
  "shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] " +
  "focus-visible:shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-contrast)] data-[state=open]:shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-contrast)] " +
  "disabled:cursor-not-allowed disabled:bg-bg-disabled disabled:text-fg-disabled";

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "선택",
  searchPlaceholder = "검색...",
  emptyText = "결과 없음",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const selected = options.find((o) => o.value === value);

  // 열 때 검색어 초기화 — 여는 순간(onOpenChange)에 처리해 effect 안 setState 를 피한다
  function handleOpenChange(next: boolean) {
    if (next) setQuery("");
    setOpen(next);
  }

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  function handleSelect(val: string) {
    onValueChange(val);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button type="button" className={cn(TRIGGER, className)}>
          <span className={cn("truncate", !selected && "text-fg-placeholder")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown className="size-4 shrink-0 text-fg-neutral-subtle" aria-hidden />
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-(--radix-popover-trigger-width) min-w-48 overflow-hidden p-0"
        align="start"
        sideOffset={4}
      >
        {/* 검색 입력 */}
        <div className="flex items-center gap-x2 border-b border-stroke-neutral-muted px-x3">
          <Search className="size-4 shrink-0 text-fg-neutral-subtle" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-11 min-w-0 flex-1 bg-transparent t4-regular text-fg-neutral outline-none placeholder:text-fg-placeholder"
          />
        </div>

        {/* 목록 */}
        <div className="max-h-60 overflow-y-auto p-x1_5">
          {filtered.length === 0 ? (
            <div className="py-x8 text-center t4-regular text-fg-neutral-subtle">{emptyText}</div>
          ) : (
            filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
                className={cn(
                  "flex w-full items-center gap-x2 rounded-r2 px-x3 py-x2_5 text-left t4-regular text-fg-neutral outline-none transition-colors hover:bg-bg-layer-floating-pressed focus-visible:bg-bg-layer-floating-pressed",
                  value === opt.value && "t4-bold"
                )}
              >
                <Check
                  className={cn(
                    "size-4 shrink-0 text-fg-neutral",
                    value === opt.value ? "opacity-100" : "opacity-0"
                  )}
                />
                <span className="min-w-0 truncate">{opt.label}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
