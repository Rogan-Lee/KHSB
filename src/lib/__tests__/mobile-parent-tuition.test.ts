import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tuitionInvoice: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    tuitionPayment: { count: vi.fn() },
    // getParentServicesSummary 의 기존 조회 — 전부 "없음"으로 답한다
    lunchMenu: { count: vi.fn(async () => 0) },
    lunchOrder: { findFirst: vi.fn(async () => null) },
    lunchOrderItem: { count: vi.fn(async () => 0) },
    scheduleProposal: { findFirst: vi.fn(async () => null) },
    examSession: { count: vi.fn(async () => 0) },
    examApplication: { count: vi.fn(async () => 0) },
    communication: { count: vi.fn(async () => 0) },
  },
}));
vi.mock("@/lib/tuition/core", () => ({
  getTuitionSetting: vi.fn(),
  isOnlinePaymentAvailable: vi.fn(),
  startCheckout: vi.fn(),
  requestOnsitePayment: vi.fn(),
  withdrawOnsiteRequest: vi.fn(),
  syncInvoice: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getAuthIdentity: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma/client";
import { getParentServicesSummary } from "@/lib/mobile-parent-services";
import {
  countOpenTuitionInvoices,
  getOpenTuitionByStudent,
  getParentTuition,
  getParentTuitionSummary,
  requestParentTuitionOnsite,
  startParentTuitionCheckout,
  syncParentTuition,
  tuitionBannerOf,
  tuitionSummaryOf,
  withdrawParentTuitionOnsite,
  type OpenTuition,
} from "@/lib/mobile-parent-tuition";
import { prisma } from "@/lib/prisma";
import {
  getTuitionSetting,
  isOnlinePaymentAvailable,
  requestOnsitePayment,
  startCheckout,
  syncInvoice,
  withdrawOnsiteRequest,
} from "@/lib/tuition/core";
import { TuitionError } from "@/lib/tuition/types";

const child = { id: "student-1", name: "테스트학생", grade: "고2", seat: null };
const day = (key: string) => new Date(`${key}T00:00:00.000Z`);

type PaymentFixture = ReturnType<typeof payment>;
type RefundFixture = ReturnType<typeof refund>;

function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: "pay-1",
    method: "LINK",
    status: "PENDING",
    isDuplicate: false,
    providerMethod: null as string | null,
    receiptUrl: null as string | null,
    checkoutStartedAt: null as Date | null,
    depositBank: null as string | null,
    depositAccount: null as string | null,
    depositDueAt: null as Date | null,
    requestedAt: null as Date | null,
    createdAt: new Date("2026-10-05T01:00:00.000Z"),
    ...overrides,
  };
}

function refund(overrides: Record<string, unknown> = {}) {
  return {
    paymentId: "pay-1",
    amount: 100_000,
    status: "DONE",
    completedAt: new Date("2026-10-08T02:00:00.000Z") as Date | null,
    createdAt: new Date("2026-10-08T01:00:00.000Z"),
    ...overrides,
  };
}

function invoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv-1",
    studentId: "student-1",
    title: "10월 수강료",
    periodStart: day("2026-10-01"),
    periodEnd: day("2026-10-31"),
    months: 1,
    amount: 450_000,
    dueDate: day("2026-10-15"),
    status: "REQUESTED",
    paidAt: null as Date | null,
    paidPaymentId: null as string | null,
    refundedAmount: 0,
    coverageEnd: null as Date | null,
    payments: [] as PaymentFixture[],
    refunds: [] as RefundFixture[],
    ...overrides,
  };
}

function paidInvoice(overrides: Record<string, unknown> = {}) {
  return invoice({
    status: "PAID",
    paidAt: new Date("2026-10-02T03:00:00.000Z"),
    paidPaymentId: "pay-1",
    coverageEnd: day("2026-10-31"),
    payments: [payment({ status: "DONE", providerMethod: "카드" })],
    ...overrides,
  });
}

