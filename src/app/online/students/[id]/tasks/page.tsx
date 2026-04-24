import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isFullAccess } from "@/lib/roles";
import {
  PerformanceTaskList,
  type PerformanceTaskRow,
} from "@/components/online/performance-task-list";

export default async function StudentPerformanceTasksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUser();
  const canManage = isFullAccess(user?.role) || user?.role === "CONSULTANT";

  const student = await prisma.student.findUnique({
    where: { id },
    select: { id: true, name: true, isOnlineManaged: true, grade: true },
  });
  if (!student || !student.isOnlineManaged) notFound();

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
          {student.name} — 수행평가
        </h1>
        <p className="mt-1 text-[13px] text-ink-4">
          {student.grade} · 총 {rows.length}건
        </p>
      </header>

      <PerformanceTaskList studentId={id} tasks={rows} canManage={canManage} />
    </div>
  );
}
