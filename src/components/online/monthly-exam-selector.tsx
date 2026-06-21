"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GraduationCap, Loader2 } from "lucide-react";
import { listSelectableExamSessions, setMonthlyReportExamSession } from "@/actions/online/parent-reports";

type ExamOption = { id: string; title: string; examDate: string };

/** 월간 리포트에 포함할 모의고사 선택 — 변경 시 초안 재생성. */
export function MonthlyExamSelector({
  reportId,
  studentId,
  currentSessionId,
}: {
  reportId: string;
  studentId: string;
  currentSessionId: string | null;
}) {
  const router = useRouter();
  const [options, setOptions] = useState<ExamOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    listSelectableExamSessions(studentId)
      .then(setOptions)
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }, [studentId]);

  function onChange(value: string) {
    const sessionId = value || null;
    startTransition(async () => {
      try {
        await setMonthlyReportExamSession(reportId, sessionId);
        toast.success(sessionId ? "모의고사 반영 후 재생성했습니다" : "모의고사 제외 후 재생성했습니다");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "변경 실패");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-ink/10 bg-panel p-3">
      <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink">
        <GraduationCap className="h-4 w-4 text-ink-3" />
        모의고사 성적 포함
      </span>
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-ink-3" />
      ) : (
        <select
          defaultValue={currentSessionId ?? ""}
          disabled={pending}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 rounded-md border border-ink/15 bg-background px-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
        >
          <option value="">포함 안 함</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.title} ({o.examDate})</option>
          ))}
        </select>
      )}
      {pending && <Loader2 className="h-4 w-4 animate-spin text-ink-3" />}
      {!loading && options.length === 0 && (
        <span className="text-[12px] text-ink-4">이 학생의 모의고사 성적이 없습니다</span>
      )}
    </div>
  );
}
