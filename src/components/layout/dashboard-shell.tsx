"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { NotificationBadge, SideNavigation as SeedSideNavigation } from "@seed-design/react";
import { useSideNavigationContext } from "@seed-design/react/primitive";
import { LogOut, Monitor, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { SideNavigationProvider } from "seed-design/ui/side-navigation";
import { MenuContent, MenuGroup, MenuItem, MenuRoot, MenuTrigger } from "seed-design/ui/menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { CommandPalette } from "@/components/ui/command-palette";
import { authClient } from "@/lib/auth-client";
import { getCurrentPlan } from "@/lib/features";
import { cn } from "@/lib/utils";
import type { Role } from "@/generated/prisma";
import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";
import { ACCOUNT_GROUP, locateNav, navTabs } from "./nav-config";
import { PageTabs } from "./page-tabs";
import { useStoredValue } from "./use-stored-value";

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "시스템 관리자",
  ADMIN: "(구) 어드민",
  DIRECTOR: "원장",
  HEAD_MENTOR: "총괄 멘토",
  MENTOR: "멘토",
  STAFF: "운영조교",
  STUDENT: "원생",
  CONSULTANT: "컨설턴트",
  MANAGER_MENTOR: "관리 멘토",
};

interface DashboardShellProps {
  user: { name: string; email: string; role: Role };
  children: React.ReactNode;
  /** 사이드바 NavItem href 별 미확인 카운트 (예: { "/online/reports": 3 }) */
  sidebarBadges?: Record<string, number>;
}

const SIDEBAR_COLLAPSED_KEY = "sidebarCollapsed";
const VIEW_MODE_KEY = "adminViewMode";
const BADGE_MIN_INTERVAL_MS = 30_000;
// 배지가 늘면 토스트로도 알릴 메뉴 — 숫자만으론 웹에서 새 글을 놓친다는 요청(2026-11-13)
const NEW_ITEM_TOASTS = [
  ["/questions", "학생 질문"],
  ["/suggestions", "학생 건의사항"],
] as const;
type ViewMode = "web" | "mobile";

