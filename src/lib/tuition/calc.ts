// 수강료 계산 — 금액 · 이용 기간 · 연체 · 환불 제안 · 안내 시점.
// 전부 순수 함수다 (DB·현재 시각 의존 없음 — "오늘"은 인자로 받는다). 서버·어드민 화면·테스트가 같이 쓴다.
// 날짜는 스키마의 @db.Date 와 같은 표현: KST 달력 날짜를 UTC 자정 Date 로 다룬다 (todayKST() 와 동일).

export type TuitionInvoiceStatusValue =
  | "REQUESTED"
  | "PAID"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "CANCELED";

/** 화면용 상태 — 연체(OVERDUE)는 저장하지 않고 납부 기한으로 계산한다 */
export type TuitionDisplayStatus = TuitionInvoiceStatusValue | "OVERDUE";

export type TuitionRefundPolicyValue = "DAILY" | "ACADEMY_LAW" | "MANUAL";

export type TuitionTaxTypeValue = "EXEMPT" | "TAXABLE";

/** 추가 청구 항목 (교재비 등) — 수강료 줄과 별도로 청구서에 붙는다 */
export type TuitionExtraItem = { name: string; amount: number };

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export const MAX_INVOICE_MONTHS = 12;
export const MIN_INVOICE_AMOUNT = 1_000;
export const MAX_INVOICE_AMOUNT = 100_000_000;
export const MAX_EXTRA_ITEMS = 10;
/** 청구서에 적는 학부모 안내 메시지 길이 */
export const MAX_PARENT_MESSAGE_LEN = 500;
export const MAX_EXTRA_ITEM_NAME = 40;

// ─── 날짜 ─────────────────────────────────────────────────────────────

