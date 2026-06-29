import { describe, expect, it } from "vitest";

import {
  decodeStudentQr,
  PATROL_QR_PREFIX,
} from "../../../apps/mobile/src/lib/patrol";

describe("mobile patrol QR recognition", () => {
  it("recognizes the same payload printed on study-room seat labels", () => {
    expect(decodeStudentQr(`${PATROL_QR_PREFIX}student-123`)).toBe(
      "student-123",
    );
  });

  it("rejects unrelated QR payloads and empty student identifiers", () => {
    expect(decodeStudentQr("https://example.com")).toBeNull();
    expect(decodeStudentQr(PATROL_QR_PREFIX)).toBeNull();
    expect(decodeStudentQr(null)).toBeNull();
  });
});
