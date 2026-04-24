import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Paperclip, Download } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isOnlineStaff } from "@/lib/roles";
import { TaskFeedbackForm } from "@/components/online/task-feedback-form";
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
  if (!task || task.student.id !== id) notFound();

  const submission = task.submissions[0] ?? null;
  const files: UploadedFile[] = Array.isArray(submission?.files)
    ? (submission.files as unknown as UploadedFile[])
    : [];
  const feedbacks = task.submissions.flatMap((s) => s.feedbacks);

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

      <section className="rounded-[12px] border border-line bg-panel p-4">
        <h2 className="text-[13px] font-semibold text-ink mb-3">학생 제출물</h2>
        {!submission ? (
          <p className="text-[12.5px] text-ink-5">아직 제출되지 않았습니다.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-[11.5px] text-ink-4">
              제출일: {submission.submittedAt.toLocaleString("ko-KR")}
            </p>
            <ul className="space-y-1.5">
              {files.map((f, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-[6px] bg-canvas-2 px-3 py-2 text-[12.5px]"
                >
                  <Paperclip className="h-3.5 w-3.5 text-ink-4 shrink-0" />
                  <span className="flex-1 truncate text-ink">{f.name}</span>
                  <span className="shrink-0 text-[11px] text-ink-5">
                    {(f.sizeBytes / 1024 / 1024).toFixed(1)}MB
                  </span>
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink"
                    download={f.name}
                  >
                    <Download className="h-3.5 w-3.5" />
                    다운로드
                  </a>
                </li>
              ))}
            </ul>
            {submission.note && (
              <div className="rounded-[8px] border border-line-2 bg-canvas px-3 py-2.5 text-[12.5px] text-ink whitespace-pre-wrap leading-relaxed">
                <span className="text-[11px] font-semibold text-ink-4 block mb-1">학생 코멘트</span>
                {submission.note}
              </div>
            )}
          </div>
        )}
      </section>

      {submission && task.status !== "DONE" && (
        <TaskFeedbackForm submissionId={submission.id} />
      )}

      <section>
        <h2 className="text-[13px] font-semibold text-ink mb-2">
          피드백 히스토리 ({feedbacks.length})
        </h2>
        {feedbacks.length === 0 ? (
          <p className="text-[12px] text-ink-5">작성된 피드백이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {feedbacks.map((f) => (
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
