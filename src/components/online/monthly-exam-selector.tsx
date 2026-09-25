"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GraduationCap, Loader2 } from "lucide-react";
import { inputBaseClass } from "@/components/ui/input";
import { Skeleton } from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";
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
    <section className="flex flex-col gap-x3 rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default px-x5 py-x4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-x3">
        <GraduationCap className="mt-x0_5 size-5 shrink-0 text-fg-neutral-subtle" aria-hidden />
        <div className="min-w-0">
          <label htmlFor={`exam-${reportId}`} className="t4-bold text-fg-neutral">
            모의고사 성적 포함
          </label>
          <p className="mt-x0_5 t3-regular text-fg-neutral-subtle">
            {!loading && options.length === 0
              ? "이 학생의 모의고사 성적이 없어요."
              : "바꾸면 선택한 성적을 반영해 초안을 다시 만들어요."}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-x2 sm:w-72">
        {loading ? (
          <Skeleton className="h-x10 w-full rounded-r2" />
        ) : (
          <select
            id={`exam-${reportId}`}
            defaultValue={currentSessionId ?? ""}
            disabled={pending}
            onChange={(e) => onChange(e.target.value)}
            className={cn(inputBaseClass, "h-x10 min-w-0 flex-1 cursor-pointer")}
          >
            <option value="">포함 안 함</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.title} ({o.examDate})</option>
            ))}
          </select>
        )}
        {pending && (
          <Loader2 className="size-4 shrink-0 animate-spin text-fg-neutral-subtle" aria-label="재생성 중" />
        )}
      </div>
    </section>
  );
}
