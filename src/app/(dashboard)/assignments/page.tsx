import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { AssignmentsOverview } from "@/components/assignments/assignments-overview";
import { isFullAccess } from "@/lib/roles";

export default async function AssignmentsPage() {
  const user = await getUser();
  if (!user?.orgId) return null;
  const orgId = user.orgId;
  const isDirector = isFullAccess(user?.role);

  // 원생 목록 (활성)
  const students = await prisma.student.findMany({
    where: {
      orgId,
      status: "ACTIVE",
      ...(isDirector ? {} : { mentorId: user?.id }),
    },
    select: {
      id: true,
      name: true,
      grade: true,
      assignments: {
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { name: "asc" },
  });

  const totalPending = students.reduce(
    (acc, s) => acc + s.assignments.filter((a) => !a.isCompleted).length,
    0
  );
  const totalCompleted = students.reduce(
    (acc, s) => acc + s.assignments.filter((a) => a.isCompleted).length,
    0
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">과제 관리</h1>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">미완료 과제</p>
            <p className="text-2xl font-bold text-orange-500">{totalPending}개</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">완료 과제</p>
            <p className="text-2xl font-bold text-green-600">{totalCompleted}개</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">완료율</p>
            <p className="text-2xl font-bold">
              {totalPending + totalCompleted === 0
                ? "–"
                : `${Math.round((totalCompleted / (totalPending + totalCompleted)) * 100)}%`}
            </p>
          </CardContent>
        </Card>
      </div>

      <AssignmentsOverview students={students} />
    </div>
  );
}
