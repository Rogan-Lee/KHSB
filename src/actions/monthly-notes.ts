"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireAnyStaff, requireStaff } from "@/lib/roles";

// 학부모 월간 리포트(/r)에 노출되는 메모 — 길이 상한
const NOTE_CONTENT_MAX = 5000;
function assertNoteContent(content: unknown) {
  if (typeof content !== "string" || content.length > NOTE_CONTENT_MAX) {
    throw new Error(`메모는 ${NOTE_CONTENT_MAX}자 이하로 입력하세요`);
  }
}
import { revalidatePath } from "next/cache";

export async function getMonthlyNotes(year: number, month: number) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

  return prisma.monthlyNote.findMany({
    where: { year, month },
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
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);
  assertNoteContent(data.content);
  if (typeof data.studentName !== "string" || data.studentName.length > 50) {
    throw new Error("학생 이름이 올바르지 않습니다");
  }

  const note = await prisma.monthlyNote.create({
    data: {
      year: data.year,
      month: data.month,
      studentId: data.studentId || null,
      studentName: data.studentName.trim(),
      content: data.content.trim(),
      authorId: session.user.id,
      authorName: session.user.name ?? "알 수 없음",
    },
  });

  revalidatePath("/handover");
  return note;
}

export async function updateMonthlyNote(id: string, content: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

  const existing = await prisma.monthlyNote.findUnique({ where: { id } });
  if (!existing) throw new Error("메모를 찾을 수 없습니다");
  if (existing.authorId !== session.user.id && session.user.role !== "DIRECTOR" && session.user.role !== "SUPER_ADMIN") {
    throw new Error("수정 권한이 없습니다");
  }

  assertNoteContent(content);
  const note = await prisma.monthlyNote.update({
    where: { id },
    data: { content: content.trim() },
  });

  revalidatePath("/handover");
  return note;
}

export async function toggleMonthlyNoteVisibility(id: string, visible: boolean) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireStaff(session.user.role);

  const existing = await prisma.monthlyNote.findUnique({ where: { id } });
  if (!existing) throw new Error("메모를 찾을 수 없습니다");

  const note = await prisma.monthlyNote.update({
    where: { id },
    data: { visibleInReport: visible },
  });

  revalidatePath("/handover");
  if (existing.studentId) revalidatePath(`/students/${existing.studentId}`);
  return note;
}

export async function deleteMonthlyNote(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

  const existing = await prisma.monthlyNote.findUnique({ where: { id } });
  if (!existing) throw new Error("메모를 찾을 수 없습니다");
  if (existing.authorId !== session.user.id && session.user.role !== "DIRECTOR" && session.user.role !== "SUPER_ADMIN") {
    throw new Error("삭제 권한이 없습니다");
  }

  await prisma.monthlyNote.delete({ where: { id } });
  revalidatePath("/handover");
}
