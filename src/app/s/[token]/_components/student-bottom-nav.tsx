"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  ClipboardList,
  FileText,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";

type Tab = {
  href: (token: string) => string;
  match: (path: string, token: string) => boolean;
  label: string;
  Icon: LucideIcon;
  badgeCount?: number | null;
};

const TABS: readonly Tab[] = [
  {
    href: (t) => `/s/${t}`,
    match: (p, t) => p === `/s/${t}`,
    label: "홈",
    Icon: Home,
  },
  {
    href: (t) => `/s/${t}/tasks`,
    match: (p, t) => p.startsWith(`/s/${t}/tasks`),
    label: "수행평가",
    Icon: ClipboardList,
  },
  {
    href: (t) => `/s/${t}/survey`,
    match: (p, t) => p.startsWith(`/s/${t}/survey`),
    label: "설문",
    Icon: FileText,
  },
  {
    href: (t) => `/s/${t}/feedback`,
    match: (p, t) => p.startsWith(`/s/${t}/feedback`),
    label: "피드백",
    Icon: MessageCircle,
  },
] as const;

export function StudentBottomNav({
  token,
  taskBadge,
  surveyBadge,
}: {
  token: string;
  taskBadge?: number;
  surveyBadge?: "incomplete" | "submitted" | null;
}) {
  const pathname = usePathname() ?? "";

  return (
    <nav
      aria-label="학생 포털 메뉴"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-line bg-panel/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-[480px] grid-cols-4">
        {TABS.map(({ href, match, label, Icon }) => {
          const active = match(pathname, token);
          const isTask = label === "수행평가";
          const isSurvey = label === "설문";
          const showTaskBadge = isTask && (taskBadge ?? 0) > 0;
          const showSurveyDot =
            isSurvey && surveyBadge && surveyBadge !== "submitted";
          return (
            <li key={label} className="flex">
              <Link
                href={href(token)}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[10.5px] font-medium transition-colors ${
                  active ? "text-brand" : "text-ink-4 hover:text-ink-2"
                }`}
              >
                <span className="relative">
                  <Icon
                    className="h-[22px] w-[22px]"
                    strokeWidth={active ? 2.4 : 2}
                  />
                  {showTaskBadge && (
                    <span className="absolute -right-1.5 -top-1 inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-brand px-1 text-[9.5px] font-semibold leading-none text-white">
                      {taskBadge! > 9 ? "9+" : taskBadge}
                    </span>
                  )}
                  {showSurveyDot && (
                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand" />
                  )}
                </span>
                <span className="tracking-[-0.01em]">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
