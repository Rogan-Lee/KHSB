// 급여 계산 유틸 (한국 주휴수당 포함)
// 참고: 근로기준법 제55조, 1주 소정 근로시간 15시간 이상 + 개근 시 주휴수당 지급
// 주휴수당 = (1주 소정 근로시간 ÷ 40) × 8시간 × 시급 (단, 40시간 상한)
//
// v1 단순화: "개근" 판정을 하지 않고, 주 15시간 이상이면 자동 지급.

import type { WorkTag, WorkTagType } from "@/generated/prisma";

export type WorkShift = {
  start: Date;
  end: Date;
  minutes: number;
};

export type MissingTag = {
  type: WorkTagType;
  taggedAt: Date;
  note?: string | null;
};

/**
 * 시간순 정렬된 WorkTag[] 를 IN-OUT 쌍으로 매칭.
 * - IN 뒤에 다음 IN 나오면 직전 IN은 미매칭(missing)
 * - OUT 없이 끝난 마지막 IN 도 미매칭
 * - 외로운 OUT 은 missing 으로 표시
 */
export function pairWorkTags(tagsAsc: Pick<WorkTag, "id" | "type" | "taggedAt">[]): {
  shifts: WorkShift[];
  missing: MissingTag[];
} {
  const shifts: WorkShift[] = [];
  const missing: MissingTag[] = [];

  let pendingIn: { taggedAt: Date } | null = null;

  for (const t of tagsAsc) {
    if (t.type === "CLOCK_IN") {
      if (pendingIn) {
        // 이전 IN 이 OUT 없이 새 IN 만남 → 이전 IN 미매칭
        missing.push({ type: "CLOCK_IN", taggedAt: pendingIn.taggedAt });
      }
      pendingIn = { taggedAt: new Date(t.taggedAt) };
    } else {
      // CLOCK_OUT
      if (!pendingIn) {
        missing.push({ type: "CLOCK_OUT", taggedAt: new Date(t.taggedAt) });
      } else {
        const start = pendingIn.taggedAt;
        const end = new Date(t.taggedAt);
        const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
        shifts.push({ start, end, minutes });
        pendingIn = null;
      }
    }
  }

  if (pendingIn) {
    missing.push({ type: "CLOCK_IN", taggedAt: pendingIn.taggedAt });
  }

  return { shifts, missing };
}

/**
 * KST 기준 주 시작(월요일 00:00) 찾기.
 */
export function weekStartKST(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0=일
  const diff = day === 0 ? -6 : 1 - day; // 월요일로 맞춤
  x.setDate(x.getDate() + diff);
  return x;
}

/**
 * shifts 를 주(월~일) 단위로 그룹핑 후 주당 분 합계 반환.
 */
export function groupByWeek(shifts: WorkShift[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of shifts) {
    const wk = weekStartKST(s.start);
    const key = wk.toISOString().slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + s.minutes);
  }
  return map;
}

/**
 * 주휴수당 합계 계산 (모든 주에 대해).
 * - 주 15시간(900분) 미만 주: 미지급
 * - 이상: (주간시간/60 ÷ 40) × 8 × 시급. 단, 주간시간 40시간(2400분) 상한.
 */
export function calcWeeklyHolidayPay(
  shifts: WorkShift[],
  hourlyRate: number,
  enabled: boolean
): number {
  if (!enabled) return 0;
  const byWeek = groupByWeek(shifts);
  let total = 0;
  for (const mins of byWeek.values()) {
    if (mins < 15 * 60) continue;
    const cappedMins = Math.min(mins, 40 * 60);
    const weekHours = cappedMins / 60;
    const wage = (weekHours / 40) * 8 * hourlyRate;
    total += Math.round(wage);
  }
  return total;
}

export type PayrollCalcResult = {
  shifts: WorkShift[];
  missing: MissingTag[];
  totalMinutes: number;
  baseWage: number;
  weeklyHolidayWage: number;
  totalWage: number;
};

/**
 * 기간(from ~ to) 내 태그로 급여 집계.
 */
export function calculatePayrollFromTags(
  tagsAsc: Pick<WorkTag, "id" | "type" | "taggedAt">[],
  hourlyRate: number,
  weeklyHolidayPay: boolean
): PayrollCalcResult {
  const { shifts, missing } = pairWorkTags(tagsAsc);
  const totalMinutes = shifts.reduce((s, x) => s + x.minutes, 0);
  const baseWage = Math.round((totalMinutes / 60) * hourlyRate);
  const weeklyHolidayWage = calcWeeklyHolidayPay(shifts, hourlyRate, weeklyHolidayPay);
  return {
    shifts,
    missing,
    totalMinutes,
    baseWage,
    weeklyHolidayWage,
    totalWage: baseWage + weeklyHolidayWage,
  };
}
