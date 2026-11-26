import * as React from "react"
import { cn } from "@/lib/utils"

// SEED TextInput(outline · medium) 규격 — 높이 40, r2, 1px stroke-neutral-weak, 포커스 2px stroke-neutral-contrast
export const inputBaseClass =
  "w-full rounded-r2 bg-bg-layer-default px-x3 t4-regular text-fg-neutral outline-none transition-shadow " +
  "shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] placeholder:text-fg-placeholder " +
  "focus-visible:shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-contrast)] " +
  "aria-[invalid=true]:shadow-[inset_0_0_0_2px_var(--seed-color-stroke-critical-solid)] " +
  "disabled:cursor-not-allowed disabled:bg-bg-disabled disabled:text-fg-disabled read-only:bg-bg-layer-fill"

// 크롬 데스크톱은 날짜·월 칸의 작은 달력 아이콘을 눌러야만 선택창이 열린다 — 칸 어디를 눌러도 열리게.
// ponytail: 날짜는 DatePicker 가 기본이고, 이건 월 칸·SEED TextFieldInput(포털) 처럼 네이티브가 남은 곳용
export function openNativePicker(e: React.MouseEvent<HTMLInputElement>) {
  try {
    e.currentTarget.showPicker?.()
  } catch {
    // 선택창을 지원하지 않는 브라우저(사파리 month 등)는 그냥 둔다
  }
}

const PICKER_TYPES = new Set(["date", "month", "week", "time", "datetime-local"])

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onClick, ...props }, ref) => {
    return (
      <input
        type={type}
        onClick={type && PICKER_TYPES.has(type) ? (e) => { onClick?.(e); openNativePicker(e) } : onClick}
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
