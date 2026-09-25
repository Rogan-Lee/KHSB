import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isAnyStaff, isFullAccess, isOnlineStaff } from "@/lib/roles";
import { isResponsibleFor } from "@/lib/student-access";
import {
  PerformanceTaskList,
  type PerformanceTaskRow,
} from "@/components/online/performance-task-list";
import { StudentDetailHeader } from "../_components/student-detail-header";

export default async function StudentPerformanceTasksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUser();
  if (!isAnyStaff(user?.role)) notFound();
  const canManage = isAnyStaff(user?.role);

  const student = await prisma.student.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      grade: true,
      status: true,
      isOnlineManaged: true,
      mentorId: true,
      assignedMentorId: true,
      assignedConsultantId: true,
      assignedStaffId: true,
    },
  });
  // 전체 학생 대상 — 원장/SA는 전체, 그 외는 담당 학생만.
  if (
    !student ||
    (!isFullAccess(user?.role) && !isResponsibleFor(student, user?.id))
  ) {
    notFound();
  }

  const tasks = await prisma.performanceTask.findMany({
    where: { studentId: id },
    orderBy: { dueDate: "asc" },
    include: {
      submissions: {
        orderBy: { version: "desc" },
        take: 1,
        select: {
          version: true,
          _count: { select: { feedbacks: true } },
        },
      },
    },
  });

  const rows: PerformanceTaskRow[] = tasks.map((t) => {
    const latest = t.submissions[0];
    return {
      id: t.id,
      subject: t.subject,
      title: t.title,
      description: t.description,
      dueDate: t.dueDate.toISOString(),
      scoreWeight: t.scoreWeight,
      format: t.format,
      status: t.status,
      hasSubmission: !!latest,
      latestVersion: latest?.version ?? 0,
      latestHasFeedback: (latest?._count.feedbacks ?? 0) > 0,
    };
  });

  return (
    <div>
      <StudentDetailHeader
        student={student}
        current="tasks"
        description={`${student.grade} · 총 ${rows.length}건`}
        showTabs={isOnlineStaff(user?.role) && student.isOnlineManaged}
      />

      <PerformanceTaskList studentId={id} tasks={rows} canManage={canManage} />
    </div>
  );
}
