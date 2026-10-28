import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    student: { findMany: vi.fn() },
    tuitionEvent: { findMany: vi.fn() },
    tuitionInvoice: { aggregate: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), groupBy: vi.fn() },
    tuitionPayment: { findMany: vi.fn() },
    tuitionRefund: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/tuition/core", () => ({
  getTuitionSetting: vi.fn(),
  isOnlinePaymentAvailable: vi.fn(),
  buildNoticeShareText: vi.fn(
    (input: { kind: string; studentName: string }, url: string | null) =>
      `[${input.kind}]\n${input.studentName} 안내${url ? `\n${url}` : ""}`,
  ),
  billUrl: vi.fn((token: string) => `https://app.test/bill/${token}`),
  getTuitionProviderInfo: vi.fn(() => null),
  refundMethodFor: vi.fn((payment: { method: string }) => (payment.method === "LINK" ? "PROVIDER" : "MANUAL")),
}));

import { prisma } from "@/lib/prisma";
import { getTuitionAdminData, getTuitionInvoiceDetail, tuitionAttentionOf } from "@/lib/tuition/admin-data";
import { getTuitionProviderInfo, getTuitionSetting, isOnlinePaymentAvailable, refundMethodFor } from "@/lib/tuition/core";
import { DEFAULT_TUITION_PRICING } from "@/lib/tuition/pricing";

const day = (key: string) => new Date(`${key}T00:00:00.000Z`);
const at = (isoString: string) => new Date(isoString);

const TODAY = day("2026-10-10");
const NOW = at("2026-10-10T03:00:00.000Z"); // KST 10월 10일 낮 12시

const SETTING = {
  defaultMonthlyFee: 300_000,
  dueDays: 7,
  leadDays: 7,
  reminderDays: "7,3",
  refundPolicy: "DAILY" as const,
  onlinePaymentEnabled: true,
  taxType: "EXEMPT" as const,
  autoIssueEnabled: false,
  autoIssueLeadDays: 3,
  guideText: null,
  onsiteGuideText: null,
  pricing: DEFAULT_TUITION_PRICING,
};

type InvoiceOverrides = Record<string, unknown> & { id: string; studentId?: string };

/** 목록 조회(INVOICE_ROW_SELECT)가 돌려주는 모양의 청구서 */
function invoiceRecord(overrides: InvoiceOverrides) {
  const { studentId = "student-a", ...rest } = overrides;
  return {
    title: "10월 수강료",
    periodStart: day("2026-10-01"),
    periodEnd: day("2026-10-31"),
    months: 1,
    monthlyFee: 300_000,
    discount: 0,
    extraItems: null,
    amount: 300_000,
    shareToken: null,
    autoIssued: false,
    dueDate: day("2026-10-05"),
    status: "REQUESTED",
    paidAt: null,
    paidAmount: 0,
    paidPaymentId: null,
    refundedAmount: 0,
    coverageEnd: null,
    needsReview: false,
    student: { id: studentId, name: `학생-${studentId}`, grade: "고2", seat: null, status: "ACTIVE" },
    payments: [],
    refunds: [],
    notices: [],
    ...rest,
  };
}

function paymentRecord(overrides: Record<string, unknown> & { id: string }) {
  return {
    method: "LINK",
    status: "DONE",
    paidAmount: 0,
    refundedAmount: 0,
    isDuplicate: false,
    providerMethod: null,
    checkoutStartedAt: null,
    depositBank: null,
    depositAccount: null,
    depositDueAt: null,
    failMessage: null,
    requestedAt: null,
    createdAt: at("2026-10-01T01:00:00.000Z"),
    cashReceipt: null,
    ...overrides,
  };
}

type PaymentFindManyArgs = { where?: { status?: string } };

/** 결제 조회는 두 번 나간다 — 현장 결제 신청(ONSITE_REQUESTED)과 현금·계좌이체 수납(DONE) */
function mockPaymentQueries(result: { onsite?: unknown[]; cash?: unknown[] }) {
  vi.mocked(prisma.tuitionPayment.findMany).mockImplementation(((args: PaymentFindManyArgs) =>
    Promise.resolve(args?.where?.status === "ONSITE_REQUESTED" ? (result.onsite ?? []) : (result.cash ?? []))) as never);
}

function studentRecord(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `학생-${id}`,
    grade: "고2",
    seat: null,
    status: "ACTIVE",
    classGroup: "정규반",
    startDate: day("2026-03-10"),
    endDate: null,
    tuitionProfile: null,
    ...overrides,
  };
}

type InvoiceFindManyArgs = { where?: { status?: string }; distinct?: string[] };

/**
 * 청구서 조회는 세 갈래다 — 목록(where.OR), 청구 일정의 학생별 마지막 납부(distinct), 결제 요청(status REQUESTED).
 * paid 는 학생별 마지막 납부 줄, open 은 결제 요청 줄 (학생 id·기간·기한만)
 */
function mockInvoiceQueries(result: {
  rows?: unknown[];
  paid?: { studentId: string; coverageEnd: Date; months?: number }[];
  open?: { studentId: string; periodEnd: Date; dueDate: Date }[];
}) {
  vi.mocked(prisma.tuitionInvoice.findMany).mockImplementation(((args: InvoiceFindManyArgs) =>
    Promise.resolve(
      args?.distinct
        ? (result.paid ?? []).map((row) => ({ months: 1, ...row }))
        : args?.where?.status === "REQUESTED"
          ? (result.open ?? []).map((row) => ({ status: "REQUESTED", ...row }))
          : (result.rows ?? []),
    )) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTuitionSetting).mockResolvedValue(SETTING);
  vi.mocked(isOnlinePaymentAvailable).mockResolvedValue(false);
  vi.mocked(getTuitionProviderInfo).mockReturnValue(null);
  vi.mocked(prisma.tuitionInvoice.findMany).mockResolvedValue([]);
  mockPaymentQueries({});
  vi.mocked(prisma.tuitionRefund.findMany).mockResolvedValue([]);
  vi.mocked(prisma.student.findMany).mockResolvedValue([]);
  vi.mocked(prisma.tuitionInvoice.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.tuitionInvoice.aggregate).mockResolvedValue({ _sum: { paidAmount: null } } as never);
  vi.mocked(prisma.tuitionEvent.findMany).mockResolvedValue([]);
});

