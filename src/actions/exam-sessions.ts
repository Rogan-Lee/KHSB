"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireStaff } from "@/lib/roles";
import { revalidatePath } from "next/cache";
import { ExamType } from "@/generated/prisma";
import { H_ROOM_SEATS } from "@/lib/exam-seats";

export async function createExamSession(data: {
  title: string;
  examDate: string;
  examType: ExamType;
  subjects: string[];
  notes?: string;
}) {
  const session = await auth();
  requireStaff(session?.user?.role);

  const created = await prisma.examSession.create({
    data: {
      title: data.title.trim(),
      examDate: new Date(data.examDate),
      examType: data.examType,
      room: "H",
      subjects: data.subjects,
      notes: data.notes?.trim() || null,
      createdById: session!.user!.id,
    },
  });
  revalidatePath("/exams");
  return created;
}

export async function updateExamSession(id: string, data: {
  title: string;
  examDate: string;
  examType: ExamType;
  subjects: string[];
  notes?: string;
}) {
  const session = await auth();
  requireStaff(session?.user?.role);

  await prisma.examSession.update({
    where: { id },
    data: {
      title: data.title.trim(),
      examDate: new Date(data.examDate),
      examType: data.examType,
      subjects: data.subjects,
      notes: data.notes?.trim() || null,
    },
  });
  revalidatePath("/exams");
  revalidatePath(`/exams/${id}`);
}

export async function deleteExamSession(id: string) {
  const session = await auth();
  requireStaff(session?.user?.role);
  await prisma.examSession.delete({ where: { id } });
  revalidatePath("/exams");
}

/**
 * 응시자 목록 세팅 (좌석 랜덤 배치 포함).
 * 기존 배치는 모두 삭제 후 새로 Fisher-Yates로 배치.
 */
export async function assignExamSeatsRandomly(sessionId: string, studentIds: string[]) {
  const session = await auth();
  requireStaff(session?.user?.role);

  const uniqueIds = Array.from(new Set(studentIds));
  if (uniqueIds.length === 0) throw new Error("응시 학생을 한 명 이상 선택하세요");
  if (uniqueIds.length > H_ROOM_SEATS.length) {
    throw new Error(`H룸 좌석(${H_ROOM_SEATS.length}석)보다 응시자가 많습니다 (${uniqueIds.length}명)`);
  }

  // Fisher-Yates shuffle — 좌석 기준으로 섞기
  const seats = [...H_ROOM_SEATS];
  for (let i = seats.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [seats[i], seats[j]] = [seats[j], seats[i]];
  }

  await prisma.$transaction([
    prisma.examSeatAssignment.deleteMany({ where: { sessionId } }),
    prisma.examSeatAssignment.createMany({
      data: uniqueIds.map((studentId, idx) => ({
        sessionId,
        studentId,
        seatNumber: seats[idx],
      })),
    }),
  ]);

  revalidatePath(`/exams/${sessionId}`);
}

/**
 * 재배치: 기존 응시자 그대로 두고 좌석만 다시 섞는다.
 */
export async function reshuffleExamSeats(sessionId: string) {
  const session = await auth();
  requireStaff(session?.user?.role);

  const current = await prisma.examSeatAssignment.findMany({
    where: { sessionId },
    select: { studentId: true },
  });
  if (current.length === 0) throw new Error("응시자가 없습니다");
  await assignExamSeatsRandomly(sessionId, current.map((c) => c.studentId));
}

/**
 * 두 좌석의 응시자 교환.
 */
export async function swapExamSeats(sessionId: string, seatA: number, seatB: number) {
  const session = await auth();
  requireStaff(session?.user?.role);

  const [a, b] = await Promise.all([
    prisma.examSeatAssignment.findUnique({ where: { sessionId_seatNumber: { sessionId, seatNumber: seatA } } }),
    prisma.examSeatAssignment.findUnique({ where: { sessionId_seatNumber: { sessionId, seatNumber: seatB } } }),
  ]);

  // 한 쪽만 있으면 단순 이동
  if (a && !b) {
    await prisma.examSeatAssignment.update({ where: { id: a.id }, data: { seatNumber: seatB } });
  } else if (!a && b) {
    await prisma.examSeatAssignment.update({ where: { id: b.id }, data: { seatNumber: seatA } });
  } else if (a && b) {
    // 교환: unique 제약 피하기 위해 임시 좌석 번호 사용
    const temp = -1;
    await prisma.$transaction([
      prisma.examSeatAssignment.update({ where: { id: a.id }, data: { seatNumber: temp } }),
      prisma.examSeatAssignment.update({ where: { id: b.id }, data: { seatNumber: seatA } }),
      prisma.examSeatAssignment.update({ where: { id: a.id }, data: { seatNumber: seatB } }),
    ]);
  }
  revalidatePath(`/exams/${sessionId}`);
}

/**
 * 특정 좌석에 학생 배정/변경/해제.
 * - studentId === null: 해당 좌석 배정 해제
 * - 이미 다른 좌석에 있는 학생이면 그 좌석과 교환
 * - 이미 해당 좌석에 다른 학생이 있으면 그 학생은 빈 좌석으로 간주
 */
