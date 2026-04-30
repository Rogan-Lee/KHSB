"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
    <section className="rounded-[12px] border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-emerald-900">최종 결과물</h3>
        {dirty && (
          <span className="text-[11px] text-amber-700">변경됨 — 저장 필요</span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3">
        <label className="block">
          <span className="text-[11px] font-semibold text-ink-4 block mb-1">
            점수 · 평가
          </span>
          <Input
            value={score}
            onChange={(e) => setScore(e.target.value)}
            placeholder="예: 95/100, A, 상"
            className="text-[12.5px]"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-ink-4 block mb-1">
            컨설턴트 총평
          </span>
          <Textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            placeholder="이 수행평가에서 학생의 강점·보완점·다음 연계 활동 등"
            className="text-[12.5px] resize-y"
          />
        </label>
      </div>

      <div className="flex items-center justify-between gap-3 pt-2 border-t border-emerald-200">
        <label className="inline-flex items-center gap-2 text-[12.5px] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeInReport}
            onChange={(e) => setIncludeInReport(e.target.checked)}
            className="rounded"
          />
          학부모 보고서에 포함
        </label>
        <Button size="sm" onClick={onSave} disabled={saving || !dirty}>
          {saving ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Check className="h-3 w-3 mr-1" />
          )}
          결과물 저장
        </Button>
      </div>
    </section>
  );
}
