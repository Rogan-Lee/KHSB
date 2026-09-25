import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isOnlineStaff, isManagerMentor, isFullAccess } from "@/lib/roles";
import { WeeklyPlanEditor } from "@/components/online/weekly-plan-editor";
import type { WeeklyPlanGoals } from "@/actions/online/weekly-plans";
import { mondayOfKST } from "@/lib/online/week";
import { DEFAULT_SUBJECTS } from "@/lib/online/subjects";
import { StudentDetailHeader } from "../_components/student-detail-header";

export default async function StudentWeeklyPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { id } = await params;
  const { week } = await searchParams;
  const user = await getUser();
  if (!isOnlineStaff(user?.role)) redirect("/");
  const canEdit = isManagerMentor(user?.role) || isFullAccess(user?.role);

  const weekStart = week ?? mondayOfKST();

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
  const subjects = customSubjects.length > 0 ? customSubjects : [...DEFAULT_SUBJECTS];

  const plan = await prisma.weeklyPlan.findUnique({
    where: {
      studentId_weekStart: {
        studentId: id,
        weekStart: new Date(weekStart + "T00:00:00.000Z"),
      },
    },
    include: { author: { select: { name: true } } },
  });

  const initialGoals: WeeklyPlanGoals =
    (plan?.goals as unknown as WeeklyPlanGoals | null) ?? {};

  const description = [
    student.grade,
    plan?.author && `작성자 ${plan.author.name}`,
    plan?.updatedAt && `${plan.updatedAt.toLocaleDateString("ko-KR")} 수정`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <StudentDetailHeader student={student} current="plans" description={description} />

      <WeeklyPlanEditor
        studentId={id}
        initialWeekStart={weekStart}
        initialGoals={initialGoals}
        initialStudyHours={plan?.studyHours ?? null}
        initialRetrospective={plan?.retrospective ?? null}
        subjects={subjects}
        canEdit={canEdit}
      />
    </div>
  );
}
