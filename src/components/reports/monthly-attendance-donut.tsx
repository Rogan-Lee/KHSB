"use client";

import { cn } from "@/lib/utils";

interface Props {
  normal: number;
  tardy: number;
  absent: number;
  earlyLeave: number;
  outingCount: number;
}

// CSS conic-gradient donut (v4 — no recharts for simple donut)
export function MonthlyAttendanceDonut({ normal, tardy, absent, earlyLeave, outingCount }: Props) {
  const total = normal + tardy + absent + earlyLeave;

  if (total === 0) {
    return <p className="text-[12.5px] text-ink-4 text-center py-4">집계된 출결 데이터가 없습니다</p>;
  }

  const pctNormal = (normal / total) * 100;
  const pctTardy = (tardy / total) * 100;
  const pctAbsent = (absent / total) * 100;
  const pctEarly = (earlyLeave / total) * 100;

  // Build conic-gradient slices in order
  let acc = 0;
  const slices: string[] = [];
  const push = (pct: number, color: string) => {
    if (pct <= 0) return;
    const start = acc;
    const end = acc + pct;
    slices.push(`${color} ${start}% ${end}%`);
    acc = end;
  };
  push(pctNormal, "var(--ok)");
  push(pctTardy, "var(--warn)");
  push(pctAbsent, "var(--bad)");
  push(pctEarly, "var(--violet)");

  const gradient = `conic-gradient(${slices.join(", ")})`;
  const rate = Math.round((normal / total) * 100);

  return (
    <div className="flex items-center gap-5">
      <div
        className="relative w-[120px] h-[120px] rounded-full grid place-items-center shrink-0"
        style={{ background: gradient }}
      >
        <div className="w-[84px] h-[84px] rounded-full bg-panel grid place-items-center">
          <div className="text-center leading-none">
            <div className="text-[22px] font-[650] tracking-[-0.03em] text-ink tabular-nums font-mono">{rate}</div>
            <div className="text-[11px] text-ink-4 mt-1">출석률</div>
          </div>
        </div>
      </div>
      <div className="flex-1 flex flex-col gap-[6px]">
        <LegendRow color="var(--ok)"     label="정상 출석" value={`${normal}일`} />
        <LegendRow color="var(--warn)"   label="지각"     value={`${tardy}일`} />
        <LegendRow color="var(--violet)" label="조퇴"     value={`${earlyLeave}일`} />
        <LegendRow color="var(--bad)"    label="결석"     value={`${absent}일`} />
        {outingCount > 0 && (
          <LegendRow color="var(--ink-4)" label="외출" value={`${outingCount}회`} top />
        )}
      </div>
    </div>
  );
}

function LegendRow({ color, label, value, top }: { color: string; label: string; value: string; top?: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-2 text-[12px]",
      top && "pt-[6px] mt-[6px] border-t border-line-2"
    )}>
      <span className="h-[6px] w-[6px] rounded-full shrink-0" style={{ background: color }} />
      <span className="flex-1 text-ink-3">{label}</span>
      <span className="font-semibold text-ink font-mono tabular-nums tracking-[-0.01em]">{value}</span>
    </div>
  );
}
