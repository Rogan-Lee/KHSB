// 학생 1명 성과 분석 계산 — 서버 전용 (NOT a server action).
// 토큰 페이지(/r/[token])·모바일 학부모 리포트처럼 호출부가 이미 학생 소유를 검증한 경우
// 이 함수를 직접 import 해 쓴다. "use server" 파일에 두면 인증 없는 공개 엔드포인트가 되므로 분리.
import { prisma } from "@/lib/prisma";
import { todayKST } from "@/lib/utils";
import { stayMs, weekStartOf } from "@/lib/attendance-stats";
import type { StudentAnalytics, SubjectTrend } from "@/actions/analytics";

export async function computeStudentAnalytics(studentId: string): Promise<StudentAnalytics | null> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      examScores: { orderBy: { examDate: "asc" } },
      mentorings: { where: { status: "COMPLETED" } },
      attendances: {
        where: { checkIn: { not: null }, checkOut: { not: null } },
        select: { date: true, checkIn: true, checkOut: true, outStart: true, outEnd: true },
      },
    },
  });
  if (!student) return null;

  const bySubject = new Map<string, typeof student.examScores>();
  for (const score of student.examScores) {
    if (!score.grade) continue;
    const arr = bySubject.get(score.subject) ?? [];
    arr.push(score);
    bySubject.set(score.subject, arr);
  }

  const subjects: SubjectTrend[] = [];
  for (const [subject, scores] of bySubject.entries()) {
    const first = scores[0];
    const latest = scores[scores.length - 1];
    subjects.push({
      subject,
      firstGrade: first.grade ?? null,
      latestGrade: latest.grade ?? null,
      improvement: scores.length >= 2 && first.grade && latest.grade ? first.grade - latest.grade : null,
      firstDate: new Date(first.examDate).toISOString().split("T")[0],
      latestDate: new Date(latest.examDate).toISOString().split("T")[0],
      firstExamName: first.examName,
      latestExamName: latest.examName,
    });
  }

  const improvements = subjects.map((s) => s.improvement).filter((v): v is number => v !== null);
  const avgImprovement = improvements.length > 0
    ? Math.round((improvements.reduce((a, b) => a + b, 0) / improvements.length) * 10) / 10
    : null;

  const allScores = student.examScores.filter((e) => e.grade);
  const daysToImprovement = allScores.length >= 2
    ? Math.round(
        (new Date(allScores[allScores.length - 1].examDate).getTime() -
          new Date(allScores[0].examDate).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : null;

  const studyHours = student.attendances.reduce((sum, a) => {
    if (!a.checkIn || !a.checkOut) return sum;
    const diff = (new Date(a.checkOut).getTime() - new Date(a.checkIn).getTime()) / (1000 * 60 * 60);
    return sum + (diff > 0 && diff < 24 ? diff : 0);
  }, 0);

  // 최근 4주 주별 재원시간 합계 (이번 주 포함, 외출 차감)
  const thisWeek = weekStartOf(todayKST().toISOString().slice(0, 10));
  const weekStarts: string[] = [];
  for (let i = 3; i >= 0; i--) {
    const d = new Date(`${thisWeek}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i * 7);
    weekStarts.push(d.toISOString().slice(0, 10));
  }
  const msByWeek = new Map(weekStarts.map((w) => [w, 0]));
  for (const a of student.attendances) {
    const ms = stayMs(a);
    if (ms === null) continue;
    const w = weekStartOf(new Date(a.date).toISOString().slice(0, 10));
    if (msByWeek.has(w)) msByWeek.set(w, msByWeek.get(w)! + ms);
  }
  const weeklyStudyHours = weekStarts.map((w) => ({
    weekStart: w,
    hours: Math.round((msByWeek.get(w)! / (1000 * 60 * 60)) * 10) / 10,
  }));

  return {
    studentId: student.id,
    studentName: student.name,
    grade: student.grade,
    school: student.school,
    avgImprovement,
    daysToImprovement,
    mentoringCount: student.mentorings.length,
    studyHours: Math.round(studyHours),
    subjects,
    weeklyStudyHours,
  };
}
