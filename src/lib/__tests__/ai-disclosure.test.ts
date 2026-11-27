import { describe, expect, it } from "vitest";

import { aiSourceFlag, isAiOnlineReport } from "@/lib/ai-disclosure";

describe("isAiOnlineReport", () => {
  it("is true only when an AI path stamped generatedAt", () => {
    expect(isAiOnlineReport({ markdown: "# 주간", generatedAt: "2026-11-27T00:00:00.000Z" })).toBe(true);
    expect(isAiOnlineReport({ markdown: "# 주간" })).toBe(false);
    expect(isAiOnlineReport({ queued: true, systemPrompt: "s", userPrompt: "u" })).toBe(false);
    expect(isAiOnlineReport({ markdown: "x", generatedAt: 123 })).toBe(false);
    expect(isAiOnlineReport(null)).toBe(false);
    expect(isAiOnlineReport("generatedAt")).toBe(false);
  });
});

describe("aiSourceFlag", () => {
  it("AI 초안에서 시작한 글만 true, 직접 쓴 글·빈 글은 false", () => {
    expect(aiSourceFlag("AI 가 다듬은 글", true)).toBe(true);
    expect(aiSourceFlag("직접 쓴 글", false)).toBe(false);
    expect(aiSourceFlag("직접 쓴 글", undefined)).toBe(false);
    expect(aiSourceFlag("  ", true)).toBe(false);
    expect(aiSourceFlag(null, true)).toBe(false);
  });
});
