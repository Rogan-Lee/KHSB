// 등원 스케줄 제안 상태 — 목록·상세·버전 이력이 같은 문구·색을 쓰도록 한곳에 둔다.
import type { Tone } from "@/components/backoffice/ui";

export const PROPOSAL_STATUS: Record<string, { label: string; tone: Tone }> = {
  SUBMITTED: { label: "검토 대기", tone: "brand" },
  PROPOSED: { label: "학부모 승인 대기", tone: "warn" },
  APPROVED: { label: "승인됨 · 반영 대기", tone: "info" },
  REJECTED: { label: "반려됨", tone: "bad" },
  COMMITTED: { label: "반영 완료", tone: "ok" },
  SUPERSEDED: { label: "대체됨", tone: "gray" },
  CANCELLED: { label: "취소됨", tone: "gray" },
};

export function proposalStatus(status: string): { label: string; tone: Tone } {
  return PROPOSAL_STATUS[status] ?? { label: status, tone: "gray" };
}
