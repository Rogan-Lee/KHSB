import { beforeEach, describe, expect, it, vi } from "vitest";

// 자동 청구 — 청구 일정에서 발행일이 된 학생만, 막힌 학생은 내지 않고 알린다 (발행 자체는 issueInvoice 가 한다).

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/slack", () => ({ notifySlack: vi.fn() }));
vi.mock("@/lib/tuition/invoice", () => ({ issueInvoice: vi.fn() }));
vi.mock("@/lib/tuition/notices", () => ({ sendTuitionNotice: vi.fn() }));
vi.mock("@/lib/tuition/provider-registry", () => ({ getTuitionProvider: vi.fn(() => null) }));
vi.mock("@/lib/tuition/refund", () => ({ failRefund: vi.fn(), processRefund: vi.fn() }));
vi.mock("@/lib/tuition/settle", () => ({ applyProviderOrderNow: vi.fn() }));
vi.mock("@/lib/tuition/settings", () => ({ getTuitionSetting: vi.fn() }));
vi.mock("@/lib/tuition/schedule-data", () => ({ loadTuitionSchedule: vi.fn() }));

import { notifySlack } from "@/lib/slack";
import { issueInvoice } from "@/lib/tuition/invoice";
import { runTuitionAutoIssue } from "@/lib/tuition/reconcile";
import { DEFAULT_TUITION_PRICING, planOf } from "@/lib/tuition/pricing";
import { planStudentSchedule, type StudentScheduleInput } from "@/lib/tuition/schedule";
import { loadTuitionSchedule, type ScheduleStudent } from "@/lib/tuition/schedule-data";
import { getTuitionSetting } from "@/lib/tuition/settings";
import { TuitionError } from "@/lib/tuition/types";

// KST 2026-10-29 오전 10시
const NOW = new Date("2026-10-29T01:00:00.000Z");
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
  pricing: DEFAULT_TUITION_PRICING,
};

/** 실제 청구 일정 계산으로 학생 한 명을 만든다 */
function student(id: string, input: Partial<StudentScheduleInput>): ScheduleStudent {
  const full: StudentScheduleInput = {
    enrolledOn: day("2026-03-02"),
    withdrawOn: null,
    plan: planOf("정규반", DEFAULT_TUITION_PRICING),
    customMonthlyFee: null,
    anchor: null,
    billedUntil: day("2026-10-31"),
    lastMonths: 1,
    overdueCount: 0,
    holdReason: null,
    ...input,
  };
  const entries = planStudentSchedule(full, { today: day("2026-10-29"), autoIssueLeadDays: 3, pricing: DEFAULT_TUITION_PRICING });
  return {
    id,
    name: `학생-${id}`,
    grade: "고2",
    seat: null,
    status: "ACTIVE",
    planName: full.plan.name,
    monthlyFee: full.customMonthlyFee,
    effectiveMonthlyFee: full.customMonthlyFee ?? full.plan.monthlyFee,
    prepayMonthlyFee: full.customMonthlyFee ?? full.plan.prepayMonthlyFee,
    billingPaused: false,
    billingAnchor: full.anchor,
    holdReason: full.holdReason,
    memo: null,
    withdrawOn: full.withdrawOn,
    coverageEnd: full.billedUntil,
    hasOpenInvoice: false,
    nextPeriodStart: entries[0].periodStart,
    entries,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTuitionSetting).mockResolvedValue(SETTING);
  vi.mocked(loadTuitionSchedule).mockResolvedValue([]);
  vi.mocked(issueInvoice).mockResolvedValue({ invoiceId: "inv-new" });
});

