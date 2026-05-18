"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireFullAccess } from "@/lib/roles";
import {
  issueStaffMagicLink,
  revokeStaffMagicLink,
} from "@/lib/staff-auth";
import { notifySlack } from "@/lib/slack";

/**
 * 근무자 매직링크 발급. 원장/SUPER_ADMIN 만 호출 가능.
 * 발급 후 `/payroll` 재검증 + (옵션) Slack audit 알림.
 */
export async function issueLinkForStaff(userId: string) {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true },
  });
  if (!user) throw new Error("근무자를 찾을 수 없습니다");

  const link = await issueStaffMagicLink(userId, {
    issuedById: session!.user.id,
  });

  // fire-and-forget audit
  notifySlack(
    `🔑 *근무자 매직링크 발급* — ${user.name} (by ${session!.user.name ?? session!.user.id})`,
  ).catch(() => {});

  revalidatePath("/payroll");
  return {
    id: link.id,
    token: link.token,
    expiresAt: link.expiresAt.toISOString(),
  };
}

/** 단일 링크 무효화. */
export async function revokeLink(linkId: string) {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  await revokeStaffMagicLink(linkId);
  revalidatePath("/payroll");
  return { ok: true };
}

/**
 * 근무자의 매직링크 목록(활성+무효화 포함, issuedAt desc).
 * admin UI 의 발급/무효화 패널 데이터 소스.
 */
export async function listLinksForStaff(userId: string) {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  const links = await prisma.staffMagicLink.findMany({
    where: { userId },
    orderBy: { issuedAt: "desc" },
    select: {
      id: true,
      token: true,
      issuedAt: true,
      expiresAt: true,
      revokedAt: true,
      lastAccessedAt: true,
      lastAccessIp: true,
      accessCount: true,
      issuedById: true,
    },
  });

  return links.map((l) => ({
    id: l.id,
    token: l.token,
    issuedAt: l.issuedAt.toISOString(),
    expiresAt: l.expiresAt.toISOString(),
    revokedAt: l.revokedAt?.toISOString() ?? null,
    lastAccessedAt: l.lastAccessedAt?.toISOString() ?? null,
    lastAccessIp: l.lastAccessIp,
    accessCount: l.accessCount,
    issuedById: l.issuedById,
  }));
}
