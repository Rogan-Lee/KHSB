export const revalidate = 30;

import { getOverallAnalytics } from "@/actions/analytics";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  if (session.user.role !== "DIRECTOR" && session.user.role !== "ADMIN") redirect("/");

  const data = await getOverallAnalytics();

  return <AnalyticsDashboard data={data} />;
}
