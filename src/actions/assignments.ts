"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireStaff } from "@/lib/roles";
import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";

const ASSIGNMENT_FILE_ALLOWED_MIMES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/x-hwp",
  "application/haansofthwp",
  "application/vnd.hancom.hwp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
];

const ASSIGNMENT_FILE_MAX_BYTES = 20 * 1024 * 1024; // 20MB

export async function getAssignments(studentId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  return prisma.assignment.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createAssignment(
  studentId: string,
  data: {
    title: string;
    description?: string;
    subject?: string;
    dueDate?: string;
    mentoringId?: string;
  }
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const assignment = await prisma.assignment.create({
    data: {
      studentId,
      title: data.title,
      description: data.description ?? null,
      subject: data.subject ?? null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      mentoringId: data.mentoringId ?? null,
      createdById: session.user.id,
      createdByName: session.user.name ?? "알 수 없음",
    },
  });

  revalidatePath("/assignments");
  revalidatePath(`/students/${studentId}`);
  return assignment;
}

export async function completeAssignment(id: string, studentId: string, note?: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.assignment.update({
    where: { id },
    data: {
      isCompleted: true,
      completedAt: new Date(),
      completedNote: note ?? null,
    },
  });

  revalidatePath("/assignments");
  revalidatePath(`/students/${studentId}`);
}

export async function uncompleteAssignment(id: string, studentId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.assignment.update({
    where: { id },
    data: { isCompleted: false, completedAt: null, completedNote: null },
  });

  revalidatePath("/assignments");
  revalidatePath(`/students/${studentId}`);
}

export async function updateAssignment(
  id: string,
  studentId: string,
  data: {
    title: string;
    description?: string;
    subject?: string;
    dueDate?: string;
  }
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.assignment.update({
    where: { id },
    data: {
      title: data.title,
      description: data.description ?? null,
      subject: data.subject ?? null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
    },
  });

  revalidatePath("/assignments");
  revalidatePath(`/students/${studentId}`);
}

export async function deleteAssignment(id: string, studentId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.assignment.delete({ where: { id } });

  revalidatePath("/assignments");
  revalidatePath(`/students/${studentId}`);
}

// ---------------------------------------------------------------------------
// Assignment file attachments (Sprint 4 PR 4.1)
// ---------------------------------------------------------------------------

export async function attachFileToAssignment(
  assignmentId: string,
  fileMeta: { url: string; fileName: string; mimeType: string; sizeBytes: number }
) {
  const session = await auth();
  requireStaff(session?.user?.role);
  if (!session?.user) throw new Error("Unauthorized");

  const url = fileMeta.url?.trim();
  const fileName = fileMeta.fileName?.trim();
  const mimeType = fileMeta.mimeType?.trim();
  const sizeBytes = Number(fileMeta.sizeBytes);

  if (!url) throw new Error("파일 URL이 없습니다");
  if (!fileName) throw new Error("파일명이 없습니다");
  if (!mimeType) throw new Error("MIME 타입이 없습니다");
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new Error("파일 크기가 올바르지 않습니다");
  }
  if (sizeBytes > ASSIGNMENT_FILE_MAX_BYTES) {
    throw new Error("파일 크기는 20MB를 초과할 수 없습니다");
  }
  if (!ASSIGNMENT_FILE_ALLOWED_MIMES.includes(mimeType)) {
    throw new Error("허용되지 않은 파일 형식입니다");
  }

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, studentId: true },
  });
  if (!assignment) throw new Error("과제를 찾을 수 없습니다");

  const file = await prisma.assignmentFile.create({
    data: {
      assignmentId,
      url,
      fileName,
      mimeType,
      sizeBytes,
      uploadedById: session.user.id,
    },
  });

  revalidatePath("/assignments");
  revalidatePath(`/students/${assignment.studentId}`);
  return file;
}

export async function deleteAssignmentFile(id: string) {
  const session = await auth();
  requireStaff(session?.user?.role);
  if (!session?.user) throw new Error("Unauthorized");

  const file = await prisma.assignmentFile.findUnique({
    where: { id },
    include: { assignment: { select: { studentId: true } } },
  });
  if (!file) throw new Error("파일을 찾을 수 없습니다");

  // Blob 삭제 시도 (실패해도 DB 행은 제거)
  try {
    await del(file.url, { token: process.env.BLOB_READ_WRITE_TOKEN });
  } catch (err) {
    console.warn("[deleteAssignmentFile] Blob 삭제 실패, 계속 진행:", err);
  }

  await prisma.assignmentFile.delete({ where: { id } });

  revalidatePath("/assignments");
  if (file.assignment?.studentId) {
    revalidatePath(`/students/${file.assignment.studentId}`);
  }
}

export async function listAssignmentFiles(assignmentId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  return prisma.assignmentFile.findMany({
    where: { assignmentId },
    orderBy: { uploadedAt: "asc" },
  });
}
