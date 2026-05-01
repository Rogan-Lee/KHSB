import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getUser } from "@/lib/auth";
import { isOnlineStaff, isStaff } from "@/lib/roles";

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

  return (
    <DashboardShell user={{ name: user.name, email: user.email, role: user.role }}>
      {children}
    </DashboardShell>
  );
}
