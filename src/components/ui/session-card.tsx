import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

type SessionPriority = "p1" | "p2" | "p3";

// 우선순위 점 — 위험(p1)·주의(p2)·보통(p3)
const dotColor: Record<SessionPriority, string> = {
  p1: "bg-bg-critical-solid",
  p2: "bg-bg-warning-solid",
  p3: "bg-bg-positive-solid",
};

interface SessionCardProps {
  priority?: SessionPriority;
  done?: boolean;
  live?: boolean;
  title: string;
  time?: string;
  sub?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

// 멘토링 세션 카드 — 흰 표면 + 옅은 선 + r2. 우선순위는 제목 앞 작은 점, 완료는 체크 + 취소선.
export function SessionCard({
  priority = "p3",
  done = false,
  live = false,
  title,
  time,
  sub,
  className,
  onClick,
}: SessionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative w-full rounded-r2 border border-stroke-neutral-muted bg-bg-layer-default px-x2_5 py-x1_5 text-left",
        "outline-none transition-colors hover:bg-bg-layer-default-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring",
        done && "opacity-60",
        className
      )}
    >
      <span className="flex items-center gap-x1_5 t3-medium text-fg-neutral">
        {done ? (
          <Check className="size-3.5 shrink-0 text-fg-positive" aria-label="완료" />
        ) : (
          <span className={cn("size-1.5 shrink-0 rounded-full", dotColor[priority])} aria-hidden />
        )}
        <span className={cn("min-w-0 truncate", done && "line-through")}>{title}</span>
        {live && (
          <span className="ml-auto shrink-0 rounded-r1 bg-bg-brand-weak px-x1 t1-bold text-fg-brand">
            진행 중
          </span>
        )}
      </span>
      {(time || sub) && (
        <span className="mt-x0_5 flex items-center gap-x1_5 t2-regular tabular-nums text-fg-neutral-subtle">
          {time && <span className="shrink-0">{time}</span>}
          {sub && <span className="min-w-0 truncate">{sub}</span>}
        </span>
      )}
    </button>
  );
}
