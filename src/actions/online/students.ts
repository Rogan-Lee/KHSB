"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireFullAccess } from "@/lib/roles";
import {
  issueMagicLink,
  revokeAllLinksForStudent,
  revokeMagicLink,
} from "@/lib/student-auth";

/**
 * 기존 학생을 온라인 관리 대상으로 전환.
 * 원장/SUPER_ADMIN 만 호출 가능.
 */
export async function enableOnlineManagement(params: {
  studentId: string;
  assignedMentorId?: string | null;
  assignedConsultantId?: string | null;
}) {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  const student = await prisma.student.findUnique({
    where: { id: params.studentId },
    select: { id: true, isOnlineManaged: true },
  });
  if (!student) throw new Error("학생을 찾을 수 없습니다");

  await prisma.student.update({
    where: { id: params.studentId },
    data: {
      isOnlineManaged: true,
      onlineStartedAt: student.isOnlineManaged ? undefined : new Date(),
      assignedMentorId: params.assignedMentorId ?? undefined,
      assignedConsultantId: params.assignedConsultantId ?? undefined,
    },
  });

  revalidatePath("/online/students");
  revalidatePath(`/online/students/${params.studentId}`);
  revalidatePath("/students");
}

/**
 * 온라인 관리 해제. 학생 레코드는 유지, 매직링크 전량 무효화.
 */
export async function disableOnlineManagement(studentId: string) {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  await prisma.student.update({
    where: { id: studentId },
    data: {
      isOnlineManaged: false,
      assignedMentorId: null,
      assignedConsultantId: null,
    },
  });
  await revokeAllLinksForStudent(studentId);

  revalidatePath("/online/students");
  revalidatePath(`/online/students/${studentId}`);
  revalidatePath("/students");
}

/**
 * 온라인 학생 담당자(관리멘토/컨설턴트) 재배정.
 */
export async function reassignOnlineStudent(params: {
  studentId: string;
  assignedMentorId?: string | null;
  assignedConsultantId?: string | null;
}) {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  await prisma.student.update({
    where: { id: params.studentId, isOnlineManaged: true },
    data: {
      assignedMentorId: params.assignedMentorId ?? null,
      assignedConsultantId: params.assignedConsultantId ?? null,
    },
  });

  revalidatePath("/online/students");
  revalidatePath(`/online/students/${params.studentId}`);
}

/**
 * 학생 매직링크 발급. 기본 30일 만료.
 * 재발급 시 기존 활성 링크를 모두 무효화(revokeExisting=true, 기본값)할지 선택.
 */
export async function issueStudentMagicLink(params: {
  studentId: string;
  daysValid?: number;
  revokeExisting?: boolean;
}) {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  const student = await prisma.student.findUnique({
    where: { id: params.studentId },
    select: { id: true, isOnlineManaged: true },
  });
  if (!student) throw new Error("학생을 찾을 수 없습니다");
  if (!student.isOnlineManaged) {
    throw new Error("온라인 관리 대상 학생이 아닙니다");
  }

  if (params.revokeExisting !== false) {
    await revokeAllLinksForStudent(params.studentId);
  }

  const link = await issueMagicLink({
    studentId: params.studentId,
    issuedById: session!.user.id,
    daysValid: params.daysValid,
  });

  revalidatePath(`/online/students/${params.studentId}`);
  return { token: link.token, expiresAt: link.expiresAt };
}

/**
 * 특정 매직링크 단일 무효화. 사고 대응용.
 */
export async function revokeStudentMagicLink(params: {
  linkId: string;
  studentId: string;
}) {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  await revokeMagicLink(params.linkId);
  revalidatePath(`/online/students/${params.studentId}`);
}
