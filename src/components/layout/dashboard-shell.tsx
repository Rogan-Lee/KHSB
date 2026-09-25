"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { SideNavigation as SeedSideNavigation } from "@seed-design/react";
import { useSideNavigationContext } from "@seed-design/react/primitive";
import { LogOut, Monitor, Smartphone } from "lucide-react";
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
type ViewMode = "web" | "mobile";

export function DashboardShell({ user, children, sidebarBadges }: DashboardShellProps) {
  const plan = getCurrentPlan();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsedRaw, setCollapsedRaw] = useStoredValue(SIDEBAR_COLLAPSED_KEY, "false");
  const [viewModeRaw, setViewModeRaw] = useStoredValue(VIEW_MODE_KEY, "web");
  const collapsed = collapsedRaw === "true";
  const viewMode: ViewMode = viewModeRaw === "mobile" ? "mobile" : "web";
  const [badges, setBadges] = useState(sidebarBadges);

  // 배지 갱신 — layout은 소프트 네비게이션에서 리렌더되지 않아 서버 스냅샷이 얼어붙는다.
  // 페이지 이동·창 포커스·2분 주기로 폴링해 실시간에 가깝게 유지.
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const res = await fetch("/api/sidebar-badges");
        if (!res.ok) return;
        const data = await res.json();
        if (alive) setBadges(data);
      } catch {
        // 네트워크 실패 시 기존 배지 유지
      }
    };
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const timer = setInterval(refresh, 120_000);
    return () => {
      alive = false;
      window.removeEventListener("focus", onFocus);
      clearInterval(timer);
    };
  }, [pathname]);

  function changeCollapsed(next: boolean) {
    setCollapsedRaw(String(next));
  }

  function toggleViewMode() {
    setViewModeRaw(viewMode === "web" ? "mobile" : "web");
  }
  const isMobilePreview = viewMode === "mobile";

  const profile = (
    <ProfileMenu user={user} viewMode={viewMode} onToggleViewMode={toggleViewMode} />
  );

  return (
    <div className="min-h-dvh bg-bg-layer-default">
      <CommandPalette role={user.role} />

      {/* 데스크톱 사이드바 — 고정, 콘텐츠는 창 스크롤 */}
      <SideNavigationProvider collapsed={collapsed} onCollapsedChange={changeCollapsed}>
        <div data-print-hide className="fixed inset-y-0 left-0 z-30 hidden md:block">
          <AppSidebar role={user.role} plan={plan} badges={badges} footer={profile} />
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
              footer={profile}
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
          className={cn(
            "mx-auto w-full flex-1 px-x4 pb-x16 pt-x5 md:px-x8 md:pt-x8",
            isMobilePreview
              ? "max-w-[430px] md:px-x4 outline outline-2 outline-offset-4 outline-stroke-informative-weak"
              : "max-w-[1280px]",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

function initials(name: string) {
  return name.replace(/\s+/g, "").slice(-2);
}

/** 사이드바 하단 — 내 계정 메뉴(SEED Menu) */
function ProfileMenu({
  user,
  viewMode,
  onToggleViewMode,
}: {
  user: DashboardShellProps["user"];
  viewMode: ViewMode;
  onToggleViewMode: () => void;
}) {
  const router = useRouter();
  const { collapsed } = useSideNavigationContext();

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
          </span>
          <SeedSideNavigation.ItemLabel>
            {user.name}
            <span className="ml-x1_5 t3-regular text-fg-neutral-subtle">{ROLE_LABELS[user.role]}</span>
          </SeedSideNavigation.ItemLabel>
        </SeedSideNavigation.Item>
      </MenuTrigger>
      <MenuContent>
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
