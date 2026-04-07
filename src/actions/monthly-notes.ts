"use server";

import { getUser } from "@/lib/auth";
import { requireOrg } from "@/lib/org";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

async function getSession() {
  const org = await requireOrg();
  const user = await getUser();
  if (!user) throw new Error("인증 필요");
  return { ...user, orgId: org.orgId };
}

export async function getMonthlyNotes(year: number, month: number) {
  const session = await getSession();

  return prisma.monthlyNote.findMany({
    where: { orgId: session.orgId, year, month },
    orderBy: { createdAt: "desc" },
  });
}

export async function createMonthlyNote(data: {
  year: number;
  month: number;
  studentId?: string;
  studentName: string;
  content: string;
}) {
  const session = await getSession();

  const note = await prisma.monthlyNote.create({
    data: {
      orgId: session.orgId,
      year: data.year,
      month: data.month,
      studentId: data.studentId || null,
      studentName: data.studentName.trim(),
      content: data.content.trim(),
      authorId: session.id,
      authorName: session.name ?? "알 수 없음",
    },
  });

  revalidatePath("/handover");
  return note;
}

export async function updateMonthlyNote(id: string, content: string) {
  const session = await getSession();

  const existing = await prisma.monthlyNote.findUnique({ where: { id, orgId: session.orgId } });
  if (!existing) throw new Error("메모를 찾을 수 없습니다");
  if (existing.authorId !== session.id && session.role !== "DIRECTOR" && session.role !== "ADMIN") {
    throw new Error("수정 권한이 없습니다");
  }

  const note = await prisma.monthlyNote.update({
    where: { id, orgId: session.orgId },
    data: { content: content.trim() },
  });

  revalidatePath("/handover");
  return note;
}

export async function deleteMonthlyNote(id: string) {
  const session = await getSession();

  const existing = await prisma.monthlyNote.findUnique({ where: { id, orgId: session.orgId } });
  if (!existing) throw new Error("메모를 찾을 수 없습니다");
  if (existing.authorId !== session.id && session.role !== "DIRECTOR" && session.role !== "ADMIN") {
    throw new Error("삭제 권한이 없습니다");
  }

  await prisma.monthlyNote.delete({ where: { id, orgId: session.orgId } });
  revalidatePath("/handover");
}
