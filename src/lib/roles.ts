// ADMIN과 DIRECTOR는 동일한 전체 권한을 가짐
// ADMIN: 개발자/운영자, DIRECTOR: 원장

export const FULL_ACCESS_ROLES = ["ADMIN", "DIRECTOR"] as const;
export const STAFF_ROLES = ["ADMIN", "DIRECTOR", "MENTOR", "STAFF"] as const;

export function isFullAccess(role?: string | null): boolean {
  return role === "ADMIN" || role === "DIRECTOR";
}

export function isStaff(role?: string | null): boolean {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role);
}

/** STAFF 이상 역할이 아니면 에러를 던진다 */
export function requireStaff(role?: string | null) {
  if (!isStaff(role)) throw new Error("Forbidden");
}

/** DIRECTOR/ADMIN이 아니면 에러를 던진다 */
export function requireFullAccess(role?: string | null) {
  if (!isFullAccess(role)) throw new Error("Forbidden");
}

/** 리소스 소유자이거나 DIRECTOR/ADMIN이 아니면 에러를 던진다 */
export function requireOwnerOrFullAccess(
  ownerId: string,
  sessionUserId: string,
  role?: string | null
) {
  if (ownerId !== sessionUserId && !isFullAccess(role)) {
    throw new Error("Forbidden");
  }
}

export const ROLE_DISPLAY: Record<string, string> = {
  ADMIN: "어드민",
  DIRECTOR: "원장",
  MENTOR: "멘토",
  STAFF: "운영조교",
  STUDENT: "원생",
};
