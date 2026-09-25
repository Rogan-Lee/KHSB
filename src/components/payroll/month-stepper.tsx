"use client";

// 월 이동 — ‹ 2026년 9월 › . 급여 정산·내 근무시간 공통.
// 공용화 후보: 월 단위 화면(통계·리포트)에서도 같은 모양을 쓴다.

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function MonthStepper({
  year,
  month,
  onPrev,
  onNext,
  disabled = false,
  loading = false,
  className,
}: {
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
  disabled?: boolean;
  /** 옆에 작은 로딩 표시 */
  loading?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-x1", className)}>
      <Button type="button" variant="ghost" size="icon" onClick={onPrev} disabled={disabled} aria-label="이전 달">
        <ChevronLeft />
      </Button>
      <span className="min-w-28 text-center t6-bold tabular-nums text-fg-neutral" aria-live="polite">
        {year}년 {month}월
      </span>
      <Button type="button" variant="ghost" size="icon" onClick={onNext} disabled={disabled} aria-label="다음 달">
        <ChevronRight />
      </Button>
      <span className="grid size-x5 place-items-center" aria-hidden={!loading}>
        {loading && <Loader2 className="size-4 animate-spin text-fg-neutral-subtle" aria-label="불러오는 중" />}
      </span>
    </div>
  );
}
