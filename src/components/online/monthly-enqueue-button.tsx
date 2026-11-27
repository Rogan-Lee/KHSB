"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { batchEnqueueReports } from "@/actions/online/parent-reports";
import { useConfirm } from "@/components/online/use-confirm";

/** 전체 온라인 학생의 월간 보고서를 예약 큐에 등록 (야간 루틴이 생성). */
export function MonthlyEnqueueButton({ yearMonth }: { yearMonth: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();

  const onClick = async () => {
    if (
      !(await confirm({
        title: `${yearMonth} 월간 보고서를 예약 등록할까요?`,
        description:
          "온라인 관리 학생 전체를 예약 대기열에 올려요.\n야간 Claude 루틴이 순서대로 초안을 만들어요.",
        confirmLabel: "예약 등록",
      }))
    ) {
      return;
    }
    startTransition(async () => {
      try {
        const result = await batchEnqueueReports({
          type: "MONTHLY",
          period: yearMonth,
        });
        toast.success(
          `예약 등록 ${result.queued}건 · 실패 ${result.failed}건 · 총 ${result.total}명`
        );
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "예약 등록 실패");
      }
    });
  };

  return (
    <>
      <Button variant="outline" onClick={onClick} disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="animate-spin" />
            등록 중…
          </>
        ) : (
          <>
            <CalendarClock />
            전체 월간 예약 등록
          </>
        )}
      </Button>
      {confirmDialog}
    </>
  );
}
