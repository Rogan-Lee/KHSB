import { describe, expect, it } from "vitest";

import {
  addMonthsClamped,
  calcInvoiceAmount,
  coverageEndAfterRefund,
  dateKey,
  invoiceDisplayStatus,
  isBillingDue,
  kstDateOf,
  nextPeriodStart,
  monthEndOf,
  calendarPeriodEnd,
  normalizeCashReceiptIdentifier,
  normalizeExtraItems,
  parseDateKey,
  parseReminderDays,
  periodEndFor,
  periodsOverlap,
  refundableAmount,
  refundState,
  splitTax,
  renewalReminderDay,
  suggestRefund,
  unpaidReminderOffset,
} from "@/lib/tuition/calc";

const d = (key: string) => parseDateKey(key) as Date;

describe("날짜", () => {
  it("없는 날짜·잘못된 형식은 null", () => {
    expect(parseDateKey("2026-02-30")).toBeNull();
    expect(parseDateKey("2026-2-3")).toBeNull();
    expect(dateKey(d("2026-11-01"))).toBe("2026-11-01");
  });

  it("KST 달력 날짜 — UTC 로는 전날 저녁이어도 KST 날짜를 쓴다", () => {
    expect(dateKey(kstDateOf(new Date("2026-10-31T15:30:00.000Z")))).toBe("2026-11-01");
    expect(dateKey(kstDateOf(new Date("2026-10-31T14:59:00.000Z")))).toBe("2026-10-31");
  });

  it("달 더하기는 말일을 넘지 않는다", () => {
    expect(dateKey(addMonthsClamped(d("2026-01-31"), 1))).toBe("2026-02-28");
    expect(dateKey(addMonthsClamped(d("2028-01-31"), 1))).toBe("2028-02-29");
    expect(dateKey(addMonthsClamped(d("2026-11-15"), 3))).toBe("2027-02-15");
  });

  it("이용 기간 종료일", () => {
    expect(dateKey(periodEndFor(d("2026-11-01"), 1))).toBe("2026-11-30");
    expect(dateKey(periodEndFor(d("2026-11-15"), 3))).toBe("2027-02-14");
    expect(dateKey(periodEndFor(d("2027-01-01"), 2))).toBe("2027-02-28");
  });

  it("기간 겹침 — 끝과 시작이 같은 날이면 겹친다", () => {
    expect(periodsOverlap(d("2026-11-01"), d("2026-11-30"), d("2026-11-30"), d("2026-12-29"))).toBe(true);
    expect(periodsOverlap(d("2026-11-01"), d("2026-11-30"), d("2026-12-01"), d("2026-12-31"))).toBe(false);
  });
});

describe("calcInvoiceAmount", () => {
  it("월 수강료 × 개월 − 할인", () => {
    expect(calcInvoiceAmount({ monthlyFee: 690_000, months: 3, discount: 70_000 })).toEqual({
      ok: true,
      tuition: 2_070_000,
      extraTotal: 0,
      gross: 2_070_000,
      discount: 70_000,
      amount: 2_000_000,
    });
  });

  it("잘못된 입력은 사유와 함께 거절", () => {
    expect(calcInvoiceAmount({ monthlyFee: 0, months: 1 }).ok).toBe(false);
    expect(calcInvoiceAmount({ monthlyFee: 690_000.5, months: 1 }).ok).toBe(false);
    expect(calcInvoiceAmount({ monthlyFee: 690_000, months: 0 }).ok).toBe(false);
    expect(calcInvoiceAmount({ monthlyFee: 690_000, months: 13 }).ok).toBe(false);
    expect(calcInvoiceAmount({ monthlyFee: 690_000, months: 1, discount: -1 }).ok).toBe(false);
    expect(calcInvoiceAmount({ monthlyFee: 690_000, months: 1, discount: 690_000 }).ok).toBe(false);
  });
});

