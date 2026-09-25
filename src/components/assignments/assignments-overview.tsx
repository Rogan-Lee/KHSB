"use client";

import { useMemo, useState } from "react";
import { AssignmentPanel } from "./assignment-panel";
import { cn } from "@/lib/utils";
import type { Assignment } from "@/generated/prisma";
import { ArrowLeft, CheckCircle2, ChevronRight, ClipboardList, Users } from "lucide-react";
import { Combobox } from "@/components/ui/combobox";
import { Avatar, EmptyState, FilterChip, ProgressBar, StatusBadge } from "@/components/backoffice/ui";

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

  const pendingStudentCount = useMemo(
    () => students.filter((s) => s.assignments.some((a) => !a.isCompleted)).length,
    [students]
  );

  return (
    <div className="grid grid-cols-1 items-start gap-x4 lg:grid-cols-[300px_1fr]">
      {/* 좌 패널 — 학생 리스트 (모바일: 선택 시 숨김) */}
      <aside
        className={cn(
          "overflow-hidden rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default lg:sticky lg:top-20",
          selected ? "hidden lg:block" : "block"
        )}
      >
        <div className="flex flex-col gap-x3 border-b border-stroke-neutral-muted p-x4">
          {/* 학생 검색 콤보박스 */}
          <Combobox
            items={comboItems}
            value={selectedId ?? ""}
            onChange={handleSelect}
            placeholder="학생 검색..."
            searchPlaceholder="이름 검색..."
            emptyMessage="학생이 없습니다"
          />

          {/* 필터 칩 */}
          <div className="flex flex-wrap items-center gap-x1_5">
            <FilterChip selected={filter === "pending"} count={pendingStudentCount} onClick={() => setFilter("pending")}>
              미완료 있는 원생
            </FilterChip>
            <FilterChip selected={filter === "all"} count={students.length} onClick={() => setFilter("all")}>
              전체 원생
            </FilterChip>
          </div>
        </div>

        {/* 학생 리스트 */}
        {filtered.length === 0 ? (
          <EmptyState
            compact
            icon={filter === "pending" ? CheckCircle2 : Users}
            title={filter === "pending" ? "미완료 과제가 있는 원생이 없어요" : "원생이 없어요"}
            description={filter === "pending" ? "모든 과제가 완료됐어요." : undefined}
          />
        ) : (
          <ul className="divide-y divide-stroke-neutral-muted lg:max-h-[calc(100vh-18rem)] lg:overflow-y-auto">
            {filtered.map((s) => {
              const pending = s.assignments.filter((a) => !a.isCompleted).length;
              const isActive = s.id === selectedId;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-x3 px-x4 py-x3 text-left transition-colors",
                      isActive ? "bg-bg-neutral-weak" : "hover:bg-bg-layer-default-pressed"
                    )}
                  >
                    <Avatar name={s.name} size={32} muted={!isActive && pending === 0} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-fg-neutral", isActive ? "t4-bold" : "t4-medium")}>
                        {s.name}
                      </span>
                      <span className="block t2-regular text-fg-neutral-subtle">{s.grade}</span>
                    </span>
                    {pending > 0 ? (
                      <StatusBadge tone="warn">미완료 {pending}</StatusBadge>
                    ) : (
                      <ChevronRight className="size-4 shrink-0 text-fg-placeholder" aria-hidden />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      {/* 우 패널 — 선택 학생 디테일 (모바일: 미선택 시 숨김) */}
      <section className={cn("min-w-0", selected ? "block" : "hidden lg:block")}>
        {!selected ? (
          <div className="rounded-r4 border border-dashed border-stroke-neutral-weak">
            <EmptyState
              icon={ClipboardList}
              title="원생을 선택하세요"
              description="왼쪽 목록에서 원생을 고르면 과제를 보고 추가할 수 있어요."
            />
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
    <div className="rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default">
      <div className="flex flex-col gap-x3 border-b border-stroke-neutral-muted p-x5">
        {/* 모바일 뒤로 가기 */}
        <button
          type="button"
          onClick={onBack}
          className="-ml-1 inline-flex w-fit items-center gap-x1 rounded-r2 px-1 py-x0_5 t4-medium text-fg-neutral-subtle transition-colors hover:text-fg-neutral lg:hidden"
        >
          <ArrowLeft className="size-4" aria-hidden />
          원생 목록
        </button>

        {/* 학생 헤더 */}
        <div className="flex items-center gap-x3">
          <Avatar name={student.name} size={48} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-x2">
              <h2 className="truncate t7-bold text-fg-neutral">{student.name}</h2>
              <span className="t4-regular text-fg-neutral-subtle">{student.grade}</span>
            </div>
            {/* 통계 */}
            <p className="mt-x0_5 t3-regular tabular-nums text-fg-neutral-subtle">
              미완료 <span className={cn("t3-bold", pending > 0 ? "text-fg-warning" : "text-fg-neutral")}>{pending}</span>
              {" · "}완료 <span className="t3-bold text-fg-neutral">{completed}</span>
              {rate !== null && (
                <>
                  {" · "}완료율 <span className="t3-bold text-fg-neutral">{rate}%</span>
                </>
              )}
            </p>
          </div>
        </div>
        {rate !== null && <ProgressBar value={rate / 100} tone="ok" />}
      </div>

      <div className="p-x5">
        <AssignmentPanel
          studentId={student.id}
          studentName={student.name}
          initialItems={student.assignments}
        />
      </div>
    </div>
  );
}
