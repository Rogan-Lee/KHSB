"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveWeeklyPlan, type WeeklyPlanGoals } from "@/actions/online/weekly-plans";
import { formatWeekRange, shiftWeek } from "@/lib/online/week";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
    <div className="space-y-4">
      <header className="flex items-center justify-between rounded-[12px] border border-line bg-panel px-3 py-2">
        <button
          type="button"
          onClick={() => goToWeek(-1)}
          className="p-1.5 rounded-[6px] text-ink-3 hover:text-ink hover:bg-canvas-2"
          title="이전 주"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-[13px] font-semibold text-ink tabular-nums">
          {formatWeekRange(initialWeekStart)}
        </div>
        <button
          type="button"
          onClick={() => goToWeek(1)}
          className="p-1.5 rounded-[6px] text-ink-3 hover:text-ink hover:bg-canvas-2"
          title="다음 주"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </header>

      <section className="space-y-2">
        <h3 className="text-[12px] font-semibold text-ink-4 uppercase tracking-wide">
          과목별 목표
        </h3>
        {subjects.map((subject) => (
          <div
            key={subject}
            className="rounded-[10px] border border-line bg-panel p-3"
          >
            <label className="block">
              <span className="text-[12px] font-semibold text-ink block mb-1">
                {subject}
              </span>
              <textarea
                value={goals[subject] ?? ""}
                onChange={(e) => setGoal(subject, e.target.value)}
                disabled={!canEdit}
                rows={2}
                placeholder={`${subject} 이번 주 목표를 적어 주세요`}
                className="w-full resize-y rounded-[6px] border border-line bg-canvas px-2.5 py-1.5 text-[12.5px] disabled:opacity-60"
              />
            </label>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
        <div className="rounded-[10px] border border-line bg-panel p-3">
          <label className="block">
            <span className="text-[12px] font-semibold text-ink block mb-1">
              주간 회고
            </span>
            <textarea
              value={retrospective}
              onChange={(e) => setRetrospective(e.target.value)}
              disabled={!canEdit}
              rows={4}
              placeholder="달성률 / 이슈 / 다음 주 조정 사항"
              className="w-full resize-y rounded-[6px] border border-line bg-canvas px-2.5 py-1.5 text-[12.5px] disabled:opacity-60"
            />
          </label>
        </div>
        <div className="rounded-[10px] border border-line bg-panel p-3 md:w-[180px]">
          <label className="block">
            <span className="text-[12px] font-semibold text-ink block mb-1">
              예상 학습시간
            </span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                value={studyHours}
                onChange={(e) => setStudyHours(e.target.value)}
                disabled={!canEdit}
                placeholder="0"
                className="flex-1 rounded-[6px] border border-line bg-canvas px-2.5 py-1.5 text-[12.5px] disabled:opacity-60"
              />
              <span className="text-[12px] text-ink-4">시간</span>
            </div>
          </label>
        </div>
      </div>

      {canEdit && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onSave}
            disabled={isPending}
            className="rounded-[8px] bg-ink text-white px-4 py-2 text-[12.5px] font-semibold disabled:opacity-50"
          >
            {isPending ? "저장 중..." : "주간 계획 저장"}
          </button>
        </div>
      )}
    </div>
  );
}
