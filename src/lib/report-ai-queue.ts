// 리포트 AI 텍스트 생성 큐 헬퍼 (서버 전용).
// cron 라우트(/api/cron/report-ai-queue)와 대기열 화면에서 공통 사용.
// "use server" 가 아니므로 인증 없는 서버액션으로 노출되지 않는다 —
// 화면에서 부르는 반영·버리기는 src/actions/report-ai-queue.ts 가 권한을 확인한다.
//
// QUEUED → (서버가 Groq 로 생성) → REVIEW → 운영진이 확인해 반영(DONE) 또는 버림.
// 학부모가 보는 리포트에는 운영진이 확인하기 전까지 아무것도 쓰지 않는다.
import { revalidatePath } from "next/cache";
import { groqChat } from "@/lib/groq";
import { prisma } from "@/lib/prisma";
import {
  parseEnhancedJson,
  finalizeEnhanced,
  formatEnhancedAsNote,
  type MentoringFields,
} from "@/lib/report-ai-prompts";

type AiJobTypeStr = "MONTHLY_SUMMARY" | "MENTORING_COMMENT";

const EMPTY_FIELDS: MentoringFields = {
  content: null,
  improvements: null,
  weaknesses: null,
  nextGoals: null,
  notes: null,
};

/** 크론 한 번에 쓰는 시간. 남은 건은 다음 회차가 이어서 처리한다 */
export const QUEUE_TIME_BUDGET_MS = 45_000;

/** 오래 기다린 것부터 Groq 로 만들어 확인 대기(REVIEW)로 옮긴다. 429 면 멈추고 다음 회차에 이어 간다. */
export async function processQueuedAiJobs(budgetMs = QUEUE_TIME_BUDGET_MS) {
  const deadline = Date.now() + budgetMs;
  let made = 0;
  let failed = 0;
  while (Date.now() < deadline) {
    const job = await prisma.reportAiJob.findFirst({ where: { status: "QUEUED" }, orderBy: { updatedAt: "asc" } });
    if (!job) break;
    try {
      const text = await groqChat({
        feature: TYPE_LABEL[job.type],
        targets: [{ name: job.studentName }],
        messages: [
          { role: "system", content: job.systemPrompt },
          { role: "user", content: job.userPrompt },
        ],
        options:
          job.type === "MENTORING_COMMENT"
            ? { temperature: 0.4, max_tokens: 4000, response_format: { type: "json_object" } }
            : { temperature: 0.5 },
      });
      if (!text) throw new Error("빈 결과");
      // 만든 뒤에는 봉인해 둔 원문 기록을 남기지 않는다
      await prisma.reportAiJob.updateMany({
        where: { id: job.id, status: "QUEUED" },
        data: { status: "REVIEW", resultText: text, errorMessage: null, systemPrompt: "", userPrompt: "" },
      });
      made++;
    } catch (error) {
      if ((error as { status?: number })?.status === 429) break;
      failed++;
      await prisma.reportAiJob.update({
        where: { id: job.id },
        data: { status: "FAILED", errorMessage: error instanceof Error ? error.message.slice(0, 500) : "생성 실패" },
      });
    }
  }
  if (made || failed) revalidatePath("/reports/ai-queue");
  return { made, failed };
}

/** 저장된 결과를 리포트에 들어갈 글로 바꾼다. 멘토링 코멘트는 JSON → 섹션 텍스트(+이미지 재부착) */
async function resolveResult(job: { type: AiJobTypeStr; targetId: string; resultText: string | null }) {
  const text = job.resultText?.trim();
  if (!text) return null;
  if (job.type === "MONTHLY_SUMMARY") return text;
  const report = await prisma.parentReport.findUnique({
    where: { id: job.targetId },
    select: {
      mentoring: {
        select: { content: true, improvements: true, weaknesses: true, nextGoals: true, notes: true },
      },
    },
  });
  if (!report) return null;
  const fields: MentoringFields = report.mentoring ?? EMPTY_FIELDS;
  try {
    return formatEnhancedAsNote(finalizeEnhanced(parseEnhancedJson(text), fields)) || null;
  } catch {
    return null;
  }
}

/** 운영진이 확인한 결과를 리포트에 반영한다. REVIEW 일 때만 — 두 사람이 동시에 눌러도 한 번만 반영된다. */
export async function applyReviewedAiJob(jobId: string): Promise<{ ok: boolean; reason?: string }> {
  const job = await prisma.reportAiJob.findUnique({
    where: { id: jobId },
    select: { id: true, type: true, targetId: true, status: true, resultText: true },
  });
  if (!job) return { ok: false, reason: "예약을 찾을 수 없습니다" };
  if (job.status !== "REVIEW") return { ok: false, reason: "이미 처리된 예약입니다" };
  const text = await resolveResult(job);
  if (!text) return { ok: false, reason: "리포트에 넣을 내용이 없습니다. 버리고 다시 예약해 주세요" };

  const claimed = await prisma.reportAiJob.updateMany({ where: { id: job.id, status: "REVIEW" }, data: { status: "DONE" } });
  if (claimed.count === 0) return { ok: false, reason: "이미 처리된 예약입니다" };
  try {
    if (job.type === "MONTHLY_SUMMARY") {
      await prisma.monthlyReport.update({ where: { id: job.targetId }, data: { mentoringSummary: text, mentoringSummaryAi: true } });
    } else {
      await prisma.parentReport.update({ where: { id: job.targetId }, data: { customNote: text, customNoteAi: true } });
    }
  } catch (error) {
    await prisma.reportAiJob.update({ where: { id: job.id }, data: { status: "REVIEW" } });
    throw error;
  }
  revalidatePath("/reports/monthly");
  revalidatePath("/mentoring");
  revalidatePath("/reports/ai-queue");
  return { ok: true };
}

/** 결과를 버린다 (예약을 지운다 — 필요하면 다시 예약) */
export async function discardReviewedAiJob(jobId: string): Promise<{ ok: boolean; reason?: string }> {
  const { count } = await prisma.reportAiJob.deleteMany({ where: { id: jobId, status: "REVIEW" } });
  revalidatePath("/reports/ai-queue");
  return count > 0 ? { ok: true } : { ok: false, reason: "이미 처리된 예약입니다" };
}

export type AiReviewRow = { jobId: string; typeLabel: string; studentName: string; periodLabel: string | null; text: string | null };

/** 확인 대기 목록 — 리포트에 들어갈 모양 그대로 보여 준다 */
export async function getAiJobsToReview(): Promise<AiReviewRow[]> {
  const rows = await prisma.reportAiJob.findMany({
    where: { status: "REVIEW" },
    orderBy: { updatedAt: "asc" },
    take: 50,
    select: { id: true, type: true, targetId: true, studentName: true, periodLabel: true, resultText: true },
  });
  return Promise.all(
    rows.map(async (r) => ({
      jobId: r.id,
      typeLabel: TYPE_LABEL[r.type],
      studentName: r.studentName,
      periodLabel: r.periodLabel,
      text: await resolveResult(r),
    })),
  );
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