describe("상태", () => {
  it("기한 당일은 연체가 아니고, 다음 날부터 연체", () => {
    const invoice = { status: "REQUESTED" as const, dueDate: d("2026-11-05") };
    expect(invoiceDisplayStatus(invoice, d("2026-11-05"))).toBe("REQUESTED");
    expect(invoiceDisplayStatus(invoice, d("2026-11-06"))).toBe("OVERDUE");
  });

  it("납부·취소된 청구서는 기한이 지나도 연체가 아니다", () => {
    expect(invoiceDisplayStatus({ status: "PAID", dueDate: d("2026-11-05") }, d("2026-12-01"))).toBe("PAID");
    expect(invoiceDisplayStatus({ status: "CANCELED", dueDate: d("2026-11-05") }, d("2026-12-01"))).toBe(
      "CANCELED",
    );
  });

  it("환불 가능액은 처리 중 환불까지 뺀다", () => {
    expect(refundableAmount({ paidAmount: 690_000, refundedAmount: 100_000, pendingRefundAmount: 90_000 })).toBe(
      500_000,
    );
    expect(refundableAmount({ paidAmount: 690_000, refundedAmount: 690_000, pendingRefundAmount: 10 })).toBe(0);
  });
});

describe("suggestRefund", () => {
  const base = {
    paidAmount: 690_000,
    refundable: 690_000,
    periodStart: d("2026-11-01"),
    periodEnd: d("2026-11-30"),
    months: 1,
  };

  it("일할 — 남은 일수 비율, 10원 미만 절사", () => {
    const s = suggestRefund({ ...base, policy: "DAILY", lastUsedDate: d("2026-11-10") });
    expect(s.usedDays).toBe(10);
    expect(s.remainingDays).toBe(20);
    expect(s.amount).toBe(460_000);

    const odd = suggestRefund({ ...base, policy: "DAILY", lastUsedDate: d("2026-11-07") });
    // 690000 × 23/30 = 529000
    expect(odd.amount).toBe(529_000);
  });

  it("이용 전이면 전액, 종료일 이후면 0", () => {
    expect(suggestRefund({ ...base, policy: "DAILY", lastUsedDate: null }).amount).toBe(690_000);
    expect(suggestRefund({ ...base, policy: "DAILY", lastUsedDate: d("2026-10-31") }).amount).toBe(690_000);
    expect(suggestRefund({ ...base, policy: "DAILY", lastUsedDate: d("2026-11-30") }).amount).toBe(0);
    expect(suggestRefund({ ...base, policy: "DAILY", lastUsedDate: d("2026-12-15") }).amount).toBe(0);
  });

  it("환불 가능액을 넘지 않는다", () => {
    const s = suggestRefund({ ...base, refundable: 100_000, policy: "DAILY", lastUsedDate: d("2026-11-10") });
    expect(s.amount).toBe(100_000);
  });

  it("직접 입력 방식은 제안 금액이 0", () => {
    expect(suggestRefund({ ...base, policy: "MANUAL", lastUsedDate: d("2026-11-10") }).amount).toBe(0);
  });

  it("학원법 구간식 — 이용 중인 달은 구간, 시작 전인 달은 전액", () => {
    const three = {
      paidAmount: 2_070_000,
      refundable: 2_070_000,
      periodStart: d("2026-11-01"),
      periodEnd: d("2027-01-31"),
      months: 3,
      policy: "ACADEMY_LAW" as const,
    };
    // 11월 30일 중 5일 이용(1/3 전) → 690000×2/3 = 460000, 12·1월 전액 1380000
    expect(suggestRefund({ ...three, lastUsedDate: d("2026-11-05") }).amount).toBe(1_840_000);
    // 11월 30일 중 12일 이용(1/3 경과, 1/2 전) → 345000 + 1380000
    expect(suggestRefund({ ...three, lastUsedDate: d("2026-11-12") }).amount).toBe(1_725_000);
    // 11월 30일 중 20일 이용(1/2 경과) → 0 + 1380000
    expect(suggestRefund({ ...three, lastUsedDate: d("2026-11-20") }).amount).toBe(1_380_000);
    // 12월 31일 중 3일 이용 → 11월 0, 12월 460000, 1월 690000
    expect(suggestRefund({ ...three, lastUsedDate: d("2026-12-03") }).amount).toBe(1_150_000);
  });

  it("강한선배 환불 규정 예시 그대로 (교습기간 30일 · 정규반 550,000원, 천 원 미만 절사)", () => {
    const regular = {
      policy: "ACADEMY_LAW" as const,
      paidAmount: 550_000,
      refundable: 550_000,
      periodStart: d("2026-11-01"),
      periodEnd: d("2026-11-30"),
      months: 1,
    };
    expect(suggestRefund({ ...regular, lastUsedDate: null }).amount).toBe(550_000);
    // 9일 수강 → 1/3 경과 전 2/3: 366,666 → 366,000
    const nine = suggestRefund({ ...regular, lastUsedDate: d("2026-11-09") });
    expect(nine.amount).toBe(366_000);
    expect(nine.lines).toEqual([
      expect.objectContaining({ label: null, totalDays: 30, usedDays: 9, rule: "TWO_THIRDS", amount: 366_000 }),
    ]);
    expect(nine.basis).toBe("학원법 구간식 — 30일 중 9일 이용(1/3 경과 전 2/3) 366,000원 (천 원 미만 절사)");
    // 딱 1/3(10일)이 지나면 1/2 구간
    expect(suggestRefund({ ...regular, lastUsedDate: d("2026-11-10") }).lines[0].rule).toBe("HALF");
    expect(suggestRefund({ ...regular, lastUsedDate: d("2026-11-14") }).amount).toBe(275_000);
    expect(suggestRefund({ ...regular, lastUsedDate: d("2026-11-15") }).amount).toBe(0);
  });

  it("세 달 선등록 — 이용 중인 달은 구간, 남은 달은 전액, 나머지 원 단위는 마지막 달 몫", () => {
    const s = suggestRefund({
      policy: "ACADEMY_LAW",
      paidAmount: 1_530_001,
      refundable: 1_530_001,
      periodStart: d("2027-01-01"),
      periodEnd: d("2027-03-31"),
      months: 3,
      lastUsedDate: d("2027-01-09"),
    });
    expect(s.lines.map((line) => [line.label, line.rule, line.share, line.amount])).toEqual([
      ["1개월차", "TWO_THIRDS", 510_000, 340_000],
      ["2개월차", "FULL", 510_000, 510_000],
      ["3개월차", "FULL", 510_001, 510_001],
    ]);
    expect(s.amount).toBe(1_360_001);
    expect(s.basis).toContain("시작 전 2개월 전액 1,020,001원");
  });

  it("일할 첫 달이 있는 청구서(15일 이후 입실) — 첫 구간은 입실일~말일, 다음 달 몫은 월 수강료", () => {
    // 10/20~11/30 · 12일 × 18,000 + 550,000 = 766,000
    const combined = {
      policy: "ACADEMY_LAW" as const,
      paidAmount: 766_000,
      refundable: 766_000,
      periodStart: d("2026-10-20"),
      periodEnd: d("2026-11-30"),
      months: 2,
      monthlyFee: 550_000,
    };
    const s = suggestRefund({ ...combined, lastUsedDate: d("2026-10-22") });
    expect(s.lines.map((line) => [line.label, dateKey(line.start), dateKey(line.end), line.share, line.rule, line.amount])).toEqual([
      // 12일 중 3일 이용(1/3 전) → 216,000 × 2/3 = 144,000
      ["1개월차", "2026-10-20", "2026-10-31", 216_000, "TWO_THIRDS", 144_000],
      ["2개월차", "2026-11-01", "2026-11-30", 550_000, "FULL", 550_000],
    ]);
    expect(s.amount).toBe(694_000);
  });

  it("환불 가능 금액을 넘으면 깎고, 깎기 전 합계를 남긴다", () => {
    const s = suggestRefund({ ...base, refundable: 100_000, policy: "ACADEMY_LAW", lastUsedDate: d("2026-11-05") });
    expect(s).toMatchObject({ amount: 100_000, cappedFrom: 460_000 });
  });
});

