"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireFullAccess, requireOnlineStaff } from "@/lib/roles";
import type { PerformanceTaskStatus } from "@/generated/prisma";

function toDateOnly(input: string | Date): Date {
  const d = typeof input === "string" ? new Date(input) : input;
  // KST 자정 기준 @db.Date 저장 (Prisma Postgres DATE)
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

export async function createPerformanceTask(params: {
  studentId: string;
  subject: string;
  title: string;
  description?: string | null;
  dueDate: string;         // "YYYY-MM-DD"
  scoreWeight?: number | null;
  format?: string | null;
}) {
  const session = await auth();
  requireOnlineStaff(session?.user?.role);

  const student = await prisma.student.findUnique({
    where: { id: params.studentId },
    select: { id: true, isOnlineManaged: true },
  });
  if (!student || !student.isOnlineManaged) {
    throw new Error("온라인 관리 학생을 찾을 수 없습니다");
  }

  const task = await prisma.performanceTask.create({
    data: {
      studentId: params.studentId,
      subject: params.subject.trim(),
      title: params.title.trim(),
      description: params.description?.trim() || null,
      dueDate: toDateOnly(params.dueDate),
      scoreWeight: params.scoreWeight ?? null,
      format: params.format?.trim() || null,
      createdById: session!.user.id,
    },
  });

  revalidatePath(`/online/students/${params.studentId}/tasks`);
  revalidatePath(`/online/students/${params.studentId}`);
  revalidatePath("/online/performance");
  return { id: task.id };
}

export async function updatePerformanceTask(params: {
  taskId: string;
  subject?: string;
  title?: string;
  description?: string | null;
  dueDate?: string;
  scoreWeight?: number | null;
  format?: string | null;
}) {
  const session = await auth();
  requireOnlineStaff(session?.user?.role);

  const task = await prisma.performanceTask.findUnique({
    where: { id: params.taskId },
    select: { id: true, studentId: true },
  });
  if (!task) throw new Error("수행평가를 찾을 수 없습니다");

  const updated = await prisma.performanceTask.update({
    where: { id: params.taskId },
    data: {
      subject: params.subject?.trim(),
      title: params.title?.trim(),
      description: params.description?.trim() ?? undefined,
      dueDate: params.dueDate ? toDateOnly(params.dueDate) : undefined,
      scoreWeight: params.scoreWeight ?? undefined,
      format: params.format?.trim() ?? undefined,
    },
  });

  revalidatePath(`/online/students/${updated.studentId}/tasks`);
  revalidatePath("/online/performance");
}

export async function updatePerformanceTaskStatus(params: {
  taskId: string;
  status: PerformanceTaskStatus;
}) {
  const session = await auth();
  requireOnlineStaff(session?.user?.role);

  const task = await prisma.performanceTask.update({
    where: { id: params.taskId },
    data: { status: params.status },
    select: { studentId: true },
  });

  revalidatePath(`/online/students/${task.studentId}/tasks`);
  revalidatePath("/online/performance");
}

export async function deletePerformanceTask(taskId: string) {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  const task = await prisma.performanceTask.delete({
    where: { id: taskId },
    select: { studentId: true },
  });

  revalidatePath(`/online/students/${task.studentId}/tasks`);
  revalidatePath("/online/performance");
}
