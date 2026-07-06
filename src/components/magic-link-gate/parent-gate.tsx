"use client";

import { MagicLinkGate } from "./magic-link-gate";
import { verifyParentGate } from "@/actions/token-gate";

type ParentModel = "parent-report" | "study-plan" | "consultation" | "schedule" | "monthly";

const CONFIG: Record<ParentModel, { title: string; description: string; brand: "blue" | "purple" | "violet" }> = {
  schedule: {
    title: "학부모 본인 확인",
    description: "등원 스케줄(안)을 확인하기 전, 본인 확인이 필요해요.\n학생 학부모 휴대폰 뒷 4자리를 입력해 주세요.",
    brand: "blue",
  },
  monthly: {
    title: "학부모 본인 확인",
    description: "월간 리포트를 열기 전, 본인 확인이 필요해요.\n학생 학부모 휴대폰 뒷 4자리를 입력해 주세요.",
    brand: "blue",
  },
  "parent-report": {
    title: "학부모 본인 확인",
    description: "멘토링 리포트를 열기 전, 본인 확인이 필요해요.\n학생 학부모 휴대폰 뒷 4자리를 입력해 주세요.",
    brand: "blue",
  },
  "study-plan": {
    title: "학부모 본인 확인",
    description: "공부 계획 리포트를 열기 전, 본인 확인이 필요해요.\n학생 학부모 휴대폰 뒷 4자리를 입력해 주세요.",
    brand: "purple",
  },
  consultation: {
    title: "학부모 본인 확인",
    description: "상담 안내를 열기 전, 본인 확인이 필요해요.\n학생 학부모 휴대폰 뒷 4자리를 입력해 주세요.",
    brand: "violet",
  },
};

export function ParentGate({ model, token }: { model: ParentModel; token: string }) {
  const cfg = CONFIG[model];
  return (
    <MagicLinkGate
      title={cfg.title}
      description={cfg.description}
      label="휴대폰 뒷 4자리"
      placeholder="0000"
      maxLength={4}
      inputMode="tel"
      brandColor={cfg.brand}
      onSubmit={async (value) => {
        const result = await verifyParentGate(model, token, value);
        return result.ok ? { ok: true } : { ok: false, reason: result.reason };
      }}
    />
  );
}
