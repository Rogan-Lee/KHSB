"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";

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

function avatarTone(name: string): string {
  const code = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return `av-tone-${(code % 6) + 1}`;
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

  return (
    <div className={`flex flex-col ${className}`}>
      <header className="border-b border-line bg-panel px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-[15px] font-semibold text-ink">학생 메시지</h1>
          {totalUnread > 0 && (
            <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-brand px-2 text-[11px] font-bold text-white">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11.5px] text-ink-4">
          {staffRole && ROLE_HINT[staffRole]
            ? ROLE_HINT[staffRole]
            : `${chats.length}명`}
          {chats.length > 0 ? ` · ${chats.length}명과 대화 중` : ""}
        </p>
      </header>

      <div className="flex-1 overflow-y-auto">
        {chats.length === 0 ? (
          <div className="grid h-full place-items-center px-6 text-center">
            <div>
              <MessageCircle className="mx-auto h-8 w-8 text-ink-5" />
              <p className="mt-3 text-[13px] font-semibold text-ink-2">
                담당 학생이 없어요
              </p>
              <p className="mt-1 text-[11.5px] text-ink-4">
                학생에게 컨설턴트·관리멘토·운영조교로 배정되면 메시지방이 생깁니다.
              </p>
            </div>
          </div>
        ) : (
          <ul>
            {chats.map((c) => {
              const isActive = c.id === activeId;
              const tone = avatarTone(c.student.name);
              const lastIsMine = c.lastMessage?.senderType === "STAFF";
              const previewBase = c.lastMessage?.hasAttachments
                ? "📎 첨부파일"
                : c.lastMessage?.content;
              const preview = c.lastMessage
                ? lastIsMine
                  ? `나: ${previewBase}`
                  : previewBase
                : "메시지 없음";
              return (
                <li key={c.id}>
                  <Link
                    href={`/online/inbox/${c.id}`}
                    className={`flex items-center gap-3 border-b border-line-2 px-4 py-3 transition-colors ${
                      isActive
                        ? "bg-canvas-2"
                        : "bg-panel hover:bg-canvas-2/60"
                    }`}
                  >
                    <span
                      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white ${tone}`}
                      aria-hidden
                    >
                      {c.student.name.slice(0, 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[13.5px] font-semibold text-ink">
                          {c.student.name}
                        </p>
                        <span className="shrink-0 text-[10.5px] text-ink-5">
                          {c.student.grade}
                          {c.student.school ? ` · ${c.student.school}` : ""}
                        </span>
                        <span className="ml-auto shrink-0 text-[10.5px] tabular-nums text-ink-5">
                          {timeAgo(c.lastMessageAt)}
                        </span>
                      </div>
                      <p
                        className={`mt-0.5 truncate text-[12px] ${
                          c.unread > 0 ? "font-semibold text-ink-2" : "text-ink-4"
                        }`}
                      >
                        {preview}
                      </p>
                    </div>
                    {c.unread > 0 && (
                      <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand px-1.5 text-[10.5px] font-bold tabular-nums text-white">
                        {c.unread > 99 ? "99+" : c.unread}
                      </span>
                    )}
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
