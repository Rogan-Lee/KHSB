"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireStaff } from "@/lib/roles";
import { revalidatePath } from "next/cache";

/** 학생을 유의 관찰 대상으로 수동 지정. */
export async function flagStudentAttention(studentId: string, reason: string): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireStaff(session.user.role);

  const trimmed = reason.trim();
  if (!trimmed) throw new Error("사유를 입력하세요");

  await prisma.student.update({
    where: { id: studentId },
    data: {
      attentionFlag: true,
      attentionReason: trimmed,
      attentionFlaggedAt: new Date(),
      attentionFlaggedById: session.user.id,
    },
  });

  revalidatePath("/");
  revalidatePath("/patrol/run");
  revalidatePath(`/students/${studentId}`);
}

/** 학생의 유의 관찰 수동 지정 해제. */
export async function clearStudentAttention(studentId: string): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireStaff(session.user.role);

  await prisma.student.update({
    where: { id: studentId },
    data: {
      attentionFlag: false,
      attentionReason: null,
      attentionFlaggedAt: null,
      attentionFlaggedById: null,
    },
  });

  revalidatePath("/");
  revalidatePath("/patrol/run");
  revalidatePath(`/students/${studentId}`);
}
