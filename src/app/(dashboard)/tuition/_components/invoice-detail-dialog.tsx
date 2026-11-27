"use client";

// 청구서 상세 — 요약, 결제 시도, 환불, 안내 발송, 진행 기록과 그 청구서에 할 수 있는 처리.
// 열 때마다 서버에서 다시 읽는다 (목록은 요약만 들고 있다). 처리 뒤에는 상세와 목록을 함께 새로 고친다.
// 버튼은 권한에 맞춰 숨기지만, 실제 권한 검사는 서버 액션이 한다.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Check, ExternalLink, Link2, RefreshCw, MessageSquareText, RotateCcw, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { KakaoButton } from "@/components/ui/kakao-button";
import { DescriptionList, FormField, Notice, Skeleton, StatusBadge, type Tone } from "@/components/backoffice/ui";
import { ConfirmDialog } from "@/components/backoffice/confirm-dialog";
import {
  cancelTuitionInvoice,
  deleteTuitionInvoice,
  getTuitionBillLink,
  loadTuitionInvoiceDetail,
  refreshTuitionInvoice,
  sendTuitionBillTalk,
  sendTuitionReminders,
} from "@/actions/tuition";
import type { AdminInvoiceDetail, AdminPaymentDetail, AdminRefundDetail } from "@/lib/tuition/admin-data";
import type { TuitionRefundPolicyValue } from "@/lib/tuition/calc";
import type { TuitionProviderInfo } from "@/lib/tuition/provider-info";
import {
  CASH_RECEIPT_PURPOSE_LABEL,
  dotDate,
  installmentLabel,
  INVOICE_STATUS_LABEL,
  NOTICE_KIND_LABEL,
  PAYMENT_CLOSED_REASON_LABEL,
  PAYMENT_STATUS_LABEL,
  periodLabel,
  REFUND_SOURCE_LABEL,
  REFUND_STATUS_LABEL,
  TAX_TYPE_LABEL,
  won,
} from "@/lib/tuition/format";
import { CashReceiptActions, cashReceiptAmountText, CashReceiptStaleNotice } from "./cash-receipt-dialog";
import { OnsitePaymentDialog } from "./onsite-payment-dialog";
import { RefundDialog } from "./refund-dialog";
import {
  callTuition,
  CashReceiptStatusBadge,
  copyText,
  dueLabel,
  fullDateTime,
  InvoiceStatusBadge,
  noticeKindFor,
  shortDateTime,
} from "./shared";

const PAYMENT_STATUS_TONE: Record<AdminPaymentDetail["status"], Tone> = {
  PENDING: "info",
  ONSITE_REQUESTED: "warn",
  DONE: "ok",
  CANCELED: "gray",
  FAILED: "bad",
};

const REFUND_STATUS_TONE: Record<AdminRefundDetail["status"], Tone> = {
  PENDING: "info",
  DONE: "ok",
  FAILED: "bad",
};

const REFUND_METHOD_LABEL: Record<AdminRefundDetail["method"], string> = {
  PROVIDER: "결제사 취소",
  MANUAL: "직접 환불",
};

/** 진행 기록을 남긴 주체 */
function eventActor(source: string, actorName: string | null): string {
  switch (source) {
    case "STAFF":
      return actorName ?? "운영진";
    case "PARENT":
      return "학부모";
    case "WEBHOOK":
      return "결제사 알림";
    case "SYNC":
      return actorName ?? "상태 확인";
    case "CRON":
      return "자동 처리";
    default:
      return "시스템";
  }
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; detail: AdminInvoiceDetail };

