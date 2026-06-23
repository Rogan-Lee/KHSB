"use server";

import { revalidatePath } from "next/cache";
import { startOfMonth, endOfMonth } from "date-fns";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireFullAccess } from "@/lib/roles";
import {
  buildMonthlyMentoringSummaryPrompt,
  buildMentoringEnhancePrompt,
} from "@/lib/report-ai-prompts";
import { createParentReportsForStudents } from "@/actions/parent-reports";
import { generateMonthlyReportsBulk } from "@/actions/reports";

export type EnqueueResult = {
  total: number;
  queued: number;
  skipped: number;
  failed: number;
};

/**
 * 본원 월간 리포트 '멘토링 종합의견(mentoringSummary)' 을 예약 큐에 등록.
 * - 리포트가 없으면 먼저 생성(즉시·통계 집계) 후 큐잉
 * - 해당 월 완료 멘토링이 없으면 skip (요약할 내용 없음)
 * - 이미 mentoringSummary 가 채워져 있으면 skip (수기 편집 보호)
 */
export async function enqueueMonthlyAiSummaries(params: {
  studentIds: string[];
  year: number;
  month: number;
}): Promise<EnqueueResult> {
  const session = await auth();
  requireFullAccess(session?.user?.role);
  const createdById = session?.user?.id;

  const { year, month } = params;
  const studentIds = Array.from(new Set(params.studentIds));
  if (studentIds.length === 0) return { total: 0, queued: 0, skipped: 0, failed: 0 };

  // 리포트 즉시 생성 보장(없는 학생만 새로 생성됨, 멱등)
  await generateMonthlyReportsBulk(studentIds, year, month);

  const start = startOfMonth(new Date(year, month - 1));
  const end = endOfMonth(new Date(year, month - 1));
  const periodLabel = `${year}년 ${month}월`;

  let queued = 0;
  let skipped = 0;
  let failed = 0;

  for (const studentId of studentIds) {
    try {
      const [report, student, mentorings] = await Promise.all([
        prisma.monthlyReport.findUnique({
          where: { studentId_year_month: { studentId, year, month } },
          select: { id: true, mentoringSummary: true },
        }),
        prisma.student.findUnique({
          where: { id: studentId },
          select: { name: true, grade: true },
        }),
        prisma.mentoring.findMany({
          where: { studentId, scheduledAt: { gte: start, lte: end }, status: "COMPLETED" },
          select: {
            content: true,
            improvements: true,
            weaknesses: true,
            nextGoals: true,
            notes: true,
          },
          orderBy: { scheduledAt: "asc" },
        }),
      ]);

      if (!report || !student) {
        skipped++;
        continue;
      }
      // 이미 종합의견이 있으면 덮어쓰지 않는다(수기 편집 보호)
      if (report.mentoringSummary && report.mentoringSummary.trim()) {
        skipped++;
        continue;
      }

      const prompt = buildMonthlyMentoringSummaryPrompt(
        student.name,
        student.grade,
        year,
        month,
        mentorings,
      );
      if (!prompt) {
        skipped++; // 해당 월 멘토링 없음
        continue;
      }

      await prisma.reportAiJob.upsert({
        where: { type_targetId: { type: "MONTHLY_SUMMARY", targetId: report.id } },
        update: {
          status: "QUEUED",
          studentName: student.name,
          periodLabel,
          systemPrompt: prompt.systemPrompt,
          userPrompt: prompt.userPrompt,
          resultText: null,
          errorMessage: null,
          createdById,
        },
        create: {
          type: "MONTHLY_SUMMARY",
          targetId: report.id,
          studentName: student.name,
          periodLabel,
          systemPrompt: prompt.systemPrompt,
          userPrompt: prompt.userPrompt,
          createdById,
        },
      });
      queued++;
    } catch {
      failed++;
    }
  }

  revalidatePath("/reports/monthly");
  revalidatePath("/reports/ai-queue");
  return { total: studentIds.length, queued, skipped, failed };
}

/**
 * 멘토링 학부모 리포트 'customNote(코멘트)' AI 고도화를 예약 큐에 등록.
 * - 리포트가 없으면 최신 완료 멘토링으로 먼저 생성 후 큐잉
 * - 완료 멘토링이 없으면 skip
 * - 멘토링 내용이 비어 프롬프트를 만들 수 없으면 skip
 */
export async function enqueueMentoringAiComments(params: {
  studentIds: string[];
}): Promise<EnqueueResult> {
  const session = await auth();
  requireFullAccess(session?.user?.role);
  const createdById = session?.user?.id;

  const studentIds = Array.from(new Set(params.studentIds));
  if (studentIds.length === 0) return { total: 0, queued: 0, skipped: 0, failed: 0 };

  // 리포트 생성 보장(기존 검증된 로직 재사용, 멱등). reportId 회수.
  const created = await createParentReportsForStudents(studentIds);

  let queued = 0;
  let skipped = 0;
  let failed = 0;

  for (const r of created) {
    if (r.status === "no-mentoring") {
      skipped++;
      continue;
    }
    if (r.status === "failed" || !r.reportId) {
      failed++;
      continue;
    }
    try {
      const report = await prisma.parentReport.findUnique({
        where: { id: r.reportId },
        select: {
          id: true,
          student: { select: { name: true, grade: true } },
          mentoring: {
            select: {
              scheduledAt: true,
              content: true,
              improvements: true,
              weaknesses: true,
              nextGoals: true,
              notes: true,
            },
          },
        },
      });
      if (!report || !report.mentoring) {
        skipped++;
        continue;
      }

      const prompt = buildMentoringEnhancePrompt(
        report.student.name,
        report.student.grade,
        report.mentoring,
      );
      if (!prompt) {
        skipped++; // 멘토링 내용이 비어 프롬프트 불가
        continue;
      }

      await prisma.reportAiJob.upsert({
        where: { type_targetId: { type: "MENTORING_COMMENT", targetId: report.id } },
        update: {
          status: "QUEUED",
          studentName: report.student.name,
          periodLabel: "최근 멘토링",
          systemPrompt: prompt.systemPrompt,
          userPrompt: prompt.userPrompt,
          resultText: null,
          errorMessage: null,
          createdById,
        },
        create: {
          type: "MENTORING_COMMENT",
          targetId: report.id,
          studentName: report.student.name,
          periodLabel: "최근 멘토링",
          systemPrompt: prompt.systemPrompt,
          userPrompt: prompt.userPrompt,
          createdById,
        },
      });
      queued++;
    } catch {
      failed++;
    }
  }

  revalidatePath("/mentoring");
  revalidatePath("/reports/ai-queue");
  return { total: studentIds.length, queued, skipped, failed };
}
