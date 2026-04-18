"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";
import { CommandPalette } from "@/components/ui/command-palette";
import { getCurrentPlan } from "@/lib/features";
import type { Role } from "@/generated/prisma";

interface DashboardShellProps {
  user: { name: string; email: string; role: Role };
  children: React.ReactNode;
}

export function DashboardShell({ user, children }: DashboardShellProps) {
  const plan = getCurrentPlan();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <CommandPalette />
      {/* Desktop sidebar */}
      <div className="hidden md:block" data-print-hide>
        <AppSidebar role={user.role} plan={plan} />
      </div>

      {/* Mobile sidebar (Sheet) */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="p-0 w-[240px] [&>button]:hidden">
          <VisuallyHidden><SheetTitle>내비게이션 메뉴</SheetTitle></VisuallyHidden>
          <AppSidebar role={user.role} plan={plan} mobile onClose={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="md:ml-[224px] flex flex-col min-h-screen" data-print-main>
        <div data-print-hide>
          <AppHeader
            user={user}
            title="독서실 관리 시스템"
            onMenuClick={() => setOpen(true)}
          />
        </div>
        <main className="flex-1 p-4 md:p-[18px] max-w-[1400px]" data-print-content>
          {children}
        </main>
      </div>
    </div>
  );
}
