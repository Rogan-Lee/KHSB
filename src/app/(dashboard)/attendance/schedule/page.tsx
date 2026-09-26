import { prisma } from "@/lib/prisma";
import { ScheduleEditor } from "@/components/attendance/schedule-editor";
import { offlineStudentWhere } from "@/lib/student-filters";
import { PageHeader } from "@/components/backoffice/ui";
import { requireDashboardSession } from "../../_lib/page-guard";

export default async function AttendanceSchedulePage() {
  await requireDashboardSession();
  const students = await prisma.student.findMany({
    where: offlineStudentWhere({ status: "ACTIVE" }),
    include: { schedules: true, outings: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader
        back={{ href: "/attendance", label: "입퇴실 관리" }}
        title="등원 일정"
        description="원생별 등원 요일과 입·퇴실 약속 시간을 정해요. 이 일정을 기준으로 결석 여부를 확인해요."
      />
      <ScheduleEditor students={students} />
    </div>
  );
}
