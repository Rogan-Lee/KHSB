"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireOnlineStaff } from "@/lib/roles";
import { validateMagicLink } from "@/lib/student-auth";
import { notifySlack } from "@/lib/slack";
import type { TaskFeedbackStatus } from "@/generated/prisma";

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
  if (params.files.length === 0) {
    throw new Error("최소 1개 이상의 파일을 첨부하세요");
  }

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
        files: params.files as unknown as object,
        note: params.note?.trim() || null,
      },
    });
    isNewVersion = true;
  } else if (latest._count.feedbacks === 0) {
    // 피드백 없음 → 동일 버전 덮어쓰기
    await prisma.taskSubmission.update({
      where: { id: latest.id },
      data: {
        files: params.files as unknown as object,
        note: params.note?.trim() || null,
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
        files: params.files as unknown as object,
        note: params.note?.trim() || null,
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
  requireOnlineStaff(session?.user?.role);

  if (!params.content.trim()) {
    throw new Error("피드백 내용을 입력하세요");
  }

  const submission = await prisma.taskSubmission.findUnique({
    where: { id: params.submissionId },
    include: {
      task: { select: { id: true, studentId: true, status: true } },
      feedbacks: { select: { id: true }, take: 1 },
    },
  });
  if (!submission) throw new Error("제출물을 찾을 수 없습니다");

  await prisma.taskFeedback.create({
    data: {
      submissionId: params.submissionId,
      authorId: session!.user.id,
      content: params.content.trim(),
      status: params.status,
      files: (params.files ?? []) as unknown as object,
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
