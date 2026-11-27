"use client";

// 환불 — 원장급 전용 (버튼을 띄우는 쪽과 서버 액션이 권한을 확인한다).
// 금액은 설정한 계산 방식으로 제안만 하고 운영진이 확인·수정해 확정한다. 실제 한도·중복 검증은 코어가 다시 한다.
//  · 온라인 결제 → 결제사 취소. 가상계좌로 낸 경우 돌려받을 계좌가 필요하다 (저장하지 않고 결제사에 전달만).
//  · 현장 결제 → 단말기·계좌로 직접 돌려준 뒤 기록만 남긴다.

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { DescriptionList, FormField, Notice } from "@/components/backoffice/ui";
import { refundTuition } from "@/actions/tuition";
import type { AdminInvoiceDetail, AdminPaymentDetail } from "@/lib/tuition/admin-data";
import {
  addDays,
  dateKey,
  parseDateKey,
  suggestRefund,
  type TuitionRefundPolicyValue,
} from "@/lib/tuition/calc";
import type { RefundOutcome, RequestRefundInput } from "@/lib/tuition/core";
import { dotDate, periodLabel, REFUND_POLICY_LABEL, won } from "@/lib/tuition/format";
import { cn } from "@/lib/utils";
import { RefundBreakdown } from "./refund-breakdown";
import { callTuition, MoneyInput, toAmount } from "./shared";

type PeriodMode = "LAST_USED" | "BEFORE_USE" | "KEEP";

const MODE_OPTIONS: { value: PeriodMode; label: string; hint: string }[] = [
  { value: "LAST_USED", label: "마지막 이용일 지정", hint: "그날까지 이용한 것으로 보고 이용 기간을 줄여요" },
  { value: "BEFORE_USE", label: "이용 전 환불", hint: "하루도 이용하지 않은 것으로 처리해요" },
  { value: "KEEP", label: "이용 기간 유지", hint: "이용 기간은 그대로 두고 금액만 돌려줘요" },
];

