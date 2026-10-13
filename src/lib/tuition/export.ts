// 수납 내역 내보내기 (CSV) — 세무·대사용. 호출 측이 원장급 권한을 먼저 검증한다.
// 범위는 어드민 목록과 같다: 조회한 달 청구서 + 이전 달에서 넘어온 미납.

import { prisma } from "@/lib/prisma";
import {
  addDays,
  addMonthsClamped,
  dateKey,
  invoiceDisplayStatus,
  kstDateOf,
  parseDateKey,
  readExtraItems,
  splitTax,
} from "@/lib/tuition/calc";
import {
  CASH_RECEIPT_STATUS_LABEL,
  installmentLabel,
  INVOICE_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  TAX_TYPE_LABEL,
} from "@/lib/tuition/format";
import { todayKST } from "@/lib/utils";

export type CsvCell = string | number | null;

/**
 * CSV 한 칸. 엑셀이 수식으로 읽는 문자(= + - @)로 시작하는 글자는 앞에 ' 를 붙여 글자로만 읽히게 한다
 * (학생 이름·메모는 사람이 적은 값이다). 숫자는 그대로 둔다.
 */
function csvCell(value: CsvCell): string {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows: CsvCell[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

const HEADER = [
  "학생",
  "학년",
  "좌석",
  "청구 내용",
  "이용 시작일",
  "이용 종료일",
  "개월 수",
  "월 수강료",
  "추가 항목",
  "추가 항목 금액",
  "할인",
  "청구 금액",
  "과세 구분",
  "공급가액",
  "세액",
  "납부 기한",
  "상태",
  "납부일",
  "결제 수단",
  "카드사",
  "할부",
  "승인번호",
  "납부 금액",
  "환불 금액",
  "순수납액",
  "현금영수증",
  "현금영수증 승인번호",
  "발행",
  "메모",
];

/**
 * 수납 내역 CSV. ym 형식이 틀리면 이번 달.
 * BOM 은 넣지 않는다 — 파일로 저장하는 쪽(브라우저)이 붙인다 (서버 액션 응답을 거치면 맨 앞 BOM 이 사라진다).
 */
export async function getTuitionExport(input: {
  ym: string;
  today?: Date;
}): Promise<{ filename: string; csv: string; count: number }> {
  const today = input.today ?? todayKST();
  const monthStart =
    parseDateKey(`${input.ym}-01`) ?? (parseDateKey(`${dateKey(today).slice(0, 7)}-01`) as Date);
  const monthEnd = addDays(addMonthsClamped(monthStart, 1), -1);

  const invoices = await prisma.tuitionInvoice.findMany({
    where: {
      OR: [
        { dueDate: { gte: monthStart, lte: monthEnd } },
        { status: "REQUESTED", dueDate: { lt: monthStart } },
      ],
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    select: {
      title: true,
      periodStart: true,
      periodEnd: true,
      months: true,
      monthlyFee: true,
      discount: true,
      extraItems: true,
      amount: true,
      taxType: true,
      dueDate: true,
      status: true,
      memo: true,
      paidAt: true,
      paidAmount: true,
      paidPaymentId: true,
      refundedAmount: true,
      autoIssued: true,
      issuedByName: true,
      student: { select: { name: true, grade: true, seat: true } },
      payments: {
        where: { status: "DONE", isDuplicate: false },
        select: {
          id: true,
          method: true,
          providerMethod: true,
          cardIssuer: true,
          installmentMonths: true,
          approvalNumber: true,
          cashReceipt: { select: { status: true, approvalNumber: true } },
        },
      },
    },
  });

  const rows: CsvCell[][] = invoices.map((invoice) => {
    const paid = invoice.paidPaymentId ? invoice.payments.find((p) => p.id === invoice.paidPaymentId) : undefined;
    const extraItems = readExtraItems(invoice.extraItems);
    const { supplyAmount, taxAmount } = splitTax(invoice.amount, invoice.taxType);
    return [
      invoice.student.name,
      invoice.student.grade,
      invoice.student.seat,
      invoice.title,
      dateKey(invoice.periodStart),
      dateKey(invoice.periodEnd),
      invoice.months,
      invoice.monthlyFee,
      extraItems.map((item) => `${item.name} ${item.amount}`).join(" / ") || null,
      extraItems.reduce((sum, item) => sum + item.amount, 0),
      invoice.discount,
      invoice.amount,
      TAX_TYPE_LABEL[invoice.taxType],
      supplyAmount,
      taxAmount,
      dateKey(invoice.dueDate),
      INVOICE_STATUS_LABEL[invoiceDisplayStatus(invoice, today)],
      invoice.paidAt ? dateKey(kstDateOf(invoice.paidAt)) : null,
      paid
        ? paid.method === "LINK" && paid.providerMethod
          ? `${PAYMENT_METHOD_LABEL.LINK}(${paid.providerMethod})`
          : PAYMENT_METHOD_LABEL[paid.method]
        : null,
      paid?.cardIssuer ?? null,
      paid ? installmentLabel(paid.installmentMonths) : null,
      paid?.approvalNumber ?? null,
      invoice.paidAmount,
      invoice.refundedAmount,
      invoice.paidAmount - invoice.refundedAmount,
      paid?.cashReceipt ? CASH_RECEIPT_STATUS_LABEL[paid.cashReceipt.status] : null,
      paid?.cashReceipt?.approvalNumber ?? null,
      invoice.autoIssued ? "자동 청구" : (invoice.issuedByName ?? null),
      invoice.memo,
    ];
  });

  return {
    filename: `수강료_수납내역_${dateKey(monthStart).slice(0, 7)}.csv`,
    csv: toCsv([HEADER, ...rows]),
    count: rows.length,
  };
}
