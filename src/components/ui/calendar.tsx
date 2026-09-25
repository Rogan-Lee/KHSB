"use client"

import * as React from "react"
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"
import { DayButton, DayPicker, getDefaultClassNames } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"

// SEED DatePicker 규격(데스크톱 밀도) — 날짜는 원형 셀, 오늘은 bg-neutral-weak,
// 선택은 bg-neutral-inverted + fg-neutral-inverted, 호버는 bg-transparent-pressed.
// 셀 크기는 --cell-size(기본 40px)로 조절한다.
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "group/calendar [--cell-size:2.5rem]",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "relative flex flex-col gap-x4 md:flex-row",
          defaultClassNames.months
        ),
        month: cn("flex w-full flex-col gap-x2", defaultClassNames.month),
        nav: cn(
          // 네비 줄은 캡션(월·연 드롭다운) 위에 겹치므로 줄 자체는 클릭을 통과시키고 버튼만 받는다
          "pointer-events-none absolute inset-x-0 top-0 z-10 flex w-full items-center justify-between gap-x1",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant, size: "icon" }),
          "pointer-events-auto size-(--cell-size) min-w-(--cell-size) select-none p-0 text-fg-neutral-muted aria-disabled:pointer-events-none aria-disabled:text-fg-disabled",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant, size: "icon" }),
          "pointer-events-auto size-(--cell-size) min-w-(--cell-size) select-none p-0 text-fg-neutral-muted aria-disabled:pointer-events-none aria-disabled:text-fg-disabled",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          "flex h-(--cell-size) w-full items-center justify-center gap-x1 t4-bold text-fg-neutral",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "relative rounded-r2 transition-[background-color,box-shadow] hover:bg-bg-transparent-pressed has-focus-visible:shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-contrast)]",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          "absolute inset-0 cursor-pointer bg-bg-layer-floating opacity-0",
          defaultClassNames.dropdown
        ),
        caption_label: cn(
          "select-none text-fg-neutral",
          captionLayout === "label"
            ? "t5-bold"
            : "flex h-8 items-center gap-x0_5 rounded-r2 pl-x2 pr-x1 t4-bold tabular-nums [&>svg]:size-4 [&>svg]:text-fg-neutral-subtle",
          defaultClassNames.caption_label
        ),
        month_grid: "w-full border-collapse",
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "flex h-8 flex-1 select-none items-center justify-center t3-medium text-fg-neutral-subtle",
          defaultClassNames.weekday
        ),
        week: cn("mt-x0_5 flex w-full", defaultClassNames.week),
        week_number_header: cn(
          "w-(--cell-size) select-none",
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          "select-none t3-regular text-fg-neutral-subtle",
          defaultClassNames.week_number
        ),
        day: cn(
          "group/day relative aspect-square h-full w-full select-none p-0 text-center",
          defaultClassNames.day
        ),
        // 범위 선택 — 시작·끝 사이를 옅은 띠(bg-neutral-weak)로 잇는다
        range_start: cn(
          "rounded-l-full bg-bg-neutral-weak",
          defaultClassNames.range_start
        ),
        range_middle: cn("rounded-none bg-bg-neutral-weak", defaultClassNames.range_middle),
        range_end: cn("rounded-r-full bg-bg-neutral-weak", defaultClassNames.range_end),
        // 오늘·바깥 날짜·비활성 표시는 CalendarDayButton 에서 modifiers 로 그린다
        today: cn(defaultClassNames.today),
        outside: cn(defaultClassNames.outside),
        disabled: cn(defaultClassNames.disabled),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          )
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeftIcon className={cn("size-5", className)} {...props} />
            )
          }

          if (orientation === "right") {
            return (
              <ChevronRightIcon
                className={cn("size-5", className)}
                {...props}
              />
            )
          }

          return (
            <ChevronDownIcon className={cn("size-4", className)} {...props} />
          )
        },
        DayButton: CalendarDayButton,
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-(--cell-size) items-center justify-center text-center">
                {children}
              </div>
            </td>
          )
        },
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames()

  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  const selectedSingle =
    modifiers.selected &&
    !modifiers.range_start &&
    !modifiers.range_end &&
    !modifiers.range_middle
  const rangeEdge = modifiers.range_start || modifiers.range_end

  return (
    <button
      ref={ref}
      type="button"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={selectedSingle}
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "relative flex aspect-square size-full min-w-(--cell-size) flex-col items-center justify-center gap-x0_5 rounded-full t4-regular tabular-nums text-fg-neutral outline-none transition-colors",
        "hover:bg-bg-transparent-pressed focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-stroke-focus-ring",
        "disabled:pointer-events-none [&>span]:t2-regular [&>span]:text-fg-neutral-subtle",
        modifiers.outside && "text-fg-placeholder",
        modifiers.today && !modifiers.selected && "bg-bg-neutral-weak t4-bold",
        modifiers.disabled && "text-fg-disabled line-through",
        (selectedSingle || rangeEdge) &&
          "bg-bg-neutral-inverted t4-bold text-fg-neutral-inverted hover:bg-bg-neutral-inverted [&>span]:text-fg-neutral-inverted",
        modifiers.range_middle && "rounded-none bg-transparent text-fg-neutral",
        defaultClassNames.day,
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
