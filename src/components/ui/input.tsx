import * as React from "react"
import { cn } from "@/lib/utils"

// SEED TextInput(outline · medium) 규격 — 높이 40, r2, 1px stroke-neutral-weak, 포커스 2px stroke-neutral-contrast
export const inputBaseClass =
  "w-full rounded-r2 bg-bg-layer-default px-x3 t4-regular text-fg-neutral outline-none transition-shadow " +
  "shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] placeholder:text-fg-placeholder " +
  "focus-visible:shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-contrast)] " +
  "aria-[invalid=true]:shadow-[inset_0_0_0_2px_var(--seed-color-stroke-critical-solid)] " +
  "disabled:cursor-not-allowed disabled:bg-bg-disabled disabled:text-fg-disabled read-only:bg-bg-layer-fill"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 border-0 py-x2 file:mr-x2 file:border-0 file:bg-transparent file:t4-medium file:text-fg-neutral",
          inputBaseClass,
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
