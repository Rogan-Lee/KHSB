"use client";

// 현장 결제 확인 — 단말기·현금·계좌이체로 실제 돈을 받은 뒤 직원이 누른다.
// 학부모가 앱에서 신청한 건(paymentId 있음)과 신청 없이 방문 결제한 건(없음)을 같은 화면으로 처리한다.

import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField, Notice } from "@/components/backoffice/ui";
import { confirmTuitionOnsitePayment } from "@/actions/tuition";
import { normalizeCashReceiptIdentifier, type TuitionCashReceiptPurposeValue } from "@/lib/tuition/calc";
import { CASH_RECEIPT_PURPOSE_LABEL, PAYMENT_METHOD_LABEL, won } from "@/lib/tuition/format";
import type { OnsiteConfirmMethod } from "@/lib/tuition/types";
import { CashReceiptNumberField } from "./cash-receipt-dialog";
import { callTuition } from "./shared";

export type OnsiteTarget = {
  invoiceId: string;
  /** 확인을 기다리는 학부모 신청 건 */
  paymentId?: string;
  studentName: string;
  title: string;
  /** 받아야 할 금액 */
  amount: number;
  /** 학부모가 신청하면서 고른 수단 */
  requestedMethod?: string;
};

const METHODS: OnsiteConfirmMethod[] = ["LOCAL_CURRENCY", "ONSITE_CARD", "CASH", "TRANSFER"];

function isConfirmMethod(value: string | undefined): value is OnsiteConfirmMethod {
  return !!value && (METHODS as string[]).includes(value);
}

