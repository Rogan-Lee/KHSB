"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Eye, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormActions, FormField, Notice, Section } from "@/components/backoffice/ui";
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
    <div className="flex flex-col gap-x4">
      {/* 월 selector */}
      <div className="flex items-center gap-x3">
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={() => goToMonth(-1)}
          aria-label="이전 달"
        >
          <ChevronLeft />
        </Button>
        <div className="t6-bold tabular-nums text-fg-neutral">{formatYearMonth(initialYearMonth)}</div>
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={() => goToMonth(1)}
          aria-label="다음 달"
        >
          <ChevronRight />
        </Button>
      </div>

      {!canEdit && (
        <Notice tone="gray" icon={Eye}>
          보기 전용이에요 — 관리 멘토와 원장만 수정할 수 있어요.
        </Notice>
      )}

      {/* 마일스톤 */}
      <Section title="마일스톤 · 이벤트" count={sortedMilestones.length || undefined}>
        <div className="flex flex-col gap-x4">
          {sortedMilestones.length === 0 ? (
            <p className="t4-regular text-fg-neutral-subtle">
              모의고사 · 수행평가 · 내신시험 등 월내 중요 일정을 날짜와 함께 추가하세요.
            </p>
          ) : (
            <ul className="divide-y divide-stroke-neutral-muted">
              {sortedMilestones.map(([date, label]) => (
                <li key={date} className="flex min-h-12 items-center gap-x3 py-x2">
                  <span className="w-x12 shrink-0 t4-medium tabular-nums text-fg-neutral-subtle">
                    {date.slice(5)}
                  </span>
                  <span className="min-w-0 flex-1 break-words t4-regular text-fg-neutral">{label}</span>
                  {canEdit && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => removeMilestone(date)}
                      aria-label="마일스톤 삭제"
                      className="text-fg-neutral-subtle hover:text-fg-critical"
                    >
                      <Trash2 />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canEdit && (
            <div className="flex flex-col gap-x2 sm:flex-row sm:items-center">
              <Input
                type="date"
                aria-label="마일스톤 날짜"
                value={newMilestoneDate}
                onChange={(e) => setNewMilestoneDate(e.target.value)}
                className="tabular-nums sm:w-44"
                min={`${initialYearMonth}-01`}
                max={`${initialYearMonth}-31`}
              />
              <Input
                aria-label="마일스톤 내용"
                value={newMilestoneLabel}
                onChange={(e) => setNewMilestoneLabel(e.target.value)}
                placeholder="예: 6월 모의고사"
                className="min-w-0 sm:flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addMilestone();
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addMilestone}
                disabled={!newMilestoneDate || !newMilestoneLabel.trim()}
              >
                <Plus />
                추가
              </Button>
            </div>
          )}
        </div>
      </Section>

      {/* 과목별 월간 목표 */}
      <Section title="과목별 월간 목표">
        <div className="flex flex-col gap-x5">
          {subjects.map((subject) => (
            <FormField key={subject} label={subject} htmlFor={`monthly-goal-${subject}`}>
              <Textarea
                id={`monthly-goal-${subject}`}
                value={subjectGoals[subject] ?? ""}
                onChange={(e) => setGoal(subject, e.target.value)}
                disabled={!canEdit}
                rows={2}
                placeholder={`${subject} 이번 달 목표 (주차 배분 포함)`}
                className="resize-y"
              />
            </FormField>
          ))}
        </div>
      </Section>

      {/* 회고 */}
      <Section title="월간 회고">
        <Textarea
          aria-label="월간 회고"
          value={retrospective}
          onChange={(e) => setRetrospective(e.target.value)}
          disabled={!canEdit}
          rows={4}
          placeholder="달성률 / 핵심 이슈 / 다음 달 조정 사항"
          className="resize-y"
        />
      </Section>

      {canEdit && (
        <FormActions>
          <Button type="button" onClick={onSave} disabled={saving} className="w-full sm:w-auto">
            {saving ? "저장 중…" : "월간 계획 저장"}
          </Button>
        </FormActions>
      )}
    </div>
  );
}
