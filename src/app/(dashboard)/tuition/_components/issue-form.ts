// 청구서 발행 입력값 — "청구 예정" 표와 "청구서 발행" 다이얼로그가 같은 계산을 쓴다.
// 여기 계산은 화면 미리보기용이다. 실제 금액·기간·겹침 검증은 발행할 때 코어가 다시 한다.

import {
  addDays,
  calcInvoiceAmount,
  calendarPeriodEnd,
  dateKey,
  MAX_EXTRA_ITEM_NAME,
  parseDateKey,
  periodEndFor,
  type ProratedCharge,
  type TuitionExtraItem,
} from "@/lib/tuition/calc";
import type { IssueInvoiceInput } from "@/lib/tuition/core";

/** 입력 중인 값 — 금액은 숫자만 든 문자열 (비어 있을 수 있다) */
export type IssueDraft = {
  periodStart: string;
  /** 첫 달 일할(청구 일정이 계산한 값) — 있으면 이용 기간은 달력 기준이고 시작일·개월 수는 고정 */
  prorated?: ProratedCharge;
  months: number;
  monthlyFee: string;
  discount: string;
  dueDate: string;
};

/** 추가 항목 입력 한 줄 — 금액은 숫자만 든 문자열. id 는 목록 key 용 */
export type ExtraRowDraft = { id: string; name: string; amount: string };

let extraRowSeq = 0;
export function newExtraRow(): ExtraRowDraft {
  extraRowSeq += 1;
  return { id: `extra-${extraRowSeq}`, name: "", amount: "" };
}

/**
 * 추가 항목 입력 → 발행 요청에 실을 목록. 이름·금액이 모두 빈 줄은 무시하고,
 * 한쪽만 채운 줄은 발행을 막는다 (조용히 버리면 청구서에 교재비가 빠진 채 나가므로).
 */
export function evaluateExtraRows(
  rows: ExtraRowDraft[],
): { ok: true; items: TuitionExtraItem[] } | { ok: false; error: string } {
  const items: TuitionExtraItem[] = [];
  for (const row of rows) {
    const name = row.name.trim();
    if (!name && row.amount === "") continue;
    if (!name) return { ok: false, error: "금액을 입력한 추가 항목에 이름을 적어 주세요" };
    if (name.length > MAX_EXTRA_ITEM_NAME) {
      return { ok: false, error: `추가 항목 이름은 ${MAX_EXTRA_ITEM_NAME}자 이내로 적어 주세요` };
    }
    if (row.amount === "" || Number(row.amount) <= 0) {
      return { ok: false, error: `‘${name}’ 금액을 입력해 주세요` };
    }
    items.push({ name, amount: Number(row.amount) });
  }
  return { ok: true, items };
}

export type IssueDraftResult =
  | {
      ok: true;
      periodEnd: string;
      monthlyFee: number;
      discount: number;
      amount: number;
      /** 수강료 합 (일할 첫 달 + 나머지 달) */
      tuition: number;
      extraTotal: number;
    }
  | { ok: false; periodEnd: string | null; error: string; feeMissing: boolean };

export function defaultIssueDraft(input: {
  periodStart: string;
  /** 개월 수 (일할 달 포함, 기본 1) */
  months?: number;
  /** 첫 달 일할 */
  prorated?: ProratedCharge | null;
  monthlyFee: number | null;
  today: string;
  dueDays: number;
}): IssueDraft {
  const today = parseDateKey(input.today);
  return {
    periodStart: input.periodStart,
    ...(input.prorated ? { prorated: input.prorated } : {}),
    months: input.months ?? 1,
    monthlyFee: input.monthlyFee === null ? "" : String(input.monthlyFee),
    discount: "",
    dueDate: today ? dateKey(addDays(today, input.dueDays)) : input.today,
  };
}

export function evaluateIssueDraft(draft: IssueDraft, extraItems: TuitionExtraItem[] = []): IssueDraftResult {
  const start = parseDateKey(draft.periodStart);
  const periodEnd = start
    ? dateKey(draft.prorated ? calendarPeriodEnd(start, draft.months) : periodEndFor(start, draft.months))
    : null;
  if (!start) return { ok: false, periodEnd, error: "이용 시작일을 확인해 주세요", feeMissing: false };
  if (draft.monthlyFee === "") {
    return { ok: false, periodEnd, error: "월 수강료를 입력해 주세요", feeMissing: true };
  }
  const amount = calcInvoiceAmount({
    monthlyFee: Number(draft.monthlyFee),
    months: draft.months,
    discount: draft.discount === "" ? 0 : Number(draft.discount),
    extraItems,
    prorated: draft.prorated,
  });
  if (!amount.ok) return { ok: false, periodEnd, error: amount.error, feeMissing: false };
  if (!parseDateKey(draft.dueDate)) {
    return { ok: false, periodEnd, error: "납부 기한을 확인해 주세요", feeMissing: false };
  }
  return {
    ok: true,
    periodEnd: periodEnd as string,
    monthlyFee: Number(draft.monthlyFee),
    discount: amount.discount,
    amount: amount.amount,
    tuition: amount.tuition,
    extraTotal: amount.extraTotal,
  };
}

/**
 * 개월 수를 바꿀 때의 월 수강료 — 세 달 선등록으로 바꾸면 할인 금액, 되돌리면 정상 금액.
 * 운영진이 금액을 직접 고쳐 둔 경우(두 기본값 어느 쪽도 아니면)는 그대로 둔다.
 */
export function feeForMonths(
  currentFee: string,
  months: number,
  fees: { monthlyFee: number; prepayMonthlyFee: number; prepayMonths: number },
): string {
  const defaults = [String(fees.monthlyFee), String(fees.prepayMonthlyFee)];
  if (currentFee !== "" && !defaults.includes(currentFee)) return currentFee;
  return String(months >= fees.prepayMonths ? fees.prepayMonthlyFee : fees.monthlyFee);
}

/** 검증을 통과한 입력값 → 발행 요청 */
export function toIssueInput(
  studentId: string,
  draft: IssueDraft,
  evaluated: Extract<IssueDraftResult, { ok: true }>,
  options: {
    notify: boolean;
    memo?: string | null;
    extraItems?: TuitionExtraItem[];
    parentMessage?: string | null;
  },
): IssueInvoiceInput {
  return {
    studentId,
    periodStart: draft.periodStart,
    months: draft.months,
    prorated: draft.prorated ?? null,
    monthlyFee: evaluated.monthlyFee,
    discount: evaluated.discount,
    dueDate: draft.dueDate,
    extraItems: options.extraItems ?? [],
    parentMessage: options.parentMessage ?? null,
    memo: options.memo ?? null,
    notify: options.notify,
  };
}

export const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);