export function DashboardShell({ user, children, sidebarBadges }: DashboardShellProps) {
  const plan = getCurrentPlan();
  const pathname = usePathname();
  // 여러 화면을 묶은 메뉴의 목록 화면이면 본문 맨 위에 메뉴 제목 + 탭 (상세 화면엔 안 띄운다)
  const loc = locateNav(pathname);
  const tabs = navTabs(loc, user.role);
  const pageTabs =
    tabs && loc.item && loc.tab?.href === pathname
      ? { title: loc.item.label, tabs, current: loc.tab.href }
      : null;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsedRaw, setCollapsedRaw] = useStoredValue(SIDEBAR_COLLAPSED_KEY, "false");
  const [viewModeRaw, setViewModeRaw] = useStoredValue(VIEW_MODE_KEY, "web");
  const collapsed = collapsedRaw === "true";
  const viewMode: ViewMode = viewModeRaw === "mobile" ? "mobile" : "web";
  const [badges, setBadges] = useState(sidebarBadges);
  const router = useRouter();
  const prevBadges = useRef(badges);
  useEffect(() => {
    const prev = prevBadges.current;
    prevBadges.current = badges;
    // ponytail: 미확인 수의 차이라 같은 사이 다른 직원이 읽으면 상쇄 — 놓치면 사이드바 숫자가 남는다
    for (const [href, label] of NEW_ITEM_TOASTS) {
      const added = (badges?.[href] ?? 0) - (prev?.[href] ?? 0);
      if (added > 0) {
        toast(`${label} ${added}건이 새로 들어왔어요`, {
          action: { label: "보기", onClick: () => router.push(href) },
        });
      }
    }
  }, [badges, router]);

  // 배지 갱신 — layout은 소프트 네비게이션에서 리렌더되지 않아 서버 스냅샷이 얼어붙는다.
  // 페이지 이동·창 포커스·2분 주기로 폴링하되, DB 전송량(egress)을 줄이려고
  // 숨은 탭에선 쉬고, 직전 갱신 후 30초 안의 이동·포커스는 건너뛴다. 첫 렌더는 layout 스냅샷을 그대로 쓴다.
  const lastBadgeFetch = useRef(0);
  const refreshBadges = useRef<(force?: boolean) => void>(() => {});
  useEffect(() => {
    let alive = true;
    lastBadgeFetch.current = Date.now();
    refreshBadges.current = async (force = false) => {
      if (document.hidden) return;
      if (!force && Date.now() - lastBadgeFetch.current < BADGE_MIN_INTERVAL_MS) return;
      lastBadgeFetch.current = Date.now();
      try {
        const res = await fetch("/api/sidebar-badges");
        if (!res.ok) return;
        const data = await res.json();
        if (alive) setBadges(data);
      } catch {
        // 네트워크 실패 시 기존 배지 유지
      }
    };
    const onFocus = () => refreshBadges.current();
    const onVisible = () => {
      if (!document.hidden) refreshBadges.current();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => refreshBadges.current(true), 120_000);
    return () => {
      alive = false;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    refreshBadges.current();
  }, [pathname]);

  function changeCollapsed(next: boolean) {
    setCollapsedRaw(String(next));
  }

  function toggleViewMode() {
    setViewModeRaw(viewMode === "web" ? "mobile" : "web");
  }
  const isMobilePreview = viewMode === "mobile";

  const profile = (onNavigate?: () => void) => (
    <ProfileMenu
      user={user}
      badges={badges}
      viewMode={viewMode}
      onToggleViewMode={toggleViewMode}
      onNavigate={onNavigate}
    />
  );

  return (
    <div className="min-h-dvh bg-bg-layer-default">
      <CommandPalette role={user.role} />

      {/* 데스크톱 사이드바 — 고정, 콘텐츠는 창 스크롤 */}
      <SideNavigationProvider collapsed={collapsed} onCollapsedChange={changeCollapsed}>
        <div data-print-hide className="fixed inset-y-0 left-0 z-30 hidden md:block">
          <AppSidebar role={user.role} plan={plan} badges={badges} footer={profile()} />
        </div>
      </SideNavigationProvider>

      {/* 모바일 사이드바 (시트) — 항상 펼친 상태 */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[240px] max-w-[85vw] border-0 p-0 [&>button]:hidden">
          <VisuallyHidden>
            <SheetTitle>메뉴</SheetTitle>
          </VisuallyHidden>
          <SideNavigationProvider collapsed={false}>
            <AppSidebar
              role={user.role}
              plan={plan}
              badges={badges}
              footer={profile(() => setMobileOpen(false))}
              collapsible={false}
              onNavigate={() => setMobileOpen(false)}
            />
          </SideNavigationProvider>
        </SheetContent>
      </Sheet>

      <div
        data-print-main
        className={cn(
          "flex min-h-dvh flex-col transition-[margin] duration-200",
          collapsed ? "md:ml-14" : "md:ml-60",
        )}
      >
        <AppHeader onMenuClick={() => setMobileOpen(true)} />
        <main
          data-print-content
          data-page-tabs={pageTabs ? "" : undefined}
          className={cn(
            "mx-auto w-full flex-1 px-x4 pb-x16 pt-x5 md:px-x8 md:pt-x8",
            // PageTabs 가 재기 전(첫 그리기) 어림값 — 제목 + 탭 + 아래 여백
            pageTabs && "[--page-tabs-h:6.75rem] md:[--page-tabs-h:7.75rem]",
            isMobilePreview
              ? "max-w-[430px] md:px-x4 outline outline-2 outline-offset-4 outline-stroke-informative-weak"
              : "max-w-[1280px]",
          )}
        >
          {pageTabs && (
            <PageTabs
              title={pageTabs.title}
              tabs={pageTabs.tabs}
              current={pageTabs.current}
              badges={badges}
            />
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

function initials(name: string) {
  return name.replace(/\s+/g, "").slice(-2);
}

/** 사이드바 하단 — 내 계정 메뉴(SEED Menu). 내 출퇴근·요청사항도 여기서 연다 */
function ProfileMenu({
  user,
  badges,
  viewMode,
  onToggleViewMode,
  onNavigate,
}: {
  user: DashboardShellProps["user"];
  badges?: Record<string, number>;
  viewMode: ViewMode;
  onToggleViewMode: () => void;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const { collapsed } = useSideNavigationContext();
  const unread = ACCOUNT_GROUP.items.reduce((sum, it) => sum + (badges?.[it.href] ?? 0), 0);

  async function signOut() {
    await authClient.signOut();
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <MenuRoot placement={collapsed ? "right-end" : "top-start"} matchReferenceWidth={!collapsed}>
      <MenuTrigger asChild>
        <SeedSideNavigation.Item aria-label="내 계정" suppressHydrationWarning>
          <span
            aria-hidden
            className="absolute left-2 top-1/2 grid size-6 -translate-x-0.5 -translate-y-1/2 place-items-center rounded-full bg-bg-brand-weak t1-bold text-fg-brand"
          >
            {initials(user.name)}
            {unread > 0 && (
              <NotificationBadge
                size="small"
                aria-label={`미확인 ${unread}건`}
                className="absolute -right-0.5 -top-0.5"
              />
            )}
          </span>
          <SeedSideNavigation.ItemLabel>
            {user.name}
            <span className="ml-x1_5 t3-regular text-fg-neutral-subtle">{ROLE_LABELS[user.role]}</span>
          </SeedSideNavigation.ItemLabel>
        </SeedSideNavigation.Item>
      </MenuTrigger>
      <MenuContent>
        <MenuGroup>
          {ACCOUNT_GROUP.items.map((it) => {
            const Icon = it.icon;
            const count = badges?.[it.href] ?? 0;
            return (
              <MenuItem
                key={it.href}
                prefixIcon={<Icon />}
                label={
                  <span className="flex items-center gap-x1_5">
                    {it.label}
                    {count > 0 && (
                      <NotificationBadge size="large" aria-label={`미확인 ${count}건`}>
                        {count > 99 ? "99+" : count}
                      </NotificationBadge>
                    )}
                  </span>
                }
                onClick={() => {
                  onNavigate?.();
                  router.push(it.href);
                }}
              />
            );
          })}
        </MenuGroup>
        <MenuGroup className="hidden md:block">
          <MenuItem
            prefixIcon={viewMode === "mobile" ? <Monitor /> : <Smartphone />}
            label={viewMode === "mobile" ? "PC 화면으로 보기" : "모바일 화면으로 미리보기"}
            onClick={onToggleViewMode}
          />
        </MenuGroup>
        <MenuGroup>
          <MenuItem tone="critical" prefixIcon={<LogOut />} label="로그아웃" onClick={signOut} />
        </MenuGroup>
      </MenuContent>
    </MenuRoot>
  );
}
