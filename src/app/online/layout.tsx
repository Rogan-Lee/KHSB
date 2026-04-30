import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getUser } from "@/lib/auth";
import { isOnlineStaff, isFullAccess } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

export default async function OnlineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  if (!isOnlineStaff(user.role)) redirect("/");

  // 사이드바 미확인 배지 — 원장만 학부모 피드백 카운트 표시
  const sidebarBadges: Record<string, number> = {};
  if (isFullAccess(user.role)) {
    const unread = await prisma.onlineParentFeedback.count({
      where: { readAt: null },
    });
    if (unread > 0) sidebarBadges["/online/reports"] = unread;
  }

  return (
    <DashboardShell
      user={{ name: user.name, email: user.email, role: user.role }}
      sidebarBadges={sidebarBadges}
    >
      {children}
    </DashboardShell>
  );
}
