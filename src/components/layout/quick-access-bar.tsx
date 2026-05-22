"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { QUICK_BAR_ITEMS } from "@/lib/nav-shortcuts";

/**
 * 상단 빠른이동 바 (데스크탑). 자주 쓰는 페이지를 칩으로 노출하고
 * 각 칩에 숫자키 단축키(1~9) 힌트를 표시. 클릭/숫자키 모두 동일하게 이동.
 */
export function QuickAccessBar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <div
      data-print-hide
      className="hidden md:flex items-center gap-1 overflow-x-auto border-b border-line-2 bg-panel-2/40 px-[22px] py-1.5"
    >
      <span className="mr-1 shrink-0 text-[10.5px] font-semibold text-ink-4">빠른 이동</span>
      {QUICK_BAR_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            title={`${item.label} (${item.digit})`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1 text-[12px] font-medium whitespace-nowrap transition-colors",
              active
                ? "bg-panel text-ink shadow-[inset_0_0_0_1px_var(--line)]"
                : "text-ink-3 hover:bg-[rgba(20,20,25,0.04)] hover:text-ink"
            )}
          >
            <Icon className={cn("h-3.5 w-3.5", active ? "text-ink" : "text-ink-4")} />
            {item.label}
            <kbd className="ml-0.5 rounded bg-canvas-2 px-1 font-mono text-[9.5px] text-ink-4">
              {item.digit}
            </kbd>
          </Link>
        );
      })}
    </div>
  );
}
