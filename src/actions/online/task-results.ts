"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireOnlineStaff, requireFullAccess } from "@/lib/roles";
import type { UploadedFile } from "@/actions/online/task-submissions";

/**
 * 결과물 편집 (컨설턴트 + FullAccess).
 * finalFiles 는 보통 APPROVED 피드백 시점에 자동 설정되므로 여기선 score / summary / includeInReport 위주.
 */
export async function updateTaskResult(params: {
  taskId: string;
  score?: string | null;
  consultantSummary?: string | null;
  includeInReport?: boolean;
  finalFiles?: UploadedFile[] | null; // null = 변경 없음, [] = 빈 리스트로 리셋
}) {
  const session = await auth();
  requireOnlineStaff(session?.user?.role);

  const task = await prisma.performanceTask.findUnique({
    where: { id: params.taskId },
    select: { id: true, studentId: true, status: true },
  });
  if (!task) throw new Error("수행평가를 찾을 수 없습니다");
  if (task.status !== "DONE") {
    throw new Error("최종 완료(DONE) 상태의 수행평가만 결과물 편집 가능");
  }

  const updateData: Record<string, unknown> = {};
  if (params.score !== undefined) updateData.score = params.score?.trim() || null;
  if (params.consultantSummary !== undefined) {
    updateData.consultantSummary = params.consultantSummary?.trim() || null;
  }
  if (params.includeInReport !== undefined) {
    updateData.includeInReport = params.includeInReport;
  }
  if (params.finalFiles !== undefined && params.finalFiles !== null) {
    updateData.finalFiles = params.finalFiles as unknown as object;
  }

  await prisma.taskResult.upsert({
    where: { taskId: params.taskId },
    update: updateData,
    create: {
      taskId: params.taskId,
      studentId: task.studentId,
      finalFiles: (params.finalFiles ?? []) as unknown as object,
      score: params.score?.trim() || null,
      consultantSummary: params.consultantSummary?.trim() || null,
      includeInReport: params.includeInReport ?? false,
      finalizedAt: new Date(),
    },
  });

  revalidatePath(`/online/students/${task.studentId}/tasks/${params.taskId}`);
  revalidatePath(`/online/students/${task.studentId}/portfolio`);
  revalidatePath(`/online/students/${task.studentId}`);
}

/**
 * 결과물 includeInReport 토글 (학부모 보고서 포함 여부 스위치).
 * 별도 빠른 경로.
 */
export async function toggleTaskResultReportFlag(params: {
  taskId: string;
  includeInReport: boolean;
}) {
  const session = await auth();
  requireOnlineStaff(session?.user?.role);

  const task = await prisma.performanceTask.findUnique({
    where: { id: params.taskId },
    select: { studentId: true },
  });
  if (!task) throw new Error("수행평가를 찾을 수 없습니다");

  await prisma.taskResult.update({
    where: { taskId: params.taskId },
    data: { includeInReport: params.includeInReport },
  });

  revalidatePath(`/online/students/${task.studentId}/portfolio`);
  revalidatePath(`/online/students/${task.studentId}/tasks/${params.taskId}`);
}

/**
 * 결과물 삭제 — 원장만 (실수 정리용).
 */
export async function deleteTaskResult(taskId: string) {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  const task = await prisma.performanceTask.findUnique({
    where: { id: taskId },
    select: { studentId: true },
  });
  if (!task) throw new Error("수행평가를 찾을 수 없습니다");

  await prisma.taskResult.deleteMany({ where: { taskId } });
  revalidatePath(`/online/students/${task.studentId}/portfolio`);
}
