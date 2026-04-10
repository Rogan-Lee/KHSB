"use server";

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { requireOrg } from "@/lib/org";
import { revalidatePath } from "next/cache";
import { ExamType } from "@/generated/prisma";

async function getSession() {
  const org = await requireOrg();
  const user = await getUser();
  if (!user) throw new Error("인증 필요");
  return { ...user, orgId: org.orgId };
}

export async function getExamScores(studentId: string) {
  const session = await getSession();
  return prisma.examScore.findMany({
    where: { orgId: session.orgId, studentId },
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
  const session = await getSession();

  const record = await prisma.examScore.create({
    data: {
      orgId: session.orgId,
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

export async function updateExamScore(id: string, data: {
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
  const session = await getSession();

  const record = await prisma.examScore.update({
    where: { id, orgId: session.orgId },
    data: {
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
  const session = await getSession();

  await prisma.examScore.delete({ where: { id, orgId: session.orgId } });
  revalidatePath(`/students/${studentId}`);
}

export interface ExamScoreCSVRow {
  studentName: string;
  examType: string;
  examName: string;
  examDate: string;
  subject: string;
  rawScore?: number;
  grade?: number;
  percentile?: number;
  notes?: string;
}

export async function bulkImportExamScores(rows: ExamScoreCSVRow[]): Promise<{
  created: number;
  errors: { row: number; studentName: string; reason: string }[];
}> {
  const session = await getSession();

  // Load all students once
  const students = await prisma.student.findMany({
    where: { orgId: session.orgId },
    select: { id: true, name: true },
  });
  const studentMap = new Map(students.map((s) => [s.name.trim(), s.id]));

  const EXAM_TYPE_MAP: Record<string, ExamType> = {
    공식모의고사: "OFFICIAL_MOCK",
    평가원: "OFFICIAL_MOCK",
    수능: "OFFICIAL_MOCK",
    official_mock: "OFFICIAL_MOCK",
    OFFICIAL_MOCK: "OFFICIAL_MOCK",
    사설모의고사: "PRIVATE_MOCK",
    사설: "PRIVATE_MOCK",
    private_mock: "PRIVATE_MOCK",
    PRIVATE_MOCK: "PRIVATE_MOCK",
    학교내신: "SCHOOL_EXAM",
    내신: "SCHOOL_EXAM",
    school_exam: "SCHOOL_EXAM",
    SCHOOL_EXAM: "SCHOOL_EXAM",
  };

  let created = 0;
  const errors: { row: number; studentName: string; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-indexed + header

    const studentId = studentMap.get(row.studentName.trim());
    if (!studentId) {
      errors.push({ row: rowNum, studentName: row.studentName, reason: "등록된 학생을 찾을 수 없습니다" });
      continue;
    }

    const examType = EXAM_TYPE_MAP[row.examType.trim()];
    if (!examType) {
      errors.push({ row: rowNum, studentName: row.studentName, reason: `시험종류 인식 불가: "${row.examType}"` });
      continue;
    }

    const examDate = new Date(row.examDate.trim());
    if (isNaN(examDate.getTime())) {
      errors.push({ row: rowNum, studentName: row.studentName, reason: `날짜 형식 오류: "${row.examDate}"` });
      continue;
    }

    try {
      await prisma.examScore.create({
        data: {
          orgId: session.orgId,
          studentId,
          examType,
          examName: row.examName.trim(),
          examDate,
          subject: row.subject.trim(),
          rawScore: row.rawScore ?? null,
          grade: row.grade ?? null,
          percentile: row.percentile ?? null,
          notes: row.notes?.trim() || null,
        },
      });
      created++;
    } catch {
      errors.push({ row: rowNum, studentName: row.studentName, reason: "저장 실패" });
    }
  }

  revalidatePath("/students");
  return { created, errors };
}
