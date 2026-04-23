"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/roles";
import { revalidatePath } from "next/cache";

export async function createParentReport(
  mentoringId: string,
  data: {
    studyPlanImages?: string[];
    customNote?: string;
  }
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const mentoring = await prisma.mentoring.findUnique({
    where: { id: mentoringId },
    select: { studentId: true, notes: true },
  });
  if (!mentoring) throw new Error("멘토링을 찾을 수 없습니다");

  const report = await prisma.parentReport.create({
    data: {
      studentId: mentoring.studentId,
      mentoringId,
      studyPlanImages: data.studyPlanImages ?? [],
      customNote: data.customNote || mentoring.notes || null,
      createdById: session.user.id,
    },
    select: { token: true },
  });

  return { token: report.token };
}

export type StudentReportRow = {
  studentId: string;
  studentName: string;
  grade: string;
  school: string | null;
  latestMentoring: {
    id: string;
    date: Date;
    mentorName: string;
    hasNotes: boolean;
  } | null;
  parentReport: {
    id: string;
    token: string;
    customNote: string | null;
    createdAt: Date;
  } | null;
};

/**
 * 학부모 리포트 발송용 화면에 필요한 학생별 데이터.
 * - ACTIVE 학생 전체
 * - 각 학생의 가장 최근 COMPLETED 멘토링
 * - 그 멘토링에 연결된 최신 ParentReport (있으면)
 */
export async function getStudentsForReportDispatch(): Promise<StudentReportRow[]> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireStaff(session.user.role);

  const students = await prisma.student.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      grade: true,
      school: true,
      mentorings: {
        where: { status: "COMPLETED" },
        orderBy: [{ actualDate: "desc" }, { scheduledAt: "desc" }],
        take: 1,
        select: {
          id: true,
          actualDate: true,
          scheduledAt: true,
          notes: true,
          content: true,
          mentor: { select: { name: true } },
          parentReports: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, token: true, customNote: true, createdAt: true },
          },
        },
      },
    },
    orderBy: [{ grade: "asc" }, { name: "asc" }],
  });

  return students.map((s) => {
    const m = s.mentorings[0];
    const pr = m?.parentReports[0];
    return {
      studentId: s.id,
      studentName: s.name,
      grade: s.grade,
      school: s.school,
      latestMentoring: m
        ? {
            id: m.id,
            date: m.actualDate ?? m.scheduledAt,
            mentorName: m.mentor.name,
            hasNotes: !!(m.notes || m.content),
          }
        : null,
      parentReport: pr
        ? {
            id: pr.id,
            token: pr.token,
            customNote: pr.customNote,
            createdAt: pr.createdAt,
          }
        : null,
    };
  });
}

export type BulkCreateByStudentResult = {
  studentId: string;
  studentName: string;
  status: "created" | "existing" | "no-mentoring" | "failed";
  reportId?: string;
  token?: string;
  reason?: string;
};

/**
 * 학생 ID 배열로 일괄 ParentReport 생성.
 * - 각 학생의 최신 COMPLETED 멘토링을 찾아 생성
 * - 이미 있으면 'existing' (재사용)
 * - 완료된 멘토링이 없으면 'no-mentoring' (skip)
 */
