"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireManagerMentor } from "@/lib/roles";

/**
 * 진도 스냅샷 추가 (append pattern — update 아님).
 * 같은 학생·과목에 여러 레코드가 쌓여 히스토리를 구성.
 * 관리 멘토 또는 원장만 호출.
 */
export async function recordSubjectProgress(params: {
  studentId: string;
  subject: string;
  currentTopic: string;
  textbookPage?: string | null;
  weeklyProgress?: number | null;
  notes?: string | null;
}) {
  const session = await auth();
  requireManagerMentor(session?.user?.role);

  const student = await prisma.student.findUnique({
    where: { id: params.studentId },
    select: { id: true, isOnlineManaged: true },
  });
  if (!student || !student.isOnlineManaged) {
    throw new Error("온라인 관리 학생을 찾을 수 없습니다");
  }

  if (!params.currentTopic.trim()) {
    throw new Error("현재 진도 위치를 입력하세요");
  }
  const weekly = params.weeklyProgress;
  if (weekly != null && (weekly < 0 || weekly > 100)) {
    throw new Error("주간 진행률은 0~100 사이여야 합니다");
  }

  await prisma.subjectProgress.create({
    data: {
      studentId: params.studentId,
      subject: params.subject.trim(),
      currentTopic: params.currentTopic.trim(),
      textbookPage: params.textbookPage?.trim() || null,
      weeklyProgress: weekly ?? null,
      notes: params.notes?.trim() || null,
      authorId: session!.user.id,
    },
  });

  revalidatePath(`/online/students/${params.studentId}/progress`);
  revalidatePath(`/online/students/${params.studentId}`);
}

/**
 * 특정 진도 스냅샷 삭제 (잘못 기록 시). 본인 작성분만 또는 원장.
 */
export async function deleteSubjectProgressEntry(entryId: string) {
  const session = await auth();
  requireManagerMentor(session?.user?.role);

  const entry = await prisma.subjectProgress.findUnique({
    where: { id: entryId },
    select: { id: true, studentId: true, authorId: true },
  });
  if (!entry) throw new Error("진도 기록을 찾을 수 없습니다");

  const isAuthor = entry.authorId === session!.user.id;
  const isFullAccess =
    session!.user.role === "DIRECTOR" || session!.user.role === "SUPER_ADMIN";
  if (!isAuthor && !isFullAccess) {
    throw new Error("본인 작성 기록만 삭제할 수 있습니다");
  }

  await prisma.subjectProgress.delete({ where: { id: entryId } });
  revalidatePath(`/online/students/${entry.studentId}/progress`);
}
