"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { KakaoButton } from "@/components/ui/kakao-button";
import { Textarea } from "@/components/ui/textarea";
import { generateFollowUpMessage } from "@/actions/ai-followup";
import { toast } from "sonner";
import { Sparkles, Copy, RefreshCw, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState, IconTile, Section } from "@/components/backoffice/ui";

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
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-x3 rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default px-x5 py-x4 text-left transition-colors hover:bg-bg-layer-default-pressed"
      >
        <IconTile icon={Sparkles} tone="violet" size={40} />
        <div className="min-w-0 flex-1">
          <p className="t4-bold text-fg-neutral">AI 팔로업 메시지</p>
          <p className="mt-x0_5 t3-regular text-fg-neutral-subtle">상담 내용을 바탕으로 카카오톡 메시지를 자동으로 만들어요</p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-fg-placeholder" aria-hidden />
      </button>
    );
  }

  return (
    <Section
      title="AI 팔로업 메시지"
      description={`받는 사람 · ${recipientName}`}
      actions={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setOpen(false); setMessage(""); setGenerated(false); }}
        >
          닫기
        </Button>
      }
    >
      {/* 메시지 영역 */}
      {!generated ? (
        <EmptyState
          compact
          icon={Sparkles}
          title="상담 내용을 분석해 메시지를 만들어요"
          description="생성된 메시지는 보내기 전에 고칠 수 있어요"
          action={
            <Button onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? <RefreshCw className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
              {isGenerating ? "생성 중…" : "메시지 생성"}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-x3">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            aria-label="팔로업 메시지"
            className="resize-none"
            placeholder="생성된 메시지를 편집하세요..."
          />
          <div className="flex flex-wrap items-center gap-x2">
            <Button variant="outline" size="sm" onClick={handleGenerate} disabled={isGenerating}>
              <RefreshCw className={cn(isGenerating && "animate-spin")} aria-hidden />
              재생성
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              <Copy aria-hidden />
              복사
            </Button>
            <div className="ml-auto flex items-center gap-x2">
              {prospectPhone && (
                <span className="t3-regular tabular-nums text-fg-neutral-subtle">{prospectPhone}</span>
              )}
              <KakaoButton size="sm" onClick={handleSendKakao} disabled={!message.trim()}>
                카카오톡 전송
              </KakaoButton>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}
