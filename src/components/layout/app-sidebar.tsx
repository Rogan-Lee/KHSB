"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconChevronUpSmallFill } from "@karrotmarket/react-monochrome-icon";
import {
  NavigationMenu as SeedNavigationMenu,
  NotificationBadge,
  SideNavigation as SeedSideNavigation,
} from "@seed-design/react";
import { useSideNavigationContext } from "@seed-design/react/primitive";
import { Lock } from "lucide-react";
import {
  SideNavigationContent,
  SideNavigationFooter,
  SideNavigationHeader,
  SideNavigationRoot,
  SideNavigationTrigger,
} from "seed-design/ui/side-navigation";
import { HelpBubbleTooltipTriggerPortal } from "seed-design/ui/help-bubble-tooltip";
import {
  NavigationMenuContent,
  NavigationMenuGroup,
  NavigationMenuGroupLabel,
} from "seed-design/ui/navigation-menu";
import { hasFeature, getMinimumPlan, PLAN_LABELS, type PlanTier } from "@/lib/features";
import { cn } from "@/lib/utils";
import { matchNavHref, visibleGroups, visiblePrimary, type NavGroup, type NavItem } from "./nav-config";
import { useStoredValue } from "./use-stored-value";

const OPEN_GROUPS_KEY = "sidebarOpenGroups";

type Badges = Record<string, number> | undefined;

function badgeLabel(n: number) {
  return n > 99 ? "99+" : String(n);
}

/**
 * SEED SideNavigation 기반 사이드바.
 * - 매일 쓰는 화면은 맨 위 평면 목록, 나머지는 접이식 그룹(현재 화면이 속한 그룹은 자동으로 펼침)
 * - 접힌 상태(56px)에선 그룹이 플라이아웃 메뉴로, 항목은 툴팁으로 보인다
 * - 미확인 건수는 SEED NotificationBadge
 */
export function AppSidebar({
  role,
  plan = "PREMIUM",
  badges,
  footer,
  onNavigate,
  collapsible = true,
  className,
}: {
  role?: string;
  plan?: PlanTier;
  badges?: Badges;
  /** 프로필 메뉴 등 하단 영역 */
  footer?: React.ReactNode;
  /** 모바일 시트에서 링크를 누르면 닫기 */
  onNavigate?: () => void;
  /** 접기 버튼 노출 (모바일 시트에선 끔) */
  collapsible?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const currentHref = matchNavHref(pathname);
  const groups = visibleGroups(role);
  const primary = visiblePrimary(role);
  const currentGroupId = groups.find((g) => g.items.some((it) => it.href === currentHref))?.id;

  // 그룹 펼침 — 사용자가 열고 닫은 상태는 기억하고(localStorage), 현재 화면이 속한 그룹은 기본으로 연다.
  // 현재 그룹을 사용자가 닫으면 그 화면에 있는 동안만 닫힌 채로 둔다.
  const [openGroupsRaw, setOpenGroupsRaw] = useStoredValue(OPEN_GROUPS_KEY, "{}");
  const openGroups = useMemo<Record<string, boolean>>(() => {
    try {
      return JSON.parse(openGroupsRaw);
    } catch {
      return {};
    }
  }, [openGroupsRaw]);
  const [closedCurrent, setClosedCurrent] = useState<{ group: string; path: string } | null>(null);
  function isGroupOpen(id: string) {
    if (id === currentGroupId) return !(closedCurrent?.group === id && closedCurrent.path === pathname);
    return !!openGroups[id];
  }
  function setGroupOpen(id: string, open: boolean) {
    if (id === currentGroupId) setClosedCurrent(open ? null : { group: id, path: pathname });
    setOpenGroupsRaw(JSON.stringify({ ...openGroups, [id]: open }));
  }

  // 스크롤 위치 유지 — (dashboard) ↔ /online 이동 시 레이아웃 리마운트로 리셋되는 것 방지
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const saved = sessionStorage.getItem("sidebarScroll");
    if (saved) el.scrollTop = Number(saved);
  }, []);

  return (
    <SideNavigationRoot className={cn("h-full", className)}>
      <SideNavigationHeader>
        <SidebarBrand plan={plan} />
        {collapsible && <SideNavigationTrigger />}
      </SideNavigationHeader>

      <SideNavigationContent
        ref={contentRef}
        onScroll={(e) => sessionStorage.setItem("sidebarScroll", String(e.currentTarget.scrollTop))}
      >
        <SeedSideNavigation.Group>
          {primary.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              plan={plan}
              current={item.href === currentHref}
              badge={badges?.[item.href]}
              onNavigate={onNavigate}
              withIcon
            />
          ))}
        </SeedSideNavigation.Group>

        <SeedSideNavigation.Group>
          {groups.map((group) => (
            <NavGroupItem
              key={group.id}
              group={group}
              plan={plan}
              currentHref={currentHref}
              badges={badges}
              open={isGroupOpen(group.id)}
              onOpenChange={(open) => setGroupOpen(group.id, open)}
              onNavigate={onNavigate}
            />
          ))}
        </SeedSideNavigation.Group>
      </SideNavigationContent>

      {footer && <SideNavigationFooter>{footer}</SideNavigationFooter>}
    </SideNavigationRoot>
  );
}