describe("getTuitionAdminData — 권한", () => {
  it("직원에게는 금액 합계·청구 예정·학생별 수강료를 계산하지도 내려 주지도 않는다", async () => {
    vi.mocked(prisma.tuitionInvoice.findMany).mockResolvedValue([
      invoiceRecord({ id: "inv-paid", status: "PAID", paidAmount: 300_000, paidAt: at("2026-10-03T02:00:00.000Z") }),
      invoiceRecord({ id: "inv-overdue", studentId: "student-b" }),
    ] as never);

    const data = await getTuitionAdminData({ ym: "2026-10", fullAccess: false, today: TODAY, now: NOW });

    expect(data.kpi).toBeNull();
    expect(data.billingTargets).toEqual([]);
    expect(data.students).toEqual([]);
    expect(prisma.student.findMany).not.toHaveBeenCalled();
    expect(prisma.tuitionInvoice.groupBy).not.toHaveBeenCalled();
    expect(prisma.tuitionInvoice.aggregate).not.toHaveBeenCalled();

    // 청구서별 금액과 건수는 직원도 본다
    expect(data.invoices.map((row) => [row.id, row.amount, row.displayStatus])).toEqual([
      ["inv-paid", 300_000, "PAID"],
      ["inv-overdue", 300_000, "OVERDUE"],
    ]);
    expect(data.counts).toEqual({ monthInvoices: 2, requested: 0, overdue: 1, onsiteRequests: 0, cashReceiptTodo: 0 });
    expect(data.onlinePaymentAvailable).toBe(false);
  });
});

describe("getTuitionAdminData — 조회 범위", () => {
  it("달은 KST 기준으로 자른다 (청구서는 납부 기한 날짜, 환불·입금은 시각)", async () => {
    await getTuitionAdminData({ ym: "2026-10", fullAccess: true, today: TODAY, now: NOW });

    const invoiceWhere = vi.mocked(prisma.tuitionInvoice.findMany).mock.calls[0][0]?.where;
    expect(invoiceWhere?.OR?.[0]).toEqual({ dueDate: { gte: day("2026-10-01"), lte: day("2026-10-31") } });

    // KST 10월 1일 0시 = UTC 9월 30일 15시
    const range = { gte: at("2026-09-30T15:00:00.000Z"), lt: at("2026-10-31T15:00:00.000Z") };
    expect(vi.mocked(prisma.tuitionRefund.findMany).mock.calls[0][0]?.where?.OR?.[0]).toEqual({ createdAt: range });
    expect(vi.mocked(prisma.tuitionInvoice.aggregate).mock.calls[0][0].where).toEqual({ paidAt: range });
  });

  it("형식이 틀린 달은 이번 달로 본다", async () => {
    const data = await getTuitionAdminData({ ym: "2026-13", fullAccess: false, today: TODAY, now: NOW });
    expect(data.ym).toBe("2026-10");
    expect(data.today).toBe("2026-10-10");
  });
});

