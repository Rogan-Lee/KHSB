import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { actionButton, type ActionButtonVariantProps } from "@seed-design/css/recipes/action-button"

import { cn } from "@/lib/utils"

// SEED ActionButton 레시피 그대로 — 기존 shadcn variant/size 이름은 SEED 규격으로 매핑한다.
// SEED CSS 는 @layer seed-components 라 className(Tailwind)으로 레이아웃·크기를 덮을 수 있다.
type LegacyVariant =
  | "default"
  | "destructive"
  | "outline"
  | "secondary"
  | "ghost"
  | "link"
  | "brand"
  | "ink"
  | "soft"
type LegacySize = "default" | "sm" | "lg" | "icon" | "xs" | "compact"

const VARIANT: Record<Exclude<LegacyVariant, "link">, NonNullable<ActionButtonVariantProps["variant"]>> = {
  default: "brandSolid",
  brand: "brandSolid",
  destructive: "criticalSolid",
  outline: "neutralOutline",
  secondary: "neutralWeak",
  soft: "neutralWeak",
  ghost: "ghost",
  ink: "neutralSolid",
}

const SIZE: Record<LegacySize, NonNullable<ActionButtonVariantProps["size"]>> = {
  default: "medium",
  icon: "medium",
  sm: "small",
  compact: "small",
  xs: "xsmall",
  lg: "large",
}

// 아이콘 크기 — SEED 기준(xsmall 14 · small/medium 16 · large 22)
const ICON: Record<NonNullable<ActionButtonVariantProps["size"]>, string> = {
  xsmall: "[&_svg]:size-3.5",
  small: "[&_svg]:size-4",
  medium: "[&_svg]:size-4",
  large: "[&_svg]:size-[22px]",
}

export function buttonVariants({
  variant = "default",
  size = "default",
  className,
}: { variant?: LegacyVariant | null; size?: LegacySize | null; className?: string } = {}) {
  const v = variant ?? "default"
  const s = SIZE[size ?? "default"]
  if (v === "link") {
    return cn(
      "inline-flex items-center gap-x1 t4-medium text-fg-brand underline-offset-4 hover:underline disabled:pointer-events-none disabled:text-fg-disabled [&_svg]:size-4 [&_svg]:shrink-0",
      className,
    )
  }
  return cn(
    actionButton({ variant: VARIANT[v], size: s, layout: size === "icon" ? "iconOnly" : "withText" }),
    "shrink-0 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    ICON[s],
    className,
  )
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: LegacyVariant | null
  size?: LegacySize | null
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return <Comp className={buttonVariants({ variant, size, className })} ref={ref} {...props} />
  }
)
Button.displayName = "Button"

export { Button }
