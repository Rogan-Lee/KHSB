import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getUser } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  if (!user.orgId) redirect("/onboarding");

  return (
    <DashboardShell
      user={{ name: user.name, email: user.email, role: user.role }}
      plan={user.orgPlan!}
      orgName={user.orgName}
      trialEndsAt={user.trialEndsAt}
    >
      {children}
    </DashboardShell>
  );
}
