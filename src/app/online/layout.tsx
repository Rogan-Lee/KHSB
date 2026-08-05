import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getUser } from "@/lib/auth";
import { isAnyStaff } from "@/lib/roles";
import { getSidebarBadges } from "@/lib/sidebar-badges";

export default async function OnlineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  // 전 직원 대상 화면(수행평가·학생 메시지·등원 스케줄)이 /online/* 하위에 있으므로
  // 레이아웃은 전 직원 허용. 온라인 전용 화면은 각 페이지에서 isOnlineStaff/isFullAccess 로 가드.
  if (!isAnyStaff(user.role)) redirect("/");

  // 사이드바 미확인 배지 — 초기 스냅샷. 이후 갱신은 DashboardShell이 /api/sidebar-badges 폴링
  const sidebarBadges = await getSidebarBadges(user.id, user.role).catch(() => ({}));

  return (
    <DashboardShell
      user={{ name: user.name, email: user.email, role: user.role }}
      sidebarBadges={sidebarBadges}
    >
      {children}
    </DashboardShell>
  );
}
