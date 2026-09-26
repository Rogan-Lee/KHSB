// 학생 포털(/s/[token]) 매직링크 — 단일 학생 조회·발급 핵심 로직.
// 웹 서버 액션(src/actions/student-portal-links.ts)과 모바일 API(src/lib/mobile-staff-portal-link.ts)가 같이 쓴다.
// 인증·권한 검사와 revalidatePath 는 호출 측 책임.

import { prisma } from "@/lib/prisma";
import {
  DEFAULT_MAGIC_LINK_VALID_DAYS,
  issueMagicLink,
  revokeAllLinksForStudent,
} from "@/lib/student-auth";

export class PortalLinkCoreError extends Error {}

/** 포털 링크 유효 일수 상한 — 서버 액션 인자는 클라이언트 입력이므로 1~90일로 고정 (영구 링크 방지). */
export const MAX_PORTAL_LINK_VALID_DAYS = 90;
export function clampPortalLinkDays(daysValid: unknown): number {
  const n = Math.floor(Number(daysValid));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_MAGIC_LINK_VALID_DAYS;
  return Math.min(n, MAX_PORTAL_LINK_VALID_DAYS);
}

/** 학생의 현재 유효한(취소·만료 안 된) 최신 포털 링크 */
export async function findActivePortalLink(studentId: string, now = new Date()) {
  return prisma.studentMagicLink.findFirst({
    where: { studentId, revokedAt: null, expiresAt: { gt: now } },
    orderBy: { issuedAt: "desc" },
    select: {
      token: true,
      issuedAt: true,
      expiresAt: true,
      lastAccessedAt: true,
      accessCount: true,
    },
  });
}

/**
 * 단일 학생 포털 링크 발급/재발급.
 * - reissue=false: 유효한 링크가 있으면 그대로 돌려준다(reused=true).
 * - reissue=true: 기존 활성 링크를 모두 무효화하고 새로 발급.
 */
export async function issuePortalLinkForStudent(params: {
  studentId: string;
  issuedById: string;
  reissue?: boolean;
  daysValid?: number;
}) {
  const student = await prisma.student.findUnique({
    where: { id: params.studentId },
    select: { id: true, status: true },
  });
  if (!student) throw new PortalLinkCoreError("학생을 찾을 수 없습니다");
  // 재원생이 아니면 validateMagicLink 가 거부하므로 발급해도 쓸 수 없다
  if (student.status !== "ACTIVE") {
    throw new PortalLinkCoreError("재원 중인 학생에게만 링크를 발급할 수 있습니다");
  }

  if (params.reissue) {
    await revokeAllLinksForStudent(params.studentId);
  } else {
    const existing = await findActivePortalLink(params.studentId);
    if (existing) {
      return { token: existing.token, expiresAt: existing.expiresAt, reused: true };
    }
  }

  const link = await issueMagicLink({
    studentId: params.studentId,
    issuedById: params.issuedById,
    daysValid: clampPortalLinkDays(params.daysValid ?? DEFAULT_MAGIC_LINK_VALID_DAYS),
  });
  return { token: link.token, expiresAt: link.expiresAt, reused: false };
}
