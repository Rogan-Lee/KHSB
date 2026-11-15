"use client";

import { usePathname } from "next/navigation";
import { NotificationBadge } from "@seed-design/react";
import { ChevronRight, Menu, Search } from "lucide-react";
import { LinkTabs } from "@/components/backoffice/ui";
import { useModKey } from "@/lib/nav-shortcuts";
import { cn } from "@/lib/utils";
import { locateNav, navTabs } from "./nav-config";

export function openCommandPalette() {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
}

/**
 * 상단 바 — 현재 위치(그룹 › 메뉴), 여러 화면을 묶은 메뉴의 탭 줄, 빠른 이동 검색.
 * 탭 줄은 바 안(같은 56px 줄)에 그린다. 바 높이를 기준으로 창 높이를 맞춘 화면(학생 메시지 등)이 있어서
 * 줄을 하나 더 쌓지 않는다. 페이지 제목·설명·주요 버튼은 각 페이지의 PageHeader 가 담당한다.
 */
export function AppHeader({
  role,
  badges,
  onMenuClick,
}: {
  role?: string;
  badges?: Record<string, number>;
  onMenuClick?: () => void;
}) {
  const pathname = usePathname();
  const loc = locateNav(pathname);
  const tabs = navTabs(loc, role);
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
        className="-ml-2 grid size-10 shrink-0 place-items-center rounded-r2 text-fg-neutral-muted transition-colors hover:bg-bg-transparent-pressed md:hidden"
      >
        <Menu className="size-5" />
      </button>

      <nav aria-label="현재 위치" className={cn("flex min-w-0 items-center gap-x1 t4-medium", tabs && "shrink-0")}>
        {loc.group && (
          <>
            <span className="hidden shrink-0 text-fg-neutral-subtle sm:inline">{loc.group.label}</span>
            <ChevronRight className="hidden size-4 shrink-0 text-fg-placeholder sm:block" aria-hidden />
          </>
        )}
        <span className={cn("truncate text-fg-neutral", tabs && "hidden lg:inline")}>
          {tabs ? loc.item?.label : (loc.label ?? "BackOffice")}
        </span>
      </nav>

      {tabs && loc.tab && (
        <LinkTabs
          className="mb-0 min-w-0 flex-1 self-stretch shadow-none lg:ml-x3"
          current={loc.tab.href}
          items={tabs.map((t) => {
            const count = badges?.[t.href] ?? 0;
            return {
              value: t.href,
              href: t.href,
              label: (
                <>
                  {t.label}
                  {count > 0 && (
                    <NotificationBadge size="large" aria-label={`미확인 ${count}건`}>
                      {count > 99 ? "99+" : count}
                    </NotificationBadge>
                  )}
                </>
              ),
            };
          })}
        />
      )}

      <div className="ml-auto flex shrink-0 items-center gap-x1">
        <button
          type="button"
          onClick={openCommandPalette}
          className={cn(
            "hidden h-9 items-center gap-x2 rounded-r2 bg-bg-neutral-weak px-x3 text-left transition-colors md:flex",
            "hover:bg-bg-neutral-weak-pressed",
            // 탭 줄이 있으면 검색 칸을 줄여 탭에 자리를 준다
            tabs ? "w-[200px]" : "w-[260px]",
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
