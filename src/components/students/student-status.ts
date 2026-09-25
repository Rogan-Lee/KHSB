import type { Tone } from "@/components/backoffice/ui";

// 원생 상태 → 라벨·배지 톤 (목록·카드·상세가 같은 표기를 쓴다)
export const STUDENT_STATUS: Record<"ACTIVE" | "INACTIVE" | "GRADUATED" | "WITHDRAWN", { label: string; tone: Tone }> = {
  ACTIVE: { label: "재원", tone: "ok" },
  INACTIVE: { label: "휴원", tone: "warn" },
  GRADUATED: { label: "졸업", tone: "info" },
  WITHDRAWN: { label: "퇴원", tone: "gray" },
};
