import { describe, expect, it } from "vitest";

import {
  dailyRateOf,
  DEFAULT_TUITION_PRICING,
  planOf,
  proratedChargeOf,
  readPricing,
  validatePricing,
} from "@/lib/tuition/pricing";

// 수강료 산식 — 원장님이 알려 준 일 단가(정규 18,000/16,700 · 선택 31,500/29,200)와 일할 규칙.

const d = (key: string) => new Date(`${key}T00:00:00.000Z`);
const pricing = DEFAULT_TUITION_PRICING;
const regular = planOf("정규반", pricing);
const selective = planOf("선택반", pricing);

describe("pricing", () => {
  it("반 이름에 '선택'이 있으면 선택반, 아니면 정규반", () => {
    expect(selective.key).toBe("SELECTIVE");
    expect(regular.key).toBe("REGULAR");
    expect(planOf(null, pricing).key).toBe("REGULAR");
  });

  it("일 단가 = 월 수강료 ÷ 기준 일수(정규 30.5 · 선택 13), 십 원 단위 이하 버림 — 원장님 표와 같다", () => {
    expect(dailyRateOf(550_000, regular, pricing)).toBe(18_000);
    expect(dailyRateOf(510_000, regular, pricing)).toBe(16_700);
    expect(dailyRateOf(410_000, selective, pricing)).toBe(31_500);
    expect(dailyRateOf(380_000, selective, pricing)).toBe(29_200);
  });

  it("정규반 일할 — 입실일~말일 그대로 (10/7 입실 → 25일 × 18,000)", () => {
    expect(proratedChargeOf({ from: d("2026-10-07"), monthlyFee: 550_000, plan: regular, pricing })).toEqual({
      days: 25,
      dailyRate: 18_000,
      calendarDays: 25,
      amount: 450_000,
    });
    // 31일 달 2일 입실 → 30일 × 18,000 = 540,000 (월 수강료를 넘지 않는다)
    expect(proratedChargeOf({ from: d("2026-10-02"), monthlyFee: 550_000, plan: regular, pricing }).amount).toBe(540_000);
  });

  it("선택반 일할 — 남은 날을 13 ÷ 30.5 비율로 줄여 센다 (10/20 입실 → 12일 → 5일)", () => {
    expect(proratedChargeOf({ from: d("2026-10-20"), monthlyFee: 410_000, plan: selective, pricing })).toEqual({
      days: 5,
      dailyRate: 31_500,
      calendarDays: 12,
      amount: 157_500,
    });
  });

  it("저장할 산식 검사 — 반 두 개·금액·기준 일수(소수 한 자리)·공통 규칙", () => {
    expect(validatePricing(pricing)).toEqual({ ok: true, pricing });
    const withPlan = (patch: Record<string, unknown>) => ({
      ...pricing,
      plans: pricing.plans.map((plan) => (plan.key === "SELECTIVE" ? { ...plan, ...patch } : plan)),
    });
    expect(validatePricing(withPlan({ monthlyFee: 0 }))).toEqual({ ok: false, error: "선택반 월 수강료를 확인해 주세요" });
    expect(validatePricing(withPlan({ basisDays: 13.25 })).ok).toBe(false);
    expect(validatePricing(withPlan({ basisDays: 13.5 })).ok).toBe(true);
    expect(validatePricing({ ...pricing, plans: [pricing.plans[0]] })).toEqual({ ok: false, error: "선택반 산식이 없어요" });
    expect(validatePricing({ ...pricing, dailyRoundUnit: 50 }).ok).toBe(false);
  });

  it("DB 값이 비었거나 틀렸으면 기본값으로 계산한다 (청구가 멈추지 않게)", () => {
    expect(readPricing(null)).toBe(DEFAULT_TUITION_PRICING);
    expect(readPricing({ plans: "x" })).toBe(DEFAULT_TUITION_PRICING);
    const saved = { ...pricing, combineFromDay: 16 };
    expect(readPricing(saved)).toEqual(saved);
  });
});