type WhereValue = string | { in: string[] };
const listOf = (value: WhereValue) => (typeof value === "string" ? [value] : value.in);

/** where 의 studentId · status 만 흉내 내는 가짜 테이블 — 정렬·개수 제한은 흉내 내지 않는다 */
function seed(rows: ReturnType<typeof invoice>[]) {
  const matching = (where: { studentId: WhereValue; status: WhereValue }) =>
    rows.filter(
      (row) => listOf(where.studentId).includes(row.studentId) && listOf(where.status).includes(row.status),
    );

  vi.mocked(prisma.tuitionInvoice.findMany).mockImplementation((async (args: { where: never }) =>
    matching(args.where).map((row) => ({
      ...row,
      _count: { payments: row.payments.filter((p) => p.status === "ONSITE_REQUESTED").length },
    }))) as never);

  vi.mocked(prisma.tuitionInvoice.aggregate).mockImplementation((async (args: { where: never }) => {
    const ends = matching(args.where)
      .map((row) => row.coverageEnd?.getTime())
      .filter((t): t is number => typeof t === "number");
    return { _max: { coverageEnd: ends.length > 0 ? new Date(Math.max(...ends)) : null } };
  }) as never);

  vi.mocked(prisma.tuitionInvoice.count).mockImplementation((async (args: {
    where: { studentId: WhereValue; status: WhereValue; coverageEnd?: { gte: Date } };
  }) => {
    const since = args.where.coverageEnd?.gte;
    return matching(args.where).filter(
      (row) => !since || (row.coverageEnd !== null && row.coverageEnd.getTime() >= since.getTime()),
    ).length;
  }) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  // 2026-10-10 12:00 KST
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-10T03:00:00.000Z"));

  seed([]);
  vi.mocked(getTuitionSetting).mockResolvedValue({
    guideText: "매월 1일에 청구됩니다",
    onsiteGuideText: "데스크에서 결제해 주세요",
  } as never);
  vi.mocked(isOnlinePaymentAvailable).mockResolvedValue(true);
  vi.mocked(prisma.tuitionPayment.count).mockResolvedValue(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getParentTuition", () => {
  it("splits invoices into open (earliest due first) and history (latest paid first)", async () => {
    seed([
      invoice({ id: "open-late", dueDate: day("2026-10-20") }),
      paidInvoice({ id: "paid-sep", paidAt: new Date("2026-09-01T03:00:00.000Z") }),
      invoice({ id: "open-early", dueDate: day("2026-10-12") }),
      paidInvoice({ id: "refunded-aug", status: "REFUNDED", paidAt: new Date("2026-08-01T03:00:00.000Z") }),
      paidInvoice({ id: "paid-oct", status: "PARTIALLY_REFUNDED", paidAt: new Date("2026-10-01T03:00:00.000Z") }),
    ]);

    const res = await getParentTuition(child);

    expect(res.open.map((i) => i.id)).toEqual(["open-early", "open-late"]);
    expect(res.history.map((i) => i.id)).toEqual(["paid-oct", "paid-sep", "refunded-aug"]);
    expect(res.history.map((i) => i.status)).toEqual(["PARTIALLY_REFUNDED", "PAID", "REFUNDED"]);
    expect(res).toMatchObject({
      studentName: "테스트학생",
      onlinePaymentEnabled: true,
      guideText: "매월 1일에 청구됩니다",
      onsiteGuideText: "데스크에서 결제해 주세요",
    });
  });

  it("never returns canceled invoices and caps the history at 24", async () => {
    seed([
      invoice({ id: "open" }),
      invoice({ id: "canceled", status: "CANCELED" }),
      paidInvoice({ id: "paid" }),
    ]);

    const res = await getParentTuition(child);

    expect([...res.open, ...res.history].map((i) => i.id).sort()).toEqual(["open", "paid"]);

    const calls = vi.mocked(prisma.tuitionInvoice.findMany).mock.calls.map(([args]) => args!);
    expect(calls).toHaveLength(2);
    for (const args of calls) {
      expect(args.where).toMatchObject({ studentId: "student-1" });
      expect(listOf(args.where!.status as WhereValue)).not.toContain("CANCELED");
    }
    const settled = calls.find((args) => typeof args.where!.status !== "string")!;
    expect(settled.take).toBe(24);
    expect(settled.orderBy).toEqual([{ paidAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }]);
    // 닫힌 결제 시도(CANCELED · FAILED)는 읽지 않는다
    expect((settled.select as { payments: { where: unknown } }).payments.where).toEqual({
      status: { in: ["PENDING", "ONSITE_REQUESTED", "DONE"] },
    });
  });

  it("reports overdue only after the due date and counts days to due", async () => {
    seed([
      invoice({ id: "past", dueDate: day("2026-10-07") }),
      invoice({ id: "today", dueDate: day("2026-10-10") }),
      invoice({ id: "future", dueDate: day("2026-10-15") }),
    ]);

    const res = await getParentTuition(child);

    expect(res.open.map((i) => [i.id, i.status, i.daysToDue, i.dueDate])).toEqual([
      ["past", "OVERDUE", -3, "2026-10-07"],
      ["today", "REQUESTED", 0, "2026-10-10"],
      ["future", "REQUESTED", 5, "2026-10-15"],
    ]);
  });

  it("maps dates, paid method and receipt of the accepted payment", async () => {
    seed([
      paidInvoice({
        id: "online",
        payments: [
          payment({ status: "DONE", providerMethod: "카드", receiptUrl: "https://receipt.example/1" }),
        ],
      }),
      paidInvoice({
        id: "online-unknown",
        paidAt: new Date("2026-09-02T03:00:00.000Z"),
        payments: [payment({ status: "DONE" })],
      }),
      paidInvoice({
        id: "onsite",
        paidAt: new Date("2026-08-02T03:00:00.000Z"),
        payments: [payment({ status: "DONE", method: "LOCAL_CURRENCY" })],
      }),
    ]);

    const [online, unknown, onsite] = (await getParentTuition(child)).history;

    expect(online).toMatchObject({
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      months: 1,
      amount: 450_000,
      paidAt: "2026-10-02T03:00:00.000Z",
      paidMethodLabel: "온라인 결제(카드)",
      receiptUrl: "https://receipt.example/1",
      coverageEnd: "2026-10-31",
      refundedAmount: 0,
      onsiteRequest: null,
      linkPending: null,
      refunds: [],
    });
    expect(unknown.paidMethodLabel).toBe("온라인 결제");
    expect(onsite.paidMethodLabel).toBe("지역화폐");
    expect(onsite.receiptUrl).toBeNull();
  });

  describe("nextPayment", () => {
    it("points at the earliest due date while an invoice is open", async () => {
      seed([
        invoice({ id: "nov", dueDate: day("2026-10-25") }),
        invoice({ id: "late", dueDate: day("2026-10-08") }),
        paidInvoice({ coverageEnd: day("2026-10-31") }),
      ]);

      expect((await getParentTuition(child)).nextPayment).toEqual({
        basis: "DUE",
        date: "2026-10-08",
        coverageEnd: "2026-10-31",
      });
    });

    it("points at the day after the latest paid coverage when nothing is open", async () => {
      seed([
        paidInvoice({ id: "a", coverageEnd: day("2026-10-31") }),
        paidInvoice({ id: "b", status: "PARTIALLY_REFUNDED", coverageEnd: day("2026-10-20") }),
        // 전액 환불은 이용 기간으로 치지 않는다
        paidInvoice({ id: "c", status: "REFUNDED", coverageEnd: day("2026-12-31") }),
        invoice({ id: "d", status: "CANCELED", coverageEnd: day("2027-01-31") }),
      ]);

      expect((await getParentTuition(child)).nextPayment).toEqual({
        basis: "COVERAGE_END",
        date: "2026-11-01",
        coverageEnd: "2026-10-31",
      });
    });

    it("has nothing to announce without an open invoice or paid coverage", async () => {
      seed([paidInvoice({ status: "REFUNDED", coverageEnd: null })]);

      expect((await getParentTuition(child)).nextPayment).toEqual({
        basis: "NONE",
        date: null,
        coverageEnd: null,
      });
    });
  });

  describe("linkPending", () => {
    it("stays empty while the pay link was only issued", async () => {
      seed([invoice({ payments: [payment()] })]);

      expect((await getParentTuition(child)).open[0].linkPending).toBeNull();
    });

    it("appears once the pay page was opened", async () => {
      seed([
        invoice({ payments: [payment({ checkoutStartedAt: new Date("2026-10-09T05:00:00.000Z") })] }),
      ]);

      expect((await getParentTuition(child)).open[0].linkPending).toEqual({
        startedAt: "2026-10-09T05:00:00.000Z",
        deposit: null,
      });
    });

    it("carries the virtual-account deposit guide", async () => {
      seed([
        invoice({
          payments: [
            payment({
              checkoutStartedAt: new Date("2026-10-09T05:00:00.000Z"),
              depositBank: "모의은행",
              depositAccount: "X1234567890",
              depositDueAt: new Date("2026-10-12T14:59:59.000Z"),
            }),
          ],
        }),
      ]);

      expect((await getParentTuition(child)).open[0].linkPending).toEqual({
        startedAt: "2026-10-09T05:00:00.000Z",
        deposit: { bank: "모의은행", accountNumber: "X1234567890", dueAt: "2026-10-12T14:59:59.000Z" },
      });
    });

    it("ignores duplicate payments and on-site rows", async () => {
      const opened = new Date("2026-10-09T05:00:00.000Z");
      seed([
        invoice({
          payments: [
            payment({ id: "dup", isDuplicate: true, checkoutStartedAt: opened, depositAccount: "X1" }),
            payment({ id: "onsite", method: "ONSITE_CARD", status: "ONSITE_REQUESTED", checkoutStartedAt: opened }),
          ],
        }),
      ]);

      expect((await getParentTuition(child)).open[0].linkPending).toBeNull();
    });

    it("is not attached to invoices that are already settled", async () => {
      seed([
        paidInvoice({
          payments: [
            payment({ status: "DONE" }),
            payment({ id: "stale", checkoutStartedAt: new Date("2026-10-01T05:00:00.000Z") }),
            payment({ id: "stale-onsite", method: "ONSITE_CARD", status: "ONSITE_REQUESTED" }),
          ],
        }),
      ]);

      const [paid] = (await getParentTuition(child)).history;
      expect(paid.linkPending).toBeNull();
      expect(paid.onsiteRequest).toBeNull();
    });
  });

  it("exposes the pending on-site request", async () => {
    seed([
      invoice({
        payments: [
          payment({
            id: "pay-onsite",
            method: "LOCAL_CURRENCY",
            status: "ONSITE_REQUESTED",
            requestedAt: new Date("2026-10-09T06:00:00.000Z"),
          }),
        ],
      }),
    ]);

    expect((await getParentTuition(child)).open[0].onsiteRequest).toEqual({
      paymentId: "pay-onsite",
      method: "LOCAL_CURRENCY",
      requestedAt: "2026-10-09T06:00:00.000Z",
    });
  });

  it("lists refunds of the accepted payment only, newest first", async () => {
    seed([
      paidInvoice({
        status: "PARTIALLY_REFUNDED",
        refundedAmount: 100_000,
        payments: [
          payment({ status: "DONE", providerMethod: "카드" }),
          // 두 번째 결제 — 납부로 인정되지 않아 자동 환불됨
          payment({ id: "pay-dup", status: "DONE", isDuplicate: true, providerMethod: "간편결제" }),
        ],
        refunds: [
          refund({ paymentId: "pay-dup", amount: 450_000 }),
          refund({ amount: 100_000 }),
          refund({
            amount: 50_000,
            status: "PENDING",
            completedAt: null,
            createdAt: new Date("2026-10-09T01:00:00.000Z"),
          }),
        ],
      }),
    ]);

    const [paid] = (await getParentTuition(child)).history;

    expect(paid.refunds).toEqual([
      { amount: 50_000, status: "PENDING", completedAt: null },
      { amount: 100_000, status: "DONE", completedAt: "2026-10-08T02:00:00.000Z" },
    ]);
    expect(paid.paidMethodLabel).toBe("온라인 결제(카드)");
    expect(paid.refundedAmount).toBe(100_000);
  });

  it("passes through a disabled online payment switch", async () => {
    vi.mocked(isOnlinePaymentAvailable).mockResolvedValue(false);
    vi.mocked(getTuitionSetting).mockResolvedValue({ guideText: null, onsiteGuideText: null } as never);

    expect(await getParentTuition(child)).toMatchObject({
      onlinePaymentEnabled: false,
      guideText: null,
      onsiteGuideText: null,
      open: [],
      history: [],
    });
  });
});

describe("tuition summary", () => {
  const open = (overrides: Partial<OpenTuition> = {}): OpenTuition => ({
    invoiceId: "inv-1",
    title: "10월 수강료",
    amount: 450_000,
    dueDate: "2026-10-15",
    overdue: false,
    onsiteRequested: false,
    ...overrides,
  });

  it("ranks overdue > onsite > unpaid > paid > none", () => {
    expect(tuitionSummaryOf([open({ onsiteRequested: true }), open({ overdue: true })], true)).toBe("overdue");
    expect(tuitionSummaryOf([open(), open({ onsiteRequested: true })], true)).toBe("onsite");
    expect(tuitionSummaryOf([open()], true)).toBe("unpaid");
    expect(tuitionSummaryOf([], true)).toBe("paid");
    expect(tuitionSummaryOf([], false)).toBe("none");
  });

  it("reads the same precedence from the invoices", async () => {
    const onsiteRequest = payment({ method: "ONSITE_CARD", status: "ONSITE_REQUESTED" });

    seed([
      invoice({ id: "late", dueDate: day("2026-10-09") }),
      invoice({ id: "onsite", payments: [onsiteRequest] }),
      paidInvoice(),
    ]);
    await expect(getParentTuitionSummary("student-1")).resolves.toBe("overdue");

    seed([invoice({ id: "plain" }), invoice({ id: "onsite", payments: [onsiteRequest] }), paidInvoice()]);
    await expect(getParentTuitionSummary("student-1")).resolves.toBe("onsite");

    // 결제 링크만 받아 둔 것은 현장 결제 신청이 아니다
    seed([invoice({ payments: [payment()] }), paidInvoice()]);
    await expect(getParentTuitionSummary("student-1")).resolves.toBe("unpaid");

    seed([paidInvoice({ coverageEnd: day("2026-10-10") })]);
    await expect(getParentTuitionSummary("student-1")).resolves.toBe("paid");

    seed([paidInvoice({ status: "PARTIALLY_REFUNDED", coverageEnd: day("2026-10-09") })]);
    await expect(getParentTuitionSummary("student-1")).resolves.toBe("none");

    seed([
      paidInvoice({ status: "REFUNDED", coverageEnd: day("2026-12-31") }),
      invoice({ status: "CANCELED", dueDate: day("2026-10-01") }),
    ]);
    await expect(getParentTuitionSummary("student-1")).resolves.toBe("none");
  });

  it("is added to the services summary and falls back to none when the read fails", async () => {
    seed([invoice({ dueDate: day("2026-10-01") })]);
    await expect(getParentServicesSummary("auth-1", child)).resolves.toMatchObject({
      lunch: "closed",
      tuition: "overdue",
    });

    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(prisma.tuitionInvoice.findMany).mockRejectedValue(new Error("relation does not exist"));
    await expect(getParentServicesSummary("auth-1", child)).resolves.toMatchObject({
      lunch: "closed",
      inquiries: { waitingCount: 0 },
      tuition: "none",
    });
    expect(logged).toHaveBeenCalledWith("[tuition:summary]", "relation does not exist");
    logged.mockRestore();
  });
});

describe("home banner and badge", () => {
  it("picks the earliest open invoice per child", async () => {
    seed([
      invoice({ id: "a-late", dueDate: day("2026-10-20") }),
      invoice({ id: "a-early", dueDate: day("2026-10-05"), title: "9월 수강료", amount: 300_000 }),
      invoice({ id: "b-only", studentId: "student-2", dueDate: day("2026-10-12") }),
      invoice({ id: "a-canceled", status: "CANCELED", dueDate: day("2026-10-01") }),
      paidInvoice({ id: "c-paid", studentId: "student-3" }),
    ]);

    const byStudent = await getOpenTuitionByStudent(["student-1", "student-2", "student-3"]);

    expect(tuitionBannerOf(byStudent.get("student-1"))).toEqual({
      invoiceId: "a-early",
      title: "9월 수강료",
      amount: 300_000,
      dueDate: "2026-10-05",
      overdue: true,
    });
    expect(tuitionBannerOf(byStudent.get("student-2"))).toMatchObject({ invoiceId: "b-only", overdue: false });
    expect(tuitionBannerOf(byStudent.get("student-3"))).toBeNull();
    expect(prisma.tuitionInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId: { in: ["student-1", "student-2", "student-3"] }, status: "REQUESTED" },
      }),
    );
  });

  it("counts open invoices across children and skips the query without children", async () => {
    seed([
      invoice({ id: "a" }),
      invoice({ id: "b", studentId: "student-2" }),
      invoice({ id: "c", studentId: "student-2", status: "CANCELED" }),
      paidInvoice({ id: "d" }),
    ]);

    await expect(countOpenTuitionInvoices(["student-1", "student-2"])).resolves.toBe(2);

    vi.mocked(prisma.tuitionInvoice.count).mockClear();
    await expect(countOpenTuitionInvoices([])).resolves.toBe(0);
    await expect(getOpenTuitionByStudent([])).resolves.toEqual(new Map());
    expect(prisma.tuitionInvoice.count).not.toHaveBeenCalled();
  });
});

