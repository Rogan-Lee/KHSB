// 면담 도메인 상태·분류 → SEED 톤 (한곳에서만 정의)
import type { Tone } from "@/components/backoffice/ui";

export type ConsultationStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";

export const STATUS_META: Record<ConsultationStatus, { label: string; tone: Tone }> = {
  SCHEDULED: { label: "예정", tone: "info" },
  COMPLETED: { label: "완료", tone: "ok" },
  CANCELLED: { label: "취소", tone: "gray" },
};

export const CATEGORY_META: Record<string, { label: string; tone: Tone }> = {
  ENROLLED: { label: "재원생", tone: "gray" },
  NEW_ADMISSION: { label: "신규 입실", tone: "brand" },
  CONSIDERING: { label: "등록 고민", tone: "warn" },
};

export const TYPE_LABEL: Record<string, string> = { STUDENT: "학생", PARENT: "학부모" };

/** KST 기준 "9월 25일 (목) 14:00" — 자정이면 시각 생략 */
export function formatKST(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const m = kst.getUTCMonth() + 1;
  const d = kst.getUTCDate();
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const dow = dayNames[kst.getUTCDay()];
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  const timeStr = hh === "00" && mm === "00" ? "" : ` ${hh}:${mm}`;
  return `${m}월 ${d}일 (${dow})${timeStr}`;
}