export function InvoiceDetailDialog({
  invoiceId,
  fullAccess,
  refundPolicy,
  provider,
  onClose,
}: {
  invoiceId: string;
  fullAccess: boolean;
  refundPolicy: TuitionRefundPolicyValue;
  /** 연결된 결제사 — 알림톡 청구서 버튼을 보일지 정한다 */
  provider: TuitionProviderInfo | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, startTransition] = useTransition();
  const [onsiteOpen, setOnsiteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [resendOpen, setResendOpen] = useState(false);
  const [talkOpen, setTalkOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // 환불 다이얼로그는 열 때의 값을 그대로 들고 있는다 — 처리 뒤 상세를 다시 읽어도 결과 화면이 사라지지 않게
  const [refunding, setRefunding] = useState<{ detail: AdminInvoiceDetail; payment: AdminPaymentDetail } | null>(null);

  useEffect(() => {
    let alive = true;
    callTuition(() => loadTuitionInvoiceDetail(invoiceId)).then((res) => {
      if (!alive) return;
      setState(res.ok ? { status: "ready", detail: res.data } : { status: "error", message: res.error });
    });
    return () => {
      alive = false;
    };
  }, [invoiceId, reloadKey]);

  /** 상세를 다시 읽고 목록(요약 카드·탭)도 새로 고친다. 다시 읽는 동안에는 이전 내용을 그대로 보여 준다 */
  function reload() {
    setReloadKey((key) => key + 1);
    router.refresh();
  }

  const detail = state.status === "ready" ? state.detail : null;
  const invoice = detail?.invoice;
  const isOpen = invoice?.status === "REQUESTED";
  const onsiteRequest = detail?.payments.find((p) => p.status === "ONSITE_REQUESTED");
  const acceptedPayment = detail?.payments.find((p) => p.isAccepted);
  // 돈이 오간 적 없는 취소 건만 지울 수 있다 (서버가 다시 확인한다)
  const deletable = invoice?.status === "CANCELED" && detail?.payments.length === 0 && detail.refunds.length === 0;
  const canRefundAccepted =
    !!acceptedPayment &&
    (invoice?.status === "PAID" || invoice?.status === "PARTIALLY_REFUNDED") &&
    acceptedPayment.paidAmount > acceptedPayment.refundedAmount;

  function refresh() {
    startTransition(async () => {
      const res = await callTuition(() => refreshTuitionInvoice(invoiceId));
      if (res.ok) {
        toast.success(
          res.data.changed
            ? `결제사와 맞춰 상태를 바꿨어요 — ${INVOICE_STATUS_LABEL[res.data.status]}`
            : `바뀐 내용이 없어요 — ${INVOICE_STATUS_LABEL[res.data.status]}`,
        );
      } else {
        toast.error(res.error);
      }
      reload();
    });
  }

  /** 학부모에게 줄 청구서 웹 링크 복사. 예전 청구서처럼 링크가 아직 없으면 서버에서 만들어 받는다 */
  function copyBillLink() {
    if (!invoice) return;
    startTransition(async () => {
      let url = invoice.billUrl;
      if (!url) {
        const res = await callTuition(() => getTuitionBillLink(invoice.id));
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        url = res.data.url;
        reload();
      }
      await copyText(url, "청구서 링크를 복사했어요");
    });
  }

  function remove() {
    if (!invoice) return;
    startTransition(async () => {
      const res = await callTuition(() => deleteTuitionInvoice(invoice.id));
      setDeleteOpen(false);
      if (res.ok) {
        toast.success("청구서를 삭제했어요");
        router.refresh();
        onClose();
        return;
      }
      toast.error(res.error);
      reload();
    });
  }

  function resend() {
    if (!invoice) return;
    startTransition(async () => {
      const res = await callTuition(() => sendTuitionReminders([invoice.id], noticeKindFor(invoice.displayStatus)));
      setResendOpen(false);
      if (!res.ok) {
        toast.error(res.error);
      } else if (res.data.length === 0) {
        toast.error("이미 납부됐거나 취소된 청구서라 안내를 보내지 않았어요");
      } else if (res.data[0].sent > 0) {
        toast.success(`학부모 앱으로 안내를 보냈어요 (도달 ${res.data[0].sent}대)`);
      } else {
        toast.warning("학부모가 앱을 설치하지 않았거나 알림을 꺼 두었어요. 안내문을 복사해 직접 전달해 주세요");
      }
      reload();
    });
  }

  /** 결제사가 학부모에게 카카오 알림톡 청구서를 보낸다 (쌤포인트 차감). 앱 알림·안내문 복사와는 별개의 채널 */
  function sendTalk() {
    if (!invoice) return;
    startTransition(async () => {
      const res = await callTuition(() => sendTuitionBillTalk([invoice.id]));
      if (!res.ok) {
        toast.error(res.error);
      } else {
        const row = res.data.results[0];
        if (!row) toast.error("알림톡 청구서를 보내지 못했어요");
        else if (row.ok) toast.success(row.resent ? "알림톡 청구서를 다시 보냈어요" : "알림톡 청구서를 보냈어요");
        else toast.error(row.error ?? "알림톡 청구서를 보내지 못했어요");
      }
      setTalkOpen(false);
      reload();
    });
  }

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="flex max-w-2xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{detail ? `${detail.student.name} · ${detail.invoice.title}` : "청구서 상세"}</DialogTitle>
            <DialogDescription asChild>
              <div className="flex flex-wrap items-center gap-x1_5">
                {invoice ? (
                  <>
                    <InvoiceStatusBadge status={invoice.displayStatus} />
                    {invoice.attention.map((a) => (
                      <StatusBadge key={a.code} tone="bad">
                        {a.label}
                      </StatusBadge>
                    ))}
                    <span className="t4-regular text-fg-neutral-muted">
                      {periodLabel(invoice.periodStart, invoice.periodEnd)}
                    </span>
                  </>
                ) : (
                  <span className="t4-regular text-fg-neutral-muted">결제·환불 내역과 진행 기록</span>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="-mx-x6 min-h-0 flex-1 overflow-y-auto px-x6">
            {state.status === "loading" && (
              <div className="flex flex-col gap-x3" aria-busy="true" aria-label="불러오는 중">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            )}
            {state.status === "error" && <Notice tone="bad">{state.message}</Notice>}
            {detail && (
              <DetailBody
                detail={detail}
                fullAccess={fullAccess}
                providerIssue={provider?.cashReceipts ?? false}
                busy={busy}
                onRefund={setRefunding}
                onChanged={reload}
              />
            )}
          </div>

          <DialogFooter className="flex-row flex-wrap items-center justify-start gap-x2 sm:justify-start">
            {detail && invoice && (
              <>
                <Button variant="outline" size="sm" onClick={refresh} disabled={busy}>
                  <RefreshCw />
                  {busy ? "확인 중…" : "상태 새로고침"}
                </Button>
                {isOpen && (
                  <Button size="sm" onClick={() => setOnsiteOpen(true)} disabled={busy}>
                    <Check />
                    현장 결제 확인
                  </Button>
                )}
                {fullAccess && canRefundAccepted && acceptedPayment && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy || acceptedPayment.pendingRefundAmount > 0}
                    title={
                      acceptedPayment.pendingRefundAmount > 0
                        ? "처리 중인 환불이 끝난 뒤 다시 환불할 수 있어요"
                        : undefined
                    }
                    onClick={() => setRefunding({ detail, payment: acceptedPayment })}
                  >
                    <RotateCcw />
                    환불
                  </Button>
                )}
                {fullAccess && isOpen && provider?.canNotify && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTalkOpen(true)}
                    disabled={busy}
                    title={`${provider.label}에서 학부모 휴대폰으로 보내요. 쌤포인트가 차감돼요`}
                  >
                    <MessageSquareText />
                    알림톡 청구서 보내기
                  </Button>
                )}
                {fullAccess && isOpen && (
                  <Button variant="outline" size="sm" onClick={() => setResendOpen(true)} disabled={busy}>
                    <Send />
                    안내 다시 보내기
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={copyBillLink} disabled={busy}>
                  <Link2 />
                  청구서 링크 복사
                </Button>
                {invoice.noticeText && (
                  <KakaoButton
                    size="sm"
                    onClick={() => copyText(invoice.noticeText as string, "안내문을 복사했어요. 카카오톡에 붙여 넣어 보내 주세요")}
                  >
                    안내문 복사
                  </KakaoButton>
                )}
                {fullAccess && isOpen && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCancelOpen(true)}
                    disabled={busy}
                    className="text-fg-critical sm:ml-auto"
                  >
                    <Ban />
                    청구 취소
                  </Button>
                )}
                {fullAccess && deletable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteOpen(true)}
                    disabled={busy}
                    className="text-fg-critical sm:ml-auto"
                  >
                    <Trash2 />
                    청구서 삭제
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {detail && invoice && onsiteOpen && (
        <OnsitePaymentDialog
          target={{
            invoiceId: invoice.id,
            paymentId: onsiteRequest?.id,
            studentName: detail.student.name,
            title: invoice.title,
            amount: invoice.amount,
            requestedMethod: onsiteRequest?.method,
          }}
          onClose={() => setOnsiteOpen(false)}
          onDone={reload}
        />
      )}

      {refunding && (
        <RefundDialog
          detail={refunding.detail}
          payment={refunding.payment}
          refundPolicy={refundPolicy}
          onClose={() => setRefunding(null)}
          onDone={reload}
        />
      )}

      {detail && invoice && cancelOpen && (
        <CancelInvoiceDialog
          invoiceId={invoice.id}
          summary={`${detail.student.name} 학생 · ${invoice.title} · ${won(invoice.amount)}`}
          onClose={() => setCancelOpen(false)}
          onDone={reload}
        />
      )}

      <ConfirmDialog
        open={resendOpen}
        onOpenChange={setResendOpen}
        title="납부 안내를 다시 보낼까요?"
        description={
          invoice?.displayStatus === "OVERDUE"
            ? "학부모 앱으로 미납 안내 알림을 보내요."
            : "학부모 앱으로 청구 안내 알림을 다시 보내요."
        }
        confirmLabel="안내 보내기"
        pendingLabel="보내는 중…"
        pending={busy}
        onConfirm={resend}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="청구서를 삭제할까요?"
        description={
          detail && invoice
            ? `${detail.student.name} 학생 · ${invoice.title} · ${won(invoice.amount)}\n목록과 통계에서 완전히 사라지고 되돌릴 수 없어요. 삭제했다는 기록만 진행 기록에 남아요.`
            : ""
        }
        confirmLabel="삭제"
        pendingLabel="삭제 중…"
        destructive
        pending={busy}
        onConfirm={remove}
      />

      {/* 보낼 때마다 포인트가 나가므로 한 번 더 확인한다 */}
      <ConfirmDialog
        open={talkOpen}
        onOpenChange={setTalkOpen}
        title="알림톡 청구서를 보낼까요?"
        description={`${provider?.label ?? "결제사"}에서 학부모 휴대폰으로 카카오 알림톡 청구서를 보내요. 보낼 때마다 쌤포인트가 차감돼요. 이미 보낸 청구서면 같은 청구서를 다시 보내요.`}
        confirmLabel="알림톡 보내기"
        pendingLabel="보내는 중…"
        pending={busy}
        onConfirm={sendTalk}
      />
    </>
  );
}

// ─── 본문 ──────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-x2 t4-bold text-fg-neutral">{children}</h3>;
}