describe("getTuitionAdminData — 원장급", () => {
  it("이번 달 청구서·넘어온 미납·다음 달 기한을 나눠 합계를 낸다", async () => {
    vi.mocked(prisma.tuitionInvoice.findMany).mockResolvedValue([
      // 9월에 기한이 지난 미납 — 이번 달 목록에 넘어온다
      invoiceRecord({ id: "inv-carry", studentId: "student-c", title: "9월 수강료", dueDate: day("2026-09-05") }),
      // 이번 달: 납부 완료 · 일부 환불 · 취소 · 기한 전 결제 요청
      invoiceRecord({
        id: "inv-paid",
        status: "PAID",
        paidAmount: 300_000,
        paidAt: at("2026-10-03T02:00:00.000Z"),
        paidPaymentId: "pay-1",
        coverageEnd: day("2026-10-31"),
        payments: [paymentRecord({ id: "pay-1", providerMethod: "카드", paidAmount: 300_000 })],
      }),
      invoiceRecord({
        id: "inv-refunded",
        studentId: "student-b",
        status: "PARTIALLY_REFUNDED",
        paidAmount: 300_000,
        refundedAmount: 100_000,
        paidAt: at("2026-09-28T02:00:00.000Z"),
        paidPaymentId: "pay-2",
        payments: [paymentRecord({ id: "pay-2", method: "LOCAL_CURRENCY", paidAmount: 300_000, refundedAmount: 100_000 })],
      }),
      invoiceRecord({ id: "inv-canceled", studentId: "student-d", status: "CANCELED", amount: 250_000 }),
      invoiceRecord({ id: "inv-open", studentId: "student-e", amount: 280_000, dueDate: day("2026-10-15") }),
      // 다음 달 기한 — 목록에는 없고 방문 결제 선택지로만 쓴다
      invoiceRecord({ id: "inv-next", studentId: "student-f", title: "11월 수강료", dueDate: day("2026-11-01") }),
    ] as never);
    vi.mocked(prisma.tuitionInvoice.aggregate).mockResolvedValue({ _sum: { paidAmount: 880_000 } } as never);

    const data = await getTuitionAdminData({ ym: "2026-10", fullAccess: true, today: TODAY, now: NOW });

    expect(data.invoices.map((row) => row.id)).toEqual(["inv-carry", "inv-paid", "inv-refunded", "inv-canceled", "inv-open"]);
    expect(data.upcomingInvoices.map((row) => row.id)).toEqual(["inv-next"]);

    const carry = data.invoices[0];
    expect(carry).toMatchObject({ carriedOver: true, inMonth: false, displayStatus: "OVERDUE", daysToDue: -35 });
    expect(carry.noticeText).toBe("[REMIND]\n학생-student-c 안내");
    expect(carry.billUrl).toBeNull();
    expect(data.invoices[1]).toMatchObject({ paidMethodLabel: "온라인 결제(카드)", noticeText: null, carriedOver: false });
    expect(data.invoices[2].paidMethodLabel).toBe("지역화폐");
    expect(data.invoices[4]).toMatchObject({ displayStatus: "REQUESTED", daysToDue: 5 });
    expect(data.invoices[4].noticeText).toBe("[REQUEST]\n학생-student-e 안내");

    expect(data.kpi).toEqual({
      billed: 300_000 + 300_000 + 280_000, // 취소 제외
      received: 300_000 + (300_000 - 100_000),
      receivedThisMonth: 880_000,
      unpaidAmount: 300_000 + 280_000, // 넘어온 미납 + 이번 달 결제 요청 (다음 달 기한은 제외)
      unpaidCount: 2,
      overdueCount: 1,
      refunded: 100_000,
      scheduledAmount: 0,
      scheduledCount: 0,
      attentionCount: 0,
    });
    expect(data.counts).toEqual({ monthInvoices: 4, requested: 1, overdue: 1, onsiteRequests: 0, cashReceiptTodo: 0 });
  });

  it("청구 일정 — 발행일이 다가온 학생은 지금 처리, 그 뒤 한 달은 일정으로, 막힌 이유와 함께", async () => {
    const open = invoiceRecord({ id: "inv-open", studentId: "has-open", dueDate: day("2026-10-15") });
    mockInvoiceQueries({
      rows: [open],
      paid: [
        { studentId: "ending", coverageEnd: day("2026-10-14") }, // 다음 시작 10/15 — 5일 뒤
        { studentId: "ended", coverageEnd: day("2026-09-30") },
        { studentId: "far", coverageEnd: day("2026-10-31") }, // 다음 시작 11/1 — 22일 뒤
      ],
      open: [{ studentId: "has-open", periodEnd: open.periodEnd, dueDate: open.dueDate }],
    });
    vi.mocked(prisma.student.findMany).mockResolvedValue([
      studentRecord("new"),
      studentRecord("ending", { tuitionProfile: { monthlyFee: 280_000, billingPaused: false, memo: "형제 할인" } }),
      studentRecord("ended"),
      studentRecord("far"),
      studentRecord("has-open"),
      studentRecord("paused", { tuitionProfile: { monthlyFee: null, billingPaused: true, memo: null } }),
    ] as never);

    const data = await getTuitionAdminData({ ym: "2026-10", fullAccess: true, today: TODAY, now: NOW });

    expect(vi.mocked(prisma.student.findMany).mock.calls[0][0]?.where).toEqual({ status: "ACTIVE" });
    expect(
      data.billingTargets.map((t) => [t.student.id, t.reason, t.periodStart, t.periodEnd, t.amount, t.issueOn, t.blockers]),
    ).toEqual([
      // 이용 시작이 7일 넘게 지났다 — 사람이 판단
      ["ended", "이용 기간 지남", "2026-10-01", "2026-10-31", 550_000, "2026-09-28", ["STALE"]],
      // 예전 방식(15일 주기)으로 낸 학생 — 15일부터라 그달 일할 + 11월을 한 청구서로 (일 단가 280,000 ÷ 30.5 → 9,100)
      ["ending", "이용 종료 임박", "2026-10-15", "2026-11-30", 17 * 9_100 + 280_000, "2026-10-12", []],
      // 시스템 전부터 다녔는데 낸 기록이 없다 — 청구 시작일을 정해야 한다 (미리보기 다음 달 1일)
      ["new", "신규", "2026-11-01", "2026-11-30", 550_000, "2026-10-29", ["NO_ANCHOR"]],
    ]);
    // 미납 청구서가 덮는 기간(~10/31) 다음부터 — 청구 제외 학생은 일정에 없다
    expect(data.scheduleAhead.map((t) => [t.student.id, t.periodStart, t.issueOn])).toEqual([
      ["far", "2026-11-01", "2026-10-29"],
      ["has-open", "2026-11-01", "2026-10-29"],
    ]);
    // 이번 달에 납부 기한이 오는 발행 예정은 ending(10/12 발행 → 10/19 기한)뿐 — 막힌 학생은 빼고
    expect(data.kpi).toMatchObject({ scheduledAmount: 17 * 9_100 + 280_000, scheduledCount: 1, attentionCount: 2 });

    expect(data.students).toHaveLength(6);
    expect(data.students.find((s) => s.id === "ending")).toEqual({
      id: "ending",
      name: "학생-ending",
      grade: "고2",
      seat: null,
      monthlyFee: 280_000,
      effectiveMonthlyFee: 280_000,
      prepayMonthlyFee: 280_000,
      planName: "정규반",
      billingPaused: false,
      billingAnchor: null,
      holdReason: null,
      memo: "형제 할인",
      coverageEnd: "2026-10-14",
      nextPeriodStart: "2026-10-15",
      hasOpenInvoice: false,
    });
    expect(data.students.find((s) => s.id === "has-open")?.hasOpenInvoice).toBe(true);
    expect(data.students.find((s) => s.id === "paused")).toMatchObject({ billingPaused: true, monthlyFee: null });
  });

  it("청구 시작일을 정해 둔 학생은 그 날짜 기준으로 청구 일정에 오른다", async () => {
    const anchored = (id: string, anchor: string) =>
      studentRecord(id, { tuitionProfile: { monthlyFee: null, billingPaused: false, billingAnchor: day(anchor), memo: null } });
    vi.mocked(prisma.student.findMany).mockResolvedValue([
      anchored("later", "2026-10-25"), // 15일 뒤 — 아직 안 올라온다 (등록일 기준이면 10/10 로 올라왔을 학생)
      anchored("soon", "2026-10-16"), // 6일 뒤
      anchored("resume", "2026-10-12"), // 납부 기간(9/30)보다 뒤로 정해 둔 복귀일
      anchored("stale", "2026-09-01"), // 납부 기간(10/14)보다 앞 — 무시하고 이어서 청구
    ] as never);
    mockInvoiceQueries({
      paid: [
        { studentId: "resume", coverageEnd: day("2026-09-30") },
        { studentId: "stale", coverageEnd: day("2026-10-14") },
      ],
    });

    const data = await getTuitionAdminData({ ym: "2026-10", fullAccess: true, today: TODAY, now: NOW });

    expect(data.billingTargets.map((t) => [t.student.id, t.periodStart])).toEqual([
      ["resume", "2026-10-12"],
      ["stale", "2026-10-15"],
      ["soon", "2026-10-16"],
    ]);
    expect(data.students.find((s) => s.id === "later")).toMatchObject({
      billingAnchor: "2026-10-25",
      nextPeriodStart: "2026-10-25",
    });
  });

  it("반 이름으로 요금제를 고른다 — 이번 달 입실한 선택반 학생은 선택반 일 단가로 일할", async () => {
    vi.mocked(prisma.student.findMany).mockResolvedValue([
      studentRecord("sel", { classGroup: "선택반", startDate: day("2026-10-05") }),
    ] as never);
    const data = await getTuitionAdminData({ ym: "2026-10", fullAccess: true, today: TODAY, now: NOW });
    // 10/5~10/31 = 27일 → 27 × 13 ÷ 30.5 = 11.5 → 12일 × 31,500
    expect(data.billingTargets[0]).toMatchObject({
      planName: "선택반",
      monthlyFee: 410_000,
      prorated: { days: 12, dailyRate: 31_500, calendarDays: 27 },
      amount: 378_000,
    });
    expect(data.students[0]).toMatchObject({ planName: "선택반", effectiveMonthlyFee: 410_000, prepayMonthlyFee: 380_000 });
  });
});

