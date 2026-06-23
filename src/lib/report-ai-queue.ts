// 리포트 AI 텍스트 생성 큐 헬퍼 (서버 전용).
// cron 라우트(/api/cron/report-ai-queue)와 대기열 화면에서 공통 사용.
// "use server" 가 아니므로 인증 없는 서버액션으로 노출되지 않는다 —
// 외부 접근은 반드시 cron 라우트의 CRON_SECRET 게이트를 통한다.
//
// 온라인 큐(report-queue.ts)와 동일한 계약을 따른다(필드명 reportId 호환):
//   GET  → 봉인 프롬프트 N건
//   POST {reportId(=jobId), markdown} → 결과 반영
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  parseEnhancedJson,
  finalizeEnhanced,
  formatEnhancedAsNote,
  type MentoringFields,
} from "@/lib/report-ai-prompts";

type AiJobTypeStr = "MONTHLY_SUMMARY" | "MENTORING_COMMENT";

export type QueuedAiPrompt = {
  reportId: string; // = ReportAiJob.id (온라인 루틴과 동일 필드명 유지)
  type: AiJobTypeStr;
  studentName: string;
  periodLabel: string | null;
  systemPrompt: string;
  userPrompt: string;
};

const EMPTY_FIELDS: MentoringFields = {
  content: null,
  improvements: null,
  weaknesses: null,
  nextGoals: null,
  notes: null,
};

/** 야간 루틴이 가져갈 큐 항목(봉인 프롬프트 포함). 오래 대기한 것부터. limit 1~100 클램프. */
export async function listQueuedAiJobs(limit = 30): Promise<QueuedAiPrompt[]> {
  const take = Math.min(Math.max(Math.trunc(limit) || 30, 1), 100);
  const rows = await prisma.reportAiJob.findMany({
    where: { status: "QUEUED" },
    orderBy: { updatedAt: "asc" },
    take,
    select: {
      id: true,
      type: true,
      studentName: true,
      periodLabel: true,
      systemPrompt: true,
      userPrompt: true,
    },
  });

  return rows.map((r) => ({
    reportId: r.id,
    type: r.type as AiJobTypeStr,
    studentName: r.studentName,
    periodLabel: r.periodLabel,
    systemPrompt: r.systemPrompt,
    userPrompt: r.userPrompt,
  }));
}

/**
 * 루틴이 생성한 텍스트를 타깃 리포트 필드에 반영 → 잡 DONE.
 * QUEUED 일 때만 적용(중복/경합 방지, 멱등).
 * - MONTHLY_SUMMARY: plain text → MonthlyReport.mentoringSummary
 * - MENTORING_COMMENT: JSON → 섹션 텍스트(+이미지 재부착) → ParentReport.customNote
 */
export async function applyAiJobResult(params: {
  jobId: string;
  text: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const text = params.text?.trim();
  if (!text) return { ok: false, reason: "빈 결과" };

  const job = await prisma.reportAiJob.findUnique({
    where: { id: params.jobId },
    select: { id: true, type: true, targetId: true, status: true },
  });
  if (!job) return { ok: false, reason: "잡을 찾을 수 없습니다" };
  if (job.status !== "QUEUED") {
    return { ok: false, reason: `QUEUED 아님(${job.status})` };
  }

  try {
    if (job.type === "MONTHLY_SUMMARY") {
      await prisma.monthlyReport.update({
        where: { id: job.targetId },
        data: { mentoringSummary: text },
      });
    } else {
      // 멘토링 코멘트: 동기 버튼과 동일하게 JSON 파싱 → 이미지 재부착 → 섹션 텍스트
      const report = await prisma.parentReport.findUnique({
        where: { id: job.targetId },
        select: {
          id: true,
          mentoring: {
            select: {
              content: true,
              improvements: true,
              weaknesses: true,
              nextGoals: true,
              notes: true,
            },
          },
        },
      });
      if (!report) throw new Error("학부모 리포트를 찾을 수 없습니다");

      const fields: MentoringFields = report.mentoring ?? EMPTY_FIELDS;
      const enhanced = finalizeEnhanced(parseEnhancedJson(text), fields);
      const note = formatEnhancedAsNote(enhanced);
      if (!note) throw new Error("생성된 코멘트가 비어 있습니다");

      await prisma.parentReport.update({
        where: { id: job.targetId },
        data: { customNote: note },
      });
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : "적용 실패";
    await prisma.reportAiJob.update({
      where: { id: job.id },
      data: { status: "FAILED", errorMessage: reason, resultText: text },
    });
    return { ok: false, reason };
  }

  await prisma.reportAiJob.update({
    where: { id: job.id },
    data: { status: "DONE", resultText: text, errorMessage: null },
  });

  revalidatePath("/reports/monthly");
  revalidatePath("/mentoring");
  revalidatePath("/reports/ai-queue");
  return { ok: true };
}

export type AiQueueRow = {
  jobId: string;
  type: AiJobTypeStr;
  typeLabel: string;
  studentName: string;
  periodLabel: string | null;
  queuedAt: string;
};

const TYPE_LABEL: Record<AiJobTypeStr, string> = {
  MONTHLY_SUMMARY: "월간 종합의견",
  MENTORING_COMMENT: "멘토링 코멘트",
};

/** 대기열 화면용 요약 (오래 대기한 것부터). */
export async function getAiJobQueueOverview(): Promise<AiQueueRow[]> {
  const rows = await prisma.reportAiJob.findMany({
    where: { status: "QUEUED" },
    orderBy: { updatedAt: "asc" },
    select: {
      id: true,
      type: true,
      studentName: true,
      periodLabel: true,
      updatedAt: true,
    },
  });
  return rows.map((r) => ({
    jobId: r.id,
    type: r.type as AiJobTypeStr,
    typeLabel: TYPE_LABEL[r.type as AiJobTypeStr],
    studentName: r.studentName,
    periodLabel: r.periodLabel,
    queuedAt: r.updatedAt.toISOString(),
  }));
}
