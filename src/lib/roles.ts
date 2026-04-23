// Role 계층:
// - SUPER_ADMIN: 시스템 최상위 관리자 (다계정 가능, 개발자/파운더)
// - DIRECTOR: 원장 (시설 운영 오너)
// - ADMIN: (deprecated) 구버전 호환용. 전체 접근 권한 가지지 않음. 기존 데이터는 SUPER_ADMIN 으로 이관 완료.
// - MENTOR / STAFF / STUDENT: 오프라인 자습실 일반 사용자
// - CONSULTANT: 온라인 관리 — 입시/수행평가 설계. 오프라인 자습실 화면 접근 금지.
// - MANAGER_MENTOR: 온라인 관리 — 진도/주간/카톡 로그. 오프라인 자습실 화면 접근 금지.

export const FULL_ACCESS_ROLES = ["SUPER_ADMIN", "DIRECTOR"] as const;
export const STAFF_ROLES = ["SUPER_ADMIN", "DIRECTOR", "MENTOR", "STAFF"] as const;
// 온라인 관리 모듈 접근 가능한 역할. 원장·시스템 관리자는 전체 접근이므로 포함.
export const ONLINE_ROLES = ["SUPER_ADMIN", "DIRECTOR", "CONSULTANT", "MANAGER_MENTOR"] as const;

/** SUPER_ADMIN · DIRECTOR 만 true — 관리자 메뉴 접근 가능 */
export function isFullAccess(role?: string | null): boolean {
  return role === "SUPER_ADMIN" || role === "DIRECTOR";
}

/** SUPER_ADMIN 만 true — 시스템 최상위 전용 기능 (향후 확장) */
export function isSuperAdmin(role?: string | null): boolean {
  return role === "SUPER_ADMIN";
}

export function isStaff(role?: string | null): boolean {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role);
}

/** STAFF 이상 역할이 아니면 에러를 던진다 */
export function requireStaff(role?: string | null) {
  if (!isStaff(role)) throw new Error("Forbidden");
}

/** DIRECTOR/SUPER_ADMIN 이 아니면 에러 */
export function requireFullAccess(role?: string | null) {
  if (!isFullAccess(role)) throw new Error("Forbidden");
}

/** SUPER_ADMIN 이 아니면 에러 (시스템 전용) */
export function requireSuperAdmin(role?: string | null) {
  if (!isSuperAdmin(role)) throw new Error("Forbidden");
}

/** 리소스 소유자이거나 DIRECTOR/SUPER_ADMIN 이 아니면 에러 */
export function requireOwnerOrFullAccess(
  ownerId: string,
  sessionUserId: string,
  role?: string | null
) {
  if (ownerId !== sessionUserId && !isFullAccess(role)) {
    throw new Error("Forbidden");
  }
}

// ─── 온라인 관리 모듈 전용 가드 ───

/** 온라인 관리 모듈(/online/*) 접근 가능 역할 */
export function isOnlineStaff(role?: string | null): boolean {
  return !!role && (ONLINE_ROLES as readonly string[]).includes(role);
}

export function requireOnlineStaff(role?: string | null) {
  if (!isOnlineStaff(role)) throw new Error("Forbidden");
}

export function isConsultant(role?: string | null): boolean {
  return role === "CONSULTANT";
}

export function requireConsultant(role?: string | null) {
  if (!isConsultant(role) && !isFullAccess(role)) throw new Error("Forbidden");
}

export function isManagerMentor(role?: string | null): boolean {
  return role === "MANAGER_MENTOR";
}

export function requireManagerMentor(role?: string | null) {
  if (!isManagerMentor(role) && !isFullAccess(role)) throw new Error("Forbidden");
}

/**
 * 카톡 대화 원문(DailyKakaoLog.rawContent) 접근 가능 여부.
 * 컨설턴트는 기본 차단 — 학생 개인 민감정보 보호.
 * 원장/SUPER_ADMIN/MANAGER_MENTOR 만 허용.
 */
export function canViewKakaoRaw(role?: string | null): boolean {
  return isFullAccess(role) || isManagerMentor(role);
}

export const ROLE_DISPLAY: Record<string, string> = {
  SUPER_ADMIN: "시스템 관리자",
  DIRECTOR: "원장",
  ADMIN: "(구) 어드민",      // 구버전 호환 표시
  MENTOR: "멘토",
  STAFF: "운영조교",
  STUDENT: "원생",
  CONSULTANT: "컨설턴트",
  MANAGER_MENTOR: "관리 멘토",
};

/** UI Role selector 에 보여줄 선택 가능한 역할 (ADMIN 은 제외) */
export const ASSIGNABLE_ROLES = [
  "SUPER_ADMIN",
  "DIRECTOR",
  "MENTOR",
  "STAFF",
  "STUDENT",
  "CONSULTANT",
  "MANAGER_MENTOR",
] as const;