describe("이용 종료일·다음 청구", () => {
  it("환불하면 이용 종료일이 마지막 이용일로 당겨진다", () => {
    const start = d("2026-11-01");
    const end = d("2026-11-30");
    expect(dateKey(coverageEndAfterRefund(start, end, d("2026-11-10")))).toBe("2026-11-10");
    expect(dateKey(coverageEndAfterRefund(start, end, null))).toBe("2026-10-31");
    expect(dateKey(coverageEndAfterRefund(start, end, d("2026-12-25")))).toBe("2026-11-30");
  });

  it("납부한 기간이 있으면 그 다음 날부터", () => {
    expect(
      dateKey(nextPeriodStart({ coverageEnd: d("2026-11-30"), enrolledOn: d("2026-03-15"), today: d("2026-11-20") })),
    ).toBe("2026-12-01");
  });

  it("결제 기준일이 납부한 기간보다 뒤면 그 날부터, 아니면 무시한다", () => {
    const base = { enrolledOn: d("2026-03-15"), today: d("2026-11-20") };
    // 납부 이력 없음 — 등록일(15일) 대신 등록해 둔 기준일
    expect(dateKey(nextPeriodStart({ ...base, coverageEnd: null, anchor: d("2026-11-25") }))).toBe("2026-11-25");
    // 지난 날짜여도 발행하기 전까지는 그대로 (조용히 다음 달로 넘어가지 않는다)
    expect(dateKey(nextPeriodStart({ ...base, coverageEnd: null, anchor: d("2026-10-25") }))).toBe("2026-10-25");
    // 쉬었다가 다시 다니는 날짜를 정해 둔 경우
    expect(dateKey(nextPeriodStart({ ...base, coverageEnd: d("2026-09-30"), anchor: d("2026-11-25") }))).toBe(
      "2026-11-25",
    );
    // 기준일로 낸 청구서가 납부되면 그 뒤로는 납부한 기간에 이어서
    expect(dateKey(nextPeriodStart({ ...base, coverageEnd: d("2026-12-24"), anchor: d("2026-11-25") }))).toBe(
      "2026-12-25",
    );
    expect(dateKey(nextPeriodStart({ ...base, coverageEnd: d("2026-11-25"), anchor: d("2026-11-25") }))).toBe(
      "2026-11-26",
    );
  });

  it("납부 이력이 없으면 등록일 주기에서 오늘이 속한 회차 시작일", () => {
    expect(
      dateKey(nextPeriodStart({ coverageEnd: null, enrolledOn: d("2026-03-15"), today: d("2026-11-20") })),
    ).toBe("2026-11-15");
    expect(
      dateKey(nextPeriodStart({ coverageEnd: null, enrolledOn: d("2026-03-15"), today: d("2026-11-10") })),
    ).toBe("2026-10-15");
    expect(
      dateKey(nextPeriodStart({ coverageEnd: null, enrolledOn: d("2026-12-01"), today: d("2026-11-10") })),
    ).toBe("2026-12-01");
    expect(dateKey(nextPeriodStart({ coverageEnd: null, enrolledOn: null, today: d("2026-11-10") }))).toBe(
      "2026-11-10",
    );
  });

  it("청구 예정 — 시작일이 leadDays 안이거나 이미 지났으면 대상", () => {
    expect(isBillingDue(d("2026-12-01"), d("2026-11-24"), 7)).toBe(true);
    expect(isBillingDue(d("2026-12-01"), d("2026-11-23"), 7)).toBe(false);
    expect(isBillingDue(d("2026-11-01"), d("2026-11-24"), 7)).toBe(true);
  });
});

