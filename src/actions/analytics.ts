"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireStaff } from "@/lib/roles";
import { todayKST } from "@/lib/utils";
import {
  buildAttendanceTimeStats,
  stayMs,
  weekStartOf,
  type AttendanceInterval,
  type AttendanceTimeStats,
} from "@/lib/attendance-stats";

export interface SubjectTrend {
  subject: string;
  firstGrade: number | null;
  latestGrade: number | null;
  improvement: number | null; // 양수 = 상승 (등급 낮아짐)
  firstDate: string | null;
  latestDate: string | null;
  firstExamName: string | null;
  latestExamName: string | null;
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
  /** 최근 4주 주별 재원시간 합계 (getStudentAnalytics 에서만 채움) */
  weeklyStudyHours?: { weekStart: string; hours: number }[];
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
      // 2회 이상이어야 변화 계산 (1회만 있으면 비교 대상 없음)
      const improvement = scores.length >= 2 && first.grade && latest.grade
        ? first.grade - latest.grade  // 양수 = 등급 낮아짐 = 상승
        : null;
      subjects.push({
        subject,
        firstGrade: first.grade ?? null,
        latestGrade: latest.grade ?? null,
        improvement,
        firstDate: new Date(first.examDate).toISOString().split("T")[0],
        latestDate: new Date(latest.examDate).toISOString().split("T")[0],
        firstExamName: first.examName,
        latestExamName: latest.examName,
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

/** 기간 내 등원(재원) 시간 통계 — 일별 평균 추이, 요일별 평균 입실/재원, 학생별 합계 */
export async function getAttendanceTimeStats(range: {
  from: string; // "YYYY-MM-DD"
  to: string;
}): Promise<AttendanceTimeStats> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireStaff(session.user.role);

  const records = await prisma.attendanceRecord.findMany({
    where: {
      date: { gte: new Date(range.from), lte: new Date(range.to) },
      checkIn: { not: null },
      checkOut: { not: null }, // 완료된 기록만
      student: { status: "ACTIVE" },
    },
    select: {
      studentId: true,
      date: true,
      checkIn: true,
      checkOut: true,
      outStart: true,
      outEnd: true,
      student: { select: { name: true } },
    },
  });

  const intervals: AttendanceInterval[] = records.map((r) => ({
    studentId: r.studentId,
    studentName: r.student.name,
    date: new Date(r.date).toISOString().slice(0, 10),
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    outStart: r.outStart,
    outEnd: r.outEnd,
  }));

  return buildAttendanceTimeStats(intervals);
}
