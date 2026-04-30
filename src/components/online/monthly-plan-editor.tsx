"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  saveMonthlyPlan,
  type MonthlyGoals,
  type MonthlyMilestones,
} from "@/actions/online/monthly-plans";
import { formatYearMonth, shiftMonth } from "@/lib/online/month";

export function MonthlyPlanEditor({
  studentId,
  initialYearMonth,
  initialSubjectGoals,
  initialMilestones,
  initialRetrospective,
  subjects,
  canEdit,
}: {
  studentId: string;
  initialYearMonth: string;
  initialSubjectGoals: MonthlyGoals;
  initialMilestones: MonthlyMilestones;
  initialRetrospective: string | null;
  subjects: readonly string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  const [subjectGoals, setSubjectGoals] = useState<MonthlyGoals>(initialSubjectGoals);
  const [milestones, setMilestones] = useState<MonthlyMilestones>(initialMilestones);
  const [retrospective, setRetrospective] = useState(initialRetrospective ?? "");

  const [newMilestoneDate, setNewMilestoneDate] = useState("");
  const [newMilestoneLabel, setNewMilestoneLabel] = useState("");

  const goToMonth = (offset: number) => {
    router.push(`?month=${shiftMonth(initialYearMonth, offset)}`);
  };

  const setGoal = (subject: string, text: string) => {
    setSubjectGoals((prev) => ({ ...prev, [subject]: text }));
  };

  const addMilestone = () => {
    if (!newMilestoneDate || !newMilestoneLabel.trim()) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newMilestoneDate)) {
      toast.error("날짜 형식이 올바르지 않습니다");
      return;
    }
    setMilestones((prev) => ({
      ...prev,
      [newMilestoneDate]: newMilestoneLabel.trim(),
    }));
    setNewMilestoneDate("");
    setNewMilestoneLabel("");
  };

  const removeMilestone = (date: string) => {
    setMilestones((prev) => {
      const next = { ...prev };
      delete next[date];
      return next;
    });
  };

  const onSave = () => {
    setSaving(true);
    startTransition(async () => {
      try {
        await saveMonthlyPlan({
          studentId,
          yearMonth: initialYearMonth,
          subjectGoals,
          milestones,
          retrospective: retrospective || null,
        });
        toast.success("월간 계획이 저장되었습니다");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "저장 실패");
      } finally {
        setSaving(false);
      }
    });
  };

  const sortedMilestones = Object.entries(milestones).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  return (
    <div className="space-y-4">
      {/* 월 selector */}
      <header className="flex items-center justify-between rounded-[12px] border border-line bg-panel px-3 py-2">
        <button
          type="button"
          onClick={() => goToMonth(-1)}
          className="p-1.5 rounded-[6px] text-ink-3 hover:text-ink hover:bg-canvas-2"
          title="이전 달"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-[13px] font-semibold text-ink tabular-nums">
          {formatYearMonth(initialYearMonth)}
        </div>
        <button
          type="button"
          onClick={() => goToMonth(1)}
          className="p-1.5 rounded-[6px] text-ink-3 hover:text-ink hover:bg-canvas-2"
          title="다음 달"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </header>

      {/* 마일스톤 */}
      <section className="rounded-[12px] border border-line bg-panel p-4 space-y-3">
        <h3 className="text-[12px] font-semibold text-ink-4 uppercase tracking-wide">
          마일스톤 · 이벤트
        </h3>
        {sortedMilestones.length === 0 ? (
          <p className="text-[12px] text-ink-5">
            모의고사 · 수행평가 · 내신시험 등 월내 중요 일정을 날짜와 함께 추가하세요.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {sortedMilestones.map(([date, label]) => (
              <li
                key={date}
                className="flex items-center gap-2 rounded-[8px] bg-canvas-2 px-3 py-1.5 text-[12.5px]"
              >
                <span className="text-ink-3 tabular-nums shrink-0">
                  {date.slice(5)}
                </span>
                <span className="flex-1 text-ink">{label}</span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => removeMilestone(date)}
                    className="p-1 text-red-400 hover:text-red-600"
                    title="삭제"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={newMilestoneDate}
              onChange={(e) => setNewMilestoneDate(e.target.value)}
              className="max-w-[160px] text-[12.5px]"
              min={`${initialYearMonth}-01`}
              max={`${initialYearMonth}-31`}
            />
            <Input
              value={newMilestoneLabel}
              onChange={(e) => setNewMilestoneLabel(e.target.value)}
              placeholder="예: 6월 모의고사"
              className="flex-1 text-[12.5px]"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addMilestone();
                }
              }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={addMilestone}
              disabled={!newMilestoneDate || !newMilestoneLabel.trim()}
            >
              <Plus className="h-3 w-3 mr-1" />
              추가
            </Button>
          </div>
        )}
      </section>

      {/* 과목별 월간 목표 */}
      <section className="space-y-2">
        <h3 className="text-[12px] font-semibold text-ink-4 uppercase tracking-wide">
          과목별 월간 목표
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
              <Textarea
                value={subjectGoals[subject] ?? ""}
                onChange={(e) => setGoal(subject, e.target.value)}
                disabled={!canEdit}
                rows={2}
                placeholder={`${subject} 이번 달 목표 (주차 배분 포함)`}
                className="text-[12.5px] resize-y disabled:opacity-60"
              />
            </label>
          </div>
        ))}
      </section>

      {/* 회고 */}
      <section className="rounded-[10px] border border-line bg-panel p-3">
        <label className="block">
          <span className="text-[12px] font-semibold text-ink block mb-1">
            월간 회고
          </span>
          <Textarea
            value={retrospective}
            onChange={(e) => setRetrospective(e.target.value)}
            disabled={!canEdit}
            rows={4}
            placeholder="달성률 / 핵심 이슈 / 다음 달 조정 사항"
            className="text-[12.5px] resize-y disabled:opacity-60"
          />
        </label>
      </section>

      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={onSave} disabled={saving}>
            {saving ? "저장 중..." : "월간 계획 저장"}
          </Button>
        </div>
      )}
    </div>
  );
}
