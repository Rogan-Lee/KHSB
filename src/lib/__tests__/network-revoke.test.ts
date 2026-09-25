import { describe, it, expect } from "vitest";
import { selectExpiredNetworkRequests } from "@/lib/network-revoke";

const now = new Date("2026-09-22T12:00:00+09:00");

describe("selectExpiredNetworkRequests", () => {
  it("적용됐고 endAt이 지난 신청만 선별한다", () => {
    const expired = {
      id: "a",
      endAt: new Date("2026-09-22T11:00:00+09:00"),
      appliedAt: new Date("2026-09-22T10:00:00+09:00"),
    };
    const active = {
      id: "b",
      endAt: new Date("2026-09-22T13:00:00+09:00"),
      appliedAt: new Date("2026-09-22T10:00:00+09:00"),
    };
    expect(selectExpiredNetworkRequests([expired, active], now)).toEqual([expired]);
  });

  it("이미 회수된 건(appliedAt=null)은 만료여도 제외한다", () => {
    const alreadyRevoked = {
      endAt: new Date("2026-09-22T11:00:00+09:00"),
      appliedAt: null,
    };
    expect(selectExpiredNetworkRequests([alreadyRevoked], now)).toEqual([]);
  });

  it("endAt == now 는 아직 만료 아님 (strict <)", () => {
    const boundary = { endAt: new Date(now), appliedAt: new Date() };
    expect(selectExpiredNetworkRequests([boundary], now)).toEqual([]);
  });
});
