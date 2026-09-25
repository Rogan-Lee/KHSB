"use client";

import { usePathname } from "next/navigation";
import { ChevronRight, Menu, Search } from "lucide-react";
import { useModKey } from "@/lib/nav-shortcuts";
import { cn } from "@/lib/utils";
import { locateNav } from "./nav-config";

export function openCommandPalette() {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
}

/**
 * 상단 바 — 현재 위치(그룹 › 메뉴)와 빠른 이동 검색.
 * 페이지 제목·설명·주요 버튼은 각 페이지의 PageHeader 가 담당한다.
 */
export function AppHeader({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
  const { group, item } = locateNav(pathname);
  const mod = useModKey();

  return (
    <header
      data-print-hide
      className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-x2 border-b border-stroke-neutral-muted bg-bg-layer-default/90 px-x4 backdrop-blur-md md:px-x8"
    >
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="메뉴 열기"
        className="-ml-2 grid size-10 place-items-center rounded-r2 text-fg-neutral-muted transition-colors hover:bg-bg-transparent-pressed md:hidden"
      >
        <Menu className="size-5" />
      </button>

      <nav aria-label="현재 위치" className="flex min-w-0 items-center gap-x1 t4-medium">
        {group && (
          <>
            <span className="hidden shrink-0 text-fg-neutral-subtle sm:inline">{group.label}</span>
            <ChevronRight className="hidden size-4 shrink-0 text-fg-placeholder sm:block" aria-hidden />
          </>
        )}
        <span className="truncate text-fg-neutral">{item?.label ?? "BackOffice"}</span>
      </nav>

      <div className="ml-auto flex items-center gap-x1">
        <button
          type="button"
          onClick={openCommandPalette}
          className={cn(
            "hidden h-9 w-[260px] items-center gap-x2 rounded-r2 bg-bg-neutral-weak px-x3 text-left transition-colors md:flex",
            "hover:bg-bg-neutral-weak-pressed",
          )}
        >
          <Search className="size-4 shrink-0 text-fg-neutral-subtle" aria-hidden />
          <span className="flex-1 truncate t4-regular text-fg-placeholder">메뉴 검색</span>
          <kbd className="rounded-r1 bg-bg-layer-default px-x1_5 t2-medium text-fg-neutral-subtle">{mod} K</kbd>
        </button>
        <button
          type="button"
          onClick={openCommandPalette}
          aria-label="메뉴 검색"
          className="grid size-10 place-items-center rounded-r2 text-fg-neutral-muted transition-colors hover:bg-bg-transparent-pressed md:hidden"
        >
          <Search className="size-5" />
        </button>
      </div>
    </header>
  );
}
