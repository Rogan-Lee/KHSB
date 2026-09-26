import { prisma } from "@/lib/prisma";
import { NewMentoringForm } from "@/components/mentoring/new-mentoring-form";
import { offlineStudentWhere } from "@/lib/student-filters";
import { isStaff } from "@/lib/roles";
import { requireDashboardSession } from "../../_lib/page-guard";

export default async function NewMentoringPage() {
  // 오프라인 멘토링 업무 — /mentoring 목록과 같은 기준 (온라인 전용 역할 제외)
  await requireDashboardSession(isStaff);

  const students = await prisma.student.findMany({
    where: offlineStudentWhere({ status: "ACTIVE" }),
    select: { id: true, name: true, grade: true, school: true },
    orderBy: { name: "asc" },
  });

  return <NewMentoringForm students={students} />;
}
