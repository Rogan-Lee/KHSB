// 수강료 화면 표기 — 서버 src/lib/tuition/format.ts 와 같은 문구 (앱은 루트 src 를 import 할 수 없어 사본).
// 날짜는 KST 달력일("YYYY-MM-DD") 기준, Intl 없이 계산한다 (기기 로캘·타임존과 무관).
// RN·Expo·'@/' 별칭을 import 하지 않는다.

const KST_MS = 9 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');

/** 디자인 키트 Tone 의 부분집합 */
export type TuitionTone = 'gray' | 'ok' | 'warn' | 'bad' | 'info';

/** 690000 → "690,000원" */
export function won(amount: number | null | undefined): string {
  const n = Math.round(amount ?? 0);
  return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}원`;
}

/** "2026-11-01" → "2026.11.01" */
export function dotDate(key: string): string {
  return key.split('-').join('.');
}

/** "2026-11-01" → "11월 1일" */
export function monthDay(key: string): string {
  const [, m, d] = key.split('-');
  return `${Number(m)}월 ${Number(d)}일`;
}

/** "2026.11.01 ~ 2026.11.30" */
export function periodLabel(startKey: string, endKey: string): string {
  return `${dotDate(startKey)} ~ ${dotDate(endKey)}`;
}

/** 오늘 KST "YYYY-MM-DD" */
export function kstTodayKey(now = new Date()): string {
  return new Date(now.getTime() + KST_MS).toISOString().slice(0, 10);
}

/** 오늘부터 그 날까지 남은 날 (오늘 0, 지났으면 음수) */
export function daysUntil(key: string, todayKey = kstTodayKey()): number {
  return Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / 86_400_000);
}

/** ISO 시각 → KST "YYYY-MM-DD" (값이 없거나 깨졌으면 null) */
export function kstDateKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t + KST_MS).toISOString().slice(0, 10);
}

/** ISO 시각 → "11월 5일 23:59" (KST) */
export function kstDateTimeLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const d = new Date(t + KST_MS);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

// ─── 상태 ────────────────────────────────────────────────────────────

const INVOICE_STATUS: Record<string, { label: string; tone: TuitionTone }> = {
  REQUESTED: { label: '결제 요청', tone: 'info' },
  OVERDUE: { label: '미납', tone: 'bad' },
  PAID: { label: '납부 완료', tone: 'ok' },
  PARTIALLY_REFUNDED: { label: '일부 환불', tone: 'warn' },
  REFUNDED: { label: '환불', tone: 'gray' },
  CANCELED: { label: '청구 취소', tone: 'gray' },
};

/** 청구서 상태 배지. 앱이 모르는 상태(서버가 나중에 추가)는 배지를 그리지 않는다 */
export function invoiceStatusMeta(status: string): { label: string; tone: TuitionTone } | null {
  return INVOICE_STATUS[status] ?? null;
}

/** 납부 기한까지 남은 날 → "D-3" · "오늘까지" · "2일 지남" */
export function dueMeta(daysToDue: number): { label: string; tone: TuitionTone } {
  if (daysToDue < 0) return { label: `${-daysToDue}일 지남`, tone: 'bad' };
  if (daysToDue === 0) return { label: '오늘까지', tone: 'warn' };
  return { label: `D-${daysToDue}`, tone: daysToDue <= 3 ? 'warn' : 'gray' };
}

export const ONSITE_METHOD_LABEL: Record<string, string> = {
  LOCAL_CURRENCY: '지역화폐',
  ONSITE_CARD: '현장 카드',
};

// ─── 다음 결제 · 홈 배너 ─────────────────────────────────────────────

/** "다음 결제" 안내 문구. 안내할 내용이 없으면 null (섹션을 숨긴다) */
export function nextPaymentText(
  next: { date?: string | null; basis?: string | null; coverageEnd?: string | null } | null | undefined,
  todayKey = kstTodayKey(),
): string | null {
  const date = next?.date ?? null;
  if (!next || !date) return null;
  if (next.basis === 'DUE') {
    // 기한이 이미 지났는데 "~까지 납부해 주세요" 라고 하면 어색하다
    return date < todayKey
      ? `납부 기한(${monthDay(date)})이 지났어요. 확인하고 납부해 주세요`
      : `${monthDay(date)}까지 납부해 주세요`;
  }
  if (next.basis === 'COVERAGE_END') {
    const tail = `다음 수강료는 ${monthDay(date)}부터예요. 청구서가 나오면 알려 드릴게요`;
    return next.coverageEnd ? `이용 기간이 ${dotDate(next.coverageEnd)}에 끝나요. ${tail}` : tail;
  }
  return null;
}

/** 홈 배너 첫 줄 — "11월 수강료 690,000원" */
export function bannerTitle(banner: { title: string; amount: number }): string {
  return `${banner.title} ${won(banner.amount)}`;
}

/** 홈 배너 둘째 줄 — "11월 5일까지 납부해 주세요" · 미납이면 "납부 기한이 지났어요" */
export function bannerSubtitle(banner: { dueDate: string; overdue: boolean }): string {
  return banner.overdue ? '납부 기한이 지났어요' : `${monthDay(banner.dueDate)}까지 납부해 주세요`;
}
