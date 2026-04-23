import { cn } from "@/lib/utils";

interface PageIntroProps {
  tag: string;
  title: string;
  description?: string;
  stats?: { label: string; value: string | number }[];
  accent?: string;
  className?: string;
}

// Solid panel + left accent bar (no gradient wash — rejected in v4).
export function PageIntro({ tag, title, description, stats, accent, className }: PageIntroProps) {
  return (
    <div className={cn(
      "relative flex items-center gap-4 rounded-[10px] border border-line bg-panel-2 p-4 mb-4",
      "shadow-[var(--shadow-xs)]",
      "before:content-[''] before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[3px] before:rounded-r before:bg-brand",
      className
    )}>
      <div className="flex-1 min-w-0 pl-2">
        <div className={cn(
          "font-mono text-[11px] font-semibold tracking-[0.08em] mb-1 uppercase",
          accent || "text-brand"
        )}>
          {tag}
        </div>
        <h2 className="text-[15px] font-[650] tracking-[-0.015em] text-ink m-0">{title}</h2>
        {description && (
          <p className="text-[12px] text-ink-3 mt-0.5 leading-relaxed m-0">{description}</p>
        )}
      </div>
      {stats && stats.length > 0 && (
        <div className="flex items-center gap-4 text-[11px] text-ink-4 shrink-0">
          {stats.map((s) => (
            <div key={s.label} className="text-right">
              <div className="text-[18px] font-[650] tracking-[-0.02em] text-ink tabular-nums leading-none">{s.value}</div>
              <div className="text-[10.5px] text-ink-4 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
