// 앱·사이트 사용 통제 — 공용 타입 (순수 계산 모듈과 서버·화면이 같이 쓴다).
// Prisma enum 과 같은 문자열이지만, 순수 모듈이 생성 코드에 묶이지 않게 따로 둔다.

export type AccessAction = "BLOCK" | "ALLOW";
export type AccessTargetKind = "ALL" | "SERVICE" | "DOMAIN";
export type AccessScope = "GLOBAL" | "STUDENT";
export type AccessDeviceStatus = "UNASSIGNED" | "ASSIGNED" | "EXEMPT";

/** 상시 규칙 (계산에 필요한 필드만) */
export type RuleInput = {
  id: string;
  action: AccessAction;
  targetKind: AccessTargetKind;
  target: string;
  scope: AccessScope;
  studentId: string | null;
  /** 0(일)~6(토). 비어 있으면 매일 */
  daysOfWeek: number[];
  /** KST 자정 기준 분. null 이면 종일 */
  startMinute: number | null;
  endMinute: number | null;
  enabled: boolean;
  createdAt: Date;
};

/** 일시 조치 */
export type OverrideInput = {
  id: string;
  action: AccessAction;
  targetKind: AccessTargetKind;
  target: string;
  scope: AccessScope;
  studentId: string | null;
  startAt: Date;
  endAt: Date;
  cancelledAt: Date | null;
  createdAt: Date;
};

export type DeviceInput = {
  id: string;
  mac: string;
  status: AccessDeviceStatus;
  studentId: string | null;
};

/** 한 대상(시설 전체 또는 학생 한 명)에 지금 적용되는 정책 — 배열은 정렬돼 있다 */
export type PolicySet = {
  /** 인터넷 전체 차단 (허용 목록만 열림) */
  blockAll: boolean;
  blockedServices: string[];
  allowedServices: string[];
  blockedDomains: string[];
  allowedDomains: string[];
};

export type EffectiveState = {
  /** 통제 일시 중지 — 아무것도 막지 않는다 */
  paused: boolean;
  global: PolicySet;
  /** 전체 정책과 다른 학생만 (studentId → 정책) */
  students: Record<string, PolicySet>;
};

export type PauseSetting = {
  paused: boolean;
  /** ISO. null 이면 다시 켤 때까지 */
  until: string | null;
};

export const EMPTY_POLICY: PolicySet = {
  blockAll: false,
  blockedServices: [],
  allowedServices: [],
  blockedDomains: [],
  allowedDomains: [],
};
