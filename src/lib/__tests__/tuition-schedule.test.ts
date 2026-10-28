import { describe, expect, it } from "vitest";

import { dateKey } from "@/lib/tuition/calc";
import { DEFAULT_TUITION_PRICING, planOf } from "@/lib/tuition/pricing";
import { isAutoIssuable, planStudentSchedule, type StudentScheduleInput } from "@/lib/tuition/schedule";

// 청구 일정 — 매월 1일~말일 기준으로 다음 청구서를 언제·얼마로 낼지, 무엇이 자동 발행을 막는지.

const d = (key: string) => new Date(`${key}T00:00:00.000Z`);
const pricing = DEFAULT_TUITION_PRICING;
const OPTIONS = { today: d("2026-10-26"), autoIssueLeadDays: 3, pricing };

const base: StudentScheduleInput = {
  enrolledOn: d("2026-03-02"),
  withdrawOn: null,
  plan: planOf("정규반", pricing),
  customMonthlyFee: null,
  anchor: null,
  billedUntil: d("2026-10-31"),
  lastMonths: 1,
  overdueCount: 0,
  holdReason: null,
};

function plan(input: Partial<StudentScheduleInput>, options = OPTIONS) {
  return planStudentSchedule({ ...base, ...input }, options).map((entry) => ({
    kind: entry.kind,
    period: `${dateKey(entry.periodStart)}~${dateKey(entry.periodEnd)}`,
    months: entry.months,
    prorated: entry.prorated && `${entry.prorated.days}일×${entry.prorated.dailyRate}`,
    amount: entry.amount,
    issueOn: dateKey(entry.issueOn),
    blockers: entry.blockers,
  }));
}

describe("planStudentSchedule", () => {
  it("이어서 다니는 학생 — 다음 달 1일~말일, 1일 3일 전에 발행", () => {
    expect(plan({})).toEqual([
      { kind: "RENEWAL", period: "2026-11-01~2026-11-30", months: 1, prorated: null, amount: 550_000, issueOn: "2026-10-29", blockers: [] },
    ]);
  });

  it("세 달 선등록을 냈던 학생은 이어서도 세 달, 할인 금액으로", () => {
    expect(plan({ lastMonths: 3 })[0]).toMatchObject({ period: "2026-11-01~2027-01-31", months: 3, amount: 1_530_000 });
    expect(plan({ lastMonths: 3, plan: planOf("선택반", pricing) })[0].amount).toBe(1_140_000);
  });

  it("학생별 수강료가 있으면 반 금액 대신 (선등록에도 같은 금액)", () => {
    expect(plan({ customMonthlyFee: 500_000 })[0].amount).toBe(500_000);
    expect(plan({ customMonthlyFee: 500_000, lastMonths: 3 })[0].amount).toBe(1_500_000);
  });

  it("신규 15일 전 입실 — 입실일~말일 일할, 다음 달은 따로", () => {
    expect(plan({ billedUntil: null, enrolledOn: d("2026-10-07") })).toEqual([
      { kind: "NEW", period: "2026-10-07~2026-10-31", months: 1, prorated: "25일×18000", amount: 450_000, issueOn: "2026-10-04", blockers: [] },
      { kind: "RENEWAL", period: "2026-11-01~2026-11-30", months: 1, prorated: null, amount: 550_000, issueOn: "2026-10-29", blockers: [] },
    ]);
  });

  it("신규 15일 이후 입실 — 그달 일할 + 다음 달 한 달을 한 청구서로", () => {
    expect(plan({ billedUntil: null, enrolledOn: d("2026-10-20") })).toEqual([
      { kind: "NEW", period: "2026-10-20~2026-11-30", months: 2, prorated: "12일×18000", amount: 766_000, issueOn: "2026-10-17", blockers: [] },
    ]);
    // 15일 당일은 '이후'
    expect(plan({ billedUntil: null, enrolledOn: d("2026-10-15") })[0].months).toBe(2);
    expect(plan({ billedUntil: null, enrolledOn: d("2026-10-14") })[0].months).toBe(1);
  });

  it("신규 1일 입실은 일할 없이 한 달", () => {
    expect(plan({ billedUntil: null, enrolledOn: d("2026-11-01") })).toEqual([
      { kind: "NEW", period: "2026-11-01~2026-11-30", months: 1, prorated: null, amount: 550_000, issueOn: "2026-10-29", blockers: [] },
    ]);
  });

  it("시스템 전부터 다녔는데 낸 기록이 없으면 청구 시작일을 사람이 정한다 (미리보기는 다음 달 1일)", () => {
    expect(plan({ billedUntil: null, enrolledOn: d("2026-03-02") })[0]).toMatchObject({
      period: "2026-11-01~2026-11-30",
      blockers: ["NO_ANCHOR"],
    });
    // 정해 두면 그 날부터
    expect(plan({ billedUntil: null, anchor: d("2026-11-01") })[0]).toMatchObject({ period: "2026-11-01~2026-11-30", blockers: [] });
  });

  it("예전 방식(달 중간 주기)으로 낸 학생은 다음 청구에서 말일까지 일할로 맞춘다", () => {
    expect(plan({ billedUntil: d("2026-11-04") })[0]).toMatchObject({ period: "2026-11-05~2026-11-30", months: 1, prorated: "26일×18000" });
    expect(plan({ billedUntil: d("2026-11-14") })[0]).toMatchObject({ period: "2026-11-15~2026-12-31", months: 2 });
  });

  it("보류 사유가 있으면 맨 앞에 보류로 막는다", () => {
    expect(plan({ holdReason: "반 변경 상담 중", overdueCount: 1 })[0].blockers).toEqual(["HOLD", "OVERDUE"]);
  });

  it("미납·퇴원 예정·오래 지남이면 막는다", () => {
    expect(plan({ overdueCount: 1 })[0].blockers).toEqual(["OVERDUE"]);
    expect(plan({ withdrawOn: d("2026-11-15") })[0].blockers).toEqual(["WITHDRAWING"]);
    expect(plan({ withdrawOn: d("2026-11-30") })[0].blockers).toEqual([]);
    expect(plan({ billedUntil: d("2026-10-17") })[0].blockers).toEqual(["STALE"]);
  });
});

describe("isAutoIssuable", () => {
  it("발행일이 됐고 막힌 이유가 없을 때만", () => {
    const [entry] = planStudentSchedule(base, OPTIONS);
    expect(isAutoIssuable(entry, d("2026-10-28"))).toBe(false);
    expect(isAutoIssuable(entry, d("2026-10-29"))).toBe(true);
    const [blocked] = planStudentSchedule({ ...base, overdueCount: 1 }, OPTIONS);
    expect(isAutoIssuable(blocked, d("2026-10-29"))).toBe(false);
  });
});
