"use client";

// 현금영수증 — 신청 등록·수정, 발급, 취소 폼과 그 버튼 묶음.
// 현금영수증 탭과 청구서 상세가 같은 폼·같은 규칙을 쓴다. 결제선생이 연결돼 있으면 결제선생으로 바로 발급·취소하고,
// 아니면 홈택스 등에서 발급한 뒤 국세청 승인번호만 남긴다. 버튼은 권한에 맞춰 숨기지만 실제 검사는 서버 액션이 한다.

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField, Notice } from "@/components/backoffice/ui";
import {
  cancelTuitionCashReceipt,
  issueTuitionCashReceipt,
  markTuitionCashReceiptIssued,
  requestTuitionCashReceipt,
} from "@/actions/tuition";
import type { AdminCashReceiptInfo } from "@/lib/tuition/admin-data";
import { normalizeCashReceiptIdentifier, type TuitionCashReceiptPurposeValue } from "@/lib/tuition/calc";
import { CASH_RECEIPT_PURPOSE_LABEL, won } from "@/lib/tuition/format";
import { callTuition, copyText } from "./shared";

/** 국세청 자진 발급 번호 — 지급받는 사람이 번호를 주지 않았을 때 소득공제용으로 쓰는 공용 번호 */
export const SELF_ISSUE_NUMBER = "010-000-1234";

export const PURPOSE_NUMBER_LABEL: Record<TuitionCashReceiptPurposeValue, string> = {
  INCOME: "휴대폰번호",
  EXPENSE: "사업자등록번호",
};

/** 입력값 확인 — 비어 있으면 null (아직 안 쓴 것), 틀렸으면 사유 */
export function cashReceiptNumberError(purpose: TuitionCashReceiptPurposeValue, raw: string): string | null {
  if (!raw.trim()) return null;
  const parsed = normalizeCashReceiptIdentifier(purpose, raw);
  return parsed.ok ? null : parsed.error;
}

/** 발급 구분에 맞는 번호 입력 + 오류 문구 + (소득공제일 때) 자진 발급 번호 채우기 */
export function CashReceiptNumberField({
  id,
  purpose,
  value,
  onChange,
  disabled,
  extraHint,
}: {
  id: string;
  purpose: TuitionCashReceiptPurposeValue;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  extraHint?: string;
}) {
  const error = cashReceiptNumberError(purpose, value);
  return (
    <FormField
      label={PURPOSE_NUMBER_LABEL[purpose]}
      htmlFor={id}
      required
      error={error}
      hint={
        purpose === "INCOME"
          ? `휴대폰번호를 받아 적어 주세요. ${extraHint ?? ""}`.trim()
          : `사업자등록번호 10자리를 적어 주세요. ${extraHint ?? ""}`.trim()
      }
    >
      <Input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        maxLength={20}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
        placeholder={purpose === "INCOME" ? "010-0000-0000" : "000-00-00000"}
      />
      {purpose === "INCOME" && (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={disabled}
            onClick={() => onChange(SELF_ISSUE_NUMBER)}
            title="국세청 자진 발급 번호 — 낸 분이 영수증을 따로 요청하지 않았을 때 쓰는 공용 번호예요"
          >
            영수증 요청이 없다면 자진 발급 번호({SELF_ISSUE_NUMBER}) 넣기
          </Button>
        </div>
      )}
    </FormField>
  );
}

/** 발급 뒤 환불로 금액이 달라진 영수증 안내 */
export function CashReceiptStaleNotice({ fullAccess, viaProvider }: { fullAccess: boolean; viaProvider: boolean }) {
  return (
    <Notice tone="bad" title="현금영수증을 다시 발급해야 해요">
      {viaProvider
        ? "환불로 금액이 달라졌어요. ‘취소’를 누르면 결제선생에서 기존 영수증이 취소돼요. 그다음 남은 금액으로 다시 등록해 발급해 주세요."
        : "환불로 금액이 달라졌어요. 홈택스에서 기존 영수증을 취소한 뒤 여기서 ‘취소’로 기록하고, 남은 금액으로 다시 등록해 주세요."}
      {!fullAccess && " 취소 처리는 원장·관리자가 할 수 있어요."}
    </Notice>
  );
}

