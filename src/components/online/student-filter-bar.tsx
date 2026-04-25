"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
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
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-md border border-line bg-canvas-2/40 p-2",
        className
      )}
    >
      <div className="relative flex-1 min-w-[180px] max-w-xs">
        <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-ink-5" />
        <Input
          value={value.search}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
          placeholder={searchPlaceholder}
          className="h-7 pl-7 pr-7 text-xs"
        />
        {value.search && (
          <button
            type="button"
            onClick={() => onChange({ ...value, search: "" })}
            className="absolute right-2 top-1.5 text-ink-5 hover:text-ink"
            aria-label="검색어 지우기"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      <Select
        value={value.grade}
        onValueChange={(v) => onChange({ ...value, grade: v })}
      >
        <SelectTrigger className="h-7 text-xs w-[100px]">
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
        <SelectTrigger className="h-7 text-xs w-[140px]">
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
        <button
          type="button"
          onClick={() => onChange(defaultFilterState)}
          className="inline-flex items-center gap-1 rounded-[6px] border border-line bg-panel px-2 py-1 text-[11px] text-ink-3 hover:text-ink hover:border-line-strong"
        >
          <X className="h-3 w-3" />
          초기화
        </button>
      )}

      {rightSlot && <div className="ml-auto">{rightSlot}</div>}
    </div>
  );
}
