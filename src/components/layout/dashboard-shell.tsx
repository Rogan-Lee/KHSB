"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";
import type { Role } from "@/generated/prisma";

interface DashboardShellProps {
  user: { name: string; email: string; role: Role };
  children: React.ReactNode;
}

export function DashboardShell({ user, children }: DashboardShellProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar — 인쇄 시 숨김 */}
      <div className="hidden md:block print:!hidden">
        <AppSidebar role={user.role} />
      </div>

      {/* Mobile sidebar (Sheet) */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="p-0 w-[240px] [&>button]:hidden">
          <VisuallyHidden><SheetTitle>내비게이션 메뉴</SheetTitle></VisuallyHidden>
          <AppSidebar role={user.role} mobile onClose={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="md:ml-[240px] print:!ml-0 flex flex-col min-h-screen">
        <div className="print:hidden">
          <AppHeader
            user={user}
            title="독서실 관리 시스템"
            onMenuClick={() => setOpen(true)}
          />
        </div>
        <main className="flex-1 p-4 md:p-6 print:!p-0 max-w-[1400px] print:!max-w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
