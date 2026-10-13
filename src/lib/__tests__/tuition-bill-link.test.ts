import { beforeEach, describe, expect, it, vi } from "vitest";

// 청구서 링크(/bill/<token>) — 로그인 없이 열리는 화면이라 "무엇을 내보내는지"를 고정해 둔다.

vi.mock("@/lib/prisma", () => ({
  prisma: { tuitionInvoice: { findUnique: vi.fn(), updateMany: vi.fn() } },
}));
vi.mock("@/lib/tuition/settings", () => ({
  getTuitionSetting: vi.fn(),
  isOnlinePaymentAvailable: vi.fn(),
}));
vi.mock("@/lib/app-url", () => ({ getAppUrl: () => "https://app.test/" }));
vi.mock("@/lib/utils", () => ({ todayKST: () => new Date("2026-10-10T00:00:00.000Z") }));

import { prisma } from "@/lib/prisma";
import {
  billAppIntentLink,
  billAppLink,
  billUrl,
  ensureBillToken,
  findInvoiceByToken,
  getBillByToken,
} from "@/lib/tuition/bill-link";
import { getTuitionSetting, isOnlinePaymentAvailable } from "@/lib/tuition/settings";

const TOKEN = "tok_abcdefghijklmnopqrstuvwxyz012345";
const day = (key: string) => new Date(`${key}T00:00:00.000Z`);
const at = (iso: string) => new Date(iso);

function invoiceRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv-1",
    studentId: "student-1",
    title: "11월~1월 수강료 (3개월)",
    periodStart: day("2026-11-01"),
    periodEnd: day("2027-01-31"),
    months: 3,
    monthlyFee: 300_000,
    discount: 50_000,
    extraItems: [{ name: "교재비", amount: 30_000 }],
    amount: 880_000,
    taxType: "EXEMPT",
    dueDate: day("2026-10-15"),
    status: "REQUESTED",
    parentMessage: "교재비가 포함됐어요",
    paidAt: null,
    paidPaymentId: null,
    refundedAmount: 0,
    student: { name: "김학생" },
    payments: [],
    ...overrides,
  };
}

function payment(overrides: Record<string, unknown> & { id: string }) {
  return {
    method: "LINK",
    status: "PENDING",
    isDuplicate: false,
    providerMethod: null,
    checkoutStartedAt: null,
    depositBank: null,
    depositAccount: null,
    depositDueAt: null,
    requestedAt: null,
    createdAt: at("2026-10-09T01:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTuitionSetting).mockResolvedValue({
    guideText: "매월 1일 전까지 납부해 주세요",
    onsiteGuideText: "지역화폐는 데스크에서 결제해요",
  } as never);
  vi.mocked(isOnlinePaymentAvailable).mockResolvedValue(true);
});

describe("주소", () => {
  it("청구서 링크는 앱 주소 아래 /bill/<token>", () => {
    expect(billUrl(TOKEN)).toBe(`https://app.test/bill/${TOKEN}`);
  });

  it("앱 주소 — iOS 는 scheme, 안드로이드는 앱이 없으면 되돌아오는 intent", () => {
    expect(billAppLink("student-1")).toBe("studyroom://tuition?studentId=student-1");
    expect(billAppIntentLink("student-1", "https://app.test/bill/t?app=0")).toBe(
      "intent://tuition?studentId=student-1#Intent;scheme=studyroom;package=com.khsb.mobile;" +
        "S.browser_fallback_url=https%3A%2F%2Fapp.test%2Fbill%2Ft%3Fapp%3D0;end",
    );
  });
});

describe("토큰으로 찾기", () => {
  it.each([["짧은 토큰", "abc"], ["경로 문자", "../../etc/passwd_aaaaaaaaaaaa"], ["빈 값", ""], ["숫자", 12345 as never]])(
    "%s 은(는) DB 를 조회하지 않고 null",
    async (_label, token) => {
      await expect(findInvoiceByToken(token)).resolves.toBeNull();
      await expect(getBillByToken(token)).resolves.toBeNull();
      expect(prisma.tuitionInvoice.findUnique).not.toHaveBeenCalled();
    },
  );

  it("없는 토큰이면 null", async () => {
    vi.mocked(prisma.tuitionInvoice.findUnique).mockResolvedValue(null);
    await expect(getBillByToken(TOKEN)).resolves.toBeNull();
    expect(vi.mocked(prisma.tuitionInvoice.findUnique).mock.calls[0][0].where).toEqual({ shareToken: TOKEN });
  });
});

