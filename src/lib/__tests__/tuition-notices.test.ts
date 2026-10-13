import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/mobile-push", () => ({
  notifyParentsOfStudent: vi.fn(),
  PARENT_PUSH_ROUTES: { tuition: "/(parent)/tuition" },
}));

import {
  installmentLabel,
  invoiceTitle,
  maskCashReceiptIdentifier,
  maskName,
  periodLabel,
} from "@/lib/tuition/format";
import { buildNoticeMessage, buildNoticeShareText } from "@/lib/tuition/notices";

const base = {
  studentName: "김학생",
  title: "11월 수강료",
  amount: 690_000,
  dueDate: "2026-11-05",
  overdue: false,
  coverageEnd: null,
};

describe("buildNoticeMessage", () => {
  it("청구 안내 — 금액과 납부 기한", () => {
    expect(buildNoticeMessage({ ...base, kind: "REQUEST" })).toEqual({
      title: "수강료 안내",
      body: "김학생 학생 11월 수강료 690,000원 — 11월 5일까지 납부해 주세요.",
    });
  });

  it("미납 안내 — 기한 전후로 문구가 다르다", () => {
    expect(buildNoticeMessage({ ...base, kind: "REMIND" }).title).toBe("수강료 납부 안내");
    const overdue = buildNoticeMessage({ ...base, kind: "REMIND", overdue: true });
    expect(overdue.title).toBe("수강료 미납 안내");
    expect(overdue.body).toContain("납부 기한(11월 5일)이 지났어요");
  });

  it("납부 완료 — 다음 결제 시점을 함께 알린다", () => {
    const paid = buildNoticeMessage({ ...base, kind: "PAID", coverageEnd: "2026-11-30" });
    expect(paid.body).toBe("김학생 학생 11월 수강료 690,000원 납부가 확인됐어요. 다음 결제는 12월 1일 이용분부터예요.");
    expect(buildNoticeMessage({ ...base, kind: "PAID" }).body).not.toContain("다음 결제");
  });

  it("재결제 안내 — 이용 종료일과 다음 시작일", () => {
    const renewal = buildNoticeMessage({ ...base, kind: "RENEWAL", coverageEnd: "2026-12-31" });
    expect(renewal.body).toContain("이용 기간이 12월 31일에 끝나요");
    expect(renewal.body).toContain("1월 1일 이용분부터");
  });

  it("환불 안내 — 환불 금액", () => {
    expect(buildNoticeMessage({ ...base, kind: "REFUND", refundAmount: 460_000 }).body).toContain("460,000원 환불");
  });
});

describe("buildNoticeShareText — 카카오톡으로 직접 보내는 안내문", () => {
  it("푸시와 같은 문구 뒤에 청구서 링크를 붙인다", () => {
    expect(buildNoticeShareText({ ...base, kind: "REQUEST" }, "https://app.test/bill/tok")).toBe(
      "[수강료 안내]\n김학생 학생 11월 수강료 690,000원 — 11월 5일까지 납부해 주세요.\n\n청구서 확인·결제: https://app.test/bill/tok",
    );
  });

  it("링크가 없으면 문구만", () => {
    expect(buildNoticeShareText({ ...base, kind: "REMIND", overdue: true }, null)).toBe(
      "[수강료 미납 안내]\n김학생 학생 11월 수강료 690,000원의 납부 기한(11월 5일)이 지났어요. 확인 부탁드려요.",
    );
  });
});

describe("표시 서식", () => {
  it("청구서 제목 — 선결제는 기간과 개월 수", () => {
    expect(invoiceTitle("2026-11-01", "2026-11-30", 1)).toBe("11월 수강료");
    expect(invoiceTitle("2026-11-01", "2027-01-31", 3)).toBe("11월~1월 수강료 (3개월)");
    expect(periodLabel("2026-11-01", "2026-11-30")).toBe("2026.11.01 ~ 2026.11.30");
  });

  it("결제 링크에 보이는 이름은 가운데를 가린다", () => {
    expect(maskName("홍길동")).toBe("홍*동");
    expect(maskName("남궁길동")).toBe("남**동");
    expect(maskName("이산")).toBe("이*");
    expect(maskName("김")).toBe("김");
  });

  it("현금영수증 발급 번호는 가운데를 가린다", () => {
    expect(maskCashReceiptIdentifier("01012345678")).toBe("010****5678");
    expect(maskCashReceiptIdentifier("0101234567")).toBe("010**34567");
    expect(maskCashReceiptIdentifier("1234567890")).toBe("123**67890");
    expect(maskCashReceiptIdentifier("123")).toBe("***");
  });

  it("할부 — 0·1개월은 일시불", () => {
    expect(installmentLabel(null)).toBeNull();
    expect(installmentLabel(0)).toBe("일시불");
    expect(installmentLabel(1)).toBe("일시불");
    expect(installmentLabel(3)).toBe("3개월");
  });
});
