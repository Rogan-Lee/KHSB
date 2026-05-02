import { redirect, notFound } from "next/navigation";
import { CalendarDays, History } from "lucide-react";
import { validateMagicLink } from "@/lib/student-auth";
import { prisma } from "@/lib/prisma";
import { TaskSubmissionForm } from "@/components/online/task-submission-form";
import {
  TaskSubmissionsThread,
  type SubmissionVersion,
} from "@/components/online/task-submissions-thread";
import type { PerformanceTaskStatus } from "@/generated/prisma";
import type { UploadedFile } from "@/actions/online/task-submissions";

const STATUS_LABEL: Record<PerformanceTaskStatus, string> = {
  OPEN: "진행 전",
  IN_PROGRESS: "진행 중",
  SUBMITTED: "제출 완료",
  NEEDS_REVISION: "수정 필요",
  DONE: "최종 완료",
};

const STATUS_TONE: Record<PerformanceTaskStatus, string> = {
  OPEN: "bg-canvas-2 text-ink-3",
  IN_PROGRESS: "bg-info-soft text-info-ink",
  SUBMITTED: "bg-warn-soft text-warn-ink",
  NEEDS_REVISION: "bg-bad-soft text-bad-ink",
  DONE: "bg-ok-soft text-ok-ink",
};

export default async function StudentTaskDetailPage({
  params,
}: {
  params: Promise<{ token: string; taskId: string }>;
}) {
  const { token, taskId } = await params;
  const session = await validateMagicLink(token);
  if (!session) redirect("/s/expired");

  const task = await prisma.performanceTask.findUnique({
    where: { id: taskId },
    include: {
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
  if (!task || task.studentId !== session.student.id) notFound();

  const latest = task.submissions[0] ?? null;
  const latestFiles: UploadedFile[] = latest
    ? Array.isArray(latest.files)
      ? (latest.files as unknown as UploadedFile[])
      : []
    : [];

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
      files: Array.isArray(f.files) ? (f.files as unknown as UploadedFile[]) : [],
    })),
  }));

  const due = task.dueDate;
  const daysLeft = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const dueLabel =
    daysLeft < 0 ? `D+${-daysLeft}` : daysLeft === 0 ? "D-Day" : `D-${daysLeft}`;
  const dueTone =
    daysLeft < 0 && task.status !== "DONE"
      ? "bg-bad-soft text-bad-ink"
      : daysLeft <= 1 && task.status !== "DONE"
        ? "bg-warn-soft text-warn-ink"
        : "bg-canvas-2 text-ink-3";

  return (
    <div className="space-y-4">
      {/* Hero */}
      <section className="rounded-[14px] border border-line bg-panel p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-canvas-2 px-2 py-0.5 text-[10.5px] font-medium text-ink-3">
            {task.subject}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${STATUS_TONE[task.status]}`}
          >
            {STATUS_LABEL[task.status]}
          </span>
          {latest && (
            <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[10.5px] font-medium text-warn-ink">
              v{latest.version} 제출됨
            </span>
          )}
        </div>
        <h2 className="mt-2.5 text-[18px] font-bold leading-snug tracking-[-0.01em] text-ink">
          {task.title}
          {task.format && (
            <span className="ml-1.5 text-[12px] font-normal text-ink-4">
              ({task.format})
            </span>
          )}
        </h2>
        {task.description && (
          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-3">
            {task.description}
          </p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[12px] tabular-nums text-ink-4">
            <CalendarDays className="h-3.5 w-3.5" />
            {due.toLocaleDateString("ko-KR")}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold tabular-nums ${dueTone}`}
          >
            {dueLabel}
          </span>
        </div>
      </section>

      {/* Submission action */}
      {task.status !== "DONE" && (
        <section className="rounded-[14px] border border-line bg-panel p-4">
          <h3 className="mb-2.5 text-[13.5px] font-semibold text-ink">
            {task.status === "NEEDS_REVISION" ? "수정본 제출 (새 버전)" : "제출"}
          </h3>
          <TaskSubmissionForm
            studentToken={token}
            taskId={taskId}
            initialFiles={
              task.status === "NEEDS_REVISION" ? [] : latestFiles
            }
            initialNote={
              task.status === "NEEDS_REVISION" ? null : latest?.note ?? null
            }
            isSubmitted={!!latest}
          />
        </section>
      )}

      {task.status === "DONE" && latest && (
        <section className="rounded-[14px] border border-ok/30 bg-ok-soft px-4 py-5">
          <p className="text-[14px] font-bold text-ok-ink">
            ✅ 최종 완료된 과제예요
          </p>
          <p className="mt-1 text-[12px] text-ok-ink/80">
            컨설턴트가 최종 승인했습니다.
          </p>
        </section>
      )}

      {/* History */}
      {versions.length > 0 && (
        <section>
          <div className="mb-2 flex items-center gap-2">
            <History className="h-3.5 w-3.5 text-ink-4" />
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-ink-4">
              제출 히스토리 · {versions.length}개
            </h3>
          </div>
          <TaskSubmissionsThread
            versions={versions}
            taskStatus={task.status}
            canWriteFeedback={false}
            studentPortalUrl={`/s/${token}/tasks/${taskId}`}
          />
        </section>
      )}
    </div>
  );
}