describe("getTuitionAdminData — 독촉", () => {
  const notice = (createdAt: string) => [{ kind: "REMIND", sentCount: 1, createdAt: at(createdAt) }];

  it("자동 안내가 끝났고 마지막 안내로부터 7일이 지난 미납만 독촉 목록에 올린다", async () => {
    vi.mocked(prisma.tuitionInvoice.findMany).mockResolvedValue([
      // 기한 20일 지남, 마지막 안내 13일 전
      invoiceRecord({ id: "inv-dun", dueDate: day("2026-09-20"), notices: notice("2026-09-27T01:00:00.000Z") }),
      // 기한 20일 지남, 이틀 전에 독촉함
      invoiceRecord({ id: "inv-recent", studentId: "b", dueDate: day("2026-09-20"), notices: notice("2026-10-08T01:00:00.000Z") }),
      // 기한 5일 지남 — 아직 자동 안내 기간
      invoiceRecord({ id: "inv-auto", studentId: "c", dueDate: day("2026-10-05") }),
      // 안내를 한 번도 못 보낸 오래된 미납
      invoiceRecord({ id: "inv-never", studentId: "d", dueDate: day("2026-09-01") }),
    ] as never);

    const data = await getTuitionAdminData({ ym: "2026-10", fullAccess: true, today: TODAY, now: NOW });
    expect(data.dunningInvoices.map((row) => row.id)).toEqual(["inv-dun", "inv-never"]);

    const staff = await getTuitionAdminData({ ym: "2026-10", fullAccess: false, today: TODAY, now: NOW });
    expect(staff.dunningInvoices).toEqual([]);
  });
});

