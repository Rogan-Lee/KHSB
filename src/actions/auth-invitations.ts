"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { authServer } from "@/lib/auth-server";
import { getAppUrl } from "@/lib/app-url";
import type { BulkInvitationResult } from "@/lib/auth-invitations";
import { createOpaqueToken, hashAuthToken } from "@/lib/auth-tokens";
import { prisma } from "@/lib/prisma";
import { requireFullAccess } from "@/lib/roles";

type CreateInvitationInput =
  | { type: "STAFF"; targetUserId: string }
  | { type: "STUDENT"; targetStudentId: string };

type BulkInvitationInput =
  | { type: "STAFF"; targetUserIds: string[] }
  | { type: "STUDENT"; targetStudentIds: string[] };

type IssuedInvitation = {
  expiresAt: string;
  name: string;
  url: string;
};

const INVITATION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

async function issueStaffInvitation(
  targetUserId: string,
  invitedById: string,
): Promise<IssuedInvitation> {
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      authIdentity: { select: { id: true } },
      id: true,
      name: true,
      status: true,
    },
  });
  if (!target || target.status !== "ACTIVE") {
    throw new Error("활성 직원을 찾을 수 없습니다");
  }
  if (target.authIdentity) {
    throw new Error("이미 로그인 계정이 연결된 직원입니다");
  }

  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

  await prisma.$transaction([
    prisma.authInvitation.updateMany({
      where: { targetUserId: target.id, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.authInvitation.create({
      data: {
        type: "STAFF",
        tokenHash: hashAuthToken(token),
        targetUserId: target.id,
        invitedById,
        expiresAt,
      },
    }),
  ]);

  return {
    expiresAt: expiresAt.toISOString(),
    name: target.name,
    url: `${getAppUrl()}/sign-up?token=${encodeURIComponent(token)}`,
  };
}

async function issueStudentInvitation(
  targetStudentId: string,
  invitedById: string,
): Promise<IssuedInvitation> {
  const target = await prisma.student.findUnique({
    where: { id: targetStudentId },
    select: {
      authIdentity: { select: { id: true } },
      id: true,
      name: true,
      status: true,
    },
  });
  if (!target || target.status !== "ACTIVE") {
    throw new Error("활성 학생을 찾을 수 없습니다");
  }
  if (target.authIdentity) {
    throw new Error("이미 로그인 계정이 연결된 학생입니다");
  }

  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

  await prisma.$transaction([
    prisma.authInvitation.updateMany({
      where: { targetStudentId: target.id, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.authInvitation.create({
      data: {
        type: "STUDENT",
        tokenHash: hashAuthToken(token),
        targetStudentId: target.id,
        invitedById,
        expiresAt,
      },
    }),
  ]);

  return {
    expiresAt: expiresAt.toISOString(),
    name: target.name,
    url: `${getAppUrl()}/sign-up?token=${encodeURIComponent(token)}`,
  };
}

export async function createAuthInvitation(input: CreateInvitationInput) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  requireFullAccess(session.user.role);

  const issued =
    input.type === "STAFF"
      ? await issueStaffInvitation(input.targetUserId, session.user.id)
      : await issueStudentInvitation(input.targetStudentId, session.user.id);

  revalidatePath("/admin/auth");

  return { expiresAt: issued.expiresAt, url: issued.url };
}

export async function createAuthInvitationsBulk(
  input: BulkInvitationInput,
): Promise<BulkInvitationResult[]> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  requireFullAccess(session.user.role);

  const ids =
    input.type === "STAFF" ? input.targetUserIds : input.targetStudentIds;
  const uniqueIds = Array.from(new Set(ids)).slice(0, 200);

  const results: BulkInvitationResult[] = [];
  // 순차 처리: 풀 고갈을 피하고 각 대상별 성공/실패를 독립적으로 수집한다.
  for (const id of uniqueIds) {
    try {
      const issued =
        input.type === "STAFF"
          ? await issueStaffInvitation(id, session.user.id)
          : await issueStudentInvitation(id, session.user.id);
      results.push({
        expiresAt: issued.expiresAt,
        id,
        name: issued.name,
        ok: true,
        url: issued.url,
      });
    } catch (error) {
      results.push({
        error: error instanceof Error ? error.message : "초대를 만들지 못했습니다",
        id,
        name: "",
        ok: false,
      });
    }
  }

  revalidatePath("/admin/auth");

  return results;
}

export async function sendPasswordResetForAccount(email: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  requireFullAccess(session.user.role);

  // Better Auth는 이메일 존재 여부와 무관하게 성공을 반환한다(계정 열거 방지).
  // 관리자는 계정 목록에서 골랐으므로 존재는 보장된다.
  await authServer.api.requestPasswordReset({
    body: { email, redirectTo: "/reset-password" },
  });
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
