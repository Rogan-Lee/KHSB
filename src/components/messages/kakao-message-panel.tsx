"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { MessageCircle, Link2, RefreshCw, Search, Check, Send, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface KakaoFriend {
  id: number;
  uuid: string;
  profile_nickname: string;
  profile_thumbnail_image?: string;
  favorite?: boolean;
}

interface Props {
  initialConnected: boolean;
}

export function KakaoMessagePanel({ initialConnected }: Props) {
  const [connected, setConnected] = useState(initialConnected);
  const [friends, setFriends] = useState<KakaoFriend[]>([]);
  const [filtered, setFiltered] = useState<KakaoFriend[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const loadFriends = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/kakao/friends");
      const data = await res.json();
      if (!res.ok) {
        if (data.connected === false) setConnected(false);
        toast.error(data.error ?? "친구 목록 조회 실패");
        return;
      }
      setFriends(data.friends);
      setFiltered(data.friends);
    } catch {
      toast.error("친구 목록을 불러오지 못했습니다");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (connected) loadFriends();
  }, [connected, loadFriends]);

  useEffect(() => {
    const q = search.trim().toLowerCase();
    setFiltered(q ? friends.filter((f) => f.profile_nickname.toLowerCase().includes(q)) : friends);
  }, [search, friends]);

  function toggleSelect(uuid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(filtered.map((f) => f.uuid)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function handleSend() {
    if (!selected.size) {
      toast.error("수신자를 선택해주세요");
      return;
    }
    if (!message.trim()) {
      toast.error("메시지를 입력해주세요");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/kakao/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuids: Array.from(selected), message }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "발송 실패");
        return;
      }
      toast.success(`${data.sent}명에게 발송되었습니다`);
      setMessage("");
      setSelected(new Set());
    } catch {
      toast.error("발송 중 오류가 발생했습니다");
    } finally {
      setSending(false);
    }
  }

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-yellow-400 flex items-center justify-center shadow-sm">
          <MessageCircle className="h-7 w-7 text-yellow-900" />
        </div>
        <div>
          <p className="font-semibold text-gray-800">카카오톡 연동이 필요합니다</p>
          <p className="text-sm text-muted-foreground mt-1">연결하면 친구 목록에서 직접 메시지를 보낼 수 있습니다</p>
        </div>
        <Button
          className="bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-semibold gap-2"
          onClick={() => { window.location.href = "/api/kakao/connect"; }}
        >
          <Link2 className="h-4 w-4" />
          카카오 계정 연결
        </Button>
      </div>
    );
  }

  const selectedFriends = friends.filter((f) => selected.has(f.uuid));

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-yellow-400 flex items-center justify-center">
            <MessageCircle className="h-3.5 w-3.5 text-yellow-900" />
          </div>
          <span className="text-sm font-semibold text-gray-800">카카오 친구에게 보내기</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadFriends}
            disabled={loading}
            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
            새로고침
          </button>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground h-7"
            onClick={() => { window.location.href = "/api/kakao/connect"; }}
          >
            재연결
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* 친구 목록 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">친구 목록 ({friends.length})</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={selectAll} className="text-[11px] text-primary hover:underline">
                전체선택
              </button>
              {selected.size > 0 && (
                <button type="button" onClick={clearSelection} className="text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-0.5">
                  <X className="h-2.5 w-2.5" />
                  선택해제
                </button>
              )}
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름 검색..."
              className="pl-8 h-8 text-sm"
            />
          </div>

          <div className="border rounded-lg overflow-y-auto max-h-56 divide-y">
            {loading ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-2" />
                불러오는 중...
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {friends.length === 0 ? "친구 목록이 비어있습니다" : "검색 결과 없음"}
              </div>
            ) : (
              filtered.map((friend) => {
                const isSelected = selected.has(friend.uuid);
                return (
                  <button
                    key={friend.uuid}
                    type="button"
                    onClick={() => toggleSelect(friend.uuid)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
                      isSelected && "bg-yellow-50"
                    )}
                  >
                    {friend.profile_thumbnail_image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={friend.profile_thumbnail_image}
                        alt=""
                        className="w-7 h-7 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0 text-[11px] font-medium text-gray-500">
                        {friend.profile_nickname[0]}
                      </div>
                    )}
                    <span className="text-sm flex-1 truncate">{friend.profile_nickname}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 text-yellow-600 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* 메시지 작성 */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">메시지 작성</p>

          {selected.size > 0 && (
            <div className="flex flex-wrap gap-1 p-2 border rounded-lg bg-yellow-50 border-yellow-200 min-h-[36px]">
              {selectedFriends.map((f) => (
                <span
                  key={f.uuid}
                  className="flex items-center gap-1 bg-yellow-400 text-yellow-900 text-[11px] font-medium px-2 py-0.5 rounded-full"
                >
                  {f.profile_nickname}
                  <button type="button" onClick={() => toggleSelect(f.uuid)}>
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {selected.size === 0 && (
            <div className="flex items-center gap-2 p-2 border rounded-lg border-dashed text-xs text-muted-foreground h-9">
              <Users className="h-3.5 w-3.5" />
              왼쪽에서 수신자를 선택하세요
            </div>
          )}

          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="메시지 내용을 입력하세요 (최대 200자)"
            rows={6}
            maxLength={200}
            className="resize-none text-sm"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">{message.length} / 200</span>
          </div>

          <Button
            onClick={handleSend}
            disabled={sending || !selected.size || !message.trim()}
            className="w-full bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-semibold gap-2"
          >
            <Send className="h-4 w-4" />
            {sending ? "발송 중..." : `${selected.size > 0 ? `${selected.size}명에게 ` : ""}카카오 발송`}
          </Button>
        </div>
      </div>
    </div>
  );
}
