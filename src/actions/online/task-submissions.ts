"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireAnyStaff } from "@/lib/roles";
import { assertCanManageStudent } from "@/lib/student-access";
import { validateMagicLink } from "@/lib/student-auth";
import { notifySlack } from "@/lib/slack";
import { sanitizePortalAttachments } from "@/lib/portal-attachments";
import type { TaskFeedbackStatus } from "@/generated/prisma";

const MAX_FILES = 10;
const MAX_NOTE_LEN = 2000;

export type UploadedFile = {
  url: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
};

/**
 * 학생이 수행평가 제출.
 * 버전 관리 규칙:
 *  - 첫 제출 → version=1 생성
 *  - 최신 제출에 피드백이 없으면 → 같은 버전 덮어쓰기 (단순 수정)
 *  - 최신 제출에 피드백이 있으면 → 새 version 생성 (수정본 재제출)
 * 제출 시 task.status = SUBMITTED 로 자동 전환 + 컨설턴트에게 Slack 알림.
 */
export async function createOrUpdateSubmission(params: {
  studentToken: string;
  taskId: string;
  files: UploadedFile[];
  note?: string | null;
}) {
  const session = await validateMagicLink(params.studentToken);
  if (!session) throw new Error("인증이 만료되었습니다");

  const task = await prisma.performanceTask.findUnique({
    where: { id: params.taskId },
    include: {
      student: { select: { name: true } },
      createdBy: { select: { name: true, email: true } },
    },
  });
  if (!task || task.studentId !== session.student.id) {
    throw new Error("권한이 없습니다");
  }
  // 조용히 잘리지 않게 개수 초과는 명시적으로 거절
  if (Array.isArray(params.files) && params.files.length > MAX_FILES) {
    throw new Error(`파일은 ${MAX_FILES}개까지 첨부할 수 있습니다`);
  }
  // 클라이언트가 보낸 파일 메타를 그대로 저장하지 않는다 — https URL·필드 길이 정규화
  const files = sanitizePortalAttachments(params.files, MAX_FILES);
  if (files.length === 0) {
    throw new Error("최소 1개 이상의 파일을 첨부하세요");
  }
  const note = (typeof params.note === "string" ? params.note : "").trim().slice(0, MAX_NOTE_LEN) || null;

  const latest = await prisma.taskSubmission.findFirst({
    where: { taskId: params.taskId },
    orderBy: { version: "desc" },
    include: { _count: { select: { feedbacks: true } } },
  });

  let isNewVersion = false;
  if (!latest) {
    // 첫 제출
    await prisma.taskSubmission.create({
      data: {
        taskId: params.taskId,
        studentId: session.student.id,
        version: 1,
        files: files as unknown as object,
        note,
      },
    });
    isNewVersion = true;
  } else if (latest._count.feedbacks === 0) {
    // 피드백 없음 → 동일 버전 덮어쓰기
    await prisma.taskSubmission.update({
      where: { id: latest.id },
      data: {
        files: files as unknown as object,
        note,
        submittedAt: new Date(),
      },
    });
  } else {
    // 피드백 있음 → 새 버전
    await prisma.taskSubmission.create({
      data: {
        taskId: params.taskId,
        studentId: session.student.id,
        version: latest.version + 1,
        files: files as unknown as object,
        note,
      },
    });
    isNewVersion = true;
  }

  // task 상태가 OPEN/IN_PROGRESS/NEEDS_REVISION 이면 SUBMITTED 로
  if (task.status !== "DONE" && task.status !== "SUBMITTED") {
    await prisma.performanceTask.update({
      where: { id: task.id },
      data: { status: "SUBMITTED" },
    });
  }

  const nextVersion = isNewVersion ? (latest?.version ?? 0) + 1 : latest?.version ?? 1;
  notifySlack(
    `[수행평가] ${task.student.name} 학생이 "${task.subject} - ${task.title}" 을 제출했습니다 (v${nextVersion}).\n` +
      `_/online/students/${task.studentId}/tasks 에서 확인_`
  );

  revalidatePath(`/s/${params.studentToken}/tasks/${params.taskId}`);
  revalidatePath(`/s/${params.studentToken}/tasks`);
  revalidatePath(`/online/students/${task.studentId}/tasks`);
  revalidatePath(`/online/performance`);
}

/**
 * 컨설턴트 피드백 작성. 상태에 따라 task.status 도 동기화.
 * NEEDS_REVISION → task.status NEEDS_REVISION
 * APPROVED → task.status DONE 으로 자동 진행 (Phase 1 은 단순화)
 */
export async function createFeedback(params: {
  submissionId: string;
  content: string;
  status: TaskFeedbackStatus;
  files?: UploadedFile[];
}) {
  const session = await auth();
  requireAnyStaff(session?.user?.role);

  if (typeof params.content !== "string" || !params.content.trim()) {
    throw new Error("피드백 내용을 입력하세요");
  }
  if (Array.isArray(params.files) && params.files.length > MAX_FILES) {
    throw new Error(`파일은 ${MAX_FILES}개까지 첨부할 수 있습니다`);
  }
  const feedbackFiles = sanitizePortalAttachments(params.files, MAX_FILES);

  const submission = await prisma.taskSubmission.findUnique({
    where: { id: params.submissionId },
    include: {
      task: { select: { id: true, studentId: true, status: true } },
      feedbacks: { select: { id: true }, take: 1 },
    },
  });
  if (!submission) throw new Error("제출물을 찾을 수 없습니다");
  await assertCanManageStudent(
    session?.user?.role,
    session?.user?.id,
    submission.task.studentId
  );

  await prisma.taskFeedback.create({
    data: {
      submissionId: params.submissionId,
      authorId: session!.user.id,
      content: params.content.trim(),
      status: params.status,
      files: feedbackFiles as unknown as object,
    },
  });

  // 상태 동기화
  if (params.status === "NEEDS_REVISION") {
    await prisma.performanceTask.update({
      where: { id: submission.task.id },
      data: { status: "NEEDS_REVISION" },
    });
  } else if (params.status === "APPROVED") {
    // APPROVED: 최신 제출을 결과물로 확정 (TaskResult auto-upsert)
    const finalFilesJson = submission.files as unknown as object;
    await prisma.taskResult.upsert({
      where: { taskId: submission.task.id },
      update: {
        finalFiles: finalFilesJson,
        finalizedAt: new Date(),
      },
      create: {
        taskId: submission.task.id,
        studentId: submission.task.studentId,
        finalFiles: finalFilesJson,
        finalizedAt: new Date(),
      },
    });
    await prisma.performanceTask.update({
      where: { id: submission.task.id },
      data: { status: "DONE" },
    });
  }

  revalidatePath(`/online/students/${submission.task.studentId}/tasks/${submission.task.id}`);
  revalidatePath(`/online/students/${submission.task.studentId}/tasks`);
  revalidatePath(`/online/performance`);
}
