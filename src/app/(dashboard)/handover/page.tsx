export const revalidate = 30;

import { getRecentHandovers, getHandoversSince, getStaffList } from "@/actions/handover";
import { getMonthlyNotes } from "@/actions/monthly-notes";
import { prisma } from "@/lib/prisma";
import { HandoverBoard } from "@/components/handover/handover-board";
import { MonthlyNotesPanel } from "@/components/handover/monthly-notes-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { auth } from "@/lib/auth";

export default async function HandoverPage({
  searchParams,
}: {
  searchParams: Promise<{ since?: string }>;
}) {
  const session = await auth();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const sp = await searchParams;
  const since = sp.since;

  const handoversPromise = since
    ? getHandoversSince(since)
    : getRecentHandovers(14);

  const [handovers, staffList, monthlyNotes, students] = await Promise.all([
    handoversPromise,
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
          activeSince={since}
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
