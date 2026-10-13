import { beforeEach, describe, expect, it, vi } from "vitest";

// 자동 청구 — 누구에게 언제 발행하는지 (발행 자체는 issueInvoice 가 한다).

vi.mock("@/lib/prisma", () => ({
  prisma: { tuitionInvoice: { findMany: vi.fn(), count: vi.fn() } },
}));
vi.mock("@/lib/slack", () => ({ notifySlack: vi.fn() }));
vi.mock("@/lib/tuition/invoice", () => ({ issueInvoice: vi.fn() }));
vi.mock("@/lib/tuition/notices", () => ({ sendTuitionNotice: vi.fn() }));
vi.mock("@/lib/tuition/provider-registry", () => ({ getTuitionProvider: vi.fn(() => null) }));
vi.mock("@/lib/tuition/refund", () => ({ failRefund: vi.fn(), processRefund: vi.fn() }));
vi.mock("@/lib/tuition/settle", () => ({ applyProviderOrderNow: vi.fn() }));
vi.mock("@/lib/tuition/settings", () => ({ getTuitionSetting: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { notifySlack } from "@/lib/slack";
import { issueInvoice } from "@/lib/tuition/invoice";
import { runTuitionAutoIssue } from "@/lib/tuition/reconcile";
import { getTuitionSetting } from "@/lib/tuition/settings";
import { TuitionError } from "@/lib/tuition/types";

// KST 2026-10-28 오전 10시
const NOW = new Date("2026-10-28T01:00:00.000Z");
const day = (key: string) => new Date(`${key}T00:00:00.000Z`);

const SETTING = {
  defaultMonthlyFee: 300_000,
  dueDays: 7,
  leadDays: 7,
  reminderDays: "7,3",
  refundPolicy: "DAILY" as const,
  onlinePaymentEnabled: true,
  taxType: "EXEMPT" as const,
  autoIssueEnabled: true,
  autoIssueLeadDays: 3,
  guideText: null,
  onsiteGuideText: null,
};

function ending(
  studentId: string,
  coverageEnd: string,
  profile: { monthlyFee?: number | null; billingPaused?: boolean; billingAnchor?: string } | null = null,
) {
  return {
    studentId,
    coverageEnd: day(coverageEnd),
    student: {
      name: `학생-${studentId}`,
      tuitionProfile: profile
        ? {
            monthlyFee: profile.monthlyFee ?? null,
            billingPaused: profile.billingPaused ?? false,
            billingAnchor: profile.billingAnchor ? day(profile.billingAnchor) : null,
          }
        : null,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTuitionSetting).mockResolvedValue(SETTING);
  vi.mocked(prisma.tuitionInvoice.findMany).mockResolvedValue([]);
  vi.mocked(prisma.tuitionInvoice.count).mockResolvedValue(0);
  vi.mocked(issueInvoice).mockResolvedValue({ invoiceId: "inv-new" });
});

describe("runTuitionAutoIssue", () => {
  it("꺼져 있으면 조회도 하지 않는다", async () => {
    vi.mocked(getTuitionSetting).mockResolvedValue({ ...SETTING, autoIssueEnabled: false });
    await expect(runTuitionAutoIssue(NOW)).resolves.toEqual({ issued: 0, skipped: 0 });
    expect(prisma.tuitionInvoice.findMany).not.toHaveBeenCalled();
  });

  it("이용 종료가 설정한 일수 안으로 다가온 재원생만, 종료가 7일 넘게 지난 건은 빼고 조회한다", async () => {
    await runTuitionAutoIssue(NOW);
    expect(vi.mocked(prisma.tuitionInvoice.findMany).mock.calls[0][0]?.where).toEqual({
      status: { in: ["PAID", "PARTIALLY_REFUNDED"] },
      coverageEnd: { gte: day("2026-10-21"), lte: day("2026-10-31") },
      student: { status: "ACTIVE" },
    });
  });

  it("이용 종료 다음 날부터 1개월, 납부 기한은 오늘 + 납부 기한 일수로 발행한다 (발행자 없음 = 자동 청구)", async () => {
    vi.mocked(prisma.tuitionInvoice.findMany).mockResolvedValue([
      ending("a", "2026-10-31"),
      ending("b", "2026-10-30", { monthlyFee: 280_000 }),
    ] as never);

    await expect(runTuitionAutoIssue(NOW)).resolves.toEqual({ issued: 2, skipped: 0 });

    expect(issueInvoice).toHaveBeenNthCalledWith(
      1,
      { studentId: "a", periodStart: "2026-11-01", months: 1, monthlyFee: 300_000, dueDate: "2026-11-04" },
      null,
    );
    // 학생별 수강료가 기본 수강료보다 먼저
    expect(issueInvoice).toHaveBeenNthCalledWith(
      2,
      { studentId: "b", periodStart: "2026-10-31", months: 1, monthlyFee: 280_000, dueDate: "2026-11-04" },
      null,
    );
    expect(notifySlack).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifySlack).mock.calls[0][0]).toContain("자동 청구 2건");
  });

  it("청구 제외·수강료 미설정·이미 다음 청구가 있는 학생은 건너뛴다", async () => {
    vi.mocked(getTuitionSetting).mockResolvedValue({ ...SETTING, defaultMonthlyFee: null });
    vi.mocked(prisma.tuitionInvoice.findMany).mockResolvedValue([
      ending("paused", "2026-10-31", { monthlyFee: 300_000, billingPaused: true }),
      ending("no-fee", "2026-10-31"),
      ending("has-next", "2026-10-31", { monthlyFee: 300_000 }),
      ending("ok", "2026-10-31", { monthlyFee: 300_000 }),
    ] as never);
    // has-next 만 뒤 청구서가 있다
    vi.mocked(prisma.tuitionInvoice.count).mockImplementation((async (args: { where: { studentId: string } }) =>
      args.where.studentId === "has-next" ? 1 : 0) as never);

    await expect(runTuitionAutoIssue(NOW)).resolves.toEqual({ issued: 1, skipped: 3 });
    expect(issueInvoice).toHaveBeenCalledTimes(1);
    expect(vi.mocked(issueInvoice).mock.calls[0][0].studentId).toBe("ok");
    // "다음 청구"는 아직 안 낸 청구서이거나 더 늦게 끝나는 납부 기간
    expect(vi.mocked(prisma.tuitionInvoice.count).mock.calls[0][0]?.where).toEqual({
      studentId: "has-next",
      OR: [
        { status: "REQUESTED" },
        { status: { in: ["PAID", "PARTIALLY_REFUNDED"] }, coverageEnd: { gt: day("2026-10-31") } },
      ],
    });
  });

  it("납부 기간보다 뒤로 결제 기준일을 정해 둔 학생은 이어서 청구하지 않는다", async () => {
    vi.mocked(prisma.tuitionInvoice.findMany).mockResolvedValue([
      ending("resume-later", "2026-10-31", { billingAnchor: "2026-12-01" }),
      // 이미 지난 기준일(첫 청구에 쓰고 남은 값)은 영향이 없다
      ending("old-anchor", "2026-10-31", { billingAnchor: "2026-08-01" }),
    ] as never);

    await expect(runTuitionAutoIssue(NOW)).resolves.toEqual({ issued: 1, skipped: 1 });
    expect(vi.mocked(issueInvoice).mock.calls[0][0].studentId).toBe("old-anchor");
  });

  it("학생당 가장 늦은 이용 종료일 하나만 본다", async () => {
    // coverageEnd 내림차순으로 온다
    vi.mocked(prisma.tuitionInvoice.findMany).mockResolvedValue([
      ending("a", "2026-10-31"),
      ending("a", "2026-10-25"),
    ] as never);
    await expect(runTuitionAutoIssue(NOW)).resolves.toEqual({ issued: 1, skipped: 0 });
    expect(vi.mocked(issueInvoice).mock.calls[0][0].periodStart).toBe("2026-11-01");
  });

  it("한 학생의 발행이 실패해도 다음 학생으로 넘어가고, 발행이 없으면 알리지 않는다", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(prisma.tuitionInvoice.findMany).mockResolvedValue([ending("a", "2026-10-31"), ending("b", "2026-10-31")] as never);
    vi.mocked(issueInvoice).mockRejectedValue(new TuitionError("PERIOD_OVERLAP", "이용 기간이 겹치는 청구서가 이미 있습니다", 409));

    await expect(runTuitionAutoIssue(NOW)).resolves.toEqual({ issued: 0, skipped: 2 });
    expect(issueInvoice).toHaveBeenCalledTimes(2);
    expect(notifySlack).not.toHaveBeenCalled();
    logged.mockRestore();
  });
});
