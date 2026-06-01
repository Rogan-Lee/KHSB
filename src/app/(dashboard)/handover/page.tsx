export const revalidate = 30;

import { getHandoversBetween, getStaffList } from "@/actions/handover";
import { getMonthlyNotes } from "@/actions/monthly-notes";
import { prisma } from "@/lib/prisma";
import { HandoverBoard } from "@/components/handover/handover-board";
import { MonthlyNotesPanel } from "@/components/handover/monthly-notes-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { auth } from "@/lib/auth";
import { resolveDateRange } from "@/lib/date-range";

export default async function HandoverPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const sp = await searchParams;

  // 조회 범위(서버 필터). 기본 최근 60일 ~ 오늘+14일 (다른 리스트와 동일).
  const { initialFrom, initialTo } = resolveDateRange(sp.from, sp.to);

  const [handovers, staffList, monthlyNotes, students] = await Promise.all([
    getHandoversBetween(initialFrom, initialTo),
    getStaffList(),
    getMonthlyNotes(year, month),
    prisma.student.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, grade: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <Tabs defaultValue="daily" className="space-y-4">
      <TabsList>
        <TabsTrigger value="daily">일일 인수인계</TabsTrigger>
        <TabsTrigger value="monthly">
          월간 노트
          <span className="ml-1.5 text-[10px] bg-muted-foreground/10 text-muted-foreground px-1.5 py-0.5 rounded-full">
            {year}.{String(month).padStart(2, "0")}
          </span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="daily">
        <HandoverBoard
          initialHandovers={handovers as Parameters<typeof HandoverBoard>[0]["initialHandovers"]}
          staffList={staffList}
          currentUserId={session?.user?.id ?? ""}
          currentUserName={session?.user?.name ?? ""}
          currentUserRole={session?.user?.role ?? ""}
          initialDateFrom={initialFrom}
          initialDateTo={initialTo}
        />
      </TabsContent>

      <TabsContent value="monthly">
        <MonthlyNotesPanel
          initialNotes={monthlyNotes}
          students={students}
          year={year}
          month={month}
          currentUserId={session?.user?.id ?? ""}
          currentUserRole={session?.user?.role ?? ""}
        />
      </TabsContent>
    </Tabs>
  );
}
