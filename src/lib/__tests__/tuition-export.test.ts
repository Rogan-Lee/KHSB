import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { tuitionInvoice: { findMany: vi.fn() } } }));
vi.mock("@/lib/utils", () => ({ todayKST: () => new Date("2026-10-10T00:00:00.000Z") }));

import { prisma } from "@/lib/prisma";
import { getTuitionExport, toCsv } from "@/lib/tuition/export";

const day = (key: string) => new Date(`${key}T00:00:00.000Z`);

function invoiceRecord(overrides: Record<string, unknown> = {}) {
  return {
    title: "10월 수강료",
    periodStart: day("2026-10-01"),
    periodEnd: day("2026-10-31"),
    months: 1,
    monthlyFee: 300_000,
    discount: 0,
    extraItems: null,
    amount: 300_000,
    taxType: "EXEMPT",
    dueDate: day("2026-10-05"),
    status: "REQUESTED",
    memo: null,
    paidAt: null,
    paidAmount: 0,
    paidPaymentId: null,
    refundedAmount: 0,
    autoIssued: false,
    issuedByName: "원장",
    student: { name: "김학생", grade: "고2", seat: "12" },
    payments: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.tuitionInvoice.findMany).mockResolvedValue([]);
});

describe("toCsv", () => {
  it("쉼표·따옴표·줄바꿈이 든 칸은 따옴표로 감싼다", () => {
    expect(toCsv([["가,나", '그는 "네"라고 했다', "첫 줄\n둘째 줄", null, 1200]])).toBe(
      '"가,나","그는 ""네""라고 했다","첫 줄\n둘째 줄",,1200',
    );
  });

  it("엑셀이 수식으로 읽는 글자로 시작하면 글자로만 읽히게 한다 (숫자는 그대로)", () => {
    expect(toCsv([["=HYPERLINK(\"http://x\")", "+82-10", "-1", "@cmd", -5000]])).toBe(
      "\"'=HYPERLINK(\"\"http://x\"\")\",'+82-10,'-1,'@cmd,-5000",
    );
  });

  it("줄은 CRLF 로 나눈다", () => {
    expect(toCsv([["a"], ["b"]])).toBe("a\r\nb");
  });
});

describe("getTuitionExport", () => {
  it("조회한 달 청구서와 이전 달 미납을 납부 기한 순으로 조회한다", async () => {
    const result = await getTuitionExport({ ym: "2026-10" });

    const args = vi.mocked(prisma.tuitionInvoice.findMany).mock.calls[0][0];
    expect(args?.where).toEqual({
      OR: [
        { dueDate: { gte: day("2026-10-01"), lte: day("2026-10-31") } },
        { status: "REQUESTED", dueDate: { lt: day("2026-10-01") } },
      ],
    });
    expect(result.filename).toBe("수강료_수납내역_2026-10.csv");
    expect(result.count).toBe(0);
    // 내용이 없어도 머리글은 있다 (BOM 은 파일로 저장하는 브라우저 쪽에서 붙인다)
    expect(result.csv.startsWith("학생,학년,좌석,청구 내용")).toBe(true);
  });

  it("형식이 틀린 달은 이번 달로 본다", async () => {
    await expect(getTuitionExport({ ym: "2026-13" })).resolves.toMatchObject({
      filename: "수강료_수납내역_2026-10.csv",
    });
  });

  it("납부 건은 승인 정보·순수납액·현금영수증까지, 미납 건은 빈 칸으로 싣는다", async () => {
    vi.mocked(prisma.tuitionInvoice.findMany).mockResolvedValue([
      invoiceRecord({
        title: "10월~12월 수강료 (3개월)",
        months: 3,
        extraItems: [
          { name: "교재비", amount: 30_000 },
          { name: "모의고사", amount: 20_000 },
        ],
        discount: 50_000,
        amount: 990_000,
        taxType: "TAXABLE",
        status: "PARTIALLY_REFUNDED",
        // KST 10월 3일 오전 8시
        paidAt: new Date("2026-10-02T23:00:00.000Z"),
        paidAmount: 990_000,
        paidPaymentId: "pay-main",
        refundedAmount: 110_000,
        memo: "형제 할인, 3개월 선결제",
        payments: [
          // 중복 결제는 조회 조건에서 빠지지만, 확정된 결제를 id 로 고르는지 확인하려고 다른 건을 섞어 둔다
          { id: "pay-other", method: "CASH", providerMethod: null, cardIssuer: null, installmentMonths: null, approvalNumber: null, cashReceipt: null },
          { id: "pay-main", method: "LINK", providerMethod: "카드", cardIssuer: "현대", installmentMonths: 3, approvalNumber: "12345678", cashReceipt: null },
        ],
      }),
      invoiceRecord({
        student: { name: "=이학생", grade: "고1", seat: null },
        status: "PAID",
        paidAt: new Date("2026-10-04T02:00:00.000Z"),
        paidAmount: 300_000,
        paidPaymentId: "pay-cash",
        autoIssued: true,
        issuedByName: "자동 청구",
        payments: [
          { id: "pay-cash", method: "CASH", providerMethod: null, cardIssuer: null, installmentMonths: null, approvalNumber: null, cashReceipt: { status: "ISSUED", approvalNumber: "A1234" } },
        ],
      }),
      invoiceRecord({ student: { name: "박학생", grade: "고3", seat: "3" } }),
    ] as never);

    const { csv, count } = await getTuitionExport({ ym: "2026-10" });
    const [, first, second, third] = csv.split("\r\n");

    expect(count).toBe(3);
    expect(first).toBe(
      [
        "김학생", "고2", "12", "10월~12월 수강료 (3개월)", "2026-10-01", "2026-10-31", 3, 300000,
        "교재비 30000 / 모의고사 20000", 50000, 50000, 990000,
        "과세", 900000, 90000, "2026-10-05", "일부 환불", "2026-10-03",
        "온라인 결제(카드)", "현대", "3개월", "12345678",
        990000, 110000, 880000, "", "", "원장", '"형제 할인, 3개월 선결제"',
      ].join(","),
    );
    // 사람이 적은 이름이 수식으로 읽히지 않게 막는다 · 현금 수납은 현금영수증 상태를 싣는다
    expect(second).toBe(
      [
        "'=이학생", "고1", "", "10월 수강료", "2026-10-01", "2026-10-31", 1, 300000,
        "", 0, 0, 300000,
        "면세", 300000, 0, "2026-10-05", "납부 완료", "2026-10-04",
        "현금", "", "", "",
        300000, 0, 300000, "발급 완료", "A1234", "자동 청구", "",
      ].join(","),
    );
    // 기한이 지난 결제 요청은 미납
    expect(third).toBe(
      [
        "박학생", "고3", "3", "10월 수강료", "2026-10-01", "2026-10-31", 1, 300000,
        "", 0, 0, 300000,
        "면세", 300000, 0, "2026-10-05", "미납", "",
        "", "", "", "",
        0, 0, 0, "", "", "원장", "",
      ].join(","),
    );
  });
});
