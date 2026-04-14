import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MeritForm } from "@/components/merit-demerit/merit-form";
import { MeritHistoryTable } from "@/components/merit-demerit/merit-history-table";
import { MeritRangeReport } from "@/components/merit-demerit/merit-range-report";
import { MeritRanking } from "@/components/merit-demerit/merit-ranking";
import { Trophy, TrendingDown, CalendarSearch } from "lucide-react";

export default async function MeritDemeritPage() {
  const [students, recentMerits] = await Promise.all([
    prisma.student.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, grade: true, seat: true },
      orderBy: [{ seat: { sort: "asc", nulls: "last" } }, { name: "asc" }],
    }),
    prisma.meritDemerit.findMany({
      include: { student: { select: { name: true, grade: true } } },
      orderBy: { date: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        {/* Ranking */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            <CardTitle className="text-base">이달의 순점수 랭킹</CardTitle>
            <span className="text-xs text-muted-foreground ml-auto">매월 1일 초기화</span>
          </CardHeader>
          <CardContent>
            <MeritRanking />
          </CardContent>
        </Card>

        {/* Add form */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <TrendingDown className="h-5 w-5" />
            <CardTitle className="text-base">상벌점 부여</CardTitle>
          </CardHeader>
          <CardContent>
            <MeritForm students={students} />
          </CardContent>
        </Card>
      </div>

      {/* 기간별 조회 */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <CalendarSearch className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">기간별 상벌점 조회</CardTitle>
        </CardHeader>
        <CardContent>
          <MeritRangeReport />
        </CardContent>
      </Card>

      {/* Recent history */}
      <Card>
        <CardHeader>
          <CardTitle>최근 상벌점 내역</CardTitle>
        </CardHeader>
        <CardContent>
          <MeritHistoryTable records={recentMerits} />
        </CardContent>
      </Card>
    </div>
  );
}
