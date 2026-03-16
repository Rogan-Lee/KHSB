// ADMIN과 DIRECTOR는 동일한 전체 권한을 가짐
// ADMIN: 개발자/운영자, DIRECTOR: 원장

export const FULL_ACCESS_ROLES = ["ADMIN", "DIRECTOR"] as const;
export const STAFF_ROLES = ["ADMIN", "DIRECTOR", "MENTOR", "STAFF"] as const;

export function isFullAccess(role?: string | null): boolean {
  return role === "ADMIN" || role === "DIRECTOR";
}

export const ROLE_DISPLAY: Record<string, string> = {
  ADMIN: "어드민",
  DIRECTOR: "원장",
  MENTOR: "멘토",
  STAFF: "운영조교",
  STUDENT: "원생",
};
