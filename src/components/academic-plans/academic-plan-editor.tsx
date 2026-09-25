"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { upsertAcademicPlan } from "@/actions/academic-plans";
import { toast } from "sonner";
import { ChevronDown, Users } from "lucide-react";
import type { AcademicPlan } from "@/generated/prisma";
import { EmptyState, FormActions, FormField, StatusBadge } from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";

interface Student {
  id: string;
  name: string;
  grade: string;
}

interface Props {
  students: Student[];
  planMap: Record<string, AcademicPlan>;
  year: number;
  month: number;
}

const DEFAULT_SUBJECTS = ["국어", "수학", "영어", "탐구1", "탐구2"];

export function AcademicPlanEditor({ students, planMap, year, month }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function savePlan(studentId: string, formData: FormData) {
    const overallGoal = formData.get("overallGoal") as string;
    const reflection = formData.get("reflection") as string;

    const subjects: Record<string, { goal: string; actual: string }> = {};
    DEFAULT_SUBJECTS.forEach((subj) => {
      subjects[subj] = {
        goal: formData.get(`subject_${subj}_goal`) as string || "",
        actual: formData.get(`subject_${subj}_actual`) as string || "",
      };
    });

    startTransition(async () => {
      try {
        await upsertAcademicPlan(studentId, year, month, {
          overallGoal,
          reflection,
          subjects,
        });
        toast.success("플랜이 저장되었습니다");
      } catch {
        toast.error("저장에 실패했습니다");
      }
    });
  }

  if (students.length === 0) {
    return (
      <EmptyState
        compact
        icon={Users}
        title="재원 중인 원생이 없어요"
        description="원생을 등록하면 여기서 월간 플랜을 작성할 수 있어요"
      />
    );
  }

  return (
    <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
      {students.map((student) => {
        const plan = planMap[student.id];
        const isExpanded = expandedId === student.id;
        const subjects = (plan?.subjects as Record<string, { goal: string; actual: string }>) || {};

        return (
          <li key={student.id}>
            <button
              type="button"
              aria-expanded={isExpanded}
              className="flex w-full items-center gap-x3 px-x5 py-x3_5 text-left transition-colors hover:bg-bg-layer-default-pressed"
              onClick={() => setExpandedId(isExpanded ? null : student.id)}
            >
              <div className="flex min-w-0 flex-1 items-center gap-x2">
                <span className="shrink-0 t4-medium text-fg-neutral">{student.name}</span>
                <span className="shrink-0 t3-regular text-fg-neutral-subtle">{student.grade}</span>
                {plan?.overallGoal && (
                  <span className="hidden min-w-0 truncate t3-regular text-fg-neutral-muted sm:block">
                    {plan.overallGoal}
                  </span>
                )}
              </div>
              {plan ? (
                <StatusBadge tone="ok">작성됨</StatusBadge>
              ) : (
                <StatusBadge tone="gray">미작성</StatusBadge>
              )}
              <ChevronDown
                className={cn("size-4 shrink-0 text-fg-neutral-subtle transition-transform", isExpanded && "rotate-180")}
                aria-hidden
              />
            </button>

            {isExpanded && (
              <form
                action={(fd) => savePlan(student.id, fd)}
                className="flex flex-col gap-x5 bg-bg-layer-fill px-x5 py-x5"
              >
                <FormField label="이번 달 목표" htmlFor={`goal_${student.id}`}>
                  <Textarea
                    id={`goal_${student.id}`}
                    name="overallGoal"
                    defaultValue={plan?.overallGoal || ""}
                    placeholder="이번 달 전체 목표를 작성하세요..."
                    rows={2}
                    className="min-h-0"
                  />
                </FormField>

                {/* Subject goals */}
                <div className="flex flex-col gap-x2">
                  <span className="t4-medium text-fg-neutral">과목별 목표 / 실적</span>
                  <div className="overflow-hidden rounded-r3 border border-stroke-neutral-muted bg-bg-layer-default">
                    <div className="grid grid-cols-[4.5rem_1fr_1fr] gap-x2 border-b border-stroke-neutral-muted bg-bg-layer-fill px-x3 py-x2 t3-medium text-fg-neutral-subtle sm:grid-cols-[6rem_1fr_1fr]">
                      <span>과목</span>
                      <span>목표</span>
                      <span>실적</span>
                    </div>
                    <div className="flex flex-col gap-x2 p-x3">
                      {DEFAULT_SUBJECTS.map((subj) => (
                        <div key={subj} className="grid grid-cols-[4.5rem_1fr_1fr] items-center gap-x2 sm:grid-cols-[6rem_1fr_1fr]">
                          <span className="t4-medium text-fg-neutral">{subj}</span>
                          <Input
                            name={`subject_${subj}_goal`}
                            defaultValue={subjects[subj]?.goal || ""}
                            placeholder="목표"
                            aria-label={`${subj} 목표`}
                          />
                          <Input
                            name={`subject_${subj}_actual`}
                            defaultValue={subjects[subj]?.actual || ""}
                            placeholder="실적"
                            aria-label={`${subj} 실적`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <FormField label="월말 회고" htmlFor={`reflection_${student.id}`}>
                  <Textarea
                    id={`reflection_${student.id}`}
                    name="reflection"
                    defaultValue={plan?.reflection || ""}
                    placeholder="이번 달 학습 회고를 작성하세요..."
                    rows={3}
                  />
                </FormField>

                <FormActions className="pt-0">
                  <Button type="button" variant="ghost" onClick={() => setExpandedId(null)}>
                    접기
                  </Button>
                  <Button type="submit" disabled={isPending}>
                    {isPending ? "저장 중…" : "저장"}
                  </Button>
                </FormActions>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
