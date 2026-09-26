import { randomBytes } from "node:crypto";
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
 * 토큰은 URL 자체가 자격증명이므로 CSPRNG 192bit(base64url 32자)로 직접 생성한다.
 * (스키마 기본값 cuid() 는 타임스탬프 + Math.random 기반이라 추측 가능 — 기존 발급분은 그대로 유효)
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
      token: randomBytes(24).toString("base64url"),
      studentId,
      issuedById: issuedById ?? null,
      expiresAt,
    },
  });
}

/**
 * 토큰 검증. 유효한 경우 학생과 링크 반환 + accessCount 증가.
 * 실패 사유: 존재하지 않음 / 무효화됨 / 만료됨 / 재원 중(ACTIVE)이 아닌 학생(퇴원·휴원·졸업).
 * (퇴원 처리 시 링크가 자동 무효화되지 않는 경로가 있어 학생 상태를 여기서 함께 본다 —
 *  학생 앱 requireMobileStudent / getStudent 와 같은 기준.)
 * (질문 게시판은 전체 재원생 대상이므로 isOnlineManaged 게이트 없음 —
 *  온라인 모듈 전용 화면은 각 페이지에서 student.isOnlineManaged 로 가드한다.)
 * React cache 로 감싸 동일 request 내 중복 호출 시 한 번만 실행
 * (layout + page 에서 동시 호출 시 accessCount 중복 방지).
 */
export const validateMagicLink = cache(
  async (token: string): Promise<ValidatedMagicLink | null> => {
    if (!token || typeof token !== "string" || token.length > 128) return null;

    const link = await prisma.studentMagicLink.findUnique({
      where: { token },
      include: { student: true },
    });
    if (!link) return null;
    if (link.revokedAt) return null;
    if (link.expiresAt.getTime() < Date.now()) return null;
    if (link.student.status !== "ACTIVE") return null;

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
