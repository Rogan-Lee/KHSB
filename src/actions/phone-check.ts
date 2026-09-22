"use server";

import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/roles";
import { compareSeat } from "@/lib/patrol";
import type { PhoneCheckStatus } from "@/generated/prisma";

export type PhoneCheckRow = {
  studentId: string;
  name: string;
  seat: string | null;
  grade: string;
  checkedIn: boolean;
  checkInAt: string | null; // "HH:MM" (KST)
  record: { status: PhoneCheckStatus; note: string | null } | null;
};

/** "YYYY-MM-DD" → @db.Date 저장 규약(UTC 자정)에 맞는 Date. 형식 검증 포함. */
function parseDate(date: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("잘못된 날짜 형식입니다");
  return new Date(date);
}

function toKSTHHMM(d: Date): string {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(11, 16);
}

async function requireSessionStaff() {
  const session = await auth();
  requireStaff(session?.user?.role);
  return session!.user!;
}

/** 해당 날짜의 휴대폰 제출 검사 보드: ACTIVE 학생 전체(좌석순) + 입실 여부 + 검사 기록. */
export async function getPhoneCheckBoard(date: string): Promise<PhoneCheckRow[]> {
  await requireSessionStaff();
  const day = parseDate(date);

  const [students, attendance, records] = await Promise.all([
    prisma.student.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, seat: true, grade: true },
    }),
    prisma.attendanceRecord.findMany({
      where: { date: day },
      select: { studentId: true, checkIn: true },
    }),
    prisma.phoneCheckRecord.findMany({
      where: { date: day },
      select: { studentId: true, status: true, note: true },
    }),
  ]);

  const checkInById = new Map(attendance.map((a) => [a.studentId, a.checkIn]));
  const recordById = new Map(records.map((r) => [r.studentId, r]));

  return students.sort(compareSeat).map((s) => {
    const checkIn = checkInById.get(s.id) ?? null;
    const rec = recordById.get(s.id);
    return {
      studentId: s.id,
      name: s.name,
      seat: s.seat,
      grade: s.grade,
      checkedIn: !!checkIn,
      checkInAt: checkIn ? toKSTHHMM(checkIn) : null,
      record: rec ? { status: rec.status, note: rec.note } : null,
    };
  });
}

/** 학생 1명 검사 상태 upsert. */
export async function setPhoneCheck(
  studentId: string,
  date: string,
  status: PhoneCheckStatus,
  note?: string,
): Promise<void> {
  const user = await requireSessionStaff();
  const day = parseDate(date);
  const trimmed = note?.trim() || null;

  await prisma.phoneCheckRecord.upsert({
    where: { studentId_date: { studentId, date: day } },
    create: { studentId, date: day, status, note: trimmed, checkedById: user.id },
    update: { status, note: trimmed, checkedById: user.id },
  });
  revalidatePath("/phone-check");
}

/** 다건 제출 처리 (입실자 일괄 제출용). */
export async function bulkMarkSubmitted(date: string, studentIds: string[]): Promise<number> {
  const user = await requireSessionStaff();
  const day = parseDate(date);
  if (studentIds.length === 0) return 0;

  await prisma.$transaction(
    studentIds.map((studentId) =>
      prisma.phoneCheckRecord.upsert({
        where: { studentId_date: { studentId, date: day } },
        create: { studentId, date: day, status: "SUBMITTED", checkedById: user.id },
        update: { status: "SUBMITTED", note: null, checkedById: user.id },
      }),
    ),
  );
  revalidatePath("/phone-check");
  return studentIds.length;
}