function DetailBody({
  detail,
  fullAccess,
  providerIssue,
  busy,
  onRefund,
  onChanged,
}: {
  detail: AdminInvoiceDetail;
  fullAccess: boolean;
  /** 현금영수증을 결제선생으로 바로 발급할 수 있는지 */
  providerIssue: boolean;
  busy: boolean;
  /** 현금영수증 처리 뒤 상세를 다시 읽는다 */
  onChanged: () => void;
  onRefund: (target: { detail: AdminInvoiceDetail; payment: AdminPaymentDetail }) => void;
}) {
  const { invoice, student, payments, refunds, notices, events } = detail;
  const open = invoice.status === "REQUESTED";
  // 추가 항목이나 할인이 있을 때만 항목별로 풀어 보여 준다 — 평범한 청구서는 한 줄로 충분하다
  const hasBreakdown = invoice.extraItems.length > 0 || invoice.discount > 0;

  return (
    <div className="flex flex-col gap-x6 pb-x1">
      {invoice.needsReview && (
        <Notice tone="bad" title="확인이 필요한 청구서예요">
          결제사에서 직접 취소되는 등 이 화면 밖에서 결제 내역이 바뀌었어요. 아래 결제·환불 내역과 진행 기록을
          확인해 주세요.
        </Notice>
      )}

      <DescriptionList
        cols={2}
        items={[
          {
            label: "학생",
            value: `${student.name} · ${student.grade}${student.seat ? ` · ${student.seat}번` : ""}${
              student.status === "ACTIVE" ? "" : " (퇴실)"
            }`,
          },
          {
            label: "청구 금액",
            full: hasBreakdown,
            value: <AmountBreakdown invoice={invoice} detailed={hasBreakdown} />,
          },
          { label: "이용 기간", value: <span className="tabular-nums">{periodLabel(invoice.periodStart, invoice.periodEnd)}</span> },
          {
            label: "납부 기한",
            value: (
              <span className="tabular-nums">
                {dotDate(invoice.dueDate)}
                {open && (
                  <span className={invoice.daysToDue < 0 ? "ml-x1_5 t3-medium text-fg-critical" : "ml-x1_5 t3-medium text-fg-neutral-subtle"}>
                    {dueLabel(invoice.daysToDue)}
                  </span>
                )}
              </span>
            ),
          },
          ...(invoice.paidAt
            ? [
                {
                  label: "납부",
                  value: (
                    <span className="tabular-nums">
                      {won(invoice.paidAmount)} · {fullDateTime(invoice.paidAt)}
                    </span>
                  ),
                },
                {
                  label: "실제 이용 종료일",
                  value: (
                    <span className="tabular-nums">
                      {invoice.coverageEnd ? dotDate(invoice.coverageEnd) : "이용 기간 없음"}
                      {invoice.refundedAmount > 0 && (
                        <span className="ml-x1_5 t3-regular text-fg-neutral-subtle">환불 {won(invoice.refundedAmount)}</span>
                      )}
                    </span>
                  ),
                },
              ]
            : []),
          {
            label: "발행",
            value: (
              <span className="tabular-nums">
                {fullDateTime(invoice.createdAt)}
                {invoice.issuedByName ? ` · ${invoice.issuedByName}` : ""}
                {invoice.autoIssued && <span className="ml-x1_5 t3-regular text-fg-neutral-subtle">자동 청구</span>}
              </span>
            ),
          },
          ...(invoice.canceledAt
            ? [
                {
                  label: "청구 취소",
                  value: (
                    <span className="tabular-nums">
                      {fullDateTime(invoice.canceledAt)}
                      {invoice.canceledByName ? ` · ${invoice.canceledByName}` : ""}
                      {invoice.cancelReason ? ` · ${invoice.cancelReason}` : ""}
                    </span>
                  ),
                },
              ]
            : []),
          ...(invoice.parentMessage
            ? [
                {
                  label: "학부모 안내 메시지 (학부모에게 보여요)",
                  value: <span className="whitespace-pre-line">{invoice.parentMessage}</span>,
                  full: true,
                },
              ]
            : []),
          ...(invoice.memo
            ? [{ label: "메모 (직원용, 학부모에게는 안 보여요)", value: invoice.memo, full: true }]
            : []),
        ]}
      />

      <section>
        <SectionTitle>결제 내역</SectionTitle>
        {payments.length === 0 ? (
          <p className="t4-regular text-fg-neutral-subtle">아직 결제를 시도한 적이 없어요.</p>
        ) : (
          <ul className="divide-y divide-stroke-neutral-muted overflow-hidden rounded-r3 border border-stroke-neutral-muted">
            {payments.map((payment) => (
              <PaymentItem
                key={payment.id}
                payment={payment}
                canRefund={fullAccess}
                providerIssue={providerIssue}
                busy={busy}
                summary={`${student.name} · ${invoice.title}`}
                onChanged={onChanged}
                onRefund={() => onRefund({ detail, payment })}
              />
            ))}
          </ul>
        )}
      </section>

      {refunds.length > 0 && (
        <section>
          <SectionTitle>환불 내역</SectionTitle>
          <ul className="divide-y divide-stroke-neutral-muted overflow-hidden rounded-r3 border border-stroke-neutral-muted">
            {refunds.map((refund) => (
              <li key={refund.id} className="px-x4 py-x3">
                <div className="flex flex-wrap items-center gap-x1_5">
                  <span className="t4-bold tabular-nums text-fg-neutral">{won(refund.amount)}</span>
                  <StatusBadge tone={REFUND_STATUS_TONE[refund.status]}>{REFUND_STATUS_LABEL[refund.status]}</StatusBadge>
                  <span className="t3-regular text-fg-neutral-subtle">
                    {REFUND_METHOD_LABEL[refund.method]} · {REFUND_SOURCE_LABEL[refund.source]}
                  </span>
                  <span className="ml-auto t3-regular tabular-nums text-fg-neutral-subtle">
                    {shortDateTime(refund.completedAt ?? refund.createdAt)}
                  </span>
                </div>
                <p className="mt-x1 t3-regular text-fg-neutral-muted">
                  {refund.reason}
                  {refund.requestedByName ? ` · ${refund.requestedByName}` : ""}
                  {refund.effectiveDate ? ` · 마지막 이용일 ${dotDate(refund.effectiveDate)}` : ""}
                </p>
                {refund.calcBasis && <p className="mt-x0_5 t3-regular text-fg-neutral-subtle">{refund.calcBasis}</p>}
                {refund.status === "FAILED" && (
                  <p className="mt-x1 t3-medium text-fg-critical">
                    {refund.failMessage ?? "환불되지 않았어요. 다시 시도해 주세요."}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {notices.length > 0 && (
        <section>
          <SectionTitle>안내 발송</SectionTitle>
          <ul className="flex flex-col gap-x1_5">
            {notices.map((notice) => (
              <li key={notice.id} className="flex flex-wrap items-center gap-x2 t3-regular text-fg-neutral-muted">
                <span className="w-24 shrink-0 tabular-nums text-fg-neutral-subtle">{shortDateTime(notice.createdAt)}</span>
                <span className="t3-medium text-fg-neutral">{NOTICE_KIND_LABEL[notice.kind]}</span>
                {notice.sentCount > 0 ? (
                  <span className="tabular-nums">도달 {notice.sentCount}대</span>
                ) : (
                  <StatusBadge tone="warn">미도달</StatusBadge>
                )}
                <span className="text-fg-neutral-subtle">{notice.sentByName ?? "자동 발송"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <SectionTitle>진행 기록</SectionTitle>
        {events.length === 0 ? (
          <p className="t4-regular text-fg-neutral-subtle">기록이 없어요.</p>
        ) : (
          <ol className="flex flex-col gap-x2 border-l border-stroke-neutral-muted pl-x4">
            {events.map((event) => (
              <li key={event.id} className="t3-regular">
                <p className="text-fg-neutral">{event.detail ?? event.type}</p>
                <p className="mt-x0_5 tabular-nums text-fg-neutral-subtle">
                  {fullDateTime(event.createdAt)} · {eventActor(event.source, event.actorName)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function PaymentItem({
  payment,
  canRefund,
  providerIssue,
  busy,
  summary,
  onChanged,
  onRefund,
}: {
  payment: AdminPaymentDetail;
  /** 원장급 여부 — 환불과 현금영수증 발급·취소 */
  canRefund: boolean;
  providerIssue: boolean;
  busy: boolean;
  summary: string;
  onChanged: () => void;
  onRefund: () => void;
}) {
  // 납부로 인정되지 않은 결제(중복·오결제)가 아직 돈을 쥐고 있으면 여기서 바로 환불을 다시 시도할 수 있다
  const duplicateHolding = payment.isDuplicate && !payment.isAccepted && payment.paidAmount > payment.refundedAmount;
  const closedReason = payment.closedReason
    ? (PAYMENT_CLOSED_REASON_LABEL[payment.closedReason] ?? payment.closedReason)
    : null;
  const collected = payment.status === "DONE";
  const approvalParts = [
    payment.cardIssuer,
    payment.cardType,
    installmentLabel(payment.installmentMonths),
    payment.approvalNumber ? `승인번호 ${payment.approvalNumber}` : null,
  ].filter((part): part is string => !!part);

  return (
    <li className="px-x4 py-x3">
      <div className="flex flex-wrap items-center gap-x1_5">
        <span className="t4-medium text-fg-neutral">{payment.methodLabel}</span>
        <StatusBadge tone={PAYMENT_STATUS_TONE[payment.status]}>{PAYMENT_STATUS_LABEL[payment.status]}</StatusBadge>
        {payment.isAccepted && <StatusBadge tone="brand">납부 확정</StatusBadge>}
        {payment.isDuplicate && <StatusBadge tone="bad">중복 결제</StatusBadge>}
        {closedReason && <span className="t3-regular text-fg-neutral-subtle">{closedReason}</span>}
        <span className="ml-auto t4-bold tabular-nums text-fg-neutral">
          {won(collected ? payment.paidAmount : payment.amount)}
        </span>
      </div>

      <p className="mt-x1 flex flex-wrap items-center gap-x-x2 gap-y-x0_5 t3-regular tabular-nums text-fg-neutral-subtle">
        {payment.approvedAt ? (
          <span>승인 {fullDateTime(payment.approvedAt)}</span>
        ) : payment.confirmedAt ? (
          <span>확인 {fullDateTime(payment.confirmedAt)}</span>
        ) : (
          <span>{payment.method === "LINK" ? "링크 발급" : "신청"} {fullDateTime(payment.requestedAt ?? payment.createdAt)}</span>
        )}
        {payment.confirmedByName && <span>확인 {payment.confirmedByName}</span>}
        {payment.status === "PENDING" && payment.checkoutStartedAt && !payment.deposit && (
          <span>결제창 열람 {shortDateTime(payment.checkoutStartedAt)} · 결제 미완료</span>
        )}
        {payment.status === "PENDING" && payment.expiresAt && <span>링크 기한 {shortDateTime(payment.expiresAt)}</span>}
        {payment.refundedAmount > 0 && <span>환불 {won(payment.refundedAmount)}</span>}
        {payment.pendingRefundAmount > 0 && <span>환불 처리 중 {won(payment.pendingRefundAmount)}</span>}
        {payment.receiptUrl && (
          <a
            href={payment.receiptUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-x0_5 t3-medium text-fg-brand underline-offset-4 hover:underline"
          >
            영수증
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
      </p>

      {approvalParts.length > 0 && (
        <p className="mt-x1 t3-regular tabular-nums text-fg-neutral-muted">승인 정보 · {approvalParts.join(" · ")}</p>
      )}

      {payment.status === "PENDING" && payment.deposit && (
        <p className="mt-x1 t3-regular tabular-nums text-fg-neutral-muted">
          가상계좌 입금 대기 · {[payment.deposit.bank, payment.deposit.account].filter(Boolean).join(" ")}
          {payment.deposit.dueAt ? ` · ${shortDateTime(payment.deposit.dueAt)}까지` : ""}
        </p>
      )}
      {payment.failMessage && <p className="mt-x1 t3-medium text-fg-critical">{payment.failMessage}</p>}
      {payment.memo && <p className="mt-x1 t3-regular text-fg-neutral-muted">메모 · {payment.memo}</p>}

      {(payment.cashReceipt || payment.cashReceiptAllowed) && (
        <CashReceiptBlock
          payment={payment}
          fullAccess={canRefund}
          providerIssue={providerIssue}
          summary={`${summary} · ${won(payment.paidAmount - payment.refundedAmount)}`}
          onChanged={onChanged}
        />
      )}

      {duplicateHolding && (
        <div className="mt-x2 flex flex-wrap items-center gap-x2">
          <span className="t3-medium text-fg-critical">
            아직 돌려주지 못한 금액 {won(payment.paidAmount - payment.refundedAmount)}
          </span>
          {canRefund && (
            <Button
              variant="outline"
              size="xs"
              disabled={busy || payment.pendingRefundAmount > 0}
              title={payment.pendingRefundAmount > 0 ? "환불이 처리되고 있어요" : undefined}
              onClick={onRefund}
            >
              <RotateCcw />
              중복 결제 환불
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

/** 현금·계좌이체 수납의 현금영수증 기록과 처리 버튼 */
function CashReceiptBlock({
  payment,
  fullAccess,
  providerIssue,
  summary,
  onChanged,
}: {
  payment: AdminPaymentDetail;
  fullAccess: boolean;
  providerIssue: boolean;
  summary: string;
  onChanged: () => void;
}) {
  const receipt = payment.cashReceipt;
  return (
    <div className="mt-x2 rounded-r2 bg-bg-layer-fill px-x3 py-x2_5">
      <div className="flex flex-wrap items-center gap-x1_5">
        <span className="t3-medium text-fg-neutral">현금영수증</span>
        <CashReceiptStatusBadge receipt={receipt} />
        {receipt && receipt.status !== "CANCELED" && (
          <span className="t3-regular tabular-nums text-fg-neutral-muted">
            {CASH_RECEIPT_PURPOSE_LABEL[receipt.purpose]} · {receipt.identifier}
          </span>
        )}
      </div>

      {receipt && (
        <div className="mt-x1 flex flex-col gap-x0_5 t3-regular tabular-nums text-fg-neutral-subtle">
          <span>금액 {cashReceiptAmountText(receipt)}</span>
          {receipt.status === "ISSUED" && (
            <span>
              승인번호 {receipt.approvalNumber ?? "—"}
              {receipt.issuedAt ? ` · ${fullDateTime(receipt.issuedAt)}` : ""}
              {receipt.issuedByName ? ` · ${receipt.issuedByName}` : ""}
            </span>
          )}
          {receipt.status === "REQUESTED" && receipt.requestedByName && <span>신청 {receipt.requestedByName}</span>}
          {receipt.status === "CANCELED" && (
            <span>
              취소{receipt.canceledAt ? ` ${fullDateTime(receipt.canceledAt)}` : ""}
              {receipt.cancelReason ? ` · ${receipt.cancelReason}` : ""}
            </span>
          )}
        </div>
      )}
      {!receipt && (
        <p className="mt-x1 t3-regular text-fg-neutral-subtle">아직 현금영수증 신청이 등록되지 않았어요.</p>
      )}

      {receipt?.stale && (
        <div className="mt-x2">
          <CashReceiptStaleNotice fullAccess={fullAccess} viaProvider={receipt.viaProvider} />
        </div>
      )}

      <div className="mt-x2">
        <CashReceiptActions
          paymentId={payment.id}
          receipt={receipt}
          allowed={payment.cashReceiptAllowed}
          fullAccess={fullAccess}
          providerIssue={providerIssue}
          summary={summary}
          onDone={onChanged}
        />
      </div>
    </div>
  );
}

/** 금액 구성 — 수강료, 추가 항목, 할인, 청구 금액(과세면 공급가액·세액). detailed 가 아니면 한 줄 */
function AmountBreakdown({ invoice, detailed }: { invoice: AdminInvoiceDetail["invoice"]; detailed: boolean }) {
  const taxLine = invoice.tax ? (
    <span className="t3-regular tabular-nums text-fg-neutral-subtle">
      {TAX_TYPE_LABEL[invoice.taxType]} · 공급가액 {won(invoice.tax.supplyAmount)} · 세액 {won(invoice.tax.taxAmount)}
    </span>
  ) : null;

  if (!detailed) {
    return (
      <>
        <span className="t4-bold tabular-nums">{won(invoice.amount)}</span>
        <span className="ml-x1_5 t3-regular tabular-nums text-fg-neutral-subtle">
          {won(invoice.monthlyFee)} × {invoice.months}개월
        </span>
        {taxLine && <span className="block">{taxLine}</span>}
      </>
    );
  }

  const row = "flex items-baseline justify-between gap-x4 t4-regular tabular-nums";
  return (
    <div className="flex max-w-sm flex-col gap-x1">
      <div className={row}>
        <span className="text-fg-neutral-muted">
          수강료 <span className="t3-regular text-fg-neutral-subtle">{won(invoice.monthlyFee)} × {invoice.months}개월</span>
        </span>
        <span>{won(invoice.tuitionAmount)}</span>
      </div>
      {invoice.extraItems.map((item, index) => (
        <div key={`${item.name}-${index}`} className={row}>
          <span className="text-fg-neutral-muted">{item.name}</span>
          <span>{won(item.amount)}</span>
        </div>
      ))}
      {invoice.discount > 0 && (
        <div className={row}>
          <span className="text-fg-neutral-muted">할인</span>
          <span>−{won(invoice.discount)}</span>
        </div>
      )}
      <div className={`${row} border-t border-stroke-neutral-muted pt-x1`}>
        <span className="t4-medium">청구 금액</span>
        <span className="t4-bold">{won(invoice.amount)}</span>
      </div>
      {taxLine}
    </div>
  );
}

// ─── 청구 취소 ─────────────────────────────────────────────────────────

function CancelInvoiceDialog({
  invoiceId,
  summary,
  onClose,
  onDone,
}: {
  invoiceId: string;
  summary: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");

  function submit() {
    if (!reason.trim()) return;
    startTransition(async () => {
      const res = await callTuition(() => cancelTuitionInvoice(invoiceId, reason.trim()));
      if (res.ok) toast.success("청구를 취소했어요");
      else toast.error(res.error);
      onDone();
      // 취소하지 못한 이유가 입력 문제일 때만 다시 고칠 수 있게 남겨 둔다
      if (res.ok || res.code !== "INVALID_INPUT") onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-w-sm gap-x5 [&>button:last-child]:hidden">
        <form
          className="flex flex-col gap-x5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <DialogHeader className="pr-0">
            <DialogTitle className="t7-bold">청구를 취소할까요?</DialogTitle>
            <DialogDescription className="whitespace-pre-line t5-regular">
              {`${summary}\n취소하면 학부모가 더 결제할 수 없고, 열려 있던 결제 링크와 현장 결제 신청도 함께 닫혀요.`}
            </DialogDescription>
          </DialogHeader>
          <FormField label="취소 사유" htmlFor="tuition-cancel-reason" required hint="진행 기록에 남아요.">
            <Input
              id="tuition-cancel-reason"
              autoFocus
              value={reason}
              maxLength={300}
              disabled={pending}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: 금액 잘못 입력"
            />
          </FormField>
          <DialogFooter className="grid grid-cols-2 gap-x2 pt-0">
            <Button type="button" variant="secondary" size="lg" onClick={onClose} disabled={pending}>
              닫기
            </Button>
            <Button type="submit" variant="destructive" size="lg" disabled={pending || !reason.trim()}>
              {pending ? "취소 중…" : "청구 취소"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
