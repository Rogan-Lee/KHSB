"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FormActions, FormField, Section } from "@/components/backoffice/ui";
import { updateTaskResult } from "@/actions/online/task-results";

export function TaskResultEditor({
  taskId,
  initialScore,
  initialSummary,
  initialIncludeInReport,
}: {
  taskId: string;
  initialScore: string | null;
  initialSummary: string | null;
  initialIncludeInReport: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [score, setScore] = useState(initialScore ?? "");
  const [summary, setSummary] = useState(initialSummary ?? "");
  const [includeInReport, setIncludeInReport] = useState(initialIncludeInReport);
  const [saving, setSaving] = useState(false);
  const uid = useId();
  const scoreId = `${uid}-score`;
  const summaryId = `${uid}-summary`;
  const reportId = `${uid}-report`;

  const dirty =
    score !== (initialScore ?? "") ||
    summary !== (initialSummary ?? "") ||
    includeInReport !== initialIncludeInReport;

  const onSave = () => {
    setSaving(true);
    startTransition(async () => {
      try {
        await updateTaskResult({
          taskId,
          score: score || null,
          consultantSummary: summary || null,
          includeInReport,
        });
        toast.success("결과물이 저장되었습니다");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "저장 실패");
      } finally {
        setSaving(false);
      }
    });
  };

  return (
    <Section
      title="최종 결과물"
      description="점수와 총평을 남기면 포트폴리오와 학부모 보고서에 쓰여요"
      actions={dirty ? <span className="t3-medium text-fg-warning">변경됨 — 저장 필요</span> : undefined}
    >
      <div className="flex flex-col gap-x4">
        <div className="grid grid-cols-1 gap-x4 md:grid-cols-[200px_1fr]">
          <FormField label="점수 · 평가" htmlFor={scoreId}>
            <Input
              id={scoreId}
              value={score}
              onChange={(e) => setScore(e.target.value)}
              placeholder="예: 95/100, A, 상"
            />
          </FormField>
          <FormField label="컨설턴트 총평" htmlFor={summaryId}>
            <Textarea
              id={summaryId}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              placeholder="이 수행평가에서 학생의 강점·보완점·다음 연계 활동 등"
              className="resize-y"
            />
          </FormField>
        </div>

        <div className="flex flex-col gap-x3 border-t border-stroke-neutral-muted pt-x4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-x2">
            <Checkbox
              id={reportId}
              checked={includeInReport}
              onCheckedChange={(v) => setIncludeInReport(v === true)}
            />
            <Label htmlFor={reportId} className="cursor-pointer select-none t4-regular">
              학부모 보고서에 포함
            </Label>
          </div>
          <FormActions className="pt-0">
            <Button
              type="button"
              variant="brand"
              onClick={onSave}
              disabled={saving || !dirty}
              className="w-full sm:w-auto"
            >
              {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
              {saving ? "저장 중…" : "결과물 저장"}
            </Button>
          </FormActions>
        </div>
      </div>
    </Section>
  );
}
