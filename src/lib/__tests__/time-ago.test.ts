import { describe, expect, it } from "vitest";
import { timeAgo } from "@/lib/utils";

describe("timeAgo", () => {
  const now = "2026-11-26T12:00:00.000Z";
  const ago = (ms: number) => new Date(Date.parse(now) - ms).toISOString();

  it("분·시간·일 단위로 줄여 보여 준다", () => {
    expect(timeAgo(ago(30_000), now)).toBe("방금");
    expect(timeAgo(ago(5 * 60_000), now)).toBe("5분 전");
    expect(timeAgo(ago(3 * 3_600_000), now)).toBe("3시간 전");
    expect(timeAgo(ago(2 * 86_400_000), now)).toBe("2일 전");
  });

  it("30일이 넘으면 날짜로", () => {
    expect(timeAgo("2026-09-01T03:00:00.000Z", now)).toBe("2026. 09. 01.");
  });
});
