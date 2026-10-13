import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    student: { findUnique: vi.fn(), findMany: vi.fn() },
    tuitionInvoice: { findMany: vi.fn() },
    tuitionProfile: { upsert: vi.fn() },
    tuitionSetting: { upsert: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}));
vi.mock("@/lib/tuition/dev-origin", () => ({ devRequestOrigin: vi.fn(async () => "http://localhost:3100") }));
// 돈이 움직이는 처리는 전부 코어가 한다 — 액션은 권한·입력 검증과 결과 변환만 본다
vi.mock("@/lib/tuition/core", () => ({
  issueInvoice: vi.fn(),
  cancelInvoice: vi.fn(),
  confirmOnsitePayment: vi.fn(),
  dismissOnsiteRequest: vi.fn(),
  requestRefund: vi.fn(),
  sendTuitionNotices: vi.fn(),
  syncInvoice: vi.fn(),
  requestCashReceipt: vi.fn(),
  markCashReceiptIssued: vi.fn(),
  cancelCashReceipt: vi.fn(),
  ensureBillToken: vi.fn(),
  billUrl: vi.fn((token: string) => `https://app.test/bill/${token}`),
  getTuitionExport: vi.fn(),
  sendInvoiceTalk: vi.fn(),
  getTuitionProviderBalance: vi.fn(),
}));
vi.mock("@/lib/tuition/admin-data", () => ({ getTuitionInvoiceDetail: vi.fn() }));

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  cancelTuitionCashReceipt,
  cancelTuitionInvoice,
  confirmTuitionOnsitePayment,
  dismissTuitionOnsiteRequest,
  exportTuitionCsv,
  getTuitionBillLink,
  issueTuitionInvoices,
  loadTuitionInvoiceDetail,
  loadTuitionProviderBalance,
  markTuitionCashReceiptIssued,
  refreshTuitionInvoice,
  refundTuition,
  requestTuitionCashReceipt,
  saveTuitionBillingAnchors,
  sendTuitionBillTalk,
  sendTuitionReminders,
  updateTuitionProfile,
  updateTuitionSetting,
  type TuitionSettingInput,
} from "@/actions/tuition";
import { getTuitionInvoiceDetail } from "@/lib/tuition/admin-data";
import {
  cancelCashReceipt,
  cancelInvoice,
  confirmOnsitePayment,
  dismissOnsiteRequest,
  ensureBillToken,
  getTuitionExport,
  getTuitionProviderBalance,
  issueInvoice,
  markCashReceiptIssued,
  requestCashReceipt,
  requestRefund,
  sendInvoiceTalk,
  sendTuitionNotices,
  syncInvoice,
} from "@/lib/tuition/core";
import { ProviderError } from "@/lib/tuition/provider";
import { TuitionError } from "@/lib/tuition/types";
import { mockSession } from "./_helpers";

const director = mockSession({ id: "user-director", role: "DIRECTOR", name: "원장" });
const mentor = mockSession({ id: "user-mentor", role: "MENTOR", name: "멘토" });
const consultant = mockSession({ id: "user-consultant", role: "CONSULTANT", name: "컨설턴트" });

const issueItem = {
  studentId: "student-1",
  periodStart: "2026-11-01",
  months: 1,
  monthlyFee: 300_000,
  dueDate: "2026-11-07",
};

const settingInput: TuitionSettingInput = {
  defaultMonthlyFee: 300_000,
  dueDays: 7,
  leadDays: 7,
  reminderDays: "7,3",
  refundPolicy: "DAILY",
  onlinePaymentEnabled: true,
  taxType: "EXEMPT",
  autoIssueEnabled: false,
  autoIssueLeadDays: 3,
  guideText: null,
  onsiteGuideText: null,
};

/** 직원 전체가 쓸 수 있는 액션 */
const STAFF_ACTIONS: Record<string, () => Promise<{ ok: boolean }>> = {
  confirmTuitionOnsitePayment: () => confirmTuitionOnsitePayment({ invoiceId: "invoice-1", method: "CASH" }),
  dismissTuitionOnsiteRequest: () => dismissTuitionOnsiteRequest("payment-1"),
  refreshTuitionInvoice: () => refreshTuitionInvoice("invoice-1"),
  loadTuitionInvoiceDetail: () => loadTuitionInvoiceDetail("invoice-1"),
  getTuitionBillLink: () => getTuitionBillLink("invoice-1"),
  requestTuitionCashReceipt: () =>
    requestTuitionCashReceipt({ paymentId: "payment-1", purpose: "INCOME", identifier: "010-1234-5678" }),
};

