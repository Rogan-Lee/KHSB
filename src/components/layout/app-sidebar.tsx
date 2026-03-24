"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
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
} from "lucide-react";

type NavItem = { href: string; label: string; icon: React.ElementType };
type NavSection = { label?: string; items: NavItem[] };

const navSections: NavSection[] = [
  {
    label: "자주 사용",
    items: [
      { href: "/", label: "대시보드", icon: LayoutDashboard },
      { href: "/attendance", label: "입퇴실 관리", icon: ClipboardList },
      { href: "/handover", label: "인수인계", icon: ArrowLeftRight },
      { href: "/todos", label: "투두리스트", icon: ListTodo },
    ],
  },
  {
    label: "원생",
    items: [
      { href: "/students", label: "원생 관리", icon: Users },
      { href: "/merit-demerit", label: "상벌점", icon: Star },
      { href: "/assignments", label: "과제 관리", icon: ClipboardCheck },
    ],
  },
  {
    label: "멘토링",
    items: [
      { href: "/mentoring", label: "멘토링", icon: MessageSquare },
      { href: "/timetable", label: "시간표", icon: LayoutList },
      { href: "/consultations", label: "원장 면담", icon: FileText },
      { href: "/mentoring/schedule", label: "멘토 스케줄", icon: Calendar },
    ],
  },
  {
    label: "운영",
    items: [
      { href: "/calendar", label: "캘린더", icon: CalendarDays },
      { href: "/meeting-minutes", label: "회의록", icon: NotebookText },
      { href: "/messages", label: "카카오 메시지", icon: MessageCircle },
    ],
  },
];

const directorSection: NavSection = {
  label: "관리자",
  items: [
    { href: "/mentors", label: "직원 관리", icon: UserCog },
    { href: "/reports", label: "월간 리포트", icon: BarChart3 },
    { href: "/analytics", label: "성과 분석", icon: TrendingUp },
  ],
};

export function AppSidebar({ role }: { role?: string }) {
  const pathname = usePathname();

  const allNavItems = [
    ...navSections.flatMap((s) => s.items),
    ...directorSection.items,
  ];

  const isActiveLink = (href: string) => {
    if (href === "/") return pathname === "/";
    const matches = pathname === href || pathname.startsWith(href + "/");
    if (!matches) return false;
    // 더 구체적인(긴) 경로의 항목이 현재 pathname과 매칭되면 이 항목은 비활성
    return !allNavItems.some(
      (item) =>
        item.href !== href &&
        item.href.length > href.length &&
        (pathname === item.href || pathname.startsWith(item.href + "/"))
    );
  };

  const renderLink = ({ href, label, icon: Icon }: NavItem) => {
    const isActive = isActiveLink(href);
    return (
      <Link
        key={href}
        href={href}
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
    <aside className="fixed left-0 top-0 h-screen w-[240px] bg-white border-r border-[#e1e2e4] flex flex-col">
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

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[#e1e2e4] shrink-0">
        <p className="text-[11px] text-[#b1b8be] text-center">v2.0</p>
      </div>
    </aside>
  );
}