export async function createParentReportsForStudents(
  studentIds: string[]
): Promise<BulkCreateByStudentResult[]> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireStaff(session.user.role);

  const results: BulkCreateByStudentResult[] = [];
  const unique = Array.from(new Set(studentIds));

  for (const sid of unique) {
    try {
      const student = await prisma.student.findUnique({
        where: { id: sid },
        select: {
          name: true,
          mentorings: {
            where: { status: "COMPLETED" },
            orderBy: [{ actualDate: "desc" }, { scheduledAt: "desc" }],
            take: 1,
            select: {
              id: true,
              notes: true,
              parentReports: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { id: true, token: true },
              },
            },
          },
        },
      });
      if (!student) {
        results.push({ studentId: sid, studentName: "?", status: "failed", reason: "학생 없음" });
        continue;
      }
      const m = student.mentorings[0];
      if (!m) {
        results.push({ studentId: sid, studentName: student.name, status: "no-mentoring" });
        continue;
      }
      const existing = m.parentReports[0];
      if (existing) {
        results.push({
          studentId: sid,
          studentName: student.name,
          status: "existing",
          reportId: existing.id,
          token: existing.token,
        });
        continue;
      }
      const created = await prisma.parentReport.create({
        data: {
          studentId: sid,
          mentoringId: m.id,
          studyPlanImages: [],
          customNote: m.notes ?? null,
          createdById: session.user.id,
        },
        select: { id: true, token: true },
      });
      results.push({
        studentId: sid,
        studentName: student.name,
        status: "created",
        reportId: created.id,
        token: created.token,
      });
    } catch (e) {
      results.push({
        studentId: sid,
        studentName: "?",
        status: "failed",
        reason: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  revalidatePath("/mentoring");
  return results;
}

export type BulkParentReportResult = {
  mentoringId: string;
  studentName: string;
  status: "created" | "existing" | "failed";
  token?: string;
  reason?: string;
};

/**
 * 여러 멘토링에 대해 학부모 리포트를 일괄 생성.
 * - 이미 존재하는 경우 skip(기존 토큰 반환)
 * - 각 건을 독립 처리 (실패해도 나머지는 진행)
 */
export async function createParentReportsBulk(mentoringIds: string[]): Promise<BulkParentReportResult[]> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireStaff(session.user.role);

  const unique = Array.from(new Set(mentoringIds));
  const results: BulkParentReportResult[] = [];

  for (const mid of unique) {
    try {
      const mentoring = await prisma.mentoring.findUnique({
        where: { id: mid },
        select: { studentId: true, notes: true, student: { select: { name: true } } },
      });
      if (!mentoring) {
        results.push({ mentoringId: mid, studentName: "?", status: "failed", reason: "멘토링 없음" });
        continue;
      }

      // 기존 리포트가 있으면 재사용 (가장 최신)
      const existing = await prisma.parentReport.findFirst({
        where: { mentoringId: mid },
        orderBy: { createdAt: "desc" },
        select: { token: true },
      });
      if (existing) {
        results.push({
          mentoringId: mid,
          studentName: mentoring.student.name,
          status: "existing",
          token: existing.token,
        });
        continue;
      }

      const created = await prisma.parentReport.create({
        data: {
          studentId: mentoring.studentId,
          mentoringId: mid,
          studyPlanImages: [],
          customNote: mentoring.notes ?? null,
          createdById: session.user.id,
        },
        select: { token: true },
      });
      results.push({
        mentoringId: mid,
        studentName: mentoring.student.name,
        status: "created",
        token: created.token,
      });
    } catch (e) {
      results.push({
        mentoringId: mid,
        studentName: "?",
        status: "failed",
        reason: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  revalidatePath("/mentoring");
  return results;
}

/**
 * ParentReport.customNote 수정 (관리자 편집용).
 */
export async function updateParentReportNote(reportId: string, customNote: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireStaff(session.user.role);

  await prisma.parentReport.update({
    where: { id: reportId },
    data: { customNote: customNote || null },
  });
  revalidatePath("/mentoring");
}

export async function getParentReport(token: string) {
  return prisma.parentReport.findUnique({
    where: { token },
    include: {
      student: {
        select: { id: true, name: true, grade: true, school: true },
      },
      mentoring: {
        select: {
          scheduledAt: true,
          actualDate: true,
          actualStartTime: true,
          actualEndTime: true,
          status: true,
          content: true,
          improvements: true,
          weaknesses: true,
          nextGoals: true,
          notes: true,
          mentor: { select: { name: true } },
        },
      },
    },
  });
}
