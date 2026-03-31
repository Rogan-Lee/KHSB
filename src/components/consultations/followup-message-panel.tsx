"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { generateFollowUpMessage } from "@/actions/ai-followup";
import { toast } from "sonner";
import { Sparkles, Send, Copy, RefreshCw, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  consultationId: string;
  recipientName: string;
  prospectPhone?: string | null;
}

export function FollowUpMessagePanel({ consultationId, recipientName, prospectPhone }: Props) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [isGenerating, startGenerate] = useTransition();
  const [generated, setGenerated] = useState(false);

  function handleGenerate() {
    startGenerate(async () => {
      try {
        const result = await generateFollowUpMessage(consultationId);
        setMessage(result.message);
        setGenerated(true);
      } catch {
        toast.error("메시지 생성에 실패했습니다");
      }
    });
  }

  function handleCopy() {
    navigator.clipboard.writeText(message);
    toast.success("클립보드에 복사되었습니다");
  }

  const [kakaoOpen, setKakaoOpen] = useState(false);

  async function handleSendKakao() {
    // 카카오 친구 API로 전송
    const friendsRes = await fetch("/api/kakao/friends");
    const friendsData = await friendsRes.json();
    if (friendsData.error) {
      toast.error(friendsData.error);
      return;
    }
    // 간단 방식: 클립보드 복사 후 안내
    navigator.clipboard.writeText(message);
    toast.success("메시지가 복사되었습니다. 카카오톡에서 붙여넣기 하세요.");
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2.5 w-full rounded-lg border border-violet-200 bg-violet-50 hover:bg-violet-100 transition-colors text-left"
      >
        <Sparkles className="h-4 w-4 text-violet-600 shrink-0" />
        <div>
          <p className="text-sm font-medium text-violet-800">AI 팔로업 메시지</p>
          <p className="text-xs text-violet-600">상담 내용을 기반으로 카카오톡 메시지를 자동 생성합니다</p>
        </div>
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-600" />
          <span className="text-sm font-medium text-violet-800">AI 팔로업 메시지</span>
          <span className="text-xs text-violet-500">→ {recipientName}</span>
        </div>
        <button
          onClick={() => { setOpen(false); setMessage(""); setGenerated(false); }}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          닫기
        </button>
      </div>

      {/* 메시지 영역 */}
      <div className="space-y-2">
        {!generated ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <MessageSquare className="h-8 w-8 text-violet-300" />
            <p className="text-sm text-muted-foreground">상담 내용을 분석하여 메시지를 생성합니다</p>
            <Button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
            >
              {isGenerating ? (
                <><RefreshCw className="h-4 w-4 animate-spin" />생성 중...</>
              ) : (
                <><Sparkles className="h-4 w-4" />메시지 생성</>
              )}
            </Button>
          </div>
        ) : (
          <>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className="bg-white text-sm resize-none"
              placeholder="생성된 메시지를 편집하세요..."
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="gap-1.5"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isGenerating && "animate-spin")} />
                재생성
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="gap-1.5"
              >
                <Copy className="h-3.5 w-3.5" />
                복사
              </Button>
              <div className="ml-auto flex items-center gap-2">
                {prospectPhone && (
                  <span className="text-xs text-muted-foreground">{prospectPhone}</span>
                )}
                <Button
                  size="sm"
                  onClick={handleSendKakao}
                  disabled={!message.trim()}
                  className="bg-[#FEE500] hover:bg-[#FDD835] text-[#3C1E1E] gap-1.5"
                >
                  <Send className="h-3.5 w-3.5" />
                  카카오톡 전송
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
