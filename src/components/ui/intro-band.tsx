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
  ink: "text-ink",
  brand: "text-brand",
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
};

// Dashboard greeting band — solid panel, subtle border, no gradient.
export function IntroBand({ greeting, context, stats, className }: IntroBandProps) {
  return (
    <div className={cn(
      "relative flex items-center gap-5 px-[22px] py-[18px] mb-[18px]",
      "bg-panel-2 border border-line rounded-[12px] shadow-[var(--shadow-xs)] overflow-hidden",
      className
    )}>
      <div className="flex-1 min-w-0">
        <h3 className="text-[22px] font-[650] tracking-[-0.03em] text-ink m-0 leading-[1.1]">
          {greeting}
        </h3>
        {context && (
          <p className="text-[12.5px] text-ink-3 mt-1 m-0 leading-relaxed">
            {context}
          </p>
        )}
      </div>
      {stats && stats.length > 0 && (
        <div className="flex items-center gap-6 shrink-0">
          {stats.map((s, i) => (
            <div key={i} className="text-right">
              <div className={cn(
                "text-[20px] font-[650] tracking-[-0.03em] tabular-nums font-mono leading-none",
                toneColors[s.tone ?? "ink"]
              )}>
                {s.value}
              </div>
              <div className="text-[10.5px] text-ink-4 mt-1.5 font-medium">{s.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
