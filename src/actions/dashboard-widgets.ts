"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireStaff, requireFullAccess } from "@/lib/roles";

// ── (a) 전체 과제 현황 ────────────────────────────────────────────────

export type AssignmentStatusRow = {
  id: string;
  studentId: string;
  studentName: string;
  studentGrade: string;
  title: string;
  subject: string | null;
  dueDate: Date | null;
  isCompleted: boolean;
  completedAt: Date | null;
};

export async function getAllAssignmentStatus(): Promise<AssignmentStatusRow[]> {
  const session = await auth();
  requireStaff(session?.user?.role);

  const rows = await prisma.assignment.findMany({
    where: { student: { status: "ACTIVE" } },
    include: { student: { select: { id: true, name: true, grade: true } } },
    orderBy: [{ isCompleted: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    take: 300,
  });

  return rows.map((a) => ({
    id: a.id,
    studentId: a.studentId,
    studentName: a.student.name,
    studentGrade: a.student.grade,
    title: a.title,
    subject: a.subject,
    dueDate: a.dueDate,
    isCompleted: a.isCompleted,
    completedAt: a.completedAt,
  }));
}

// ── (b) 원생 증감 ──────────────────────────────────────────────────────

export type EnrollmentDelta = {
  total: number;
  newThisMonth: number;
  leftThisMonth: number;
  deltaVsLastMonth: {
    total: number;
    new: number;
    left: number;
  };
};

/**
 * 특정 연/월 기준 원생 증감 통계.
 * - total: 현재 ACTIVE 원생 수 (대시보드 '재원생' KPI와 일치)
 * - new:   startDate 가 해당 월 내
 * - left:  endDate 가 해당 월 내
 * - deltaVsLastMonth.total: 이번 달 순증 (= newThisMonth - leftThisMonth)
 *   전월 대비 ACTIVE 수 역산 대신, 실제 월내 이벤트 기반 순증을 사용.
 */
export async function getEnrollmentDelta(year: number, month: number): Promise<EnrollmentDelta> {
  const session = await auth();
  requireStaff(session?.user?.role);

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);
  const prevMonthStart = new Date(year, month - 2, 1);
  const prevMonthEnd = monthStart;

  const [currentTotal, currentNew, currentLeft, prevNew, prevLeft] =
    await Promise.all([
      prisma.student.count({ where: { status: "ACTIVE" } }),
      prisma.student.count({
        where: { startDate: { gte: monthStart, lt: monthEnd } },
      }),
      prisma.student.count({
        where: { endDate: { gte: monthStart, lt: monthEnd } },
      }),
      prisma.student.count({
        where: { startDate: { gte: prevMonthStart, lt: prevMonthEnd } },
      }),
      prisma.student.count({
        where: { endDate: { gte: prevMonthStart, lt: prevMonthEnd } },
      }),
    ]);

  return {
    total: currentTotal,
    newThisMonth: currentNew,
    leftThisMonth: currentLeft,
    deltaVsLastMonth: {
      total: currentNew - currentLeft,
      new: currentNew - prevNew,
      left: currentLeft - prevLeft,
    },
  };
}

// ── (c) 학교별 원생 통계 ───────────────────────────────────────────────

export type SchoolStatRow = {
  school: string;
  total: number;
  newThisMonth: number;
  leftThisMonth: number;
  delta: number;
};

export async function getSchoolStats(year: number, month: number): Promise<SchoolStatRow[]> {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);

  // 학교별 현재 재원
  const totalGroups = await prisma.student.groupBy({
    by: ["school"],
    where: { status: "ACTIVE" },
    _count: { _all: true },
  });

  // 학교별 신규 (해당 월 startDate)
  const newGroups = await prisma.student.groupBy({
    by: ["school"],
    where: { startDate: { gte: monthStart, lt: monthEnd } },
    _count: { _all: true },
  });

  // 학교별 이탈 (해당 월 endDate)
  const leftGroups = await prisma.student.groupBy({
    by: ["school"],
    where: { endDate: { gte: monthStart, lt: monthEnd } },
    _count: { _all: true },
  });

  const schoolSet = new Set<string>();
  for (const g of totalGroups) if (g.school) schoolSet.add(g.school);
  for (const g of newGroups) if (g.school) schoolSet.add(g.school);
  for (const g of leftGroups) if (g.school) schoolSet.add(g.school);

  const totalMap = new Map(totalGroups.map((g) => [g.school ?? "", g._count._all]));
  const newMap = new Map(newGroups.map((g) => [g.school ?? "", g._count._all]));
  const leftMap = new Map(leftGroups.map((g) => [g.school ?? "", g._count._all]));

  const rows: SchoolStatRow[] = Array.from(schoolSet).map((school) => {
    const t = totalMap.get(school) ?? 0;
    const n = newMap.get(school) ?? 0;
    const l = leftMap.get(school) ?? 0;
    return { school, total: t, newThisMonth: n, leftThisMonth: l, delta: n - l };
  });

  // 학교명 기준 원생 수 내림차순
  rows.sort((a, b) => b.total - a.total || a.school.localeCompare(b.school, "ko"));

  return rows;
}