// ─── 폼 ────────────────────────────────────────────────────────────────

/** 신청 등록·수정 — 직원 전체. 발급 완료 전까지 고칠 수 있다 */
export function CashReceiptRequestDialog({
  paymentId,
  receipt,
  fullAccess,
  summary,
  onClose,
  onDone,
}: {
  paymentId: string;
  /** 있으면 수정 (취소된 기록이면 새로 등록하는 것과 같다) */
  receipt: AdminCashReceiptInfo | null;
  fullAccess: boolean;
  /** 대상 한 줄 요약 — "김하늘 · 11월 수강료 · 330,000원" */
  summary: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const editing = !!receipt && receipt.status === "REQUESTED";
  const [purpose, setPurpose] = useState<TuitionCashReceiptPurposeValue>(receipt?.purpose ?? "INCOME");
  // 직원에게는 번호가 가려져 내려온다 — 가린 값을 채워 두면 그대로 저장돼 버리므로 비워 두고 다시 받게 한다
  const [identifier, setIdentifier] = useState(editing && fullAccess ? receipt.identifier : "");
  const parsed = normalizeCashReceiptIdentifier(purpose, identifier);

  function submit() {
    if (!parsed.ok) return;
    startTransition(async () => {
      const res = await callTuition(() =>
        requestTuitionCashReceipt({ paymentId, purpose, identifier: parsed.identifier }),
      );
      if (res.ok) {
        toast.success(editing ? "현금영수증 신청 정보를 고쳤어요" : "현금영수증 신청을 등록했어요");
        onDone();
        onClose();
        return;
      }
      toast.error(res.error);
      if (res.code !== "INVALID_INPUT") {
        onDone();
        onClose();
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-w-md">
        <form
          className="flex flex-col gap-x4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{editing ? "현금영수증 신청 수정" : "현금영수증 신청 등록"}</DialogTitle>
            <DialogDescription>
              {summary}
              <br />
              여기에는 신청 정보를 남겨요. 발급은 원장·관리자가 해요.
            </DialogDescription>
          </DialogHeader>

          <FormField label="발급 구분" required>
            <Select
              value={purpose}
              onValueChange={(value) => {
                setPurpose(value as TuitionCashReceiptPurposeValue);
                setIdentifier("");
              }}
            >
              <SelectTrigger aria-label="발급 구분">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INCOME">{CASH_RECEIPT_PURPOSE_LABEL.INCOME} (휴대폰번호)</SelectItem>
                <SelectItem value="EXPENSE">{CASH_RECEIPT_PURPOSE_LABEL.EXPENSE} (사업자등록번호)</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <CashReceiptNumberField
            id="tuition-cash-receipt-number"
            purpose={purpose}
            value={identifier}
            onChange={setIdentifier}
            disabled={pending}
            extraHint={editing && !fullAccess ? "보안을 위해 기존 번호는 가려 두었어요. 고치려면 번호를 다시 입력해 주세요." : undefined}
          />

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
              닫기
            </Button>
            <Button type="submit" disabled={pending || !parsed.ok}>
              {pending ? "저장 중…" : editing ? "수정" : "신청 등록"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** 발급 완료 처리 — 홈택스에서 발급한 뒤 국세청 승인번호를 적는다 (원장급) */
export function CashReceiptIssueDialog({
  receiptId,
  summary,
  onClose,
  onDone,
}: {
  receiptId: string;
  summary: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [approvalNumber, setApprovalNumber] = useState("");

  function submit() {
    const value = approvalNumber.trim();
    if (!value) return;
    startTransition(async () => {
      const res = await callTuition(() => markTuitionCashReceiptIssued(receiptId, value));
      if (res.ok) toast.success("현금영수증을 발급 완료로 기록했어요");
      else toast.error(res.error);
      if (res.ok || res.code !== "INVALID_INPUT") {
        onDone();
        onClose();
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-w-md">
        <form
          className="flex flex-col gap-x4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>발급 완료 처리</DialogTitle>
            <DialogDescription>
              {summary}
              <br />
              홈택스 등에서 발급한 뒤, 국세청 승인번호를 적어 주세요.
            </DialogDescription>
          </DialogHeader>
          <FormField label="국세청 승인번호" htmlFor="tuition-cash-receipt-approval" required>
            <Input
              id="tuition-cash-receipt-approval"
              autoFocus
              autoComplete="off"
              value={approvalNumber}
              maxLength={30}
              disabled={pending}
              onChange={(e) => setApprovalNumber(e.target.value)}
              placeholder="발급 결과에 나온 승인번호"
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
              닫기
            </Button>
            <Button type="submit" disabled={pending || !approvalNumber.trim()}>
              {pending ? "저장 중…" : "발급 완료로 기록"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** 결제선생으로 발급 — 국세청 승인번호는 결제선생 응답에서 받는다 (원장급) */
export function CashReceiptProviderIssueDialog({
  receipt,
  summary,
  onClose,
  onDone,
}: {
  receipt: AdminCashReceiptInfo;
  summary: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await callTuition(() => issueTuitionCashReceipt(receipt.id));
      if (res.ok) toast.success(`현금영수증을 발급했어요 · 승인번호 ${res.data.approvalNumber}`);
      else toast.error(res.error);
      if (res.ok || res.code !== "INVALID_INPUT") {
        onDone();
        onClose();
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>결제선생으로 발급</DialogTitle>
          <DialogDescription>
            {summary}
            <br />
            국세청에 바로 발급돼요. 금액은 지금 남아 있는 수납액 기준이에요.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-x4 gap-y-x1_5 t3-regular">
          <dt className="text-fg-neutral-subtle">발급 구분</dt>
          <dd className="text-fg-neutral">{CASH_RECEIPT_PURPOSE_LABEL[receipt.purpose]}</dd>
          <dt className="text-fg-neutral-subtle">{PURPOSE_NUMBER_LABEL[receipt.purpose]}</dt>
          <dd className="tabular-nums text-fg-neutral">{receipt.identifier}</dd>
          <dt className="text-fg-neutral-subtle">금액</dt>
          <dd className="tabular-nums text-fg-neutral">{cashReceiptAmountText(receipt)}</dd>
        </dl>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            닫기
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? "발급 중…" : "발급"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 취소 — 신청을 거두거나 발급한 영수증을 취소한다. 결제선생으로 발급한 건은 결제선생에서 취소된다 (원장급) */
export function CashReceiptCancelDialog({
  receiptId,
  issued,
  viaProvider,
  summary,
  onClose,
  onDone,
}: {
  receiptId: string;
  /** 이미 발급 완료된 영수증인지 */
  issued: boolean;
  /** 결제선생으로 발급한 건인지 */
  viaProvider: boolean;
  summary: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");

  function submit() {
    const value = reason.trim();
    if (!value) return;
    startTransition(async () => {
      const res = await callTuition(() => cancelTuitionCashReceipt(receiptId, value));
      if (res.ok) toast.success(issued && viaProvider ? "현금영수증을 취소했어요" : "현금영수증을 취소로 기록했어요");
      else toast.error(res.error);
      if (res.ok || res.code !== "INVALID_INPUT") {
        onDone();
        onClose();
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-w-md">
        <form
          className="flex flex-col gap-x4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>현금영수증 취소</DialogTitle>
            <DialogDescription>
              {summary}
              <br />
              {issued && viaProvider
                ? "결제선생에서 발급한 영수증을 취소해요. 취소한 영수증은 되살릴 수 없어요."
                : issued
                  ? "홈택스에서 이미 발급한 영수증을 먼저 취소한 뒤에 눌러 주세요. 여기서는 취소했다는 기록만 남겨요."
                  : "신청을 거두고 취소로 기록해요."}
            </DialogDescription>
          </DialogHeader>
          <FormField label="취소 사유" htmlFor="tuition-cash-receipt-cancel" required hint="기록에 남아요.">
            <Input
              id="tuition-cash-receipt-cancel"
              autoFocus
              value={reason}
              maxLength={300}
              disabled={pending}
              onChange={(e) => setReason(e.target.value)}
              placeholder={issued ? "예: 환불로 금액 변경, 재발급 예정" : "예: 번호 잘못 받음"}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
              닫기
            </Button>
            <Button type="submit" variant="destructive" disabled={pending || !reason.trim()}>
              {pending ? "취소 중…" : "현금영수증 취소"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── 버튼 묶음 ─────────────────────────────────────────────────────────

type Mode = "request" | "issue" | "providerIssue" | "cancel";

/**
 * 상태에 맞는 동작 버튼 + 열리는 폼.
 *  - 기록 없음 / 취소됨(남은 금액 있음): 신청 등록 (직원 전체)
 *  - 발급 필요: 수정 (직원 전체), 취소 (원장급), 그리고 (원장급)
 *    결제선생 연결 시 결제선생으로 발급 / 아니면 번호 복사·발급 완료 처리 (홈택스 발급 기록)
 *  - 발급 완료: 취소 (원장급). 재발급 필요(stale)도 같다
 */
export function CashReceiptActions({
  paymentId,
  receipt,
  allowed,
  fullAccess,
  providerIssue,
  summary,
  onDone,
}: {
  paymentId: string;
  receipt: AdminCashReceiptInfo | null;
  /** 남은 수납액이 있어 등록할 수 있는지 */
  allowed: boolean;
  fullAccess: boolean;
  /** 결제선생으로 바로 발급할 수 있는지 (결제선생 연결) */
  providerIssue: boolean;
  summary: string;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const canRegister = allowed && (!receipt || receipt.status === "CANCELED");
  const requested = receipt?.status === "REQUESTED";
  const issued = receipt?.status === "ISSUED";

  if (!canRegister && !requested && !(issued && fullAccess)) return null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-x1">
        {canRegister && (
          <Button variant="outline" size="xs" onClick={() => setMode("request")}>
            {receipt ? "다시 등록" : "신청 등록"}
          </Button>
        )}
        {requested && (
          <Button variant="outline" size="xs" onClick={() => setMode("request")}>
            수정
          </Button>
        )}
        {requested && fullAccess && providerIssue && (
          <Button size="xs" onClick={() => setMode("providerIssue")}>
            결제선생으로 발급
          </Button>
        )}
        {requested && fullAccess && !providerIssue && (
          <>
            <Button variant="outline" size="xs" onClick={() => copyText(receipt.identifier, "발급 번호를 복사했어요. 홈택스에 붙여 넣어 주세요")}>
              번호 복사
            </Button>
            <Button size="xs" onClick={() => setMode("issue")}>
              발급 완료 처리
            </Button>
          </>
        )}
        {(requested || issued) && fullAccess && (
          <Button variant="ghost" size="xs" className="text-fg-critical" onClick={() => setMode("cancel")}>
            취소
          </Button>
        )}
      </div>

      {mode === "request" && (
        <CashReceiptRequestDialog
          paymentId={paymentId}
          receipt={receipt}
          fullAccess={fullAccess}
          summary={summary}
          onClose={() => setMode(null)}
          onDone={onDone}
        />
      )}
      {mode === "issue" && receipt && (
        <CashReceiptIssueDialog receiptId={receipt.id} summary={summary} onClose={() => setMode(null)} onDone={onDone} />
      )}
      {mode === "providerIssue" && receipt && (
        <CashReceiptProviderIssueDialog receipt={receipt} summary={summary} onClose={() => setMode(null)} onDone={onDone} />
      )}
      {mode === "cancel" && receipt && (
        <CashReceiptCancelDialog
          receiptId={receipt.id}
          issued={issued}
          viaProvider={receipt.viaProvider}
          summary={summary}
          onClose={() => setMode(null)}
          onDone={onDone}
        />
      )}
    </>
  );
}

/** 영수증 금액 표기 — 과세면 공급가액·세액을 덧붙인다 */
export function cashReceiptAmountText(receipt: Pick<AdminCashReceiptInfo, "amount" | "supplyAmount" | "taxAmount">): string {
  return receipt.taxAmount > 0
    ? `${won(receipt.amount)} (공급가액 ${won(receipt.supplyAmount)} · 세액 ${won(receipt.taxAmount)})`
    : won(receipt.amount);
}
