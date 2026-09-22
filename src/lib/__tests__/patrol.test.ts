import { describe, it, expect } from "vitest";
import { encodeStudentQr, decodeStudentQr, compareSeat, PATROL_QR_PREFIX } from "@/lib/patrol";

describe("compareSeat", () => {
  it("sorts seat numbers numerically (2 before 10)", () => {
    const rows = [
      { seat: "10", name: "가" },
      { seat: "2", name: "나" },
      { seat: "1", name: "다" },
    ];
    expect(rows.sort(compareSeat).map((r) => r.seat)).toEqual(["1", "2", "10"]);
  });

  it("handles prefixed seats and null seats (null last은 아니고 빈 문자열로 앞)", () => {
    const rows = [
      { seat: "A-10", name: "가" },
      { seat: "A-2", name: "나" },
      { seat: null, name: "다" },
    ];
    expect(rows.sort(compareSeat).map((r) => r.seat)).toEqual([null, "A-2", "A-10"]);
  });

  it("ties broken by name (ko locale)", () => {
    const rows = [
      { seat: "3", name: "홍길동" },
      { seat: "3", name: "김철수" },
    ];
    expect(rows.sort(compareSeat).map((r) => r.name)).toEqual(["김철수", "홍길동"]);
  });
});

describe("patrol QR payload", () => {
  it("encodes student id with prefix", () => {
    expect(encodeStudentQr("abc123")).toBe(`${PATROL_QR_PREFIX}abc123`);
  });

  it("round-trips encode → decode", () => {
    const id = "clz9k2x0001abcd";
    expect(decodeStudentQr(encodeStudentQr(id))).toBe(id);
  });

  it("returns null for non-prefixed payloads", () => {
    expect(decodeStudentQr("https://example.com")).toBeNull();
    expect(decodeStudentQr("abc123")).toBeNull();
  });

  it("returns null for empty / nullish input", () => {
    expect(decodeStudentQr("")).toBeNull();
    expect(decodeStudentQr(null)).toBeNull();
    expect(decodeStudentQr(undefined)).toBeNull();
    expect(decodeStudentQr(PATROL_QR_PREFIX)).toBeNull();
  });

  it("trims surrounding whitespace from scans", () => {
    expect(decodeStudentQr(`  ${PATROL_QR_PREFIX}xyz  `)).toBe("xyz");
  });
});