describe("처리 필요", () => {
  const refund = (paymentId: string, status: "PENDING" | "DONE" | "FAILED", createdAt: string) => ({
    paymentId,
    status,
    createdAt: at(createdAt),
  });
  const payment = (overrides: Record<string, unknown>) => paymentRecord({ id: "pay", ...overrides }) as never;
  const codes = (input: Parameters<typeof tuitionAttentionOf>[0]) => tuitionAttentionOf(input, NOW).map((a) => a.code);

  it("실패한 환불은 그 결제의 마지막 시도일 때만 올린다", () => {
    const failedOnly = [refund("pay", "FAILED", "2026-10-09T01:00:00.000Z")];
    const retried = [...failedOnly, refund("pay", "DONE", "2026-10-09T02:00:00.000Z")];
    expect(codes({ needsReview: false, payments: [], refunds: failedOnly })).toEqual(["REFUND_FAILED"]);
    expect(codes({ needsReview: false, payments: [], refunds: retried })).toEqual([]);
  });

  it("처리 중 환불은 30분을 넘겼을 때만 올린다", () => {
    const fresh = [refund("pay", "PENDING", "2026-10-10T02:45:00.000Z")];
    const stuck = [refund("pay", "PENDING", "2026-10-10T02:29:00.000Z")];
    expect(codes({ needsReview: false, payments: [], refunds: fresh })).toEqual([]);
    expect(codes({ needsReview: false, payments: [], refunds: stuck })).toEqual(["REFUND_STUCK"]);
  });

  it("중복 결제는 다 돌려줄 때까지, 링크 생성 실패는 마지막 시도일 때 올린다", () => {
    const holding = payment({ isDuplicate: true, paidAmount: 300_000, refundedAmount: 0 });
    const returned = payment({ isDuplicate: true, paidAmount: 300_000, refundedAmount: 300_000 });
    expect(codes({ needsReview: true, payments: [holding], refunds: [] })).toEqual(["NEEDS_REVIEW", "DUPLICATE_UNREFUNDED"]);
    expect(codes({ needsReview: false, payments: [returned], refunds: [] })).toEqual([]);

    const failedLink = payment({ status: "FAILED" });
    const laterOnsite = payment({ method: "LOCAL_CURRENCY", status: "ONSITE_REQUESTED" });
    expect(codes({ needsReview: false, payments: [failedLink], refunds: [] })).toEqual(["LINK_FAILED"]);
    expect(codes({ needsReview: false, payments: [laterOnsite, failedLink], refunds: [] })).toEqual([]);
  });

  it("다른 달 청구서도 처리할 것이 있으면 목록에 싣고, 해결된 것은 뺀다", async () => {
    const failed = { id: "r1", paymentId: "pay-1", amount: 100_000, status: "FAILED", createdAt: at("2026-08-20T01:00:00.000Z") };
    const done = { id: "r2", paymentId: "pay-1", amount: 100_000, status: "DONE", createdAt: at("2026-08-21T01:00:00.000Z") };
    const base = {
      status: "PAID",
      paidAmount: 300_000,
      dueDate: day("2026-08-05"),
      paidPaymentId: "pay-1",
      payments: [paymentRecord({ id: "pay-1", paidAmount: 300_000 })],
    };
    vi.mocked(prisma.tuitionInvoice.findMany).mockResolvedValue([
      invoiceRecord({ id: "inv-unresolved", ...base, refunds: [failed] }),
      invoiceRecord({ id: "inv-resolved", studentId: "student-b", ...base, refunds: [failed, done] }),
    ] as never);

    const data = await getTuitionAdminData({ ym: "2026-10", fullAccess: true, today: TODAY, now: NOW });

    expect(data.invoices.map((row) => row.id)).toEqual(["inv-unresolved"]);
    expect(data.invoices[0]).toMatchObject({ inMonth: false, carriedOver: false });
    expect(data.invoices[0].attention).toEqual([{ code: "REFUND_FAILED", label: "환불 실패" }]);
    // 달 밖 청구서는 합계에 넣지 않는다
    expect(data.kpi).toMatchObject({ billed: 0, received: 0, unpaidCount: 0 });
  });

  it("환불 목록 — 이번 달 요청과 아직 끝나지 않은 이전 환불만", async () => {
    const refundRecord = (id: string, status: string, createdAt: string, latestId: string) => ({
      id,
      invoiceId: "inv-1",
      amount: 50_000,
      reason: "중도 퇴실",
      method: "PROVIDER",
      source: "STAFF",
      status,
      failMessage: status === "FAILED" ? "한도 초과" : null,
      requestedByName: "원장",
      completedAt: null,
      createdAt: at(createdAt),
      invoice: {
        title: "10월 수강료",
        periodStart: day("2026-10-01"),
        periodEnd: day("2026-10-31"),
        student: { id: "student-a", name: "학생A", grade: "고2" },
      },
      payment: { method: "LINK", providerMethod: "카드", refunds: [{ id: latestId }] },
    });
    vi.mocked(prisma.tuitionRefund.findMany).mockResolvedValue([
      refundRecord("in-month-done", "DONE", "2026-10-02T01:00:00.000Z", "in-month-done"),
      refundRecord("old-failed-open", "FAILED", "2026-09-10T01:00:00.000Z", "old-failed-open"),
      refundRecord("old-failed-retried", "FAILED", "2026-09-11T01:00:00.000Z", "later-done"),
      refundRecord("old-pending", "PENDING", "2026-09-30T14:00:00.000Z", "old-pending"),
    ] as never);

    const data = await getTuitionAdminData({ ym: "2026-10", fullAccess: false, today: TODAY, now: NOW });

    expect(data.refunds.map((r) => [r.id, r.inMonth, r.unresolved])).toEqual([
      ["in-month-done", true, false],
      ["old-failed-open", false, true],
      ["old-pending", false, true],
    ]);
    expect(data.refunds[1]).toMatchObject({ failMessage: "한도 초과", paymentMethodLabel: "온라인 결제(카드)" });
  });
});

describe("결제 진행 요약 · 현장 결제 신청", () => {
  it("결제 요청 상태의 청구서에 걸린 링크·현장 신청을 요약한다", async () => {
    vi.mocked(prisma.tuitionInvoice.findMany).mockResolvedValue([
      invoiceRecord({
        id: "inv-deposit",
        dueDate: day("2026-10-15"),
        payments: [
          paymentRecord({
            id: "pay-va",
            status: "PENDING",
            checkoutStartedAt: at("2026-10-09T01:00:00.000Z"),
            depositBank: "은행",
            depositAccount: "0000",
            depositDueAt: at("2026-10-12T14:59:00.000Z"),
          }),
        ],
      }),
      invoiceRecord({
        id: "inv-onsite",
        studentId: "student-b",
        dueDate: day("2026-10-15"),
        payments: [
          paymentRecord({ id: "pay-on", method: "ONSITE_CARD", status: "ONSITE_REQUESTED", requestedAt: at("2026-10-09T05:00:00.000Z") }),
          paymentRecord({ id: "pay-old", status: "CANCELED", checkoutStartedAt: at("2026-10-08T01:00:00.000Z") }),
        ],
        notices: [
          { kind: "REMIND", sentCount: 0, createdAt: at("2026-10-09T00:00:00.000Z") },
          { kind: "REQUEST", sentCount: 2, createdAt: at("2026-10-01T00:00:00.000Z") },
        ],
      }),
      invoiceRecord({
        id: "inv-started",
        studentId: "student-c",
        dueDate: day("2026-10-15"),
        payments: [paymentRecord({ id: "pay-open", status: "PENDING", checkoutStartedAt: at("2026-10-09T01:00:00.000Z") })],
      }),
    ] as never);

    const data = await getTuitionAdminData({ ym: "2026-10", fullAccess: false, today: TODAY, now: NOW });
    const [deposit, onsite, started] = data.invoices;

    expect(deposit.openPayment).toEqual({
      link: {
        paymentId: "pay-va",
        state: "DEPOSIT_WAITING",
        checkoutStartedAt: "2026-10-09T01:00:00.000Z",
        depositBank: "은행",
        depositDueAt: "2026-10-12T14:59:00.000Z",
        failMessage: null,
      },
      onsite: null,
    });
    expect(onsite.openPayment).toEqual({
      link: null,
      onsite: { paymentId: "pay-on", method: "ONSITE_CARD", requestedAt: "2026-10-09T05:00:00.000Z" },
    });
    expect(onsite.lastNotice).toEqual({ kind: "REMIND", sentCount: 0, createdAt: "2026-10-09T00:00:00.000Z" });
    expect(onsite.noticeCount).toBe(2);
    expect(started.openPayment?.link?.state).toBe("CHECKOUT_STARTED");
  });

  it("현장 결제 신청은 달과 상관없이 전부, 받을 금액은 청구 금액", async () => {
    mockPaymentQueries({
      onsite: [
        {
          id: "pay-on",
          method: "LOCAL_CURRENCY",
          requestedAt: null,
          createdAt: at("2026-10-09T05:00:00.000Z"),
          invoice: {
            id: "inv-next",
            title: "11월 수강료",
            periodStart: day("2026-11-01"),
            periodEnd: day("2026-11-30"),
            amount: 300_000,
            dueDate: day("2026-11-01"),
            status: "REQUESTED",
            student: { id: "student-a", name: "학생A", grade: "고2", seat: "12", status: "ACTIVE" },
          },
        },
      ],
    });

    const data = await getTuitionAdminData({ ym: "2026-10", fullAccess: false, today: TODAY, now: NOW });

    expect(vi.mocked(prisma.tuitionPayment.findMany).mock.calls[0][0]?.where).toEqual({ status: "ONSITE_REQUESTED" });
    expect(data.onsiteRequests).toEqual([
      {
        paymentId: "pay-on",
        invoiceId: "inv-next",
        student: { id: "student-a", name: "학생A", grade: "고2", seat: "12", status: "ACTIVE" },
        title: "11월 수강료",
        periodStart: "2026-11-01",
        periodEnd: "2026-11-30",
        amount: 300_000,
        dueDate: "2026-11-01",
        invoiceStatus: "REQUESTED",
        method: "LOCAL_CURRENCY",
        requestedAt: "2026-10-09T05:00:00.000Z",
      },
    ]);
    expect(data.counts.onsiteRequests).toBe(1);
  });
});

