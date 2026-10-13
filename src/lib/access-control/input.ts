// 통제 대상·시간 입력 검증 — 서버 액션과 학생 신청 승인이 같이 쓴다.

import { getCatalogEntry, serviceLabel } from "./catalog";
import { normalizeDomain } from "./domain";
import type { AccessTargetKind } from "./types";

export const ALL_TARGET_LABEL = "인터넷 전체";

export const TARGET_KIND_LABELS: Record<AccessTargetKind, string> = {
  ALL: "인터넷 전체",
  SERVICE: "앱·서비스",
  DOMAIN: "사이트",
};

export type ResolvedTarget = { targetKind: AccessTargetKind; target: string; label: string };

/**
 * 대상 입력을 저장할 값으로 정리한다. 잘못된 입력이면 한국어 사유를 돌려준다.
 * extraServiceIds 는 시설 장비가 올린 서비스 목록 중 기본 목록에 없는 id.
 */
export function resolveTarget(
  kind: unknown,
  raw: unknown,
  extraServiceIds?: ReadonlySet<string>,
): { ok: true; value: ResolvedTarget } | { ok: false; error: string } {
  if (kind === "ALL") return { ok: true, value: { targetKind: "ALL", target: "", label: ALL_TARGET_LABEL } };
  if (kind === "SERVICE") {
    if (typeof raw !== "string" || (!getCatalogEntry(raw) && !extraServiceIds?.has(raw))) {
      return { ok: false, error: "앱·서비스를 목록에서 골라 주세요" };
    }
    return { ok: true, value: { targetKind: "SERVICE", target: raw, label: serviceLabel(raw) } };
  }
  if (kind === "DOMAIN") {
    const domain = normalizeDomain(raw);
    if (!domain) return { ok: false, error: "사이트 주소를 확인해 주세요 (예: youtube.com)" };
    return { ok: true, value: { targetKind: "DOMAIN", target: domain, label: domain } };
  }
  return { ok: false, error: "대상 종류를 선택해 주세요" };
}

/** "HH:MM" → 자정 기준 분. 형식이 다르면 null */
export function parseTimeToMinute(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function minuteToTime(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/** 0(일)~6(토) 정수만 남겨 정렬 */
export function cleanDaysOfWeek(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
}
