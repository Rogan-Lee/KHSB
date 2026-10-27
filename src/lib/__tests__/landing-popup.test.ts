import { describe, expect, it } from "vitest";
import { isLandingPopupLive, parseLandingPopup } from "@/lib/landing-popup";

const saved = (o: object) => JSON.stringify({ active: true, title: "공지", body: "내용", until: "2026-12-31", ctaLabel: null, ctaUrl: null, updatedAt: "2026-10-27T00:00:00.000Z", ...o });

describe("landing popup", () => {
  it("마지막 날까지 보이고 다음 날 내려간다", () => {
    const p = parseLandingPopup(saved({}));
    expect(isLandingPopupLive(p, "2026-12-31")).toBe(true);
    expect(isLandingPopupLive(p, "2027-01-01")).toBe(false);
  });
  it("꺼져 있거나 제목·내용이 비면 안 뜬다, 마지막 날이 없으면 계속", () => {
    expect(isLandingPopupLive(parseLandingPopup(saved({ active: false })), "2026-10-27")).toBe(false);
    expect(isLandingPopupLive(parseLandingPopup(saved({ body: "" })), "2026-10-27")).toBe(false);
    expect(isLandingPopupLive(parseLandingPopup(saved({ until: null })), "2030-01-01")).toBe(true);
  });
  it("저장값이 없거나 깨지면 null", () => {
    expect(parseLandingPopup(null)).toBeNull();
    expect(parseLandingPopup("{oops")).toBeNull();
    expect(isLandingPopupLive(null, "2026-10-27")).toBe(false);
  });
});
