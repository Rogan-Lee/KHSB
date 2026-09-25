import { revalidatePath } from "next/cache";

import { MobileApiError } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { notifySlack } from "@/lib/slack";
import { todayKST } from "@/lib/utils";

// 모의고사 신청/취소(학생·학부모 측) 핵심 로직 — 학생 ID 기준.
// 인증은 호출 측 책임: 웹 서버 액션(src/actions/exam-application.ts, 매직링크 토큰)과
// 학부모 앱(src/lib/mobile-parent-exams.ts, ParentLink)이 같이 쓴다.

/**
 * 모의고사 신청(또는 재신청). 세션이 신청 접수중(applicationOpen)이고 시험일이 지나지 않아야 함.
 * 이미 신청 이력이 있으면(취소/반려 포함) PENDING 으로 되돌려 재접수.
 * via: Slack 문구 끝에 붙는 경로 표시 (예: " (학부모 앱)"). 웹은 생략 → 기존 문구 그대로.
 */
export async function submitExamApplicationForStudent(
  student: { id: string; name: string },
  sessionId: string,
  memo?: string,
  via = "",
) {
  const exam = await prisma.examSession.findUnique({ where: { id: sessionId } });
  if (!exam) throw new MobileApiError("시험을 찾을 수 없습니다", 404);
  if (!exam.applicationOpen || exam.examDate < todayKST()) {
    throw new MobileApiError("신청이 마감된 시험입니다", 409);
  }

  const trimmed = memo?.trim() || null;
  await prisma.examApplication.upsert({
    where: { sessionId_studentId: { sessionId, studentId: student.id } },
    update: { status: "PENDING", memo: trimmed, confirmedAt: null, confirmedById: null },
    create: { sessionId, studentId: student.id, memo: trimmed },
  });

  notifySlack(`📝 [모의고사 신청] ${student.name} 학생이 "${exam.title}" 신청했습니다.${via}`);
  revalidatePath(`/exams/${sessionId}`);
  return { ok: true };
}

/** 본인 신청 철회 — 행 삭제(재신청 가능). */
export async function cancelExamApplicationForStudent(studentId: string, sessionId: string) {
  await prisma.examApplication.deleteMany({ where: { sessionId, studentId } });
  revalidatePath(`/exams/${sessionId}`);
  return { ok: true };
}
