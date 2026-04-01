"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  hasFeature, getMinimumPlan, PLAN_LABELS, ROUTE_FEATURE_MAP,
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
      { href: "/consultations", label: "원장 면담", icon: FileText, feature: "consultations" },
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
}: {
  role?: string;
  plan?: PlanTier;
  mobile?: boolean;
  onClose?: () => void;
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
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-[#c4c9ce] cursor-not-allowed"
          title={minPlan ? `${PLAN_LABELS[minPlan].label} 플랜부터 사용 가능` : undefined}
        >
          <Icon className="h-4 w-4 shrink-0 text-[#d4d8dc]" />
          <span className="flex-1">{label}</span>
          <Lock className="h-3 w-3 text-[#d4d8dc]" />
        </div>
      );
    }

    return (
      <Link
        key={href}
        href={href}
        onClick={mobile ? onClose : undefined}
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors duration-100",
          isActive
            ? "bg-[#eaf2fe] text-[#005eeb]"
            : "text-[#464c53] hover:bg-[#f4f4f5] hover:text-[#1e2124]"
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            isActive ? "text-[#0066ff]" : "text-[#6d7882]"
          )}
        />
        {label}
      </Link>
    );
  };

  const renderSection = ({ label, items }: NavSection, idx: number) => (
    <div key={idx} className={cn("space-y-0.5", idx > 0 && "pt-4")}>
      {label && (
        <p className="px-3 pb-1.5 text-[11px] font-semibold text-[#b1b8be] uppercase tracking-widest">
          {label}
        </p>
      )}
      {items.map(renderLink)}
    </div>
  );

  return (
    <aside className={cn(
      "h-screen w-[240px] bg-white border-r border-[#e1e2e4] flex flex-col",
      !mobile && "fixed left-0 top-0"
    )}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-[#e1e2e4] shrink-0">
        <div className="w-7 h-7 rounded-lg bg-[#0066ff] flex items-center justify-center shrink-0">
          <BookOpen className="h-3.5 w-3.5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-[13px] text-[#1e2124] tracking-tight truncate">KHSB BackOffice</p>
          <p className="text-[10px] text-[#b1b8be] leading-none mt-0.5">Admin System</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {navSections.map(renderSection)}
        {(role === "DIRECTOR" || role === "ADMIN") &&
          renderSection(directorSection, navSections.length)}
      </nav>

      {/* Footer — plan badge */}
      <div className="px-4 py-3 border-t border-[#e1e2e4] shrink-0">
        <div className="flex items-center justify-center gap-1.5">
          <span className={cn(
            "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
            PLAN_LABELS[plan].color,
          )}>
            {PLAN_LABELS[plan].label}
          </span>
          <span className="text-[11px] text-[#b1b8be]">v2.0</span>
        </div>
      </div>
    </aside>
  );
}
