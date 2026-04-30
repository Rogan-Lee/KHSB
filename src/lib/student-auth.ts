import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { Student, StudentMagicLink } from "@/generated/prisma";

export const DEFAULT_MAGIC_LINK_VALID_DAYS = 30;

export type ValidatedMagicLink = {
  student: Student;
  link: StudentMagicLink;
};

/**
 * 학생 매직링크 신규 발급.
 * 토큰은 cuid 기본값을 사용하므로 DB 레벨 고유성 보장.
 * 만료일 기본 30일. Phase 1은 학생당 다수 활성 링크 허용(재발급 시 이전은 별도 revoke).
 */
export async function issueMagicLink(params: {
  studentId: string;
  issuedById?: string | null;
  daysValid?: number;
}): Promise<StudentMagicLink> {
  const { studentId, issuedById, daysValid = DEFAULT_MAGIC_LINK_VALID_DAYS } = params;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + daysValid);

  return prisma.studentMagicLink.create({
    data: {
      studentId,
      issuedById: issuedById ?? null,
      expiresAt,
    },
  });
}

/**
 * 토큰 검증. 유효한 경우 학생과 링크 반환 + accessCount 증가.
 * 실패 사유: 존재하지 않음 / 무효화됨 / 만료됨 / 학생 isOnlineManaged=false.
 * React cache 로 감싸 동일 request 내 중복 호출 시 한 번만 실행
 * (layout + page 에서 동시 호출 시 accessCount 중복 방지).
 */
export const validateMagicLink = cache(
  async (token: string): Promise<ValidatedMagicLink | null> => {
    if (!token) return null;

    const link = await prisma.studentMagicLink.findUnique({
      where: { token },
      include: { student: true },
    });
    if (!link) return null;
    if (link.revokedAt) return null;
    if (link.expiresAt.getTime() < Date.now()) return null;
    if (!link.student.isOnlineManaged) return null;

    prisma.studentMagicLink
      .update({
        where: { id: link.id },
        data: {
          lastAccessedAt: new Date(),
          accessCount: { increment: 1 },
        },
      })
      .catch(() => {});

    const { student, ...linkOnly } = link;
    return { student, link: linkOnly };
  }
);

/**
 * 특정 링크 무효화. 원장 또는 SUPER_ADMIN 이 호출.
 * 이미 무효화된 링크는 멱등적으로 유지.
 */
export async function revokeMagicLink(linkId: string): Promise<void> {
  await prisma.studentMagicLink.updateMany({
    where: { id: linkId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * 학생의 모든 활성 링크 일괄 무효화. 재발급 시 혹은 사고 대응용.
 */
export async function revokeAllLinksForStudent(studentId: string): Promise<number> {
  const result = await prisma.studentMagicLink.updateMany({
    where: { studentId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}
