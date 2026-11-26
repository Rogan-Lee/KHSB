// 휴대폰 검사 화면 공용 라벨·색 — 보관함·목록·상세가 같이 쓴다.

import { Check, ShieldCheck, UserX, X } from "lucide-react";
import type { PhoneCheckStatus } from "@/generated/prisma";
import type { PhoneCheckRow } from "@/lib/phone-check-core";
import type { SlotKind } from "@/lib/phone-locker";

// 검사 상태 → SEED 역할색: 제출 positive · 미제출 critical · 미입실 neutral · 면제 informative
export const STATUS_META: Record<PhoneCheckStatus, { label: string; icon: typeof Check; selected: string }> = {
  SUBMITTED: {
    label: "제출",
    icon: Check,
    selected: "bg-bg-positive-weak text-fg-positive shadow-[inset_0_0_0_1.5px_var(--seed-color-stroke-positive-solid)]",
  },
  NOT_SUBMITTED: {
    label: "미제출",
    icon: X,
    selected: "bg-bg-critical-weak text-fg-critical shadow-[inset_0_0_0_1.5px_var(--seed-color-stroke-critical-solid)]",
  },
  EXEMPT: {
    label: "면제",
    icon: ShieldCheck,
    selected:
      "bg-bg-informative-weak text-fg-informative shadow-[inset_0_0_0_1.5px_var(--seed-color-stroke-informative-solid)]",
  },
  ABSENT: {
    label: "미입실",
    icon: UserX,
    selected: "bg-bg-neutral-weak text-fg-neutral shadow-[inset_0_0_0_1.5px_var(--seed-color-stroke-neutral-solid)]",
  },
};
export const STATUSES = Object.keys(STATUS_META) as PhoneCheckStatus[];

/** 0 → "입실", n → "n교시" */
export const periodLabel = (p: number) => (p === 0 ? "입실" : `${p}교시`);

/** 학생이 기준 시각에 어디 있었는지 — "18:02 입실 · 자리에 있음" */
export function stateText(r: PhoneCheckRow): string {
  if (r.state === "HERE") return `${r.checkInAt} 입실 · 자리에 있음`;
  if (r.state === "OUTING") return "외출 중";
  if (r.state === "LEFT") return r.checkOutAt ? `${r.checkOutAt} 퇴실` : "퇴실";
  return "미입실";
}

/** 비어 있어야 하는 칸에 붙는 짧은 표시 (미입실은 표시 없이 흐리게만) */
export function awayLabel(r: PhoneCheckRow): string | null {
  if (r.state === "OUTING") return "외출";
  if (r.state === "LEFT") return "퇴실";
  return null;
}

/** 다른 칸이 왜 다른지 */
export function mismatchText(r: PhoneCheckRow, kind: SlotKind): string {
  if (kind === "missing") return "있어야 하는데 없음";
  if (r.state === "OUTING") return "외출 중인데 폰이 있음";
  if (r.state === "LEFT") return "퇴실했는데 폰이 있음";
  return "입실 기록이 없는데 폰이 있음";
}

/** "2026-11-26T09:52:00Z" → "오후 6:52" */
export function clockLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" });
}
