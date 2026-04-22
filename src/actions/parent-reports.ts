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
