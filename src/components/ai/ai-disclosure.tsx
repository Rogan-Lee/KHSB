// 생성형 AI 고지·표시 (인공지능기본법 제31조) — 문구는 src/lib/ai-disclosure.ts.
// 훅이 없어 서버/클라이언트 컴포넌트 양쪽에서 쓴다.

import { BadgeCheck, Sparkles } from "lucide-react";
import { AI_NOTICE_SHORT, AI_REVIEWED_LABEL, aiNoticeText } from "@/lib/ai-disclosure";
import { cn } from "@/lib/utils";

/** 운영진 화면 사전 고지 — AI 생성 버튼·예약 근처에 작은 한 줄. 전체 문장은 title(마우스 올림)과 스크린 리더로 */
export function AiNotice({ tail, className }: { tail: string; className?: string }) {
  const full = aiNoticeText(tail);
  return (
    <p title={full} aria-label={full} className={cn("flex items-center gap-x0_5 t1-regular text-fg-placeholder", className)}>
      <Sparkles className="size-2.5 shrink-0" aria-hidden />
      {AI_NOTICE_SHORT}
    </p>
  );
}

/** 운영진 화면 — AI 가 만든 초안 */
export function AiDraftBadge() {
  return <span className="t1-regular text-fg-placeholder">AI 초안</span>;
}

/** 학부모·학생 화면 — AI 로 만든 내용일 때만 붙인다 */
export function AiReviewedNote({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-center gap-x0_5 t1-regular text-fg-placeholder", className)}>
      <BadgeCheck className="size-2.5 shrink-0" aria-hidden />
      {AI_REVIEWED_LABEL}
    </p>
  );
}
