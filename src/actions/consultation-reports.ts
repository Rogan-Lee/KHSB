"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireAnyStaff, requireStaff } from "@/lib/roles";
import { revalidatePath } from "next/cache";
import { reportExpiresAt, checkExpiry, getRequestMeta, hasGatePass } from "@/lib/token-auth";

export async function createConsultationReport(consultationId: string, content: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

  const consultation = await prisma.directorConsultation.findUnique({
    where: { id: consultationId },
    include: { student: { select: { name: true } } },
  });
  if (!consultation) throw new Error("면담 정보를 찾을 수 없습니다");

  const text = typeof content === "string" ? content : "";
  if (!text.trim()) throw new Error("내용을 입력하세요");
  if (text.length > 10000) throw new Error("내용은 10,000자 이하로 작성해 주세요");

  const c = consultation as Record<string, unknown>;
  const recipientName = (consultation.student?.name ?? c.prospectName as string) || null;

  const report = await prisma.consultationReport.create({
    data: {
      consultationId,
      content: text,
      recipientName,
      createdById: session.user.id,
      expiresAt: reportExpiresAt(),
    },
    select: { token: true },
  });

  return { token: report.token };
}

export async function getConsultationReport(token: string) {
  const detailed = await getConsultationReportDetailed(token);
  return detailed.ok ? detailed.report : null;
}

// ⚠️ 이 export 는 공개 토큰 페이지(/cr/[token])용이지만 "use server" 라서 직접 POST 호출도 가능하다.
// 그래서 (1) 페이지가 실제로 쓰는 필드만 select 하고(면담 메모·연락처 등 내부 정보 제외),
// (2) 재원생 리포트는 본인 확인 게이트를 통과한 쿠키가 없으면 본문(content)을 비워서 돌려준다.
export async function getConsultationReportDetailed(token: string) {
  if (typeof token !== "string" || !token || token.length > 200) {
    return { ok: false as const, reason: "not_found" as const };
  }
  const report = await prisma.consultationReport.findUnique({
    where: { token },
    select: {
      id: true,
      content: true,
      recipientName: true,
      createdAt: true,
      expiresAt: true,
      revokedAt: true,
      consultation: {
        select: {
          prospectName: true,
          prospectGrade: true,
          student: { select: { id: true, name: true, grade: true } },
        },
      },
    },
  });
  if (!report) return { ok: false as const, reason: "not_found" as const };
  const fail = checkExpiry({ expiresAt: report.expiresAt, revokedAt: report.revokedAt });
  if (fail) return { ok: false as const, reason: fail };

  // 재원생 대상 리포트는 학부모 본인 확인(게이트) 통과 전엔 본문을 내려주지 않는다.
  // (페이지는 게이트 미통과 시 본문을 렌더하지 않으므로 기존 화면 흐름에는 영향 없음)
  const studentId = report.consultation.student?.id;
  if (studentId && !(await hasGatePass("PARENT", token, studentId))) {
    report.content = "";
  }

  const { ip, ua } = await getRequestMeta();
  prisma.consultationReport
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

  return { ok: true as const, report };
}

export async function revokeConsultationReport(reportId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireStaff(session.user.role);

  await prisma.consultationReport.updateMany({
    where: { id: reportId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/consultations");
}
