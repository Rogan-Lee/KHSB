"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireFullAccess, requireStaff } from "@/lib/roles";
import {
  issueMagicLink,
  revokeAllLinksForStudent,
  DEFAULT_MAGIC_LINK_VALID_DAYS,
} from "@/lib/student-auth";

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
  requireFullAccess(session?.user?.role);

  const student = await prisma.student.findUnique({
    where: { id: params.studentId },
    select: { id: true, status: true },
  });
  if (!student) throw new Error("학생을 찾을 수 없습니다");

  if (params.reissue) {
    await revokeAllLinksForStudent(params.studentId);
  } else {
    const existing = await prisma.studentMagicLink.findFirst({
      where: { studentId: params.studentId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { issuedAt: "desc" },
      select: { token: true, expiresAt: true },
    });
    if (existing) {
      return { token: existing.token, expiresAt: existing.expiresAt.toISOString() };
    }
  }

  const link = await issueMagicLink({
    studentId: params.studentId,
    issuedById: session!.user.id,
    daysValid: params.daysValid ?? DEFAULT_MAGIC_LINK_VALID_DAYS,
  });

  revalidatePath("/questions/links");
  return { token: link.token, expiresAt: link.expiresAt.toISOString() };
}

/** 활성 링크가 없는 모든 ACTIVE 학생에게 일괄 발급. 이미 활성 링크가 있으면 건너뜀. */
export async function issuePortalLinksForAllActive(params?: { daysValid?: number }) {
  const session = await auth();
  requireFullAccess(session?.user?.role);

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
      daysValid: params?.daysValid ?? DEFAULT_MAGIC_LINK_VALID_DAYS,
    });
  }

  revalidatePath("/questions/links");
  return { issued: students.length };
}

/** 학생의 모든 활성 링크 무효화. */
export async function revokeStudentPortalLinks(params: { studentId: string }) {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  const count = await revokeAllLinksForStudent(params.studentId);
  revalidatePath("/questions/links");
  return { revoked: count };
}
