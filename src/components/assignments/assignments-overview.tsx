"use client";

import { useMemo, useState } from "react";
import { AssignmentPanel } from "./assignment-panel";
import { cn } from "@/lib/utils";
import type { Assignment } from "@/generated/prisma";
import { ArrowLeft } from "lucide-react";
import { Combobox } from "@/components/ui/combobox";

interface StudentWithAssignments {
  id: string;
  name: string;
  grade: string;
  assignments: Assignment[];
}

interface Props {
  students: StudentWithAssignments[];
}

export function AssignmentsOverview({ students }: Props) {
  const [filter, setFilter] = useState<"all" | "pending">("pending");

  const filtered = useMemo(
    () =>
      students.filter((s) => {
        if (filter === "pending" && !s.assignments.some((a) => !a.isCompleted)) return false;
        return true;
      }),
    [students, filter]
  );

  // 기본 선택: 미완료 있는 첫 학생 → 없으면 첫 학생
  const defaultSelectedId = useMemo(() => {
    const withPending = students.find((s) => s.assignments.some((a) => !a.isCompleted));
    return withPending?.id ?? students[0]?.id ?? null;
  }, [students]);

  const [selectedId, setSelectedId] = useState<string | null>(defaultSelectedId);

  // 콤보박스는 전체 학생을 검색 대상으로 (필터 무관)
  const comboItems = useMemo(
    () =>
      students.map((s) => {
        const pending = s.assignments.filter((a) => !a.isCompleted).length;
        return {
          value: s.id,
          label: pending > 0 ? `${s.name} (미완 ${pending})` : s.name,
          subLabel: s.grade,
          searchKey: `${s.name} ${s.grade}`,
        };
      }),
    [students]
  );

  const selected = students.find((s) => s.id === selectedId) ?? null;

  function handleSelect(id: string) {
    // 콤보박스로 선택 시, 현재 필터에서 안 보이면 전체로 전환해 리스트에서도 보이게
    if (filter === "pending") {
      const target = students.find((s) => s.id === id);
      if (target && !target.assignments.some((a) => !a.isCompleted)) {
        setFilter("all");
      }
    }
    setSelectedId(id);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 items-start">
      {/* 좌 패널 — 학생 리스트 (모바일: 선택 시 숨김) */}
      <aside
        className={cn(
          "lg:sticky lg:top-4 space-y-3",
          selected ? "hidden lg:block" : "block"
        )}
      >
        {/* 학생 검색 콤보박스 */}
        <Combobox
          items={comboItems}
          value={selectedId ?? ""}
          onChange={handleSelect}
          placeholder="학생 검색..."
          searchPlaceholder="이름 검색..."
          emptyMessage="학생이 없습니다"
          triggerClassName="h-9 text-sm"
        />

        {/* 필터 pill */}
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
          <span className="text-xs text-muted-foreground">{filtered.length}명</span>
        </div>

        {/* 학생 리스트 */}
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            {filter === "pending" ? "미완료 과제가 있는 원생이 없습니다" : "원생이 없습니다"}
          </p>
        ) : (
          <div className="space-y-1 lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto lg:pr-1">
            {filtered.map((s) => {
              const pending = s.assignments.filter((a) => !a.isCompleted).length;
              const isActive = s.id === selectedId;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-left transition-colors",
                    isActive
                      ? "bg-primary/10 border-primary/40"
                      : "border-transparent hover:bg-accent/50"
                  )}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        "shrink-0 h-1.5 w-1.5 rounded-full",
                        isActive ? "bg-primary" : "bg-muted-foreground/30"
                      )}
                    />
                    <span className="font-medium text-sm truncate">{s.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{s.grade}</span>
                  </span>
                  {pending > 0 && (
                    <span className="shrink-0 bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                      {pending}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </aside>

      {/* 우 패널 — 선택 학생 디테일 (모바일: 미선택 시 숨김) */}
      <section className={cn("min-w-0", selected ? "block" : "hidden lg:block")}>
        {!selected ? (
          <div className="flex items-center justify-center rounded-lg border border-dashed py-20">
            <p className="text-sm text-muted-foreground">학생을 선택하세요</p>
          </div>
        ) : (
          <DetailPanel
            key={selected.id}
            student={selected}
            onBack={() => setSelectedId(null)}
          />
        )}
      </section>
    </div>
  );
}

function DetailPanel({
  student,
  onBack,
}: {
  student: StudentWithAssignments;
  onBack: () => void;
}) {
  const pending = student.assignments.filter((a) => !a.isCompleted).length;
  const completed = student.assignments.filter((a) => a.isCompleted).length;
  const total = pending + completed;
  const rate = total === 0 ? null : Math.round((completed / total) * 100);

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {/* 모바일 뒤로 가기 */}
      <button
        onClick={onBack}
        className="lg:hidden flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        학생 목록
      </button>

      {/* 학생 헤더 */}
      <div className="flex items-baseline gap-2">
        <h2 className="text-lg font-bold">{student.name}</h2>
        <span className="text-sm text-muted-foreground">{student.grade}</span>
      </div>

      {/* 통계 */}
      <p className="text-xs text-muted-foreground">
        <span className="text-orange-500 font-medium">미완료 {pending}</span>
        {" · "}
        <span className="text-green-600 font-medium">완료 {completed}</span>
        {rate !== null && <> · 완료율 {rate}%</>}
      </p>

      <div className="border-t pt-3">
        <AssignmentPanel
          studentId={student.id}
          studentName={student.name}
          initialItems={student.assignments}
        />
      </div>
    </div>
  );
}
