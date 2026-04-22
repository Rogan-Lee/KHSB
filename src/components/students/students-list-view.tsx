"use client";

import { useState } from "react";
import { LayoutGrid, List, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { StudentsTable } from "./students-table";
import { StudentsCardGrid } from "./students-card-grid";
import type { Student, User, AttendanceSchedule } from "@/generated/prisma";

type StudentWithRelations = Student & {
  mentor: Pick<User, "name"> | null;
  schedules: AttendanceSchedule[];
};

interface StudentsListViewProps {
  students: StudentWithRelations[];
}

export function StudentsListView({ students }: StudentsListViewProps) {
  const [view, setView] = useState<"list" | "grid">("list");
  const [query, setQuery] = useState("");

  const filtered = query
    ? students.filter((s) => {
        const q = query.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          (s.grade?.toLowerCase().includes(q) ?? false) ||
          (s.mentor?.name?.toLowerCase().includes(q) ?? false) ||
          (s.seat?.toLowerCase().includes(q) ?? false)
        );
      })
    : students;

  return (
    <div className="flex flex-col gap-[14px]">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-[10px] py-[6px] bg-panel border border-line rounded-[8px] shadow-[var(--shadow-xs)] min-w-[240px]">
          <Search className="h-3.5 w-3.5 text-ink-4 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름 · 반 · 멘토 · 좌석"
            className="flex-1 bg-transparent border-0 outline-0 text-[12.5px] text-ink placeholder:text-ink-4"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-[10px] text-ink-4 hover:text-ink-2"
              aria-label="검색 초기화"
            >
              지우기
            </button>
          )}
        </div>
        <span className="text-[11.5px] text-ink-4 font-mono tabular-nums">
          {filtered.length} / {students.length}
        </span>
        <div className="ml-auto flex items-center gap-[2px] p-[3px] bg-panel border border-line rounded-[9px] shadow-[var(--shadow-xs)]">
          <button
            type="button"
            onClick={() => setView("list")}
            className={cn(
              "grid place-items-center h-[26px] w-[30px] rounded-[6px] text-ink-3 transition-colors",
              view === "list" ? "bg-ink text-white" : "hover:bg-canvas-2 hover:text-ink-2"
            )}
            aria-label="리스트 보기"
            title="리스트 (L)"
          >
            <List className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setView("grid")}
            className={cn(
              "grid place-items-center h-[26px] w-[30px] rounded-[6px] text-ink-3 transition-colors",
              view === "grid" ? "bg-ink text-white" : "hover:bg-canvas-2 hover:text-ink-2"
            )}
            aria-label="카드 보기"
            title="카드 (G)"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {view === "list" ? (
        <div className="rounded-[12px] border border-line bg-panel shadow-[var(--shadow-xs)] overflow-hidden">
          <div className="p-[14px]">
            <StudentsTable students={filtered} />
          </div>
        </div>
      ) : (
        <StudentsCardGrid students={filtered} />
      )}
    </div>
  );
}
