import type { Prisma } from "@/generated/prisma";

/**
 * 오프라인 자습실 학생 필터.
 * 온라인 관리 학생(isOnlineManaged=true)은 자습실 기능(출결·좌석·사진 등)
 * 화면에서 기본 제외. 기존 `{ status: "ACTIVE" }` 쿼리를 이 헬퍼로 치환.
 */
export function offlineStudentWhere(
  extra?: Prisma.StudentWhereInput
): Prisma.StudentWhereInput {
  return {
    isOnlineManaged: false,
    ...extra,
  };
}

/**
 * 온라인 관리 학생 필터. /online/* 화면 전용.
 */
export function onlineStudentWhere(
  extra?: Prisma.StudentWhereInput
): Prisma.StudentWhereInput {
  return {
    isOnlineManaged: true,
    ...extra,
  };
}

/**
 * "내가 담당하는 학생" 필터 — 온라인 배정(assigned*)과 오프라인 멘토(mentorId)를 통합.
 * 전 직원 대상 기능(수행평가·학생 메시지)에서 비-원장 직원의 담당 범위 스코핑에 사용.
 * 원장/SUPER_ADMIN(전체 접근)은 이 필터 없이 전체 조회:
 *   `isFullAccess(role) ? {} : assignedToMeWhere(userId)`.
 */
export function assignedToMeWhere(userId: string): Prisma.StudentWhereInput {
  return {
    OR: [
      { mentorId: userId }, // 오프라인 자습실 담당 멘토
      { assignedMentorId: userId }, // 온라인 총괄멘토
      { assignedConsultantId: userId }, // 온라인 컨설턴트
      { assignedStaffId: userId }, // 온라인 운영조교
    ],
  };
}
