"use client";

// 수강료 어드민 화면 공용 조각 — 표시 서식, 서버 액션 호출 래퍼, 여러 탭이 같이 쓰는 셀·배지.

import type { ComponentProps } from "react";
import { toast } from "sonner";
import { StatusBadge, type Tone } from "@/components/backoffice/ui";
import { Input, inputBaseClass } from "@/components/ui/input";
import type { AdminInvoiceRow, AdminTuitionStudentRef } from "@/lib/tuition/admin-data";
import type { TuitionDisplayStatus } from "@/lib/tuition/calc";
import { CASH_RECEIPT_STATUS_LABEL, INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, monthDay } from "@/lib/tuition/format";
import type { TuitionResult } from "@/lib/tuition/types";
import { cn } from "@/lib/utils";

/**
 * 열이 많은 표의 칸 여백 — 사이드바를 편 1280px 화면(본문 약 976px)에서 가로로 넘치지 않게 줄인다.
 * 표 기본 여백(px-x4)과 같은 속성이라 tailwind-merge 가 정리하지 못한다. 그래서 !(important)로 덮는다.
 */
export const DENSE_CELL = "!px-x3 first:!pl-x4 last:!pr-x4";

/** "2026-11-01", "2026-11-30" → "26.11.01 ~ 26.11.30" — 목록용 짧은 기간 */
export function shortPeriod(startKey: string, endKey: string): string {
  const short = (key: string) => key.slice(2).replaceAll("-", ".");
  return `${short(startKey)} ~ ${short(endKey)}`;
}

/** 네이티브 select 를 SEED TextInput 규격으로 */
export const nativeSelectClass = cn("h-10 border-0 pr-x2", inputBaseClass);

const KST = "Asia/Seoul";

/** "10. 25. 14:03" — 목록용 짧은 시각 */
export function shortDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: KST,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** "2026. 10. 25. 14:03" — 상세용 */
export function fullDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: KST,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** "10. 25." — 날짜만 */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { timeZone: KST, month: "numeric", day: "numeric" });
}

// ─── 금액 입력 ─────────────────────────────────────────────────────────

export function digitsOnly(text: string): string {
  return text.replace(/\D/g, "");
}

/** 숫자 문자열 → 정수. 비어 있으면 null */
export function toAmount(digits: string): number | null {
  return digits === "" ? null : Number(digits);
}

/** 금액 입력칸 — 값은 숫자만 든 문자열로 들고, 보여 줄 때만 천 단위 쉼표를 찍는다 */
export function MoneyInput({
  value,
  onValueChange,
  className,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: string;
  onValueChange: (digits: string) => void;
}) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value === "" ? "" : Number(value).toLocaleString("ko-KR")}
      // 9자리(억 단위)까지 — 청구 금액 상한과 같다
      onChange={(e) => onValueChange(digitsOnly(e.target.value).replace(/^0+(?=\d)/, "").slice(0, 9))}
      className={cn("text-right tabular-nums", className)}
    />
  );
}

// ─── 서버 액션 호출 ────────────────────────────────────────────────────

/**
 * 서버 액션 호출. 업무 오류는 TuitionResult 로 오지만, 권한이 바뀌었거나 연결이 끊기면 throw 로 온다.
 * 화면은 한 가지 형태만 다루도록 여기서 결과로 바꾼다.
 */
export async function callTuition<T>(action: () => Promise<TuitionResult<T>>): Promise<TuitionResult<T>> {
  try {
    return await action();
  } catch {
    return { ok: false, code: "INTERNAL", error: "처리하지 못했습니다. 권한이나 연결 상태를 확인해 주세요" };
  }
}

/**
 * 발행 완료 알림. 목록은 납부 기한이 든 달 기준이라, 기한이 다른 달인 청구서는 지금 보는 목록에 나타나지 않는다 —
 * 발행하고도 안 보여 당황하지 않게 그 달로 가는 버튼을 함께 띄운다.
 */
export function toastIssued(input: {
  issued: number;
  dueDates: string[];
  ym: string;
  onGoToMonth: (ym: string) => void;
}): void {
  const title = `청구서 ${input.issued}건을 발행했어요`;
  const otherMonth = [...new Set(input.dueDates.map((d) => d.slice(0, 7)))].filter((m) => m !== input.ym).sort()[0];
  if (!otherMonth) {
    toast.success(title);
    return;
  }
  const month = `${Number(otherMonth.slice(5, 7))}월`;
  toast.success(title, {
    description: `납부 기한이 ${month}인 청구서는 ${month} 목록에서 볼 수 있어요.`,
    action: { label: `${month} 보기`, onClick: () => input.onGoToMonth(otherMonth) },
    duration: 8000,
  });
}

export async function copyText(text: string, successMessage: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
  } catch {
    toast.error("복사하지 못했어요. 브라우저의 클립보드 권한을 확인해 주세요");
  }
}

