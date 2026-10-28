import { describe, expect, it } from "vitest";

import { agingBuckets, monthlyTrend, scheduleByDay } from "@/lib/tuition/dashboard";

// 한눈에 보기 집계 — 월별 청구·수납·납부 시점, 미납 경과일, 날짜별 발행 일정.

const d = (key: string) => new Date(`${key}T00:00:00.000Z`);
const at = (iso: string) => new Date(iso);
const TODAY = d("2026-10-26");

const invoice = (patch: Partial<Parameters<typeof monthlyTrend>[0][number]>) => ({
  dueDate: d("2026-10-05"),
  amount: 550_000,
  status: "PAID",
  paidAt: at("2026-10-04T03:00:00.000Z"),
  paidAmount: 550_000,
  refundedAmount: 0,
  ...patch,
});

describe("monthlyTrend", () => {
  it("조회한 달까지 6개월, 납부 기한 달로 묶어 청구·수납·미납과 납부 시점을 센다", () => {
    const months = monthlyTrend(
      [
        invoice({}),
        // 기한 당일 밤 11시(KST)에 냄 — 기한 내
        invoice({ paidAt: at("2026-10-05T14:00:00.000Z") }),
        // 기한 다음 날 새벽(KST)에 냄 — 늦게
        invoice({ paidAt: at("2026-10-05T15:30:00.000Z") }),
        // 일부 환불 — 순수납액만
        invoice({ status: "PARTIALLY_REFUNDED", refundedAmount: 100_000 }),
        // 기한 지난 미납 · 기한 전 결제 요청
        invoice({ status: "REQUESTED", paidAt: null, paidAmount: 0 }),
        invoice({ status: "REQUESTED", paidAt: null, paidAmount: 0, dueDate: d("2026-10-30") }),
        // 취소는 빼고, 범위 밖 달도 뺀다
        invoice({ status: "CANCELED", paidAt: null, paidAmount: 0 }),
        invoice({ dueDate: d("2026-04-05") }),
        invoice({ dueDate: d("2026-05-10"), amount: 410_000, paidAmount: 410_000, paidAt: at("2026-05-09T03:00:00.000Z") }),
      ],
      d("2026-10-01"),
      TODAY,
    );
    expect(months.map((m) => m.ym)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(months[0]).toMatchObject({ billed: 410_000, received: 410_000, onTime: 1 });
    expect(months[5]).toEqual({
      ym: "2026-10",
      billed: 550_000 * 6,
      received: 550_000 * 4 - 100_000,
      unpaidAmount: 550_000 * 2,
      onTime: 3,
      late: 1,
      unpaid: 1,
    });
  });
});

describe("agingBuckets", () => {
  it("기한이 지난 날수로 1~7 · 8~14 · 15~30 · 31일 이상", () => {
    const buckets = agingBuckets(
      [
        { dueDate: "2026-10-26", amount: 1 }, // 오늘 기한 — 아직 아님
        { dueDate: "2026-10-25", amount: 100 }, // 1일
        { dueDate: "2026-10-19", amount: 200 }, // 7일
        { dueDate: "2026-10-18", amount: 300 }, // 8일
        { dueDate: "2026-09-26", amount: 400 }, // 30일
        { dueDate: "2026-09-25", amount: 500 }, // 31일
      ],
      TODAY,
    );
    expect(buckets.map((b) => [b.label, b.count, b.amount])).toEqual([
      ["1~7일", 2, 300],
      ["8~14일", 1, 300],
      ["15~30일", 1, 400],
      ["31일 이상", 1, 500],
    ]);
  });
});

describe("scheduleByDay", () => {
  it("발행일이 지난 건 오늘로 모으고, 막힌 청구는 금액에서 빼 확인 필요로 센다", () => {
    expect(
      scheduleByDay(
        [
          { issueOn: "2026-10-20", amount: 450_000, blocked: false },
          { issueOn: "2026-10-26", amount: 550_000, blocked: true },
          { issueOn: "2026-10-29", amount: 550_000, blocked: false },
          { issueOn: "2026-10-29", amount: 410_000, blocked: false },
          { issueOn: "2026-12-29", amount: 550_000, blocked: false }, // 한 달 넘게 뒤
        ],
        TODAY,
        31,
      ),
    ).toEqual([
      { date: "2026-10-26", count: 2, amount: 450_000, attention: 1 },
      { date: "2026-10-29", count: 2, amount: 960_000, attention: 0 },
    ]);
  });
});
