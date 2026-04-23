import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserPlus, UserMinus, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { EnrollmentDelta } from "@/actions/dashboard-widgets";
import { cn } from "@/lib/utils";

export function EnrollmentDeltaWidget({
  data,
  year,
  month,
}: {
  data: EnrollmentDelta;
  year: number;
  month: number;
}) {
  return (
    <Card className="rounded-[12px] border-line shadow-[var(--shadow-xs)] overflow-hidden">
      <CardHeader className="flex flex-row items-center gap-2 py-[14px] px-[18px] border-b border-line-2">
        <Users className="h-4 w-4 text-ink-4" />
        <CardTitle className="text-[13.5px] font-[650] tracking-[-0.015em] text-ink m-0">
          원생 증감
        </CardTitle>
        <span className="ml-auto text-[11.5px] text-ink-4 font-mono tabular-nums">
          {year}.{String(month).padStart(2, "0")}
        </span>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid grid-cols-3 divide-x divide-line-2">
          <Cell
            icon={<Users className="h-3.5 w-3.5" />}
            label="현재 재원"
            value={data.total}
            delta={data.deltaVsLastMonth.total}
            deltaLabel="이번 달 순증"
            tone="ink"
          />
          <Cell
            icon={<UserPlus className="h-3.5 w-3.5" />}
            label="신규 등록"
            value={data.newThisMonth}
            delta={data.deltaVsLastMonth.new}
            deltaLabel="전월비"
            tone="ok"
          />
          <Cell
            icon={<UserMinus className="h-3.5 w-3.5" />}
            label="이탈"
            value={data.leftThisMonth}
            delta={data.deltaVsLastMonth.left}
            deltaLabel="전월비"
            tone="bad"
            deltaInverse
          />
        </div>
        <p className="px-[18px] py-2 text-[10.5px] text-ink-4 border-t border-line-2 bg-panel-2">
          현재 재원은 실제 재원(ACTIVE) 기준. 신규·이탈은 해당 월 등록·종료일 기준.
        </p>
      </CardContent>
    </Card>
  );
}

function Cell({
  icon,
  label,
  value,
  delta,
  deltaLabel,
  tone,
  deltaInverse,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  delta: number;
  deltaLabel: string;
  tone: "ink" | "ok" | "bad";
  deltaInverse?: boolean;
}) {
  const toneCls = tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : "text-ink";

  // delta 색상: 기본은 delta 양수=ok 음수=bad. inverse 가 true면 반대 (이탈은 +가 나쁨)
  const effectiveDelta = deltaInverse ? -delta : delta;
  const deltaCls =
    effectiveDelta > 0 ? "text-ok" : effectiveDelta < 0 ? "text-bad" : "text-ink-4";
  const DeltaIcon =
    effectiveDelta > 0 ? TrendingUp : effectiveDelta < 0 ? TrendingDown : Minus;

  return (
    <div className="p-[18px]">
      <div className="flex items-center gap-1.5 text-[11px] text-ink-4">
        <span className={toneCls}>{icon}</span>
        <span>{label}</span>
      </div>
      <p className="text-2xl font-[650] tracking-[-0.03em] tabular-nums font-mono mt-1">
        <span className={toneCls}>{value}</span>
        <span className="text-[12px] text-ink-4 font-normal ml-1">명</span>
      </p>
      <div className={cn("flex items-center gap-0.5 text-[10.5px] mt-1 tabular-nums", deltaCls)}>
        <DeltaIcon className="h-3 w-3" />
        <span>
          {delta > 0 ? "+" : ""}
          {delta} {deltaLabel}
        </span>
      </div>
    </div>
  );
}
