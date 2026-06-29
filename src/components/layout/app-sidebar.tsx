"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useModKey } from "@/lib/nav-shortcuts";
import {
  hasFeature, getMinimumPlan, PLAN_LABELS,
  type PlanTier, type FeatureKey,
} from "@/lib/features";
import { isFullAccess, isOnlineStaff, isStaff } from "@/lib/roles";
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
  GraduationCap,
  Wallet,
  Building2,
  Globe,
  Lock,
  ChevronRight,
  ChevronsLeft,
  Video,
  HelpCircle,
  ScanLine,
  MessageSquarePlus,
  UserPlus,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  feature?: FeatureKey;
  // 역할별 노출 제어. 미지정 시 섹션이 렌더되는 모든 역할에 노출.
  show?: (role?: string | null) => boolean;
};
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
      { href: "/waitlist", label: "대기자 관리", icon: UserPlus },
      { href: "/seat-map", label: "좌석 배치도", icon: MapPin, feature: "seat-map" },
      { href: "/merit-demerit", label: "상벌점", icon: Star, feature: "merit-demerit" },
      { href: "/vocab-test", label: "영단어 시험", icon: BookOpen, feature: "vocab-test" },
      { href: "/questions", label: "학생 질문", icon: HelpCircle },
      { href: "/suggestions", label: "학생 건의사항", icon: MessageSquarePlus },
      { href: "/online/inbox", label: "학생 메시지", icon: MessageSquare },
      { href: "/assignments", label: "과제 관리", icon: ClipboardCheck, feature: "assignments" },
      { href: "/online/performance", label: "수행평가", icon: ClipboardCheck },
      { href: "/exams", label: "시험 관리", icon: GraduationCap, feature: "exam-scores" },
      // 등원 스케줄(시간표 제안→학부모 승인 검토)은 원장/SA만.
      { href: "/online/schedules", label: "등원 스케줄", icon: CalendarClock, show: isFullAccess },
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
      { href: "/patrol", label: "순찰 관리", icon: ScanLine },
      { href: "/calendar", label: "캘린더", icon: CalendarDays, feature: "calendar" },
      { href: "/meeting-minutes", label: "회의록", icon: NotebookText, feature: "meeting-minutes" },
      { href: "/messages", label: "카카오 메시지", icon: MessageCircle, feature: "kakao-messages" },
      { href: "/requests", label: "요청사항", icon: Megaphone, feature: "requests" },
    ],
  },
];

// 온라인 관리 모듈. ONLINE_ROLES(원장·SUPER_ADMIN·CONSULTANT·MANAGER_MENTOR) 에만 노출.
// 등원 스케줄·수행평가·학생 메시지는 전체 학생 대상이므로 navSections(일반 그룹)로 이동함.
const onlineSection: NavSection = {
  label: "온라인 관리",
  items: [
    { href: "/online", label: "온라인 대시보드", icon: Globe },
    { href: "/online/students", label: "온라인 학생", icon: Users },
    { href: "/online/sessions", label: "화상 1:1 세션", icon: Video },
    { href: "/online/daily-log", label: "일일 보고", icon: MessageSquare },
    { href: "/online/reports", label: "학부모 보고서", icon: FileText },
  ],
};

// 전 직원 접근 가능 — 운영조교/멘토/총괄멘토/원장/SA 모두 노출
const insightsSection: NavSection = {
  label: "리포트·분석",
  items: [
    { href: "/reports/monthly", label: "월간 리포트", icon: BarChart3, feature: "reports" },
    { href: "/analytics", label: "성과 분석", icon: TrendingUp, feature: "analytics" },
  ],
};

// 원장/SA 전용 — 급여·시스템 관리
const directorSection: NavSection = {
  label: "관리자",
  items: [
    { href: "/mentors", label: "직원 관리", icon: UserCog, feature: "mentors" },
    { href: "/payroll", label: "급여 정산", icon: Wallet, feature: "payroll" },
    { href: "/payroll/me", label: "내 출퇴근", icon: Wallet, feature: "payroll" },
    { href: "/admin/school-stats", label: "학교별 통계", icon: Building2, feature: "school-stats" },
  ],
};

