"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { batchGenerateMonthlyReports } from "@/actions/online/parent-reports";

export function MonthlyBatchButton({ yearMonth }: { yearMonth: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const onClick = () => {
    if (
      !confirm(
        `전체 온라인 학생의 ${yearMonth} 월간 보고서 초안을 생성합니다.\n기존 초안이 있으면 덮어씁니다. 계속하시겠어요?`
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        const result = await batchGenerateMonthlyReports({ yearMonth });
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
    <Button size="sm" onClick={onClick} disabled={isPending}>
      {isPending ? (
        <>
          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          생성 중…
        </>
      ) : (
        <>
          <Sparkles className="h-3.5 w-3.5 mr-1" />
          전체 월간 초안 생성
        </>
      )}
    </Button>
  );
}
