export const revalidate = 30;

import { getOverallAnalytics, getAttendanceTimeStats } from "@/actions/analytics";
import { auth } from "@/lib/auth";
import { todayKST } from "@/lib/utils";
import { redirect } from "next/navigation";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";

function lastDaysRange(days: number) {
  const to = todayKST();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const [data, d7, d30] = await Promise.all([
    getOverallAnalytics(),
    getAttendanceTimeStats(lastDaysRange(7)),
    getAttendanceTimeStats(lastDaysRange(30)),
  ]);

  return <AnalyticsDashboard data={data} attendanceStats={{ d7, d30 }} />;
}
