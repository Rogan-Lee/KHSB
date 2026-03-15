"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { ExamType } from "@/generated/prisma";

export async function getExamScores(studentId: string) {
  return prisma.examScore.findMany({
    where: { studentId },
    orderBy: { examDate: "desc" },
  });
}

export async function createExamScore(data: {
  studentId: string;
  examType: ExamType;
  examName: string;
  examDate: string;
  subject: string;
  rawScore?: number;
  grade?: number;
  percentile?: number;
  notes?: string;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const record = await prisma.examScore.create({
    data: {
      studentId: data.studentId,
      examType: data.examType,
      examName: data.examName,
      examDate: new Date(data.examDate),
      subject: data.subject,
      rawScore: data.rawScore ?? null,
      grade: data.grade ?? null,
      percentile: data.percentile ?? null,
      notes: data.notes ?? null,
    },
  });

  revalidatePath(`/students/${data.studentId}`);
  return record;
}

export async function deleteExamScore(id: string, studentId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.examScore.delete({ where: { id } });
  revalidatePath(`/students/${studentId}`);
}
