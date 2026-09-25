import { z } from "zod";

import { EXAM_TYPE_LABELS } from "@/components/exams/exam-type-label";
import {
  cancelExamApplicationForStudent,
  submitExamApplicationForStudent,
} from "@/lib/exam-application-core";
import {
  loadExamApplicationSessionsForStudent,
  type ExamApplyStatus,
} from "@/lib/exam-application-data";
import { MobileApiError } from "@/lib/mobile-auth";
import { parseMobileBody, type ParentChildRef } from "@/lib/mobile-parent-services";
import { prisma } from "@/lib/prisma";
import { todayKST } from "@/lib/utils";

// 학부모 앱 — 모의고사 신청. 웹 /s/[token]/exam 과 같은 신청 규칙(exam-application-core 공용).
// 웹은 "접수 중" 시험만 보여 주지만, 학부모는 접수가 닫힌 뒤의 확정·좌석 배정도 궁금하므로
// 자녀가 신청했거나 좌석을 받은 다가오는 시험도 함께 내려준다.

const VIA_APP = " (학부모 앱)";

const applySchema = z.object({
  memo: z.string().max(300, "요청사항은 300자까지 쓸 수 있어요").optional().nullable(),
});

export type ParentExamSession = {
  sessionId: string;
  title: string;
  examDate: string;
  examTypeLabel: string;
  subjects: string[];
  notes: string | null;
  applicationOpen: boolean;
  myStatus: ExamApplyStatus;
  myMemo: string;
  seatNumber: number | null;
};

export async function getParentExams(child: ParentChildRef) {
  const today = todayKST();
  const open = await loadExamApplicationSessionsForStudent(child.id);
  const openIds = new Set(open.map((s) => s.sessionId));

  const [mine, seats] = await Promise.all([
    // 접수는 닫혔지만 자녀가 신청했거나 좌석을 받은 다가오는 시험
    prisma.examSession.findMany({
      where: {
        id: { notIn: [...openIds] },
        examDate: { gte: today },
        OR: [
          { applications: { some: { studentId: child.id } } },
          { assignments: { some: { studentId: child.id } } },
        ],
      },
      orderBy: { examDate: "asc" },
      include: {
        applications: { where: { studentId: child.id }, select: { status: true, memo: true } },
      },
    }),
    prisma.examSeatAssignment.findMany({
      where: { studentId: child.id, session: { examDate: { gte: today } } },
      select: { sessionId: true, seatNumber: true },
    }),
  ]);
  const seatOf = new Map(seats.map((s) => [s.sessionId, s.seatNumber]));

  const sessions: ParentExamSession[] = [
    ...open.map((s) => ({
      ...s,
      applicationOpen: true,
      seatNumber: seatOf.get(s.sessionId) ?? null,
    })),
    ...mine.map((s) => {
      const app = s.applications[0];
      return {
        sessionId: s.id,
        title: s.title,
        examDate: s.examDate.toISOString().slice(0, 10),
        examTypeLabel: EXAM_TYPE_LABELS[s.examType],
        subjects: s.subjects,
        notes: s.notes,
        applicationOpen: false,
        // 좌석만 받고 신청 기록이 없으면(운영진 직접 배정) 확정으로 본다
        myStatus: (app?.status ?? (seatOf.has(s.id) ? "CONFIRMED" : "NONE")) as ExamApplyStatus,
        myMemo: app?.memo ?? "",
        seatNumber: seatOf.get(s.id) ?? null,
      };
    }),
  ].sort((a, b) => a.examDate.localeCompare(b.examDate));

  return { studentName: child.name, sessions };
}

export async function applyParentExam(child: ParentChildRef, sessionId: string, input: unknown) {
  const body = parseMobileBody(applySchema, input);
  return submitExamApplicationForStudent(child, sessionId, body.memo ?? undefined, VIA_APP);
}

export async function cancelParentExam(child: ParentChildRef, sessionId: string) {
  const app = await prisma.examApplication.findUnique({
    where: { sessionId_studentId: { sessionId, studentId: child.id } },
    select: { status: true },
  });
  if (!app) return { ok: true };
  // 웹과 같이 확정된 신청은 직접 취소하지 않는다 (좌석 배정과 얽혀 있음)
  if (app.status === "CONFIRMED") {
    throw new MobileApiError("확정된 신청은 운영진에게 문의해 취소해 주세요", 409);
  }
  return cancelExamApplicationForStudent(child.id, sessionId);
}