describe("runTuitionAutoIssue", () => {
  it("꺼져 있으면 조회도 하지 않는다", async () => {
    vi.mocked(getTuitionSetting).mockResolvedValue({ ...SETTING, autoIssueEnabled: false });
    await expect(runTuitionAutoIssue(NOW)).resolves.toEqual({ issued: 0, skipped: 0 });
    expect(loadTuitionSchedule).not.toHaveBeenCalled();
  });

  it("발행일(이용 시작 3일 전)이 된 학생만, 납부 기한은 오늘 + 납부 기한 일수로 발행한다 (발행자 없음 = 자동 청구)", async () => {
    vi.mocked(loadTuitionSchedule).mockResolvedValue([
      student("due", { billedUntil: day("2026-10-31") }),
      student("later", { billedUntil: day("2026-11-01") }),
    ]);

    await expect(runTuitionAutoIssue(NOW)).resolves.toEqual({ issued: 1, skipped: 0 });
    expect(loadTuitionSchedule).toHaveBeenCalledWith(day("2026-10-29"), SETTING);
    expect(issueInvoice).toHaveBeenCalledWith(
      { studentId: "due", periodStart: "2026-11-01", months: 1, prorated: null, monthlyFee: 550_000, dueDate: "2026-11-05" },
      null,
    );
    expect(vi.mocked(notifySlack).mock.calls[0][0]).toContain("자동 청구 1건");
  });

  it("신규 15일 전 입실 — 그달 일할과 발행일이 된 다음 달 청구를 차례로 낸다", async () => {
    vi.mocked(loadTuitionSchedule).mockResolvedValue([student("new", { billedUntil: null, enrolledOn: day("2026-10-07") })]);

    await expect(runTuitionAutoIssue(NOW)).resolves.toEqual({ issued: 2, skipped: 0 });
    expect(vi.mocked(issueInvoice).mock.calls.map(([input]) => [input.periodStart, input.months, input.prorated])).toEqual([
      ["2026-10-07", 1, { days: 25, dailyRate: 18_000 }],
      ["2026-11-01", 1, null],
    ]);
  });

  it("신규 15일 이후 입실 — 그달 일할 + 다음 달을 한 청구서로", async () => {
    vi.mocked(loadTuitionSchedule).mockResolvedValue([student("late", { billedUntil: null, enrolledOn: day("2026-10-20") })]);

    await expect(runTuitionAutoIssue(NOW)).resolves.toEqual({ issued: 1, skipped: 0 });
    expect(vi.mocked(issueInvoice).mock.calls[0][0]).toMatchObject({
      periodStart: "2026-10-20",
      months: 2,
      prorated: { days: 12, dailyRate: 18_000 },
      monthlyFee: 550_000,
    });
  });

  it("막힌 학생은 내지 않고 사유별 인원을 슬랙으로 알린다", async () => {
    vi.mocked(loadTuitionSchedule).mockResolvedValue([
      student("overdue", { overdueCount: 1 }),
      student("leaving", { withdrawOn: day("2026-11-10") }),
      student("no-anchor", { billedUntil: null, enrolledOn: day("2026-03-02") }),
      // 아직 발행일 전이면 막혀 있어도 알리지 않는다
      student("quiet", { billedUntil: day("2026-11-20"), overdueCount: 1 }),
    ]);

    await expect(runTuitionAutoIssue(NOW)).resolves.toEqual({ issued: 0, skipped: 3 });
    expect(issueInvoice).not.toHaveBeenCalled();
    const message = vi.mocked(notifySlack).mock.calls[0][0];
    expect(message).toContain("보류한 학생 3명");
    expect(message).toContain("미납 1 · 퇴원 예정 1 · 청구 시작일 필요 1");
  });

  it("한 학생의 발행이 실패해도 다음 학생으로 넘어가고, 낸 것도 막힌 것도 없으면 알리지 않는다", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(loadTuitionSchedule).mockResolvedValue([student("a", {}), student("b", {})]);
    vi.mocked(issueInvoice).mockRejectedValue(new TuitionError("PERIOD_OVERLAP", "이용 기간이 겹치는 청구서가 이미 있습니다", 409));

    await expect(runTuitionAutoIssue(NOW)).resolves.toEqual({ issued: 0, skipped: 2 });
    expect(issueInvoice).toHaveBeenCalledTimes(2);
    expect(notifySlack).not.toHaveBeenCalled();
    logged.mockRestore();
  });
});
