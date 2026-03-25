"use client";

import { useState } from "react";
import { AssignmentPanel } from "./assignment-panel";
import { cn } from "@/lib/utils";
import type { Assignment } from "@/generated/prisma";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

interface StudentWithAssignments {
  id: string;
  name: string;
  grade: string;
  assignments: Assignment[];
}

interface Props {
  students: StudentWithAssignments[];
}

function StudentRow({ student }: { student: StudentWithAssignments }) {
  const [open, setOpen] = useState(false);
  const pending = student.assignments.filter((a) => !a.isCompleted).length;

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center justify-between px-4 py-3 text-left hover:bg-accent/40 transition-colors",
          open && "bg-accent/20"
        )}
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{student.name}</span>
          <span className="text-xs text-muted-foreground">{student.grade}</span>
          {pending > 0 && (
            <span className="bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
              {pending}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            전체 {student.assignments.length}개 · 완료 {student.assignments.filter((a) => a.isCompleted).length}개
          </span>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>
      {open && (
        <div className="px-4 py-3 border-t bg-background">
          <AssignmentPanel
            studentId={student.id}
            studentName={student.name}
            initialItems={student.assignments}
          />
        </div>
      )}
    </div>
  );
}

export function AssignmentsOverview({ students }: Props) {
  const [filter, setFilter] = useState<"all" | "pending">("pending");
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = students.filter((s) => {
    if (filter === "pending" && !s.assignments.some((a) => !a.isCompleted)) return false;
    if (q && !s.name.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {(["pending", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1 text-xs rounded-md border font-medium transition-colors",
              filter === f
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:bg-accent"
            )}
          >
            {f === "pending" ? "미완료 있는 원생" : "전체 원생"}
          </button>
        ))}
        <div className="relative">
          <Search className="absolute left-2.5 top-1.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="이름 검색..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-7 w-40 text-sm"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length}명</span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">
          {filter === "pending" ? "미완료 과제가 있는 원생이 없습니다" : "원생이 없습니다"}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => (
            <StudentRow key={s.id} student={s} />
          ))}
        </div>
      )}
    </div>
  );
}
