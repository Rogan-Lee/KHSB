import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getUser } from "@/lib/auth";
import { isOnlineStaff, isStaff } from "@/lib/roles";
import { getUnseenFeatureRequestCount } from "@/actions/feature-requests";
import { getNewSuggestionCount } from "@/actions/student-suggestions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect("/sign-in");

  // 모든 직원 — STAFF_ROLES + ONLINE_ROLES — 가 (dashboard) 접근 가능.
  // 학생 등 비직원은 /sign-in 으로 차단. 원생 관리 등 공통 업무는 전 직원이 사용.
  if (!isStaff(user.role) && !isOnlineStaff(user.role)) {
    redirect("/sign-in");
  }

  // 사이드바 미확인 배지 — 건의사항 unseen 카운트 (전 직원)
  const sidebarBadges: Record<string, number> = {};
  try {
    const unseenRequests = await getUnseenFeatureRequestCount();
    if (unseenRequests > 0) sidebarBadges["/requests"] = unseenRequests;
  } catch {
    // 카운트 실패해도 레이아웃은 그대로 렌더링
  }
  try {
    const newSuggestions = await getNewSuggestionCount();
    if (newSuggestions > 0) sidebarBadges["/suggestions"] = newSuggestions;
  } catch {
    // 카운트 실패해도 레이아웃은 그대로 렌더링
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
