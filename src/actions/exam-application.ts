"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/roles";
import { validateMagicLink } from "@/lib/student-auth";
import { notifySlack } from "@/lib/slack";
import { todayKST } from "@/lib/utils";
import { ExamApplicationStatus } from "@/generated/prisma";
import { assignExamSeatsRandomly } from "@/actions/exam-sessions";

// ─────────────────────────── 학생/학부모 (매직링크 토큰 인증) ───────────────────────────

/**
 * 모의고사 신청(또는 재신청). 세션이 신청 접수중(applicationOpen)이고 시험일이 지나지 않아야 함.
 * 이미 신청 이력이 있으면(취소/반려 포함) PENDING 으로 되돌려 재접수.
 */
export async function submitExamApplication(token: string, sessionId: string, memo?: string) {
  const session = await validateMagicLink(token);
  if (!session) throw new Error("인증이 만료되었습니다");
  const studentId = session.student.id;

  const exam = await prisma.examSession.findUnique({ where: { id: sessionId } });
  if (!exam) throw new Error("시험을 찾을 수 없습니다");
  if (!exam.applicationOpen || exam.examDate < todayKST()) {
    throw new Error("신청이 마감된 시험입니다");
  }

  const trimmed = memo?.trim() || null;
  await prisma.examApplication.upsert({
    where: { sessionId_studentId: { sessionId, studentId } },
    update: { status: "PENDING", memo: trimmed, confirmedAt: null, confirmedById: null },
    create: { sessionId, studentId, memo: trimmed },
  });

  notifySlack(`📝 [모의고사 신청] ${session.student.name} 학생이 "${exam.title}" 신청했습니다.`);
  revalidatePath(`/exams/${sessionId}`);
  return { ok: true };
}

/** 학생/학부모 본인 신청 철회 — 행 삭제(재신청 가능). */
export async function cancelExamApplication(token: string, sessionId: string) {
  const session = await validateMagicLink(token);
  if (!session) throw new Error("인증이 만료되었습니다");
  await prisma.examApplication.deleteMany({
    where: { sessionId, studentId: session.student.id },
  });
  revalidatePath(`/exams/${sessionId}`);
  return { ok: true };
}

// ─────────────────────────── 운영진 (requireStaff) ───────────────────────────

/** 신청 접수 열기/닫기 토글. */
export async function toggleExamApplicationOpen(sessionId: string, open: boolean) {
  const s = await auth();
  requireStaff(s?.user?.role);
  await prisma.examSession.update({ where: { id: sessionId }, data: { applicationOpen: open } });
  revalidatePath(`/exams/${sessionId}`);
}

/** 신청 상태 변경 — 확정(CONFIRMED) / 반려(CANCELLED) / 대기(PENDING). */
export async function setExamApplicationStatus(id: string, status: ExamApplicationStatus) {
  const s = await auth();
  requireStaff(s?.user?.role);
  const app = await prisma.examApplication.update({
    where: { id },
    data: {
      status,
      confirmedAt: status === "CONFIRMED" ? new Date() : null,
      confirmedById: status === "CONFIRMED" ? s!.user.id : null,
    },
    select: { sessionId: true },
  });
  revalidatePath(`/exams/${app.sessionId}`);
}

/**
 * 확정(CONFIRMED)된 신청자들을 기존 좌석 자동배정 로직으로 넘긴다.
 * 좌석배정은 재발명하지 않고 exam-sessions 의 assignExamSeatsRandomly 를 그대로 호출.
 */
export async function assignSeatsFromConfirmedApplications(sessionId: string) {
  const s = await auth();
  requireStaff(s?.user?.role);
  const confirmed = await prisma.examApplication.findMany({
    where: { sessionId, status: "CONFIRMED" },
    select: { studentId: true },
  });
  if (confirmed.length === 0) throw new Error("확정된 신청자가 없습니다");
  await assignExamSeatsRandomly(sessionId, confirmed.map((c) => c.studentId));
  return { count: confirmed.length };
}
