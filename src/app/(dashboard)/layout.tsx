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

  // 오프라인 자습실 화면 접근은 STAFF_ROLES 만.
  // 온라인 전용 역할(CONSULTANT · MANAGER_MENTOR)은 /online 으로 라우팅.
  if (!isStaff(user.role)) {
    if (isOnlineStaff(user.role)) redirect("/online");
    redirect("/sign-in");
  }

  return (
    <DashboardShell user={{ name: user.name, email: user.email, role: user.role }}>
      {children}
    </DashboardShell>
  );
}
