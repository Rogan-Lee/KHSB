import {
  findValidAuthInvitation,
  toPublicInvitation,
} from "@/lib/auth-invitations";
import { resolveParentInviteTargets } from "@/lib/parent-invite";
import { prisma } from "@/lib/prisma";
import { ROLE_DISPLAY } from "@/lib/roles";

// 앱 초대 가입 화면용 초대 정보 — 웹 sign-up 과 같은 공개 필드 + 초대한 사람·자녀 이름.
// 토큰을 가진 사람(초대받은 본인)만 조회할 수 있으므로 이름 수준 정보만 내려준다.

export type MobileInvitationView = ReturnType<typeof toPublicInvitation> & {
  /** 초대를 보낸 직원 이름 (예: "김원장") */
  inviterName: string | null;
  /** 초대를 보낸 직원 직책 (예: "원장") */
  inviterRole: string | null;
  /** 학부모 초대: 연결될 자녀 이름들 */
  children: string[];
  /** 학부모 초대: 관계 (모/부 등) */
  relation: string | null;
};

export async function getMobileInvitation(
  token: string,
): Promise<MobileInvitationView | null> {
  const invitation = await findValidAuthInvitation(token.trim());
  if (!invitation) return null;

  const detail = await prisma.authInvitation.findUnique({
    where: { id: invitation.id },
    select: {
      invitedBy: { select: { name: true, role: true } },
      parentRelation: true,
      targetStudentId: true,
      targetStudentIds: true,
      tokenHash: true,
    },
  });

  let children: string[] = [];
  let relation: string | null = null;
  if (invitation.type === "PARENT" && detail) {
    // 새 필드(targetStudentIds)가 비어 있는 예전 초대는 AuthVerification 페이로드로 폴백
    const legacyRow =
      detail.targetStudentIds.length === 0
        ? await prisma.authVerification.findFirst({
            where: { identifier: `parent-invite:${detail.tokenHash}` },
            select: { value: true },
          })
        : null;
    const targets = resolveParentInviteTargets(detail, legacyRow?.value ?? null);
    relation = targets.relation;
    if (targets.studentIds.length > 0) {
      const students = await prisma.student.findMany({
        where: { id: { in: targets.studentIds }, status: "ACTIVE" },
        select: { id: true, name: true },
      });
      const byId = new Map(students.map((s) => [s.id, s.name]));
      children = targets.studentIds
        .map((id) => byId.get(id))
        .filter((name): name is string => !!name);
    }
  }

  return {
    ...toPublicInvitation(invitation),
    inviterName: detail?.invitedBy?.name ?? null,
    inviterRole: detail?.invitedBy
      ? (ROLE_DISPLAY[detail.invitedBy.role] ?? null)
      : null,
    children,
    relation,
  };
}