/** 원장급만 쓸 수 있는 액션 */
const FULL_ACCESS_ACTIONS: Record<string, () => Promise<{ ok: boolean }>> = {
  issueTuitionInvoices: () => issueTuitionInvoices([issueItem]),
  cancelTuitionInvoice: () => cancelTuitionInvoice("invoice-1", "금액 잘못 입력"),
  refundTuition: () => refundTuition({ invoiceId: "invoice-1", amount: 100_000, reason: "중도 퇴실" }),
  sendTuitionReminders: () => sendTuitionReminders(["invoice-1"], "REMIND"),
  updateTuitionSetting: () => updateTuitionSetting(settingInput),
  updateTuitionProfile: () => updateTuitionProfile({ studentId: "student-1", monthlyFee: null, billingPaused: false }),
  saveTuitionBillingAnchors: () => saveTuitionBillingAnchors([{ studentId: "student-1", billingAnchor: "2026-10-25" }]),
  markTuitionCashReceiptIssued: () => markTuitionCashReceiptIssued("receipt-1", "A12345678"),
  cancelTuitionCashReceipt: () => cancelTuitionCashReceipt("receipt-1", "잘못 등록"),
  exportTuitionCsv: () => exportTuitionCsv("2026-10"),
  sendTuitionBillTalk: () => sendTuitionBillTalk(["invoice-1"]),
  loadTuitionProviderBalance: () => loadTuitionProviderBalance(),
};

const ALL_ACTIONS = { ...STAFF_ACTIONS, ...FULL_ACCESS_ACTIONS };

const coreMocks = [
  issueInvoice,
  cancelInvoice,
  confirmOnsitePayment,
  dismissOnsiteRequest,
  requestRefund,
  sendTuitionNotices,
  syncInvoice,
  requestCashReceipt,
  markCashReceiptIssued,
  cancelCashReceipt,
  ensureBillToken,
  getTuitionExport,
  sendInvoiceTalk,
  getTuitionProviderBalance,
];

function expectNothingTouched() {
  for (const mock of coreMocks) expect(mock).not.toHaveBeenCalled();
  expect(getTuitionInvoiceDetail).not.toHaveBeenCalled();
  expect(prisma.tuitionSetting.upsert).not.toHaveBeenCalled();
  expect(prisma.tuitionProfile.upsert).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(director);
  vi.mocked(issueInvoice).mockResolvedValue({ invoiceId: "invoice-new" });
  vi.mocked(cancelInvoice).mockResolvedValue(undefined);
  vi.mocked(confirmOnsitePayment).mockResolvedValue({ paymentId: "payment-1" });
  vi.mocked(dismissOnsiteRequest).mockResolvedValue(undefined);
  vi.mocked(requestRefund).mockResolvedValue({ refundId: "refund-1", status: "DONE", failMessage: null });
  vi.mocked(sendTuitionNotices).mockResolvedValue([{ invoiceId: "invoice-1", studentName: "학생A", sent: 2 }]);
  vi.mocked(syncInvoice).mockResolvedValue({ status: "PAID", changed: true });
  vi.mocked(requestCashReceipt).mockResolvedValue({ cashReceiptId: "receipt-1" });
  vi.mocked(markCashReceiptIssued).mockResolvedValue(undefined);
  vi.mocked(cancelCashReceipt).mockResolvedValue(undefined);
  vi.mocked(ensureBillToken).mockResolvedValue("tok_abcdefghijklmnopqrstuvwxyz");
  vi.mocked(sendInvoiceTalk).mockResolvedValue({ paymentId: "payment-talk", resent: false });
  vi.mocked(getTuitionProviderBalance).mockResolvedValue({ balance: 42, chargeUrl: "https://charge.example.com" });
  vi.mocked(prisma.tuitionInvoice.findMany).mockResolvedValue([
    { id: "invoice-1", student: { name: "학생A" } },
    { id: "invoice-2", student: { name: "학생B" } },
  ] as never);
  vi.mocked(getTuitionExport).mockResolvedValue({ filename: "수강료_수납내역_2026-10.csv", csv: "학생", count: 0 });
  vi.mocked(getTuitionInvoiceDetail).mockResolvedValue({ today: "2026-10-10" } as never);
  vi.mocked(prisma.student.findUnique).mockResolvedValue({ id: "student-1" } as never);
  vi.mocked(prisma.student.findMany).mockResolvedValue([{ id: "student-1" }] as never);
});