describe("checkout", () => {
  it("starts a checkout for the verified child and returns the pay link", async () => {
    vi.mocked(startCheckout).mockResolvedValue({
      paymentId: "pay-1",
      payUrl: "https://pay.example/link",
      expiresAt: "2026-10-10T04:00:00.000Z",
    });

    await expect(
      startParentTuitionCheckout(
        "auth-1",
        child,
        { studentId: "student-1", invoiceId: " inv-1 " },
        "https://app.example.com",
      ),
    ).resolves.toEqual({
      ok: true,
      paymentId: "pay-1",
      payUrl: "https://pay.example/link",
      expiresAt: "2026-10-10T04:00:00.000Z",
    });
    expect(startCheckout).toHaveBeenCalledWith({
      invoiceId: "inv-1",
      studentId: "student-1",
      authUserId: "auth-1",
      baseUrl: "https://app.example.com",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/tuition");
  });

  it("returns business failures as ok:false instead of throwing", async () => {
    vi.mocked(startCheckout).mockRejectedValue(new TuitionError("ALREADY_PAID", "이미 납부된 청구서입니다", 409));

    await expect(
      startParentTuitionCheckout("auth-1", child, { invoiceId: "inv-1" }, "https://app.example.com"),
    ).resolves.toEqual({ ok: false, code: "ALREADY_PAID", message: "이미 납부된 청구서입니다" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reports a lock timeout as BUSY", async () => {
    vi.mocked(startCheckout).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Transaction API error", { code: "P2028", clientVersion: "test" }),
    );

    await expect(
      startParentTuitionCheckout("auth-1", child, { invoiceId: "inv-1" }, "https://app.example.com"),
    ).resolves.toMatchObject({ ok: false, code: "BUSY" });
  });

  it("lets unexpected errors through so the route answers 500", async () => {
    vi.mocked(startCheckout).mockRejectedValue(new Error("connection reset"));

    await expect(
      startParentTuitionCheckout("auth-1", child, { invoiceId: "inv-1" }, "https://app.example.com"),
    ).rejects.toThrow("connection reset");
  });

  it("rejects a malformed body before touching the core", async () => {
    for (const body of [null, {}, { invoiceId: "" }, { invoiceId: 12 }, { invoiceId: "x".repeat(65) }]) {
      await expect(
        startParentTuitionCheckout("auth-1", child, body, "https://app.example.com"),
      ).rejects.toMatchObject({ status: 400 });
    }
    expect(startCheckout).not.toHaveBeenCalled();
  });

  it("stops after too many link attempts in a day", async () => {
    vi.mocked(prisma.tuitionPayment.count).mockResolvedValue(20);

    await expect(
      startParentTuitionCheckout("auth-1", child, { invoiceId: "inv-1" }, "https://app.example.com"),
    ).rejects.toMatchObject({ status: 429 });
    expect(startCheckout).not.toHaveBeenCalled();
    expect(prisma.tuitionPayment.count).toHaveBeenCalledWith({
      where: {
        invoice: { studentId: "student-1" },
        method: { in: ["LINK"] },
        createdAt: { gte: new Date("2026-10-09T03:00:00.000Z") },
      },
    });
  });
});

describe("on-site request", () => {
  it("files and withdraws a request for the verified child", async () => {
    vi.mocked(requestOnsitePayment).mockResolvedValue({ paymentId: "pay-9" });
    vi.mocked(withdrawOnsiteRequest).mockResolvedValue(undefined);

    await expect(
      requestParentTuitionOnsite("auth-1", child, { invoiceId: "inv-1", method: "LOCAL_CURRENCY" }),
    ).resolves.toEqual({ ok: true, paymentId: "pay-9" });
    expect(requestOnsitePayment).toHaveBeenCalledWith({
      invoiceId: "inv-1",
      studentId: "student-1",
      authUserId: "auth-1",
      method: "LOCAL_CURRENCY",
    });

    await expect(withdrawParentTuitionOnsite("auth-1", child, { paymentId: "pay-9" })).resolves.toEqual({
      ok: true,
    });
    expect(withdrawOnsiteRequest).toHaveBeenCalledWith({
      paymentId: "pay-9",
      studentId: "student-1",
      authUserId: "auth-1",
    });
    expect(revalidatePath).toHaveBeenCalledTimes(2);
  });

  it("accepts only the two on-site methods", async () => {
    for (const method of ["CASH", "TRANSFER", "LINK", undefined]) {
      await expect(
        requestParentTuitionOnsite("auth-1", child, { invoiceId: "inv-1", method }),
      ).rejects.toMatchObject({ status: 400 });
    }
    await expect(withdrawParentTuitionOnsite("auth-1", child, {})).rejects.toMatchObject({ status: 400 });
    expect(requestOnsitePayment).not.toHaveBeenCalled();
    expect(withdrawOnsiteRequest).not.toHaveBeenCalled();
  });

  it("returns core refusals as ok:false and limits daily requests", async () => {
    vi.mocked(requestOnsitePayment).mockRejectedValue(
      new TuitionError("ONSITE_REQUEST_EXISTS", "이미 현장 결제를 신청했습니다"),
    );
    await expect(
      requestParentTuitionOnsite("auth-1", child, { invoiceId: "inv-1", method: "ONSITE_CARD" }),
    ).resolves.toEqual({ ok: false, code: "ONSITE_REQUEST_EXISTS", message: "이미 현장 결제를 신청했습니다" });

    vi.mocked(withdrawOnsiteRequest).mockRejectedValue(new TuitionError("NOT_FOUND", "신청을 찾을 수 없습니다", 404));
    await expect(withdrawParentTuitionOnsite("auth-1", child, { paymentId: "pay-x" })).resolves.toEqual({
      ok: false,
      code: "NOT_FOUND",
      message: "신청을 찾을 수 없습니다",
    });

    vi.mocked(requestOnsitePayment).mockClear();
    vi.mocked(prisma.tuitionPayment.count).mockResolvedValue(10);
    await expect(
      requestParentTuitionOnsite("auth-1", child, { invoiceId: "inv-1", method: "ONSITE_CARD" }),
    ).rejects.toMatchObject({ status: 429 });
    expect(requestOnsitePayment).not.toHaveBeenCalled();
  });
});

describe("sync", () => {
  it("refuses invoices of another child without calling the provider", async () => {
    vi.mocked(prisma.tuitionInvoice.findFirst).mockResolvedValue(null);

    await expect(syncParentTuition(child, { invoiceId: "inv-other" })).rejects.toMatchObject({
      status: 404,
      message: "청구서를 찾을 수 없습니다",
    });
    expect(prisma.tuitionInvoice.findFirst).toHaveBeenCalledWith({
      where: { id: "inv-other", studentId: "student-1" },
      select: { id: true, dueDate: true },
    });
    expect(syncInvoice).not.toHaveBeenCalled();
  });

  it("reports a settled invoice", async () => {
    vi.mocked(prisma.tuitionInvoice.findFirst).mockResolvedValue({
      id: "inv-1",
      dueDate: day("2026-10-07"),
    } as never);
    vi.mocked(syncInvoice).mockResolvedValue({ status: "PAID", changed: true });

    await expect(syncParentTuition(child, { invoiceId: "inv-1" })).resolves.toEqual({
      ok: true,
      status: "PAID",
      settled: true,
    });
    expect(syncInvoice).toHaveBeenCalledWith("inv-1", "SYNC");
    expect(revalidatePath).toHaveBeenCalledWith("/tuition");
  });

  it("keeps an unpaid invoice unsettled, overdue included", async () => {
    vi.mocked(syncInvoice).mockResolvedValue({ status: "REQUESTED", changed: false });

    vi.mocked(prisma.tuitionInvoice.findFirst).mockResolvedValue({
      id: "inv-1",
      dueDate: day("2026-10-07"),
    } as never);
    await expect(syncParentTuition(child, { invoiceId: "inv-1" })).resolves.toEqual({
      ok: true,
      status: "OVERDUE",
      settled: false,
    });

    vi.mocked(prisma.tuitionInvoice.findFirst).mockResolvedValue({
      id: "inv-1",
      dueDate: day("2026-10-20"),
    } as never);
    await expect(syncParentTuition(child, { invoiceId: "inv-1" })).resolves.toEqual({
      ok: true,
      status: "REQUESTED",
      settled: false,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a provider outage as ok:false", async () => {
    vi.mocked(prisma.tuitionInvoice.findFirst).mockResolvedValue({
      id: "inv-1",
      dueDate: day("2026-10-20"),
    } as never);
    vi.mocked(syncInvoice).mockRejectedValue(
      new TuitionError("PROVIDER_UNAVAILABLE", "결제사 응답이 없습니다. 잠시 후 다시 시도해 주세요", 503),
    );

    await expect(syncParentTuition(child, { invoiceId: "inv-1" })).resolves.toEqual({
      ok: false,
      code: "PROVIDER_UNAVAILABLE",
      message: "결제사 응답이 없습니다. 잠시 후 다시 시도해 주세요",
    });
  });
});
