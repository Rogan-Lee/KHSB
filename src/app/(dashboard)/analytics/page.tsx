export const revalidate = 30;

import { getOverallAnalytics, getAttendanceTimeStats } from "@/actions/analytics";
import { isStaff } from "@/lib/roles";
import { todayKST } from "@/lib/utils";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";
import { requireDashboardSession } from "../_lib/page-guard";

function lastDaysRange(days: number) {
  const to = todayKST();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default async function AnalyticsPage() {
  // 리포트·분석 메뉴는 자습실 직원 전용(nav insights 그룹 = isStaff, getAttendanceTimeStats 도 requireStaff)
  await requireDashboardSession(isStaff);

  const [data, d7, d30] = await Promise.all([
    getOverallAnalytics(),
    getAttendanceTimeStats(lastDaysRange(7)),
    getAttendanceTimeStats(lastDaysRange(30)),
  ]);

  return <AnalyticsDashboard data={data} attendanceStats={{ d7, d30 }} />;
}
