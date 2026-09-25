"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  getChatMessages,
  sendChatMessage,
  markChatRead,
} from "@/actions/online/portal-chat";
import { Avatar } from "@/components/portal/ui";
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
  containerVariant = "student",
}: {
  chatId: string;
  studentToken?: string;
  viewer: "STUDENT" | "STAFF";
  initialMessages: ChatMessageView[];
  partnerName: string;
  partnerLabel?: string;
  containerVariant?: "student" | "staff";
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

  if (containerVariant === "student") {
    // 학생 포털 push 화면 — 탭바 없음, 헤더 56px + safe-area-top.
    // main 의 pt-1 / pb-8 과 셸의 safe-area-bottom 패딩을 상쇄해 화면을 꽉 채운다
    // (composer 가 safe-area-bottom 을 직접 패딩).
    return (
      <div
        className="-mx-4 -mt-1 flex flex-col"
        style={{
          height: "calc(100svh - 56px - env(safe-area-inset-top))",
          marginBottom: "calc(-2rem - env(safe-area-inset-bottom))",
        }}
      >
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overscroll-contain bg-bg-layer-basement px-x4 pb-x4"
        >
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-x6 pb-x10 text-center">
              <Avatar name={partnerName} size={56} />
              <p className="mt-x4 t6-bold text-fg-neutral">
                {partnerName}
                {partnerLabel ? ` ${partnerLabel}` : ""}님께
                <br />
                메시지를 보내보세요
              </p>
              <p className="mt-x1_5 t4-regular text-fg-neutral-subtle">
                질문이나 도움이 필요한 내용을
                <br />
                편하게 남겨 주세요.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center pb-x2 pt-x6 text-center">
                <Avatar name={partnerName} size={48} />
                <p className="mt-x2 t5-bold text-fg-neutral">{partnerName}</p>
                {partnerLabel && (
                  <p className="t3-regular text-fg-neutral-subtle">{partnerLabel}</p>
                )}
              </div>
              {grouped.map((g) => (
                <section key={g.dayKey}>
                  <div className="flex justify-center pb-x3 pt-x5">
                    <span className="rounded-full bg-bg-neutral-weak px-x3 py-x1 t2-medium text-fg-neutral-subtle">
                      {g.dayLabel}
                    </span>
                  </div>
                  <BubbleStack items={g.items} viewer={viewer} portal />
                </section>
              ))}
            </>
          )}
        </div>

        <ChatComposer
          chatId={chatId}
          studentToken={studentToken}
          onSend={handleSend}
          variant="portal"
        />
      </div>
    );
  }

  // 직원 화면 — 부모(InboxFrame)가 높이를 정하고, 메시지 영역만 스크롤한다
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Messages scroll area */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-bg-layer-fill px-x4 pb-x4 md:px-x6"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-x6 text-center">
            <Avatar name={partnerName} size={48} />
            <p className="mt-x4 t5-bold text-fg-neutral">대화를 시작해 보세요</p>
            <p className="mt-x1_5 t4-regular text-fg-neutral-subtle">
              {partnerName}
              {partnerLabel ? ` ${partnerLabel}` : ""}에게 첫 메시지를 보내 보세요.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col">
            {grouped.map((g) => (
              <section key={g.dayKey}>
                <div className="flex items-center gap-x3 pb-x3 pt-x5" role="separator">
                  <span className="h-px flex-1 bg-stroke-neutral-muted" aria-hidden />
                  <span className="t2-medium text-fg-neutral-subtle">{g.dayLabel}</span>
                  <span className="h-px flex-1 bg-stroke-neutral-muted" aria-hidden />
                </div>
                <BubbleStack items={g.items} viewer={viewer} />
              </section>
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
  portal = false,
}: {
  items: ChatMessageView[];
  viewer: "STUDENT" | "STAFF";
  portal?: boolean;
}) {
  return (
    <div className="flex flex-col gap-x1">
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
        if (portal) {
          // 보낸 사람이 바뀌는 지점에 여백 — 같은 사람 연속 메시지는 촘촘하게
          return (
            <div key={m.id} className={!sameAsPrev && idx > 0 ? "pt-x2_5" : undefined}>
              <ChatBubble
                message={m}
                viewer={viewer}
                showAvatar={!sameAsPrev}
                showTime={!sameAsNext}
                variant="portal"
              />
            </div>
          );
        }
        // 직원 화면도 보낸 사람이 바뀌는 지점에만 여백을 둔다
        return (
          <div key={m.id} className={!sameAsPrev && idx > 0 ? "pt-x3" : undefined}>
            <ChatBubble
              message={m}
              viewer={viewer}
              showAvatar={!sameAsPrev}
              showTime={!sameAsNext}
            />
          </div>
        );
      })}
    </div>
  );
}