function SidebarBrand({ plan }: { plan: PlanTier }) {
  const { collapsed } = useSideNavigationContext();
  return (
    <Link
      href="/"
      aria-label="홈으로"
      className={cn(
        "flex h-12 items-center gap-x2_5 rounded-r2_5 px-x2 transition-opacity",
        collapsed && "pointer-events-none opacity-0",
      )}
    >
      <Image src="/khsb-logo.png" alt="KHSB" width={640} height={242} priority className="h-6 w-auto shrink-0" />
      <span className="min-w-0">
        <span className="block truncate t4-bold text-fg-neutral">BackOffice</span>
        <span className="block truncate t2-regular text-fg-neutral-subtle">{PLAN_LABELS[plan].label}</span>
      </span>
    </Link>
  );
}

/** 단일 메뉴 링크. 그룹 안에서는 아이콘 없이(들여쓰기) 그린다 */
function NavLink({
  item,
  plan,
  current,
  badge,
  onNavigate,
  withIcon,
}: {
  item: NavItem;
  plan: PlanTier;
  current: boolean;
  badge?: number;
  onNavigate?: () => void;
  withIcon?: boolean;
}) {
  const { collapsed, transitioning } = useSideNavigationContext();
  const isFlyout = collapsed && !transitioning;
  const locked = item.feature ? !hasFeature(plan, item.feature) : false;
  const Icon = item.icon;
  const count = badge ?? 0;

  const inner = (
    <>
      {withIcon && <SeedSideNavigation.ItemPrefixIcon svg={<Icon />} />}
      <SeedSideNavigation.ItemLabel>{item.label}</SeedSideNavigation.ItemLabel>
      {locked && !collapsed && <SeedSideNavigation.ItemSuffixIcon svg={<Lock />} />}
      {count > 0 && !collapsed && (
        <NotificationBadge size="large" aria-label={`미확인 ${count}건`} className="shrink-0">
          {badgeLabel(count)}
        </NotificationBadge>
      )}
      {count > 0 && collapsed && (
        <NotificationBadge size="small" aria-label={`미확인 ${count}건`} className="absolute right-2 top-2" />
      )}
    </>
  );

  const node = locked ? (
    <SeedSideNavigation.Item
      disabled
      title={`${PLAN_LABELS[getMinimumPlan(item.feature!)].label} 플랜부터 사용할 수 있어요`}
    >
      {inner}
    </SeedSideNavigation.Item>
  ) : (
    <SeedSideNavigation.Item asChild current={current}>
      <Link href={item.href} onClick={onNavigate} aria-current={current ? "page" : undefined}>
        {inner}
      </Link>
    </SeedSideNavigation.Item>
  );

  if (!isFlyout || !withIcon) return node;
  return (
    <HelpBubbleTooltipTriggerPortal title={item.label} placement="right">
      {node}
    </HelpBubbleTooltipTriggerPortal>
  );
}

