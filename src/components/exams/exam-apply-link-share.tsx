"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const DEFAULT_MSG = "📢 모의고사 신청 안내\n아래 링크에서 휴대폰 본인인증 후 신청해주세요 👇";

/**
 * 모의고사 신청 링크 공유 — 안내 메시지는 자유롭게 수정, 링크는 자동으로 붙여 복사.
 * (대기신청 ShareApply 패턴)
 */
export function ExamApplyLinkShare({ sessionId }: { sessionId: string }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
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
    <div className="space-y-2 rounded-lg border border-line bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        보낼 메시지는 자유롭게 수정하세요. 링크는 자동으로 붙습니다.
      </p>
      <textarea
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        rows={3}
        className="w-full resize-none rounded-md border border-line bg-background px-3 py-2 text-sm"
        placeholder="안내 메시지"
      />
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={link}
          className="min-w-0 flex-1 rounded-md border border-line bg-background px-2 py-1.5 text-xs text-muted-foreground"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!link}
          onClick={() => copy(link, "링크가 복사되었습니다")}
        >
          링크만
        </Button>
        <Button
          size="sm"
          disabled={!link}
          onClick={() => copy(`${msg}\n${link}`, "메시지 + 링크가 복사되었습니다")}
        >
          메시지+링크
        </Button>
      </div>
    </div>
  );
}