describe("안내 시점", () => {
  it("미납 안내 — 기한 전날·당일·3일 뒤·7일 뒤만", () => {
    const due = d("2026-11-05");
    expect(unpaidReminderOffset(due, d("2026-11-04"))).toBe(-1);
    expect(unpaidReminderOffset(due, d("2026-11-05"))).toBe(0);
    expect(unpaidReminderOffset(due, d("2026-11-06"))).toBeNull();
    expect(unpaidReminderOffset(due, d("2026-11-08"))).toBe(3);
    expect(unpaidReminderOffset(due, d("2026-11-12"))).toBe(7);
  });

  it("재결제 안내 — 설정한 N일 전에만", () => {
    expect(parseReminderDays("3, 7,7,x,-1,99")).toEqual([7, 3]);
    expect(parseReminderDays(null)).toEqual([]);
    expect(renewalReminderDay(d("2026-11-30"), d("2026-11-23"), [7, 3])).toBe(7);
    expect(renewalReminderDay(d("2026-11-30"), d("2026-11-27"), [7, 3])).toBe(3);
    expect(renewalReminderDay(d("2026-11-30"), d("2026-11-25"), [7, 3])).toBeNull();
  });
});

describe("refundState — 환불 합계·상태·이용 종료일 재계산", () => {
  const base = { paidAmount: 690_000, periodStart: d("2026-11-01"), periodEnd: d("2026-11-30") };
  const staff = (amount: number, effectiveDate: Date | null) => ({ amount, effectiveDate, byStaff: true });
  const external = (amount: number) => ({ amount, effectiveDate: null, byStaff: false });

  it("환불이 없으면 납부 완료, 이용 기간 그대로", () => {
    const state = refundState({ ...base, refunds: [] });
    expect(state).toMatchObject({ refunded: 0, status: "PAID" });
    expect(dateKey(state.coverageEnd as Date)).toBe("2026-11-30");
  });

  it("일부 환불 — 마지막 이용일로 이용 종료일을 당긴다", () => {
    const state = refundState({ ...base, refunds: [staff(460_000, d("2026-11-10"))] });
    expect(state).toMatchObject({ refunded: 460_000, status: "PARTIALLY_REFUNDED" });
    expect(dateKey(state.coverageEnd as Date)).toBe("2026-11-10");
  });

  it("이용 전 환불(시작 전날)은 이용 기간 없음", () => {
    const state = refundState({ ...base, refunds: [staff(690_000, d("2026-10-31"))] });
    expect(state).toMatchObject({ refunded: 690_000, status: "REFUNDED", coverageEnd: null });
  });

  it("이용 기간을 지정하지 않은 운영진 환불은 이용 기간을 유지한다 (전액이어도)", () => {
    const partial = refundState({ ...base, refunds: [staff(100_000, null)] });
    expect(dateKey(partial.coverageEnd as Date)).toBe("2026-11-30");
    const full = refundState({ ...base, refunds: [staff(690_000, null)] });
    expect(full.status).toBe("REFUNDED");
    expect(dateKey(full.coverageEnd as Date)).toBe("2026-11-30");
  });

  it("결제사에서 직접 전액 취소되면 이용 기간 없음, 일부 취소면 그대로", () => {
    expect(refundState({ ...base, refunds: [external(690_000)] }).coverageEnd).toBeNull();
    const partial = refundState({ ...base, refunds: [external(100_000)] });
    expect(partial.status).toBe("PARTIALLY_REFUNDED");
    expect(dateKey(partial.coverageEnd as Date)).toBe("2026-11-30");
  });

  it("여러 번 환불하면 가장 이른 마지막 이용일을 쓰고, 합계는 납부액을 넘지 않는다", () => {
    const state = refundState({
      ...base,
      refunds: [staff(200_000, d("2026-11-20")), staff(300_000, d("2026-11-12")), external(400_000)],
    });
    expect(state.refunded).toBe(690_000);
    expect(state.status).toBe("REFUNDED");
    expect(dateKey(state.coverageEnd as Date)).toBe("2026-11-12");
  });
});