describe("getTuitionInvoiceDetail", () => {
  it("없는 청구서면 null", async () => {
    vi.mocked(prisma.tuitionInvoice.findUnique).mockResolvedValue(null);
    await expect(getTuitionInvoiceDetail("inv-x")).resolves.toBeNull();
  });

  it("결제별 환불 가능 금액을 내고, 결제사 키·학부모 계정은 고르지 않는다", async () => {
    const detailPayment = (overrides: Record<string, unknown>) => ({
      ...paymentRecord({ id: "pay" }),
      amount: 300_000,
      closedReason: null,
      expiresAt: null,
      cardIssuer: null,
      cardType: null,
      installmentMonths: null,
      approvalNumber: null,
      approvedAt: null,
      receiptUrl: null,
      confirmedByName: null,
      confirmedAt: null,
      memo: null,
      ...overrides,
    });
    vi.mocked(prisma.tuitionInvoice.findUnique).mockResolvedValue({
      ...invoiceRecord({
        id: "inv-1",
        status: "PARTIALLY_REFUNDED",
        paidAmount: 300_000,
        refundedAmount: 50_000,
        paidAt: at("2026-10-02T02:00:00.000Z"),
        paidPaymentId: "pay-main",
        coverageEnd: day("2026-10-20"),
        monthlyFee: 280_000,
        extraItems: [{ name: "교재비", amount: 30_000 }],
        discount: 10_000,
        shareToken: "tok_abcdefghijklmnopqrstuvwxyz",
      }),
      taxType: "TAXABLE",
      parentMessage: "교재비가 포함됐어요",
      memo: null,
      issuedByName: "원장",
      canceledAt: null,
      canceledByName: null,
      cancelReason: null,
      createdAt: at("2026-09-25T01:00:00.000Z"),
      payments: [
        detailPayment({
          id: "pay-dup",
          isDuplicate: true,
          paidAmount: 300_000,
          receiptUrl: "javascript:alert(1)",
          createdAt: at("2026-10-02T03:00:00.000Z"),
        }),
        detailPayment({
          id: "pay-main",
          providerMethod: "카드",
          cardIssuer: "현대",
          cardType: "신용",
          installmentMonths: 3,
          approvalNumber: "12345678",
          paidAmount: 300_000,
          refundedAmount: 50_000,
          approvedAt: at("2026-10-02T02:00:00.000Z"),
          receiptUrl: "https://receipt.example.com/r/1",
        }),
      ],
      refunds: [
        { id: "r1", paymentId: "pay-main", amount: 50_000, reason: "중도 퇴실", calcBasis: "일할 계산", effectiveDate: day("2026-10-20"), method: "PROVIDER", source: "STAFF", status: "DONE", failMessage: null, requestedByName: "원장", completedAt: at("2026-10-21T01:00:00.000Z"), createdAt: at("2026-10-21T01:00:00.000Z") },
        { id: "r2", paymentId: "pay-main", amount: 30_000, reason: "추가 환불", calcBasis: null, effectiveDate: null, method: "PROVIDER", source: "STAFF", status: "PENDING", failMessage: null, requestedByName: "원장", completedAt: null, createdAt: at("2026-10-10T02:50:00.000Z") },
      ],
      notices: [],
    } as never);
    vi.mocked(prisma.tuitionEvent.findMany).mockResolvedValue([
      { id: "e2", type: "PAYMENT_DONE", source: "WEBHOOK", actorName: null, detail: "결제 완료", createdAt: at("2026-10-02T02:00:00.000Z") },
      { id: "e1", type: "INVOICE_ISSUED", source: "STAFF", actorName: "원장", detail: "청구", createdAt: at("2026-09-25T01:00:00.000Z") },
    ] as never);

    const detail = await getTuitionInvoiceDetail("inv-1", { today: TODAY, now: NOW });

    expect(detail?.today).toBe("2026-10-10");
    expect(detail?.invoice).toMatchObject({ displayStatus: "PARTIALLY_REFUNDED", coverageEnd: "2026-10-20", noticeText: null });
    expect(detail?.invoice.attention.map((a) => a.code)).toEqual(["DUPLICATE_UNREFUNDED"]);
    // 금액 구성 · 과세 · 학부모 메시지 · 청구서 링크
    expect(detail?.invoice).toMatchObject({
      tuitionAmount: 280_000,
      extraItems: [{ name: "교재비", amount: 30_000 }],
      discount: 10_000,
      taxType: "TAXABLE",
      tax: { supplyAmount: 272_728, taxAmount: 27_272 },
      parentMessage: "교재비가 포함됐어요",
      billUrl: "https://app.test/bill/tok_abcdefghijklmnopqrstuvwxyz",
    });

    const [duplicate, main] = detail?.payments ?? [];
    expect(duplicate).toMatchObject({ isDuplicate: true, isAccepted: false, refundable: 300_000, receiptUrl: null });
    expect(main).toMatchObject({
      isAccepted: true,
      methodLabel: "온라인 결제(카드)",
      pendingRefundAmount: 30_000,
      refundable: 300_000 - 50_000 - 30_000,
      receiptUrl: "https://receipt.example.com/r/1",
      cardIssuer: "현대",
      installmentMonths: 3,
      approvalNumber: "12345678",
      // 카드 결제는 현금영수증 대상이 아니다
      cashReceipt: null,
      cashReceiptAllowed: false,
      // 결제사 정보가 없으면(또는 부분 취소가 되는 결제사면) 전액 취소 제한이 없다
      fullCancelOnly: false,
      fullRefundMethod: "PROVIDER",
    });
    // 남은 금액(납부 − 환불) 전부를 환불할 때의 방식을 코어에 묻는다
    expect(refundMethodFor).toHaveBeenCalledWith(expect.objectContaining({ id: "pay-main", method: "LINK" }), 250_000);
    // 환불은 최근 요청부터, 진행 기록은 오래된 것부터
    expect(detail?.refunds.map((r) => r.id)).toEqual(["r2", "r1"]);
    expect(detail?.events.map((e) => e.id)).toEqual(["e1", "e2"]);

    const select = vi.mocked(prisma.tuitionInvoice.findUnique).mock.calls[0][0].select as {
      payments: { select: Record<string, boolean> };
    };
    for (const hidden of ["providerProductKey", "providerOrderKey", "providerPaymentKey", "payUrl", "requestedByAuthUserId"]) {
      expect(select.payments.select[hidden]).toBeUndefined();
    }
  });
});

