import { describe, expect, it } from "vitest";

import { applyHostRedirect, applyLinkOrigin } from "@/lib/apply-domain";
import { isPublicPath } from "@/proxy";

describe("isPublicPath", () => {
  it("allows public authentication and token routes", () => {
    expect(isPublicPath("/sign-in")).toBe(true);
    expect(isPublicPath("/sign-up/invite")).toBe(true);
    expect(isPublicPath("/s/student-token")).toBe(true);
    expect(isPublicPath("/api/mobile/v1/auth/me")).toBe(true);
    expect(isPublicPath("/api/public/content")).toBe(true);
    expect(isPublicPath("/api/public/content/abc123")).toBe(true);
  });

  it("does not expose protected routes with similar prefixes", () => {
    expect(isPublicPath("/students")).toBe(false);
    expect(isPublicPath("/student-management")).toBe(false);
    expect(isPublicPath("/api/mobile/v1/attendance")).toBe(false);
  });
});

describe("applyHostRedirect", () => {
  it("keeps /apply routes on the apply domain", () => {
    expect(applyHostRedirect("apply.kanghanseonbae.com", "/apply")).toBeNull();
    expect(applyHostRedirect("apply.kanghanseonbae.com", "/apply/abc123")).toBeNull();
    expect(applyHostRedirect("apply.kanghanseonbae.com", "/apply/guide/abc123")).toBeNull();
  });

  it("sends the apply domain root to the form", () => {
    expect(applyHostRedirect("apply.kanghanseonbae.com", "/")).toBe("https://apply.kanghanseonbae.com/apply");
  });

  it("sends everything else on the apply domain to the admin domain", () => {
    expect(applyHostRedirect("apply.kanghanseonbae.com", "/sign-in", "?next=%2Fstudents")).toBe(
      "https://admin.kanghanseonbae.com/sign-in?next=%2Fstudents",
    );
    expect(applyHostRedirect("APPLY.kanghanseonbae.com", "/students")).toBe("https://admin.kanghanseonbae.com/students");
    expect(applyHostRedirect("apply.kanghanseonbae.com", "/applyx")).toBe("https://admin.kanghanseonbae.com/applyx");
  });

  it("leaves other hosts alone", () => {
    expect(applyHostRedirect("admin.kanghanseonbae.com", "/sign-in")).toBeNull();
    expect(applyHostRedirect("khsb.vercel.app", "/")).toBeNull();
    expect(applyHostRedirect("localhost:3000", "/sign-in")).toBeNull();
    expect(applyHostRedirect(null, "/sign-in")).toBeNull();
  });
});

describe("applyLinkOrigin", () => {
  it("uses the apply domain in production", () => {
    expect(applyLinkOrigin("https://admin.kanghanseonbae.com")).toBe("https://apply.kanghanseonbae.com");
    expect(applyLinkOrigin("https://khsb.vercel.app")).toBe("https://apply.kanghanseonbae.com");
  });

  it("keeps local and preview origins", () => {
    expect(applyLinkOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    expect(applyLinkOrigin("https://khsb-abc123.vercel.app")).toBe("https://khsb-abc123.vercel.app");
    expect(applyLinkOrigin("")).toBe("");
  });
});