describe("권한", () => {
  it.each(Object.keys(ALL_ACTIONS))("%s — 로그인하지 않았으면 Unauthorized", async (name) => {
    vi.mocked(auth).mockResolvedValue(null);
    await expect(ALL_ACTIONS[name]()).rejects.toThrow("Unauthorized");
    expectNothingTouched();
  });

  it.each(Object.keys(ALL_ACTIONS))("%s — 온라인 관리 전용 역할은 Forbidden", async (name) => {
    vi.mocked(auth).mockResolvedValue(consultant);
    await expect(ALL_ACTIONS[name]()).rejects.toThrow("Forbidden");
    expectNothingTouched();
  });

  it.each(Object.keys(STAFF_ACTIONS))("%s — 멘토(직원)도 쓸 수 있다", async (name) => {
    vi.mocked(auth).mockResolvedValue(mentor);
    await expect(STAFF_ACTIONS[name]()).resolves.toMatchObject({ ok: true });
  });

  it.each(Object.keys(FULL_ACCESS_ACTIONS))("%s — 멘토(직원)는 Forbidden", async (name) => {
    vi.mocked(auth).mockResolvedValue(mentor);
    await expect(FULL_ACCESS_ACTIONS[name]()).rejects.toThrow("Forbidden");
    expectNothingTouched();
  });

  it.each(Object.keys(ALL_ACTIONS))("%s — 원장은 쓸 수 있다", async (name) => {
    await expect(ALL_ACTIONS[name]()).resolves.toMatchObject({ ok: true });
  });
});

