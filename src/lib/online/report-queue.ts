// 예약 생성 큐 헬퍼 (서버 전용).
// cron 라우트(/api/cron/online-report-queue)와 대기열 화면에서 공통 사용.
// "use server" 가 아니므로 인증 없는 서버액션으로 노출되지 않는다 —
// 외부 접근은 반드시 cron 라우트의 CRON_SECRET 게이트를 통한다.
import { revalidatePath } from "next/cache";
import { groqChat } from "@/lib/groq";
import { prisma } from "@/lib/prisma";
import { QUEUE_TIME_BUDGET_MS } from "@/lib/report-ai-queue";

type ReportTypeStr = "WEEKLY" | "MONTHLY" | "ADHOC";

/** QUEUED content 에 봉인된 페이로드 (parent-reports.ts 의 QueuedContent 와 동형). */
type QueuedContent = {
  queued: true;
  systemPrompt: string;
  userPrompt: string;
  queuedAt: string;
  queuedById?: string;
};

/** 오래 기다린 것부터 Groq 로 만들어 초안(DRAFT)으로 옮긴다. 429 면 멈추고 다음 회차에 이어 간다. */
export async function processQueuedReports(budgetMs = QUEUE_TIME_BUDGET_MS) {
  const deadline = Date.now() + budgetMs;
  let made = 0;
  let failed = 0;
  while (Date.now() < deadline) {
    const row = await prisma.onlineParentReport.findFirst({
      where: { status: "QUEUED" },
      orderBy: { updatedAt: "asc" },
      select: { id: true, type: true, studentId: true, content: true, student: { select: { name: true } } },
    });
    if (!row) break;
    const sealed = row.content as unknown as QueuedContent | null;
    try {
      if (!sealed?.systemPrompt || !sealed.userPrompt) throw new Error("예약 내용이 비어 있습니다");
      const markdown = await groqChat({
        feature: (row.type as ReportTypeStr) === "MONTHLY" ? "온라인 월간 보고서" : "온라인 주간 보고서",
        targets: [{ name: row.student.name }],
        studentId: row.studentId,
        messages: [
          { role: "system", content: sealed.systemPrompt },
          { role: "user", content: sealed.userPrompt },
        ],
        options: { temperature: 0.5 },
      });
      const res = await applyGeneratedReport({ reportId: row.id, markdown });
      if (!res.ok) throw new Error(res.reason);
      made++;
    } catch (error) {
      if ((error as { status?: number })?.status === 429) break;
      failed++;
      await prisma.onlineParentReport.update({
        where: { id: row.id },
        select: { id: true },
        data: { status: "DRAFT_FAILED", errorMessage: error instanceof Error ? error.message.slice(0, 500) : "생성 실패" },
      });
    }
  }
  return { made, failed };
}

/**
 * 생성한 markdown 을 반영 → DRAFT 전환.
 * QUEUED 상태일 때만 적용(중복 처리/경합 방지, 멱등).
 */
export async function applyGeneratedReport(params: {
  reportId: string;
  markdown: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const md = params.markdown?.trim();
  if (!md) return { ok: false, reason: "빈 markdown" };

  const existing = await prisma.onlineParentReport.findUnique({
    where: { id: params.reportId },
    select: { status: true },
  });
  if (!existing) return { ok: false, reason: "보고서를 찾을 수 없습니다" };
  if (existing.status !== "QUEUED") {
    return { ok: false, reason: `QUEUED 아님(${existing.status})` };
  }

  await prisma.onlineParentReport.update({
    where: { id: params.reportId },
    select: { id: true }, // 반환 행 최소화 (content 장문 제외)
    data: {
      content: { markdown: md, generatedAt: new Date().toISOString() },
      status: "DRAFT",
      errorMessage: null,
    },
  });

  revalidatePath("/online/reports");
  revalidatePath("/online/reports/queue");
  return { ok: true };
}

export type QueueRow = {
  reportId: string;
  studentName: string;
  studentGrade: string | null;
  type: ReportTypeStr;
  periodStart: string;
  periodEnd: string;
  queuedAt: string;
};

/** 대기열 화면/알림용 요약 (오래 대기한 것부터). */
export async function getQueueOverview(): Promise<QueueRow[]> {
  const rows = await prisma.onlineParentReport.findMany({
    where: { status: "QUEUED" },
    orderBy: { updatedAt: "asc" },
    select: {
      id: true,
      type: true,
      periodStart: true,
      periodEnd: true,
      updatedAt: true,
      student: { select: { name: true, grade: true } },
    },
  });
  return rows.map((r) => ({
    reportId: r.id,
    studentName: r.student.name,
    studentGrade: r.student.grade,
    type: r.type as ReportTypeStr,
    periodStart: r.periodStart.toISOString().slice(0, 10),
    periodEnd: r.periodEnd.toISOString().slice(0, 10),
    queuedAt: r.updatedAt.toISOString(),
  }));
}
