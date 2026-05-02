import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, MessageSquarePlus, Inbox } from "lucide-react";
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
      files: Array.isArray(f.files) ? (f.files as unknown as UploadedFile[]) : [],
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

      {(() => {
        const latest = task.submissions[0];
        const latestHasFeedback = (latest?.feedbacks.length ?? 0) > 0;
        const needsFeedback =
          task.status !== "DONE" && !!latest && !latestHasFeedback;
        const noSubmission = !latest;

        if (noSubmission) {
          return (
            <div className="rounded-[12px] border border-slate-200 bg-slate-50 p-4 flex items-center gap-3">
              <Inbox className="h-5 w-5 text-slate-500 shrink-0" />
              <div>
                <p className="text-[13px] font-semibold text-slate-900">
                  학생 제출 대기 중
                </p>
                <p className="text-[11.5px] text-slate-600 mt-0.5">
                  학생이 자료를 올리면 여기에 표시되며, 버전별로 피드백을 남길 수 있습니다.
                </p>
              </div>
            </div>
          );
        }
        if (needsFeedback) {
          return (
            <a
              href={`#feedback-v${latest.version}`}
              className="block rounded-[12px] border border-amber-300 bg-amber-50 p-4 hover:border-amber-400 transition-colors"
            >
              <div className="flex items-center gap-3">
                <MessageSquarePlus className="h-5 w-5 text-amber-700 shrink-0" />
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-amber-900">
                    이 자료에 피드백을 남겨주세요
                  </p>
                  <p className="text-[11.5px] text-amber-800 mt-0.5">
                    학생이 v{latest.version} 을 제출했습니다 — 아래 카드에서 피드백을 작성할 수 있어요.
                    승인 / 수정 요청 / 코멘트 3가지 중 선택.
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full bg-amber-200 text-amber-900 px-2.5 py-1 text-[11px] font-semibold">
                  피드백 필요
                </span>
              </div>
            </a>
          );
        }
        return null;
      })()}

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
