"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

// SEED Checkmark(square · neutral) 규격 — 1.5px stroke-neutral-weak 테두리, 체크 시 bg-neutral-inverted
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer grid size-[18px] shrink-0 place-content-center rounded-r1 bg-bg-layer-default shadow-[inset_0_0_0_1.5px_var(--seed-color-stroke-neutral-weak)] transition-colors",
      "hover:shadow-[inset_0_0_0_1.5px_var(--seed-color-stroke-neutral-solid)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring",
      "disabled:cursor-not-allowed disabled:bg-bg-disabled disabled:shadow-none",
      "data-[state=checked]:bg-bg-neutral-inverted data-[state=checked]:text-fg-neutral-inverted data-[state=checked]:shadow-none",
      "data-[state=indeterminate]:bg-bg-neutral-inverted data-[state=indeterminate]:text-fg-neutral-inverted data-[state=indeterminate]:shadow-none",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="grid place-content-center text-current">
      {props.checked === "indeterminate" ? (
        <Minus className="size-3.5" strokeWidth={3} />
      ) : (
        <Check className="size-3.5" strokeWidth={3} />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
