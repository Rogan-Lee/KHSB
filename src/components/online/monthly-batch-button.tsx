"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { batchGenerateMonthlyReports } from "@/actions/online/parent-reports";
import { useConfirm } from "@/components/online/use-confirm";

export function MonthlyBatchButton({ yearMonth }: { yearMonth: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();

  const onClick = async () => {
    if (
      !(await confirm({
        title: `${yearMonth} 월간 초안을 전부 만들까요?`,
        description:
          "온라인 관리 학생 전체의 월간 보고서 초안을 지금 생성해요.\n이미 있는 초안은 새 내용으로 덮어써요.",
        confirmLabel: "덮어쓰고 생성",
        destructive: true,
      }))
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
    <>
      <Button onClick={onClick} disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="animate-spin" />
            생성 중…
          </>
        ) : (
          <>
            <Sparkles />
            전체 월간 초안 생성
          </>
        )}
      </Button>
      {confirmDialog}
    </>
  );
}
