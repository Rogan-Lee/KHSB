"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireAnyStaff, requireFullAccess } from "@/lib/roles";
import { assertCanManageStudent } from "@/lib/student-access";
import type { UploadedFile } from "@/actions/online/task-submissions";

/**
 * 클라가 보낸 finalFiles 를 UploadedFile 형태로만 추려 저장 (임의 JSON·javascript: URL 차단).
 * href 로 렌더되는 필드이므로 https URL 만 허용.
 */
function sanitizeFinalFiles(input: unknown): UploadedFile[] {
  if (!Array.isArray(input)) throw new Error("첨부 파일 형식이 올바르지 않습니다");
  if (input.length > 20) throw new Error("첨부 파일은 20개까지 가능합니다");
  return input.map((f) => {
    const file = f as Partial<UploadedFile> | null;
    let ok = false;
    try {
      ok = typeof file?.url === "string" && new URL(file.url).protocol === "https:";
    } catch {
      ok = false;
    }
    if (!ok || typeof file?.name !== "string" || typeof file?.mimeType !== "string") {
      throw new Error("첨부 파일 형식이 올바르지 않습니다");
    }
    const sizeBytes = Number(file.sizeBytes);
    return {
      url: file.url as string,
      name: file.name.slice(0, 200),
      sizeBytes: Number.isFinite(sizeBytes) && sizeBytes >= 0 ? sizeBytes : 0,
      mimeType: file.mimeType.slice(0, 100),
    };
  });
}

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
  requireAnyStaff(session?.user?.role);

  const task = await prisma.performanceTask.findUnique({
    where: { id: params.taskId },
    select: { id: true, studentId: true, status: true },
  });
  if (!task) throw new Error("수행평가를 찾을 수 없습니다");
  await assertCanManageStudent(
    session?.user?.role,
    session?.user?.id,
    task.studentId
  );
  if (task.status !== "DONE") {
    throw new Error("최종 완료(DONE) 상태의 수행평가만 결과물 편집 가능");
  }

  const finalFiles =
    params.finalFiles !== undefined && params.finalFiles !== null
      ? sanitizeFinalFiles(params.finalFiles)
      : null;

  const updateData: Record<string, unknown> = {};
  if (params.score !== undefined) updateData.score = params.score?.trim() || null;
  if (params.consultantSummary !== undefined) {
    updateData.consultantSummary = params.consultantSummary?.trim() || null;
  }
  if (params.includeInReport !== undefined) {
    updateData.includeInReport = params.includeInReport === true;
  }
  if (finalFiles) {
    updateData.finalFiles = finalFiles as unknown as object;
  }

  await prisma.taskResult.upsert({
    where: { taskId: params.taskId },
    update: updateData,
    create: {
      taskId: params.taskId,
      studentId: task.studentId,
      finalFiles: (finalFiles ?? []) as unknown as object,
      score: params.score?.trim() || null,
      consultantSummary: params.consultantSummary?.trim() || null,
      includeInReport: params.includeInReport === true,
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
  requireAnyStaff(session?.user?.role);

  const task = await prisma.performanceTask.findUnique({
    where: { id: params.taskId },
    select: { studentId: true },
  });
  if (!task) throw new Error("수행평가를 찾을 수 없습니다");
  await assertCanManageStudent(
    session?.user?.role,
    session?.user?.id,
    task.studentId
  );

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
