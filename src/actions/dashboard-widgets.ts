"use server";

import { revalidatePath } from "next/cache";
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
  // override(수동 조정값) 적용 여부 — 위젯에서 "수동" 표시용
  newOverridden: boolean;
  leftOverridden: boolean;
  note: string | null;
  deltaVsLastMonth: {
    total: number;
    new: number;
    left: number;
  };
};

// 해당 월의 신규/이탈 effective 값(수동 override 우선, 없으면 자동 집계).
async function effectiveCounts(year: number, month: number) {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);

  const [autoNew, autoLeft, adj] = await Promise.all([
    prisma.student.count({ where: { startDate: { gte: monthStart, lt: monthEnd } } }),
    prisma.student.count({ where: { endDate: { gte: monthStart, lt: monthEnd } } }),
    prisma.enrollmentAdjustment.findUnique({ where: { year_month: { year, month } } }),
  ]);

  return {
    new: adj?.newCount ?? autoNew,
    left: adj?.leftCount ?? autoLeft,
    newOverridden: adj?.newCount != null,
    leftOverridden: adj?.leftCount != null,
    note: adj?.note ?? null,
  };
}

/**
 * 특정 연/월 기준 원생 증감 통계.
 * - total: 현재 ACTIVE 원생 수 (대시보드 '재원생' KPI와 일치, 항상 자동)
 * - new/left: 수동 조정값(EnrollmentAdjustment)이 있으면 우선, 없으면 자동 집계
 *   (자동: startDate/endDate 가 해당 월 내)
 * - deltaVsLastMonth: effective 값 기준 (override 반영)
 */
export async function getEnrollmentDelta(year: number, month: number): Promise<EnrollmentDelta> {
  const session = await auth();
  requireStaff(session?.user?.role);

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  const [currentTotal, cur, prev] = await Promise.all([
    prisma.student.count({ where: { status: "ACTIVE" } }),
    effectiveCounts(year, month),
    effectiveCounts(prevYear, prevMonth),
  ]);

  return {
    total: currentTotal,
    newThisMonth: cur.new,
    leftThisMonth: cur.left,
    newOverridden: cur.newOverridden,
    leftOverridden: cur.leftOverridden,
    note: cur.note,
    deltaVsLastMonth: {
      total: cur.new - cur.left,
      new: cur.new - prev.new,
      left: cur.left - prev.left,
    },
  };
}

/**
 * 원생 증감 수동 조정값 저장. 신규/이탈 각각 number=override, null=자동 집계.
 * 둘 다 null 이고 note 도 없으면 행 삭제(완전 자동으로 복귀). DIRECTOR/SUPER_ADMIN 전용.
 */
export async function setEnrollmentAdjustment(
  year: number,
  month: number,
  values: { newCount: number | null; leftCount: number | null; note?: string | null }
): Promise<void> {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  const newCount = values.newCount;
  const leftCount = values.leftCount;
  const note = values.note?.trim() ? values.note.trim() : null;

  if (newCount != null && newCount < 0) throw new Error("신규 등록 수는 0 이상이어야 합니다");
  if (leftCount != null && leftCount < 0) throw new Error("이탈 수는 0 이상이어야 합니다");

  if (newCount == null && leftCount == null && note == null) {
    await prisma.enrollmentAdjustment.deleteMany({ where: { year, month } });
    revalidatePath("/");
    return;
  }

  await prisma.enrollmentAdjustment.upsert({
    where: { year_month: { year, month } },
    create: { year, month, newCount, leftCount, note, updatedById: session?.user?.id },
    update: { newCount, leftCount, note, updatedById: session?.user?.id },
  });

  revalidatePath("/");
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
