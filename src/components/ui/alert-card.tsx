import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

type AlertTone = "bad" | "warn" | "info" | "ok";

const toneStyles: Record<AlertTone, string> = {
  bad: "bg-bad-soft text-bad",
  warn: "bg-warn-soft text-warn",
  info: "bg-info-soft text-info",
  ok: "bg-ok-soft text-ok",
};

interface AlertCardProps {
  tone: AlertTone;
  icon: React.ReactNode;
  title: string;
  sub?: string;
  cta?: string;
  onClick?: () => void;
  href?: string;
  className?: string;
}

const SHELL = cn(
  "flex items-center gap-3 w-full text-left px-[14px] py-3",
  "bg-panel border border-line rounded-[10px] shadow-[var(--shadow-xs)]",
  "hover:border-line-strong transition-colors"
);

function Body({ tone, icon, title, sub, cta }: Pick<AlertCardProps, "tone" | "icon" | "title" | "sub" | "cta">) {
  return (
    <>
      <span className={cn("grid place-items-center w-[30px] h-[30px] rounded-[8px] shrink-0", toneStyles[tone])}>
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[12.5px] font-semibold tracking-[-0.01em] text-ink truncate">{title}</span>
        {sub && <span className="block text-[11.5px] text-ink-4 mt-0.5 truncate">{sub}</span>}
      </span>
      {cta && (
        <span className="inline-flex items-center gap-0.5 text-[11.5px] font-medium text-ink-3 shrink-0">
          {cta}
          <ChevronRight className="h-3 w-3" />
        </span>
      )}
    </>
  );
}

export function AlertCard({ tone, icon, title, sub, cta, onClick, href, className }: AlertCardProps) {
  if (href) {
    return (
      <a href={href} className={cn(SHELL, className)}>
        <Body tone={tone} icon={icon} title={title} sub={sub} cta={cta} />
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cn(SHELL, className)}>
      <Body tone={tone} icon={icon} title={title} sub={sub} cta={cta} />
    </button>
  );
}

export function AlertStrip({ children, cols = 3, className }: { children: React.ReactNode; cols?: number; className?: string }) {
  return (
    <div
      className={cn("grid gap-3 mb-4", className)}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}
