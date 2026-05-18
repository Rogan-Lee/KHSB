"use client";

import { MagicLinkGate } from "./magic-link-gate";
import { verifyStaffGate } from "@/actions/token-gate";

export function StaffGate({ token }: { token: string }) {
  return (
    <MagicLinkGate
      title="본인 확인"
      description={"근무자 포털 열기 전, 본인 확인이 필요해요.\n등록된 휴대폰 번호 뒷 4자리를 입력하세요."}
      label="휴대폰 뒷 4자리"
      placeholder="0000"
      maxLength={4}
      inputMode="tel"
      brandColor="slate"
      onSubmit={async (value) => {
        const result = await verifyStaffGate(token, value);
        return result.ok ? { ok: true } : { ok: false, reason: result.reason };
      }}
    />
  );
}
