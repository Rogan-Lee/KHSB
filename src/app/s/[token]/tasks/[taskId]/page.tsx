import { redirect, notFound } from "next/navigation";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { validateMagicLink } from "@/lib/student-auth";
import { prisma } from "@/lib/prisma";
import { TaskSubmissionForm } from "@/components/online/task-submission-form";
import {
  TaskSubmissionsThread,
  type SubmissionVersion,
} from "@/components/online/task-submissions-thread";
import {
  Badge,
  GroupLabel,
  IconTile,
  InfoRow,
  Notice,
  Section,
  dueInfo,
} from "@/components/portal/ui";
import { TASK_STATUS } from "@/components/portal/status";
import type { UploadedFile } from "@/actions/online/task-submissions";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const KST_OFFSET = 9 * 60 * 60 * 1000;

/** "9월 30일 (수)" — 올해가 아니면 연도 포함 */
function formatDate(d: Date): string {
  const kst = new Date(d.getTime() + KST_OFFSET);
  const thisYear = new Date(Date.now() + KST_OFFSET).getUTCFullYear();
  const md = `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 (${WEEKDAYS[kst.getUTCDay()]})`;
  return kst.getUTCFullYear() === thisYear ? md : `${kst.getUTCFullYear()}년 ${md}`;
}

/** "9월 20일 오후 3:12" */
function formatDateTime(d: Date): string {
  const kst = new Date(d.getTime() + KST_OFFSET);
  const h = kst.getUTCHours();
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${h < 12 ? "오전" : "오후"} ${h12}:${kst
    .getUTCMinutes()
    .toString()
    .padStart(2, "0")}`;
}

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

  const isDone = task.status === "DONE";
  const status = TASK_STATUS[task.status];
  const due = dueInfo(task.dueDate, isDone || task.status === "SUBMITTED");

  // createOrUpdateSubmission 규칙: 최신 제출에 피드백이 있으면 새 버전, 없으면 같은 버전 덮어쓰기
  const latestHasFeedback = !!latest && latest.feedbacks.length > 0;
  const submitTitle = !latest ? "과제 제출" : latestHasFeedback ? "수정본 제출" : "제출물 수정";
  const submitDescription = !latest
    ? "파일을 올리면 컨설턴트가 검토하고 피드백을 남겨줘요."
    : latestHasFeedback
      ? `새 버전(v${latest.version + 1})으로 저장돼요.`
      : `피드백을 받기 전이라 v${latest.version}을 바로 고칠 수 있어요.`;

  return (
    <div className="flex flex-col gap-x3">
      {/* 제목 */}
      <Section>
        <div className="flex flex-wrap items-center gap-x1_5">
          <Badge>{task.subject}</Badge>
          {task.format && <Badge>{task.format}</Badge>}
        </div>
        <h2 className="mt-x3 t8-bold text-fg-neutral">{task.title}</h2>
        {task.description && (
          <p className="mt-x2_5 whitespace-pre-wrap break-words t5-regular text-fg-neutral-muted">
            {task.description}
          </p>
        )}
      </Section>

      {/* 정보 */}
      <Section>
        <InfoRow label="상태">
          <Badge tone={status.tone} size="md">
            {status.label}
          </Badge>
        </InfoRow>
        <InfoRow label="마감일">
          <span className="inline-flex items-center gap-x2 tabular-nums">
            {formatDate(task.dueDate)}
            {!isDone && <Badge tone={due.tone}>{due.label}</Badge>}
          </span>
        </InfoRow>
        <InfoRow label="최근 제출">
          {latest ? (
            <span className="tabular-nums">
              v{latest.version} · {formatDateTime(latest.submittedAt)}
            </span>
          ) : (
            <span className="t5-regular text-fg-neutral-subtle">아직 없어요</span>
          )}
        </InfoRow>
      </Section>

      {/* 제출 */}
      {!isDone && (
        <Section title={submitTitle} description={submitDescription}>
          {task.status === "NEEDS_REVISION" && (
            <Notice tone="bad" icon={CircleAlert} className="mb-x5">
              컨설턴트가 수정을 요청했어요. 아래 제출 기록에서 피드백을 확인해 주세요.
            </Notice>
          )}
          <TaskSubmissionForm
            studentToken={token}
            taskId={taskId}
            initialFiles={task.status === "NEEDS_REVISION" ? [] : latestFiles}
            initialNote={task.status === "NEEDS_REVISION" ? null : latest?.note ?? null}
            isSubmitted={!!latest}
          />
        </Section>
      )}

      {isDone && latest && (
        <Section>
          <div className="flex items-center gap-x3_5">
            <IconTile icon={CheckCircle2} tone="ok" size={48} round />
            <div className="min-w-0">
              <p className="t6-bold text-fg-neutral">최종 완료된 과제예요</p>
              <p className="mt-x0_5 t4-regular text-fg-neutral-subtle">컨설턴트가 최종 승인했어요.</p>
            </div>
          </div>
        </Section>
      )}

      {/* 제출 기록 */}
      {versions.length > 0 && (
        <div className="pt-x3">
          <GroupLabel trailing={`${versions.length}개`}>제출 기록</GroupLabel>
          <TaskSubmissionsThread
            variant="portal"
            versions={versions}
            taskStatus={task.status}
            canWriteFeedback={false}
            studentPortalUrl={`/s/${token}/tasks/${taskId}`}
          />
        </div>
      )}
    </div>
  );
}