/** 접이식 그룹 — 펼친 상태에선 SEED ItemCollapsible, 접힌 사이드바에선 플라이아웃 메뉴 */
function NavGroupItem({
  group,
  plan,
  currentHref,
  badges,
  open,
  onOpenChange,
  onNavigate,
}: {
  group: NavGroup;
  plan: PlanTier;
  currentHref: string | null;
  badges?: Badges;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: () => void;
}) {
  const { collapsed, transitioning } = useSideNavigationContext();
  const isFlyout = collapsed && !transitioning;
  const GroupIcon = group.icon;
  const hasCurrent = group.items.some((it) => it.href === currentHref);
  const unread = group.items.reduce((sum, it) => sum + (badges?.[it.href] ?? 0), 0);

  if (isFlyout) {
    return (
      <SeedNavigationMenu.Root value={`nav-group:${group.id}`}>
        <SeedNavigationMenu.Trigger asChild>
          <SeedSideNavigation.Item current={hasCurrent}>
            <SeedSideNavigation.ItemPrefixIcon svg={<GroupIcon />} />
            <SeedSideNavigation.ItemLabel>{group.label}</SeedSideNavigation.ItemLabel>
            {unread > 0 && (
              <NotificationBadge size="small" aria-label={`미확인 ${unread}건`} className="absolute right-2 top-2" />
            )}
          </SeedSideNavigation.Item>
        </SeedNavigationMenu.Trigger>
        <NavigationMenuContent>
          <NavigationMenuGroup>
            <NavigationMenuGroupLabel>{group.label}</NavigationMenuGroupLabel>
            {group.items.map((item) => {
              const locked = item.feature ? !hasFeature(plan, item.feature) : false;
              const count = badges?.[item.href] ?? 0;
              return (
                <SeedNavigationMenu.Item
                  key={item.href}
                  asChild={!locked}
                  disabled={locked}
                  current={item.href === currentHref}
                >
                  {locked ? (
                    <FlyoutItemBody label={item.label} count={0} />
                  ) : (
                    <Link href={item.href} onClick={onNavigate}>
                      <FlyoutItemBody label={item.label} count={count} />
                    </Link>
                  )}
                </SeedNavigationMenu.Item>
              );
            })}
          </NavigationMenuGroup>
        </NavigationMenuContent>
      </SeedNavigationMenu.Root>
    );
  }

  return (
    <SeedSideNavigation.ItemCollapsibleRoot open={open} onOpenChange={onOpenChange}>
      <SeedSideNavigation.ItemCollapsibleTrigger current={collapsed && hasCurrent}>
        <SeedSideNavigation.ItemPrefixIcon svg={<GroupIcon />} />
        <SeedSideNavigation.ItemLabel>{group.label}</SeedSideNavigation.ItemLabel>
        {unread > 0 && !open && (
          <NotificationBadge size="small" aria-label={`미확인 ${unread}건`} className="shrink-0" />
        )}
        <SeedSideNavigation.ItemSuffixIcon svg={<IconChevronUpSmallFill />} />
      </SeedSideNavigation.ItemCollapsibleTrigger>
      <SeedSideNavigation.ItemCollapsibleContent>
        {group.items.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            plan={plan}
            current={item.href === currentHref}
            badge={badges?.[item.href]}
            onNavigate={onNavigate}
          />
        ))}
      </SeedSideNavigation.ItemCollapsibleContent>
    </SeedSideNavigation.ItemCollapsibleRoot>
  );
}

function FlyoutItemBody({ label, count }: { label: string; count: number }) {
  return (
    <>
      <SeedNavigationMenu.ItemBody>
        <SeedNavigationMenu.ItemLabel>{label}</SeedNavigationMenu.ItemLabel>
      </SeedNavigationMenu.ItemBody>
      {count > 0 && (
        <NotificationBadge size="large" aria-label={`미확인 ${count}건`}>
          {badgeLabel(count)}
        </NotificationBadge>
      )}
    </>
  );
}
