"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessagesSquare, SearchX } from "lucide-react";
import type { listFamilyChatsForStaff } from "@/lib/family-chat";
import { Avatar, EmptyState, FilterChip, SearchField, StatusBadge } from "@/components/backoffice/ui";
import { timeAgo } from "@/components/online/chat/inbox-list-panel";
import { useStickyState } from "@/hooks/use-sticky-state";
import { cn } from "@/lib/utils";

export type FamilyRoom = Awaited<ReturnType<typeof listFamilyChatsForStaff>>[number];

export function FamilyRoomList({ rooms }: { rooms: FamilyRoom[] }) {
  const pathname = usePathname() ?? "";
  const activeId = pathname.startsWith("/family-chat/") ? pathname.split("/")[2] : null;
  const [query, setQuery] = useStickyState("family-chat:query", "");
  const [mineOnly, setMineOnly] = useStickyState("family-chat:mine", false);

  const mineCount = useMemo(() => rooms.filter((r) => r.isMine).length, [rooms]);
  const unreadCount = useMemo(() => rooms.filter((r) => r.unread).length, [rooms]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rooms.filter((r) => (!mineOnly || r.isMine) && (!q || r.name.toLowerCase().includes(q)));
  }, [rooms, query, mineOnly]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="shrink-0 border-b border-stroke-neutral-muted px-x4 pb-x3 pt-x4">
        <div className="flex items-center justify-between gap-x2">
          <p className="t4-bold text-fg-neutral">
            재원생
            <span className="ml-x1_5 tabular-nums text-fg-neutral-subtle">{rooms.length}</span>
          </p>
          {unreadCount > 0 && (
            <span className="t3-medium tabular-nums text-fg-brand">안 읽은 방 {unreadCount}</span>
          )}
        </div>
        {rooms.length > 0 && (
          <div className="mt-x3 flex items-center gap-x2">
            <SearchField
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onClear={() => setQuery("")}
              placeholder="학생 이름 검색"
              aria-label="학생 이름 검색"
              className="sm:w-full"
            />
            <FilterChip selected={mineOnly} count={mineCount} onClick={() => setMineOnly((v) => !v)}>
              내 담당만
            </FilterChip>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {rooms.length === 0 ? (
          <EmptyState
            compact
            icon={MessagesSquare}
            title="재원생이 없어요"
            description="재원 중인 학생마다 톡방이 하나씩 생겨요."
            className="h-full"
          />
        ) : visible.length === 0 ? (
          <EmptyState
            compact
            icon={SearchX}
            title={mineOnly && !query.trim() ? "담당 학생이 없어요" : "일치하는 학생이 없어요"}
            description={mineOnly ? "'내 담당만'을 끄면 전체 학생이 보여요." : "이름을 다시 확인해 주세요."}
          />
        ) : (
          <ul className="py-x1">
            {visible.map((r) => {
              const isActive = r.studentId === activeId;
              const meta = [r.grade, r.school].filter(Boolean).join(" · ");
              return (
                <li key={r.studentId}>
                  <Link
                    href={`/family-chat/${r.studentId}`}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-x3 px-x4 py-x3 transition-colors",
                      isActive ? "bg-bg-neutral-weak" : "hover:bg-bg-layer-default-pressed",
                    )}
                  >
                    <Avatar name={r.name} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-x1_5">
                        <span className="truncate t4-bold text-fg-neutral">{r.name}</span>
                        {r.isOnlineManaged && <StatusBadge tone="info">온라인</StatusBadge>}
                        <span className="min-w-0 truncate t2-regular text-fg-neutral-subtle">{meta}</span>
                        <span className="ml-auto shrink-0 pl-x1 t2-regular tabular-nums text-fg-placeholder">
                          {timeAgo(r.lastMessageAt)}
                        </span>
                      </div>
                      <div className="mt-x0_5 flex items-center gap-x2">
                        <p
                          className={cn(
                            "min-w-0 flex-1 truncate",
                            r.unread ? "t3-medium text-fg-neutral" : "t3-regular text-fg-neutral-subtle",
                          )}
                        >
                          {r.lastMessage ? (
                            `${r.lastMessage.senderName}: ${r.lastMessage.content}`
                          ) : r.parentCount === 0 ? (
                            <span className="text-fg-placeholder">학부모 미연결</span>
                          ) : (
                            <span className="text-fg-placeholder">아직 메시지가 없어요</span>
                          )}
                        </p>
                        {r.lastMessage && r.parentCount === 0 && (
                          <span className="shrink-0 t2-regular text-fg-placeholder">학부모 미연결</span>
                        )}
                        {r.unread && (
                          <span className="size-x2 shrink-0 rounded-full bg-bg-brand-solid" aria-label="안 읽음" />
                        )}
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
