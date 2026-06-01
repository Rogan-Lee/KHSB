// 리스트 조회용 공용 날짜 범위 헬퍼.
// 멘토링 목록과 동일한 규칙: URL ?from=YYYY-MM-DD&to=YYYY-MM-DD 로 범위를 받고,
// 없으면 기본 범위(최근 N일 ~ 오늘+M일)로 폴백. 종료일은 KST 23:59:59 까지 포함.
//
// 서버 컴포넌트에서 사용 — searchParams 의 from/to 를 넘기면
// Prisma where 절에 쓸 rangeFrom/rangeTo 와 클라이언트에 내려줄 initialFrom/initialTo 를 반환.

export const DATE_RANGE_DEFAULT_BACK = 60;
export const DATE_RANGE_DEFAULT_AHEAD = 14;

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDate(s: string | undefined, fallback: Date): Date {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? fallback : dt;
}

export type ResolvedDateRange = {
  /** Prisma where 절 하한 (해당일 00:00:00) */
  rangeFrom: Date;
  /** Prisma where 절 상한 (해당일 23:59:59) */
  rangeTo: Date;
  /** 클라이언트 DatePicker 초기값 (YYYY-MM-DD) */
  initialFrom: string;
  /** 클라이언트 DatePicker 초기값 (YYYY-MM-DD) */
  initialTo: string;
};

export function resolveDateRange(
  from: string | undefined,
  to: string | undefined,
  opts?: { daysBack?: number; daysAhead?: number },
): ResolvedDateRange {
  const daysBack = opts?.daysBack ?? DATE_RANGE_DEFAULT_BACK;
  const daysAhead = opts?.daysAhead ?? DATE_RANGE_DEFAULT_AHEAD;
  const now = new Date();

  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack);
  const defaultTo = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead);

  const rangeFromStart = parseDate(from, defaultFrom);
  const rangeToStart = parseDate(to, defaultTo);

  const rangeFrom = new Date(
    rangeFromStart.getFullYear(),
    rangeFromStart.getMonth(),
    rangeFromStart.getDate(),
  );
  const rangeTo = new Date(
    rangeToStart.getFullYear(),
    rangeToStart.getMonth(),
    rangeToStart.getDate(),
    23,
    59,
    59,
  );

  return {
    rangeFrom,
    rangeTo,
    initialFrom: toIsoDate(rangeFrom),
    initialTo: toIsoDate(rangeTo),
  };
}