export function AppSidebar({
  role,
  plan = "PREMIUM",
  mobile,
  onClose,
  collapsed = false,
  onToggle,
  badges,
}: {
  role?: string;
  plan?: PlanTier;
  mobile?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
  badges?: Record<string, number>;
}) {
  const pathname = usePathname();
  const mod = useModKey();

  // Sidebar nav 스크롤 위치 유지 — (dashboard) ↔ /online 이동 시 layout 리마운트로 인한 리셋 방지
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const saved = sessionStorage.getItem("sidebarScroll");
    if (saved) el.scrollTop = Number(saved);
  }, []);

  const allNavItems = [
    ...navSections.flatMap((s) => s.items),
    ...insightsSection.items,
    ...onlineSection.items,
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
            "flex items-center gap-2.5 px-2.5 py-[7px] rounded-[8px] text-[12.5px] font-medium text-ink-5 cursor-not-allowed",
            collapsed && "justify-center px-2"
          )}
          title={collapsed ? label : (minPlan ? `${PLAN_LABELS[minPlan].label} 플랜부터 사용 가능` : undefined)}
        >
          <Icon className="h-4 w-4 shrink-0 text-ink-6" />
          {!collapsed && (
            <>
              <span className="flex-1">{label}</span>
              <Lock className="h-3 w-3 text-ink-6" />
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
          "relative flex items-center gap-2.5 px-2.5 py-[7px] rounded-[8px] text-[12.5px] font-medium transition-colors duration-100",
          collapsed && "justify-center px-2",
          isActive
            ? "bg-panel text-ink font-semibold shadow-[inset_0_0_0_1px_var(--line),var(--shadow-xs)]"
            : "text-ink-2 hover:bg-[rgba(20,20,25,0.04)]"
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            isActive ? "text-ink" : "text-ink-3"
          )}
        />
        {!collapsed && (
          <>
            <span className="flex-1">{label}</span>
            {(badges?.[href] ?? 0) > 0 && (
              <span
                className="inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold min-w-[16px] h-4 px-1"
                title={`미확인 ${badges?.[href]}건`}
              >
                {badges?.[href]}
              </span>
            )}
          </>
        )}
        {collapsed && (badges?.[href] ?? 0) > 0 && (
          <span
            className="absolute top-0 right-0 inline-block h-2 w-2 rounded-full bg-amber-500"
            title={`미확인 ${badges?.[href]}건`}
          />
        )}
      </Link>
    );
  };

  const renderSection = ({ label, items }: NavSection, idx: number) => {
    const visible = items.filter((it) => (it.show ? it.show(role) : true));
    if (visible.length === 0) return null;
    return (
      <div key={idx} className={cn("space-y-[1px]", idx > 0 && "pt-[18px]")}>
        {label && !collapsed && (
          <p className="px-2 pb-1.5 text-[11px] font-semibold text-ink-4 tracking-[-0.005em]">
            {label}
          </p>
        )}
        {visible.map(renderLink)}
      </div>
    );
  };

  const isCollapsed = !mobile && collapsed;

  return (
    <aside className={cn(
      "group/sb h-screen bg-sidebar flex flex-col transition-[width] duration-300 p-2.5",
      isCollapsed ? "w-16" : "w-[240px]",
      !mobile && "fixed left-0 top-0"
    )}>
      {/* Workspace / logo — icon-only when collapsed, full card when expanded */}
      <div className="shrink-0">
        {isCollapsed ? (
          <button
            type="button"
            onClick={onToggle}
            disabled={!onToggle}
            title="사이드바 펼치기"
            aria-label="사이드바 펼치기"
            className={cn(
              "relative w-8 h-8 mx-auto grid place-items-center rounded-[9px] bg-ink text-white",
              "text-[13px] font-bold tracking-[-0.02em] overflow-visible",
              onToggle && "cursor-pointer transition-transform group-hover/sb:scale-[1.04]"
            )}
          >
            <span className="relative w-full h-full grid place-items-center rounded-[9px] overflow-hidden">
              K
              <span className="absolute inset-[2px] rounded-[7px] bg-[linear-gradient(135deg,rgba(255,255,255,0.08),transparent_60%)] pointer-events-none" />
            </span>
            {/* Expand affordance — small pulsing chevron attached to the logo */}
            {onToggle && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute -right-[9px] top-1/2 -translate-y-1/2",
                  "w-4 h-4 rounded-full bg-panel border border-line shadow-[var(--shadow-sm)]",
                  "grid place-items-center text-ink-3",
                  "opacity-60 group-hover/sb:opacity-100 group-hover/sb:text-ink",
                  "transition-all"
                )}
              >
                <ChevronRight className="h-3 w-3" />
              </span>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={onToggle}
            disabled={!onToggle}
            title="사이드바 접기"
            className={cn(
              "w-full flex items-center gap-2.5 p-2.5 rounded-[10px] bg-panel border border-line shadow-[var(--shadow-xs)]",
              onToggle && "hover:border-line-strong cursor-pointer"
            )}
          >
            <Image
              src="/khsb-logo.png"
              alt="KHSB"
              width={640}
              height={242}
              priority
              className="h-7 w-auto shrink-0"
            />
            <span className="min-w-0 text-left flex-1">
              <span className="block font-semibold text-[12.5px] text-ink tracking-[-0.015em] truncate">BackOffice</span>
              <span className="block text-[11px] text-ink-4 leading-none mt-0.5">원장 · {PLAN_LABELS[plan].label}</span>
            </span>
            {onToggle && <ChevronsLeft className="h-3.5 w-3.5 text-ink-4 shrink-0" />}
          </button>
        )}
      </div>

      {/* Search trigger */}
      <div className="pt-2.5">
        {isCollapsed ? (
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}
            title={`빠른 이동 · 원생 검색 (${mod}K)`}
            aria-label="검색"
            className="w-8 h-8 mx-auto grid place-items-center rounded-[8px] text-ink-3 hover:bg-canvas-2 hover:text-ink transition-colors cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" strokeLinecap="round" />
            </svg>
          </button>
        ) : (
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}
            className="flex items-center gap-2 w-full rounded-[10px] bg-panel border border-line shadow-[var(--shadow-xs)] hover:border-line-strong transition-colors cursor-text px-3 py-2"
          >
            <svg className="h-3.5 w-3.5 text-ink-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" strokeLinecap="round" />
            </svg>
            <span className="flex-1 text-left text-[12.5px] text-ink-4">빠른 이동 · 원생 검색</span>
            <kbd className="font-mono text-[10px] text-ink-4 bg-canvas-2 px-1.5 py-px rounded-[4px]">{mod}K</kbd>
          </button>
        )}
      </div>

      {/* Nav */}
      <nav
        ref={navRef}
        onScroll={(e) => sessionStorage.setItem("sidebarScroll", String(e.currentTarget.scrollTop))}
        className={cn("flex-1 overflow-y-auto pt-[18px]", isCollapsed && "px-0")}
      >
        {navSections.map(renderSection)}
        {isStaff(role) &&
          renderSection(insightsSection, navSections.length)}
        {isOnlineStaff(role) &&
          renderSection(onlineSection, navSections.length + 1)}
        {isFullAccess(role) &&
          renderSection(directorSection, navSections.length + 2)}
      </nav>

      {/* Footer — plan badge */}
      {!isCollapsed && (
        <div className="pt-2 shrink-0 flex items-center justify-center gap-1.5">
          <span className={cn(
            "text-[10px] font-semibold rounded-full px-2 py-0.5 border",
            PLAN_LABELS[plan].color,
          )}>
            {PLAN_LABELS[plan].label}
          </span>
          <span className="text-[11px] text-ink-5 font-mono">v4</span>
        </div>
      )}
    </aside>
  );
}
