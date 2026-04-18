import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface KpiTileProps {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string | number | null;
  dir?: "up" | "down" | null;
  spark?: number[];
  accent?: string; // tailwind color class like "text-primary" or hex
}

export function KpiTile({ label, value, unit, delta, dir, spark, accent }: KpiTileProps) {
  return (
    <div className="relative px-4 py-3.5 border-r border-border last:border-r-0">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-medium tracking-tight mb-2.5">
        {accent && <span className="w-1.5 h-1.5 rounded-full" style={{ background: accent }} />}
        {label}
      </div>
      <div className="text-[26px] font-[650] tracking-tight leading-none tabular-nums text-foreground">
        {value}
        {unit && <span className="text-xs font-medium text-muted-foreground ml-1">{unit}</span>}
      </div>
      {(delta != null || dir) && (
        <div className="flex items-center gap-1.5 mt-2 text-[11px] text-muted-foreground tabular-nums">
          {delta != null && (
            <span className={cn(
              "inline-flex items-center gap-0.5 px-1.5 py-px rounded font-mono text-[10px] font-semibold",
              dir === "up" ? "bg-ok-soft text-ok" : dir === "down" ? "bg-bad-soft text-bad" : "bg-muted text-muted-foreground"
            )}>
              {dir === "up" && <TrendingUp className="h-2.5 w-2.5" />}
              {dir === "down" && <TrendingDown className="h-2.5 w-2.5" />}
              {typeof delta === "number" ? (delta > 0 ? `+${delta}` : delta) : delta}
            </span>
          )}
          <span>7일 추이</span>
        </div>
      )}
      {spark && spark.length > 0 && (
        <svg className="absolute right-3.5 top-3.5 opacity-40" width="52" height="18" viewBox="0 0 52 18">
          <polyline
            points={spark.map((y, i) => `${i * 8 + 2},${18 - y * 2}`).join(" ")}
            fill="none"
            stroke="currentColor"
            className="text-primary"
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
      "grid border border-border rounded-[10px] overflow-hidden bg-card",
      className
    )}>
      {children}
    </div>
  );
}
