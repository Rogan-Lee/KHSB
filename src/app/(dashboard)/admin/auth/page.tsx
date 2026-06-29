import { redirect } from "next/navigation";

import { AuthInvitationManager } from "@/components/auth/auth-invitation-manager";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireFullAccess } from "@/lib/roles";

export default async function AuthAdminPage() {
  const session = await auth();
  if (!session) redirect("/sign-in");
  requireFullAccess(session.user.role);

  const [staff, students, invitations] = await Promise.all([
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
      where: {
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        targetStudent: { select: { name: true } },
        targetUser: { select: { name: true } },
      },
    }),
  ]);

  return (
    <AuthInvitationManager
      invitations={invitations.map((invitation) => ({
        createdAt: invitation.createdAt.toISOString(),
        expiresAt: invitation.expiresAt.toISOString(),
        id: invitation.id,
        name:
          invitation.targetUser?.name ??
          invitation.targetStudent?.name ??
          "알 수 없음",
        type: invitation.type,
      }))}
      staff={staff}
      students={students}
    />
  );
}
