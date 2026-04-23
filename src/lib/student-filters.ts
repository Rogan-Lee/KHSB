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
