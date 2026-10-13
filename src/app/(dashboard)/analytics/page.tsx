export const revalidate = 30;

import { getOverallAnalytics, getAttendanceTimeStatsForRanges } from "@/actions/analytics";
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

  // 7일·30일 통계는 30일 범위를 한 번만 조회해 나눈다 (egress 절감)
  const [data, [d7, d30]] = await Promise.all([
    getOverallAnalytics(),
    getAttendanceTimeStatsForRanges([lastDaysRange(7), lastDaysRange(30)]),
  ]);

  return <AnalyticsDashboard data={data} attendanceStats={{ d7, d30 }} />;
}
