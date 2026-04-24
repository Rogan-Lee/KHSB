"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { batchGenerateWeeklyReports } from "@/actions/online/parent-reports";
import { Sparkles } from "lucide-react";

export function ReportBatchButton({ weekStart }: { weekStart: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const onClick = () => {
    if (
      !confirm(
        `전체 온라인 학생의 ${weekStart} 주간 보고서 초안을 생성합니다.\n기존 초안이 있으면 덮어씁니다. 계속하시겠어요?`
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        const result = await batchGenerateWeeklyReports({ weekStart });
        toast.success(
          `생성 완료 — 성공 ${result.success} / 실패 ${result.failed} / 총 ${result.total}`
        );
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "생성 실패");
      }
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      className="inline-flex items-center gap-1.5 rounded-[8px] bg-ink text-white px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50"
    >
      <Sparkles className="h-3.5 w-3.5" />
      {isPending ? "생성 중..." : "전체 초안 생성"}
    </button>
  );
}
