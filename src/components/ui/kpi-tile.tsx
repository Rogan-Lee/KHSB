import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface KpiTileProps {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string | number | null;
  dir?: "up" | "down" | null;
  spark?: number[];
  accent?: string; // hex color for the dot next to the label
  ago?: string;    // e.g. "7일"
}

export function KpiTile({ label, value, unit, delta, dir, spark, accent, ago = "7일" }: KpiTileProps) {
  return (
    <div className="relative px-[18px] py-4 border-r border-line-2 last:border-r-0">
      <div className="flex items-center gap-1.5 text-[11.5px] text-ink-4 font-medium mb-1.5">
        {accent && <span className="w-1.5 h-1.5 rounded-full" style={{ background: accent }} />}
        {label}
      </div>
      <div className="flex items-baseline gap-1 text-[26px] font-[650] tracking-[-0.03em] leading-none tabular-nums text-ink">
        {value}
        {unit && <span className="text-xs font-medium text-ink-4 tracking-[-0.01em]">{unit}</span>}
      </div>
      {(delta != null || dir) && (
        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-ink-4 tabular-nums">
          {delta != null && (
            <span className={cn(
              "inline-flex items-center gap-0.5 font-semibold tabular-nums",
              dir === "up" ? "text-ok" : dir === "down" ? "text-bad" : "text-ink-3"
            )}>
              {dir === "up" && <TrendingUp className="h-2.5 w-2.5" />}
              {dir === "down" && <TrendingDown className="h-2.5 w-2.5" />}
              {typeof delta === "number" ? (delta > 0 ? `+${delta}` : delta) : delta}
            </span>
          )}
          <span className="text-ink-4">{ago}</span>
        </div>
      )}
      {spark && spark.length > 0 && (
        <svg className="absolute right-3.5 top-3.5 text-brand" width="52" height="18" viewBox="0 0 52 18">
          <polyline
            points={spark.map((y, i) => `${i * 8 + 2},${18 - y * 2}`).join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      )}
    </div>
  );
}

export function KpiStrip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      "grid border border-line rounded-[12px] overflow-hidden bg-panel shadow-[var(--shadow-xs)]",
      className
    )}>
      {children}
    </div>
  );
}
