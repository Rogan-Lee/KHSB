// 수강료 산식 — 반별 월 수강료·세 달 선등록 금액·일할 기준(강한선배 수강료 안내, 원장님 확인 2026-10-26).
//  · 등록 기준은 매월 1일~말일. 15일 전 입실은 입실일~말일 일할, 15일 이후 입실은 그달 일할 + 다음 달 한 달을 한 청구서로.
//  · 일 단가 = 월 수강료 ÷ 기준 일수(정규 30.5일 — 30일·31일 달 모두, 선택 13일), 십 원 단위 이하 버림.
//  · 세 달 선등록이면 모든 계산(일 단가 포함)이 할인 금액 기준.
// 순수 함수 (클라이언트 화면도 같은 계산을 쓴다).

import { daysInclusive, monthEndOf } from "@/lib/tuition/calc";

export type TuitionPlanKey = "REGULAR" | "SELECTIVE";

export type TuitionPlan = {
  key: TuitionPlanKey;
  name: string;
  /** 월 수강료 (원) */
  monthlyFee: number;
  /** 세 달 선등록 시 월 수강료 (원) */
  prepayMonthlyFee: number;
  /** 일할 기준 일수 — 한 달을 며칠로 보는지 */
  basisDays: number;
};

export type TuitionPricing = {
  plans: TuitionPlan[];
  /** 선등록 개월 수 */
  prepayMonths: number;
  /** 달력 한 달 기준 일수 (30일·31일 달을 이 값으로 통일) */
  calendarDays: number;
  /** 입실일이 이 날 이후면 그달 일할 + 다음 달을 한 청구서로 */
  combineFromDay: number;
  /** 일 단가를 이 단위 미만 버림 (원) */
  dailyRoundUnit: number;
};

export const DEFAULT_TUITION_PRICING: TuitionPricing = {
  plans: [
    { key: "REGULAR", name: "정규반", monthlyFee: 550_000, prepayMonthlyFee: 510_000, basisDays: 30.5 },
    { key: "SELECTIVE", name: "선택반", monthlyFee: 410_000, prepayMonthlyFee: 380_000, basisDays: 13 },
  ],
  prepayMonths: 3,
  calendarDays: 30.5,
  combineFromDay: 15,
  dailyRoundUnit: 100,
};

/** 학생의 반(classGroup)으로 요금제를 고른다 — "선택"이 들어가면 선택반, 아니면 정규반 */
// ponytail: 반 이름으로 고른다. 반 이름이 늘어나 맞지 않으면 학생별 요금제 칸을 둔다
export function planOf(classGroup: string | null | undefined, pricing: TuitionPricing): TuitionPlan {
  const key: TuitionPlanKey = classGroup?.includes("선택") ? "SELECTIVE" : "REGULAR";
  return pricing.plans.find((plan) => plan.key === key) ?? pricing.plans[0];
}

/** 일 단가 — 월 수강료 ÷ 기준 일수, 단위 미만 버림 (550,000 ÷ 30.5 = 18,032 → 18,000) */
export function dailyRateOf(monthlyFee: number, plan: TuitionPlan, pricing: TuitionPricing): number {
  return Math.floor(monthlyFee / plan.basisDays / pricing.dailyRoundUnit) * pricing.dailyRoundUnit;
}

/**
 * 일할 청구 — from 부터 그달 말일까지. 청구 일수는 정규반이면 남은 날 그대로,
 * 기준 일수가 한 달보다 짧은 반(선택반 13일)은 남은 날을 그 비율로 줄인다.
 * 금액은 월 수강료를 넘지 않는다.
 */
