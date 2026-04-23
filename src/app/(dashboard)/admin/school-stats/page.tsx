import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isFullAccess } from "@/lib/roles";
import { getSchoolStats } from "@/actions/dashboard-widgets";
import { PageIntro } from "@/components/ui/page-intro";
import { Card, CardContent } from "@/components/ui/card";
import { SchoolStatsBoard } from "@/components/dashboard/school-stats-board";

export const dynamic = "force-dynamic";

export default async function SchoolStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  if (!isFullAccess(session.user.role)) redirect("/");

  const now = new Date();
  const sp = await searchParams;
  const year = sp.year ? Number(sp.year) : now.getFullYear();
  const month = sp.month ? Number(sp.month) : now.getMonth() + 1;

  const rows = await getSchoolStats(year, month);

  return (
    <div className="space-y-4">
      <PageIntro
        tag="ADMIN · SCHOOL STATS"
        title="학교별 원생 통계"
        description="학교별 재원 수와 월별 신규/이탈 증감을 한 눈에"
        accent="text-info"
      />
      <Card>
        <CardContent className="pt-4">
          <SchoolStatsBoard year={year} month={month} rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