describe("추가 항목 · 청구서 링크", () => {
  it("목록 행에 추가 항목과 링크를 싣고, 안내문 끝에 링크를 붙인다", async () => {
    vi.mocked(prisma.tuitionInvoice.findMany).mockResolvedValue([
      invoiceRecord({
        id: "inv-link",
        dueDate: day("2026-10-15"),
        extraItems: [{ name: "교재비", amount: 20_000 }],
        amount: 320_000,
        shareToken: "tok_abcdefghijklmnopqrstuvwxyz",
        autoIssued: true,
      }),
      // DB 에 형식이 어긋난 값이 있어도 화면은 빈 목록으로 본다
      invoiceRecord({ id: "inv-broken", studentId: "student-b", dueDate: day("2026-10-16"), extraItems: "교재비" }),
    ] as never);

    const data = await getTuitionAdminData({ ym: "2026-10", fullAccess: false, today: TODAY, now: NOW });

    expect(data.invoices[0]).toMatchObject({
      extraItems: [{ name: "교재비", amount: 20_000 }],
      autoIssued: true,
      billUrl: "https://app.test/bill/tok_abcdefghijklmnopqrstuvwxyz",
      noticeText: "[REQUEST]\n학생-student-a 안내\nhttps://app.test/bill/tok_abcdefghijklmnopqrstuvwxyz",
    });
    expect(data.invoices[1]).toMatchObject({ extraItems: [], billUrl: null });
  });
});

