"use client";

import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const noopSubscribe = () => () => {};

const DEFAULT_MSG = "📢 모의고사 신청 안내\n아래 링크에서 휴대폰 본인인증 후 신청해주세요 👇";

/**
 * 모의고사 신청 링크 공유 — 안내 메시지는 자유롭게 수정, 링크는 자동으로 붙여 복사.
 * (대기신청 ShareApply 패턴)
 */
export function ExamApplyLinkShare({ sessionId }: { sessionId: string }) {
  // 서버 렌더에선 빈 값, 브라우저에선 현재 origin
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => ""
  );
  const link = origin ? `${origin}/exam-apply/${sessionId}` : "";
  const [msg, setMsg] = useState(DEFAULT_MSG);

  async function copy(text: string, ok: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(ok);
    } catch {
      toast.error("복사 실패 — 브라우저 권한을 확인하세요");
    }
  }

  return (
    <div className="flex flex-col gap-x3 rounded-r3 bg-bg-layer-fill p-x4">
      <p className="t3-regular text-fg-neutral-subtle">
        보낼 메시지는 자유롭게 고칠 수 있어요. 링크는 자동으로 붙어요.
      </p>
      <Textarea
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        rows={3}
        className="min-h-0 resize-none"
        placeholder="안내 메시지"
        aria-label="안내 메시지"
      />
      <div className="flex flex-col gap-x2 sm:flex-row sm:items-center">
        <Input readOnly value={link} aria-label="신청 링크" className="min-w-0 flex-1 text-fg-neutral-muted" />
        <div className="flex gap-x2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 sm:flex-none"
            disabled={!link}
            onClick={() => copy(link, "링크가 복사되었습니다")}
          >
            링크만 복사
          </Button>
          <Button
            size="sm"
            className="flex-1 sm:flex-none"
            disabled={!link}
            onClick={() => copy(`${msg}\n${link}`, "메시지 + 링크가 복사되었습니다")}
          >
            <Copy />
            메시지+링크 복사
          </Button>
        </div>
      </div>
    </div>
  );
}
