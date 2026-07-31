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
  const [staff, students, invitations, accounts] = await Promise.all([
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
        type: account.appUserId ? "STAFF" : "STUDENT",
        username: account.username ?? "",
      }))}
      invitations={invitations.map((invitation) => ({
        expiresAt: invitation.expiresAt.toISOString(),
        id: invitation.id,
        name:
          invitation.targetUser?.name ??
          invitation.targetStudent?.name ??
          "알 수 없음",
        status: invitation.revokedAt
          ? "REVOKED"
          : invitation.acceptedAt
            ? "ACCEPTED"
            : invitation.expiresAt < now
              ? "EXPIRED"
              : "PENDING",
        type: invitation.type,
      }))}
      staff={staff}
      students={students}
    />
  );
}
