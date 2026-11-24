import type { AuthInviteType } from "@/generated/prisma";

import { hashAuthToken } from "@/lib/auth-tokens";
import { prisma } from "@/lib/prisma";
import { signupUnder14 } from "@/lib/privacy/signup-consent-server";

export type BulkInvitationResult = {
  error?: string;
  expiresAt?: string;
  id: string;
  name: string;
  ok: boolean;
  url?: string;
};

export async function findValidAuthInvitation(token: string) {
  if (!token) return null;

  return prisma.authInvitation.findFirst({
    where: {
      tokenHash: hashAuthToken(token),
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: {
      targetStudent: {
        select: {
          authIdentity: { select: { id: true } },
          birthDate: true,
          grade: true,
          id: true,
          name: true,
          status: true,
        },
      },
      targetUser: {
        select: {
          authIdentity: { select: { id: true } },
          email: true,
          id: true,
          name: true,
          role: true,
          status: true,
        },
      },
    },
  });
}

export function toPublicInvitation(
  invitation: NonNullable<Awaited<ReturnType<typeof findValidAuthInvitation>>>,
) {
  const target =
    invitation.type === "STAFF"
      ? invitation.targetUser
      : invitation.targetStudent;
  const baseName = target?.name ?? "";

  return {
    expiresAt: invitation.expiresAt.toISOString(),
    name: invitation.type === "PARENT" ? `${baseName} 학부모` : baseName,
    type: invitation.type as AuthInviteType,
    email:
      invitation.type === "STAFF"
        ? invitation.targetUser?.email ?? null
        : null,
    /** 학생 초대이고 만 14세 미만이면 true — 가입 화면에 보호자 동의 확인 항목을 보여 준다 */
    under14: signupUnder14(invitation.type, invitation.targetStudent),
  };
}
