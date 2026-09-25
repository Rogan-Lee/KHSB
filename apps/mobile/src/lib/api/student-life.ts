import type { Tone } from '@/design';
import { mutateMobileApi } from '@/lib/mobile-api';

// 학생 생활 기능 — 포인트·기프티콘 / 쪽잠 / 네트워크 사용 신청.
// 서버 src/lib/mobile-student-life.ts (핵심 로직은 웹 포털과 공용인 src/lib/student-*-core.ts)
//   GET  /api/mobile/v1/student/points
//   POST /api/mobile/v1/student/rewards/redemptions
//   GET·POST /api/mobile/v1/student/nap
//   GET·POST /api/mobile/v1/student/network

export const POINTS_PATH = '/api/mobile/v1/student/points';
export const REDEMPTIONS_PATH = '/api/mobile/v1/student/rewards/redemptions';
export const NAP_PATH = '/api/mobile/v1/student/nap';
export const NETWORK_PATH = '/api/mobile/v1/student/network';

// ─── 공용 상태 ──────────────────────────────────────────────────────

/** 쪽잠·네트워크 신청 상태 (서버 NapStatus) */
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type RedemptionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'FULFILLED';

/** 웹 src/components/portal/status.ts REQUEST_STATUS 와 동일 */
export const REQUEST_STATUS: Record<RequestStatus, { label: string; tone: Tone }> = {
  PENDING: { label: '승인 대기', tone: 'warn' },
  APPROVED: { label: '승인됨', tone: 'ok' },
  REJECTED: { label: '거절됨', tone: 'bad' },
};

/** 웹 src/components/portal/status.ts REDEMPTION_STATUS 와 동일 */
export const REDEMPTION_STATUS: Record<RedemptionStatus, { label: string; tone: Tone }> = {
  PENDING: { label: '대기중', tone: 'warn' },
  APPROVED: { label: '승인됨', tone: 'info' },
  REJECTED: { label: '거절됨', tone: 'gray' },
  FULFILLED: { label: '지급완료', tone: 'ok' },
};

// ─── 포인트 ─────────────────────────────────────────────────────────

export type PointHistoryEntry = {
  kind: 'MERIT' | 'DEMERIT' | 'REDEMPTION';
  /** ISO */
  date: string;
  points: number;
  label: string;
  /** REDEMPTION 전용 */
  status?: RedemptionStatus;
};

export type RewardItem = { id: string; name: string; points: number };

export type Redemption = {
  id: string;
  itemName: string;
  points: number;
  status: RedemptionStatus;
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
};

export type StudentPointsResponse = {
  balance: number;
  history: PointHistoryEntry[];
  items: RewardItem[];
  myRedemptions: Redemption[];
  /** 원화 환산 표시용 (25점 = 10,000원) */
  pointsPer10000Krw: number;
};

/** 포인트 → 원화 (웹 src/lib/points.ts pointsToKrw 와 같은 식, 반올림) */
export function pointsToKrw(points: number, pointsPer10000Krw: number): number {
  if (!pointsPer10000Krw) return 0;
  return Math.round((points / pointsPer10000Krw) * 10000);
}

export function requestRedemption(itemId: string) {
  return mutateMobileApi<{ id: string }>(REDEMPTIONS_PATH, 'POST', { itemId });
}

// ─── 쪽잠 ───────────────────────────────────────────────────────────

export type NapRequest = {
  id: string;
  /** "YYYY-MM-DD" (KST) */
  date: string;
  /** "HH:MM" */
  startTime: string;
  durationMin: number;
  status: RequestStatus;
  note: string | null;
  decidedByName: string | null;
  createdAt: string;
};

export type StudentNapResponse = {
  naps: NapRequest[];
  todayCount: number;
  limit: number;
  /** 서버 기준 오늘 "YYYY-MM-DD" (KST) */
  today: string;
  /** 선택할 수 있는 쪽잠 시간(분) — [20, 30] */
  durations: number[];
};

export function requestNap(input: { startTime: string; durationMin: number }) {
  return mutateMobileApi<{ ok: true }>(NAP_PATH, 'POST', input);
}

// ─── 네트워크 사용 ──────────────────────────────────────────────────

export type NetworkRequestKind = 'WIFI_UNBLOCK' | 'DOMAIN_ALLOW' | 'APP_UNBLOCK';

/** 웹 src/lib/network-requests.ts 와 동일 */
export const NETWORK_KIND_LABELS: Record<NetworkRequestKind, string> = {
  WIFI_UNBLOCK: '와이파이 해제',
  DOMAIN_ALLOW: '사이트 허용',
  APP_UNBLOCK: '앱 사용',
};

export const NETWORK_KIND_ORDER: NetworkRequestKind[] = ['WIFI_UNBLOCK', 'DOMAIN_ALLOW', 'APP_UNBLOCK'];

/** 대상 입력이 필요한 유형 — 웹 network-panel TARGET_META 와 동일 */
export const NETWORK_TARGET_META: Partial<Record<NetworkRequestKind, { label: string; placeholder: string }>> = {
  DOMAIN_ALLOW: { label: '사이트 주소', placeholder: '예: ebsi.co.kr' },
  APP_UNBLOCK: { label: '앱 이름', placeholder: '예: 클래스룸' },
};

export type NetworkRequest = {
  id: string;
  kind: NetworkRequestKind;
  target: string | null;
  /** ISO */
  startAt: string;
  /** ISO */
  endAt: string;
  reason: string;
  status: RequestStatus;
  appliedAt: string | null;
  decidedByName: string | null;
  createdAt: string;
};

export type StudentNetworkResponse = { requests: NetworkRequest[] };

export function requestNetwork(input: {
  kind: NetworkRequestKind;
  target?: string;
  /** "YYYY-MM-DDTHH:MM" (KST) */
  startAt: string;
  /** "YYYY-MM-DDTHH:MM" (KST) */
  endAt: string;
  reason: string;
}) {
  return mutateMobileApi<{ ok: true }>(NETWORK_PATH, 'POST', input);
}
