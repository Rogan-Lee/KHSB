import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { validateMagicLink } from "@/lib/student-auth";
import { prisma } from "@/lib/prisma";
import { TaskSubmissionForm } from "@/components/online/task-submission-form";
import type { TaskFeedbackStatus, PerformanceTaskStatus } from "@/generated/prisma";
import type { UploadedFile } from "@/actions/online/task-submissions";

const STATUS_LABEL: Record<PerformanceTaskStatus, string> = {
  OPEN: "진행 전",
  IN_PROGRESS: "진행 중",
  SUBMITTED: "제출 완료",
  NEEDS_REVISION: "수정 필요",
  DONE: "최종 완료",
};

const FEEDBACK_LABEL: Record<TaskFeedbackStatus, string> = {
  COMMENT: "코멘트",
  NEEDS_REVISION: "수정 요청",
  APPROVED: "승인",
};

const FEEDBACK_COLORS: Record<TaskFeedbackStatus, string> = {
  COMMENT: "bg-slate-100 text-slate-700",
  NEEDS_REVISION: "bg-red-100 text-red-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
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
            orderBy: { createdAt: "desc" },
            include: { author: { select: { name: true } } },
          },
        },
      },
    },
  });
  if (!task || task.studentId !== session.student.id) notFound();

  const submission = task.submissions[0] ?? null;
  const initialFiles: UploadedFile[] = Array.isArray(submission?.files)
    ? (submission.files as unknown as UploadedFile[])
    : [];
  const allFeedbacks = task.submissions.flatMap((s) => s.feedbacks);

  const due = task.dueDate;
  const daysLeft = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={`/s/${token}/tasks`}
          className="inline-flex items-center gap-1 text-[12px] text-ink-4 hover:text-ink"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          수행평가 목록
        </Link>
      </div>

      <header className="rounded-[12px] border border-line bg-panel p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] text-ink-4 rounded bg-canvas-2 px-1.5 py-0.5">
            {task.subject}
          </span>
          <span className="text-[11px] text-ink-4 rounded bg-canvas-2 px-1.5 py-0.5">
            {STATUS_LABEL[task.status]}
          </span>
        </div>
        <h2 className="text-[15px] font-semibold text-ink">{task.title}</h2>
        {task.description && (
          <p className="mt-1 text-[12.5px] text-ink-4 leading-relaxed whitespace-pre-wrap">
            {task.description}
          </p>
        )}
        <p className="mt-2 text-[12px] tabular-nums text-ink-3">
          마감: {due.toLocaleDateString("ko-KR")} ({daysLeft < 0 ? `D+${-daysLeft}` : daysLeft === 0 ? "D-Day" : `D-${daysLeft}`})
        </p>
      </header>

      {task.status !== "DONE" && (
        <section>
          <h3 className="text-[13px] font-semibold text-ink mb-2">제출</h3>
          <TaskSubmissionForm
            studentToken={token}
            taskId={taskId}
            initialFiles={initialFiles}
            initialNote={submission?.note ?? null}
            isSubmitted={!!submission}
          />
        </section>
      )}

      {task.status === "DONE" && submission && (
        <section className="rounded-[12px] border border-emerald-200 bg-emerald-50 p-4">
          <h3 className="text-[13px] font-semibold text-emerald-900">최종 완료</h3>
          <p className="mt-1 text-[12px] text-emerald-800">
            컨설턴트가 최종 승인했습니다.
          </p>
        </section>
      )}

      <section>
        <h3 className="text-[13px] font-semibold text-ink mb-2">받은 피드백</h3>
        {allFeedbacks.length === 0 ? (
          <p className="text-[12px] text-ink-5">아직 피드백이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {allFeedbacks.map((f) => (
              <li
                key={f.id}
                className="rounded-[10px] border border-line bg-panel p-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${FEEDBACK_COLORS[f.status]}`}
                  >
                    {FEEDBACK_LABEL[f.status]}
                  </span>
                  <span className="text-[11px] text-ink-5">
                    {f.author.name} · {f.createdAt.toLocaleString("ko-KR")}
                  </span>
                </div>
                <p className="text-[12.5px] text-ink whitespace-pre-wrap leading-relaxed">
                  {f.content}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
