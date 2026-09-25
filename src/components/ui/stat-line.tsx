import { cn } from "@/lib/utils";

interface StatLineProps {
  label: string;
  value: React.ReactNode;
  className?: string;
}

// 라벨·값 한 줄 — 옅은 구분선, 값은 tabular-nums
export function StatLine({ label, value, className }: StatLineProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-x3 border-b border-stroke-neutral-muted py-x2 t4-regular last:border-b-0",
        className
      )}
    >
      <span className="text-fg-neutral-muted">{label}</span>
      <span className="t4-bold tabular-nums text-fg-neutral">{value}</span>
    </div>
  );
}