describe("getBillByToken", () => {
  it("학생 이름은 가리고, 금액 구성과 안내문을 내려 준다", async () => {
    vi.mocked(prisma.tuitionInvoice.findUnique).mockResolvedValue(invoiceRecord() as never);

    const bill = await getBillByToken(TOKEN);

    expect(bill).toMatchObject({
      studentName: "김*생",
      title: "11월~1월 수강료 (3개월)",
      periodStart: "2026-11-01",
      periodEnd: "2027-01-31",
      months: 3,
      monthlyFee: 300_000,
      tuitionAmount: 900_000,
      extraItems: [{ name: "교재비", amount: 30_000 }],
      discount: 50_000,
      amount: 880_000,
      tax: null,
      dueDate: "2026-10-15",
      daysToDue: 5,
      status: "REQUESTED",
      parentMessage: "교재비가 포함됐어요",
      guideText: "매월 1일 전까지 납부해 주세요",
      onsiteGuideText: "지역화폐는 데스크에서 결제해요",
      onlinePaymentEnabled: true,
      onsiteRequest: null,
      linkPending: null,
      appLink: "studyroom://tuition?studentId=student-1",
    });
    expect(bill?.appIntentLink).toContain(encodeURIComponent(`https://app.test/bill/${TOKEN}?app=0`));
  });

  it("전화번호·결제 식별자·내부 메모는 고르지 않는다", async () => {
    vi.mocked(prisma.tuitionInvoice.findUnique).mockResolvedValue(invoiceRecord() as never);
    await getBillByToken(TOKEN);

    const select = vi.mocked(prisma.tuitionInvoice.findUnique).mock.calls[0][0].select as Record<string, unknown> & {
      student: { select: Record<string, boolean> };
      payments: { select: Record<string, boolean> };
    };
    expect(select.memo).toBeUndefined();
    expect(select.shareToken).toBeUndefined();
    expect(Object.keys(select.student.select)).toEqual(["name"]);
    for (const hidden of ["payUrl", "providerOrderKey", "providerPaymentKey", "providerProductKey", "requestedByAuthUserId", "memo", "approvalNumber"]) {
      expect(select.payments.select[hidden]).toBeUndefined();
    }
  });

  it("기한이 지나면 미납, 과세면 공급가액·세액을 나눈다", async () => {
    vi.mocked(prisma.tuitionInvoice.findUnique).mockResolvedValue(
      invoiceRecord({ dueDate: day("2026-10-05"), taxType: "TAXABLE", amount: 330_000 }) as never,
    );
    await expect(getBillByToken(TOKEN)).resolves.toMatchObject({
      status: "OVERDUE",
      daysToDue: -5,
      tax: { supplyAmount: 300_000, taxAmount: 30_000 },
    });
  });

  it("현장 결제 신청·결제창을 연 상태·가상계좌 입금 대기를 알려 준다", async () => {
    vi.mocked(prisma.tuitionInvoice.findUnique).mockResolvedValue(
      invoiceRecord({
        payments: [
          payment({
            id: "pay-onsite",
            method: "LOCAL_CURRENCY",
            status: "ONSITE_REQUESTED",
            requestedAt: at("2026-10-09T03:00:00.000Z"),
          }),
        ],
      }) as never,
    );
    await expect(getBillByToken(TOKEN)).resolves.toMatchObject({
      onsiteRequest: { paymentId: "pay-onsite", method: "LOCAL_CURRENCY", requestedAt: "2026-10-09T03:00:00.000Z" },
      linkPending: null,
    });

    vi.mocked(prisma.tuitionInvoice.findUnique).mockResolvedValue(
      invoiceRecord({
        payments: [
          // 링크만 만들고 결제창을 열지 않은 시도는 "진행 중"이 아니다
          payment({ id: "pay-idle" }),
          payment({
            id: "pay-va",
            checkoutStartedAt: at("2026-10-09T04:00:00.000Z"),
            depositBank: "국민",
            depositAccount: "12345678901234",
            depositDueAt: at("2026-10-12T14:59:00.000Z"),
          }),
        ],
      }) as never,
    );
    await expect(getBillByToken(TOKEN)).resolves.toMatchObject({
      linkPending: { deposit: { bank: "국민", accountNumber: "12345678901234", dueAt: "2026-10-12T14:59:00.000Z" } },
    });
  });

  it("납부된 청구서는 결제 수단을 보여 주고 진행 중인 시도는 숨긴다", async () => {
    vi.mocked(prisma.tuitionInvoice.findUnique).mockResolvedValue(
      invoiceRecord({
        status: "PARTIALLY_REFUNDED",
        paidAt: at("2026-10-09T05:00:00.000Z"),
        paidPaymentId: "pay-done",
        refundedAmount: 100_000,
        payments: [
          payment({ id: "pay-done", status: "DONE", providerMethod: "카드" }),
          payment({ id: "pay-dup", status: "DONE", isDuplicate: true }),
        ],
      }) as never,
    );
    await expect(getBillByToken(TOKEN)).resolves.toMatchObject({
      status: "PARTIALLY_REFUNDED",
      paidAt: "2026-10-09T05:00:00.000Z",
      paidMethodLabel: "온라인 결제(카드)",
      refundedAmount: 100_000,
      onsiteRequest: null,
      linkPending: null,
    });
  });
});

describe("ensureBillToken", () => {
  it("이미 있으면 그대로 돌려준다", async () => {
    vi.mocked(prisma.tuitionInvoice.findUnique).mockResolvedValue({ shareToken: TOKEN } as never);
    await expect(ensureBillToken("inv-1")).resolves.toBe(TOKEN);
    expect(prisma.tuitionInvoice.updateMany).not.toHaveBeenCalled();
  });

  it("없으면 비어 있을 때만 채우고, 저장된 값을 다시 읽어 돌려준다 (동시에 불려도 한 토큰)", async () => {
    vi.mocked(prisma.tuitionInvoice.findUnique)
      .mockResolvedValueOnce({ shareToken: null } as never)
      .mockResolvedValueOnce({ shareToken: "tok_written_by_the_other_request_0001" } as never);
    await expect(ensureBillToken("inv-1")).resolves.toBe("tok_written_by_the_other_request_0001");

    const update = vi.mocked(prisma.tuitionInvoice.updateMany).mock.calls[0][0];
    expect(update.where).toEqual({ id: "inv-1", shareToken: null });
    expect((update.data as { shareToken: string }).shareToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("없는 청구서면 null", async () => {
    vi.mocked(prisma.tuitionInvoice.findUnique).mockResolvedValue(null);
    await expect(ensureBillToken("inv-x")).resolves.toBeNull();
  });
});
