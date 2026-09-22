export const revalidate = 30;

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isFullAccess } from "@/lib/roles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MeritForm } from "@/components/merit-demerit/merit-form";
import { MeritHistoryTable } from "@/components/merit-demerit/merit-history-table";
import { MeritRangeReport } from "@/components/merit-demerit/merit-range-report";
import { MeritRanking } from "@/components/merit-demerit/merit-ranking";
import { RewardShopAdmin } from "@/components/merit-demerit/reward-shop-admin";
import { Trophy, TrendingDown, CalendarSearch, Gift } from "lucide-react";
import { offlineStudentWhere } from "@/lib/student-filters";

export default async function MeritDemeritPage() {
  const [session, students, recentMerits, redemptions, rewardItems] = await Promise.all([
    auth(),
    prisma.student.findMany({
      where: offlineStudentWhere({ status: "ACTIVE" }),
      select: { id: true, name: true, grade: true, seat: true },
    }),
    prisma.meritDemerit.findMany({
      include: { student: { select: { name: true, grade: true } } },
      orderBy: { date: "desc" },
      take: 50,
    }),
    prisma.rewardRedemption.findMany({
      include: { student: { select: { name: true, grade: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.rewardItem.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  // 좌석번호 숫자순 정렬 (1, 2, 3, ... 10, 11), 좌석 없는 학생은 마지막
  students.sort((a, b) => {
    const numA = a.seat ? parseInt(a.seat, 10) : Infinity;
    const numB = b.seat ? parseInt(b.seat, 10) : Infinity;
    if (numA !== numB) return numA - numB;
    return a.name.localeCompare(b.name, "ko");
  });

  const pendingCount = redemptions.filter((r) => r.status === "PENDING").length;

  return (
    <Tabs defaultValue="merits" className="space-y-4">
      <TabsList>
        <TabsTrigger value="merits">상벌점</TabsTrigger>
        <TabsTrigger value="shop">
          포인트 상점{pendingCount > 0 ? ` (${pendingCount})` : ""}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="merits" className="space-y-6">
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
      </TabsContent>

      <TabsContent value="shop">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Gift className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">포인트 상점 (기프티콘 교환)</CardTitle>
            <span className="text-xs text-muted-foreground ml-auto">25점 = 10,000원</span>
          </CardHeader>
          <CardContent>
            <RewardShopAdmin
              redemptions={redemptions.map((r) => ({
                id: r.id,
                studentName: r.student.name,
                grade: r.student.grade,
                itemName: r.itemName,
                points: r.points,
                status: r.status,
                note: r.note,
                decidedByName: r.decidedByName,
                createdAt: r.createdAt.toISOString(),
              }))}
              items={rewardItems.map((i) => ({
                id: i.id,
                name: i.name,
                points: i.points,
                active: i.active,
                sortOrder: i.sortOrder,
              }))}
              canManageItems={isFullAccess(session?.user?.role)}
            />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
