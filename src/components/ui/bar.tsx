import { cn } from "@/lib/utils";

type BarVariant = "brand" | "ok" | "warn" | "bad";

const variantBg: Record<BarVariant, string> = {
  brand: "bg-primary",
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
};

interface BarProps {
  value: number; // 0-100
  variant?: BarVariant;
  className?: string;
}

export function Bar({ value, variant = "brand", className }: BarProps) {
  return (
    <div className={cn("h-1 rounded-sm bg-muted overflow-hidden relative", className)}>
      <span
        className={cn("block h-full rounded-sm", variantBg[variant])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
