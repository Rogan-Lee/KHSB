"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/roles";
import { revalidatePath } from "next/cache";
import { reportExpiresAt, checkExpiry, getRequestMeta, hasGatePass } from "@/lib/token-auth";
import { createOpaqueToken } from "@/lib/auth-tokens";
import {
  createParentReportRecord,
  listStudentsForReportDispatch,
} from "@/lib/parent-report-core";
import { queueParentMentoringReportPush, queueParentReportPush } from "@/lib/mobile-push";

const CUSTOM_NOTE_MAX = 50_000; // AI 고도화 5개 항목 합본이 길 수 있어 남용 방지 수준으로만 제한
const MAX_STUDY_PLAN_IMAGES = 20;

/** 학부모 화면(/r)에 <a href>/<img src> 로 그대로 렌더되므로 우리 Blob 저장소의 https URL 만 허용 */
function isTrustedBlobUrl(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > 1000) return false;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

function assertCustomNote(note: unknown) {
  if (note == null) return;
  if (typeof note !== "string" || note.length > CUSTOM_NOTE_MAX) {
    throw new Error(`학부모 메시지는 ${CUSTOM_NOTE_MAX}자 이하로 입력하세요`);
  }
}

export async function createParentReport(
  mentoringId: string,
  data: {
    studyPlanImages?: string[];
    customNote?: string;
  }
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  // 멘토링(오프라인) 화면 전용 — 일괄 생성 액션들과 동일하게 오프라인 직원만
  requireStaff(session.user.role);

  const studyPlanImages = data?.studyPlanImages ?? [];
  if (
    !Array.isArray(studyPlanImages) ||
    studyPlanImages.length > MAX_STUDY_PLAN_IMAGES ||
    !studyPlanImages.every(isTrustedBlobUrl)
  ) {
    throw new Error("학습 계획 이미지가 올바르지 않습니다");
  }
  assertCustomNote(data?.customNote);

  // 핵심 로직: src/lib/parent-report-core.ts — 모바일 API 와 공용
  const report = await createParentReportRecord({
    mentoringId,
    createdById: session.user.id,
    studyPlanImages,
    customNote: data.customNote,
  });
  // 학부모 앱 새 리포트 알림 (fire-and-forget)
  queueParentMentoringReportPush(report.id);

  revalidatePath("/mentoring");
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

  // 핵심 로직: src/lib/parent-report-core.ts — 모바일 API 와 공용 (웹 화면 shape 으로 축약)
  const rows = await listStudentsForReportDispatch();
  return rows.map((r) => ({
    studentId: r.studentId,
    studentName: r.studentName,
    grade: r.grade,
    school: r.school,
    latestMentoring: r.latestMentoring
      ? {
          id: r.latestMentoring.id,
          date: r.latestMentoring.date,
          mentorName: r.latestMentoring.mentorName,
          hasNotes: r.latestMentoring.hasNotes,
        }
      : null,
    parentReport: r.parentReport
      ? {
          id: r.parentReport.id,
          token: r.parentReport.token,
          customNote: r.parentReport.customNote,
          createdAt: r.parentReport.createdAt,
        }
      : null,
  }));
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
          // 공개 링크 토큰 — 스키마 기본값(cuid)은 예측 가능성이 있어 CSPRNG 로 명시 발급
          token: createOpaqueToken(24),
          studentId: sid,
          mentoringId: m.id,
          studyPlanImages: [],
          customNote: m.notes ?? null,
          createdById: session.user.id,
          expiresAt: reportExpiresAt(),
        },
        select: { id: true, token: true },
      });
      queueParentReportPush(sid, "MENTORING");
      results.push({
        studentId: sid,
        studentName: student.name,
        status: "created",
        reportId: created.id,
        token: created.token,
      });
    } catch (e) {
      console.error("[createParentReportsForStudents]", e);
      results.push({
        studentId: sid,
        studentName: "?",
        status: "failed",
        reason: "리포트 생성 중 오류가 발생했습니다",
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
          token: createOpaqueToken(24),
          studentId: mentoring.studentId,
          mentoringId: mid,
          studyPlanImages: [],
          customNote: mentoring.notes ?? null,
          createdById: session.user.id,
          expiresAt: reportExpiresAt(),
        },
        select: { token: true },
      });
      queueParentReportPush(mentoring.studentId, "MENTORING");
      results.push({
        mentoringId: mid,
        studentName: mentoring.student.name,
        status: "created",
        token: created.token,
      });
    } catch (e) {
      console.error("[createParentReportsBulk]", e);
      results.push({
        mentoringId: mid,
        studentName: "?",
        status: "failed",
        reason: "리포트 생성 중 오류가 발생했습니다",
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
  assertCustomNote(customNote);

  await prisma.parentReport.update({
    where: { id: reportId },
    data: { customNote: customNote || null },
  });
  revalidatePath("/mentoring");
}

/**
 * 토큰으로 학부모 리포트 조회 + 만료/취소 검증 + 접근 로그 기록.
 * 결과: `null` (없음 or 만료 or 취소) 또는 리포트 + 학생/멘토링.
 * 만료 사유를 구분하려면 `getParentReportDetailed` 사용.
 */
export async function getParentReport(token: string) {
  const detailed = await getParentReportDetailed(token);
  return detailed.ok ? detailed.report : null;
}

export async function getParentReportDetailed(token: string) {
  const report = await prisma.parentReport.findUnique({
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
  if (!report) return { ok: false as const, reason: "not_found" as const };
  const fail = checkExpiry({ expiresAt: report.expiresAt, revokedAt: report.revokedAt });
  if (fail) return { ok: false as const, reason: fail };

  const { ip, ua } = await getRequestMeta();
  prisma.parentReport
    .update({
      where: { id: report.id },
      data: {
        lastAccessedAt: new Date(),
        lastAccessIp: ip,
        lastAccessUa: ua,
        accessCount: { increment: 1 },
      },
    })
    .catch(() => {});

  // 보안: 이 함수는 "use server" export 라 토큰만으로 직접 호출될 수 있다.
  // 본인 확인 게이트(생년월일/전화 뒷자리)를 통과하지 않은 호출에는 게이트 표시에 필요한
  // student.id 외 내용을 비운다. (/r 페이지는 이후 hasGatePass 로 다시 판정해 게이트를 띄움)
  let gated = false;
  try {
    gated = await hasGatePass("PARENT", token, report.student.id);
  } catch {
    gated = false;
  }
  const safe: NonNullable<typeof report> = gated
    ? { ...report, lastAccessIp: null, lastAccessUa: null }
    : {
        ...report,
        studyPlanNote: null,
        studyPlanImages: [],
        customNote: null,
        lastAccessIp: null,
        lastAccessUa: null,
        student: { ...report.student, name: "", grade: "", school: null },
        mentoring: null,
      };

  return { ok: true as const, report: safe };
}

/** 학부모 리포트 링크 무효화 (원장/관리자). */
export async function revokeParentReport(reportId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireStaff(session.user.role);

  await prisma.parentReport.updateMany({
    where: { id: reportId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/mentoring");
}
