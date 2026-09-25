// 멘토링 화면 공통 표현 — 상태·우선순위 배지와 표 헤더 스타일.
// 훅이 없어 서버/클라이언트 컴포넌트 양쪽에서 import 가능.

import { StatusBadge, type Tone } from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";

/** 멘토링 상태 — 라벨은 서버 액션/토스트 문구와 동일하게 유지 */
export const MENTORING_STATUS = {
  SCHEDULED: { label: "예정", tone: "info" },
  COMPLETED: { label: "완료", tone: "ok" },
  CANCELLED: { label: "취소", tone: "gray" },
  RESCHEDULED: { label: "일정변경", tone: "warn" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export type MentoringStatusKey = keyof typeof MENTORING_STATUS;

export function MentoringStatusBadge({
  status,
  size,
  className,
}: {
  status: MentoringStatusKey;
  size?: "medium" | "large";
  className?: string;
}) {
  const s = MENTORING_STATUS[status];
  return (
    <StatusBadge tone={s.tone} size={size} className={className}>
      {s.label}
    </StatusBadge>
  );
}

/** 멘토링 우선순위 (마지막 멘토링 경과일 기준) */
export const PRIORITY = {
  1: { label: "1순위", short: "P1", tone: "bad", dot: "bg-bg-critical-solid" },
  2: { label: "2순위", short: "P2", tone: "warn", dot: "bg-bg-warning-solid" },
  3: { label: "일반", short: "P3", tone: "ok", dot: "bg-bg-positive-solid" },
} as const satisfies Record<1 | 2 | 3, { label: string; short: string; tone: Tone; dot: string }>;

export function PriorityDot({ priority, className }: { priority: 1 | 2 | 3; className?: string }) {
  return <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", PRIORITY[priority].dot, className)} />;
}

/** SortableHeader·맨 <th> 에 ui/table TableHead 와 같은 모양을 입힌다 */
export const TH_CLASS = "h-10 whitespace-nowrap px-x4 text-left align-middle t3-medium text-fg-neutral-subtle";
