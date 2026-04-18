import { cn } from "@/lib/utils";

type TagVariant = "ok" | "warn" | "bad" | "info" | "brand" | "neutral";

const variantStyles: Record<TagVariant, string> = {
  ok: "bg-ok-soft text-ok shadow-[inset_0_0_0_1px_rgba(39,193,155,0.2)]",
  warn: "bg-warn-soft text-warn shadow-[inset_0_0_0_1px_rgba(232,181,74,0.2)]",
  bad: "bg-bad-soft text-bad shadow-[inset_0_0_0_1px_rgba(240,85,90,0.2)]",
  info: "bg-info-soft text-info shadow-[inset_0_0_0_1px_rgba(138,108,255,0.2)]",
  brand: "bg-secondary text-primary shadow-[inset_0_0_0_1px_rgba(255,106,26,0.2)]",
  neutral: "bg-muted text-muted-foreground shadow-[inset_0_0_0_1px] shadow-border",
};

interface TagPillProps {
  variant?: TagVariant;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function TagPill({ variant = "neutral", dot = false, children, className }: TagPillProps) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full",
      variantStyles[variant],
      className
    )}>
      {dot && <span className="w-[5px] h-[5px] rounded-full bg-current" />}
      {children}
    </span>
  );
}
