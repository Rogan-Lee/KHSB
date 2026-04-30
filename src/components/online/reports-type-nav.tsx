"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export function ReportsTypeNav({ current }: { current: "WEEKLY" | "MONTHLY" }) {
  return (
    <div className="inline-flex rounded-md border bg-muted/40 p-0.5 text-xs">
      <Link
        href="/online/reports"
        className={cn(
          "px-3 py-1 rounded font-medium transition-colors",
          current === "WEEKLY" ? "bg-background shadow-sm" : "text-muted-foreground"
        )}
      >
        주간 보고서
      </Link>
      <Link
        href="/online/reports/monthly"
        className={cn(
          "px-3 py-1 rounded font-medium transition-colors",
          current === "MONTHLY" ? "bg-background shadow-sm" : "text-muted-foreground"
        )}
      >
        월간 보고서
      </Link>
    </div>
  );
}
