import { describe, it, expect } from "vitest";
import { encodeStudentQr, decodeStudentQr, PATROL_QR_PREFIX } from "@/lib/patrol";

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
