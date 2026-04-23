"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";
import { CommandPalette } from "@/components/ui/command-palette";
import { getCurrentPlan } from "@/lib/features";
import type { Role } from "@/generated/prisma";
import { cn } from "@/lib/utils";

interface DashboardShellProps {
  user: { name: string; email: string; role: Role };
  children: React.ReactNode;
}

const SIDEBAR_COLLAPSED_KEY = "sidebarCollapsed";

export function DashboardShell({ user, children }: DashboardShellProps) {
  const plan = getCurrentPlan();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // localStorage에서 초기 상태 복원 (mount 후 1회)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (saved === "true") setCollapsed(true);
  }, []);

  // collapsed 상태 변경 시 localStorage 저장
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  return (
    <div className="min-h-screen bg-background">
      <CommandPalette />
      {/* Desktop sidebar */}
      <div className="hidden md:block" data-print-hide>
        <AppSidebar role={user.role} plan={plan} collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      </div>

      {/* Mobile sidebar (Sheet) — 접기 기능 미적용, 항상 펼침 */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="p-0 w-[240px] [&>button]:hidden">
          <VisuallyHidden><SheetTitle>내비게이션 메뉴</SheetTitle></VisuallyHidden>
          <AppSidebar role={user.role} plan={plan} mobile onClose={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main content — header + content sit inside one panel, clearly separated from the canvas sidebar */}
      <div
        className={cn(
          "flex flex-col min-h-screen transition-[margin] duration-300",
          collapsed ? "md:ml-16" : "md:ml-[240px]"
        )}
        data-print-main
      >
        <div className="flex-1 p-3 md:p-3.5" data-print-content>
          <main className="h-full bg-panel border border-line rounded-[14px] shadow-[var(--shadow-xs)] overflow-hidden max-w-[1400px] flex flex-col">
            <div data-print-hide className="border-b border-line-2">
              <AppHeader
                user={user}
                title="독서실 관리 시스템"
                onMenuClick={() => setOpen(true)}
              />
            </div>
            <div className="flex-1 p-4 md:px-[22px] md:py-[20px]">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
