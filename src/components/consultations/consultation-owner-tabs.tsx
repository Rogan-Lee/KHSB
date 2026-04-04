"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "DIRECTOR", label: "원장 면담", href: "/consultations" },
  { key: "HEAD_TEACHER", label: "책임T 면담", href: "/consultations?owner=HEAD_TEACHER" },
] as const;

export function ConsultationOwnerTabs({ current }: { current: string }) {
  return (
    <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 border w-fit">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={cn(
            "px-4 py-1.5 text-sm font-medium rounded-md transition-colors",
            current === tab.key
              ? "bg-white shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
