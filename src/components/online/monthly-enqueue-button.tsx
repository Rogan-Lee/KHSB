"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { batchEnqueueReports } from "@/actions/online/parent-reports";

/** 전체 온라인 학생의 월간 보고서를 예약 큐에 등록 (야간 루틴이 생성). */
export function MonthlyEnqueueButton({ yearMonth }: { yearMonth: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const onClick = () => {
    if (
      !confirm(
        `전체 온라인 학생의 ${yearMonth} 월간 보고서를 예약 큐에 등록합니다.\n야간 Claude 루틴이 순차 생성합니다. 계속할까요?`
      )
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
    <Button
      size="sm"
      variant="outline"
      className="text-violet-700 border-violet-300 hover:bg-violet-50"
      onClick={onClick}
      disabled={isPending}
    >
      {isPending ? (
        <>
          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          등록 중…
        </>
      ) : (
        <>
          <CalendarClock className="h-3.5 w-3.5 mr-1" />
          전체 월간 예약 등록
        </>
      )}
    </Button>
  );
}
