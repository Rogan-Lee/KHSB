import { cn } from "@/lib/utils";

type BarVariant = "brand" | "ink" | "ok" | "warn" | "bad";

const variantBg: Record<BarVariant, string> = {
  brand: "bg-bg-brand-solid",
  ink: "bg-bg-neutral-solid",
  ok: "bg-bg-positive-solid",
  warn: "bg-bg-warning-solid",
  bad: "bg-bg-critical-solid",
};

interface BarProps {
  value: number; // 0-100
  variant?: BarVariant;
  className?: string;
}

// 가는 진행 막대 — SEED ProgressBar 와 같은 트랙(bg-neutral-weak) + 역할색 채움
export function Bar({ value, variant = "ink", className }: BarProps) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("relative h-x1 overflow-hidden rounded-full bg-bg-neutral-weak", className)}
    >
      <span
        className={cn("block h-full rounded-full transition-[width]", variantBg[variant])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
