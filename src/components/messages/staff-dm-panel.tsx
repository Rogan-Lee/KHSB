"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
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
    <div className="flex h-full min-h-0">
      {/* 좌측: 스레드 목록 */}
      <div className="flex w-72 shrink-0 flex-col border-r">
        <div className="border-b p-3">
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
        <div className="flex-1 overflow-y-auto">
          {threads.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              대화가 없습니다
            </p>
          ) : (
            threads.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => openThread(t.other.id)}
                className={`flex w-full items-start gap-2 border-b px-3 py-2.5 text-left transition-colors hover:bg-muted/60 ${
                  selectedUserId === t.other.id ? "bg-muted" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold">
                      {t.other.name}
                      <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                        {ROLE_DISPLAY[t.other.role ?? ""] ?? ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {dateLabel(t.lastMessageAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted-foreground">
                      {t.lastMessage
                        ? `${t.lastMessage.mine ? "나: " : ""}${t.lastMessage.content}`
                        : "메시지 없음"}
                    </span>
                    {t.unread > 0 && (
                      <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                        {t.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* 우측: 대화 뷰 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!detail ? (
          <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
            대화를 선택하거나 새 대화를 시작하세요
          </div>
        ) : (
          <>
            <div className="border-b px-4 py-2.5">
              <p className="text-sm font-semibold">{detail.other.name}</p>
              <p className="text-[11px] text-muted-foreground">
                {ROLE_DISPLAY[detail.other.role] ?? detail.other.role}
              </p>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
              {detail.messages.length === 0 ? (
                <p className="mt-8 text-center text-sm text-muted-foreground">
                  대화를 시작해 보세요
                </p>
              ) : (
                <div className="space-y-1.5">
                  {detail.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex items-end gap-1.5 ${
                        m.mine ? "justify-end" : "justify-start"
                      }`}
                    >
                      {m.mine && (
                        <span className="text-[10.5px] tabular-nums text-muted-foreground">
                          {timeShort(m.createdAt)}
                        </span>
                      )}
                      <div
                        className={`max-w-[75%] whitespace-pre-wrap break-words rounded-[14px] px-3 py-2 text-sm leading-relaxed ${
                          m.mine
                            ? "bg-primary text-primary-foreground"
                            : "border bg-muted/40"
                        }`}
                      >
                        {m.content}
                      </div>
                      {!m.mine && (
                        <span className="text-[10.5px] tabular-nums text-muted-foreground">
                          {timeShort(m.createdAt)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-end gap-2 border-t p-3">
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
                className="max-h-32 min-h-10 flex-1 resize-none"
                rows={1}
              />
              <Button
                size="icon"
                onClick={handleSend}
                disabled={isPending || !content.trim()}
                aria-label="전송"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
