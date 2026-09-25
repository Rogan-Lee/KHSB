export const revalidate = 30;

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isFullAccess } from "@/lib/roles";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, Section } from "@/components/backoffice/ui";
import { MeritForm } from "@/components/merit-demerit/merit-form";
import { MeritHistoryTable } from "@/components/merit-demerit/merit-history-table";
import { MeritRangeReport } from "@/components/merit-demerit/merit-range-report";
import { MeritRanking } from "@/components/merit-demerit/merit-ranking";
import { RewardShopAdmin } from "@/components/merit-demerit/reward-shop-admin";
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
    <>
      <PageHeader
        title="상벌점"
        description="상·벌점을 부여하고, 이달 랭킹과 기간별 내역을 확인해요."
      />

      <Tabs defaultValue="merits">
        <TabsList>
          <TabsTrigger value="merits">상벌점</TabsTrigger>
          <TabsTrigger value="shop">
            포인트 상점
            {pendingCount > 0 && <span className="t4-bold tabular-nums text-fg-brand">{pendingCount}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="merits" className="mt-x6 flex flex-col gap-x8">
          <div className="grid grid-cols-1 items-start gap-x6 lg:grid-cols-2">
            <Section title="상벌점 부여" description="여러 원생을 한 번에 골라 같은 점수를 줄 수 있어요.">
              <MeritForm students={students} />
            </Section>

            <Section title="이달의 순점수 랭킹" description="상점에서 벌점을 뺀 점수 기준 · 매월 1일 초기화">
              <MeritRanking />
            </Section>
          </div>

          <Section variant="plain" title="기간별 조회" description="기간을 정해 원생별 상·벌점 합계를 모아 봐요.">
            <MeritRangeReport />
          </Section>

          <Section variant="plain" title="최근 상벌점 내역" description="최근 50건이에요. 오늘만 켜면 오늘 부여한 내역 전체를 불러와요.">
            <MeritHistoryTable records={recentMerits} />
          </Section>
        </TabsContent>

        <TabsContent value="shop" className="mt-x6">
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
        </TabsContent>
      </Tabs>
    </>
  );
}
