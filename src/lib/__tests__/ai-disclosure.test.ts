import { describe, expect, it } from "vitest";

import { isAiOnlineReport } from "@/lib/ai-disclosure";

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
