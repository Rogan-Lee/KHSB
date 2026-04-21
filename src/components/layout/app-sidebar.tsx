"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  hasFeature, getMinimumPlan, PLAN_LABELS,
  type PlanTier, type FeatureKey,
} from "@/lib/features";
import {
  BookOpen,
  Users,
  ClipboardList,
  Star,
  MessageSquare,
  ClipboardCheck,
  FileText,
  MessageCircle,
  BarChart3,
  TrendingUp,
  LayoutDashboard,
  Calendar,
  CalendarDays,
  UserCog,
  LayoutList,
  ArrowLeftRight,
  ListTodo,
  NotebookText,
  CalendarClock,
  MapPin,
  Megaphone,
  Lock,
  ChevronRight,
} from "lucide-react";

type NavItem = { href: string; label: string; icon: React.ElementType; feature?: FeatureKey };
type NavSection = { label?: string; items: NavItem[] };

const navSections: NavSection[] = [
  {
    label: "자주 사용",
    items: [
      { href: "/", label: "대시보드", icon: LayoutDashboard },
      { href: "/attendance", label: "입퇴실 관리", icon: ClipboardList, feature: "attendance" },
      { href: "/handover", label: "인수인계", icon: ArrowLeftRight, feature: "handover" },
      { href: "/todos", label: "투두리스트", icon: ListTodo, feature: "todos" },
    ],
  },
  {
    label: "원생",
    items: [
      { href: "/students", label: "원생 관리", icon: Users, feature: "students" },
      { href: "/seat-map", label: "좌석 배치도", icon: MapPin, feature: "seat-map" },
      { href: "/merit-demerit", label: "상벌점", icon: Star, feature: "merit-demerit" },
      { href: "/vocab-test", label: "영단어 시험", icon: BookOpen, feature: "vocab-test" },
      { href: "/assignments", label: "과제 관리", icon: ClipboardCheck, feature: "assignments" },
    ],
  },
  {
    label: "멘토링",
    items: [
      { href: "/mentoring", label: "멘토링", icon: MessageSquare, feature: "mentoring" },
      { href: "/mentoring-plan", label: "주간 멘토링 계획", icon: CalendarClock, feature: "mentoring-plan" },
      { href: "/timetable", label: "시간표", icon: LayoutList, feature: "timetable" },
      { href: "/consultations", label: "면담 관리", icon: FileText, feature: "consultations" },
      { href: "/mentoring/schedule", label: "멘토 스케줄", icon: Calendar, feature: "mentoring" },
    ],
  },
  {
    label: "운영",
    items: [
      { href: "/calendar", label: "캘린더", icon: CalendarDays, feature: "calendar" },
      { href: "/meeting-minutes", label: "회의록", icon: NotebookText, feature: "meeting-minutes" },
      { href: "/messages", label: "카카오 메시지", icon: MessageCircle, feature: "kakao-messages" },
      { href: "/requests", label: "요청사항", icon: Megaphone, feature: "requests" },
    ],
  },
];

const directorSection: NavSection = {
  label: "관리자",
  items: [
    { href: "/mentors", label: "직원 관리", icon: UserCog, feature: "mentors" },
    { href: "/reports", label: "월간 리포트", icon: BarChart3, feature: "reports" },
    { href: "/analytics", label: "성과 분석", icon: TrendingUp, feature: "analytics" },
  ],
};

