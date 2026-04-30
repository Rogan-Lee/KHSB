"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { validateMagicLink } from "@/lib/student-auth";

/**
 * 학생 포털에서 모든 미확인 피드백을 읽음 처리.
 * 토큰 인증 → 본인 task의 feedback만 업데이트.
 * 반환: 읽음 처리된 피드백 ID 목록 (NEW 뱃지 표시용).
 */
export async function markFeedbackRead(params: {
  studentToken: string;
}): Promise<{ markedIds: string[] }> {
  const session = await validateMagicLink(params.studentToken);
  if (!session) throw new Error("인증이 만료되었습니다");

  const unread = await prisma.taskFeedback.findMany({
    where: {
      readByStudentAt: null,
      submission: { task: { studentId: session.student.id } },
    },
    select: { id: true },
  });
  if (unread.length === 0) return { markedIds: [] };

  await prisma.taskFeedback.updateMany({
    where: { id: { in: unread.map((u) => u.id) } },
    data: { readByStudentAt: new Date() },
  });

  revalidatePath(`/s/${params.studentToken}`, "layout");
  return { markedIds: unread.map((u) => u.id) };
}