describe("추가 청구 항목 · 세금 · 자동 청구", () => {
  it("추가 항목은 수강료에 더해진다", () => {
    const result = calcInvoiceAmount({
      monthlyFee: 690_000,
      months: 1,
      discount: 10_000,
      extraItems: [
        { name: "교재비", amount: 30_000 },
        { name: "모의고사", amount: 15_000 },
      ],
    });
    expect(result).toMatchObject({ ok: true, tuition: 690_000, extraTotal: 45_000, gross: 735_000, amount: 725_000 });
  });

  it("추가 항목 검증 — 이름·금액이 잘못된 줄은 거절", () => {
    expect(normalizeExtraItems(undefined)).toEqual({ ok: true, items: [] });
    expect(normalizeExtraItems([{ name: " 교재비 ", amount: 30_000 }])).toEqual({
      ok: true,
      items: [{ name: "교재비", amount: 30_000 }],
    });
    expect(normalizeExtraItems([{ name: "", amount: 1000 }]).ok).toBe(false);
    expect(normalizeExtraItems([{ name: "교재비", amount: -1 }]).ok).toBe(false);
    expect(normalizeExtraItems([{ name: "교재비", amount: 1000.5 }]).ok).toBe(false);
    expect(normalizeExtraItems([{ name: "교재비", amount: "1000" }]).ok).toBe(false);
    expect(normalizeExtraItems("교재비").ok).toBe(false);
    expect(normalizeExtraItems(Array.from({ length: 11 }, () => ({ name: "x", amount: 1 }))).ok).toBe(false);
  });

  it("과세면 부가세 10%가 포함된 금액으로 나누고, 면세면 전액이 공급가액", () => {
    expect(splitTax(11_000, "TAXABLE")).toEqual({ supplyAmount: 10_000, taxAmount: 1_000 });
    expect(splitTax(690_000, "TAXABLE")).toEqual({ supplyAmount: 627_273, taxAmount: 62_727 });
    expect(splitTax(690_000, "EXEMPT")).toEqual({ supplyAmount: 690_000, taxAmount: 0 });
  });

  it("달력 기준 기간 — 그달 말일, 시작한 달부터 N번째 달 말일", () => {
    expect(dateKey(monthEndOf(d("2027-02-10")))).toBe("2027-02-28");
    expect(dateKey(calendarPeriodEnd(d("2026-10-20"), 1))).toBe("2026-10-31");
    expect(dateKey(calendarPeriodEnd(d("2026-10-20"), 2))).toBe("2026-11-30");
    expect(dateKey(calendarPeriodEnd(d("2026-11-01"), 3))).toBe("2027-01-31");
  });

  it("일할 청구 — 첫 달은 일수 × 일 단가(월 수강료를 넘지 않게), 나머지 달은 월 수강료", () => {
    // 정규반 10/7 입실: 25일 × 18,000
    expect(calcInvoiceAmount({ monthlyFee: 550_000, months: 1, prorated: { days: 25, dailyRate: 18_000 } })).toMatchObject({
      ok: true,
      tuition: 450_000,
    });
    // 10/20 입실: 12일 일할 + 11월 한 달
    expect(calcInvoiceAmount({ monthlyFee: 550_000, months: 2, prorated: { days: 12, dailyRate: 18_000 } })).toMatchObject({
      tuition: 216_000 + 550_000,
    });
    expect(calcInvoiceAmount({ monthlyFee: 550_000, months: 1, prorated: { days: 31, dailyRate: 18_000 } })).toMatchObject({
      tuition: 550_000,
    });
    expect(calcInvoiceAmount({ monthlyFee: 550_000, months: 1, prorated: { days: 0, dailyRate: 18_000 } }).ok).toBe(false);
  });
});

