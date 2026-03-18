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
  LayoutDashboard,
  Calendar,
  CalendarDays,
  UserCog,
  LayoutList,
  ArrowLeftRight,
} from "lucide-react";

type NavItem = { href: string; label: string; icon: React.ElementType };
type NavSection = { label?: string; items: NavItem[] };

const navSections: NavSection[] = [
  {
    items: [
      { href: "/", label: "대시보드", icon: LayoutDashboard },
    ],
  },
  {
    label: "원생",
    items: [
      { href: "/students", label: "원생 관리", icon: Users },
      { href: "/attendance", label: "입퇴실 관리", icon: ClipboardList },
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
      { href: "/messages", label: "카카오 메시지", icon: MessageCircle },
      { href: "/reports", label: "월간 리포트", icon: BarChart3 },
      { href: "/handover", label: "인수인계", icon: ArrowLeftRight },
    ],
  },
];

const directorSection: NavSection = {
  label: "관리자",
  items: [
    { href: "/mentors", label: "직원 관리", icon: UserCog },
  ],
};

export function AppSidebar({ role }: { role?: string }) {
  const pathname = usePathname();

  const renderLink = ({ href, label, icon: Icon }: NavItem) => {
    const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150",
          isActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        )}
      >
        <Icon className={cn("h-[15px] w-[15px] shrink-0", isActive ? "text-primary" : "")} />
        {label}
      </Link>
    );
  };

  const renderSection = ({ label, items }: NavSection, idx: number) => (
    <div key={idx} className={cn("space-y-0.5", idx > 0 && "pt-3")}>
      {label && (
        <p className="px-3 pb-1 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
          {label}
        </p>
      )}
      {items.map(renderLink)}
    </div>
  );

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-sidebar border-r border-sidebar-border flex flex-col shadow-[1px_0_0_0_var(--sidebar-border)]">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-sidebar-border">
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-sm shrink-0">
          <BookOpen className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
        <div>
          <p className="font-semibold text-[13px] tracking-tight">KHSB BackOffice</p>
          <p className="text-[10px] text-muted-foreground/70 leading-none mt-0.5 tracking-wide">Admin System</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {navSections.map(renderSection)}
        {(role === "DIRECTOR" || role === "ADMIN") &&
          renderSection(directorSection, navSections.length)}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-sidebar-border">
        <p className="text-[11px] text-muted-foreground/50 text-center">v2.0</p>
      </div>
    </aside>
  );
}
