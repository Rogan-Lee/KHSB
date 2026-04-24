"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireManagerMentor } from "@/lib/roles";
import { KAKAO_LOG_TAGS } from "@/lib/online/kakao-tags";

const VALID_TAGS = new Set<string>(KAKAO_LOG_TAGS);

/**
 * 학생×날짜 unique upsert. summary 는 필수.
 * 관리 멘토 또는 FullAccess 만 호출.
 */
export async function upsertDailyKakaoLog(params: {
  studentId: string;
  logDate: string; // "YYYY-MM-DD"
  summary: string;
  tags: string[];
  isParentVisible: boolean;
}) {
  const session = await auth();
  requireManagerMentor(session?.user?.role);

  if (!params.summary.trim()) {
    throw new Error("요약을 입력하세요");
  }

  const student = await prisma.student.findUnique({
    where: { id: params.studentId },
    select: { id: true, isOnlineManaged: true },
  });
  if (!student || !student.isOnlineManaged) {
    throw new Error("온라인 관리 학생을 찾을 수 없습니다");
  }

  const cleanTags = params.tags.filter((t) => VALID_TAGS.has(t));
  const logDateOnly = new Date(params.logDate + "T00:00:00.000Z");

  await prisma.dailyKakaoLog.upsert({
    where: {
      studentId_logDate: { studentId: params.studentId, logDate: logDateOnly },
    },
    update: {
      summary: params.summary.trim(),
      tags: cleanTags,
      isParentVisible: params.isParentVisible,
    },
    create: {
      studentId: params.studentId,
      logDate: logDateOnly,
      summary: params.summary.trim(),
      tags: cleanTags,
      isParentVisible: params.isParentVisible,
      authorId: session!.user.id,
    },
  });

  revalidatePath("/online/daily-log");
  revalidatePath(`/online/students/${params.studentId}/daily-log`);
  revalidatePath(`/online/students/${params.studentId}`);
}

/**
 * 특정 날짜 로그 삭제 (잘못 기록 시). 본인 작성분만 또는 FullAccess.
 */
export async function deleteDailyKakaoLog(logId: string) {
  const session = await auth();
  requireManagerMentor(session?.user?.role);

  const log = await prisma.dailyKakaoLog.findUnique({
    where: { id: logId },
    select: { id: true, studentId: true, authorId: true },
  });
  if (!log) throw new Error("기록을 찾을 수 없습니다");

  const isAuthor = log.authorId === session!.user.id;
  const isFull =
    session!.user.role === "DIRECTOR" || session!.user.role === "SUPER_ADMIN";
  if (!isAuthor && !isFull) {
    throw new Error("본인 작성 기록만 삭제할 수 있습니다");
  }

  await prisma.dailyKakaoLog.delete({ where: { id: logId } });
  revalidatePath("/online/daily-log");
  revalidatePath(`/online/students/${log.studentId}/daily-log`);
}
