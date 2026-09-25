"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveWeeklyPlan, type WeeklyPlanGoals } from "@/actions/online/weekly-plans";
import { formatWeekRange, shiftWeek } from "@/lib/online/week";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormActions, FormField, Notice, Section } from "@/components/backoffice/ui";

export function WeeklyPlanEditor({
  studentId,
  initialWeekStart,
  initialGoals,
  initialStudyHours,
  initialRetrospective,
  subjects,
  canEdit,
}: {
  studentId: string;
  initialWeekStart: string;
  initialGoals: WeeklyPlanGoals;
  initialStudyHours: number | null;
  initialRetrospective: string | null;
  subjects: readonly string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [goals, setGoals] = useState<WeeklyPlanGoals>(initialGoals);
  const [studyHours, setStudyHours] = useState<string>(
    initialStudyHours != null ? String(initialStudyHours) : ""
  );
  const [retrospective, setRetrospective] = useState(initialRetrospective ?? "");

  const goToWeek = (offset: number) => {
    const target = shiftWeek(initialWeekStart, offset);
    router.push(`?week=${target}`);
  };

  const setGoal = (subject: string, text: string) => {
    setGoals((prev) => ({ ...prev, [subject]: text }));
  };

  const onSave = () => {
    startTransition(async () => {
      try {
        await saveWeeklyPlan({
          studentId,
          weekStart: initialWeekStart,
          goals,
          studyHours: studyHours ? Number(studyHours) : null,
          retrospective: retrospective || null,
        });
        toast.success("주간 계획이 저장되었습니다");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "저장 실패");
      }
    });
  };

  return (
    <div className="flex flex-col gap-x4">
      <div className="flex items-center gap-x3">
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={() => goToWeek(-1)}
          aria-label="이전 주"
        >
          <ChevronLeft />
        </Button>
        <div className="t6-bold tabular-nums text-fg-neutral">{formatWeekRange(initialWeekStart)}</div>
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={() => goToWeek(1)}
          aria-label="다음 주"
        >
          <ChevronRight />
        </Button>
      </div>

      {!canEdit && (
        <Notice tone="gray" icon={Eye}>
          보기 전용이에요 — 관리 멘토와 원장만 수정할 수 있어요.
        </Notice>
      )}

      <Section title="과목별 목표">
        <div className="flex flex-col gap-x5">
          {subjects.map((subject) => (
            <FormField key={subject} label={subject} htmlFor={`weekly-goal-${subject}`}>
              <Textarea
                id={`weekly-goal-${subject}`}
                value={goals[subject] ?? ""}
                onChange={(e) => setGoal(subject, e.target.value)}
                disabled={!canEdit}
                rows={2}
                placeholder={`${subject} 이번 주 목표를 적어 주세요`}
                className="resize-y"
              />
            </FormField>
          ))}
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-x4 md:grid-cols-[1fr_200px]">
        <Section title="주간 회고">
          <Textarea
            aria-label="주간 회고"
            value={retrospective}
            onChange={(e) => setRetrospective(e.target.value)}
            disabled={!canEdit}
            rows={4}
            placeholder="달성률 / 이슈 / 다음 주 조정 사항"
            className="resize-y"
          />
        </Section>
        <Section title="예상 학습시간">
          <div className="flex items-center gap-x2">
            <Input
              type="number"
              min={0}
              aria-label="예상 학습시간 (시간)"
              value={studyHours}
              onChange={(e) => setStudyHours(e.target.value)}
              disabled={!canEdit}
              placeholder="0"
              className="min-w-0 flex-1 tabular-nums"
            />
            <span className="shrink-0 t4-regular text-fg-neutral-subtle">시간</span>
          </div>
        </Section>
      </div>

      {canEdit && (
        <FormActions>
          <Button type="button" onClick={onSave} disabled={isPending} className="w-full sm:w-auto">
            {isPending ? "저장 중…" : "주간 계획 저장"}
          </Button>
        </FormActions>
      )}
    </div>
  );
}
