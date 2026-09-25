import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isFullAccess } from "@/lib/roles";
import { getSchoolStats } from "@/actions/dashboard-widgets";
import { PageHeader, Section } from "@/components/backoffice/ui";
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
    <>
      <PageHeader
        title="학교별 원생 통계"
        description="학교별 재원 수와 달마다 늘고 준 원생 수를 한눈에 볼 수 있어요."
      />
      <Section>
        <SchoolStatsBoard year={year} month={month} rows={rows} />
      </Section>
    </>
  );
}