export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → UTC 자정 Date. 형식이 틀리거나 달력에 없는 날짜면 null */
export function parseDateKey(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const d = new Date(`${key}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || dateKey(d) !== key) return null;
  return d;
}

/** 임의 시각 → 그 시각의 KST 달력 날짜 (UTC 자정) */
export function kstDateOf(at: Date): Date {
  return new Date(dateKey(new Date(at.getTime() + KST_OFFSET_MS)));
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** 달 더하기 — 말일을 넘으면 그 달 말일로 맞춘다 (1/31 + 1개월 = 2/28) */
export function addMonthsClamped(d: Date, months: number): Date {
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d.getUTCDate(), lastDay)),
  );
}

/** to - from (일). 같은 날이면 0 */
export function diffDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

/** 양 끝을 포함한 일수 */
export function daysInclusive(from: Date, to: Date): number {
  return diffDays(from, to) + 1;
}

/** 시작일부터 N개월 이용 기간의 마지막 날 (11/1 + 1개월 → 11/30, 11/15 + 3개월 → 2/14) */
export function periodEndFor(periodStart: Date, months: number): Date {
  return addDays(addMonthsClamped(periodStart, months), -1);
}

/** 그달 말일 */
export function monthEndOf(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

/** 달력 기준 이용 종료일 — 시작일이 속한 달부터 months 번째 달의 말일 (10/20 + 2개월 → 11/30) */
export function calendarPeriodEnd(periodStart: Date, months: number): Date {
  return new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + months, 0));
}

/** 일할 청구 — 첫 달만 days × dailyRate (월 수강료를 넘지 않게), 나머지 달은 월 수강료 */
export type ProratedCharge = { days: number; dailyRate: number };

/** 두 기간(양 끝 포함)이 하루라도 겹치는지 */
export function periodsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() <= bEnd.getTime() && bStart.getTime() <= aEnd.getTime();
}

// ─── 금액 ─────────────────────────────────────────────────────────────

export type InvoiceAmountResult =
  | { ok: true; tuition: number; extraTotal: number; gross: number; discount: number; amount: number }
  | { ok: false; error: string };

/**
 * 추가 청구 항목 정리 — 이름을 다듬고 금액이 양의 정수인지 본다.
 * DB(Json)에서 읽은 값도 같은 함수로 거르므로 unknown 을 받는다. 잘못된 줄이 하나라도 있으면 거절.
 */
export function normalizeExtraItems(
  raw: unknown,
): { ok: true; items: TuitionExtraItem[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, items: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "추가 항목을 확인해 주세요" };
  if (raw.length > MAX_EXTRA_ITEMS) {
    return { ok: false, error: `추가 항목은 ${MAX_EXTRA_ITEMS}개까지 넣을 수 있습니다` };
  }
  const items: TuitionExtraItem[] = [];
  for (const entry of raw) {
    const record = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
    const name = typeof record?.name === "string" ? record.name.trim() : "";
    const amount = record?.amount;
    if (!name) return { ok: false, error: "추가 항목의 이름을 입력해 주세요" };
    if (name.length > MAX_EXTRA_ITEM_NAME) {
      return { ok: false, error: `추가 항목 이름은 ${MAX_EXTRA_ITEM_NAME}자 이내로 입력해 주세요` };
    }
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
      return { ok: false, error: `'${name}' 금액을 확인해 주세요` };
    }
    items.push({ name, amount });
  }
  return { ok: true, items };
}

/** DB 에 저장된 추가 항목 읽기 — 형식이 어긋나 있으면 빈 목록 (화면 표시용) */
export function readExtraItems(raw: unknown): TuitionExtraItem[] {
  const parsed = normalizeExtraItems(raw);
  return parsed.ok ? parsed.items : [];
}

/** 청구 금액 = 월 수강료 × 개월 수 + 추가 항목 합 − 할인. 정수(원)만 받는다 */
export function calcInvoiceAmount(input: {
  monthlyFee: number;
  months: number;
  discount?: number;
  extraItems?: TuitionExtraItem[];
  /** 첫 달이 일할이면 (신규 입실 등) — months 에는 일할 달도 센다 */
  prorated?: ProratedCharge;
}): InvoiceAmountResult {
  const { monthlyFee, months } = input;
  const discount = input.discount ?? 0;
  if (!Number.isInteger(monthlyFee) || monthlyFee <= 0) {
    return { ok: false, error: "월 수강료를 확인해 주세요" };
  }
  if (!Number.isInteger(months) || months < 1 || months > MAX_INVOICE_MONTHS) {
    return { ok: false, error: `개월 수는 1~${MAX_INVOICE_MONTHS} 사이여야 합니다` };
  }
  if (!Number.isInteger(discount) || discount < 0) {
    return { ok: false, error: "할인 금액을 확인해 주세요" };
  }
  const { prorated } = input;
  if (
    prorated &&
    (!Number.isInteger(prorated.days) || prorated.days < 1 || !Number.isInteger(prorated.dailyRate) || prorated.dailyRate < 1)
  ) {
    return { ok: false, error: "일할 일수·일 단가를 확인해 주세요" };
  }
  const tuition = prorated
    ? Math.min(monthlyFee, prorated.days * prorated.dailyRate) + monthlyFee * (months - 1)
    : monthlyFee * months;
  const extraTotal = (input.extraItems ?? []).reduce((sum, item) => sum + item.amount, 0);
  const gross = tuition + extraTotal;
  const amount = gross - discount;
  if (amount < MIN_INVOICE_AMOUNT) {
    return { ok: false, error: `청구 금액은 ${MIN_INVOICE_AMOUNT.toLocaleString("ko-KR")}원 이상이어야 합니다` };
  }
  if (amount > MAX_INVOICE_AMOUNT) {
    return { ok: false, error: "청구 금액이 너무 큽니다" };
  }
  return { ok: true, tuition, extraTotal, gross, discount, amount };
}

/** 현금영수증 발급 구분 — 소득공제(개인) · 지출증빙(사업자) */
export type TuitionCashReceiptPurposeValue = "INCOME" | "EXPENSE";

/**
 * 현금영수증 발급 번호 확인 — 소득공제 = 휴대폰번호(10~11자리), 지출증빙 = 사업자등록번호(10자리).
 * 숫자만 남겨 돌려준다. 주민등록번호는 받지 않는다.
 */
export function normalizeCashReceiptIdentifier(
  purpose: TuitionCashReceiptPurposeValue,
  raw: string,
): { ok: true; identifier: string } | { ok: false; error: string } {
  const digits = typeof raw === "string" ? raw.replace(/[^0-9]/g, "") : "";
  if (purpose === "INCOME") {
    if (!/^01[016789]\d{7,8}$/.test(digits)) return { ok: false, error: "소득공제용 휴대폰번호를 확인해 주세요" };
    return { ok: true, identifier: digits };
  }
  if (!/^\d{10}$/.test(digits)) return { ok: false, error: "지출증빙용 사업자등록번호 10자리를 확인해 주세요" };
  return { ok: true, identifier: digits };
}

/**
 * 공급가액·세액 분리. 과세면 청구 금액에 부가세 10%가 포함된 것으로 본다 (11,000원 → 10,000 + 1,000).
 * 면세면 전액이 공급가액.
 */
export function splitTax(amount: number, taxType: TuitionTaxTypeValue): { supplyAmount: number; taxAmount: number } {
  if (taxType !== "TAXABLE" || amount <= 0) return { supplyAmount: Math.max(0, amount), taxAmount: 0 };
  const taxAmount = Math.floor(amount / 11);
  return { supplyAmount: amount - taxAmount, taxAmount };
}

// ─── 상태 ─────────────────────────────────────────────────────────────

/** 납부 기한이 지난 미납 청구서인지 (기한 당일은 연체가 아니다) */
export function isOverdue(
  invoice: { status: TuitionInvoiceStatusValue; dueDate: Date },
  today: Date,
): boolean {
  return invoice.status === "REQUESTED" && invoice.dueDate.getTime() < today.getTime();
}

export function invoiceDisplayStatus(
  invoice: { status: TuitionInvoiceStatusValue; dueDate: Date },
  today: Date,
): TuitionDisplayStatus {
  return isOverdue(invoice, today) ? "OVERDUE" : invoice.status;
}

/** 환불 가능 금액 = 납부액 − 환불 완료액 − 처리 중 환불액 */
export function refundableAmount(input: {
  paidAmount: number;
  refundedAmount: number;
  pendingRefundAmount: number;
}): number {
  return Math.max(0, input.paidAmount - input.refundedAmount - input.pendingRefundAmount);
}

// ─── 환불 제안 ─────────────────────────────────────────────────────────

/** 환불 계산 한 줄 — 학원법은 한 달 단위 구간마다, 일할은 전체 기간 한 줄 */
export type RefundLine = {
  /** "1개월차" 등. 한 달짜리 청구면 null */
  label: string | null;
  start: Date;
  end: Date;
  totalDays: number;
  /** 이 구간에서 이용한 일수 */
  usedDays: number;
  /** 이 구간 몫의 납부액 */
  share: number;
  /** FULL 시작 전 전액 · TWO_THIRDS 1/3 경과 전 · HALF 1/2 경과 전 · NONE 1/2 경과(또는 다 이용) · DAILY 남은 일수 비율 */
  rule: "FULL" | "TWO_THIRDS" | "HALF" | "NONE" | "DAILY";
  /** 절사 전 금액 */
  raw: number;
  /** 절사한 이 구간 환불액 */
  amount: number;
};

export type RefundSuggestion = {
  /** 제안 금액 (환불 가능액을 넘지 않는다) */
  amount: number;
  totalDays: number;
  usedDays: number;
  remainingDays: number;
  /** 계산 근거 — 환불 기록에 그대로 남긴다 */
  basis: string;
  /** 어떻게 계산했는지 — 환불 화면에 그대로 보여 준다 */
  lines: RefundLine[];
  /** 계산 합계가 환불 가능 금액보다 커서 깎였으면 깎기 전 합계 */
  cappedFrom: number | null;
  /** 계산한 금액이 법정 반환액보다 적어 법정 반환액으로 올렸으면 올리기 전 금액 */
  raisedFrom: number | null;
  /** 법정 반환액 — 시설 설정을 주지 않았거나 계산할 수 없으면 null */
  legal: LegalRefund | null;
};

/** 시설 종류 (교육청 등록 기준) — 법정 반환액 계산식이 다르다 */
export type FacilityKind = "STUDY_ROOM" | "ACADEMY";

/** 법정 반환액 계산에 쓰는 시설 설정 */
export type RefundFacility = {
  facilityKind: FacilityKind;
  /** 게시한 1일 교습비. null 이면 실제 납부액 ÷ 약정 일수로 본다 */
  postedDailyFee: number | null;
};

/** 법정 반환액 (환불 하한) — 학원법 시행령 별표 4 */
export type LegalRefund = {
  /** 이번 환불에서 돌려줘야 하는 최소 금액 — 앞선 환불을 빼고, 환불 가능 금액을 넘지 않는다 */
  amount: number;
  /** 앞선 환불을 빼기 전 법정 반환액 */
  total: number;
  basis: string;
};

type RefundPeriodInput = {
  paidAmount: number;
  refundable: number;
  periodStart: Date;
  periodEnd: Date;
  months: number;
  /** 청구서의 월 수강료 — 일할 첫 달이 있는 청구서에서 달마다 몫을 나눌 때 쓴다 */
  monthlyFee?: number;
  /** 마지막 이용일. null 이거나 이용 시작 전이면 이용하지 않은 것 */
  lastUsedDate: Date | null;
};

/** 1원 미만은 올린다 — 끝자리를 버리면 법정 반환액보다 적게 제안할 수 있다 (학원법 시행령 제18조·별표 4) */
function ceilWon(n: number): number {
  return Math.ceil(n - 1e-6);
}

const wonText = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 1/3 · 1/2 경과로 나누는 학원법 구간 — 딱 1/3 이 지난 날은 다음 구간 (30일 중 10일 → 1/2) */
function academyRule(usedDays: number, totalDays: number): "TWO_THIRDS" | "HALF" | "NONE" {
  if (usedDays * 3 < totalDays) return "TWO_THIRDS";
  if (usedDays * 2 < totalDays) return "HALF";
  return "NONE";
}

/**
 * 환불 제안 금액. 운영진이 확인·수정한 뒤 확정하므로 여기 값은 참고용이다.
 * lastUsedDate = 마지막 이용일. null 이거나 이용 시작 전이면 전액.
 * facility 를 주면 법정 반환액을 같이 계산하고, 자동 계산(일할·구간식) 제안이 그보다 적으면 법정 반환액으로 올린다.
 */
export function suggestRefund(
  input: RefundPeriodInput & { policy: TuitionRefundPolicyValue; facility?: RefundFacility },
): RefundSuggestion {
  const { policy, paidAmount, periodStart, periodEnd } = input;
  const refundable = Math.max(0, input.refundable);
  const totalDays = Math.max(1, daysInclusive(periodStart, periodEnd));
  const usedDays =
    input.lastUsedDate === null
      ? 0
      : Math.min(totalDays, Math.max(0, daysInclusive(periodStart, input.lastUsedDate)));
  const remainingDays = totalDays - usedDays;
  const legal = input.facility ? legalRefund({ ...input, ...input.facility }) : null;

  const finish = (lines: RefundLine[], basis: string): RefundSuggestion => {
    const total = lines.reduce((sum, line) => sum + line.amount, 0);
    const capped = Math.min(total, refundable);
    // 직접 입력 방식은 올리지 않는다 — 화면이 법정 반환액보다 적은 금액을 경고하고 서버가 확인을 받는다
    const raise = legal !== null && policy !== "MANUAL" && capped < legal.amount;
    return {
      amount: raise ? legal.amount : capped,
      totalDays,
      usedDays,
      remainingDays,
      basis: raise ? `${basis} · 법정 반환액으로 올림 ${wonText(legal.amount)}` : basis,
      lines,
      cappedFrom: total > refundable ? total : null,
      raisedFrom: raise ? capped : null,
      legal,
    };
  };
  const whole = (rule: RefundLine["rule"], raw: number, amount: number): RefundLine => ({
    label: null,
    start: periodStart,
    end: periodEnd,
    totalDays,
    usedDays,
    share: paidAmount,
    rule,
    raw,
    amount,
  });

  if (policy === "MANUAL") return finish([], "직접 입력 (자동 계산 없음)");
  if (usedDays === 0) return finish([whole("FULL", paidAmount, paidAmount)], "이용 시작 전 — 전액");

  if (policy === "DAILY") {
    const raw = (paidAmount * remainingDays) / totalDays;
    return finish(
      [whole("DAILY", raw, ceilWon(raw))],
      `일할 계산 — 전체 ${totalDays}일 중 ${usedDays}일 이용, 남은 ${remainingDays}일분`,
    );
  }

  const academy = academyLawLines(input, input.lastUsedDate as Date);
  return finish(academy.lines, academy.basis);
}

/** 월 단위 구간마다 이용한 일수 · 그 구간 몫의 납부액 */
type MonthSegment = { label: string | null; start: Date; end: Date; totalDays: number; usedDays: number; share: number };

/**
 * 이용 기간을 월 단위로 나눠 구간마다 몫을 정한다 (학원법 별표 4 비고 — 1개월 넘는 교습기간은 반환 사유가 생긴 달만
 * 기준대로, 나머지 달은 전액).
 *  · 일할 첫 달이 있는 청구서(달 중간 시작 + 말일 끝): 첫 구간은 시작일~그달 말일, 나머지 달 몫은 월 수강료,
 *    첫 달 몫은 그 나머지(할인·추가 항목도 여기에 붙는다).
 *  · 그 밖에는 시작일부터 한 달씩 같은 몫으로 나누고, 나누어 떨어지지 않는 원 단위는 마지막 달 몫에 붙인다.
 */
function monthSegmentsWithShare(input: RefundPeriodInput, lastUsed: Date): MonthSegment[] {
  const { paidAmount, periodStart, periodEnd } = input;
  const calendar = isCalendarProrated(periodStart, periodEnd, input.months) && input.monthlyFee !== undefined;
  const segments = calendar ? calendarSegments(periodStart, periodEnd) : monthSegments(periodStart, periodEnd, input.months);
  const share = Math.floor(paidAmount / segments.length);
  // 일할 첫 달 청구서의 나머지 달 몫 = 월 수강료 (낸 돈이 모자라면 그만큼만)
  const fullShare =
    segments.length > 1 ? Math.min(input.monthlyFee ?? 0, Math.floor(paidAmount / (segments.length - 1))) : 0;
  return segments.map((seg, index) => {
    const totalDays = daysInclusive(seg.start, seg.end);
    return {
      label: segments.length > 1 ? `${index + 1}개월차` : null,
      start: seg.start,
      end: seg.end,
      totalDays,
      usedDays: Math.min(totalDays, Math.max(0, daysInclusive(seg.start, lastUsed))),
      share: calendar
        ? index === 0
          ? paidAmount - fullShare * (segments.length - 1)
          : fullShare
        : index === segments.length - 1
          ? paidAmount - share * (segments.length - 1)
          : share,
    };
  });
}

/** 시작 전 달들 — "시작 전 N개월 전액 X원" */
function untouchedText(segments: { usedDays: number; share: number }[]): string {
  const untouched = segments.filter((seg) => seg.usedDays === 0);
  if (untouched.length === 0) return "";
  return `시작 전 ${untouched.length}개월 전액 ${wonText(untouched.reduce((sum, seg) => sum + seg.share, 0))}`;
}

/**
 * 학원법 구간식 — 이용 중인 달은 1/3 경과 전 2/3 · 1/2 경과 전 1/2 · 이후 없음, 아직 시작하지 않은 달은 전액.
 * 학원의 법정 반환 기준이기도 하다 (별표 4 제3호 가목 1).
 */
function academyLawLines(input: RefundPeriodInput, lastUsed: Date): { lines: RefundLine[]; basis: string } {
  const lines = monthSegmentsWithShare(input, lastUsed).map((seg): RefundLine => {
    if (seg.usedDays === 0) return { ...seg, rule: "FULL", raw: seg.share, amount: seg.share };
    const rule = seg.usedDays >= seg.totalDays ? "NONE" : academyRule(seg.usedDays, seg.totalDays);
    const raw = rule === "TWO_THIRDS" ? (seg.share * 2) / 3 : rule === "HALF" ? seg.share / 2 : 0;
    return { ...seg, rule, raw, amount: ceilWon(raw) };
  });

  const RULE_TEXT = { TWO_THIRDS: "1/3 경과 전 2/3", HALF: "1/2 경과 전 1/2", NONE: "1/2 경과 환불 없음" } as const;
  const current = lines.find((line) => line.usedDays > 0 && line.usedDays < line.totalDays);
  const parts = [
    current && current.rule !== "FULL" && current.rule !== "DAILY"
      ? `${current.label ? `${current.label} ` : ""}${current.totalDays}일 중 ${current.usedDays}일 이용(${RULE_TEXT[current.rule]}) ${wonText(current.amount)}`
      : "",
    untouchedText(lines),
  ].filter(Boolean);
  return { lines, basis: `학원법 구간식 — ${parts.join(" · ") || "환불 대상 기간 없음"}` };
}

/**
 * 독서실 법정 반환액 (별표 4 제3호 가목 2) — 납부액 − 1일 교습비 × 이용 일수(사용 시작일 ~ 그만둔 날 전날).
 * 반환 사유가 생긴 달만 이 식으로, 시작 전인 달은 전액, 다 이용한 달은 0.
 * 1일 교습비를 게시하지 않았으면 그 달 몫 ÷ 그 달 일수 (실제 납부액 기준 — 할인 전 정가를 쓰지 않는다).
 */
function studyRoomLegal(input: RefundPeriodInput, lastUsed: Date, postedDailyFee: number | null) {
  const segments = monthSegmentsWithShare(input, lastUsed);
  let total = 0;
  const parts: string[] = [];
  for (const seg of segments) {
    if (seg.usedDays === 0) total += seg.share;
    if (seg.usedDays === 0 || seg.usedDays >= seg.totalDays) continue;
    const left = seg.totalDays - seg.usedDays;
    const raw =
      postedDailyFee !== null ? seg.share - postedDailyFee * seg.usedDays : (seg.share * left) / seg.totalDays;
    const amount = Math.max(0, ceilWon(raw));
    total += amount;
    const label = seg.label ? `${seg.label} ` : "";
    parts.push(
      postedDailyFee !== null
        ? `${label}${wonText(seg.share)} − 게시 1일 ${wonText(postedDailyFee)} × ${seg.usedDays}일 = ${wonText(amount)}`
        : `${label}${seg.totalDays}일 중 ${seg.usedDays}일 이용, ${wonText(seg.share)} × 남은 ${left}일 ÷ ${seg.totalDays}일 = ${wonText(amount)}`,
    );
  }
  parts.push(untouchedText(segments));
  return { total, basis: `독서실 기준 — ${parts.filter(Boolean).join(" · ") || "반환 대상 기간 없음"}` };
}

/**
 * 법정 반환액 (환불 하한, 학원법 시행령 제18조 · 별표 4). 어느 환불 방식을 쓰든 이보다 적게 돌려주면 안 된다.
 *  · 독서실: 납부액 − 1일 교습비 × 이용 일수 (studyRoomLegal)
 *  · 학원: 학원법 구간식 (1/3 전 2/3 · 1/2 전 1/2 · 이후 없음)
 *  · 1개월을 넘으면 반환 사유가 생긴 달만 위 기준, 나머지 달은 전액. 1원 미만은 올린다.
 * lastUsedDate 를 모르면(undefined — 이용 기간 유지) 반환 사유 발생일을 알 수 없어 null.
 */
export function legalRefund(
  input: Omit<RefundPeriodInput, "lastUsedDate"> & RefundFacility & { lastUsedDate: Date | null | undefined },
): LegalRefund | null {
  const { lastUsedDate, paidAmount, periodStart } = input;
  if (lastUsedDate === undefined || input.periodEnd.getTime() < periodStart.getTime()) return null;
  const refundable = Math.max(0, input.refundable);
  const period = { ...input, lastUsedDate };
  let total = paidAmount;
  let basis = "이용 시작 전 — 전액";
  if (lastUsedDate !== null && lastUsedDate.getTime() >= periodStart.getTime()) {
    if (input.facilityKind === "ACADEMY") {
      const academy = academyLawLines(period, lastUsedDate);
      total = academy.lines.reduce((sum, line) => sum + line.amount, 0);
      basis = academy.basis;
    } else {
      ({ total, basis } = studyRoomLegal(period, lastUsedDate, input.postedDailyFee));
    }
  }
  // 앞서 돌려준(처리 중 포함) 금액은 이미 반환한 것으로 본다
  const alreadyReturned = paidAmount - refundable;
  return { amount: Math.min(refundable, Math.max(0, total - alreadyReturned)), total, basis };
}

/** 반환 기한 — 반환 사유가 생긴 날(그만둔 날 = 마지막 이용 다음 날, 이용 전이면 오늘)부터 5일 이내 (시행령 제18조 제3항) */
export function refundDueDate(lastUsedDate: Date | null, today: Date): Date {
  return addDays(lastUsedDate ? addDays(lastUsedDate, 1) : today, 5);
}

/** 일할 첫 달이 있는 청구서인지 — 달 중간에 시작해 달력 말일에 끝난다 (예전 방식의 "시작일부터 한 달" 청구서와 구별) */
export function isCalendarProrated(periodStart: Date, periodEnd: Date, months: number): boolean {
  return (
    periodStart.getUTCDate() !== 1 &&
    periodEnd.getTime() === calendarPeriodEnd(periodStart, months).getTime() &&
    periodEnd.getTime() !== periodEndFor(periodStart, months).getTime()
  );
}

/** 달력 달 단위 구간 — 첫 구간은 시작일~그달 말일 */
function calendarSegments(periodStart: Date, periodEnd: Date): { start: Date; end: Date }[] {
  const segments: { start: Date; end: Date }[] = [];
  let start = periodStart;
  while (start.getTime() <= periodEnd.getTime()) {
    const end = monthEndOf(start);
    segments.push({ start, end: end.getTime() > periodEnd.getTime() ? periodEnd : end });
    start = addDays(end, 1);
  }
  return segments;
}

/** 이용 기간을 월 단위 구간으로 나눈다 (마지막 구간은 이용 종료일까지) */
function monthSegments(periodStart: Date, periodEnd: Date, months: number): { start: Date; end: Date }[] {
  const count = Math.max(1, months);
  const segments: { start: Date; end: Date }[] = [];
  for (let i = 0; i < count; i += 1) {
    const start = addMonthsClamped(periodStart, i);
    if (start.getTime() > periodEnd.getTime()) break;
    const naturalEnd = addDays(addMonthsClamped(periodStart, i + 1), -1);
    const end = i === count - 1 || naturalEnd.getTime() > periodEnd.getTime() ? periodEnd : naturalEnd;
    segments.push({ start, end });
  }
  return segments;
}

/**
 * 완료된 환불들로부터 청구서의 환불 합계·상태·이용 종료일을 다시 계산한다 (더하지 않고 매번 전체를 다시 센다).
 * effectiveDate = 환불 때 지정한 마지막 이용일 (이용 전 환불이면 시작 전날, 지정하지 않았으면 null).
 *  · 지정된 날이 있으면 그중 가장 이른 날까지만 이용한 것으로 본다. 시작 전날이면 이용 기간 없음(null).
 *  · 지정이 없으면 이용 기간을 그대로 둔다. 다만 운영진 환불 없이 전액이 돌아간 경우
 *    (결제사에서 직접 전액 취소)는 이용 기간이 없는 것으로 본다.
 */
export function refundState(input: {
  paidAmount: number;
  periodStart: Date;
  periodEnd: Date;
  refunds: { amount: number; effectiveDate: Date | null; byStaff: boolean }[];
}): { refunded: number; status: "PAID" | "PARTIALLY_REFUNDED" | "REFUNDED"; coverageEnd: Date | null } {
  const { paidAmount, periodStart, periodEnd, refunds } = input;
  const refunded = Math.min(
    paidAmount,
    refunds.reduce((sum, r) => sum + r.amount, 0),
  );
  const status = refunded <= 0 ? "PAID" : refunded >= paidAmount ? "REFUNDED" : "PARTIALLY_REFUNDED";

  const lastUsedDates = refunds
    .map((r) => r.effectiveDate)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  let coverageEnd: Date | null = periodEnd;
  if (lastUsedDates.length > 0) {
    const lastUsed = lastUsedDates[0];
    coverageEnd =
      lastUsed.getTime() < periodStart.getTime()
        ? null
        : lastUsed.getTime() < periodEnd.getTime()
          ? lastUsed
          : periodEnd;
  } else if (status === "REFUNDED" && refunds.every((r) => !r.byStaff)) {
    coverageEnd = null;
  }
  return { refunded, status, coverageEnd };
}

/**
 * 환불 뒤의 이용 종료일. 마지막 이용일이 원래 종료일보다 앞이면 그날로 당긴다.
 * 이용 전 환불(lastUsedDate = null)이면 시작 전날 — 이 청구서로는 이용한 날이 없다는 뜻.
 */
export function coverageEndAfterRefund(
  periodStart: Date,
  currentCoverageEnd: Date,
  lastUsedDate: Date | null,
): Date {
  const floor = addDays(periodStart, -1);
  const target = lastUsedDate === null || lastUsedDate.getTime() < floor.getTime() ? floor : lastUsedDate;
  return target.getTime() < currentCoverageEnd.getTime() ? target : currentCoverageEnd;
}

// ─── 다음 청구 ─────────────────────────────────────────────────────────

/**
 * 다음 청구서의 이용 시작일.
 *  · 결제 기준일을 등록해 두었고 납부한 이용 기간보다 뒤면 그 날
 *    (시스템 밖에서 이미 받은 회차를 건너뛰거나, 쉬었다가 다시 다니는 날짜를 정해 둘 때)
 *  · 납부한 이용 기간이 있으면 그 종료일 다음 날
 *  · 없으면 등록일 기준 주기의 "오늘이 속한 회차" 시작일 (등록일이 미래면 등록일, 등록일을 모르면 오늘)
 */
export function nextPeriodStart(input: {
  coverageEnd: Date | null;
  enrolledOn: Date | null;
  today: Date;
  /** 학생별로 등록한 결제 기준일 */
  anchor?: Date | null;
}): Date {
  const { coverageEnd, enrolledOn, today, anchor } = input;
  if (anchor && (!coverageEnd || anchor.getTime() > coverageEnd.getTime())) return anchor;
  if (coverageEnd) return addDays(coverageEnd, 1);
  if (!enrolledOn) return today;
  if (enrolledOn.getTime() >= today.getTime()) return enrolledOn;
  const monthsApart =
    (today.getUTCFullYear() - enrolledOn.getUTCFullYear()) * 12 +
    (today.getUTCMonth() - enrolledOn.getUTCMonth());
  const candidate = addMonthsClamped(enrolledOn, monthsApart);
  return candidate.getTime() <= today.getTime() ? candidate : addMonthsClamped(enrolledOn, monthsApart - 1);
}

/** 청구 예정 대상인지 — 다음 이용 시작일이 leadDays 안으로 들어왔으면 true (이미 지났어도 true) */
export function isBillingDue(nextStart: Date, today: Date, leadDays: number): boolean {
  return diffDays(today, nextStart) <= leadDays;
}

/** 이용 종료가 지난 지 이만큼 넘으면 자동 청구하지 않는다 (그만둔 학생일 수 있어 사람이 판단) */
export const AUTO_ISSUE_GRACE_DAYS = 7;

// ─── 안내 시점 (cron) ───────────────────────────────────────────────────

/** 미납 안내를 보내는 날 — 납부 기한 기준 (음수 = 기한 전) */
export const UNPAID_REMINDER_OFFSETS = [-1, 0, 3, 7] as const;

/** 오늘이 미납 안내 발송일이면 기한 대비 일수, 아니면 null */
export function unpaidReminderOffset(dueDate: Date, today: Date): number | null {
  const offset = diffDays(dueDate, today);
  return (UNPAID_REMINDER_OFFSETS as readonly number[]).includes(offset) ? offset : null;
}

/** 자동 미납 안내가 끝난 뒤 이 간격마다 독촉하도록 화면에서 안내한다 */
export const DUNNING_INTERVAL_DAYS = 7;

/**
 * 독촉이 필요한 미납인지 — 자동 안내(기한 7일 뒤가 마지막)가 끝났고, 마지막 안내로부터 DUNNING_INTERVAL_DAYS 일이 지났다.
 * 운영진이 독촉을 보내면 그날부터 다시 센다.
 */
export function needsDunning(dueDate: Date, lastNoticeOn: Date | null, today: Date): boolean {
  const lastAuto = UNPAID_REMINDER_OFFSETS[UNPAID_REMINDER_OFFSETS.length - 1];
  if (diffDays(dueDate, today) <= lastAuto) return false;
  return lastNoticeOn === null || diffDays(lastNoticeOn, today) >= DUNNING_INTERVAL_DAYS;
}

/** "7,3" → [7, 3]. 0~60 사이 정수만, 중복 제거, 큰 수부터 */
export function parseReminderDays(raw: string | null | undefined): number[] {
  if (!raw) return [];
  const days = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 60);
  return [...new Set(days)].sort((a, b) => b - a);
}

/** 오늘이 이용 종료 N일 전 안내일이면 N, 아니면 null */
export function renewalReminderDay(coverageEnd: Date, today: Date, reminderDays: number[]): number | null {
  const left = diffDays(today, coverageEnd);
  return reminderDays.includes(left) ? left : null;
}
