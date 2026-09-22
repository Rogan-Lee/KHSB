import { describe, it, expect } from "vitest";
import { calcPointBalance, pointsToKrw, POINTS_PER_10000_KRW } from "@/lib/points";

describe("calcPointBalance", () => {
  it("빈 입력이면 전부 0", () => {
    expect(calcPointBalance({ merits: [] })).toEqual({
      merit: 0,
      demerit: 0,
      spent: 0,
      balance: 0,
    });
  });

  it("상점 − 벌점 − 승인/지급된 교환 포인트만 차감", () => {
    const result = calcPointBalance({
      merits: [
        { type: "MERIT", points: 30 },
        { type: "MERIT", points: 20 },
        { type: "DEMERIT", points: 5 },
      ],
      redemptions: [
        { status: "APPROVED", points: 10 },
        { status: "FULFILLED", points: 5 },
        { status: "PENDING", points: 100 }, // 차감 안 됨
        { status: "REJECTED", points: 100 }, // 차감 안 됨
      ],
    });
    expect(result).toEqual({ merit: 50, demerit: 5, spent: 15, balance: 30 });
  });

  it("잔액은 음수가 될 수 있다(원장 없음, 계산 결과 그대로)", () => {
    const result = calcPointBalance({
      merits: [{ type: "DEMERIT", points: 10 }],
    });
    expect(result.balance).toBe(-10);
  });
});

describe("pointsToKrw", () => {
  it("25점 = 10,000원", () => {
    expect(POINTS_PER_10000_KRW).toBe(25);
    expect(pointsToKrw(25)).toBe(10000);
    expect(pointsToKrw(50)).toBe(20000);
  });

  it("반올림 처리", () => {
    expect(pointsToKrw(1)).toBe(400);
    expect(pointsToKrw(13)).toBe(5200);
  });
});
