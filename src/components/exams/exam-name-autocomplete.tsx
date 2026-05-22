"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { getExamNameSuggestions } from "@/actions/exam-scores";
import { ExamType } from "@/generated/prisma";

interface ExamNameAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  examType: ExamType;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  name?: string;
  /** 디바운스(ms). 기본 200. */
  debounceMs?: number;
  /** Enter 처리 콜백 (자유 입력 확정 시). 없으면 폼 default 동작. */
  onSubmit?: () => void;
}

/**
 * 시험명 typeahead. `getExamNameSuggestions(examType)` 으로 최근 사용 시험명을
 * 가져와 Command 콤보박스로 보여주되, **자유 입력**도 그대로 허용한다.
 *
 * - 포커스 시 suggestion fetch (한 번)
 * - 입력 변경 시 debounceMs 후 client-side filter
 * - 키보드: ArrowUp/Down으로 항목 탐색, Enter 로 선택 또는 자유 입력 확정
 */
export function ExamNameAutocomplete({
  value,
  onChange,
  examType,
  placeholder = "예: 2026년 4월 시스모의고사",
  required,
  disabled,
  className,
  inputClassName,
  name,
  debounceMs = 200,
  onSubmit,
}: ExamNameAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const fetchedForType = useRef<ExamType | null>(null);

  // 디바운스: 사용자 타이핑 200ms 뒤 필터 쿼리 업데이트
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(value), debounceMs);
    return () => clearTimeout(t);
  }, [value, debounceMs]);

  // examType 이 바뀌면 suggestion 캐시 무효화
  useEffect(() => {
    if (fetchedForType.current !== examType) {
      setSuggestions(null);
      fetchedForType.current = null;
    }
  }, [examType]);

  const loadSuggestions = useCallback(async () => {
    if (fetchedForType.current === examType) return;
    setLoading(true);
    try {
      const list = await getExamNameSuggestions(examType);
      setSuggestions(list);
      fetchedForType.current = examType;
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [examType]);

  // 포커스 시 suggestion 로드
  function handleFocus() {
    void loadSuggestions();
    setOpen(true);
  }

  const filtered = useMemo(() => {
    if (!suggestions || suggestions.length === 0) return [];
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return suggestions;
    return suggestions.filter((s) => s.toLowerCase().includes(q));
  }, [suggestions, debouncedQuery]);

  function pick(picked: string) {
    onChange(picked);
    setOpen(false);
    // 입력 박스에 포커스 유지하여 후속 편집/Enter 가능
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (e.key === "Enter") {
      // 자유 입력 확정: popover 만 닫고 form submit 은 부모가 처리
      if (open && filtered.length > 0 && filtered[0] === value) {
        // 이미 매칭됐다면 그대로 통과
      }
      setOpen(false);
      if (onSubmit) {
        e.preventDefault();
        onSubmit();
      }
      return;
    }
    if (e.key === "ArrowDown" && !open) {
      e.preventDefault();
      void loadSuggestions();
      setOpen(true);
    }
  }

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <Input
            ref={inputRef}
            type="text"
            name={name}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              if (!open) setOpen(true);
            }}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            required={required}
            disabled={disabled}
            autoComplete="off"
            className={inputClassName}
          />
        </PopoverAnchor>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
          // 입력에서 포커스 잃지 않도록 자동 포커스 막기
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command shouldFilter={false}>
            <CommandList>
              {loading && suggestions === null ? (
                <div className="px-3 py-4 text-xs text-muted-foreground">
                  최근 시험명 불러오는 중…
                </div>
              ) : filtered.length === 0 ? (
                <CommandEmpty>
                  {value.trim()
                    ? "일치하는 최근 시험명이 없습니다. 그대로 입력해 사용하세요."
                    : "최근 시험명이 없습니다."}
                </CommandEmpty>
              ) : (
                <CommandGroup heading="최근 시험명">
                  {filtered.map((s) => (
                    <CommandItem
                      key={s}
                      value={s}
                      onSelect={() => pick(s)}
                      className={cn("text-xs", s === value && "font-medium")}
                    >
                      {s}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
