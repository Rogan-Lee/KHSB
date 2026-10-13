"use client";

// 현장 결제 탭 — 학부모가 앱에서 넣은 현장 결제 신청(지역화폐·현장 카드)을 직원이 확인하거나 돌려보낸다.
// 신청 없이 방문해 낸 경우는 "방문 결제 기록"으로 납부 전 청구서를 골라 바로 처리한다.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, HandCoins, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, Section, StatusBadge } from "@/components/backoffice/ui";
import { ConfirmDialog } from "@/components/backoffice/confirm-dialog";
import { dismissTuitionOnsiteRequest } from "@/actions/tuition";
import type { AdminInvoiceRow, AdminOnsiteRequest } from "@/lib/tuition/admin-data";
import { PAYMENT_METHOD_LABEL, periodLabel, won } from "@/lib/tuition/format";
import { OnsitePaymentDialog, type OnsiteTarget } from "./onsite-payment-dialog";
import { callTuition, shortDateTime, StudentCell } from "./shared";

export function OnsiteTab({
  requests,
  openInvoices,
  onlinePaymentAvailable,
  onOpenInvoice,
}: {
  requests: AdminOnsiteRequest[];
  /** 납부 전 청구서 전부 (조회한 달과 상관없이) — 방문 결제 기록의 선택지 */
  openInvoices: AdminInvoiceRow[];
  onlinePaymentAvailable: boolean;
  onOpenInvoice: (invoiceId: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<OnsiteTarget | null>(null);
  const [dismissing, setDismissing] = useState<AdminOnsiteRequest | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);

  const candidates = useMemo<OnsiteTarget[]>(
    () =>
      openInvoices
        .map((row) => ({
          invoiceId: row.id,
          paymentId: row.openPayment?.onsite?.paymentId,
          studentName: row.student.name,
          title: row.title,
          amount: row.amount,
          requestedMethod: row.openPayment?.onsite?.method,
        }))
        .sort((a, b) => a.studentName.localeCompare(b.studentName, "ko")),
    [openInvoices],
  );

  function dismiss(request: AdminOnsiteRequest) {
    startTransition(async () => {
      const res = await callTuition(() => dismissTuitionOnsiteRequest(request.paymentId));
      setDismissing(null);
      if (res.ok) toast.success(`${request.student.name} 학생의 현장 결제 신청을 반려했어요`);
      else toast.error(res.error);
      router.refresh();
    });
  }

  return (
    <>
      <Section
        title="현장 결제 신청"
        count={requests.length}
        description="학부모가 앱에서 신청한 건이에요. 단말기로 결제를 받은 뒤 ‘결제 확인’을 눌러 주세요."
        actions={
          <Button variant="outline" size="sm" onClick={() => setWalkInOpen(true)}>
            <HandCoins />
            방문 결제 기록
          </Button>
        }
        flush
      >
        {requests.length === 0 ? (
          <EmptyState
            compact
            icon={Store}
            title="확인을 기다리는 현장 결제 신청이 없어요"
            description="신청 없이 방문해 결제했다면 ‘방문 결제 기록’으로 바로 납부 처리할 수 있어요."
          />
        ) : (
          <div className="border-t border-stroke-neutral-muted">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>학생</TableHead>
                  <TableHead>청구 내용</TableHead>
                  <TableHead className="text-right">금액</TableHead>
                  <TableHead>신청 수단</TableHead>
                  <TableHead>신청 시각</TableHead>
                  <TableHead className="text-right">처리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((request) => {
                  const payable = request.invoiceStatus === "REQUESTED";
                  return (
                    <TableRow key={request.paymentId}>
                      <TableCell>
                        <StudentCell student={request.student} />
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => onOpenInvoice(request.invoiceId)}
                          className="whitespace-nowrap rounded-r1 text-left t4-medium text-fg-neutral underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring"
                        >
                          {request.title}
                        </button>
                        <p className="mt-x0_5 whitespace-nowrap t3-regular text-fg-neutral-subtle">
                          {periodLabel(request.periodStart, request.periodEnd)}
                        </p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right t4-bold">{won(request.amount)}</TableCell>
                      <TableCell>
                        <StatusBadge tone="info">{PAYMENT_METHOD_LABEL[request.method]}</StatusBadge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-fg-neutral-muted">
                        {shortDateTime(request.requestedAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-x1">
                          <Button
                            size="xs"
                            disabled={pending || !payable}
                            title={payable ? undefined : "이미 납부됐거나 취소된 청구서예요"}
                            onClick={() =>
                              setConfirming({
                                invoiceId: request.invoiceId,
                                paymentId: request.paymentId,
                                studentName: request.student.name,
                                title: request.title,
                                amount: request.amount,
                                requestedMethod: request.method,
                              })
                            }
                          >
                            <Check />
                            결제 확인
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            disabled={pending}
                            onClick={() => setDismissing(request)}
                            className="text-fg-critical"
                          >
                            반려
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      {confirming && (
        <OnsitePaymentDialog target={confirming} onClose={() => setConfirming(null)} onDone={() => router.refresh()} />
      )}
      {walkInOpen && (
        <OnsitePaymentDialog
          candidates={candidates}
          onClose={() => setWalkInOpen(false)}
          onDone={() => router.refresh()}
        />
      )}

      <ConfirmDialog
        open={dismissing !== null}
        onOpenChange={(open) => !open && setDismissing(null)}
        title="현장 결제 신청을 반려할까요?"
        description={
          dismissing
            ? `${dismissing.student.name} 학생 · ${dismissing.title} (${won(dismissing.amount)})\n청구서는 그대로 남고, 학부모가 ${
                onlinePaymentAvailable ? "다시 신청하거나 온라인으로 결제할 수 있어요." : "다시 신청할 수 있어요."
              }`
            : undefined
        }
        confirmLabel="반려"
        pendingLabel="반려 중…"
        destructive
        pending={pending}
        onConfirm={() => dismissing && dismiss(dismissing)}
      />
    </>
  );
}
