import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isOnlineStaff, isManagerMentor, isFullAccess } from "@/lib/roles";
import { MonthlyPlanEditor } from "@/components/online/monthly-plan-editor";
import type {
  MonthlyGoals,
  MonthlyMilestones,
} from "@/actions/online/monthly-plans";
import { currentYearMonthKST } from "@/lib/online/month";
import { DEFAULT_SUBJECTS } from "@/lib/online/subjects";
import { StudentDetailHeader } from "../_components/student-detail-header";

export default async function StudentMonthlyPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { id } = await params;
  const { month } = await searchParams;
  const user = await getUser();
  if (!isOnlineStaff(user?.role)) redirect("/");
  const canEdit = isManagerMentor(user?.role) || isFullAccess(user?.role);

  const yearMonth = month ?? currentYearMonthKST();
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) notFound();

  const student = await prisma.student.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      grade: true,
      status: true,
      isOnlineManaged: true,
      selectedSubjects: true,
    },
  });
  if (!student || !student.isOnlineManaged) notFound();

  const customSubjects = (student.selectedSubjects ?? "")
    .split(/[,\s/·]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const subjects =
    customSubjects.length > 0 ? customSubjects : [...DEFAULT_SUBJECTS];

  const plan = await prisma.monthlyPlan.findUnique({
    where: {
      studentId_yearMonth: { studentId: id, yearMonth },
    },
    include: { author: { select: { name: true } } },
  });

  const initialSubjectGoals =
    (plan?.subjectGoals as unknown as MonthlyGoals | null) ?? {};
  const initialMilestones =
    (plan?.milestones as unknown as MonthlyMilestones | null) ?? {};

  const description = [
    student.grade,
    plan?.author && `작성자 ${plan.author.name}`,
    plan?.updatedAt && `${plan.updatedAt.toLocaleDateString("ko-KR")} 수정`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <StudentDetailHeader student={student} current="monthly" description={description} />

      <MonthlyPlanEditor
        studentId={id}
        initialYearMonth={yearMonth}
        initialSubjectGoals={initialSubjectGoals}
        initialMilestones={initialMilestones}
        initialRetrospective={plan?.retrospective ?? null}
        subjects={subjects}
        canEdit={canEdit}
      />
    </div>
  );
}
