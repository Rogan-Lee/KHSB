import { describe, expect, it } from "vitest";

import { getSeatLayoutRooms, TOTAL_SEATS } from "@/lib/seat-layout";

describe("getSeatLayoutRooms", () => {
  it("K·H룸을 합치면 1~89번 좌석이 한 번씩만 나온다", () => {
    const seats = getSeatLayoutRooms().flatMap((room) => [
      ...room.blocks.flat(2).filter((n): n is number => n !== null),
      ...room.bottom.flatMap((b) => (b.kind === "seat" ? [b.seat] : [])),
    ]);
    expect(seats).toHaveLength(TOTAL_SEATS);
    expect(new Set(seats).size).toBe(TOTAL_SEATS);
    expect(Math.min(...seats)).toBe(1);
    expect(Math.max(...seats)).toBe(TOTAL_SEATS);
  });

  it("H룸 열은 모두 같은 칸 수(계단형 정렬)", () => {
    const h = getSeatLayoutRooms().find((r) => r.key === "H")!;
    const lengths = new Set(h.blocks.flat(1).map((col) => col.length));
    expect(lengths.size).toBe(1);
  });
});
