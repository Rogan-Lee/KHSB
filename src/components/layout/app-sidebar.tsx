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
} from "lucide-react";

const navItems = [
  { href: "/", label: "대시보드", icon: LayoutDashboard },
  { href: "/students", label: "원생 관리", icon: Users },
  { href: "/attendance", label: "입퇴실 관리", icon: ClipboardList },
  { href: "/merit-demerit", label: "상벌점", icon: Star },
  { href: "/mentoring", label: "멘토링", icon: MessageSquare },
  { href: "/mentoring/schedule", label: "멘토 스케줄", icon: Calendar },
  { href: "/calendar", label: "캘린더", icon: CalendarDays },
  { href: "/assignments", label: "과제 관리", icon: ClipboardCheck },
  { href: "/consultations", label: "원장 면담", icon: FileText },
  { href: "/messages", label: "카카오 메시지", icon: MessageCircle },
  { href: "/reports", label: "월간 리포트", icon: BarChart3 },
];

const directorItems = [
  { href: "/mentors", label: "직원 관리", icon: UserCog },
];

export function AppSidebar({ role }: { role?: string }) {
  const pathname = usePathname();

  const renderLink = ({ href, label, icon: Icon }: { href: string; label: string; icon: React.ElementType }) => {
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

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-sidebar border-r border-sidebar-border flex flex-col shadow-[1px_0_0_0_var(--sidebar-border)]">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-[18px] border-b border-sidebar-border">
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-sm shrink-0">
          <BookOpen className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
        <div>
          <p className="font-semibold text-[13px] tracking-tight">독서실 관리</p>
          <p className="text-[10px] text-muted-foreground/70 leading-none mt-0.5 tracking-wide">STUDY ROOM MANAGER</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {navItems.map(renderLink)}
        {role === "DIRECTOR" && (
          <>
            <div className="pt-2 pb-1 px-3">
              <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">운영 관리</p>
            </div>
            {directorItems.map(renderLink)}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-sidebar-border">
        <p className="text-[11px] text-muted-foreground/50 text-center">v2.0</p>
      </div>
    </aside>
  );
}