export function OnsitePaymentDialog({
  target,
  candidates,
  onClose,
  onDone,
}: {
  /** 대상이 정해져 있으면 넘긴다. 없으면 candidates 에서 고른다 (방문 결제 기록) */
  target?: OnsiteTarget;
  candidates?: OnsiteTarget[];
  onClose: () => void;
  /** 결제가 반영됐거나 상태가 달라져 목록을 다시 불러와야 할 때 */
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [pickedId, setPickedId] = useState("");
  const picked = target ?? candidates?.find((c) => c.invoiceId === pickedId);
  // 수단은 대상이 정해질 때 신청 수단으로 맞추고, 신청이 없으면 직접 고르게 비워 둔다 (잘못 기록되는 것 방지)
  const [methodByInvoice, setMethodByInvoice] = useState<Record<string, OnsiteConfirmMethod>>({});
  const method: OnsiteConfirmMethod | "" = picked
    ? (methodByInvoice[picked.invoiceId] ?? (isConfirmMethod(picked.requestedMethod) ? picked.requestedMethod : ""))
    : "";
  const [memo, setMemo] = useState("");
  const [approvalNumber, setApprovalNumber] = useState("");
  // 현금영수증은 현금·계좌이체에만 — "나중에 등록"이 기본이라 등록을 건너뛰어도 납부 확인은 막지 않는다
  const [receiptChoice, setReceiptChoice] = useState<"NONE" | TuitionCashReceiptPurposeValue>("NONE");
  const [receiptNumber, setReceiptNumber] = useState("");
  const isCard = method === "ONSITE_CARD" || method === "LOCAL_CURRENCY";
  const isCash = method === "CASH" || method === "TRANSFER";
  const receiptParsed = receiptChoice === "NONE" ? null : normalizeCashReceiptIdentifier(receiptChoice, receiptNumber);
  const approvalInvalid = isCard && approvalNumber !== "" && !/^[0-9A-Za-z-]{1,30}$/.test(approvalNumber.trim());
  const receiptInvalid = isCash && receiptParsed !== null && !receiptParsed.ok;

  function confirm() {
    if (!picked || !method) return;
    startTransition(async () => {
      const res = await callTuition(() =>
        confirmTuitionOnsitePayment({
          invoiceId: picked.invoiceId,
          paymentId: picked.paymentId,
          method,
          memo: memo.trim() || null,
          approvalNumber: isCard ? approvalNumber.trim() || null : null,
          cashReceipt: isCash && receiptParsed?.ok && receiptChoice !== "NONE"
            ? { purpose: receiptChoice, identifier: receiptParsed.identifier }
            : null,
        }),
      );
      if (res.ok) {
        toast.success(`${picked.studentName} 학생 ${won(picked.amount)} 납부를 확인했어요`);
        // 납부는 기록됐지만 현금영수증 등록만 실패한 경우 — 납부를 되돌리지 않았다는 것과 이어서 할 곳을 알린다
        if (res.data.cashReceiptError) {
          toast.warning("납부는 기록됐지만 현금영수증 신청은 등록하지 못했어요", {
            description: `${res.data.cashReceiptError} 현금영수증 탭에서 다시 등록할 수 있어요.`,
            duration: 10000,
          });
        }
        onDone();
        onClose();
        return;
      }
      toast.error(res.error);
      // 이미 다른 방법으로 납부됐다면 목록이 낡은 것 — 다시 불러온다
      if (res.code === "ALREADY_PAID" || res.code === "INVOICE_NOT_PAYABLE" || res.code === "NOT_FOUND") {
        onDone();
        onClose();
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{target ? "현장 결제 확인" : "방문 결제 기록"}</DialogTitle>
          <DialogDescription>
            단말기·현금·계좌이체로 금액을 실제로 받은 뒤에 눌러 주세요. 확인하면 바로 납부 완료로 바뀌어요.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-x4">
          {!target && (
            <FormField label="청구서" required hint="아직 납부 전인 청구서만 보여요.">
              {candidates && candidates.length > 0 ? (
                <SearchableSelect
                  options={candidates.map((c) => ({
                    value: c.invoiceId,
                    label: `${c.studentName} · ${c.title} · ${won(c.amount)}`,
                  }))}
                  value={pickedId}
                  onValueChange={setPickedId}
                  placeholder="학생 이름으로 찾기"
                  searchPlaceholder="학생 이름 검색"
                  emptyText="납부 전인 청구서가 없어요"
                />
              ) : (
                <Notice tone="gray">납부 전인 청구서가 없어요. 먼저 청구서를 발행해 주세요.</Notice>
              )}
            </FormField>
          )}

          {picked && (
            <>
              <div className="rounded-r3 bg-bg-layer-fill px-x4 py-x3">
                <p className="t3-regular text-fg-neutral-subtle">
                  {picked.studentName} · {picked.title}
                </p>
                <p className="mt-x1 flex items-baseline gap-x1_5">
                  <span className="t3-medium text-fg-neutral-subtle">받을 금액</span>
                  <span className="t8-bold tabular-nums text-fg-neutral">{won(picked.amount)}</span>
                </p>
              </div>

              <FormField label="결제 수단" required>
                <Select
                  value={method}
                  onValueChange={(value) =>
                    setMethodByInvoice((prev) => ({ ...prev, [picked.invoiceId]: value as OnsiteConfirmMethod }))
                  }
                >
                  <SelectTrigger aria-label="결제 수단">
                    <SelectValue placeholder="결제 수단 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {PAYMENT_METHOD_LABEL[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              {isCard && (
                <FormField
                  label="승인번호"
                  htmlFor="tuition-onsite-approval"
                  error={approvalInvalid ? "숫자·영문·하이픈만 30자 이내로 적어 주세요" : undefined}
                  hint="단말기 영수증에 찍힌 승인번호예요. 나중에 카드 매출과 맞춰 볼 때 써요. (선택)"
                >
                  <Input
                    id="tuition-onsite-approval"
                    autoComplete="off"
                    value={approvalNumber}
                    maxLength={30}
                    onChange={(e) => setApprovalNumber(e.target.value)}
                    placeholder="예: 30012345"
                  />
                </FormField>
              )}

              {isCash && (
                <>
                  <FormField
                    label="현금영수증"
                    hint="여기에는 신청 정보만 남기고, 발급은 원장·관리자가 현금영수증 탭에서 해요. 나중에 등록해도 돼요."
                  >
                    <Select
                      value={receiptChoice}
                      onValueChange={(value) => {
                        setReceiptChoice(value as "NONE" | TuitionCashReceiptPurposeValue);
                        setReceiptNumber("");
                      }}
                    >
                      <SelectTrigger aria-label="현금영수증">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">나중에 등록</SelectItem>
                        <SelectItem value="INCOME">{CASH_RECEIPT_PURPOSE_LABEL.INCOME} (휴대폰번호)</SelectItem>
                        <SelectItem value="EXPENSE">{CASH_RECEIPT_PURPOSE_LABEL.EXPENSE} (사업자등록번호)</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  {receiptChoice !== "NONE" && (
                    <CashReceiptNumberField
                      id="tuition-onsite-receipt-number"
                      purpose={receiptChoice}
                      value={receiptNumber}
                      onChange={setReceiptNumber}
                      disabled={pending}
                    />
                  )}
                </>
              )}

              <FormField label="메모" htmlFor="tuition-onsite-memo" hint="학부모에게는 보이지 않아요.">
                <Input
                  id="tuition-onsite-memo"
                  value={memo}
                  maxLength={300}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="예: 영수증 번호, 결제한 보호자"
                />
              </FormField>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            취소
          </Button>
          <Button
            onClick={confirm}
            disabled={
              pending ||
              !picked ||
              !method ||
              approvalInvalid ||
              receiptInvalid ||
              (isCash && receiptChoice !== "NONE" && receiptNumber.trim() === "")
            }
          >
            {pending ? "확인 중…" : picked ? `${won(picked.amount)} 결제 확인` : "결제 확인"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
