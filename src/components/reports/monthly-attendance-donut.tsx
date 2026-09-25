"use client";

import { cn } from "@/lib/utils";

interface Props {
  normal: number;
  tardy: number;
  absent: number;
  earlyLeave: number;
  outingCount: number;
}

// 상태색 — SEED 시맨틱(성공·주의·위험) + 분류용 보라
const COLOR = {
  normal: "var(--seed-color-bg-positive-solid)",
  tardy: "var(--seed-color-bg-warning-solid)",
  absent: "var(--seed-color-bg-critical-solid)",
  early: "var(--seed-color-palette-purple-500)",
  outing: "var(--seed-color-fg-placeholder)",
};

// 링 두께만 남기고 가운데를 뚫는 마스크 — 어떤 배경 위에서도 자연스럽게 보인다
const RING_MASK = "radial-gradient(farthest-side, transparent calc(100% - 16px), black calc(100% - 15px))";

// CSS conic-gradient donut (recharts 없이 간단한 도넛)
export function MonthlyAttendanceDonut({ normal, tardy, absent, earlyLeave, outingCount }: Props) {
  const total = normal + tardy + absent + earlyLeave;

  if (total === 0) {
    return <p className="py-x4 text-center t3-regular text-fg-neutral-subtle">집계된 출결 데이터가 없어요</p>;
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
  push(pctNormal, COLOR.normal);
  push(pctTardy, COLOR.tardy);
  push(pctAbsent, COLOR.absent);
  push(pctEarly, COLOR.early);

  const gradient = `conic-gradient(${slices.join(", ")})`;
  const rate = Math.round((normal / total) * 100);

  return (
    <div className="flex items-center gap-x5">
      <div className="relative grid size-[120px] shrink-0 place-items-center">
        <div
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{ background: gradient, mask: RING_MASK, WebkitMask: RING_MASK }}
        />
        <div className="relative text-center">
          <div className="t8-bold tabular-nums text-fg-neutral">
            {rate}
            <span className="t4-bold text-fg-neutral-subtle">%</span>
          </div>
          <div className="t2-regular text-fg-neutral-subtle">출석률</div>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-x1_5">
        <LegendRow color={COLOR.normal} label="정상 출석" value={`${normal}일`} />
        <LegendRow color={COLOR.tardy} label="지각" value={`${tardy}일`} />
        <LegendRow color={COLOR.early} label="조퇴" value={`${earlyLeave}일`} />
        <LegendRow color={COLOR.absent} label="결석" value={`${absent}일`} />
        {outingCount > 0 && <LegendRow color={COLOR.outing} label="외출" value={`${outingCount}회`} top />}
      </div>
    </div>
  );
}

function LegendRow({ color, label, value, top }: { color: string; label: string; value: string; top?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-x2 t3-regular",
        top && "mt-x1_5 border-t border-stroke-neutral-muted pt-x1_5"
      )}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      <span className="flex-1 text-fg-neutral-muted">{label}</span>
      <span className="t3-bold tabular-nums text-fg-neutral">{value}</span>
    </div>
  );
}
