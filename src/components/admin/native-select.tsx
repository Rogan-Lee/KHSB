// 네이티브 <select> — SEED TextInput(outline · medium) 규격 모양.
// FormData(name) 로 값을 넘기는 폼에서 그대로 쓸 수 있도록 네이티브 요소를 유지한다.
// 공용화 후보: ui/select(Radix) 대신 폼 제출형 화면에서 쓰기 좋다.

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string }
>(({ className, wrapperClassName, children, ...props }, ref) => (
  <div className={cn("relative min-w-0", wrapperClassName)}>
    <select
      ref={ref}
      className={cn(
        "h-10 w-full cursor-pointer appearance-none rounded-r2 border-0 bg-bg-layer-default pl-x3 pr-x9 t4-regular text-fg-neutral outline-none transition-shadow",
        "shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] focus-visible:shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-contrast)]",
        "disabled:cursor-not-allowed disabled:bg-bg-disabled disabled:text-fg-disabled",
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      aria-hidden
      className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg-neutral-subtle"
    />
  </div>
));
NativeSelect.displayName = "NativeSelect";
