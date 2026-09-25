"use client";

import { LinkTabs } from "@/components/backoffice/ui";

/** 학부모 보고서 화면 상위 탭 — 주간 · 월간 · 예약 대기열 */
export function ReportsTypeNav({
  current,
  className,
}: {
  current: "WEEKLY" | "MONTHLY" | "QUEUE";
  className?: string;
}) {
  return (
    <LinkTabs
      current={current}
      className={className}
      items={[
        { value: "WEEKLY", href: "/online/reports", label: "주간 보고서" },
        { value: "MONTHLY", href: "/online/reports/monthly", label: "월간 보고서" },
        { value: "QUEUE", href: "/online/reports/queue", label: "예약 대기열" },
      ]}
    />
  );
}
