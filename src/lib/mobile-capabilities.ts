// 모바일 앱의 역할 기반 내비게이션/기능 노출을 위한 capability 계산.
// roles.ts 를 단일 출처로 사용. /api/mobile/v1/auth/me 가 이 결과를 반환하고,
// 앱은 apps/mobile/src/lib/capabilities.ts 에서 동일 shape 을 소비한다.

import {
  canViewKakaoRaw,
  isFullAccess,
  isOnlineStaff,
  isStaff,
} from "@/lib/roles";

export type MobileNavRole =
  | "student"
  | "staff"
  | "mentor"
  | "director"
  | "consultant";

export type StaffCapabilities = {
  navRole: MobileNavRole;
  /** SUPER_ADMIN · DIRECTOR */
  fullAccess: boolean;
  /** 오프라인 자습실 운영(출결·순찰·인수인계 등) 접근 */
  offlineOps: boolean;
  /** 온라인 관리 모듈(수행평가·학습계획·진도·카톡로그·학부모리포트) 접근.
   *  현재는 ONLINE_ROLES 기준. Phase D 에서 멘토·운영조교까지 확대 예정. */
  onlineModule: boolean;
  /** 수행평가 피드백 작성 */
  writeFeedback: boolean;
  /** 급여 정산 조회/확정 */
  payroll: boolean;
  /** 등록/계정 초대 코드 발급 */
  issueCodes: boolean;
  /** 카톡 원문 열람 */
  kakaoRaw: boolean;
};

export type StudentCapabilities = {
  navRole: "student";
  isOnlineManaged: boolean;
};

export function staffCapabilities(role: string): StaffCapabilities {
  const fullAccess = isFullAccess(role);
  const navRole: MobileNavRole = fullAccess
    ? "director"
    : role === "CONSULTANT" || role === "MANAGER_MENTOR"
      ? "consultant"
      : role === "MENTOR" || role === "HEAD_MENTOR"
        ? "mentor"
        : "staff";

  return {
    navRole,
    fullAccess,
    offlineOps: isStaff(role),
    onlineModule: isOnlineStaff(role),
    writeFeedback: fullAccess || role === "CONSULTANT",
    payroll: fullAccess,
    issueCodes: isStaff(role),
    kakaoRaw: canViewKakaoRaw(role),
  };
}

export function studentCapabilities(isOnlineManaged: boolean): StudentCapabilities {
  return { navRole: "student", isOnlineManaged };
}
