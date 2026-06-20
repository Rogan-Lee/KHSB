import { describe, expect, it } from "vitest";

import { isPublicPath } from "@/proxy";

describe("isPublicPath", () => {
  it("allows public authentication and token routes", () => {
    expect(isPublicPath("/sign-in")).toBe(true);
    expect(isPublicPath("/sign-up/invite")).toBe(true);
    expect(isPublicPath("/s/student-token")).toBe(true);
    expect(isPublicPath("/api/mobile/v1/auth/me")).toBe(true);
  });

  it("does not expose protected routes with similar prefixes", () => {
    expect(isPublicPath("/students")).toBe(false);
    expect(isPublicPath("/student-management")).toBe(false);
    expect(isPublicPath("/api/mobile/v1/attendance")).toBe(false);
  });
});