describe("현금영수증 발급 번호", () => {
  it("소득공제는 휴대폰번호 — 구분 기호를 떼고 숫자만 남긴다", () => {
    expect(normalizeCashReceiptIdentifier("INCOME", "010-1234-5678")).toEqual({ ok: true, identifier: "01012345678" });
    expect(normalizeCashReceiptIdentifier("INCOME", " 011 234 5678 ")).toEqual({ ok: true, identifier: "0112345678" });
    // 국세청 자진 발급 번호
    expect(normalizeCashReceiptIdentifier("INCOME", "010-000-1234")).toEqual({ ok: true, identifier: "0100001234" });
  });

  it("지출증빙은 사업자등록번호 10자리", () => {
    expect(normalizeCashReceiptIdentifier("EXPENSE", "123-45-67890")).toEqual({ ok: true, identifier: "1234567890" });
    expect(normalizeCashReceiptIdentifier("EXPENSE", "123-45-6789")).toMatchObject({ ok: false });
  });

  it("주민등록번호·일반 전화번호·빈 값은 받지 않는다", () => {
    for (const raw of ["900101-1234567", "02-123-4567", "", "010-12-34", undefined as never]) {
      expect(normalizeCashReceiptIdentifier("INCOME", raw)).toMatchObject({ ok: false });
    }
  });
});
