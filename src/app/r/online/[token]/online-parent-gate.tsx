"use client";

import { MagicLinkGate } from "@/components/magic-link-gate/magic-link-gate";
import { verifyParentGate } from "@/actions/token-gate";

/** 온라인 관리 보고서(/r/online) 학부모 본인 확인 — 다른 /r 리포트와 같은 휴대폰 뒷 4자리 게이트. */
export function OnlineParentGate({ token }: { token: string }) {
  return (
    <MagicLinkGate
      title="학부모 본인 확인"
      description={"관리 보고서를 열기 전, 본인 확인이 필요해요.\n등록된 학부모 휴대폰 번호 뒷 4자리를 입력해 주세요."}
      label="휴대폰 뒷 4자리"
      placeholder="0000"
      maxLength={4}
      inputMode="tel"
      brandColor="blue"
      onSubmit={async (value) => {
        const result = await verifyParentGate("online", token, value);
        return result.ok ? { ok: true } : { ok: false, reason: result.reason };
      }}
    />
  );
}
