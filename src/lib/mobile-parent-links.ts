// 학부모 — 이미 로그인한 학부모 계정에 자녀 추가 연결 (학부모 초대 코드 사용).
// 가입 시 초대 수락(src/lib/auth-server.ts databaseHooks)과 같은 규칙: 초대 1회용, 자녀 목록은
// resolveParentInviteTargets(새 필드 우선 → 레거시 AuthVerification 페이로드 폴백).
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { findValidAuthInvitation } from "@/lib/auth-invitations";
import { hashAuthToken } from "@/lib/auth-tokens";
import { MobileApiError } from "@/lib/mobile-auth";
import { resolveParentInviteTargets } from "@/lib/parent-invite";
import { prisma } from "@/lib/prisma";

type ParentSession = {
  authUserId: string;
  children: { id: string }[];
};

const tokenSchema = z
  .string({ error: "초대 코드를 입력해 주세요" })
  .trim()
  .min(1, "초대 코드를 입력해 주세요")
  .max(2000, "초대 코드가 너무 길어요");

const redeemSchema = z.object({ inviteToken: tokenSchema });

/** 초대 링크(…/sign-up?token=…) 또는 코드 자체 → 토큰 */
export function extractInviteToken(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes("://")) {
    try {
      return new URL(trimmed).searchParams.get("token")?.trim() ?? "";
    } catch {
      return "";
    }
  }
  const m = /(?:^|[?&])token=([^&\s]+)/.exec(trimmed);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }
  return trimmed;
}

async function loadParentInvite(rawToken: string) {
  const token = extractInviteToken(rawToken);
  if (!token) throw new MobileApiError("초대 코드를 확인해 주세요", 400);

  const invitation = await findValidAuthInvitation(token);
  if (!invitation) {
    throw new MobileApiError("유효하지 않거나 만료된 초대 코드예요", 404);
  }
  if (invitation.type !== "PARENT") {
    throw new MobileApiError("학부모 초대 코드가 아니에요", 400);
  }

  const legacy =
    invitation.targetStudentIds.length === 0
      ? await prisma.authVerification.findFirst({
          where: { identifier: `parent-invite:${hashAuthToken(token)}` },
          select: { value: true },
        })
      : null;
  const { studentIds, relation } = resolveParentInviteTargets(
    invitation,
    legacy?.value ?? null,
  );

  const students = await prisma.student.findMany({
    where: { id: { in: studentIds }, status: "ACTIVE" },
    select: { id: true, name: true, grade: true, seat: true },
    orderBy: { name: "asc" },
  });
  if (students.length === 0) {
    throw new MobileApiError("이 초대로 연결할 수 있는 자녀가 없어요", 404);
  }

  return { invitation, students, relation };
}

/** 연결 전 미리보기 — 초대에 담긴 자녀와 이미 연결된 자녀 표시 */
export async function previewParentLink(parent: ParentSession, rawToken: string | null) {
  const parsed = tokenSchema.safeParse(rawToken ?? "");
  if (!parsed.success) {
    throw new MobileApiError(parsed.error.issues[0]?.message ?? "초대 코드를 입력해 주세요", 400);
  }
  const { invitation, students, relation } = await loadParentInvite(parsed.data);
  const linked = new Set(parent.children.map((c) => c.id));

  return {
    expiresAt: invitation.expiresAt.toISOString(),
    relation,
    children: students.map((s) => ({ ...s, alreadyLinked: linked.has(s.id) })),
  };
}

/** 초대 사용 → ParentLink 생성 (초대는 1회용으로 소진) */
export async function redeemParentLink(parent: ParentSession, body: unknown) {
  const parsed = redeemSchema.safeParse(body);
  if (!parsed.success) {
    throw new MobileApiError(parsed.error.issues[0]?.message ?? "초대 코드를 입력해 주세요", 400);
  }
  const { invitation, students, relation } = await loadParentInvite(parsed.data.inviteToken);
  const linked = new Set(parent.children.map((c) => c.id));
  const added = students.filter((s) => !linked.has(s.id));
  if (added.length === 0) {
    throw new MobileApiError("이미 연결된 자녀예요", 409);
  }

  await prisma.$transaction(async (tx) => {
    // 동시에 두 번 눌러도 한 번만 소진되도록 조건부 갱신으로 선점
    const claimed = await tx.authInvitation.updateMany({
      where: {
        id: invitation.id,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { acceptedAt: new Date(), acceptedById: parent.authUserId },
    });
    if (claimed.count === 0) {
      throw new MobileApiError("이미 사용된 초대 코드예요", 409);
    }
    await tx.parentLink.createMany({
      data: added.map((s) => ({
        authUserId: parent.authUserId,
        studentId: s.id,
        relation,
      })),
      skipDuplicates: true,
    });
  });

  revalidatePath("/admin/auth");

  return { added };
}
