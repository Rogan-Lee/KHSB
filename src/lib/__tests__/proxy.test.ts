import { describe, expect, it } from "vitest";

import { applyHostRedirect, applyLinkOrigin } from "@/lib/apply-domain";
import { config as proxyConfig, isPublicPath } from "@/proxy";

describe("isPublicPath", () => {
  it("allows public authentication and token routes", () => {
    expect(isPublicPath("/sign-in")).toBe(true);
    expect(isPublicPath("/sign-up/invite")).toBe(true);
    expect(isPublicPath("/s/student-token")).toBe(true);
    expect(isPublicPath("/api/mobile/v1/auth/me")).toBe(true);
    expect(isPublicPath("/api/public/content")).toBe(true);
    expect(isPublicPath("/api/public/content/abc123")).toBe(true);
    // 시설 장비(사용 통제)는 세션 없이 장비 토큰으로 인증한다
    expect(isPublicPath("/api/access-agent/state")).toBe(true);
    expect(isPublicPath("/api/access-agent/report")).toBe(true);
  });

  it("lets the payment provider webhook through without a session", () => {
    // 결제사 서버가 세션 쿠키 없이 부른다 — 인증은 라우트가 주소의 토큰으로 한다
    expect(isPublicPath("/api/webhooks/toss")).toBe(true);
    expect(isPublicPath("/api/webhooks-internal")).toBe(false);
  });

  it("opens tuition bill links without a session", () => {
    // 학부모가 카카오톡으로 받은 청구서 링크 — 인증은 주소의 토큰으로 한다
    expect(isPublicPath("/bill/abcDEF123_-token")).toBe(true);
    expect(isPublicPath("/billing")).toBe(false);
  });

  it("does not expose protected routes with similar prefixes", () => {
    expect(isPublicPath("/students")).toBe(false);
    expect(isPublicPath("/student-management")).toBe(false);
    expect(isPublicPath("/api/mobile/v1/attendance")).toBe(false);
    expect(isPublicPath("/access-control")).toBe(false);
    expect(isPublicPath("/api/access-agents")).toBe(false);
  });
});

describe("proxy matcher", () => {
  const matches = (path: string) => new RegExp(`^${proxyConfig.matcher[0]}$`).test(path);
  it("시설 장비 호출은 프록시를 거치지 않는다 (30초마다 불려 호출 수를 아낀다)", () => {
    expect(matches("/api/access-agent/state")).toBe(false);
    expect(matches("/api/access-agent/report")).toBe(false);
  });
  it("그 밖의 경로는 그대로 거친다", () => {
    expect(matches("/access-control")).toBe(true);
    expect(matches("/api/cron/network-revoke")).toBe(true);
    expect(matches("/students")).toBe(true);
    expect(matches("/favicon.ico")).toBe(false);
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
