import { cn } from "@/lib/utils";
import { badgeVariants } from "@/components/ui/badge";

type TagVariant = "ok" | "warn" | "bad" | "info" | "brand" | "violet" | "neutral";
type SeedTone = "neutral" | "brand" | "informative" | "positive" | "warning" | "critical";

// variant → SEED Badge tone (weak). violet 은 SEED 역할색이 없어 분류용 보라 팔레트로 덮는다.
const TONE: Record<TagVariant, SeedTone> = {
  ok: "positive",
  warn: "warning",
  bad: "critical",
  info: "informative",
  brand: "brand",
  violet: "neutral",
  neutral: "neutral",
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

// SEED Badge(weak) 모양의 상태 라벨 — sm = Badge medium(t1), md = Badge large(t2).
// ui/badge · backoffice StatusBadge 와 같은 모양이라 한 화면에 섞여도 어긋나지 않는다.
export function TagPill({
  variant = "neutral",
  size = "sm",
  dot = false,
  uppercase = false,
  children,
  className,
}: TagPillProps) {
  return (
    <span
      className={cn(
        badgeVariants({ tone: TONE[variant], size: size === "md" ? "large" : "medium" }),
        variant === "violet" && "bg-palette-purple-100 text-palette-purple-700",
        uppercase && "uppercase",
        className
      )}
    >
      {dot && <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
