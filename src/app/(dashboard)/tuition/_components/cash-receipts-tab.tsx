"use client";

// 현금영수증 탭 — 현금·계좌이체로 받은 수납과 그 현금영수증 처리 상태.
// 발급은 홈택스 등 밖에서 하고, 여기에는 신청 정보와 국세청 승인번호를 기록한다.
// 조회한 달의 수납 + 달과 상관없이 처리가 남은 건(이전 달)이 내려온다.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, FilterChip, TableCard, Toolbar } from "@/components/backoffice/ui";
import type { AdminCashReceiptRow } from "@/lib/tuition/admin-data";
import { CASH_RECEIPT_PURPOSE_LABEL, PAYMENT_METHOD_LABEL, won } from "@/lib/tuition/format";
import { cn } from "@/lib/utils";
import { CashReceiptActions, CashReceiptStaleNotice } from "./cash-receipt-dialog";
import { CashReceiptStatusBadge, DENSE_CELL, shortDate, StudentCell } from "./shared";

type Filter = "TODO" | "ALL";

export function CashReceiptsTab({
  rows,
  fullAccess,
  providerIssue,
  onOpenInvoice,
}: {
  rows: AdminCashReceiptRow[];
  fullAccess: boolean;
  /** 결제선생으로 바로 발급할 수 있는지 */
  providerIssue: boolean;
  onOpenInvoice: (invoiceId: string) => void;
}) {
  const router = useRouter();
  const todoCount = rows.filter((row) => row.todo).length;
  // 처리할 것이 있으면 그것부터 보여 준다. 사용자가 직접 고른 뒤에는 그 선택을 따른다
  const [picked, setPicked] = useState<Filter | null>(null);
  const filter: Filter = picked ?? (todoCount > 0 ? "TODO" : "ALL");
  const shown = filter === "TODO" ? rows.filter((row) => row.todo) : rows;
  const stale = shown.filter((row) => row.receipt?.stale);

  return (
    <div>
      <p className="mb-x3 t3-regular text-fg-neutral-subtle">
        {providerIssue
          ? "현금영수증은 결제선생으로 바로 발급하고, 국세청 승인번호가 자동으로 남아요."
          : "현금영수증 발급은 홈택스 등에서 하고, 여기에는 신청 정보와 국세청 승인번호를 기록해요."}
        {!fullAccess && " 발급과 취소는 원장·관리자가 해요."}
      </p>

      <Toolbar>
        <FilterChip selected={filter === "TODO"} count={todoCount} onClick={() => setPicked("TODO")}>
          처리 필요
        </FilterChip>
        <FilterChip selected={filter === "ALL"} count={rows.length} onClick={() => setPicked("ALL")}>
          전체
        </FilterChip>
      </Toolbar>

      <TableCard>
        {shown.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={filter === "TODO" ? "처리할 현금영수증이 없어요" : "이 달에 현금·계좌이체로 받은 수납이 없어요"}
            description={
              filter === "TODO"
                ? "현금·계좌이체 수납은 현금영수증을 등록하면 이곳에서 발급 상태를 이어서 볼 수 있어요."
                : "현금이나 계좌이체로 납부를 확인하면 여기에 나타나요."
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={DENSE_CELL}>학생</TableHead>
                <TableHead className={DENSE_CELL}>청구 내용</TableHead>
                <TableHead className={DENSE_CELL}>수납</TableHead>
                <TableHead className={cn(DENSE_CELL, "text-right")}>금액</TableHead>
                <TableHead className={DENSE_CELL}>상태</TableHead>
                <TableHead className={DENSE_CELL}>구분 · 번호</TableHead>
                <TableHead className={DENSE_CELL}>승인번호</TableHead>
                <TableHead className={cn(DENSE_CELL, "text-right")}>동작</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((row) => {
                const receipt = row.receipt;
                const summary = `${row.student.name} · ${row.title} · ${won(row.amount)}`;
                return (
                  <TableRow key={row.paymentId}>
                    <TableCell className={DENSE_CELL}>
                      <StudentCell student={row.student} />
                    </TableCell>
                    <TableCell className={DENSE_CELL}>
                      <button
                        type="button"
                        onClick={() => onOpenInvoice(row.invoiceId)}
                        className="whitespace-nowrap rounded-r1 text-left t4-medium text-fg-neutral underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring"
                      >
                        {row.title}
                      </button>
                    </TableCell>
                    <TableCell className={DENSE_CELL}>
                      <p className="whitespace-nowrap">{PAYMENT_METHOD_LABEL[row.method]}</p>
                      <p className="mt-x0_5 whitespace-nowrap t3-regular tabular-nums text-fg-neutral-subtle">
                        {shortDate(row.paidAt)}
                        {!row.inMonth && " · 이전 달"}
                      </p>
                    </TableCell>
                    <TableCell className={cn(DENSE_CELL, "text-right")}>
                      <p className="whitespace-nowrap t4-bold tabular-nums">{won(row.amount)}</p>
                      {row.taxAmount > 0 && (
                        <p className="mt-x0_5 whitespace-nowrap t3-regular tabular-nums text-fg-neutral-subtle">
                          공급가액 {won(row.supplyAmount)} · 세액 {won(row.taxAmount)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className={DENSE_CELL}>
                      <CashReceiptStatusBadge receipt={receipt} />
                      {receipt?.stale && (
                        <p className="mt-x0_5 whitespace-nowrap t3-regular tabular-nums text-fg-neutral-subtle">
                          발급 {won(receipt.amount)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className={DENSE_CELL}>
                      {receipt && receipt.status !== "CANCELED" ? (
                        <>
                          <p className="whitespace-nowrap">{CASH_RECEIPT_PURPOSE_LABEL[receipt.purpose]}</p>
                          <p className="mt-x0_5 whitespace-nowrap t3-regular tabular-nums text-fg-neutral-subtle">
                            {receipt.identifier}
                          </p>
                        </>
                      ) : (
                        <span className="text-fg-neutral-subtle">—</span>
                      )}
                    </TableCell>
                    <TableCell className={cn(DENSE_CELL, "whitespace-nowrap tabular-nums")}>
                      {receipt?.status === "ISSUED" && receipt.approvalNumber ? (
                        <>
                          <p>{receipt.approvalNumber}</p>
                          {receipt.issuedByName && (
                            <p className="mt-x0_5 t3-regular text-fg-neutral-subtle">{receipt.issuedByName}</p>
                          )}
                        </>
                      ) : (
                        <span className="text-fg-neutral-subtle">—</span>
                      )}
                    </TableCell>
                    <TableCell className={DENSE_CELL}>
                      <CashReceiptActions
                        paymentId={row.paymentId}
                        receipt={receipt}
                        allowed={row.amount > 0}
                        fullAccess={fullAccess}
                        providerIssue={providerIssue}
                        summary={summary}
                        onDone={() => router.refresh()}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </TableCard>

      {stale.length > 0 && (
        <div className="mt-x3">
          <CashReceiptStaleNotice fullAccess={fullAccess} viaProvider={stale.every((row) => row.receipt?.viaProvider)} />
        </div>
      )}
    </div>
  );
}
