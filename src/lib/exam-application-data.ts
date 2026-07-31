import { validateMagicLink } from "@/lib/student-auth";
import { prisma } from "@/lib/prisma";
import { todayKST } from "@/lib/utils";
import { EXAM_TYPE_LABELS } from "@/components/exams/exam-type-label";

export type ExamApplyStatus = "NONE" | "PENDING" | "CONFIRMED" | "CANCELLED";

export type ExamApplicationSession = {
  sessionId: string;
  title: string;
  examDate: string; // YYYY-MM-DD
  examTypeLabel: string;
  subjects: string[];
  notes: string | null;
  myStatus: ExamApplyStatus;
  myMemo: string;
};

export type ExamApplicationFormData = {
  studentName: string;
  sessions: ExamApplicationSession[];
};

/**
 * 매직링크 토큰으로 학생을 식별하고, 신청 접수중인 모의고사 목록 + 본인 신청 상태를 로드.
 * 도시락(loadLunchFormData)과 동일한 토큰 검증 패턴. 유효하지 않으면 null.
 */
export async function loadExamApplicationData(token: string): Promise<ExamApplicationFormData | null> {
  const session = await validateMagicLink(token);
  if (!session) return null;
  const studentId = session.student.id;

  const sessions = await prisma.examSession.findMany({
    where: { applicationOpen: true, examDate: { gte: todayKST() } },
    orderBy: { examDate: "asc" },
    include: {
      applications: { where: { studentId }, select: { status: true, memo: true } },
    },
  });

  return {
    studentName: session.student.name,
    sessions: sessions.map((s) => {
      const mine = s.applications[0];
      return {
        sessionId: s.id,
        title: s.title,
        examDate: s.examDate.toISOString().slice(0, 10),
        examTypeLabel: EXAM_TYPE_LABELS[s.examType],
        subjects: s.subjects,
        notes: s.notes,
        myStatus: (mine?.status ?? "NONE") as ExamApplyStatus,
        myMemo: mine?.memo ?? "",
      };
    }),
  };
}
