"use client";

import { RotateCcw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const ALL = "__ALL__";

export type StudentFilterState = {
  search: string;
  grade: string; // ALL or specific
  school: string; // ALL or specific (or "__NONE__" for null school)
};

export const NONE_SCHOOL = "__NONE__";

export const defaultFilterState: StudentFilterState = {
  search: "",
  grade: ALL,
  school: ALL,
};

export function isFilterActive(f: StudentFilterState): boolean {
  return f.search.trim() !== "" || f.grade !== ALL || f.school !== ALL;
}

export type FilterableStudent = {
  studentName: string;
  grade: string;
  school: string | null;
};

export function matchesStudentFilter(
  s: FilterableStudent,
  f: StudentFilterState
): boolean {
  if (f.grade !== ALL && s.grade !== f.grade) return false;
  if (f.school !== ALL) {
    if (f.school === NONE_SCHOOL) {
      if (s.school) return false;
    } else if (s.school !== f.school) return false;
  }
  if (f.search.trim()) {
    const q = f.search.trim().toLowerCase();
    if (!s.studentName.toLowerCase().includes(q)) return false;
  }
  return true;
}

/** 행 리스트에서 학년/학교 옵션을 추출 (정렬). */
export function deriveFilterOptions(rows: FilterableStudent[]) {
  const grades = Array.from(new Set(rows.map((r) => r.grade))).sort((a, b) =>
    a.localeCompare(b, "ko")
  );
  const schools = Array.from(
    new Set(rows.map((r) => r.school).filter((v): v is string => !!v))
  ).sort((a, b) => a.localeCompare(b, "ko"));
  const hasUnknownSchool = rows.some((r) => !r.school);
  return { grades, schools, hasUnknownSchool };
}

export function StudentFilterBar({
  value,
  onChange,
  availableGrades,
  availableSchools,
  hasUnknownSchool,
  searchPlaceholder = "학생 이름 검색",
  className,
  rightSlot,
}: {
  value: StudentFilterState;
  onChange: (next: StudentFilterState) => void;
  availableGrades: string[];
  availableSchools: string[];
  hasUnknownSchool?: boolean;
  searchPlaceholder?: string;
  className?: string;
  rightSlot?: React.ReactNode;
}) {
  const active = isFilterActive(value);
  return (
    <div className={cn("flex flex-wrap items-center gap-x2", className)}>
      {/* 검색 — backoffice SearchField 규격 + 지우기 버튼 */}
      <label className="flex h-10 w-full min-w-0 items-center gap-x2 rounded-r2 bg-bg-neutral-weak px-x3 transition-shadow focus-within:bg-bg-layer-default focus-within:shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-contrast)] sm:w-64">
        <Search className="size-4 shrink-0 text-fg-neutral-subtle" aria-hidden />
        <input
          type="search"
          value={value.search}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="h-full min-w-0 flex-1 bg-transparent t4-regular text-fg-neutral outline-none placeholder:text-fg-placeholder [&::-webkit-search-cancel-button]:hidden"
        />
        {value.search && (
          <button
            type="button"
            onClick={() => onChange({ ...value, search: "" })}
            className="grid size-5 shrink-0 place-items-center rounded-full bg-bg-neutral-solid-muted text-fg-neutral-inverted transition-opacity hover:opacity-80"
            aria-label="검색어 지우기"
          >
            <X className="size-3" strokeWidth={3} />
          </button>
        )}
      </label>

      <Select
        value={value.grade}
        onValueChange={(v) => onChange({ ...value, grade: v })}
      >
        <SelectTrigger className="w-[120px]" aria-label="학년">
          <SelectValue placeholder="학년" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>학년 전체</SelectItem>
          {availableGrades.map((g) => (
            <SelectItem key={g} value={g}>
              {g}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.school}
        onValueChange={(v) => onChange({ ...value, school: v })}
      >
        <SelectTrigger className="w-[160px]" aria-label="학교">
          <SelectValue placeholder="학교" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>학교 전체</SelectItem>
          {availableSchools.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
          {hasUnknownSchool && (
            <SelectItem value={NONE_SCHOOL}>학교 미입력</SelectItem>
          )}
        </SelectContent>
      </Select>

      {active && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(defaultFilterState)}
        >
          <RotateCcw />
          초기화
        </Button>
      )}

      {rightSlot && (
        <div className="ml-auto t3-regular text-fg-neutral-subtle">{rightSlot}</div>
      )}
    </div>
  );
}
