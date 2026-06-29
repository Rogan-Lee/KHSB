import type { AuthInviteType } from "@/generated/prisma";

import { hashAuthToken } from "@/lib/auth-tokens";
import { prisma } from "@/lib/prisma";

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

  return {
    expiresAt: invitation.expiresAt.toISOString(),
    name: target?.name ?? "",
    type: invitation.type as AuthInviteType,
    email:
      invitation.type === "STAFF"
        ? invitation.targetUser?.email ?? null
        : null,
  };
}
