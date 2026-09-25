import type { LunchData, LunchMenu } from './adapter';

// 도시락 신청 — 웹 src/components/lunch/lunch-order-form.tsx 와 같은 계산 규칙.
// 날짜는 KST 기준, Intl 없이 계산(기기 로캘·타임존과 무관). 메뉴 날짜는 KST 달력일(UTC 자정).

const KST_MS = 9 * 60 * 60 * 1000;
const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;
const pad = (n: number) => String(n).padStart(2, '0');

export const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

/** 오늘 KST YYYY-MM-DD */
export function kstTodayKey(now = new Date()) {
  return new Date(now.getTime() + KST_MS).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → "9월 29일 (월)" */
export function ymdLabel(ymd: string, withDow = true) {
  const d = new Date(`${ymd}T00:00:00Z`);
  const base = `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
  return withDow ? `${base} (${DOW_KO[d.getUTCDay()]})` : base;
}

/** "YYYY-MM-DD" → "9/29" */
export function mdLabel(ymd: string) {
  const d = new Date(`${ymd}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/** "YYYY-MM-DD" → "월" */
export function dowLabel(ymd: string) {
  return DOW_KO[new Date(`${ymd}T00:00:00Z`).getUTCDay()];
}

/** ISO → "9월 25일 14:03" (올해가 아니면 연도 포함) */
export function kstDateTimeLabel(iso: string) {
  const d = new Date(new Date(iso).getTime() + KST_MS);
  const thisYear = new Date(Date.now() + KST_MS).getUTCFullYear();
  const y = d.getUTCFullYear() !== thisYear ? `${d.getUTCFullYear()}년 ` : '';
  return `${y}${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** 해당 날짜가 속한 주의 월요일(YYYY-MM-DD) */
export function weekStartOf(ymd: string) {
  const d = new Date(`${ymd}T00:00:00Z`);
  const mondayOffset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - mondayOffset);
  return d.toISOString().slice(0, 10);
}

/** 주 신청 마감 — 그 주 월요일의 4일 전(전주 목요일) 23:59 KST. 서버 src/lib/lunch-lock.ts 와 같은 규칙 */
export function deadlineOf(monday: string) {
  const d = new Date(`${monday}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 4);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromYmd: string, toYmd: string) {
  return Math.round(
    (new Date(`${toYmd}T00:00:00Z`).getTime() - new Date(`${fromYmd}T00:00:00Z`).getTime()) / 86_400_000,
  );
}

/**
 * 자유 입력 계좌 문자열("국민 123-45-6789 (홍길동)")을 표시용으로 분해.
 * 숫자 덩어리를 찾지 못하면 null → 원문 그대로 표시. (웹과 같은 규칙)
 */
export function parseBankInfo(raw: string): { bank: string; account: string; holder: string } | null {
  const m = raw.match(/\d[\d\s-]{5,}\d/);
  if (!m || m.index == null) return null;
  const bank = raw
    .slice(0, m.index)
    .replace(/[\s:|·,/-]+$/, '')
    .trim();
  const holder = raw
    .slice(m.index + m[0].length)
    .trim()
    .replace(/^[\s:|·,/-]+/, '')
    .replace(/^\((.*)\)$/, '$1')
    .replace(/^예금주\s*[:：]?\s*/, '')
    .trim();
  return { bank, account: m[0].trim(), holder };
}

export type LunchView = 'order' | 'payment' | 'confirmed';

/**
 * 첫 화면 — 입금 대기 주문이 있으면 입금 안내, 앞으로 먹을 확정 주문이 있으면 확정 내역, 아니면 신청.
 * (웹은 지난 확정 주문만 있어도 확정 화면에 머물러 새 신청을 못 했는데, 앱은 신청 화면으로 보낸다)
 */
export function deriveLunchView(data: LunchData): LunchView {
  if (data.pending) return 'payment';
  const today = kstTodayKey();
  if (data.confirmed?.items.some((it) => it.date >= today)) return 'confirmed';
  return 'order';
}

/** 아직 신청할 수 있는(마감 전·미결제) 메뉴가 있는지 */
export function hasOrderableMenus(menus: LunchMenu[], paidMenuIds: string[]) {
  const paid = new Set(paidMenuIds);
  return menus.some((m) => !m.locked && !paid.has(m.id));
}
