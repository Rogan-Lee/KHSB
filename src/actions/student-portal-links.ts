"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/roles";
import {
  issueMagicLink,
  revokeAllLinksForStudent,
  DEFAULT_MAGIC_LINK_VALID_DAYS,
} from "@/lib/student-auth";
import { clampPortalLinkDays, issuePortalLinkForStudent } from "@/lib/student-portal-link-core";

/**
 * 전체 ACTIVE 재원생의 학생 포털(`/s/[token]`) 매직링크 현황.
 * 질문 게시판은 전체 재원생 대상이므로 오프라인·온라인 학생 모두 포함.
 */
export async function listStudentPortalLinks() {
  const session = await auth();
  requireStaff(session?.user?.role);

  const students = await prisma.student.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ grade: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      grade: true,
      school: true,
      seat: true,
      isOnlineManaged: true,
      magicLinks: {
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { issuedAt: "desc" },
        take: 1,
        select: { token: true, expiresAt: true },
      },
    },
  });

  return students.map((s) => {
    const link = s.magicLinks[0] ?? null;
    return {
      id: s.id,
      name: s.name,
      grade: s.grade,
      school: s.school,
      seat: s.seat,
      isOnlineManaged: s.isOnlineManaged,
      token: link?.token ?? null,
      expiresAt: link?.expiresAt.toISOString() ?? null,
    };
  });
}

/** 단일 학생 포털 링크 발급/재발급. 재발급 시 기존 활성 링크는 모두 무효화. */
export async function issueStudentPortalLink(params: {
  studentId: string;
  reissue?: boolean;
  daysValid?: number;
}) {
  const session = await auth();
  requireStaff(session?.user?.role);

  // 핵심 로직: src/lib/student-portal-link-core.ts — 모바일 API 와 공용
  const link = await issuePortalLinkForStudent({
    studentId: params.studentId,
    issuedById: session!.user.id,
    reissue: params.reissue,
    daysValid: params.daysValid,
  });
  // 기존 유효 링크를 그대로 돌려준 경우엔 화면 갱신 불필요 (기존 동작과 동일)
  if (link.reused) {
    return { token: link.token, expiresAt: link.expiresAt.toISOString() };
  }

  revalidatePath("/students");
  revalidatePath("/attendance");
  return { token: link.token, expiresAt: link.expiresAt.toISOString() };
}

/** 활성 링크가 없는 모든 ACTIVE 학생에게 일괄 발급. 이미 활성 링크가 있으면 건너뜀. */
export async function issuePortalLinksForAllActive(params?: { daysValid?: number }) {
  const session = await auth();
  requireStaff(session?.user?.role);

  const students = await prisma.student.findMany({
    where: {
      status: "ACTIVE",
      magicLinks: { none: { revokedAt: null, expiresAt: { gt: new Date() } } },
    },
    select: { id: true },
  });

  for (const s of students) {
    await issueMagicLink({
      studentId: s.id,
      issuedById: session!.user.id,
      daysValid: clampPortalLinkDays(params?.daysValid ?? DEFAULT_MAGIC_LINK_VALID_DAYS),
    });
  }

  revalidatePath("/students");
  revalidatePath("/attendance");
  return { issued: students.length };
}

/** 학생의 모든 활성 링크 무효화. */
export async function revokeStudentPortalLinks(params: { studentId: string }) {
  const session = await auth();
  requireStaff(session?.user?.role);

  const count = await revokeAllLinksForStudent(params.studentId);
  revalidatePath("/students");
  revalidatePath("/attendance");
  return { revoked: count };
}
