import * as React from "react"
import { badge } from "@seed-design/css/recipes/badge"

import { cn } from "@/lib/utils"

// SEED Badge 레시피 — shadcn variant 이름을 SEED tone/variant 로 매핑한다.
// SEED 기본 max-width(말줄임)는 대시보드 문구 길이에 맞춰 해제.
type LegacyVariant = "default" | "secondary" | "destructive" | "outline"
type Tone = "neutral" | "brand" | "informative" | "positive" | "warning" | "critical"

const MAP: Record<LegacyVariant, { tone: Tone; variant: "weak" | "solid" | "outline" }> = {
  default: { tone: "brand", variant: "weak" },
  secondary: { tone: "neutral", variant: "weak" },
  destructive: { tone: "critical", variant: "weak" },
  outline: { tone: "neutral", variant: "outline" },
}

export function badgeVariants({
  variant = "default",
  tone,
  solid,
  size = "medium",
}: { variant?: LegacyVariant | null; tone?: Tone; solid?: boolean; size?: "medium" | "large" } = {}) {
  const m = MAP[variant ?? "default"]
  return cn(
    badge({ tone: tone ?? m.tone, variant: solid ? "solid" : m.variant, size }).root,
    "max-w-none gap-x1 whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0",
  )
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: LegacyVariant | null
  /** SEED 역할색 — 지정하면 variant 의 기본 tone 을 덮는다 */
  tone?: Tone
  solid?: boolean
  size?: "medium" | "large"
}

function Badge({ className, variant, tone, solid, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, tone, solid, size }), className)} {...props} />
}

export { Badge }
