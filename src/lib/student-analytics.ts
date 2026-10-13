// 학생 1명 성과 분석 계산 — 서버 전용 (NOT a server action).
// 토큰 페이지(/r/[token])·모바일 학부모 리포트처럼 호출부가 이미 학생 소유를 검증한 경우
// 이 함수를 직접 import 해 쓴다. "use server" 파일에 두면 인증 없는 공개 엔드포인트가 되므로 분리.
import { prisma } from "@/lib/prisma";
import { todayKST } from "@/lib/utils";
import { stayMs, weekStartOf } from "@/lib/attendance-stats";
import type { StudentAnalytics, SubjectTrend } from "@/actions/analytics";

/**
 * 학생별 총 재원 시간(ms) — 완료 기록(입·퇴실 모두 있음) 중 0 초과 24시간 미만만 합산.
 * 전체 출결 이력을 가져와 JS 로 더하던 것을 DB 에서 합산한다(egress 절감). 기록 없는 학생은 Map 에 없음.
 */
export async function sumStayMsByStudent(studentIds: readonly string[]): Promise<Map<string, number>> {
  if (studentIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ studentId: string; ms: number | null }[]>`
    SELECT "studentId", SUM(EXTRACT(EPOCH FROM ("checkOut" - "checkIn")) * 1000)::float8 AS ms
    FROM "AttendanceRecord"
    WHERE "studentId" = ANY(${[...studentIds]}::text[])
      AND "checkIn" IS NOT NULL AND "checkOut" IS NOT NULL
      AND "checkOut" > "checkIn"
      AND "checkOut" - "checkIn" < INTERVAL '24 hours'
    GROUP BY "studentId"`;
  return new Map(rows.map((r) => [r.studentId, Number(r.ms ?? 0)]));
}

/** 최근 4주(이번 주 포함) 주 시작일(월요일) 목록 — 오래된 순 */
function recentWeekStarts(): string[] {
  const thisWeek = weekStartOf(todayKST().toISOString().slice(0, 10));
  const weekStarts: string[] = [];
  for (let i = 3; i >= 0; i--) {
    const d = new Date(`${thisWeek}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i * 7);
    weekStarts.push(d.toISOString().slice(0, 10));
  }
  return weekStarts;
}

export async function computeStudentAnalytics(studentId: string): Promise<StudentAnalytics | null> {
  const weekStarts = recentWeekStarts();
  // 계산에 쓰는 필드만 — 멘토링은 개수만(장문 컬럼 제외), 출결은 주별 합계용 최근 4주만 (egress 절감)
  const [student, stayMsTotals] = await Promise.all([
    prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        name: true,
        grade: true,
        school: true,
        examScores: {
          orderBy: { examDate: "asc" },
          select: { subject: true, grade: true, examDate: true, examName: true },
        },
        _count: { select: { mentorings: { where: { status: "COMPLETED" } } } },
        attendances: {
          where: {
            checkIn: { not: null },
            checkOut: { not: null },
            date: { gte: new Date(`${weekStarts[0]}T00:00:00Z`) },
          },
          select: { date: true, checkIn: true, checkOut: true, outStart: true, outEnd: true },
        },
      },
    }),
    sumStayMsByStudent([studentId]),
  ]);
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

  // 총 재원 시간 — 전체 이력은 DB 에서 합산
  const studyHours = (stayMsTotals.get(student.id) ?? 0) / (1000 * 60 * 60);

  // 최근 4주 주별 재원시간 합계 (이번 주 포함, 외출 차감)
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
    mentoringCount: student._count.mentorings,
    studyHours: Math.round(studyHours),
    subjects,
    weeklyStudyHours,
  };
}
