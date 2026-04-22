import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

type SessionPriority = "p1" | "p2" | "p3";

const stripeColor: Record<SessionPriority, string> = {
  p1: "bg-bad",
  p2: "bg-warn",
  p3: "bg-ok",
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

// Mentoring session card. 2px left priority stripe, done → strike-through + check.
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
        "relative w-full text-left pl-[10px] pr-2 py-[6px] rounded-[7px]",
        "bg-panel border border-line",
        "hover:border-line-strong transition-colors",
        done && "opacity-55",
        className
      )}
    >
      <span
        className={cn(
          "absolute left-[2px] top-1 bottom-1 w-[2px] rounded-[2px]",
          stripeColor[priority]
        )}
      />
      <span className="flex items-center gap-1 text-[11.5px] font-semibold text-ink tracking-[-0.01em]">
        {done && <Check className="h-3 w-3 text-ok shrink-0" />}
        <span className={cn("truncate", done && "line-through")}>{title}</span>
        {live && (
          <span className="ml-auto font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-brand bg-brand-softer px-1 py-0.5 rounded-[3px]">
            LIVE
          </span>
        )}
      </span>
      {(time || sub) && (
        <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-ink-4 font-mono tabular-nums">
          {time && <span>{time}</span>}
          {sub && <span className="font-sans truncate">{sub}</span>}
        </span>
      )}
    </button>
  );
}
