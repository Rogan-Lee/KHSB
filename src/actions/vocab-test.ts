"use server";

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { requireOrg } from "@/lib/org";
import { revalidatePath } from "next/cache";
import { VocabEnrollReason } from "@/generated/prisma";

async function getSession() {
  const org = await requireOrg();
  const user = await getUser();
  if (!user) throw new Error("인증 필요");
  return { ...user, orgId: org.orgId };
}

// ── 대상자 등록 ──
export async function enrollVocabTest(studentId: string, reason: VocabEnrollReason) {
  const session = await getSession();

  await prisma.vocabTestEnrollment.upsert({
    where: { studentId },
    create: { orgId: session.orgId, studentId, reason, isActive: true, enrolledById: session.id },
    update: { reason, isActive: true, unenrolledAt: null, enrolledById: session.id },
  });

  revalidatePath("/vocab-test");
  revalidatePath("/attendance");
}

// ── 대상자 일괄 등록 ──
export async function bulkEnrollVocabTest(studentIds: string[], reason: VocabEnrollReason) {
  const session = await getSession();

  for (const studentId of studentIds) {
    await prisma.vocabTestEnrollment.upsert({
      where: { studentId },
      create: { orgId: session.orgId, studentId, reason, isActive: true, enrolledById: session.id },
      update: { reason, isActive: true, unenrolledAt: null, enrolledById: session.id },
    });
  }

  revalidatePath("/vocab-test");
  revalidatePath("/attendance");
}

// ── 대상자 해제 ──
export async function unenrollVocabTest(studentId: string) {
  const session = await getSession();

  await prisma.vocabTestEnrollment.update({
    where: { studentId },
    data: { isActive: false, unenrolledAt: new Date() },
  });

  revalidatePath("/vocab-test");
  revalidatePath("/attendance");
}

// ── 성적 입력 ──
export async function createVocabScore(formData: FormData) {
  const session = await getSession();

  const studentId = formData.get("studentId") as string;
  const testDate = formData.get("testDate") as string;
  const totalWords = Number(formData.get("totalWords"));
  const correctWords = Number(formData.get("correctWords"));
  const notes = (formData.get("notes") as string) || null;

  if (!studentId || !testDate || !totalWords) throw new Error("필수 입력값이 없습니다");

  const score = totalWords > 0 ? Math.round((correctWords / totalWords) * 100) : 0;

  await prisma.vocabTestScore.create({
    data: {
      orgId: session.orgId,
      studentId,
      testDate: new Date(testDate),
      totalWords,
      correctWords,
      score,
      notes,
      createdById: session.id,
    },
  });

  revalidatePath("/vocab-test");
}

// ── 성적 삭제 ──
export async function deleteVocabScore(id: string) {
  const session = await getSession();

  await prisma.vocabTestScore.delete({ where: { id, orgId: session.orgId } });
  revalidatePath("/vocab-test");
}

// ── 고3 영어 3등급 이하 자동 추천 후보 조회 ──
export async function getVocabAutoRecommendations() {
  const session = await getSession();

  // 고3 학생 중 영어 모의고사 최근 등급 3 이상인 학생
  const students = await prisma.student.findMany({
    where: {
      orgId: session.orgId,
      status: "ACTIVE",
      grade: { contains: "3" }, // 고3, 3학년 등
      examScores: {
        some: {
          subject: { contains: "영어" },
          grade: { gte: 3 },
        },
      },
    },
    select: {
      id: true,
      name: true,
      grade: true,
      school: true,
      vocabEnrollment: { select: { isActive: true } },
      examScores: {
        where: { subject: { contains: "영어" } },
        orderBy: { examDate: "desc" },
        take: 1,
        select: { grade: true, examName: true, examDate: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return students.filter((s) => !s.vocabEnrollment?.isActive);
}