describe("현금영수증", () => {
  const receipt = (overrides: Record<string, unknown> = {}) => ({
    id: "cr-1",
    status: "REQUESTED",
    purpose: "INCOME",
    identifier: "01012345678",
    amount: 300_000,
    supplyAmount: 300_000,
    taxAmount: 0,
    approvalNumber: null,
    requestedByName: "직원",
    issuedAt: null,
    issuedByName: null,
    canceledAt: null,
    cancelReason: null,
    ...overrides,
  });
  const cashPayment = (overrides: Record<string, unknown> & { id: string }) => ({
    method: "CASH",
    paidAmount: 300_000,
    refundedAmount: 0,
    approvedAt: at("2026-10-05T02:00:00.000Z"),
    createdAt: at("2026-10-05T02:00:00.000Z"),
    cashReceipt: null,
    invoice: {
      id: `inv-${overrides.id}`,
      title: "10월 수강료",
      taxType: "EXEMPT",
      student: { id: "student-a", name: "학생A", grade: "고2" },
    },
    ...overrides,
  });

  it("현금·계좌이체 수납만, 이번 달 수납분과 처리가 남은 이전 달 건을 조회한다", async () => {
    await getTuitionAdminData({ ym: "2026-10", fullAccess: true, today: TODAY, now: NOW });

    const where = vi.mocked(prisma.tuitionPayment.findMany).mock.calls[1][0]?.where;
    expect(where).toMatchObject({ status: "DONE", isDuplicate: false, method: { in: ["CASH", "TRANSFER"] } });
    expect(where?.OR?.[0]).toEqual({
      approvedAt: { gte: at("2026-09-30T15:00:00.000Z"), lt: at("2026-10-31T15:00:00.000Z") },
    });
  });

  it("미등록·발급 필요·재발급 필요를 할 일로 세고, 끝난 이전 달 건은 뺀다", async () => {
    mockPaymentQueries({
      cash: [
        cashPayment({ id: "none" }),
        cashPayment({ id: "requested", cashReceipt: receipt() }),
        cashPayment({ id: "issued", cashReceipt: receipt({ id: "cr-2", status: "ISSUED", approvalNumber: "A1234" }) }),
        // 발급한 뒤 5만원 환불 — 발급 금액(30만)과 남은 수납액(25만)이 다르다
        cashPayment({
          id: "stale",
          refundedAmount: 50_000,
          approvedAt: at("2026-09-10T02:00:00.000Z"),
          cashReceipt: receipt({ id: "cr-3", status: "ISSUED", approvalNumber: "B1234" }),
        }),
        // 전액 환불되고 영수증도 없는 수납
        cashPayment({ id: "refunded", refundedAmount: 300_000 }),
        // 이전 달에 발급까지 끝난 건 (조회 조건에 걸려 와도 보여 주지 않는다)
        cashPayment({
          id: "old-done",
          refundedAmount: 50_000,
          approvedAt: at("2026-09-10T02:00:00.000Z"),
          cashReceipt: receipt({ id: "cr-4", status: "ISSUED", amount: 250_000, supplyAmount: 250_000 }),
        }),
      ],
    });

    const data = await getTuitionAdminData({ ym: "2026-10", fullAccess: true, today: TODAY, now: NOW });

    expect(data.cashReceipts.map((row) => [row.paymentId, row.todo, row.inMonth])).toEqual([
      ["none", true, true],
      ["requested", true, true],
      ["issued", false, true],
      ["stale", true, false],
    ]);
    expect(data.cashReceipts[3]).toMatchObject({ amount: 250_000, receipt: { amount: 300_000, stale: true } });
    expect(data.counts.cashReceiptTodo).toBe(3);
    // 발급하는 원장급에게는 전체 번호
    expect(data.cashReceipts[1].receipt?.identifier).toBe("01012345678");
  });

  it("직원에게는 발급 번호를 가려서 내려 준다", async () => {
    mockPaymentQueries({ cash: [cashPayment({ id: "requested", cashReceipt: receipt() })] });
    const data = await getTuitionAdminData({ ym: "2026-10", fullAccess: false, today: TODAY, now: NOW });
    expect(data.cashReceipts[0].receipt?.identifier).toBe("010****5678");
  });

  it("과세면 남은 수납액을 공급가액·세액으로 나눈다", async () => {
    mockPaymentQueries({
      cash: [
        cashPayment({
          id: "tax",
          paidAmount: 330_000,
          invoice: { id: "inv-tax", title: "10월 수강료", taxType: "TAXABLE", student: { id: "s", name: "학생", grade: "고1" } },
        }),
      ],
    });
    const data = await getTuitionAdminData({ ym: "2026-10", fullAccess: true, today: TODAY, now: NOW });
    expect(data.cashReceipts[0]).toMatchObject({ amount: 330_000, supplyAmount: 300_000, taxAmount: 30_000 });
  });

  it("발급한 현금영수증 금액이 환불로 달라지면 처리 필요로 올린다", () => {
    const payment = (refundedAmount: number, status: "REQUESTED" | "ISSUED") => ({
      id: "p1",
      method: "CASH" as const,
      status: "DONE" as const,
      paidAmount: 300_000,
      refundedAmount,
      isDuplicate: false,
      cashReceipt: { status, amount: 300_000 },
    });
    const codes = (refundedAmount: number, status: "REQUESTED" | "ISSUED") =>
      tuitionAttentionOf({ needsReview: false, payments: [payment(refundedAmount, status)], refunds: [] }, NOW).map(
        (a) => a.code,
      );
    expect(codes(0, "ISSUED")).toEqual([]);
    expect(codes(50_000, "ISSUED")).toEqual(["CASH_RECEIPT_STALE"]);
    // 아직 발급 전이면 발급할 때 금액을 다시 맞추므로 문제 없다
    expect(codes(50_000, "REQUESTED")).toEqual([]);
  });
});

describe("결제사 정보", () => {
  const PAYSSAM = { name: "payssam" as const, label: "결제선생", canNotify: true, partialCancel: false, testMode: true, hasBalance: true, cashReceipts: true };

  it("연동된 결제사와 할 수 있는 일을 화면에 내려 준다 (없으면 null)", async () => {
    const none = await getTuitionAdminData({ ym: "2026-10", fullAccess: false, today: TODAY, now: NOW });
    expect(none.provider).toBeNull();

    vi.mocked(getTuitionProviderInfo).mockReturnValue(PAYSSAM);
    const data = await getTuitionAdminData({ ym: "2026-10", fullAccess: false, today: TODAY, now: NOW });
    expect(data.provider).toEqual(PAYSSAM);
  });

  it("전액 취소만 되는 결제사의 온라인 결제는 fullCancelOnly — 현장 결제는 해당 없음", async () => {
    vi.mocked(getTuitionProviderInfo).mockReturnValue(PAYSSAM);
    const payment = (id: string, method: string) => ({
      ...paymentRecord({ id }),
      method,
      amount: 300_000,
      paidAmount: 300_000,
      closedReason: null,
      expiresAt: null,
      cardIssuer: null,
      cardType: null,
      installmentMonths: null,
      approvalNumber: null,
      approvedAt: null,
      receiptUrl: null,
      confirmedByName: null,
      confirmedAt: null,
      memo: null,
    });
    vi.mocked(prisma.tuitionInvoice.findUnique).mockResolvedValue({
      ...invoiceRecord({ id: "inv-1", status: "PAID", paidAmount: 300_000, paidPaymentId: "pay-link" }),
      taxType: "EXEMPT",
      parentMessage: null,
      memo: null,
      issuedByName: "원장",
      canceledAt: null,
      canceledByName: null,
      cancelReason: null,
      createdAt: at("2026-09-25T01:00:00.000Z"),
      payments: [payment("pay-link", "LINK"), payment("pay-cash", "CASH")],
    } as never);

    const detail = await getTuitionInvoiceDetail("inv-1", { today: TODAY, now: NOW });
    expect(detail?.payments.map((p) => [p.id, p.fullCancelOnly])).toEqual([
      ["pay-link", true],
      ["pay-cash", false],
    ]);
  });
});
