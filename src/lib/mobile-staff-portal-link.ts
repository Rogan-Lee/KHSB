// 직원 앱 — 학생 포털(/s/[token]) 링크 상태 조회·발급·재발급.
// 핵심 로직은 src/lib/student-portal-link-core.ts (웹 서버 액션과 공용).

import { z } from "zod";

import { getAppUrl } from "@/lib/app-url";
import { MobileApiError } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import {
  findActivePortalLink,
  issuePortalLinkForStudent,
} from "@/lib/student-portal-link-core";

const issueSchema = z
  .object({ reissue: z.boolean().optional() })
  .optional()
  .default({});

function parseBody<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new MobileApiError(result.error.issues[0]?.message ?? "입력값을 확인하세요", 400);
}

function portalUrl(token: string) {
  return `${getAppUrl()}/s/${token}`;
}

function formatKstMonthDay(date: Date) {
  return date.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });
}

function shareText(name: string, url: string, expiresAt: Date) {
  return (
    `${name} 학생의 강한선배 학생 포털 링크예요.\n` +
    `과제·질문·일정을 이 링크 하나로 확인할 수 있어요.\n\n` +
    `${url}\n\n` +
    `${formatKstMonthDay(expiresAt)}까지 쓸 수 있어요.`
  );
}

async function loadStudent(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      name: true,
      grade: true,
      school: true,
      phone: true,
      parentPhone: true,
      status: true,
    },
  });
  if (!student) throw new MobileApiError("학생을 찾을 수 없습니다", 404);
  return student;
}

/** 학생 포털 링크 현황 — 유효한 링크가 없으면 link=null */
export async function getStaffPortalLink(studentId: string) {
  const [student, link] = await Promise.all([
    loadStudent(studentId),
    findActivePortalLink(studentId),
  ]);
  const url = link ? portalUrl(link.token) : null;
  return {
    student: {
      id: student.id,
      name: student.name,
      grade: student.grade,
      school: student.school,
      phone: student.phone,
      parentPhone: student.parentPhone || null,
      active: student.status === "ACTIVE",
    },
    link:
      link && url
        ? {
            url,
            issuedAt: link.issuedAt.toISOString(),
            expiresAt: link.expiresAt.toISOString(),
            lastAccessedAt: link.lastAccessedAt?.toISOString() ?? null,
            accessCount: link.accessCount,
            shareText: shareText(student.name, url, link.expiresAt),
          }
        : null,
  };
}

/** 발급(유효 링크가 있으면 그대로) / reissue=true 면 기존 링크를 모두 끊고 새로 발급 */
export async function issueStaffPortalLink(
  user: { id: string },
  studentId: string,
  input: unknown,
) {
  const data = parseBody(issueSchema, input);
  const student = await loadStudent(studentId);
  if (student.status !== "ACTIVE") {
    throw new MobileApiError("재원 중인 학생에게만 링크를 보낼 수 있어요", 409);
  }

  const link = await issuePortalLinkForStudent({
    studentId,
    issuedById: user.id,
    reissue: data.reissue === true,
  });
  const url = portalUrl(link.token);
  return {
    url,
    expiresAt: link.expiresAt.toISOString(),
    shareText: shareText(student.name, url, link.expiresAt),
    reused: link.reused,
  };
}
