"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  ClipboardList,
  MessageSquare,
  MessageCircle,
  SpellCheck,
  HelpCircle,
  Megaphone,
  type LucideIcon,
} from "lucide-react";

type Tab = {
  key: string;
  href: string;
  match: (path: string) => boolean;
  label: string;
  Icon: LucideIcon;
  badge?: number;
};

const COLS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
  7: "grid-cols-7",
};

export function StudentBottomNav({
  token,
  taskBadge,
  chatBadge,
  feedbackBadge,
  vocabBadge,
  hasVocab,
  questionBadge,
  suggestionBadge,
  isOnlineManaged,
}: {
  token: string;
  taskBadge?: number;
  chatBadge?: number;
  feedbackBadge?: number;
  vocabBadge?: number;
  hasVocab?: boolean;
  questionBadge?: number;
  suggestionBadge?: number;
  isOnlineManaged?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const root = `/s/${token}`;

  const tabs: Tab[] = [
    { key: "home", href: root, match: (p) => p === root, label: "홈", Icon: Home },
  ];
  if (isOnlineManaged) {
    tabs.push({ key: "tasks", href: `${root}/tasks`, match: (p) => p.startsWith(`${root}/tasks`), label: "수행평가", Icon: ClipboardList, badge: taskBadge });
  }
  if (hasVocab) {
    tabs.push({ key: "vocab", href: `${root}/vocab`, match: (p) => p.startsWith(`${root}/vocab`), label: "영단어", Icon: SpellCheck, badge: vocabBadge });
  }
  tabs.push({ key: "qna", href: `${root}/qna`, match: (p) => p.startsWith(`${root}/qna`), label: "질문", Icon: HelpCircle, badge: questionBadge });
  tabs.push({ key: "suggestions", href: `${root}/suggestions`, match: (p) => p.startsWith(`${root}/suggestions`), label: "건의", Icon: Megaphone, badge: suggestionBadge });
  if (isOnlineManaged) {
    tabs.push(
      { key: "chat", href: `${root}/chat`, match: (p) => p.startsWith(`${root}/chat`), label: "메시지", Icon: MessageSquare, badge: chatBadge },
      { key: "feedback", href: `${root}/feedback`, match: (p) => p.startsWith(`${root}/feedback`), label: "피드백", Icon: MessageCircle, badge: feedbackBadge },
    );
  }

  const cols = COLS[Math.min(6, Math.max(2, tabs.length))] ?? "grid-cols-4";

  return (
    <nav
      aria-label="학생 포털 메뉴"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-line bg-panel/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className={`mx-auto grid max-w-[480px] ${cols}`}>
        {tabs.map(({ key, href, match, label, Icon, badge }) => {
          const active = match(pathname);
          const showBadge = (badge ?? 0) > 0;
          return (
            <li key={key} className="flex">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[10.5px] font-medium transition-colors ${
                  active ? "text-brand" : "text-ink-4 hover:text-ink-2"
                }`}
              >
                <span className="relative">
                  <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 2} />
                  {showBadge && (
                    <span className="absolute -right-1.5 -top-1 inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-brand px-1 text-[9.5px] font-semibold leading-none text-white">
                      {badge! > 9 ? "9+" : badge}
                    </span>
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
