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
  GraduationCap,
  FileText,
  MessageCircle,
  BarChart3,
  LayoutDashboard,
} from "lucide-react";

const navItems = [
  { href: "/", label: "대시보드", icon: LayoutDashboard },
  { href: "/students", label: "원생 관리", icon: Users },
  { href: "/attendance", label: "입퇴실 관리", icon: ClipboardList },
  { href: "/merit-demerit", label: "상벌점", icon: Star },
  { href: "/mentoring", label: "멘토링", icon: MessageSquare },
  { href: "/academic-plans", label: "학업 플래닝", icon: GraduationCap },
  { href: "/consultations", label: "원장 면담", icon: FileText },
  { href: "/messages", label: "카카오 메시지", icon: MessageCircle },
  { href: "/reports", label: "월간 리포트", icon: BarChart3 },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-card border-r flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b">
        <div className="p-1.5 rounded-lg bg-primary/10">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="font-semibold text-sm">독서실 관리</p>
          <p className="text-xs text-muted-foreground">Study Room Manager</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
