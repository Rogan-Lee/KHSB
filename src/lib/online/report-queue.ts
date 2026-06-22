// 예약 생성 큐 헬퍼 (서버 전용).
// cron 라우트(/api/cron/online-report-queue)와 대기열 화면에서 공통 사용.
// "use server" 가 아니므로 인증 없는 서버액션으로 노출되지 않는다 —
// 외부 접근은 반드시 cron 라우트의 CRON_SECRET 게이트를 통한다.
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

type ReportTypeStr = "WEEKLY" | "MONTHLY" | "ADHOC";

/** QUEUED content 에 봉인된 페이로드 (parent-reports.ts 의 QueuedContent 와 동형). */
type QueuedContent = {
  queued: true;
  systemPrompt: string;
  userPrompt: string;
  queuedAt: string;
  queuedById?: string;
};

export type QueuedPrompt = {
  reportId: string;
  studentName: string;
  type: ReportTypeStr;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;
  systemPrompt: string;
  userPrompt: string;
};

/**
 * 야간 루틴이 가져갈 큐 항목(봉인 프롬프트 포함). 오래 대기한 것부터.
 * limit 은 1~100 으로 클램프.
 */
export async function listQueuedPrompts(limit = 30): Promise<QueuedPrompt[]> {
  const take = Math.min(Math.max(Math.trunc(limit) || 30, 1), 100);
  const rows = await prisma.onlineParentReport.findMany({
    where: { status: "QUEUED" },
    orderBy: { updatedAt: "asc" },
    take,
    select: {
      id: true,
      type: true,
      periodStart: true,
      periodEnd: true,
      content: true,
      student: { select: { name: true } },
    },
  });

  const out: QueuedPrompt[] = [];
  for (const r of rows) {
    const c = r.content as unknown as QueuedContent | null;
    if (!c || !c.systemPrompt || !c.userPrompt) continue; // 봉인 프롬프트 없는 비정상 항목 스킵
    out.push({
      reportId: r.id,
      studentName: r.student.name,
      type: r.type as ReportTypeStr,
      periodStart: r.periodStart.toISOString().slice(0, 10),
      periodEnd: r.periodEnd.toISOString().slice(0, 10),
      systemPrompt: c.systemPrompt,
      userPrompt: c.userPrompt,
    });
  }
  return out;
}

/**
 * 루틴이 생성한 markdown 을 반영 → DRAFT 전환.
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
