import { cn } from "@/lib/utils";

type BarVariant = "brand" | "ink" | "ok" | "warn" | "bad";

const variantBg: Record<BarVariant, string> = {
  brand: "bg-brand",
  ink: "bg-ink",
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
};

interface BarProps {
  value: number; // 0-100
  variant?: BarVariant;
  className?: string;
}

export function Bar({ value, variant = "ink", className }: BarProps) {
  return (
    <div className={cn("h-1 rounded-[3px] bg-line-2 overflow-hidden relative", className)}>
      <span
        className={cn("block h-full rounded-[3px]", variantBg[variant])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
