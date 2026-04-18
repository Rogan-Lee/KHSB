import { cn } from "@/lib/utils";

interface PageIntroProps {
  tag: string;        // e.g. "DASHBOARD · 02"
  title: string;
  description?: string;
  stats?: { label: string; value: string | number }[];
  accent?: string;    // e.g. "text-primary" or hex color
  className?: string;
}

export function PageIntro({ tag, title, description, stats, accent, className }: PageIntroProps) {
  return (
    <div className={cn(
      "flex items-center gap-4 rounded-xl border border-border p-4 mb-4",
      "bg-gradient-to-r from-primary/[0.06] via-info/[0.03] to-transparent",
      className
    )}>
      <div className="flex-1 min-w-0">
        <div className={cn("font-mono text-[11px] font-semibold tracking-[0.06em] mb-1", accent || "text-primary")}>
          {tag}
        </div>
        <h2 className="text-base font-[650] tracking-tight text-foreground m-0">{title}</h2>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed m-0">{description}</p>
        )}
      </div>
      {stats && stats.length > 0 && (
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground shrink-0">
          {stats.map((s) => (
            <div key={s.label}>
              <span className="font-semibold text-foreground tabular-nums">{s.value}</span>
              <span className="ml-1">{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
