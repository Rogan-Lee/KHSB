import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isOnlineStaff, isManagerMentor, isFullAccess } from "@/lib/roles";
import { WeeklyPlanEditor } from "@/components/online/weekly-plan-editor";
import type { WeeklyPlanGoals } from "@/actions/online/weekly-plans";
import { mondayOfKST } from "@/lib/online/week";
import { DEFAULT_SUBJECTS } from "@/lib/online/subjects";

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
    select: { id: true, name: true, grade: true, isOnlineManaged: true, selectedSubjects: true },
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

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/online/students/${id}`}
          className="inline-flex items-center gap-1 text-[12px] text-ink-4 hover:text-ink"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          학생 상세
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-semibold text-ink tracking-[-0.015em]">
          {student.name} — 주간 계획
        </h1>
        <p className="mt-1 text-[13px] text-ink-4">
          {student.grade}
          {plan?.author && ` · 작성자: ${plan.author.name}`}
          {plan?.updatedAt && ` · ${plan.updatedAt.toLocaleDateString("ko-KR")} 수정`}
        </p>
      </header>

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
