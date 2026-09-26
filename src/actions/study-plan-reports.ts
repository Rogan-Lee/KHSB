"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireAnyStaff, requireStaff } from "@/lib/roles";
import { revalidatePath } from "next/cache";
import { reportExpiresAt, checkExpiry, getRequestMeta, hasGatePass } from "@/lib/token-auth";
import { createOpaqueToken } from "@/lib/auth-tokens";

const MAX_IMAGES = 20;

/** 학부모 화면(/sp)에 그대로 렌더되므로 /api/upload 가 올린 Blob https URL 만 허용 */
function isTrustedBlobUrl(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > 1000) return false;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

export async function createStudyPlanReport(studentId: string, images: string[]) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  // 호출처: 입퇴실 관리(attendance) — 전 직원 공용 화면, /api/upload 도 isAnyStaff 기준
  requireAnyStaff(session.user.role);

  if (!Array.isArray(images) || images.length === 0 || images.length > MAX_IMAGES || !images.every(isTrustedBlobUrl)) {
    throw new Error("공부 계획 이미지가 올바르지 않습니다");
  }
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true } });
  if (!student) throw new Error("학생을 찾을 수 없습니다");

  const report = await prisma.studyPlanReport.create({
    data: {
      // 공개 링크 토큰 — 스키마 기본값(cuid) 대신 CSPRNG 로 발급
      token: createOpaqueToken(24),
      studentId,
      images,
      createdById: session.user.id,
      expiresAt: reportExpiresAt(),
    },
    select: { token: true },
  });

  return { token: report.token };
}

export async function getStudyPlanReport(token: string) {
  const detailed = await getStudyPlanReportDetailed(token);
  return detailed.ok ? detailed.report : null;
}

export async function getStudyPlanReportDetailed(token: string) {
  const report = await prisma.studyPlanReport.findUnique({
    where: { token },
    include: {
      student: { select: { id: true, name: true, grade: true, school: true } },
    },
  });
  if (!report) return { ok: false as const, reason: "not_found" as const };
  const fail = checkExpiry({ expiresAt: report.expiresAt, revokedAt: report.revokedAt });
  if (fail) return { ok: false as const, reason: fail };

  const { ip, ua } = await getRequestMeta();
  prisma.studyPlanReport
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

  // 보안: "use server" export 라 토큰만으로 직접 호출 가능 — 본인 확인 게이트를 통과하지 않은
  // 호출에는 게이트 표시에 필요한 student.id 외 내용을 비운다. (/sp 페이지가 이후 게이트를 띄움)
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
        images: [],
        lastAccessIp: null,
        lastAccessUa: null,
        student: { ...report.student, name: "", grade: "", school: null },
      };

  return { ok: true as const, report: safe };
}

export async function revokeStudyPlanReport(reportId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireStaff(session.user.role);

  await prisma.studyPlanReport.updateMany({
    where: { id: reportId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/students");
}
