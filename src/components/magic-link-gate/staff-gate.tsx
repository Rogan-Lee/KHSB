"use client";

import { MagicLinkGate } from "./magic-link-gate";
import { verifyStaffGate } from "@/actions/token-gate";

export function StaffGate({ token }: { token: string }) {
  return (
    <MagicLinkGate
      title="순찰 본인 확인"
      description={"순찰 포털을 열기 전, 본인 확인이 필요해요.\n등록된 전화번호 뒷 4자리를 입력해 주세요."}
      label="전화번호 뒷 4자리"
      placeholder="1234"
      maxLength={4}
      inputMode="numeric"
      brandColor="slate"
      onSubmit={async (value) => {
        const result = await verifyStaffGate(token, value);
        return result.ok ? { ok: true } : { ok: false, reason: result.reason };
      }}
    />
  );
}
