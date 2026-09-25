import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface KpiTileProps {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string | number | null;
  dir?: "up" | "down" | null;
  spark?: number[];
  /** @deprecated 장식용 색 점 — SEED 규칙(색은 의미가 있을 때만)에 따라 더 이상 그리지 않는다 */
  accent?: string;
  ago?: string;    // e.g. "7일"
}

// 요약 지표 타일 — backoffice StatCard 와 같은 모양(회색 채움 · 라벨 위 · 큰 숫자 아래).
export function KpiTile({ label, value, unit, delta, dir, spark, ago = "7일" }: KpiTileProps) {
  return (
    <div className="relative min-w-0 rounded-r4 bg-bg-layer-fill px-x5 py-x4">
      <div className={cn("truncate t4-medium text-fg-neutral-subtle", spark && spark.length > 0 && "pr-x14")}>
        {label}
      </div>
      <div className="mt-x2 flex items-baseline gap-x1">
        <span className="t10-bold tabular-nums text-fg-neutral">{value}</span>
        {unit && <span className="t5-medium tabular-nums text-fg-neutral-subtle">{unit}</span>}
      </div>
      {(delta != null || dir) && (
        <div className="mt-x1 flex items-center gap-x1_5 t3-regular tabular-nums text-fg-neutral-subtle">
          {delta != null && (
            <span
              className={cn(
                "inline-flex items-center gap-x0_5 t3-bold",
                dir === "up" ? "text-fg-positive" : dir === "down" ? "text-fg-critical" : "text-fg-neutral-muted"
              )}
            >
              {dir === "up" && <TrendingUp className="size-3.5" aria-hidden />}
              {dir === "down" && <TrendingDown className="size-3.5" aria-hidden />}
              {typeof delta === "number" ? (delta > 0 ? `+${delta}` : delta) : delta}
            </span>
          )}
          <span>{ago}</span>
        </div>
      )}
      {spark && spark.length > 0 && (
        <svg
          className="absolute right-4 top-4 text-fg-brand"
          width="52"
          height="18"
          viewBox="0 0 52 18"
          aria-hidden
        >
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

/** 지표 타일 줄 — 기본 모바일 2열(열 수는 className 의 grid-cols-* 로 지정) */
export function KpiStrip({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-x3", className)}>{children}</div>;
}
