import { notFound, redirect } from "next/navigation";
import { ChevronRight, MessageSquarePlus, Inbox } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isAnyStaff, isFullAccess } from "@/lib/roles";
import { isResponsibleFor } from "@/lib/student-access";
import {
  TaskSubmissionsThread,
  type SubmissionVersion,
} from "@/components/online/task-submissions-thread";
import { TaskResultEditor } from "@/components/online/task-result-editor";
import {
  DescriptionList,
  Notice,
  PageHeader,
  Section,
  StatusBadge,
  type Tone,
} from "@/components/backoffice/ui";
import type { PerformanceTaskStatus } from "@/generated/prisma";
import type { UploadedFile } from "@/actions/online/task-submissions";

const STATUS_LABEL: Record<PerformanceTaskStatus, string> = {
  OPEN: "진행 전",
  IN_PROGRESS: "진행 중",
  SUBMITTED: "제출 완료",
  NEEDS_REVISION: "수정 필요",
  DONE: "최종 완료",
};

const STATUS_TONE: Record<PerformanceTaskStatus, Tone> = {
  OPEN: "gray",
  IN_PROGRESS: "info",
  SUBMITTED: "warn",
  NEEDS_REVISION: "bad",
  DONE: "ok",
};

export default async function StaffTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string; taskId: string }>;
}) {
  const { id, taskId } = await params;
  const user = await getUser();
  if (!isAnyStaff(user?.role)) redirect("/");

  const task = await prisma.performanceTask.findUnique({
    where: { id: taskId },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          grade: true,
          mentorId: true,
          assignedMentorId: true,
          assignedConsultantId: true,
          assignedStaffId: true,
        },
      },
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
  // 전체 학생 대상 — 원장/SA는 전체, 그 외는 담당 학생만.
  if (!isFullAccess(user?.role) && !isResponsibleFor(task.student, user?.id)) {
    notFound();
  }

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

  const latest = task.submissions[0];
  const latestHasFeedback = (latest?.feedbacks.length ?? 0) > 0;
  const needsFeedback = task.status !== "DONE" && !!latest && !latestHasFeedback;
  const noSubmission = !latest;

  return (
    <div className="flex flex-col gap-x6">
      <PageHeader
        className="mb-0 md:mb-x2"
        back={{ href: `/online/students/${id}/tasks`, label: `${task.student.name} 수행평가` }}
        title={task.title}
        meta={<StatusBadge tone={STATUS_TONE[task.status]}>{STATUS_LABEL[task.status]}</StatusBadge>}
        description={
          <>
            {task.student.name} ({task.student.grade}) · {task.subject}
            {task.format && ` · ${task.format}`}
            {latest && ` · v${latest.version}까지 제출`}
          </>
        }
      />

      <Section title="과제 정보">
        <DescriptionList
          cols={3}
          items={[
            { label: "과목", value: task.subject },
            { label: "형식", value: task.format },
            {
              label: "마감",
              value: <span className="tabular-nums">{task.dueDate.toLocaleDateString("ko-KR")}</span>,
            },
            ...(task.description
              ? [
                  {
                    label: "설명",
                    value: <span className="whitespace-pre-wrap">{task.description}</span>,
                    full: true,
                  },
                ]
              : []),
          ]}
        />
      </Section>

      {noSubmission && (
        <Notice tone="gray" icon={Inbox} title="학생 제출 대기 중">
          학생이 자료를 올리면 여기에 표시되고, 버전별로 피드백을 남길 수 있어요.
        </Notice>
      )}

      {needsFeedback && (
        <a
          href={`#feedback-v${latest.version}`}
          className="flex items-center gap-x3 rounded-r3 bg-bg-warning-weak px-x4 py-x3_5 transition-colors hover:bg-bg-warning-weak-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring"
        >
          <MessageSquarePlus className="size-5 shrink-0 text-fg-warning" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="t4-bold text-fg-neutral">이 자료에 피드백을 남겨 주세요</p>
            <p className="mt-x0_5 t3-regular text-fg-neutral-muted">
              학생이 v{latest.version} 제출물을 올렸어요. 아래에서 코멘트 · 수정 요청 · 최종 승인 중 하나로 남길 수 있어요.
            </p>
          </div>
          <span className="hidden shrink-0 items-center gap-x0_5 t4-bold text-fg-neutral sm:inline-flex">
            피드백 작성
            <ChevronRight className="size-4" aria-hidden />
          </span>
          <ChevronRight className="size-4 shrink-0 text-fg-neutral sm:hidden" aria-hidden />
        </a>
      )}

      {task.status === "DONE" && (
        <TaskResultEditor
          taskId={task.id}
          initialScore={task.result?.score ?? null}
          initialSummary={task.result?.consultantSummary ?? null}
          initialIncludeInReport={task.result?.includeInReport ?? false}
        />
      )}

      {/* 제출이 없으면 위 안내(학생 제출 대기 중)로 충분 — 빈 스레드를 겹쳐 보여 주지 않는다 */}
      {!noSubmission && (
        <TaskSubmissionsThread
          versions={versions}
          taskStatus={task.status}
          canWriteFeedback={true}
        />
      )}
    </div>
  );
}
