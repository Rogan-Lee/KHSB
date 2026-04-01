"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export interface SubjectTrend {
  subject: string;
  firstGrade: number | null;
  latestGrade: number | null;
  improvement: number | null; // 양수 = 상승 (등급 낮아짐)
  firstDate: string | null;
  latestDate: string | null;
}

export interface StudentAnalytics {
  studentId: string;
  studentName: string;
  grade: string;
  school: string | null;
  avgImprovement: number | null;     // 과목 평균 등급 상승폭
  daysToImprovement: number | null;  // 첫 시험 → 최근 시험 일수
  mentoringCount: number;            // 완료된 멘토링 수
  studyHours: number;                // 총 재원 시간 (hours)
  subjects: SubjectTrend[];
}

export interface CorrelationPoint {
  studentName: string;
  mentoringCount: number;
  avgImprovement: number;
}

export interface OverallAnalytics {
  students: StudentAnalytics[];
  avgImprovement: number | null;
  avgDaysToImprovement: number | null;
  avgStudyHoursPerMonth: number | null;
  correlationPoints: CorrelationPoint[];
}

export async function getOverallAnalytics(): Promise<OverallAnalytics> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const students = await prisma.student.findMany({
    where: { status: "ACTIVE" },
    include: {
      examScores: { orderBy: { examDate: "asc" } },
      mentorings: { where: { status: "COMPLETED" } },
      attendances: {
        where: { checkIn: { not: null }, checkOut: { not: null } },
        select: { checkIn: true, checkOut: true },
      },
    },
  });

  const studentAnalytics: StudentAnalytics[] = students.map((s) => {
    // 과목별 성적 추이
    const bySubject = new Map<string, typeof s.examScores>();
    for (const score of s.examScores) {
      if (!score.grade) continue;
      const arr = bySubject.get(score.subject) ?? [];
      arr.push(score);
      bySubject.set(score.subject, arr);
    }

    const subjects: SubjectTrend[] = [];
    for (const [subject, scores] of bySubject.entries()) {
      if (scores.length < 1) continue;
      const first = scores[0];
      const latest = scores[scores.length - 1];
      const improvement = first.grade && latest.grade
        ? first.grade - latest.grade  // 양수 = 등급 낮아짐 = 상승
        : null;
      subjects.push({
        subject,
        firstGrade: first.grade ?? null,
        latestGrade: latest.grade ?? null,
        improvement,
        firstDate: new Date(first.examDate).toISOString().split("T")[0],
        latestDate: new Date(latest.examDate).toISOString().split("T")[0],
      });
    }

    // 평균 등급 상승폭
    const improvements = subjects.map((s) => s.improvement).filter((v): v is number => v !== null);
    const avgImprovement = improvements.length > 0
      ? improvements.reduce((a, b) => a + b, 0) / improvements.length
      : null;

    // 첫 시험 → 최근 시험 경과 일수
    const allScores = s.examScores.filter((e) => e.grade);
    const daysToImprovement = allScores.length >= 2
      ? Math.round(
          (new Date(allScores[allScores.length - 1].examDate).getTime() -
            new Date(allScores[0].examDate).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : null;

    // 총 재원 시간
    const studyHours = s.attendances.reduce((sum, a) => {
      if (!a.checkIn || !a.checkOut) return sum;
      const diff = (new Date(a.checkOut).getTime() - new Date(a.checkIn).getTime()) / (1000 * 60 * 60);
      return sum + (diff > 0 && diff < 24 ? diff : 0);
    }, 0);

    return {
      studentId: s.id,
      studentName: s.name,
      grade: s.grade,
      school: s.school,
      avgImprovement: avgImprovement !== null ? Math.round(avgImprovement * 10) / 10 : null,
      daysToImprovement,
      mentoringCount: s.mentorings.length,
      studyHours: Math.round(studyHours),
      subjects,
    };
  });

  // 전체 평균 계산
  const improved = studentAnalytics.filter((s) => s.avgImprovement !== null);
  const avgImprovement = improved.length > 0
    ? Math.round((improved.reduce((a, b) => a + (b.avgImprovement ?? 0), 0) / improved.length) * 10) / 10
    : null;

  const withDays = studentAnalytics.filter((s) => s.daysToImprovement !== null);
  const avgDaysToImprovement = withDays.length > 0
    ? Math.round(withDays.reduce((a, b) => a + (b.daysToImprovement ?? 0), 0) / withDays.length)
    : null;

  const withHours = studentAnalytics.filter((s) => s.studyHours > 0);
  const avgStudyHoursPerMonth = withHours.length > 0
    ? Math.round((withHours.reduce((a, b) => a + b.studyHours, 0) / withHours.length) * 10) / 10
    : null;

  // 멘토링 횟수 vs 성적 상관관계 데이터
  const correlationPoints: CorrelationPoint[] = studentAnalytics
    .filter((s) => s.avgImprovement !== null)
    .map((s) => ({
      studentName: s.studentName,
      mentoringCount: s.mentoringCount,
      avgImprovement: s.avgImprovement!,
    }));

  return {
    students: studentAnalytics,
    avgImprovement,
    avgDaysToImprovement,
    avgStudyHoursPerMonth,
    correlationPoints,
  };
}

export async function getStudentAnalytics(studentId: string): Promise<StudentAnalytics | null> {
  // 공개 페이지(/r/[token])에서도 호출되므로 auth 체크 생략
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      examScores: { orderBy: { examDate: "asc" } },
      mentorings: { where: { status: "COMPLETED" } },
      attendances: {
        where: { checkIn: { not: null }, checkOut: { not: null } },
        select: { checkIn: true, checkOut: true },
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
      improvement: first.grade && latest.grade ? first.grade - latest.grade : null,
      firstDate: new Date(first.examDate).toISOString().split("T")[0],
      latestDate: new Date(latest.examDate).toISOString().split("T")[0],
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
  };
}
