"use client";

import { MagicLinkGate } from "./magic-link-gate";
import { verifyStudentGate } from "@/actions/token-gate";

export function StudentGate({ token }: { token: string }) {
  return (
    <MagicLinkGate
      title="본인 확인"
      description={
        "내 포털을 열기 전, 본인 확인이 필요해요.\n생년월일 6자리(YYMMDD)를 입력해 주세요."
      }
      label="생년월일 6자리 (YYMMDD)"
      placeholder="040315"
      maxLength={6}
      inputMode="numeric"
      brandColor="slate"
      onSubmit={async (value) => {
        const result = await verifyStudentGate(token, value);
        return result.ok ? { ok: true } : { ok: false, reason: result.reason };
      }}
    />
  );
}
