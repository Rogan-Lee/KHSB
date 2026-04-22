import { cn } from "@/lib/utils";

type TagVariant = "ok" | "warn" | "bad" | "info" | "brand" | "violet" | "neutral";

const variantStyles: Record<TagVariant, string> = {
  ok: "bg-ok-soft text-ok-ink",
  warn: "bg-warn-soft text-warn-ink",
  bad: "bg-bad-soft text-bad-ink",
  info: "bg-info-soft text-info-ink",
  brand: "bg-brand-soft text-brand-2",
  violet: "bg-violet-soft text-violet-ink",
  neutral: "bg-canvas-2 text-ink-2",
};

type TagSize = "sm" | "md";

interface TagPillProps {
  variant?: TagVariant;
  size?: TagSize;
  dot?: boolean;
  uppercase?: boolean;
  children: React.ReactNode;
  className?: string;
}

// v4 soft pastel pill. Default is rounded, lowercase, non-mono.
// Set uppercase + mono via explicit prop for label-style usage.
export function TagPill({
  variant = "neutral",
  size = "sm",
  dot = false,
  uppercase = false,
  children,
  className,
}: TagPillProps) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full font-medium leading-[1.4] tracking-[-0.005em]",
      size === "sm" ? "gap-1 px-[9px] py-[2px] text-[11px]" : "gap-1.5 px-[11px] py-[3px] text-[12px]",
      uppercase && "font-mono uppercase tracking-[0.06em]",
      variantStyles[variant],
      className
    )}>
      {dot && <span className="w-[5px] h-[5px] rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
}
