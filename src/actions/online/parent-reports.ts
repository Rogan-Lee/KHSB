"use server";

import { revalidatePath } from "next/cache";
import Groq from "groq-sdk";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireFullAccess } from "@/lib/roles";
import { notifySlack } from "@/lib/slack";
import {
  buildWeeklyReportPrompt,
  type WeeklyReportInputs,
} from "@/lib/online/weekly-report-prompt";
import {
  buildMonthlyReportPrompt,
  type MonthlyReportInputs,
} from "@/lib/online/monthly-report-prompt";

const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_CONCURRENCY = 3;       // 30명 배치 시 순차 3병렬
const GROQ_RETRIES = 2;           // rate limit 재시도

type ReportContent = {
  markdown: string;
  generatedAt?: string;
};

function weekRangeFromMonday(weekStartIso: string): {
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
} {
  const start = new Date(weekStartIso + "T00:00:00.000Z");
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  return {
    start,
    end,
    startIso: start.toISOString().slice(0, 10),
    endIso: end.toISOString().slice(0, 10),
  };
}

async function callGroqWithRetry(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  let lastErr: unknown;
  for (let attempt = 0; attempt < GROQ_RETRIES; attempt++) {
    try {
      const completion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        model: GROQ_MODEL,
        temperature: 0.5,
      });
      const content = completion.choices[0]?.message?.content?.trim();
      if (!content) throw new Error("빈 응답");
      return content;
    } catch (err) {
      lastErr = err;
      const e = err as { status?: number };
      if (e?.status === 429) {
        // rate limit → 지수 백오프 후 재시도
        const backoff = 2 ** attempt * 1500;
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function collectInputs(
  studentId: string,
  weekStartIso: string
): Promise<WeeklyReportInputs> {
  const { start, end, startIso, endIso } = weekRangeFromMonday(weekStartIso);

  const [student, dailyLogs, subjectProgress, completedResults, weeklyPlan] =
    await Promise.all([
      prisma.student.findUnique({
        where: { id: studentId },
        select: { name: true, grade: true },
      }),
      prisma.dailyKakaoLog.findMany({
        where: { studentId, logDate: { gte: start, lte: end } },
        select: {
          logDate: true,
          summary: true,
          tags: true,
          isParentVisible: true,
        },
        orderBy: { logDate: "asc" },
      }),
      prisma.subjectProgress.findMany({
        where: { studentId, recordedAt: { gte: start, lte: end } },
        orderBy: { recordedAt: "desc" },
      }),
      prisma.taskResult.findMany({
        where: {
          studentId,
          includeInReport: true,
          finalizedAt: { gte: start, lte: end },
        },
        include: {
          task: { select: { subject: true, title: true } },
        },
      }),
      prisma.weeklyPlan.findUnique({
        where: {
          studentId_weekStart: { studentId, weekStart: start },
        },
      }),
    ]);

  if (!student) throw new Error("학생을 찾을 수 없습니다");

  return {
    studentName: student.name,
    studentGrade: student.grade,
    weekStartIso: startIso,
    weekEndIso: endIso,
    dailyLogs: dailyLogs.map((l) => ({
      logDate: l.logDate,
      summary: l.summary,
      tags: l.tags,
      isParentVisible: l.isParentVisible,
    })),
    subjectProgress: subjectProgress.map((p) => ({
      subject: p.subject,
      currentTopic: p.currentTopic,
      textbookPage: p.textbookPage,
      weeklyProgress: p.weeklyProgress,
      notes: p.notes,
      recordedAt: p.recordedAt,
    })),
    completedTaskResults: completedResults.map((r) => ({
      subject: r.task.subject,
      title: r.task.title,
      score: r.score,
      consultantSummary: r.consultantSummary,
    })),
    weeklyPlan: weeklyPlan
      ? {
          goals: (weeklyPlan.goals as unknown as Record<string, string>) ?? {},
          studyHours: weeklyPlan.studyHours,
          retrospective: weeklyPlan.retrospective,
        }
      : null,
  };
}

/** 단일 학생 주간 보고서 초안 생성 (upsert). 호출자가 요청한 weekStart 기준. */
export async function generateWeeklyReportDraft(params: {
  studentId: string;
  weekStart: string; // "YYYY-MM-DD"
}): Promise<{ reportId: string; status: "DRAFT" | "DRAFT_FAILED" }> {
  const { start, end } = weekRangeFromMonday(params.weekStart);

  try {
    const inputs = await collectInputs(params.studentId, params.weekStart);
    const { systemPrompt, userPrompt } = buildWeeklyReportPrompt(inputs);
    const markdown = await callGroqWithRetry(systemPrompt, userPrompt);

    const content: ReportContent = {
      markdown,
      generatedAt: new Date().toISOString(),
    };

    const report = await prisma.onlineParentReport.upsert({
      where: {
        studentId_type_periodStart: {
          studentId: params.studentId,
          type: "WEEKLY",
          periodStart: start,
        },
      },
      update: {
        content,
        status: "DRAFT",
        errorMessage: null,
        periodEnd: end,
      },
      create: {
        studentId: params.studentId,
        type: "WEEKLY",
        periodStart: start,
        periodEnd: end,
        content,
        status: "DRAFT",
      },
    });

    return { reportId: report.id, status: "DRAFT" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const report = await prisma.onlineParentReport.upsert({
      where: {
        studentId_type_periodStart: {
          studentId: params.studentId,
          type: "WEEKLY",
          periodStart: start,
        },
      },
      update: { status: "DRAFT_FAILED", errorMessage: message },
      create: {
        studentId: params.studentId,
        type: "WEEKLY",
        periodStart: start,
        periodEnd: end,
        content: { markdown: "" },
        status: "DRAFT_FAILED",
        errorMessage: message,
      },
    });
    return { reportId: report.id, status: "DRAFT_FAILED" };
  }
}

/**
 * 전체 온라인 학생 배치 초안 생성. Groq rate limit 대비 concurrency=3.
 * cron 또는 원장 대시보드 "배치 생성" 버튼에서 호출.
 */
export async function batchGenerateWeeklyReports(params: {
  weekStart: string;
  studentIds?: string[];  // 지정 시 해당 학생만. 없으면 전체 온라인 학생.
}): Promise<{
  total: number;
  success: number;
  failed: number;
}> {
  const studentIds =
    params.studentIds ??
    (await prisma.student.findMany({
      where: { isOnlineManaged: true, status: "ACTIVE" },
      select: { id: true },
    })).map((s) => s.id);

  let success = 0;
  let failed = 0;
  for (let i = 0; i < studentIds.length; i += GROQ_CONCURRENCY) {
    const batch = studentIds.slice(i, i + GROQ_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((studentId) =>
        generateWeeklyReportDraft({ studentId, weekStart: params.weekStart })
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled") {
        if (r.value.status === "DRAFT") success++;
        else failed++;
      } else {
        failed++;
      }
    }
  }

  revalidatePath("/online/reports");
  return { total: studentIds.length, success, failed };
}

/** 원장이 단일 학생 재생성. 실패 후 재시도 또는 편집 전 초기화. WEEKLY/MONTHLY 지원. */
export async function regenerateReportDraft(reportId: string) {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  const existing = await prisma.onlineParentReport.findUnique({
    where: { id: reportId },
    select: { studentId: true, type: true, periodStart: true },
  });
  if (!existing) throw new Error("보고서를 찾을 수 없습니다");

  if (existing.type === "WEEKLY") {
    const weekStart = existing.periodStart.toISOString().slice(0, 10);
    return generateWeeklyReportDraft({ studentId: existing.studentId, weekStart });
  }
  if (existing.type === "MONTHLY") {
    const yearMonth = existing.periodStart.toISOString().slice(0, 7);
    return generateMonthlyReportDraft({
      studentId: existing.studentId,
      yearMonth,
    });
  }
  throw new Error("ADHOC 보고서는 재생성 대상이 아닙니다");
}

/** 원장 수동 편집 저장. 상태는 REVIEW 로 전환. */
export async function updateReportContent(params: {
  reportId: string;
  markdown: string;
}) {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  const existing = await prisma.onlineParentReport.findUnique({
    where: { id: params.reportId },
    select: { content: true, status: true },
  });
  if (!existing) throw new Error("보고서를 찾을 수 없습니다");
  if (existing.status === "SENT") {
    throw new Error("이미 발송된 보고서는 수정할 수 없습니다");
  }

  const prev = (existing.content as unknown as ReportContent) ?? { markdown: "" };
  const content: ReportContent = { ...prev, markdown: params.markdown };

  await prisma.onlineParentReport.update({
    where: { id: params.reportId },
    data: {
      content,
      status: existing.status === "DRAFT_FAILED" ? "REVIEW" : "REVIEW",
    },
  });

  revalidatePath(`/online/reports/${params.reportId}`);
  revalidatePath("/online/reports");
}

/** 원장 승인. 발송 대기 상태. */
export async function approveReport(reportId: string) {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  const existing = await prisma.onlineParentReport.findUnique({
    where: { id: reportId },
    select: { status: true },
  });
  if (!existing) throw new Error("보고서를 찾을 수 없습니다");
  if (existing.status === "SENT") throw new Error("이미 발송되었습니다");
  if (existing.status === "DRAFT_FAILED") {
    throw new Error("초안 생성이 실패한 보고서입니다. 재생성 후 승인하세요");
  }

  await prisma.onlineParentReport.update({
    where: { id: reportId },
    data: {
      status: "APPROVED",
      approvedById: session!.user.id,
      approvedAt: new Date(),
    },
  });

  revalidatePath(`/online/reports/${reportId}`);
  revalidatePath("/online/reports");
}

/** 발송 완료 처리. Phase 1 은 URL 복사 + 카카오 친구 메시지 (엔드포인트는 channel 에 기록만). */
export async function markReportSent(params: {
  reportId: string;
  channel: "MANUAL_COPY" | "KAKAO_FRIEND" | "EMAIL";
}) {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  const existing = await prisma.onlineParentReport.findUnique({
    where: { id: params.reportId },
    select: { status: true, sentChannels: true },
  });
  if (!existing) throw new Error("보고서를 찾을 수 없습니다");
  if (existing.status !== "APPROVED" && existing.status !== "SENT") {
    throw new Error("승인되지 않은 보고서는 발송할 수 없습니다");
  }

  const nextChannels = Array.from(
    new Set([...existing.sentChannels, params.channel])
  );

  await prisma.onlineParentReport.update({
    where: { id: params.reportId },
    data: {
      status: "SENT",
      sentChannels: nextChannels,
      sentAt: existing.status === "SENT" ? undefined : new Date(),
    },
  });

  revalidatePath(`/online/reports/${params.reportId}`);
  revalidatePath("/online/reports");
}

/**
 * 공개 페이지에서 viewCount 증가. 무인증.
 * isUnique=true 이면 쿨다운 통과한 유니크 조회 (uniqueViewCount 증가).
 * 일반 viewCount 는 항상 증가 (새로고침·단순 조회 모두 포함).
 */
export async function incrementReportView(params: {
  token: string;
  isUnique?: boolean;
}) {
  await prisma.onlineParentReport
    .updateMany({
      where: { token: params.token, status: "SENT" },
      data: {
        viewCount: { increment: 1 },
        uniqueViewCount: params.isUnique ? { increment: 1 } : undefined,
        lastViewedAt: new Date(),
      },
    })
    .catch(() => {});
}

/**
 * 학부모 피드백 제출 — 공개 페이지에서 무인증 호출.
 * 제출 즉시 원장에게 Slack 알림.
 */
export async function submitParentFeedback(params: {
  token: string;
  name?: string | null;
  content: string;
}) {
  if (!params.content.trim()) throw new Error("내용을 입력해 주세요");
  if (params.content.length > 2000) throw new Error("2000자 이내로 작성해 주세요");

  const report = await prisma.onlineParentReport.findUnique({
    where: { token: params.token },
    select: {
      id: true,
      status: true,
      student: { select: { id: true, name: true } },
    },
  });
  if (!report || report.status !== "SENT") {
    throw new Error("유효하지 않은 보고서입니다");
  }

  await prisma.onlineParentFeedback.create({
    data: {
      reportId: report.id,
      name: params.name?.trim() || null,
      content: params.content.trim(),
    },
  });

  const label = params.name?.trim() ? `"${params.name.trim()}" 님` : "학부모님";
  await notifySlack(
    `💬 *${report.student.name} 학부모 피드백 도착*\n${label}: ${params.content.slice(0, 200)}${params.content.length > 200 ? "..." : ""}\n_/online/reports/${report.id} 에서 확인_`
  );

  revalidatePath(`/online/reports/${report.id}`);
  return { ok: true };
}

/**
 * 원장이 피드백 읽음 처리.
 */
export async function markFeedbackRead(feedbackId: string) {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  await prisma.onlineParentFeedback.updateMany({
    where: { id: feedbackId, readAt: null },
    data: { readAt: new Date() },
  });
}

// ────────────────── 월간 보고서 (Phase 2) ──────────────────

function monthRange(yearMonth: string): { start: Date; end: Date } {
  const [y, m] = yearMonth.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59)); // 해당 월 말일 23:59:59
  return { start, end };
}

async function collectMonthlyInputs(
  studentId: string,
  yearMonth: string
): Promise<MonthlyReportInputs> {
  const { start, end } = monthRange(yearMonth);

  const [student, dailyLogs, subjectProgress, completedResults, weeklyPlans, monthlyPlan] =
    await Promise.all([
      prisma.student.findUnique({
        where: { id: studentId },
        select: { name: true, grade: true },
      }),
      prisma.dailyKakaoLog.findMany({
        where: { studentId, logDate: { gte: start, lte: end } },
        select: { logDate: true, summary: true, tags: true, isParentVisible: true },
        orderBy: { logDate: "asc" },
      }),
      prisma.subjectProgress.findMany({
        where: { studentId, recordedAt: { gte: start, lte: end } },
        orderBy: { recordedAt: "desc" },
      }),
      prisma.taskResult.findMany({
        where: {
          studentId,
          includeInReport: true,
          finalizedAt: { gte: start, lte: end },
        },
        include: { task: { select: { subject: true, title: true } } },
      }),
      prisma.weeklyPlan.findMany({
        where: { studentId, weekStart: { gte: start, lte: end } },
        orderBy: { weekStart: "asc" },
      }),
      prisma.monthlyPlan.findUnique({
        where: { studentId_yearMonth: { studentId, yearMonth } },
      }),
    ]);

  if (!student) throw new Error("학생을 찾을 수 없습니다");

  return {
    studentName: student.name,
    studentGrade: student.grade,
    yearMonth,
    periodStartIso: start.toISOString().slice(0, 10),
    periodEndIso: end.toISOString().slice(0, 10),
    dailyLogs,
    subjectProgress,
    completedTaskResults: completedResults.map((r) => ({
      subject: r.task.subject,
      title: r.task.title,
      score: r.score,
      consultantSummary: r.consultantSummary,
      finalizedAt: r.finalizedAt,
    })),
    weeklyPlans: weeklyPlans.map((wp) => ({
      weekStart: wp.weekStart,
      goals: (wp.goals as unknown as Record<string, string>) ?? {},
      studyHours: wp.studyHours,
      retrospective: wp.retrospective,
    })),
    monthlyPlan: monthlyPlan
      ? {
          subjectGoals: (monthlyPlan.subjectGoals as unknown as Record<string, string>) ?? {},
          milestones: (monthlyPlan.milestones as unknown as Record<string, string>) ?? {},
          retrospective: monthlyPlan.retrospective,
        }
      : null,
  };
}

export async function generateMonthlyReportDraft(params: {
  studentId: string;
  yearMonth: string;
}): Promise<{ reportId: string; status: "DRAFT" | "DRAFT_FAILED" }> {
  const { start, end } = monthRange(params.yearMonth);

  try {
    const inputs = await collectMonthlyInputs(params.studentId, params.yearMonth);
    const { systemPrompt, userPrompt } = buildMonthlyReportPrompt(inputs);
    const markdown = await callGroqWithRetry(systemPrompt, userPrompt);

    const content: ReportContent = {
      markdown,
      generatedAt: new Date().toISOString(),
    };

    const report = await prisma.onlineParentReport.upsert({
      where: {
        studentId_type_periodStart: {
          studentId: params.studentId,
          type: "MONTHLY",
          periodStart: start,
        },
      },
      update: { content, status: "DRAFT", errorMessage: null, periodEnd: end },
      create: {
        studentId: params.studentId,
        type: "MONTHLY",
        periodStart: start,
        periodEnd: end,
        content,
        status: "DRAFT",
      },
    });
    return { reportId: report.id, status: "DRAFT" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const report = await prisma.onlineParentReport.upsert({
      where: {
        studentId_type_periodStart: {
          studentId: params.studentId,
          type: "MONTHLY",
          periodStart: start,
        },
      },
      update: { status: "DRAFT_FAILED", errorMessage: message },
      create: {
        studentId: params.studentId,
        type: "MONTHLY",
        periodStart: start,
        periodEnd: end,
        content: { markdown: "" },
        status: "DRAFT_FAILED",
        errorMessage: message,
      },
    });
    return { reportId: report.id, status: "DRAFT_FAILED" };
  }
}

export async function batchGenerateMonthlyReports(params: {
  yearMonth: string;
  studentIds?: string[];
}): Promise<{ total: number; success: number; failed: number }> {
  const studentIds =
    params.studentIds ??
    (await prisma.student.findMany({
      where: { isOnlineManaged: true, status: "ACTIVE" },
      select: { id: true },
    })).map((s) => s.id);

  let success = 0;
  let failed = 0;
  for (let i = 0; i < studentIds.length; i += GROQ_CONCURRENCY) {
    const batch = studentIds.slice(i, i + GROQ_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((studentId) =>
        generateMonthlyReportDraft({ studentId, yearMonth: params.yearMonth })
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled") {
        if (r.value.status === "DRAFT") success++;
        else failed++;
      } else {
        failed++;
      }
    }
  }

  revalidatePath("/online/reports");
  return { total: studentIds.length, success, failed };
}

// ──────────────────────────────────────────────────────────

/** 배치 생성 후 Slack 알림용 헬퍼 (크론이 사용). */
export async function notifyBatchComplete(params: {
  weekStartIso: string;
  total: number;
  success: number;
  failed: number;
}) {
  const emoji = params.failed === 0 ? "✅" : "⚠️";
  await notifySlack(
    `${emoji} 학부모 주간 보고서 초안 생성 완료 — 주 ${params.weekStartIso}\n` +
      `총 ${params.total}명 · 성공 ${params.success} · 실패 ${params.failed}\n` +
      `_원장 검토: /online/reports?week=${params.weekStartIso}_`
  );
}
