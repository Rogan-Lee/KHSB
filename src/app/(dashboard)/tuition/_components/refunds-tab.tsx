"use client";

// 환불 탭 — 조회한 달에 요청된 환불 + 달과 상관없이 아직 끝나지 않은(처리 중·실패) 환불.
// 환불 요청·재시도는 청구서 상세에서 한다. 여기는 진행 상황을 한눈에 보는 목록이다.

import { RotateCcw } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, Notice, StatusBadge, TableCard, type Tone } from "@/components/backoffice/ui";
import type { AdminRefundRow } from "@/lib/tuition/admin-data";
import { REFUND_SOURCE_LABEL, REFUND_STATUS_LABEL, won } from "@/lib/tuition/format";
import { cn } from "@/lib/utils";
import { DENSE_CELL, shortDateTime, shortPeriod, StudentCell } from "./shared";

const STATUS_TONE: Record<AdminRefundRow["status"], Tone> = { PENDING: "info", DONE: "ok", FAILED: "bad" };
const METHOD_LABEL: Record<AdminRefundRow["method"], string> = { PROVIDER: "결제사 취소", MANUAL: "직접 환불" };

export function RefundsTab({
  refunds,
  onOpenInvoice,
}: {
  refunds: AdminRefundRow[];
  onOpenInvoice: (invoiceId: string) => void;
}) {
  const failed = refunds.filter((refund) => refund.status === "FAILED" && refund.unresolved).length;

  return (
    <div>
      {failed > 0 && (
        <Notice tone="bad" className="mb-x3">
          환불되지 않은 건이 {failed}건 있어요. 행을 눌러 청구서 상세에서 사유를 확인하고 다시 환불해 주세요.
        </Notice>
      )}
      <TableCard>
        {refunds.length === 0 ? (
          <EmptyState
            icon={RotateCcw}
            title="이 달에 환불한 내역이 없어요"
            description="환불은 청구·수납 탭에서 납부 완료된 청구서를 열어 요청할 수 있어요."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={DENSE_CELL}>학생</TableHead>
                <TableHead className={DENSE_CELL}>청구 내용</TableHead>
                <TableHead className={cn(DENSE_CELL, "text-right")}>금액</TableHead>
                <TableHead className={DENSE_CELL}>방식</TableHead>
                <TableHead className={DENSE_CELL}>구분</TableHead>
                <TableHead className={DENSE_CELL}>상태</TableHead>
                <TableHead className={DENSE_CELL}>사유</TableHead>
                <TableHead className={DENSE_CELL}>일시</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {refunds.map((refund) => (
                <TableRow key={refund.id} onClick={() => onOpenInvoice(refund.invoiceId)} className="cursor-pointer">
                  <TableCell className={DENSE_CELL}>
                    <StudentCell student={refund.student} />
                  </TableCell>
                  <TableCell className={DENSE_CELL}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenInvoice(refund.invoiceId);
                      }}
                      className="whitespace-nowrap rounded-r1 text-left t4-medium text-fg-neutral underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring"
                    >
                      {refund.title}
                    </button>
                    <p className="mt-x0_5 whitespace-nowrap t3-regular text-fg-neutral-subtle">
                      {shortPeriod(refund.periodStart, refund.periodEnd)}
                    </p>
                  </TableCell>
                  <TableCell className={cn(DENSE_CELL, "whitespace-nowrap text-right t4-bold")}>
                    {won(refund.amount)}
                  </TableCell>
                  <TableCell className={DENSE_CELL}>
                    <p className="whitespace-nowrap">{METHOD_LABEL[refund.method]}</p>
                    <p className="mt-x0_5 whitespace-nowrap t3-regular text-fg-neutral-subtle">
                      {refund.paymentMethodLabel}
                    </p>
                  </TableCell>
                  <TableCell className={cn(DENSE_CELL, "whitespace-nowrap text-fg-neutral-muted")}>
                    {REFUND_SOURCE_LABEL[refund.source]}
                  </TableCell>
                  <TableCell className={DENSE_CELL}>
                    <StatusBadge tone={STATUS_TONE[refund.status]}>{REFUND_STATUS_LABEL[refund.status]}</StatusBadge>
                    {!refund.inMonth && (
                      <p className="mt-x0_5 whitespace-nowrap t3-regular text-fg-neutral-subtle">다른 달 요청</p>
                    )}
                  </TableCell>
                  <TableCell className={cn(DENSE_CELL, "min-w-40 max-w-64")}>
                    <p className="t4-regular text-fg-neutral">{refund.reason}</p>
                    {refund.status === "FAILED" && (
                      <p className="mt-x0_5 t3-medium text-fg-critical">
                        {refund.failMessage ?? "환불되지 않았어요"}
                      </p>
                    )}
                    {refund.requestedByName && (
                      <p className="mt-x0_5 t3-regular text-fg-neutral-subtle">{refund.requestedByName}</p>
                    )}
                  </TableCell>
                  <TableCell className={cn(DENSE_CELL, "whitespace-nowrap text-fg-neutral-muted")}>
                    {shortDateTime(refund.completedAt ?? refund.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>
    </div>
  );
}
