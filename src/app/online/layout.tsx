import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getUser } from "@/lib/auth";
import { isOnlineStaff } from "@/lib/roles";

export default async function OnlineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  if (!isOnlineStaff(user.role)) redirect("/");

  return (
    <DashboardShell user={{ name: user.name, email: user.email, role: user.role }}>
      {children}
    </DashboardShell>
  );
}