// ponytail: 선택반 일수 = 남은 날 × 13 ÷ 30.5 반올림 — 원장님 확인 대기. 실제 등원 예정일로 세야 하면 여기만 바꾼다
export function proratedChargeOf(input: {
  from: Date;
  monthlyFee: number;
  plan: TuitionPlan;
  pricing: TuitionPricing;
}): { days: number; dailyRate: number; calendarDays: number; amount: number } {
  const { plan, pricing } = input;
  const calendarDays = daysInclusive(input.from, monthEndOf(input.from));
  const days =
    plan.basisDays >= pricing.calendarDays
      ? calendarDays
      : Math.max(1, Math.round((calendarDays * plan.basisDays) / pricing.calendarDays));
  const dailyRate = dailyRateOf(input.monthlyFee, plan, pricing);
  return { days, dailyRate, calendarDays, amount: Math.min(input.monthlyFee, days * dailyRate) };
}

/**
 * 저장할(또는 DB 에서 읽은) 산식 검사 — 반 두 개(정규·선택)의 금액·기준 일수와 공통 규칙.
 * 틀리면 첫 번째 문제를 한국어로 돌려준다 (설정 화면이 그대로 보여 준다).
 */
export function validatePricing(raw: unknown): { ok: true; pricing: TuitionPricing } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "수강료 산식을 확인해 주세요" };
  const input = raw as Record<string, unknown>;
  const isInt = (value: unknown, min: number, max: number) =>
    typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
  const isNum = (value: unknown, min: number, max: number) =>
    typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

  if (!Array.isArray(input.plans)) return { ok: false, error: "반별 수강료를 확인해 주세요" };
  const plans: TuitionPlan[] = [];
  for (const base of DEFAULT_TUITION_PRICING.plans) {
    const found = (input.plans as Record<string, unknown>[]).find((plan) => plan?.key === base.key);
    if (!found) return { ok: false, error: `${base.name} 산식이 없어요` };
    if (!isInt(found.monthlyFee, 10_000, 10_000_000)) return { ok: false, error: `${base.name} 월 수강료를 확인해 주세요` };
    if (!isInt(found.prepayMonthlyFee, 10_000, 10_000_000)) {
      return { ok: false, error: `${base.name} 선등록 월 수강료를 확인해 주세요` };
    }
    // 소수 한 자리까지 (30.5)
    if (!isNum(found.basisDays, 1, 31) || Math.round((found.basisDays as number) * 10) !== (found.basisDays as number) * 10) {
      return { ok: false, error: `${base.name} 일할 기준 일수는 1~31 사이, 소수 한 자리까지 적어 주세요` };
    }
    plans.push({
      key: base.key,
      name: base.name,
      monthlyFee: found.monthlyFee as number,
      prepayMonthlyFee: found.prepayMonthlyFee as number,
      basisDays: found.basisDays as number,
    });
  }
  if (!isInt(input.prepayMonths, 2, 12)) return { ok: false, error: "선등록 개월 수를 확인해 주세요" };
  if (!isNum(input.calendarDays, 28, 31)) return { ok: false, error: "달력 한 달 기준 일수는 28~31 사이로 적어 주세요" };
  if (!isInt(input.combineFromDay, 2, 28)) return { ok: false, error: "다음 달과 묶는 입실일은 2~28일 사이로 적어 주세요" };
  if (![1, 10, 100, 1000].includes(input.dailyRoundUnit as number)) {
    return { ok: false, error: "일 단가 버림 단위는 1·10·100·1,000원 중에서 골라 주세요" };
  }
  return {
    ok: true,
    pricing: {
      plans,
      prepayMonths: input.prepayMonths as number,
      calendarDays: input.calendarDays as number,
      combineFromDay: input.combineFromDay as number,
      dailyRoundUnit: input.dailyRoundUnit as number,
    },
  };
}

/** DB 에 저장된 산식 — 비었거나 틀렸으면 기본값 (잘못 저장된 값 때문에 청구가 멈추지 않게) */
export function readPricing(raw: unknown): TuitionPricing {
  if (raw === null || raw === undefined) return DEFAULT_TUITION_PRICING;
  const result = validatePricing(raw);
  return result.ok ? result.pricing : DEFAULT_TUITION_PRICING;
}
