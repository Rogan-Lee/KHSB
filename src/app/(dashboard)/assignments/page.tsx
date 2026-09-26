export const revalidate = 30;

import { prisma } from "@/lib/prisma";
import { PageHeader, StatCard, StatCards } from "@/components/backoffice/ui";
import { AssignmentsOverview } from "@/components/assignments/assignments-overview";
import { isFullAccess } from "@/lib/roles";
import { offlineStudentWhere } from "@/lib/student-filters";
import { requireDashboardSession } from "../_lib/page-guard";

export default async function AssignmentsPage() {
  // 세션 필수 — 세션이 없으면 아래 mentorId 필터가 undefined 가 되어 전체 원생 과제가 노출된다.
  const session = await requireDashboardSession();
  const isDirector = isFullAccess(session.user.role);

  // 원생 목록 (활성 · 오프라인 자습실만)
  const students = await prisma.student.findMany({
    where: offlineStudentWhere({
      status: "ACTIVE",
      ...(isDirector ? {} : { mentorId: session.user.id }),
    }),
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

  const total = totalPending + totalCompleted;

  return (
    <div>
      <PageHeader
        title="과제 관리"
        description={
          isDirector
            ? "재원 중인 원생의 과제를 등록하고 완료 여부를 확인해요"
            : "담당 원생의 과제를 등록하고 완료 여부를 확인해요"
        }
      />

      <div className="flex flex-col gap-x6">
        <StatCards cols={3}>
          <StatCard label="미완료 과제" value={totalPending} unit="개" tone={totalPending > 0 ? "warn" : "gray"} />
          <StatCard label="완료 과제" value={totalCompleted} unit="개" />
          <StatCard
            label="완료율"
            value={total === 0 ? "–" : Math.round((totalCompleted / total) * 100)}
            unit={total === 0 ? undefined : "%"}
            sub={total === 0 ? "등록된 과제가 없어요" : `전체 ${total}개 중`}
          />
        </StatCards>

        <AssignmentsOverview students={students} />
      </div>
    </div>
  );
}