describe("결과 변환", () => {
  it("코어가 던진 TuitionError 는 { ok:false, code, error } 로 돌아온다", async () => {
    vi.mocked(cancelInvoice).mockRejectedValue(new TuitionError("ALREADY_PAID", "이미 납부된 청구서는 취소할 수 없습니다", 409));
    await expect(cancelTuitionInvoice("invoice-1", "잘못 발행")).resolves.toEqual({
      ok: false,
      code: "ALREADY_PAID",
      error: "이미 납부된 청구서는 취소할 수 없습니다",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/tuition");
  });

  it("예상하지 못한 오류는 원문을 숨기고 INTERNAL 로 돌려준다", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(dismissOnsiteRequest).mockRejectedValue(new Error("connection reset by peer"));
    const result = await dismissTuitionOnsiteRequest("payment-1");
    expect(result).toMatchObject({ ok: false, code: "INTERNAL" });
    expect(JSON.stringify(result)).not.toContain("connection reset");
    logged.mockRestore();
  });

  it("처리한 직원을 코어에 넘기고 목록을 다시 그리게 한다", async () => {
    vi.mocked(auth).mockResolvedValue(mentor);
    const result = await confirmTuitionOnsitePayment({
      invoiceId: "invoice-1",
      paymentId: "payment-1",
      method: "LOCAL_CURRENCY",
      memo: "  영수증 12  ",
    });
    expect(result).toEqual({ ok: true, data: { paymentId: "payment-1" } });
    expect(confirmOnsitePayment).toHaveBeenCalledWith(
      { invoiceId: "invoice-1", paymentId: "payment-1", method: "LOCAL_CURRENCY", memo: "영수증 12", approvalNumber: null },
      { id: "user-mentor", name: "멘토" },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/tuition");
  });

  it("상태 새로고침은 결제사를 강제로 다시 조회한다", async () => {
    await expect(refreshTuitionInvoice("invoice-1")).resolves.toEqual({
      ok: true,
      data: { status: "PAID", changed: true },
    });
    expect(syncInvoice).toHaveBeenCalledWith("invoice-1", "SYNC", { force: true });
  });

  it("없는 청구서의 상세는 NOT_FOUND", async () => {
    vi.mocked(getTuitionInvoiceDetail).mockResolvedValue(null);
    await expect(loadTuitionInvoiceDetail("invoice-x")).resolves.toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});

describe("issueTuitionInvoices", () => {
  it("건마다 따로 발행하고 일부 실패를 건별로 돌려준다", async () => {
    vi.mocked(issueInvoice)
      .mockResolvedValueOnce({ invoiceId: "invoice-a" })
      .mockRejectedValueOnce(new TuitionError("PERIOD_OVERLAP", "이용 기간이 겹치는 청구서가 이미 있습니다", 409));

    const result = await issueTuitionInvoices([
      { ...issueItem, studentId: "student-a" },
      { ...issueItem, studentId: "student-b" },
    ]);

    expect(result).toEqual({
      ok: true,
      data: {
        issued: 1,
        failed: 1,
        results: [
          { studentId: "student-a", ok: true, invoiceId: "invoice-a" },
          {
            studentId: "student-b",
            ok: false,
            code: "PERIOD_OVERLAP",
            error: "이용 기간이 겹치는 청구서가 이미 있습니다",
          },
        ],
      },
    });
    expect(issueInvoice).toHaveBeenCalledTimes(2);
    expect(issueInvoice).toHaveBeenNthCalledWith(
      1,
      { ...issueItem, studentId: "student-a", discount: 0, extraItems: [], parentMessage: null, memo: null, notify: true },
      { id: "user-director", name: "원장" },
    );
  });

  it("추가 항목과 학부모 안내 메시지를 다듬어 넘긴다", async () => {
    await issueTuitionInvoices([
      {
        ...issueItem,
        extraItems: [{ name: "  교재비 ", amount: 30_000 }],
        parentMessage: "  교재비가 포함됐어요  ",
      },
    ]);
    expect(vi.mocked(issueInvoice).mock.calls[0][0]).toMatchObject({
      extraItems: [{ name: "교재비", amount: 30_000 }],
      parentMessage: "교재비가 포함됐어요",
    });
  });

  it("추가 항목 금액이 틀리거나 안내 메시지가 너무 길면 그 건만 실패한다", async () => {
    const result = await issueTuitionInvoices([
      { ...issueItem, studentId: "student-a", extraItems: [{ name: "교재비", amount: -1 }] },
      { ...issueItem, studentId: "student-b", extraItems: "교재비" as never },
      { ...issueItem, studentId: "student-c", parentMessage: "가".repeat(501) },
    ]);
    expect(result.ok && result.data.results.map((r) => r.code)).toEqual([
      "INVALID_INPUT",
      "INVALID_INPUT",
      "INVALID_INPUT",
    ]);
    expect(issueInvoice).not.toHaveBeenCalled();
  });

  it("형식이 틀린 건은 코어를 부르지 않고 그 건만 실패로 돌려준다", async () => {
    const result = await issueTuitionInvoices([
      { ...issueItem, studentId: "student-a", monthlyFee: "300000" as never },
      { ...issueItem, studentId: "student-b", periodStart: "2026-02-30" },
      { ...issueItem, studentId: "student-c" },
    ]);
    expect(result.ok && result.data.results.map((r) => [r.studentId, r.ok, r.code])).toEqual([
      ["student-a", false, "INVALID_INPUT"],
      ["student-b", false, "INVALID_INPUT"],
      ["student-c", true, undefined],
    ]);
    expect(issueInvoice).toHaveBeenCalledTimes(1);
  });

  it("빈 목록·상한을 넘는 목록은 거절한다", async () => {
    await expect(issueTuitionInvoices([])).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    const tooMany = Array.from({ length: 201 }, (_, i) => ({ ...issueItem, studentId: `student-${i}` }));
    await expect(issueTuitionInvoices(tooMany)).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(issueInvoice).not.toHaveBeenCalled();
  });
});

describe("입력 검증", () => {
  it("id 가 문자열이 아니거나 너무 길면 코어를 부르지 않는다", async () => {
    await expect(cancelTuitionInvoice({ $ne: "" } as never, "사유")).resolves.toMatchObject({
      ok: false,
      code: "INVALID_INPUT",
    });
    await expect(dismissTuitionOnsiteRequest("x".repeat(65))).resolves.toMatchObject({
      ok: false,
      code: "INVALID_INPUT",
    });
    expect(cancelInvoice).not.toHaveBeenCalled();
    expect(dismissOnsiteRequest).not.toHaveBeenCalled();
  });

  it("취소 사유는 비울 수 없고 300자를 넘을 수 없다", async () => {
    await expect(cancelTuitionInvoice("invoice-1", "   ")).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    await expect(cancelTuitionInvoice("invoice-1", "가".repeat(301))).resolves.toMatchObject({
      ok: false,
      code: "INVALID_INPUT",
    });
    expect(cancelInvoice).not.toHaveBeenCalled();
  });

  it("현장 결제 수단은 정해진 네 가지만 받는다", async () => {
    await expect(
      confirmTuitionOnsitePayment({ invoiceId: "invoice-1", method: "LINK" as never }),
    ).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(confirmOnsitePayment).not.toHaveBeenCalled();
  });

  it("환불 — 이용 전 환불(null)과 이용 기간 유지(생략)를 구분해 넘기고 모르는 값은 버린다", async () => {
    await refundTuition({
      invoiceId: "invoice-1",
      amount: 150_000,
      reason: " 개강 전 취소 ",
      lastUsedDate: null,
      isAdmin: true,
    } as never);
    expect(requestRefund).toHaveBeenLastCalledWith(
      {
        invoiceId: "invoice-1",
        amount: 150_000,
        reason: "개강 전 취소",
        calcBasis: null,
        manualConfirmed: false,
        lastUsedDate: null,
      },
      { id: "user-director", name: "원장" },
    );

    await refundTuition({ invoiceId: "invoice-1", amount: 150_000, reason: "금액 조정", manualConfirmed: true });
    const kept = vi.mocked(requestRefund).mock.calls[1][0];
    expect("lastUsedDate" in kept).toBe(false);
    expect(kept.manualConfirmed).toBe(true);
  });

  it("환불 — 금액·날짜·계좌 형식이 틀리면 코어를 부르지 않는다", async () => {
    const base = { invoiceId: "invoice-1", amount: 100_000, reason: "중도 퇴실" };
    for (const input of [
      { ...base, amount: 0 },
      { ...base, amount: 1000.5 },
      { ...base, lastUsedDate: "2026-13-01" },
      { ...base, refundAccount: { bank: "은행", accountNumber: "abc", holderName: "예금주" } },
    ]) {
      await expect(refundTuition(input)).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    }
    expect(requestRefund).not.toHaveBeenCalled();

    await refundTuition({
      ...base,
      refundAccount: { bank: " 은행 ", accountNumber: "110-123-456789", holderName: "예금주" },
    });
    expect(vi.mocked(requestRefund).mock.calls[0][0].refundAccount).toEqual({
      bank: "은행",
      accountNumber: "110123456789",
      holderName: "예금주",
    });
  });

  it("안내 발송 — 종류와 대상 목록을 확인하고 중복 id 는 한 번만 보낸다", async () => {
    await expect(sendTuitionReminders(["invoice-1"], "PAID" as never)).resolves.toMatchObject({
      ok: false,
      code: "INVALID_INPUT",
    });
    await expect(sendTuitionReminders([], "REMIND")).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(sendTuitionNotices).not.toHaveBeenCalled();

    await expect(sendTuitionReminders(["invoice-1", "invoice-1"], "REQUEST")).resolves.toEqual({
      ok: true,
      data: [{ invoiceId: "invoice-1", studentName: "학생A", sent: 2 }],
    });
    expect(sendTuitionNotices).toHaveBeenCalledWith(["invoice-1"], "REQUEST", { id: "user-director", name: "원장" });
  });
});

describe("updateTuitionSetting", () => {
  it("값을 정리해 단일 행(default)에 저장한다", async () => {
    const result = await updateTuitionSetting({
      ...settingInput,
      reminderDays: " 3, 7 ,3",
      guideText: "  매월 1일 전까지 납부해 주세요  ",
      onsiteGuideText: "   ",
    });
    expect(result).toEqual({ ok: true, data: undefined });
    const data = {
      defaultMonthlyFee: 300_000,
      dueDays: 7,
      leadDays: 7,
      reminderDays: "7,3",
      refundPolicy: "DAILY",
      onlinePaymentEnabled: true,
      taxType: "EXEMPT",
      autoIssueEnabled: false,
      autoIssueLeadDays: 3,
      guideText: "매월 1일 전까지 납부해 주세요",
      onsiteGuideText: null,
      updatedById: "user-director",
    };
    expect(prisma.tuitionSetting.upsert).toHaveBeenCalledWith({
      where: { id: "default" },
      create: { id: "default", ...data },
      update: data,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/tuition");
  });

  it.each<[string, Partial<TuitionSettingInput>]>([
    ["납부 기한 일수 61", { dueDays: 61 }],
    ["청구 예정 기준 일수 -1", { leadDays: -1 }],
    ["소수 일수", { dueDays: 1.5 }],
    ["재결제 안내 시점에 글자", { reminderDays: "7,삼" }],
    ["재결제 안내 시점 61", { reminderDays: "61" }],
    ["기본 수강료 999원", { defaultMonthlyFee: 999 }],
    ["없는 환불 계산 방식", { refundPolicy: "FREE" as never }],
    ["온라인 결제 사용이 문자열", { onlinePaymentEnabled: "true" as never }],
    ["없는 과세 유형", { taxType: "ZERO" as never }],
    ["자동 청구 사용이 문자열", { autoIssueEnabled: "true" as never }],
    ["자동 청구 시점 31일 전", { autoIssueLeadDays: 31 }],
    ["안내문 5,001자", { guideText: "가".repeat(5001) }],
  ])("%s 은(는) 저장하지 않는다", async (_label, patch) => {
    await expect(updateTuitionSetting({ ...settingInput, ...patch })).resolves.toMatchObject({
      ok: false,
      code: "INVALID_INPUT",
    });
    expect(prisma.tuitionSetting.upsert).not.toHaveBeenCalled();
  });

  it("기본 수강료와 재결제 안내는 비울 수 있다", async () => {
    await expect(
      updateTuitionSetting({ ...settingInput, defaultMonthlyFee: null, reminderDays: "" }),
    ).resolves.toMatchObject({ ok: true });
    expect(vi.mocked(prisma.tuitionSetting.upsert).mock.calls[0][0].update).toMatchObject({
      defaultMonthlyFee: null,
      reminderDays: "",
    });
  });
});

describe("updateTuitionProfile", () => {
  it("학생별 수강료를 저장한다", async () => {
    await expect(
      updateTuitionProfile({ studentId: "student-1", monthlyFee: 280_000, billingPaused: true, memo: " 형제 할인 " }),
    ).resolves.toEqual({ ok: true, data: undefined });
    const data = { monthlyFee: 280_000, billingPaused: true, memo: "형제 할인", updatedById: "user-director" };
    expect(prisma.tuitionProfile.upsert).toHaveBeenCalledWith({
      where: { studentId: "student-1" },
      create: { studentId: "student-1", ...data },
      update: data,
    });
  });

  it("결제 기준일은 보낸 경우에만 바꾼다 — 날짜면 저장, null·빈 값이면 지운다", async () => {
    const base = { studentId: "student-1", monthlyFee: null, billingPaused: false };
    await updateTuitionProfile({ ...base, billingAnchor: "2026-10-25" });
    await updateTuitionProfile({ ...base, billingAnchor: null });
    await updateTuitionProfile(base);
    const saved = vi.mocked(prisma.tuitionProfile.upsert).mock.calls.map((call) => call[0].update);
    expect(saved[0]).toMatchObject({ billingAnchor: new Date("2026-10-25T00:00:00.000Z") });
    expect(saved[1]).toMatchObject({ billingAnchor: null });
    expect(saved[2]).not.toHaveProperty("billingAnchor");

    await expect(updateTuitionProfile({ ...base, billingAnchor: "2026-02-30" })).resolves.toMatchObject({
      ok: false,
      code: "INVALID_INPUT",
    });
    expect(prisma.tuitionProfile.upsert).toHaveBeenCalledTimes(3);
  });

  it("없는 학생이면 NOT_FOUND, 금액이 틀리면 INVALID_INPUT", async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue(null);
    await expect(
      updateTuitionProfile({ studentId: "student-x", monthlyFee: null, billingPaused: false }),
    ).resolves.toMatchObject({ ok: false, code: "NOT_FOUND" });
    await expect(
      updateTuitionProfile({ studentId: "student-1", monthlyFee: 500, billingPaused: false }),
    ).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(prisma.tuitionProfile.upsert).not.toHaveBeenCalled();
  });
});

describe("saveTuitionBillingAnchors", () => {
  it("여러 학생의 결제 기준일을 한 번에 저장한다", async () => {
    vi.mocked(prisma.student.findMany).mockResolvedValue([{ id: "student-1" }, { id: "student-2" }] as never);
    await expect(
      saveTuitionBillingAnchors([
        { studentId: "student-1", billingAnchor: "2026-10-25" },
        { studentId: "student-2", billingAnchor: "2026-11-03" },
      ]),
    ).resolves.toEqual({ ok: true, data: { saved: 2 } });
    expect(prisma.tuitionProfile.upsert).toHaveBeenCalledTimes(2);
    const second = { billingAnchor: new Date("2026-11-03T00:00:00.000Z"), updatedById: "user-director" };
    expect(prisma.tuitionProfile.upsert).toHaveBeenLastCalledWith({
      where: { studentId: "student-2" },
      create: { studentId: "student-2", ...second },
      update: second,
    });
  });

  it("날짜가 틀리거나 없는 학생이 섞이면 아무도 저장하지 않는다", async () => {
    vi.mocked(prisma.student.findMany).mockResolvedValue([{ id: "student-1" }] as never);
    await expect(
      saveTuitionBillingAnchors([
        { studentId: "student-1", billingAnchor: "2026-10-25" },
        { studentId: "student-x", billingAnchor: "2026-10-25" },
      ]),
    ).resolves.toMatchObject({ ok: false, code: "NOT_FOUND" });
    await expect(
      saveTuitionBillingAnchors([{ studentId: "student-1", billingAnchor: "" }]),
    ).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    await expect(saveTuitionBillingAnchors([])).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(prisma.tuitionProfile.upsert).not.toHaveBeenCalled();
  });
});

describe("현장 결제 확인 + 현금영수증", () => {
  it("단말기 승인번호를 넘긴다", async () => {
    await confirmTuitionOnsitePayment({ invoiceId: "invoice-1", method: "ONSITE_CARD", approvalNumber: " 30012345 " });
    expect(vi.mocked(confirmOnsitePayment).mock.calls[0][0]).toMatchObject({ approvalNumber: "30012345" });
    expect(requestCashReceipt).not.toHaveBeenCalled();
  });

  it("현금 수납이면 현금영수증 신청 정보를 같이 등록한다 (번호는 숫자만)", async () => {
    vi.mocked(auth).mockResolvedValue(mentor);
    const result = await confirmTuitionOnsitePayment({
      invoiceId: "invoice-1",
      method: "CASH",
      cashReceipt: { purpose: "INCOME", identifier: "010-1234-5678" },
    });
    expect(result).toEqual({ ok: true, data: { paymentId: "payment-1" } });
    expect(requestCashReceipt).toHaveBeenCalledWith(
      { paymentId: "payment-1", purpose: "INCOME", identifier: "01012345678" },
      { id: "user-mentor", name: "멘토" },
    );
  });

  it("번호 형식이 틀리면 납부 처리도 하지 않는다", async () => {
    await expect(
      confirmTuitionOnsitePayment({
        invoiceId: "invoice-1",
        method: "CASH",
        cashReceipt: { purpose: "EXPENSE", identifier: "123-45" },
      }),
    ).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(confirmOnsitePayment).not.toHaveBeenCalled();
    expect(requestCashReceipt).not.toHaveBeenCalled();
  });

  it("카드·지역화폐 수납에는 현금영수증을 등록하지 않는다", async () => {
    await expect(
      confirmTuitionOnsitePayment({
        invoiceId: "invoice-1",
        method: "LOCAL_CURRENCY",
        cashReceipt: { purpose: "INCOME", identifier: "01012345678" },
      }),
    ).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(confirmOnsitePayment).not.toHaveBeenCalled();
  });

  it("납부는 됐는데 현금영수증 등록만 실패하면 납부를 되돌리지 않고 사유를 같이 돌려준다", async () => {
    vi.mocked(requestCashReceipt).mockRejectedValue(new TuitionError("BUSY", "잠시 후 다시 시도해 주세요", 409));
    await expect(
      confirmTuitionOnsitePayment({
        invoiceId: "invoice-1",
        method: "TRANSFER",
        cashReceipt: { purpose: "INCOME", identifier: "01012345678" },
      }),
    ).resolves.toEqual({
      ok: true,
      data: { paymentId: "payment-1", cashReceiptError: "잠시 후 다시 시도해 주세요" },
    });
  });
});

describe("현금영수증 기록", () => {
  it("신청 등록 — 구분과 번호를 확인한다", async () => {
    await expect(
      requestTuitionCashReceipt({ paymentId: "payment-1", purpose: "EXPENSE", identifier: "123-45-67890" }),
    ).resolves.toEqual({ ok: true, data: { cashReceiptId: "receipt-1" } });
    expect(requestCashReceipt).toHaveBeenCalledWith(
      { paymentId: "payment-1", purpose: "EXPENSE", identifier: "1234567890" },
      { id: "user-director", name: "원장" },
    );

    vi.mocked(requestCashReceipt).mockClear();
    for (const bad of [
      { paymentId: "payment-1", purpose: "GIFT" as never, identifier: "01012345678" },
      { paymentId: "payment-1", purpose: "INCOME" as const, identifier: "900101-1234567" },
      { paymentId: 1 as never, purpose: "INCOME" as const, identifier: "01012345678" },
    ]) {
      await expect(requestTuitionCashReceipt(bad)).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    }
    expect(requestCashReceipt).not.toHaveBeenCalled();
  });

  it("발급 완료·취소는 승인번호·사유가 있어야 한다", async () => {
    await expect(markTuitionCashReceiptIssued("receipt-1", "  ")).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    await expect(cancelTuitionCashReceipt("receipt-1", "")).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(markCashReceiptIssued).not.toHaveBeenCalled();
    expect(cancelCashReceipt).not.toHaveBeenCalled();

    await markTuitionCashReceiptIssued("receipt-1", " A12345678 ");
    expect(markCashReceiptIssued).toHaveBeenCalledWith("receipt-1", "A12345678", { id: "user-director", name: "원장" });
    await cancelTuitionCashReceipt("receipt-1", " 환불 ");
    expect(cancelCashReceipt).toHaveBeenCalledWith("receipt-1", "환불", { id: "user-director", name: "원장" });
  });
});

describe("청구서 링크 · 내보내기", () => {
  it("링크 토큰을 확보해 주소로 돌려준다", async () => {
    await expect(getTuitionBillLink("invoice-1")).resolves.toEqual({
      ok: true,
      data: { url: "https://app.test/bill/tok_abcdefghijklmnopqrstuvwxyz" },
    });
    expect(ensureBillToken).toHaveBeenCalledWith("invoice-1");

    vi.mocked(ensureBillToken).mockResolvedValue(null);
    await expect(getTuitionBillLink("invoice-x")).resolves.toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("상세 조회에 원장급 여부를 넘긴다 (직원에게는 현금영수증 번호를 가린다)", async () => {
    await loadTuitionInvoiceDetail("invoice-1");
    expect(getTuitionInvoiceDetail).toHaveBeenLastCalledWith("invoice-1", { fullAccess: true });
    vi.mocked(auth).mockResolvedValue(mentor);
    await loadTuitionInvoiceDetail("invoice-1");
    expect(getTuitionInvoiceDetail).toHaveBeenLastCalledWith("invoice-1", { fullAccess: false });
  });

  it("내보내기는 달 형식을 확인한다", async () => {
    await expect(exportTuitionCsv("2026-10")).resolves.toMatchObject({ ok: true, data: { count: 0 } });
    expect(getTuitionExport).toHaveBeenCalledWith({ ym: "2026-10" });
    await expect(exportTuitionCsv("2026-13")).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    await expect(exportTuitionCsv(["2026-10"] as never)).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(getTuitionExport).toHaveBeenCalledTimes(1);
  });
});

describe("결제사 알림톡 청구서 · 포인트 잔액", () => {
  it("건마다 따로 보내고, 보낸 건·다시 보낸 건·실패한 건을 학생 이름과 함께 돌려준다", async () => {
    vi.mocked(sendInvoiceTalk)
      .mockResolvedValueOnce({ paymentId: "p1", resent: true })
      .mockRejectedValueOnce(new TuitionError("PROVIDER_REJECTED", "알림톡 청구서를 보내지 못했습니다 — 포인트가 부족합니다", 502));

    const result = await sendTuitionBillTalk(["invoice-1", "invoice-2", "invoice-1"]);

    expect(result).toEqual({
      ok: true,
      data: {
        sent: 1,
        failed: 1,
        results: [
          { invoiceId: "invoice-1", studentName: "학생A", ok: true, resent: true },
          {
            invoiceId: "invoice-2",
            studentName: "학생B",
            ok: false,
            error: "알림톡 청구서를 보내지 못했습니다 — 포인트가 부족합니다",
          },
        ],
      },
    });
    // 같은 청구서는 한 번만 보낸다. 개발에서는 접속한 서버 주소를 콜백 주소로 넘긴다
    expect(sendInvoiceTalk).toHaveBeenCalledTimes(2);
    expect(sendInvoiceTalk).toHaveBeenNthCalledWith(
      1,
      { invoiceId: "invoice-1", baseUrl: "http://localhost:3100" },
      { id: "user-director", name: "원장" },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/tuition");
  });

  it("빈 목록·상한(100건)을 넘는 목록·형식이 틀린 id 는 보내지 않는다", async () => {
    await expect(sendTuitionBillTalk([])).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    const tooMany = Array.from({ length: 101 }, (_, i) => `invoice-${i}`);
    await expect(sendTuitionBillTalk(tooMany)).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    await expect(sendTuitionBillTalk([{ $ne: null } as never])).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(sendInvoiceTalk).not.toHaveBeenCalled();
  });

  it("포인트 잔액 — 결제사가 응답하지 않으면 사유와 함께 실패로 돌려준다", async () => {
    await expect(loadTuitionProviderBalance()).resolves.toEqual({
      ok: true,
      data: { balance: 42, chargeUrl: "https://charge.example.com" },
    });
    vi.mocked(getTuitionProviderBalance).mockResolvedValue(null);
    await expect(loadTuitionProviderBalance()).resolves.toEqual({ ok: true, data: null });
    vi.mocked(getTuitionProviderBalance).mockRejectedValue(new ProviderError("결제선생에 연결하지 못했습니다", "unavailable"));
    await expect(loadTuitionProviderBalance()).resolves.toMatchObject({
      ok: false,
      code: "PROVIDER_UNAVAILABLE",
      error: expect.stringContaining("결제선생에 연결하지 못했습니다"),
    });
  });
});
