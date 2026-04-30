"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  getChatMessages,
  sendChatMessage,
  markChatRead,
} from "@/actions/online/portal-chat";
import { ChatBubble, type ChatMessageView } from "./chat-bubble";
import { ChatComposer } from "./chat-composer";

const POLL_INTERVAL_MS = 5000;

function dayKey(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${kst.getUTCMonth()}-${kst.getUTCDate()}`;
}

function dayLabel(d: Date): string {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const kstD = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const sameDay = (a: Date, b: Date) =>
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate();
  if (sameDay(kstNow, kstD)) return "오늘";
  const kstYesterday = new Date(kstNow.getTime() - 24 * 60 * 60 * 1000);
  if (sameDay(kstYesterday, kstD)) return "어제";
  if (kstNow.getUTCFullYear() === kstD.getUTCFullYear()) {
    return `${kstD.getUTCMonth() + 1}월 ${kstD.getUTCDate()}일`;
  }
  return `${kstD.getUTCFullYear()}. ${kstD.getUTCMonth() + 1}. ${kstD.getUTCDate()}`;
}

export function ChatView({
  chatId,
  studentToken,
  viewer,
  initialMessages,
  partnerName,
  partnerLabel,
}: {
  chatId: string;
  studentToken?: string;
  viewer: "STUDENT" | "STAFF";
  initialMessages: ChatMessageView[];
  partnerName: string;
  partnerLabel?: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessageView[]>(initialMessages);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef(new Set(initialMessages.map((m) => m.id)));

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  // initial scroll
  useEffect(() => {
    scrollToBottom(false);
  }, [scrollToBottom]);

  // polling
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (!active) return;
      if (typeof document !== "undefined" && document.hidden) {
        timer = setTimeout(tick, POLL_INTERVAL_MS);
        return;
      }
      try {
        const data = await getChatMessages({ chatId, studentToken });
        if (!active) return;
        const fresh = data.messages.filter(
          (m: ChatMessageView) => !seenIds.current.has(m.id)
        );
        if (fresh.length > 0) {
          for (const m of fresh) seenIds.current.add(m.id);
          setMessages((prev) => [...prev, ...fresh]);
          // mark read since new staff message arrived (and if scrolled near bottom)
          if (viewer === "STUDENT" && fresh.some((m: ChatMessageView) => m.senderType === "STAFF")) {
            markChatRead({ chatId, studentToken }).catch(() => {});
          }
          if (viewer === "STAFF" && fresh.some((m: ChatMessageView) => m.senderType === "STUDENT")) {
            markChatRead({ chatId }).catch(() => {});
          }
          requestAnimationFrame(() => scrollToBottom(true));
        }
      } catch {
        // network blip — try again next tick
      } finally {
        if (active) timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };
    timer = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [chatId, studentToken, viewer, scrollToBottom]);

  // mark read on mount (in case server-side missed it)
  useEffect(() => {
    markChatRead({ chatId, studentToken })
      .then(() => router.refresh())
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = async ({
    content,
    attachments,
  }: {
    content: string;
    attachments: ChatMessageView["attachments"];
  }) => {
    try {
      await sendChatMessage({
        chatId,
        studentToken,
        content,
        attachments,
      });
      // refetch
      const data = await getChatMessages({ chatId, studentToken });
      const fresh = data.messages.filter(
        (m: ChatMessageView) => !seenIds.current.has(m.id)
      );
      for (const m of fresh) seenIds.current.add(m.id);
      if (fresh.length > 0) {
        setMessages((prev) => [...prev, ...fresh]);
      }
      requestAnimationFrame(() => scrollToBottom(true));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "전송 실패");
      throw err;
    }
  };

  // Group messages by day, then by minute for time clustering
  const grouped: Array<{ dayKey: string; dayLabel: string; items: ChatMessageView[] }> = [];
  for (const m of messages) {
    const d = new Date(m.createdAt);
    const key = dayKey(d);
    let bucket = grouped[grouped.length - 1];
    if (!bucket || bucket.dayKey !== key) {
      bucket = { dayKey: key, dayLabel: dayLabel(d), items: [] };
      grouped.push(bucket);
    }
    bucket.items.push(m);
  }

  return (
    <div className="-mx-4 -mt-3 flex h-[calc(100svh-3rem-env(safe-area-inset-top)-64px-env(safe-area-inset-bottom))] flex-col">
      {/* Header bar with partner info */}
      <div className="border-b border-line bg-panel/85 px-4 py-2.5 backdrop-blur-md">
        <p className="text-[14px] font-semibold leading-tight text-ink">
          {partnerName}
        </p>
        {partnerLabel && (
          <p className="text-[11px] text-ink-4">{partnerLabel}</p>
        )}
      </div>

      {/* Messages scroll area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-canvas px-3 py-3"
      >
        {messages.length === 0 ? (
          <div className="grid h-full place-items-center px-4 text-center">
            <div>
              <p className="text-[13px] font-semibold text-ink-3">
                대화를 시작해 보세요
              </p>
              <p className="mt-1 text-[11.5px] text-ink-4">
                질문이나 도움이 필요한 내용을 자유롭게 남겨 주세요.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {grouped.map((g) => (
              <div key={g.dayKey} className="space-y-2">
                <div className="flex items-center justify-center">
                  <span className="rounded-full bg-canvas-2 px-2.5 py-0.5 text-[10.5px] font-semibold text-ink-4">
                    {g.dayLabel}
                  </span>
                </div>
                <BubbleStack items={g.items} viewer={viewer} />
              </div>
            ))}
          </div>
        )}
      </div>

      <ChatComposer
        chatId={chatId}
        studentToken={studentToken}
        onSend={handleSend}
      />
    </div>
  );
}

function BubbleStack({
  items,
  viewer,
}: {
  items: ChatMessageView[];
  viewer: "STUDENT" | "STAFF";
}) {
  return (
    <div className="space-y-1.5">
      {items.map((m, idx) => {
        const prev = idx > 0 ? items[idx - 1] : null;
        const next = idx < items.length - 1 ? items[idx + 1] : null;
        // Same sender as previous within 1 min → hide avatar (continuation)
        const sameAsPrev =
          prev &&
          prev.senderType === m.senderType &&
          new Date(m.createdAt).getTime() -
            new Date(prev.createdAt).getTime() <
            60_000;
        // Same sender as next within 1 min → hide time (will be shown on last)
        const sameAsNext =
          next &&
          next.senderType === m.senderType &&
          new Date(next.createdAt).getTime() -
            new Date(m.createdAt).getTime() <
            60_000;
        return (
          <ChatBubble
            key={m.id}
            message={m}
            viewer={viewer}
            showAvatar={!sameAsPrev}
            showTime={!sameAsNext}
          />
        );
      })}
    </div>
  );
}