export async function manualAssignExamSeat(sessionId: string, seatNumber: number, studentId: string | null) {
  const session = await auth();
  requireStaff(session?.user?.role);

  const existingAtSeat = await prisma.examSeatAssignment.findUnique({
    where: { sessionId_seatNumber: { sessionId, seatNumber } },
  });

  if (!studentId) {
    if (existingAtSeat) {
      await prisma.examSeatAssignment.delete({ where: { id: existingAtSeat.id } });
    }
    revalidatePath(`/exams/${sessionId}`);
    return;
  }

  const existingForStudent = await prisma.examSeatAssignment.findUnique({
    where: { sessionId_studentId: { sessionId, studentId } },
  });

  // 이미 같은 학생이 같은 좌석에 배정 → noop
  if (existingForStudent && existingForStudent.seatNumber === seatNumber) {
    return;
  }

  // 케이스 1: 학생이 세션에 없고 좌석도 비어있음 → 단순 생성
  if (!existingForStudent && !existingAtSeat) {
    await prisma.examSeatAssignment.create({ data: { sessionId, seatNumber, studentId } });
  }
  // 케이스 2: 학생이 세션에 없고 좌석에 다른 학생 → 좌석 주인을 이 학생으로 교체
  else if (!existingForStudent && existingAtSeat) {
    await prisma.$transaction([
      prisma.examSeatAssignment.delete({ where: { id: existingAtSeat.id } }),
      prisma.examSeatAssignment.create({ data: { sessionId, seatNumber, studentId } }),
    ]);
  }
  // 케이스 3: 학생이 이미 다른 좌석에 있고 목적 좌석 비어있음 → 이동
  else if (existingForStudent && !existingAtSeat) {
    await prisma.examSeatAssignment.update({
      where: { id: existingForStudent.id },
      data: { seatNumber },
    });
  }
  // 케이스 4: 학생이 이미 다른 좌석에 있고 목적 좌석에도 다른 학생 → 교환
  else if (existingForStudent && existingAtSeat) {
    const temp = -Date.now();
    await prisma.$transaction([
      prisma.examSeatAssignment.update({ where: { id: existingForStudent.id }, data: { seatNumber: temp } }),
      prisma.examSeatAssignment.update({ where: { id: existingAtSeat.id }, data: { seatNumber: existingForStudent.seatNumber } }),
      prisma.examSeatAssignment.update({ where: { id: existingForStudent.id }, data: { seatNumber } }),
    ]);
  }
  revalidatePath(`/exams/${sessionId}`);
}

/**
 * 응시자 제거 (좌석 배정에서도 제외).
 */
export async function removeExamParticipant(sessionId: string, studentId: string) {
  const session = await auth();
  requireStaff(session?.user?.role);
  await prisma.examSeatAssignment.deleteMany({ where: { sessionId, studentId } });
  revalidatePath(`/exams/${sessionId}`);
}

export type BulkScoreRow = {
  studentId: string;
  scores: Array<{
    subject: string;
    rawScore?: number | null;
    grade?: number | null;
    percentile?: number | null;
    notes?: string | null;
  }>;
};

/**
 * 세션 응시자들의 성적을 일괄 저장 (기존 세션 ExamScore 삭제 후 재생성).
 */
export async function saveExamSessionScores(sessionId: string, rows: BulkScoreRow[]) {
  const session = await auth();
  requireStaff(session?.user?.role);

  const examSession = await prisma.examSession.findUnique({ where: { id: sessionId } });
  if (!examSession) throw new Error("세션을 찾을 수 없습니다");

  const toCreate: {
    studentId: string;
    examType: ExamType;
    examName: string;
    examDate: Date;
    subject: string;
    rawScore: number | null;
    grade: number | null;
    percentile: number | null;
    notes: string | null;
    sessionId: string;
  }[] = [];

  for (const row of rows) {
    for (const s of row.scores) {
      // 전부 비어있으면 skip
      if (
        (s.rawScore == null || Number.isNaN(s.rawScore)) &&
        (s.grade == null || Number.isNaN(s.grade)) &&
        (s.percentile == null || Number.isNaN(s.percentile)) &&
        !s.notes
      ) {
        continue;
      }
      toCreate.push({
        studentId: row.studentId,
        examType: examSession.examType,
        examName: examSession.title,
        examDate: examSession.examDate,
        subject: s.subject,
        rawScore: s.rawScore ?? null,
        grade: s.grade ?? null,
        percentile: s.percentile ?? null,
        notes: s.notes ?? null,
        sessionId: examSession.id,
      });
    }
  }

  await prisma.$transaction([
    prisma.examScore.deleteMany({ where: { sessionId: examSession.id } }),
    ...(toCreate.length > 0 ? [prisma.examScore.createMany({ data: toCreate })] : []),
  ]);

  revalidatePath(`/exams/${sessionId}`);
  return { saved: toCreate.length };
}
