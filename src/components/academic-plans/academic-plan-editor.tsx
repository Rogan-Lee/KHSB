"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { upsertAcademicPlan } from "@/actions/academic-plans";
import { toast } from "sonner";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { AcademicPlan } from "@/generated/prisma";

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

  return (
    <div className="space-y-2">
      {students.map((student) => {
        const plan = planMap[student.id];
        const isExpanded = expandedId === student.id;
        const subjects = (plan?.subjects as Record<string, { goal: string; actual: string }>) || {};

        return (
          <div key={student.id} className="border rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors"
              onClick={() => setExpandedId(isExpanded ? null : student.id)}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{student.name}</span>
                <span className="text-sm text-muted-foreground">{student.grade}</span>
                {plan?.overallGoal && (
                  <span className="text-xs text-muted-foreground line-clamp-1 max-w-48">
                    {plan.overallGoal}
                  </span>
                )}
              </div>
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {isExpanded && (
              <form
                action={(fd) => savePlan(student.id, fd)}
                className="px-4 pb-4 pt-2 bg-muted/20 space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor={`goal_${student.id}`}>이번 달 목표</Label>
                  <Textarea
                    id={`goal_${student.id}`}
                    name="overallGoal"
                    defaultValue={plan?.overallGoal || ""}
                    placeholder="이번 달 전체 목표를 작성하세요..."
                    rows={2}
                  />
                </div>

                {/* Subject goals */}
                <div>
                  <Label className="mb-2 block">과목별 목표 / 실적</Label>
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground px-2">
                      <span>과목</span>
                      <span>목표</span>
                      <span>실적</span>
                    </div>
                    {DEFAULT_SUBJECTS.map((subj) => (
                      <div key={subj} className="grid grid-cols-3 gap-2 items-center">
                        <span className="text-sm px-2">{subj}</span>
                        <Input
                          name={`subject_${subj}_goal`}
                          defaultValue={subjects[subj]?.goal || ""}
                          placeholder="목표"
                          className="text-sm h-8"
                        />
                        <Input
                          name={`subject_${subj}_actual`}
                          defaultValue={subjects[subj]?.actual || ""}
                          placeholder="실적"
                          className="text-sm h-8"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`reflection_${student.id}`}>월말 회고</Label>
                  <Textarea
                    id={`reflection_${student.id}`}
                    name="reflection"
                    defaultValue={plan?.reflection || ""}
                    placeholder="이번 달 학습 회고를 작성하세요..."
                    rows={3}
                  />
                </div>

                <Button type="submit" size="sm" disabled={isPending}>
                  저장
                </Button>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}
