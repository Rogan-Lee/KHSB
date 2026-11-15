"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessagesSquare } from "lucide-react";
import { getFamilyChat, sendFamilyChatMessage } from "@/actions/family-chat";
import type { FamilyChatMessageView } from "@/lib/family-chat";
import { EmptyState } from "@/components/backoffice/ui";
import { ChatBubble } from "@/components/online/chat/chat-bubble";
import { ChatComposer } from "@/components/online/chat/chat-composer";
import { dayKey, dayLabel, pollSince } from "@/components/online/chat/chat-view";

const POLL_INTERVAL_MS = 5000;

/** 운영진 화면의 가족 톡방 대화 — 학생 메시지 ChatView 와 같은 폴링·묶음 규칙 */
export function FamilyChatView({
  studentId,
  chatId,
  initialMessages,
  initialHasMore,
}: {
  studentId: string;
  chatId: string;
  initialMessages: FamilyChatMessageView[];
  initialHasMore: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef(new Set(initialMessages.map((m) => m.id)));
  const latestAt = useRef<string | null>(initialMessages.at(-1)?.createdAt ?? null);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    el?.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  /** 마지막으로 받은 시각 이후 것만 받아 붙인다 (겹쳐 받은 것은 id 로 거른다) */
  const fetchNewer = useCallback(async () => {
    const data = await getFamilyChat({ studentId, after: pollSince(latestAt.current) });
    const fresh = data.messages.filter((m) => !seenIds.current.has(m.id));
    if (fresh.length === 0) return false;
    for (const m of fresh) {
      seenIds.current.add(m.id);
      if (!latestAt.current || m.createdAt > latestAt.current) latestAt.current = m.createdAt;
    }
    setMessages((prev) => [...prev, ...fresh]);
    requestAnimationFrame(() => scrollToBottom(true));
    return true;
  }, [studentId, scrollToBottom]);

  useEffect(() => {
    scrollToBottom(false);
  }, [scrollToBottom]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      if (!active) return;
      try {
        if (!document.hidden) await fetchNewer();
      } catch {
        // 일시적 네트워크 오류 — 다음 차례에 다시
      } finally {
        if (active) timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };
    timer = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [fetchNewer]);

  const loadOlder = async () => {
    const oldest = messages[0]?.createdAt;
    const el = scrollRef.current;
    if (!oldest || !el || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const data = await getFamilyChat({ studentId, before: oldest });
      const older = data.messages.filter((m) => !seenIds.current.has(m.id));
      for (const m of older) seenIds.current.add(m.id);
      // 위에 붙인 만큼 스크롤을 내려 보던 자리를 지킨다
      const fromBottom = el.scrollHeight - el.scrollTop;
      flushSync(() => {
        setMessages((prev) => [...older, ...prev]);
        setHasMore(data.hasMore);
      });
      el.scrollTop = el.scrollHeight - fromBottom;
    } catch {
      toast.error("이전 메시지를 불러오지 못했어요");
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleSend = async ({ content, attachments }: { content: string; attachments: FamilyChatMessageView["attachments"] }) => {
    await sendFamilyChatMessage({ studentId, content, attachments });
    await fetchNewer().catch(() => {});
    router.refresh(); // 왼쪽 목록의 마지막 메시지·순서 갱신
  };

  const grouped: { key: string; label: string; items: FamilyChatMessageView[] }[] = [];
  for (const m of messages) {
    const d = new Date(m.createdAt);
    const key = dayKey(d);
    let bucket = grouped.at(-1);
    if (!bucket || bucket.key !== key) {
      bucket = { key, label: dayLabel(d), items: [] };
      grouped.push(bucket);
    }
    bucket.items.push(m);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-bg-layer-fill px-x4 pb-x4 md:px-x6"
      >
        {messages.length === 0 ? (
          <EmptyState
            icon={MessagesSquare}
            title="아직 대화가 없어요"
            description="가족에게 첫 메시지를 보내 보세요."
            className="h-full"
          />
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col">
            {hasMore && (
              <button
                type="button"
                onClick={loadOlder}
                disabled={loadingOlder}
                className="mx-auto mt-x4 rounded-full bg-bg-layer-default px-x3 py-x1_5 t3-medium text-fg-neutral-muted shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-muted)] transition-colors hover:bg-bg-layer-default-pressed disabled:text-fg-disabled"
              >
                {loadingOlder ? "불러오는 중" : "이전 메시지 더 보기"}
              </button>
            )}
            {grouped.map((g) => (
              <section key={g.key}>
                <div className="flex items-center gap-x3 pb-x3 pt-x5" role="separator">
                  <span className="h-px flex-1 bg-stroke-neutral-muted" aria-hidden />
                  <span className="t2-medium text-fg-neutral-subtle">{g.label}</span>
                  <span className="h-px flex-1 bg-stroke-neutral-muted" aria-hidden />
                </div>
                <MessageStack items={g.items} />
              </section>
            ))}
          </div>
        )}
      </div>

      <ChatComposer
        chatId={chatId}
        onSend={handleSend}
        uploadFields={{ context: "family-chat", studentId }}
      />
    </div>
  );
}

const senderKey = (m: FamilyChatMessageView) => `${m.senderKind}:${m.senderId}`;

function MessageStack({ items }: { items: FamilyChatMessageView[] }) {
  return (
    <div className="flex flex-col gap-x1">
      {items.map((m, idx) => {
        if (m.senderKind === "SYSTEM") {
          return (
            <p
              key={m.id}
              className="mx-auto my-x1 max-w-[80%] whitespace-pre-wrap rounded-r2 bg-bg-neutral-weak px-x3 py-x1 text-center t2-regular text-fg-neutral-subtle"
            >
              {m.content}
            </p>
          );
        }
        const prev = items[idx - 1];
        const next = items[idx + 1];
        // 같은 사람이 1분 안에 이어 쓰면 아바타·이름은 첫 줄에만, 시간은 마지막 줄에만
        const sameAsPrev =
          !!prev && senderKey(prev) === senderKey(m) && Date.parse(m.createdAt) - Date.parse(prev.createdAt) < 60_000;
        const sameAsNext =
          !!next && senderKey(next) === senderKey(m) && Date.parse(next.createdAt) - Date.parse(m.createdAt) < 60_000;
        return (
          <div key={m.id} className={!sameAsPrev && idx > 0 ? "pt-x3" : undefined}>
            {/* ponytail: ChatBubble 은 senderType === viewer 로 좌우를 정한다 — 내 글만 STAFF 로 넘겨 오른쪽에 둔다 */}
            <ChatBubble
              message={{ ...m, senderType: m.mine ? "STAFF" : "STUDENT" }}
              viewer="STAFF"
              showAvatar={!sameAsPrev}
              showTime={!sameAsNext}
              authorLabel={m.senderName}
            />
          </div>
        );
      })}
    </div>
  );
}
