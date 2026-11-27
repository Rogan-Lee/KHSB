import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { monthlyReport: { update: vi.fn() } } }));
vi.mock("@/lib/mobile-push", () => ({ queueParentReportPush: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateReportMentoringSummary } from "@/actions/reports";
import { mockSession } from "./_helpers";

describe("updateReportMentoringSummary — AI 출처 칸", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession({ role: "DIRECTOR" }) as never);
  });
  const data = () => vi.mocked(prisma.monthlyReport.update).mock.calls[0][0].data;

  it("직접 쓴 종합의견은 false", async () => {
    await updateReportMentoringSummary("mr1", "직접 쓴 의견");
    expect(data()).toEqual({ mentoringSummary: "직접 쓴 의견", mentoringSummaryAi: false });
  });

  it("AI 요약 초안에서 시작한 글은 true", async () => {
    await updateReportMentoringSummary("mr1", "AI 요약을 고친 의견", true);
    expect(data()).toEqual({ mentoringSummary: "AI 요약을 고친 의견", mentoringSummaryAi: true });
  });
});
