import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isOnlineStaff } from "@/lib/roles";
import {
  TaskSubmissionsThread,
  type SubmissionVersion,
} from "@/components/online/task-submissions-thread";
import { TaskResultEditor } from "@/components/online/task-result-editor";
import type { PerformanceTaskStatus } from "@/generated/prisma";
import type { UploadedFile } from "@/actions/online/task-submissions";

const STATUS_LABEL: Record<PerformanceTaskStatus, string> = {
  OPEN: "진행 전",
  IN_PROGRESS: "진행 중",
  SUBMITTED: "제출 완료",
  NEEDS_REVISION: "수정 필요",
  DONE: "최종 완료",
};

export default async function StaffTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string; taskId: string }>;
}) {
  const { id, taskId } = await params;
  const user = await getUser();
  if (!isOnlineStaff(user?.role)) redirect("/");

  const task = await prisma.performanceTask.findUnique({
    where: { id: taskId },
    include: {
      student: { select: { id: true, name: true, grade: true } },
      result: true,
      submissions: {
        orderBy: { version: "desc" },
        include: {
          feedbacks: {
            orderBy: { createdAt: "asc" },
            include: { author: { select: { name: true } } },
          },
        },
      },
    },
  });
  if (!task || task.student.id !== id) notFound();

  const versions: SubmissionVersion[] = task.submissions.map((s) => ({
    id: s.id,
    version: s.version,
    files: Array.isArray(s.files) ? (s.files as unknown as UploadedFile[]) : [],
    note: s.note,
    submittedAt: s.submittedAt.toISOString(),
    feedbacks: s.feedbacks.map((f) => ({
      id: f.id,
      authorName: f.author.name,
      content: f.content,
      status: f.status,
      createdAt: f.createdAt.toISOString(),
    })),
  }));

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/online/students/${id}/tasks`}
          className="inline-flex items-center gap-1 text-[12px] text-ink-4 hover:text-ink"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {task.student.name} 수행평가 목록
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-semibold text-ink tracking-[-0.015em]">
          {task.title}
        </h1>
        <p className="mt-1 text-[13px] text-ink-4">
          {task.student.name} ({task.student.grade}) · {task.subject}
          {task.format && ` · ${task.format}`} · {STATUS_LABEL[task.status]}
          {task.submissions.length > 0 && ` · v${task.submissions[0].version}까지 제출`}
        </p>
        {task.description && (
          <p className="mt-2 text-[12.5px] text-ink-3 leading-relaxed whitespace-pre-wrap">
            {task.description}
          </p>
        )}
        <p className="mt-1 text-[12px] tabular-nums text-ink-3">
          마감: {task.dueDate.toLocaleDateString("ko-KR")}
        </p>
      </header>

      {task.status === "DONE" && (
        <TaskResultEditor
          taskId={task.id}
          initialScore={task.result?.score ?? null}
          initialSummary={task.result?.consultantSummary ?? null}
          initialIncludeInReport={task.result?.includeInReport ?? false}
        />
      )}

      <TaskSubmissionsThread
        versions={versions}
        taskStatus={task.status}
        canWriteFeedback={true}
      />
    </div>
  );
}
