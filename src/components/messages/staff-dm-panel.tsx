"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { MessagesSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Avatar, CountBadge, EmptyState } from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";
import { ROLE_DISPLAY } from "@/lib/roles";
import {
  getThread,
  listMyThreads,
  sendStaffMessage,
} from "@/actions/staff-messages";

const POLL_INTERVAL_MS = 5000;

type StaffOption = { id: string; name: string; role: string };
type ThreadSummary = Awaited<ReturnType<typeof listMyThreads>>[number];
type ThreadDetail = Awaited<ReturnType<typeof getThread>>;

function timeShort(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  const h = kst.getUTCHours();
  const ampm = h < 12 ? "오전" : "오후";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${ampm} ${h12}:${kst.getUTCMinutes().toString().padStart(2, "0")}`;
}

function dateLabel(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const sameDay =
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate();
  if (sameDay) return timeShort(iso);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

export function StaffDmPanel({ staff }: { staff: StaffOption[] }) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [content, setContent] = useState("");
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshThreads = useCallback(async () => {
    try {
      setThreads(await listMyThreads());
    } catch {
      /* 폴링 실패는 다음 tick 에 재시도 */
    }
  }, []);

  const openThread = useCallback(
    async (otherUserId: string) => {
      setSelectedUserId(otherUserId);
      try {
        const data = await getThread(otherUserId);
        setDetail(data);
        refreshThreads();
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "대화를 불러오지 못했습니다");
      }
    },
    [refreshThreads]
  );

  // 초기 로드 + 5초 폴링 (열린 대화 갱신 + 목록 갱신)
  useEffect(() => {
    // setThreads 는 await 이후(비동기)에 호출돼 연쇄 렌더를 만들지 않는다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshThreads();
  }, [refreshThreads]);

  useEffect(() => {
    const timer = setInterval(async () => {
      if (document.hidden) return;
      refreshThreads();
      if (selectedUserId) {
        try {
          const data = await getThread(selectedUserId);
          setDetail((prev) => {
            if (prev && prev.messages.length !== data.messages.length) {
              requestAnimationFrame(() => {
                scrollRef.current?.scrollTo({
                  top: scrollRef.current.scrollHeight,
                  behavior: "smooth",
                });
              });
            }
            return data;
          });
        } catch {
          /* ignore */
        }
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [selectedUserId, refreshThreads]);

  const handleSend = () => {
    if (!selectedUserId || !content.trim() || isPending) return;
    const text = content;
    startTransition(async () => {
      try {
        await sendStaffMessage(selectedUserId, text);
        setContent("");
        const data = await getThread(selectedUserId);
        setDetail(data);
        refreshThreads();
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: "smooth",
          });
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "전송 실패");
      }
    });
  };

  return (
    <div className="flex flex-col lg:h-full lg:min-h-0 lg:flex-row">
      {/* 좌측: 스레드 목록 */}
      <div className="flex shrink-0 flex-col border-b border-stroke-neutral-muted lg:w-72 lg:border-b-0 lg:border-r">
        <div className="border-b border-stroke-neutral-muted p-x3">
          <SearchableSelect
            options={staff.map((s) => ({
              value: s.id,
              label: `${s.name} (${ROLE_DISPLAY[s.role] ?? s.role})`,
            }))}
            value=""
            onValueChange={(id) => id && openThread(id)}
            placeholder="새 대화 — 직원 선택"
          />
        </div>
        <div className="max-h-56 overflow-y-auto lg:max-h-none lg:flex-1">
          {threads.length === 0 ? (
            <EmptyState
              compact
              icon={MessagesSquare}
              title="아직 대화가 없어요"
              description="위에서 직원을 골라 대화를 시작해요."
            />
          ) : (
            <ul>
              {threads.map((t) => {
                const active = selectedUserId === t.other.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => openThread(t.other.id)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "flex w-full items-center gap-x3 px-x4 py-x3 text-left transition-colors",
                        active ? "bg-bg-neutral-weak" : "hover:bg-bg-layer-default-pressed"
                      )}
                    >
                      <Avatar name={t.other.name} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-x2">
                          <span className="min-w-0 truncate t4-bold text-fg-neutral">
                            {t.other.name}
                            <span className="ml-x1 t2-regular text-fg-neutral-subtle">
                              {ROLE_DISPLAY[t.other.role ?? ""] ?? ""}
                            </span>
                          </span>
                          <span className="shrink-0 t2-regular tabular-nums text-fg-neutral-subtle">
                            {dateLabel(t.lastMessageAt)}
                          </span>
                        </div>
                        <div className="mt-x0_5 flex items-center justify-between gap-x2">
                          <span className="truncate t3-regular text-fg-neutral-subtle">
                            {t.lastMessage
                              ? `${t.lastMessage.mine ? "나: " : ""}${t.lastMessage.content}`
                              : "메시지 없음"}
                          </span>
                          <CountBadge count={t.unread} />
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* 우측: 대화 뷰 */}
      <div className="flex h-[60dvh] min-h-[420px] min-w-0 flex-1 flex-col lg:h-auto lg:min-h-0">
        {!detail ? (
          <div className="grid flex-1 place-items-center">
            <EmptyState
              icon={MessagesSquare}
              title="대화를 선택하세요"
              description="목록에서 대화를 고르거나 새 대화를 시작해요."
            />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-x3 border-b border-stroke-neutral-muted px-x5 py-x3">
              <Avatar name={detail.other.name} size={32} />
              <div className="min-w-0">
                <p className="truncate t4-bold text-fg-neutral">{detail.other.name}</p>
                <p className="t2-regular text-fg-neutral-subtle">
                  {ROLE_DISPLAY[detail.other.role] ?? detail.other.role}
                </p>
              </div>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto bg-bg-layer-fill px-x5 py-x4">
              {detail.messages.length === 0 ? (
                <p className="mt-x8 text-center t4-regular text-fg-neutral-subtle">
                  대화를 시작해 보세요
                </p>
              ) : (
                <div className="flex flex-col gap-x1_5">
                  {detail.messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn("flex items-end gap-x1_5", m.mine ? "justify-end" : "justify-start")}
                    >
                      {m.mine && (
                        <span className="t2-regular tabular-nums text-fg-neutral-subtle">
                          {timeShort(m.createdAt)}
                        </span>
                      )}
                      <div
                        className={cn(
                          "max-w-[75%] whitespace-pre-wrap break-words rounded-r4 px-x3_5 py-x2 t4-regular",
                          m.mine
                            ? "bg-bg-brand-solid text-palette-static-white"
                            : "bg-bg-layer-default text-fg-neutral shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-muted)]"
                        )}
                      >
                        {m.content}
                      </div>
                      {!m.mine && (
                        <span className="t2-regular tabular-nums text-fg-neutral-subtle">
                          {timeShort(m.createdAt)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-end gap-x2 border-t border-stroke-neutral-muted p-x3">
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="메시지 입력 (Enter 전송, Shift+Enter 줄바꿈)"
                aria-label="메시지 입력"
                className="max-h-32 min-h-10 flex-1 resize-none py-x2"
                rows={1}
              />
              <Button
                size="icon"
                onClick={handleSend}
                disabled={isPending || !content.trim()}
                aria-label="전송"
              >
                <Send />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
