// 생성형 AI 고지·표시 (인공지능기본법 제31조) — 문구는 src/lib/ai-disclosure.ts.
// 훅이 없어 서버/클라이언트 컴포넌트 양쪽에서 쓴다.

import { Sparkles } from "lucide-react";
import { StatusBadge } from "@/components/backoffice/ui";
import { Notice } from "@/components/portal/ui";
import { AI_REVIEWED_LABEL, aiNoticeText } from "@/lib/ai-disclosure";
import { cn } from "@/lib/utils";

/** 운영진 화면 사전 고지 — AI 생성 버튼·예약 근처에 둔다 */
export function AiNotice({ tail, className }: { tail: string; className?: string }) {
  return (
    <Notice tone="gray" icon={Sparkles} className={className}>
      {aiNoticeText(tail)}
    </Notice>
  );
}

/** 운영진 화면 — AI 가 만든 초안 */
export function AiDraftBadge() {
  return <StatusBadge tone="violet">AI 초안</StatusBadge>;
}

/** 학부모·학생 화면 — AI 로 만든 내용일 때만 붙인다 */
export function AiReviewedNote({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-center gap-x1 t3-regular text-fg-neutral-subtle", className)}>
      <Sparkles className="size-3.5 shrink-0" aria-hidden />
      {AI_REVIEWED_LABEL}
    </p>
  );
}