// ─── 셀 · 배지 ─────────────────────────────────────────────────────────

export function StudentCell({ student }: { student: Pick<AdminTuitionStudentRef, "name" | "grade"> & { seat?: string | null; status?: string } }) {
  return (
    <div className="min-w-0">
      <p className="whitespace-nowrap t4-medium text-fg-neutral">
        {student.name}
        {student.status && student.status !== "ACTIVE" && (
          <span className="ml-x1 t3-regular text-fg-neutral-subtle">(퇴실)</span>
        )}
      </p>
      <p className="mt-x0_5 whitespace-nowrap t3-regular text-fg-neutral-subtle">
        {student.grade}
        {student.seat ? ` · ${student.seat}번` : ""}
      </p>
    </div>
  );
}

/** 납부 기한 + 남은 일수. 결제 요청 상태일 때만 D-day·연체를 붙인다 */
export function DueCell({ dueDate, daysToDue, open }: { dueDate: string; daysToDue: number; open: boolean }) {
  return (
    <div className="whitespace-nowrap">
      <p className="t4-regular text-fg-neutral">{monthDay(dueDate)}</p>
      {open && (
        <p className={cn("mt-x0_5 t3-medium", daysToDue < 0 ? "text-fg-critical" : "text-fg-neutral-subtle")}>
          {dueLabel(daysToDue)}
        </p>
      )}
    </div>
  );
}

export function dueLabel(daysToDue: number): string {
  if (daysToDue < 0) return `연체 ${-daysToDue}일`;
  if (daysToDue === 0) return "오늘까지";
  return `D-${daysToDue}`;
}

/** 화면에서 보내는 안내 종류 — 기한 전이면 청구 안내, 지났으면 미납 안내 (서버가 만드는 안내문과 같은 기준) */
export function noticeKindFor(displayStatus: TuitionDisplayStatus): "REQUEST" | "REMIND" {
  return displayStatus === "OVERDUE" ? "REMIND" : "REQUEST";
}

export function InvoiceStatusBadge({ status }: { status: TuitionDisplayStatus }) {
  return <StatusBadge tone={INVOICE_STATUS_TONE[status]}>{INVOICE_STATUS_LABEL[status]}</StatusBadge>;
}

/** 상태 옆에 붙는 보조 배지 — 결제가 어디까지 진행됐는지, 운영진이 볼 것이 있는지 */
export function invoiceFlags(
  row: Pick<AdminInvoiceRow, "openPayment" | "attention">,
): { key: string; label: string; tone: Tone; title?: string }[] {
  const flags: { key: string; label: string; tone: Tone; title?: string }[] = [];
  if (row.openPayment?.onsite) flags.push({ key: "onsite", label: "현장 결제 신청", tone: "warn" });
  const link = row.openPayment?.link;
  if (link?.state === "DEPOSIT_WAITING") flags.push({ key: "deposit", label: "입금 대기", tone: "info" });
  if (link?.state === "CHECKOUT_STARTED") {
    flags.push({ key: "checkout", label: "결제 미완료", tone: "gray", title: "결제창을 열었지만 결제가 끝나지 않았어요" });
  }
  if (row.attention.length > 0) {
    flags.push({
      key: "attention",
      label: "확인 필요",
      tone: "bad",
      title: row.attention.map((a) => a.label).join(" · "),
    });
  }
  return flags;
}

export function InvoiceFlagBadges({ row }: { row: Pick<AdminInvoiceRow, "openPayment" | "attention"> }) {
  const flags = invoiceFlags(row);
  if (flags.length === 0) return null;
  return (
    <>
      {flags.map((flag) => (
        <span key={flag.key} title={flag.title}>
          <StatusBadge tone={flag.tone}>{flag.label}</StatusBadge>
        </span>
      ))}
    </>
  );
}

/**
 * 현금영수증 상태 배지. 기록이 없으면 "미등록", 발급 뒤 환불로 금액이 달라졌으면 "재발급 필요".
 * (신청 직후는 아직 홈택스에서 발급 전이라 "발급 필요"로 부른다)
 */
export function CashReceiptStatusBadge({
  receipt,
}: {
  receipt: { status: "REQUESTED" | "ISSUED" | "CANCELED"; stale: boolean } | null;
}) {
  if (!receipt) return <StatusBadge tone="gray">미등록</StatusBadge>;
  if (receipt.stale) return <StatusBadge tone="bad">재발급 필요</StatusBadge>;
  const tone: Tone = receipt.status === "REQUESTED" ? "warn" : receipt.status === "ISSUED" ? "ok" : "gray";
  return <StatusBadge tone={tone}>{CASH_RECEIPT_STATUS_LABEL[receipt.status]}</StatusBadge>;
}
