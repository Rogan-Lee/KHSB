"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cn } from "@/lib/utils"

// SEED Tabs(line) 규격 — 목록 아래 1px 선, 선택 탭은 fg-neutral + 2px 밑줄, 나머지 fg-neutral-subtle.
// variant="segment" 는 카드 안 등 좁은 곳에서 쓰는 SEED SegmentedControl 모양.
type TabsVariant = "line" | "segment"
const TabsVariantContext = React.createContext<TabsVariant>("line")

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: TabsVariant }
>(({ className, variant = "line", ...props }, ref) => (
  <TabsVariantContext.Provider value={variant}>
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        variant === "line"
          ? "flex w-full items-stretch gap-x1 overflow-x-auto shadow-[inset_0_-1px_0_var(--seed-color-stroke-neutral-muted)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          : "inline-flex items-center gap-x0_5 rounded-full bg-bg-neutral-weak p-x0_5",
        className
      )}
      {...props}
    />
  </TabsVariantContext.Provider>
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const variant = React.useContext(TabsVariantContext)
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-x1_5 whitespace-nowrap outline-none transition-colors disabled:pointer-events-none disabled:text-fg-disabled focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-stroke-focus-ring [&_svg]:size-4 [&_svg]:shrink-0",
        variant === "line"
          ? "relative min-h-11 px-x2_5 t5-bold text-fg-neutral-subtle hover:text-fg-neutral-muted data-[state=active]:text-fg-neutral after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent data-[state=active]:after:bg-fg-neutral"
          : "h-8 rounded-full px-x3 t4-bold text-fg-neutral-muted data-[state=active]:bg-bg-layer-default data-[state=active]:text-fg-neutral data-[state=active]:shadow-[0_1px_3px_rgba(0,0,0,0.08)]",
        className
      )}
      {...props}
    />
  )
})
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn("mt-x5 outline-none", className)} {...props} />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
