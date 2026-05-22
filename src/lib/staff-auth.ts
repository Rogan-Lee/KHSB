import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { StaffMagicLink, User } from "@/generated/prisma";

export const DEFAULT_STAFF_LINK_VALID_DAYS = 90;

export type ValidatedStaffMagicLink = {
  user: User;
  link: StaffMagicLink;
};

/**
 * 근무자 매직링크 신규 발급.
 * 토큰은 cuid 기본값을 사용하므로 DB 레벨 고유성 보장.
 * 만료일 기본 90일 (학생 30일보다 길게 — 상시 사용).
 *
 * 거절 조건:
 *  - 존재하지 않는 사용자
 *  - `status === TERMINATED` (퇴사자에게는 발급 금지)
 *  - `phone` null/빈문자열 (본인 확인 게이트 무력화 방지)
 */
export async function issueStaffMagicLink(
  userId: string,
  params: {
    expiresInDays?: number;
    issuedById?: string | null;
  } = {},
): Promise<StaffMagicLink> {
  const { expiresInDays = DEFAULT_STAFF_LINK_VALID_DAYS, issuedById } = params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, status: true, phone: true },
  });
  if (!user) throw new Error("근무자를 찾을 수 없습니다");

  if (user.status === "TERMINATED") {
    throw new Error("퇴사 처리된 근무자에게는 매직링크를 발급할 수 없습니다");
  }

  if (!user.phone || user.phone.trim() === "") {
    throw new Error(
      "본인 확인용 전화번호가 설정되어 있지 않습니다. 먼저 전화번호를 등록하세요",
    );
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  return prisma.staffMagicLink.create({
    data: {
      userId,
      issuedById: issuedById ?? null,
      expiresAt,
    },
  });
}

/**
 * 토큰 검증. 유효한 경우 근무자와 링크 반환 + accessCount/lastAccessed{At,Ip,Ua} 갱신.
 * 실패 사유: 존재하지 않음 / 무효화됨 / 만료됨 / 사용자 퇴사 처리됨.
 * React cache 로 감싸 동일 request 내 중복 호출 시 한 번만 실행.
 */
export const validateStaffMagicLink = cache(
  async (
    token: string,
    accessMeta?: { ip?: string | null; ua?: string | null },
  ): Promise<ValidatedStaffMagicLink | null> => {
    if (!token) return null;

    const link = await prisma.staffMagicLink.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!link) return null;
    if (link.revokedAt) return null;
    if (link.expiresAt.getTime() < Date.now()) return null;
    if (link.user.status === "TERMINATED") return null;

    prisma.staffMagicLink
      .update({
        where: { id: link.id },
        data: {
          lastAccessedAt: new Date(),
          lastAccessIp: accessMeta?.ip ?? undefined,
          lastAccessUa: accessMeta?.ua ?? undefined,
          accessCount: { increment: 1 },
        },
      })
      .catch(() => {});

    const { user, ...linkOnly } = link;
    return { user, link: linkOnly };
  },
);

/**
 * 특정 링크 무효화. 원장 또는 SUPER_ADMIN 이 호출.
 * 이미 무효화된 링크는 멱등적으로 유지.
 */
export async function revokeStaffMagicLink(linkId: string): Promise<void> {
  await prisma.staffMagicLink.updateMany({
    where: { id: linkId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * 근무자의 모든 활성 링크 일괄 무효화.
 * 퇴사 처리 dialog (Sprint 3.1) 등에서 호출.
 */
export async function revokeAllLinksForStaff(userId: string): Promise<number> {
  const result = await prisma.staffMagicLink.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}
