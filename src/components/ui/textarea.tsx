import * as React from "react"
import { cn } from "@/lib/utils"
import { inputBaseClass } from "./input"

// SEED TextField Textarea(outline · medium) 규격
const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn("flex min-h-[82px] border-0 py-x2_5 leading-[1.6]", inputBaseClass, className)}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
