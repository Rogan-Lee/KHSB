"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { getAppUrl } from "@/lib/app-url";
import { createOpaqueToken, hashAuthToken } from "@/lib/auth-tokens";
import { prisma } from "@/lib/prisma";
import { requireFullAccess } from "@/lib/roles";

type CreateInvitationInput =
  | { type: "STAFF"; targetUserId: string }
  | { type: "STUDENT"; targetStudentId: string };

export async function createAuthInvitation(input: CreateInvitationInput) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  requireFullAccess(session.user.role);

  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  if (input.type === "STAFF") {
    const target = await prisma.user.findUnique({
      where: { id: input.targetUserId },
      select: {
        authIdentity: { select: { id: true } },
        id: true,
        status: true,
      },
    });
    if (!target || target.status !== "ACTIVE") {
      throw new Error("활성 직원을 찾을 수 없습니다");
    }
    if (target.authIdentity) {
      throw new Error("이미 로그인 계정이 연결된 직원입니다");
    }

    await prisma.$transaction([
      prisma.authInvitation.updateMany({
        where: {
          targetUserId: target.id,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      }),
      prisma.authInvitation.create({
        data: {
          type: "STAFF",
          tokenHash: hashAuthToken(token),
          targetUserId: target.id,
          invitedById: session.user.id,
          expiresAt,
        },
      }),
    ]);
  } else {
    const target = await prisma.student.findUnique({
      where: { id: input.targetStudentId },
      select: {
        authIdentity: { select: { id: true } },
        id: true,
        status: true,
      },
    });
    if (!target || target.status !== "ACTIVE") {
      throw new Error("활성 학생을 찾을 수 없습니다");
    }
    if (target.authIdentity) {
      throw new Error("이미 로그인 계정이 연결된 학생입니다");
    }

    await prisma.$transaction([
      prisma.authInvitation.updateMany({
        where: {
          targetStudentId: target.id,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      }),
      prisma.authInvitation.create({
        data: {
          type: "STUDENT",
          tokenHash: hashAuthToken(token),
          targetStudentId: target.id,
          invitedById: session.user.id,
          expiresAt,
        },
      }),
    ]);
  }

  revalidatePath("/admin/auth");

  return {
    expiresAt: expiresAt.toISOString(),
    url: `${getAppUrl()}/sign-up?token=${encodeURIComponent(token)}`,
  };
}

export async function revokeAuthInvitation(invitationId: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  requireFullAccess(session.user.role);

  await prisma.authInvitation.updateMany({
    where: {
      id: invitationId,
      acceptedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  revalidatePath("/admin/auth");
}
