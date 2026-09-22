import { redirect } from "next/navigation";

import { AuthInvitationManager } from "@/components/auth/auth-invitation-manager";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireFullAccess } from "@/lib/roles";

export default async function AuthAdminPage() {
  const session = await auth();
  if (!session) redirect("/sign-in");
  requireFullAccess(session.user.role);

  const now = new Date();
  const [staff, students, parentStudents, invitations, accounts] =
    await Promise.all([
      prisma.user.findMany({
        where: {
          status: "ACTIVE",
          authIdentity: null,
          role: { not: "STUDENT" },
        },
        orderBy: { name: "asc" },
        select: {
          email: true,
          id: true,
          name: true,
          role: true,
        },
      }),
      prisma.student.findMany({
        where: {
          status: "ACTIVE",
          authIdentity: null,
        },
        orderBy: [{ isOnlineManaged: "desc" }, { name: "asc" }],
        select: {
          grade: true,
          id: true,
          isOnlineManaged: true,
          name: true,
        },
      }),
      // 학부모 초대 대상: 학생 본인 계정 유무와 무관하게 전체 활성 학생
      prisma.student.findMany({
        where: { status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: {
          grade: true,
          id: true,
          name: true,
          parentPhone: true,
        },
      }),
      prisma.authInvitation.findMany({
        orderBy: { createdAt: "desc" },
        take: 60,
        include: {
          targetStudent: { select: { name: true } },
          targetUser: { select: { name: true } },
        },
      }),
      prisma.authUser.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          appUserId: true,
          email: true,
          id: true,
          name: true,
          studentId: true,
          username: true,
        },
      }),
    ]);

  return (
    <AuthInvitationManager
      accounts={accounts.map((account) => ({
        email: account.email,
        id: account.id,
        name: account.name,
        type: account.appUserId
          ? "STAFF"
          : account.studentId
            ? "STUDENT"
            : "PARENT",
        username: account.username ?? "",
      }))}
      invitations={invitations.map((invitation) => {
        const baseName =
          invitation.targetUser?.name ??
          invitation.targetStudent?.name ??
          "알 수 없음";
        return {
          expiresAt: invitation.expiresAt.toISOString(),
          id: invitation.id,
          name:
            invitation.type === "PARENT" ? `${baseName} 학부모` : baseName,
          status: invitation.revokedAt
            ? "REVOKED"
            : invitation.acceptedAt
              ? "ACCEPTED"
              : invitation.expiresAt < now
                ? "EXPIRED"
                : "PENDING",
          type: invitation.type,
        };
      })}
      parentStudents={parentStudents}
      staff={staff}
      students={students}
    />
  );
}
