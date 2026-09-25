// 직원 앱 — 학부모 리포트(멘토링 /r/[token]) 발송 현황과 생성·공유.
// 핵심 로직은 src/lib/parent-report-core.ts (웹 서버 액션과 공용).

import { z } from "zod";

import type { Role } from "@/generated/prisma";
import { getAppUrl } from "@/lib/app-url";
import { MobileApiError } from "@/lib/mobile-auth";
import {
  createParentReportRecord,
  listStudentsForReportDispatch,
} from "@/lib/parent-report-core";
import { queueParentMentoringReportPush } from "@/lib/mobile-push";
import { prisma } from "@/lib/prisma";
import {
  renderShareWording,
  SHARE_WORDING_DEFAULTS,
  SHARE_WORDING_KEYS,
} from "@/lib/share-wording";

type StaffUser = { id: string; role: Role };

const createSchema = z
  .object({
    mentoringId: z.string().trim().min(1).max(64).optional(),
    studentId: z.string().trim().min(1).max(64).optional(),
    customNote: z.string().trim().max(4000).optional().nullable(),
    /** true 면 기존 유효 리포트가 있어도 새로 만든다 */
    forceNew: z.boolean().optional(),
  })
  .refine((v) => !!v.mentoringId || !!v.studentId, {
    message: "멘토링 또는 학생을 선택하세요",
  });

function parseBody<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new MobileApiError(result.error.issues[0]?.message ?? "입력값을 확인하세요", 400);
}

function reportUrl(token: string) {
  return `${getAppUrl()}/r/${token}`;
}

/** 운영진이 설정한 학부모 리포트 공유 문구(AppSetting) — 없으면 기본 문구 */
async function loadShareTemplate() {
  const row = await prisma.appSetting
    .findUnique({ where: { key: SHARE_WORDING_KEYS.PARENT_REPORT }, select: { value: true } })
    .catch(() => null);
  return row?.value ?? SHARE_WORDING_DEFAULTS[SHARE_WORDING_KEYS.PARENT_REPORT];
}

function renderReportShare(template: string, r: { name: string; grade: string; url: string }) {
  return renderShareWording(template, {
    count: 1,
    links: `${r.name} ${r.grade} — ${r.url}`,
    name: r.name,
    url: r.url,
  });
}

function isActive(report: { expiresAt: Date | null; revokedAt: Date | null }, now: Date) {
  return !report.revokedAt && (!report.expiresAt || report.expiresAt > now);
}

/**
 * 발송 현황 — 완료된 멘토링이 있는 재원생별로 최신 멘토링과 그 리포트(유효한 것) 여부.
 * 미발송(PENDING) 먼저, 멘토링 최신순.
 */
export async function getStaffParentReports(user: StaffUser, now = new Date()) {
  const [rows, template] = await Promise.all([listStudentsForReportDispatch(), loadShareTemplate()]);

  const items = rows
    .filter((r) => r.latestMentoring)
    .map((r) => {
      const m = r.latestMentoring!;
      const pr = r.parentReport && isActive(r.parentReport, now) ? r.parentReport : null;
      const url = pr ? reportUrl(pr.token) : null;
      return {
        studentId: r.studentId,
        studentName: r.studentName,
        grade: r.grade,
        school: r.school,
        mentoring: {
          id: m.id,
          date: m.date.toISOString(),
          mentorName: m.mentorName,
          isMine: m.mentorId === user.id,
          hasNotes: m.hasNotes,
        },
        report:
          pr && url
            ? {
                id: pr.id,
                createdAt: pr.createdAt.toISOString(),
                expiresAt: pr.expiresAt?.toISOString() ?? null,
                url,
                shareText: renderReportShare(template, {
                  name: r.studentName,
                  grade: r.grade,
                  url,
                }),
              }
            : null,
        status: pr ? ("SENT" as const) : ("PENDING" as const),
      };
    })
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "PENDING" ? -1 : 1;
      return b.mentoring.date.localeCompare(a.mentoring.date);
    });

  return {
    items,
    summary: {
      pending: items.filter((i) => i.status === "PENDING").length,
      sent: items.filter((i) => i.status === "SENT").length,
      noMentoring: rows.length - items.length,
    },
  };
}

/**
 * 학부모 리포트 링크 만들기 → 공유 문구까지 돌려준다.
 * mentoringId 가 없으면 학생의 최신 완료 멘토링으로. 유효한 리포트가 이미 있으면(메모·forceNew 없을 때) 재사용.
 */
export async function createStaffParentReport(user: StaffUser, input: unknown, now = new Date()) {
  const data = parseBody(createSchema, input);

  const mentoring = data.mentoringId
    ? await prisma.mentoring.findUnique({
        where: { id: data.mentoringId },
        select: {
          id: true,
          status: true,
          student: { select: { grade: true, id: true, name: true } },
        },
      })
    : await prisma.mentoring.findFirst({
        where: { studentId: data.studentId!, status: "COMPLETED" },
        orderBy: [{ actualDate: "desc" }, { scheduledAt: "desc" }],
        select: {
          id: true,
          status: true,
          student: { select: { grade: true, id: true, name: true } },
        },
      });
  if (!mentoring) {
    throw new MobileApiError(
      data.mentoringId ? "멘토링을 찾을 수 없습니다" : "완료된 멘토링이 없어요",
      404,
    );
  }
  if (data.studentId && mentoring.student.id !== data.studentId) {
    throw new MobileApiError("학생 정보가 맞지 않습니다", 400);
  }
  if (mentoring.status !== "COMPLETED") {
    throw new MobileApiError("멘토링 기록을 완료한 뒤 리포트를 보낼 수 있어요", 409);
  }

  let report: { id: string; token: string; createdAt: Date; expiresAt: Date | null } | null = null;
  let reused = false;
  if (!data.forceNew && !data.customNote) {
    const existing = await prisma.parentReport.findFirst({
      where: {
        mentoringId: mentoring.id,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, token: true, createdAt: true, expiresAt: true },
    });
    if (existing) {
      report = existing;
      reused = true;
    }
  }
  if (!report) {
    report = await createParentReportRecord({
      mentoringId: mentoring.id,
      createdById: user.id,
      studyPlanImages: [],
      customNote: data.customNote,
    });
    // 새 리포트면 학부모 푸시 (재사용한 기존 리포트는 이미 알렸음)
    queueParentMentoringReportPush(report.id);
  }

  const url = reportUrl(report.token);
  const template = await loadShareTemplate();
  return {
    id: report.id,
    mentoringId: mentoring.id,
    studentId: mentoring.student.id,
    studentName: mentoring.student.name,
    createdAt: report.createdAt.toISOString(),
    expiresAt: report.expiresAt?.toISOString() ?? null,
    url,
    shareText: renderReportShare(template, {
      name: mentoring.student.name,
      grade: mentoring.student.grade,
      url,
    }),
    reused,
  };
}