export function AppSidebar({
  role,
  plan = "PREMIUM",
  mobile,
  onClose,
  collapsed = false,
  onToggle,
}: {
  role?: string;
  plan?: PlanTier;
  mobile?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const pathname = usePathname();

  const allNavItems = [
    ...navSections.flatMap((s) => s.items),
    ...directorSection.items,
  ];

  const isActiveLink = (href: string) => {
    if (href === "/") return pathname === "/";
    const matches = pathname === href || pathname.startsWith(href + "/");
    if (!matches) return false;
    return !allNavItems.some(
      (item) =>
        item.href !== href &&
        item.href.length > href.length &&
        (pathname === item.href || pathname.startsWith(item.href + "/"))
    );
  };

  const renderLink = ({ href, label, icon: Icon, feature }: NavItem) => {
    const isActive = isActiveLink(href);
    const locked = feature ? !hasFeature(plan, feature) : false;
    const minPlan = feature ? getMinimumPlan(feature) : null;

    if (locked) {
      return (
        <div
          key={href}
          className={cn(
            "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-[#c4c9ce] cursor-not-allowed",
            collapsed && "justify-center px-2"
          )}
          title={collapsed ? label : (minPlan ? `${PLAN_LABELS[minPlan].label} 플랜부터 사용 가능` : undefined)}
        >
          <Icon className="h-4 w-4 shrink-0 text-[#d4d8dc]" />
          {!collapsed && (
            <>
              <span className="flex-1">{label}</span>
              <Lock className="h-3 w-3 text-[#d4d8dc]" />
            </>
          )}
        </div>
      );
    }

    return (
      <Link
        key={href}
        href={href}
        onClick={mobile ? onClose : undefined}
        title={collapsed ? label : undefined}
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors duration-100",
          collapsed && "justify-center px-2",
          isActive
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            isActive ? "text-primary" : "text-muted-foreground"
          )}
        />
        {!collapsed && label}
      </Link>
    );
  };

  const renderSection = ({ label, items }: NavSection, idx: number) => (
    <div key={idx} className={cn("space-y-0.5", idx > 0 && "pt-4")}>
      {label && !collapsed && (
        <p className="px-3 pb-1.5 text-[10.5px] font-semibold text-muted-foreground/60 uppercase tracking-[0.04em]">
          {label}
        </p>
      )}
      {items.map(renderLink)}
    </div>
  );

  // 모바일에서는 collapsed 무시 (Sheet는 항상 풀 너비)
  const isCollapsed = !mobile && collapsed;

  return (
    <aside className={cn(
      "h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-[width] duration-300",
      isCollapsed ? "w-16" : "w-[224px]",
      !mobile && "fixed left-0 top-0"
    )}>
      {/* Logo — 클릭 시 토글, hover 시 펼치기 버튼 노출(접힌 상태) */}
      <div className="group relative shrink-0">
        <button
          type="button"
          onClick={onToggle}
          disabled={!onToggle}
          title={isCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
          className={cn(
            "w-full flex items-center gap-2.5 px-3 h-14 border-b border-sidebar-border transition-colors",
            onToggle && "hover:bg-accent/40 cursor-pointer",
            isCollapsed && "justify-center px-0"
          )}
        >
          <div className="w-[22px] h-[22px] rounded-md bg-gradient-to-br from-[#FF6A1A] to-[#E8B54A] flex items-center justify-center shrink-0 shadow-[0_6px_14px_-6px_rgba(255,106,26,0.5)]">
            <BookOpen className="h-3 w-3 text-[#0B0C0E]" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0 text-left">
              <p className="font-semibold text-[12.5px] text-foreground tracking-tight truncate">KHSB BackOffice</p>
              <p className="text-[10px] text-muted-foreground font-mono leading-none mt-0.5">operator · v3</p>
            </div>
          )}
        </button>
        {/* 접힌 상태에서 호버 시 펼치기 버튼 */}
        {isCollapsed && onToggle && (
          <button
            type="button"
            onClick={onToggle}
            title="사이드바 펼치기"
            className="hidden group-hover:flex absolute top-1/2 -right-3 -translate-y-1/2 h-6 w-6 items-center justify-center rounded-full border border-sidebar-border bg-background shadow-sm hover:bg-accent z-10"
          >
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Search trigger */}
      <div className={cn("px-3 pt-2 pb-1", isCollapsed && "px-2")}>
        <button
          onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
          title={isCollapsed ? "빠른 이동 · 원생 검색 (⌘K)" : undefined}
          className={cn(
            "flex items-center gap-2 w-full rounded-[7px] bg-muted/60 border border-border/50 hover:border-border transition-colors cursor-text",
            isCollapsed ? "justify-center py-1.5" : "px-2.5 py-1.5"
          )}
        >
          <svg className="h-3.5 w-3.5 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3" strokeLinecap="round"/></svg>
          {!isCollapsed && (
            <>
              <span className="flex-1 text-left text-xs text-muted-foreground">빠른 이동 · 원생 검색</span>
              <kbd className="font-mono text-[10px] text-muted-foreground bg-background border border-border px-1.5 py-px rounded">⌘K</kbd>
            </>
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className={cn("flex-1 overflow-y-auto py-3", isCollapsed ? "px-2" : "px-3")}>
        {navSections.map(renderSection)}
        {(role === "DIRECTOR" || role === "ADMIN") &&
          renderSection(directorSection, navSections.length)}
      </nav>

      {/* Footer — plan badge */}
      <div className={cn("py-3 border-t border-[#e1e2e4] shrink-0", isCollapsed ? "px-2" : "px-4")}>
        <div className="flex items-center justify-center gap-1.5">
          <span className={cn(
            "text-[10px] font-semibold rounded-full border",
            PLAN_LABELS[plan].color,
            isCollapsed ? "w-2 h-2 p-0 border-0" : "px-2 py-0.5",
          )} title={isCollapsed ? PLAN_LABELS[plan].label : undefined}>
            {!isCollapsed && PLAN_LABELS[plan].label}
          </span>
          {!isCollapsed && <span className="text-[11px] text-[#b1b8be]">v2.0</span>}
        </div>
      </div>
    </aside>
  );
}
