"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  MessageSquare,
  BarChart3,
  Star,
  ArrowLeftRight,
  FileText,
  CalendarClock,
  Search,
} from "lucide-react";

const pages = [
  { label: "대시보드", href: "/", icon: LayoutDashboard, shortcut: "1" },
  { label: "입퇴실 관리", href: "/attendance", icon: ClipboardList },
  { label: "원생 관리", href: "/students", icon: Users, shortcut: "2" },
  { label: "멘토링", href: "/mentoring", icon: MessageSquare },
  { label: "주간 멘토링 계획", href: "/mentoring-plan", icon: CalendarClock, shortcut: "3" },
  { label: "인수인계", href: "/handover", icon: ArrowLeftRight },
  { label: "상벌점", href: "/merit-demerit", icon: Star },
  { label: "면담 관리", href: "/consultations", icon: FileText },
  { label: "월간 리포트", href: "/reports", icon: BarChart3, shortcut: "4" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function navigate(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="빠른 이동 · 원생 검색..." />
      <CommandList>
        <CommandEmpty>검색 결과 없음</CommandEmpty>
        <CommandGroup heading="페이지">
          {pages.map((p) => {
            const Icon = p.icon;
            return (
              <CommandItem
                key={p.href}
                onSelect={() => navigate(p.href)}
                className="gap-2.5"
              >
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span>{p.label}</span>
                {p.shortcut && (
                  <kbd className="ml-auto font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {p.shortcut}
                  </kbd>
                )}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export function CommandTrigger({ className }: { className?: string }) {
  return (
    <button
      onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
      className={className}
    >
      <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="flex-1 text-left text-xs text-muted-foreground">빠른 이동 · 원생 검색</span>
      <kbd className="font-mono text-[10px] text-muted-foreground bg-muted border border-border px-1.5 py-0.5 rounded">
        ⌘K
      </kbd>
    </button>
  );
}
