import { cn } from "@/lib/utils";

interface IntroStat {
  label: string;
  value: React.ReactNode;
  tone?: "ink" | "brand" | "ok" | "warn" | "bad";
}

interface IntroBandProps {
  greeting: React.ReactNode;   // e.g. "좋은 아침이에요, 원장님"
  context?: React.ReactNode;   // e.g. "현재 재실 <b>72명</b> · 입실 마감까지 1시간 26분"
  stats?: IntroStat[];
  className?: string;
}

const toneColors: Record<NonNullable<IntroStat["tone"]>, string> = {
  ink: "text-fg-neutral",
  brand: "text-fg-brand",
  ok: "text-fg-positive",
  warn: "text-fg-warning",
  bad: "text-fg-critical",
};

// 대시보드 머리 띠 — 회색 채움 표면(StatCard 와 같은 bg-layer-fill), 그림자·그라데이션 없음.
export function IntroBand({ greeting, context, stats, className }: IntroBandProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-x5 rounded-r4 bg-bg-layer-fill px-x5 py-x5 md:flex-row md:items-center md:px-x6",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <h3 className="t8-bold text-fg-neutral">{greeting}</h3>
        {context && <p className="mt-x1 t4-regular text-fg-neutral-subtle">{context}</p>}
      </div>
      {stats && stats.length > 0 && (
        <dl className="flex shrink-0 items-center gap-x6">
          {stats.map((s, i) => (
            <div key={i} className="flex flex-col-reverse md:items-end">
              <dt className="mt-x1 t3-regular text-fg-neutral-subtle">{s.label}</dt>
              <dd className={cn("t8-bold tabular-nums", toneColors[s.tone ?? "ink"])}>{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
