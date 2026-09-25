"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, Paperclip, SearchX } from "lucide-react";
import { Avatar, CountBadge, EmptyState, SearchField } from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";

const ROLE_HINT: Record<string, string> = {
  CONSULTANT: "내 상담 학생",
  MANAGER_MENTOR: "내 관리 학생",
  STAFF: "내 운영 학생",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "방금";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}일`;
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCMonth() + 1}/${kst.getUTCDate()}`;
}

export type InboxChatItem = {
  id: string;
  student: { id: string; name: string; school: string | null; grade: string };
  lastMessage:
    | {
        content: string;
        senderType: "STUDENT" | "STAFF";
        createdAt: string;
        hasAttachments: boolean;
      }
    | null;
  lastMessageAt: string | null;
  unread: number;
};

export function InboxListPanel({
  chats,
  totalUnread,
  className = "",
  staffRole,
}: {
  chats: InboxChatItem[];
  totalUnread: number;
  className?: string;
  staffRole?: string;
}) {
  const pathname = usePathname() ?? "";
  const activeId = pathname.startsWith("/online/inbox/")
    ? pathname.split("/")[3]
    : null;
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((c) => c.student.name.toLowerCase().includes(q));
  }, [chats, query]);

  const heading = (staffRole && ROLE_HINT[staffRole]) || "대화 목록";

  return (
    <div className={cn("flex min-h-0 w-full flex-col", className)}>
      <div className="shrink-0 border-b border-stroke-neutral-muted px-x4 pb-x3 pt-x4">
        <div className="flex items-center justify-between gap-x2">
          <p className="t4-bold text-fg-neutral">
            {heading}
            <span className="ml-x1_5 tabular-nums text-fg-neutral-subtle">{chats.length}</span>
          </p>
          {totalUnread > 0 && (
            <span className="t3-medium tabular-nums text-fg-brand">
              안 읽음 {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </div>
        {chats.length > 0 && (
          <SearchField
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="학생 이름 검색"
            aria-label="학생 이름 검색"
            className="mt-x3 sm:w-full"
          />
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {chats.length === 0 ? (
          <EmptyState
            compact
            icon={MessageCircle}
            title="담당 학생이 없어요"
            description="학생에게 컨설턴트·관리멘토·운영조교로 배정되면 대화방이 생겨요."
            className="h-full"
          />
        ) : visible.length === 0 ? (
          <EmptyState
            compact
            icon={SearchX}
            title="일치하는 학생이 없어요"
            description="이름을 다시 확인해 주세요."
          />
        ) : (
          <ul className="py-x1">
            {visible.map((c) => {
              const isActive = c.id === activeId;
              const lastIsMine = c.lastMessage?.senderType === "STAFF";
              const hasUnread = c.unread > 0;
              return (
                <li key={c.id}>
                  <Link
                    href={`/online/inbox/${c.id}`}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-x3 px-x4 py-x3 transition-colors",
                      isActive
                        ? "bg-bg-neutral-weak"
                        : "hover:bg-bg-layer-default-pressed"
                    )}
                  >
                    <Avatar name={c.student.name} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-x1_5">
                        <span className="truncate t4-bold text-fg-neutral">
                          {c.student.name}
                        </span>
                        <span className="min-w-0 truncate t2-regular text-fg-neutral-subtle">
                          {c.student.grade}
                          {c.student.school ? ` · ${c.student.school}` : ""}
                        </span>
                        <span className="ml-auto shrink-0 pl-x1 t2-regular tabular-nums text-fg-placeholder">
                          {timeAgo(c.lastMessageAt)}
                        </span>
                      </div>
                      <div className="mt-x0_5 flex items-center gap-x2">
                        <p
                          className={cn(
                            "min-w-0 flex-1 truncate",
                            hasUnread
                              ? "t3-medium text-fg-neutral"
                              : "t3-regular text-fg-neutral-subtle"
                          )}
                        >
                          {c.lastMessage ? (
                            <>
                              {lastIsMine && "나: "}
                              {c.lastMessage.hasAttachments ? (
                                <>
                                  <Paperclip
                                    className="mr-x0_5 inline size-3.5 align-[-2px]"
                                    aria-hidden
                                  />
                                  첨부파일
                                </>
                              ) : (
                                c.lastMessage.content
                              )}
                            </>
                          ) : (
                            <span className="text-fg-placeholder">아직 메시지가 없어요</span>
                          )}
                        </p>
                        <CountBadge count={c.unread} />
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