export function RefundDialog({
  detail,
  payment,
  refundPolicy,
  onClose,
  onDone,
}: {
  detail: AdminInvoiceDetail;
  /** 환불할 결제 — 납부로 확정된 결제, 또는 아직 돈을 돌려주지 못한 중복 결제 */
  payment: AdminPaymentDetail;
  refundPolicy: TuitionRefundPolicyValue;
  onClose: () => void;
  /** 환불 요청이 들어가 상세·목록을 다시 불러와야 할 때 */
  onDone: () => void;
}) {
  const { invoice, student } = detail;
  const [pending, startTransition] = useTransition();

  // 중복 결제는 청구서의 납부가 아니다 — 이용 기간과 무관하게 받은 돈을 그대로 돌려준다
  const duplicate = payment.isDuplicate && !payment.isAccepted;
  const onsite = payment.method !== "LINK";
  const refundable = payment.refundable;

  const today = parseDateKey(detail.today) as Date;
  const periodStart = parseDateKey(invoice.periodStart) as Date;
  const periodEnd = parseDateKey(invoice.periodEnd) as Date;
  // 지금 남아 있는 이용 기간의 끝 (앞선 환불로 당겨졌을 수 있다). null 이면 남은 이용 기간이 없다
  const coverageEnd = invoice.coverageEnd ? parseDateKey(invoice.coverageEnd) : null;
  const canAdjustPeriod = !duplicate && coverageEnd !== null && coverageEnd.getTime() >= periodStart.getTime();
  const maxLastUsed = canAdjustPeriod ? (coverageEnd as Date) : periodEnd;
  const yesterday = addDays(today, -1);
  const notStarted = yesterday.getTime() < periodStart.getTime();

  const [mode, setMode] = useState<PeriodMode>(!canAdjustPeriod ? "KEEP" : notStarted ? "BEFORE_USE" : "LAST_USED");
  // 기본 마지막 이용일 = 어제 (이용 기간 밖이면 기간 안으로 당긴다)
  const [lastUsed, setLastUsed] = useState(
    dateKey(
      yesterday.getTime() < periodStart.getTime()
        ? periodStart
        : yesterday.getTime() > maxLastUsed.getTime()
          ? maxLastUsed
          : yesterday,
    ),
  );
  // null = 제안 금액을 따라간다. 직접 고치면 그 값을 유지한다
  const [amountInput, setAmountInput] = useState<string | null>(null);
  const [reason, setReason] = useState(duplicate ? "중복 결제 환불" : "");
  const [bank, setBank] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [holderName, setHolderName] = useState("");
  const [manualConfirmed, setManualConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<(RefundOutcome & { amount: number }) | null>(null);

  const lastUsedDate = parseDateKey(lastUsed);
  const lastUsedValid =
    lastUsedDate !== null &&
    lastUsedDate.getTime() >= periodStart.getTime() &&
    lastUsedDate.getTime() <= maxLastUsed.getTime();

  const suggestion =
    mode === "KEEP" || (mode === "LAST_USED" && !lastUsedValid)
      ? null
      : suggestRefund({
          policy: refundPolicy,
          paidAmount: payment.paidAmount,
          refundable,
          periodStart,
          periodEnd,
          months: invoice.months,
          monthlyFee: invoice.monthlyFee,
          lastUsedDate: mode === "BEFORE_USE" ? null : lastUsedDate,
        });
  // 학원법 규정: 반환 사유 발생일(마지막 이용 다음 날, 이용 전이면 오늘)로부터 5일 이내 반환
  const returnBy =
    refundPolicy !== "ACADEMY_LAW" || !suggestion
      ? null
      : addDays(mode === "LAST_USED" && lastUsedDate ? addDays(lastUsedDate, 1) : today, 5);
  // 제안이 0원이면(직접 입력 방식·환불 대상 기간 없음) 칸을 비워 운영진이 직접 넣게 한다
  const suggestedDigits = duplicate ? String(refundable) : suggestion && suggestion.amount > 0 ? String(suggestion.amount) : "";
  const amountDigits = amountInput ?? suggestedDigits;
  const amount = toAmount(amountDigits);

  // 전액 취소만 되는 결제사: 한 번도 환불하지 않은 결제를 전액 그대로 돌릴 때만 결제사 취소가 되고,
  // 그 밖의 금액은 직접 돌려준 뒤 기록만 남긴다 (서버 규칙과 같다 — 금액을 고치면 바로 바뀐다)
  const partialManual =
    !onsite && payment.fullCancelOnly && !(payment.refundedAmount === 0 && amount === payment.paidAmount);
  const fullProviderCancel = !onsite && payment.fullCancelOnly && !partialManual;
  const manual = onsite || partialManual;
  const needsAccount = !manual && (payment.providerMethod ?? "").includes("가상계좌");

  const amountError =
    amount === null
      ? null
      : amount < 1
        ? "환불 금액은 1원 이상이어야 해요"
        : amount > refundable
          ? `환불 가능 금액(${won(refundable)})을 넘었어요`
          : null;
  const accountReady = !needsAccount || (bank.trim() !== "" && accountNumber.trim() !== "" && holderName.trim() !== "");
  const canSubmit =
    !pending &&
    refundable > 0 &&
    amount !== null &&
    amountError === null &&
    reason.trim() !== "" &&
    (mode !== "LAST_USED" || lastUsedValid) &&
    accountReady &&
    (!manual || manualConfirmed);

  function submit() {
    if (!canSubmit || amount === null) return;
    const adjusted = suggestion !== null && amount !== suggestion.amount;
    const input: RequestRefundInput = {
      invoiceId: invoice.id,
      amount,
      reason: reason.trim(),
      calcBasis: duplicate
        ? "중복 결제 환불"
        : suggestion
          ? `${suggestion.basis}${adjusted ? " · 운영진 조정" : ""}`
          : "이용 기간 유지 — 금액 직접 입력",
    };
    // 납부로 확정된 결제는 코어가 알아서 찾는다. 중복 결제를 환불할 때만 결제를 지정한다
    if (duplicate) input.paymentId = payment.id;
    // 생략 = 이용 기간 유지 · null = 이용 전 환불
    if (!duplicate && mode === "LAST_USED") input.lastUsedDate = lastUsed;
    if (!duplicate && mode === "BEFORE_USE") input.lastUsedDate = null;
    if (needsAccount) {
      input.refundAccount = {
        bank: bank.trim(),
        accountNumber: accountNumber.trim(),
        holderName: holderName.trim(),
      };
    }
    if (manual) input.manualConfirmed = true;

    setError(null);
    startTransition(async () => {
      const res = await callTuition(() => refundTuition(input));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOutcome({ status: res.data.status, failMessage: res.data.failMessage, amount });
      onDone();
    });
  }

  if (outcome) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {outcome.status === "DONE" ? "환불 완료" : outcome.status === "PENDING" ? "환불 처리 중" : "환불 실패"}
            </DialogTitle>
            <DialogDescription>
              {student.name} 학생 · {invoice.title} · {won(outcome.amount)}
            </DialogDescription>
          </DialogHeader>
          {outcome.status === "DONE" && (
            <Notice tone="ok">
              {manual
                ? "직접 환불한 내역을 기록했어요."
                : "결제사 취소가 끝났어요. 카드 환불은 카드사에 따라 며칠 걸릴 수 있어요."}
            </Notice>
          )}
          {outcome.status === "PENDING" && (
            <Notice tone="info">결제사 처리 중 — 잠시 후 자동으로 반영됩니다. 같은 환불을 다시 요청하지 마세요.</Notice>
          )}
          {outcome.status === "FAILED" && (
            <Notice tone="bad" title="환불되지 않았어요">
              {outcome.failMessage ?? "결제사가 환불을 처리하지 못했어요. 내용을 확인한 뒤 다시 시도해 주세요."}
            </Notice>
          )}
          <DialogFooter>
            <Button onClick={onClose}>확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{duplicate ? "중복 결제 환불" : "환불"}</DialogTitle>
          <DialogDescription>
            {student.name} 학생 · {invoice.title} · {periodLabel(invoice.periodStart, invoice.periodEnd)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-x5">
          <div className="rounded-r3 bg-bg-layer-fill px-x4 py-x3">
            <DescriptionList
              cols={2}
              items={[
                { label: "납부 금액", value: <span className="t4-bold tabular-nums">{won(payment.paidAmount)}</span> },
                {
                  label: "환불 가능 금액",
                  value: <span className="t4-bold tabular-nums">{won(refundable)}</span>,
                },
                { label: "결제 방법", value: payment.methodLabel },
                {
                  label: "이미 환불",
                  value: (
                    <span className="tabular-nums">
                      {won(payment.refundedAmount)}
                      {payment.pendingRefundAmount > 0 && ` · 처리 중 ${won(payment.pendingRefundAmount)}`}
                    </span>
                  ),
                },
              ]}
            />
          </div>

          {!duplicate && (
            <fieldset className="flex flex-col gap-x2">
              <legend className="mb-x2 t4-medium text-fg-neutral">이용 기간</legend>
              {MODE_OPTIONS.map((option) => {
                const selected = mode === option.value;
                const disabled = option.value !== "KEEP" && !canAdjustPeriod;
                return (
                  <label
                    key={option.value}
                    className={cn(
                      "rounded-r2 px-x4 py-x3 transition-colors",
                      "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-stroke-focus-ring",
                      disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                      selected
                        ? "bg-bg-layer-fill shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-contrast)]"
                        : "bg-bg-layer-default shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)]",
                      !selected && !disabled && "hover:bg-bg-layer-default-pressed",
                    )}
                  >
                    <input
                      type="radio"
                      name="tuition-refund-period"
                      value={option.value}
                      checked={selected}
                      disabled={disabled || pending}
                      onChange={() => {
                        setMode(option.value);
                        // 기준이 바뀌면 제안 금액부터 다시 보여 준다
                        setAmountInput(null);
                      }}
                      className="sr-only"
                    />
                    <span className="block t4-bold text-fg-neutral">{option.label}</span>
                    <span className="mt-x0_5 block t3-regular text-fg-neutral-subtle">{option.hint}</span>
                    {option.value === "LAST_USED" && selected && (
                      <span className="mt-x2 flex flex-wrap items-center gap-x2">
                        <DatePicker
                          aria-label="마지막 이용일"
                          value={lastUsed || null}
                          min={invoice.periodStart}
                          max={dateKey(maxLastUsed)}
                          disabled={pending}
                          invalid={!lastUsedValid}
                          onChange={(value) => {
                            setLastUsed(value ?? "");
                            setAmountInput(null);
                          }}
                          className="w-44"
                        />
                        <span className="t3-regular text-fg-neutral-subtle">
                          {dotDate(invoice.periodStart)} ~ {dotDate(dateKey(maxLastUsed))} 안에서 골라 주세요
                        </span>
                      </span>
                    )}
                  </label>
                );
              })}
              {!canAdjustPeriod && (
                <p className="t3-regular text-fg-neutral-subtle">
                  앞선 환불로 남은 이용 기간이 없어 금액만 환불할 수 있어요.
                </p>
              )}
            </fieldset>
          )}

          {!duplicate && suggestion && (
            <RefundBreakdown suggestion={suggestion} policy={refundPolicy} returnBy={returnBy} />
          )}

          <FormField
            label="환불 금액"
            htmlFor="tuition-refund-amount"
            required
            error={amountError}
            hint={
              duplicate
                ? "중복으로 받은 금액 전부를 돌려줘요."
                : suggestion
                  ? suggestion.lines.length > 0
                    ? `${REFUND_POLICY_LABEL[refundPolicy]} 제안 ${won(suggestion.amount)} — 어떻게 계산했는지는 위 계산 과정에서 볼 수 있어요. 고치면 ‘운영진 조정’으로 기록돼요.`
                    : `${REFUND_POLICY_LABEL[refundPolicy]} — 금액을 직접 입력해 주세요.`
                  : mode === "KEEP"
                    ? "이용 기간을 바꾸지 않으므로 금액을 직접 입력해 주세요."
                    : "마지막 이용일을 이용 기간 안에서 골라 주세요."
            }
          >
            <div className="flex items-center gap-x2">
              <MoneyInput
                id="tuition-refund-amount"
                value={amountDigits}
                onValueChange={setAmountInput}
                disabled={pending}
                aria-invalid={amountError !== null}
                placeholder="0"
                className="w-44"
              />
              <span className="t4-regular text-fg-neutral-subtle">원</span>
              {suggestion && amountInput !== null && amountInput !== suggestedDigits && (
                <Button variant="ghost" size="xs" onClick={() => setAmountInput(null)} disabled={pending}>
                  제안 금액으로
                </Button>
              )}
            </div>
          </FormField>

          <FormField label="환불 사유" htmlFor="tuition-refund-reason" required hint="환불 기록에 남아요.">
            <Input
              id="tuition-refund-reason"
              value={reason}
              maxLength={300}
              disabled={pending}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: 11월 15일 퇴실"
            />
          </FormField>

          {needsAccount && (
            <fieldset className="flex flex-col gap-x3">
              <legend className="mb-x2 t4-medium text-fg-neutral">
                환불 계좌<span className="ml-x0_5 text-fg-brand">*</span>
              </legend>
              <p className="-mt-x1 t3-regular text-fg-neutral-subtle">
                가상계좌로 낸 결제라 돌려받을 계좌가 필요해요. 결제사에 전달만 하고 저장하지 않아요.
              </p>
              <div className="grid grid-cols-1 gap-x3 sm:grid-cols-3">
                <Input
                  aria-label="은행"
                  value={bank}
                  maxLength={30}
                  disabled={pending}
                  onChange={(e) => setBank(e.target.value)}
                  placeholder="은행"
                />
                <Input
                  aria-label="계좌번호"
                  value={accountNumber}
                  maxLength={30}
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={pending}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="계좌번호"
                  className="tabular-nums"
                />
                <Input
                  aria-label="예금주"
                  value={holderName}
                  maxLength={30}
                  disabled={pending}
                  onChange={(e) => setHolderName(e.target.value)}
                  placeholder="예금주"
                />
              </div>
            </fieldset>
          )}

          {fullProviderCancel && (
            <Notice tone="info">
              전액을 환불하면 결제사를 통해 결제가 통째로 취소돼요. 취소하면 되돌릴 수 없어요.
            </Notice>
          )}

          {partialManual && (
            <Notice tone="warn" title="직접 환불로 기록돼요">
              이 결제사는 결제 전체만 취소할 수 있어요. 일부 금액은 계좌이체 등으로 학부모에게 직접 돌려준 뒤 여기에는
              기록만 남겨요.
            </Notice>
          )}

          {manual && (
            <label className="flex cursor-pointer items-start gap-x2 rounded-r3 bg-bg-layer-fill px-x4 py-x3">
              <Checkbox
                checked={manualConfirmed}
                disabled={pending}
                onCheckedChange={(checked) => setManualConfirmed(checked === true)}
                className="mt-x0_5"
              />
              <span>
                <span className="block t4-medium text-fg-neutral">
                  {onsite ? "단말기·계좌로 환불을 완료했습니다" : "계좌이체 등으로 직접 환불을 완료했습니다"}
                </span>
                <span className="mt-x0_5 block t3-regular text-fg-neutral-subtle">
                  {onsite
                    ? "현장 결제는 여기서 돈이 나가지 않아요. 직접 돌려준 뒤 체크해 기록을 남겨 주세요."
                    : "여기서는 돈이 나가지 않아요. 학부모에게 직접 돌려준 뒤 체크해 기록을 남겨 주세요."}
                </span>
              </span>
            </label>
          )}

          {error && <Notice tone="bad">{error}</Notice>}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            취소
          </Button>
          <Button variant="destructive" onClick={submit} disabled={!canSubmit}>
            {pending ? "환불 중…" : amount !== null && amountError === null ? `${won(amount)} 환불` : "환불"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
