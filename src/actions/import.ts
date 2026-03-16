"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type CSVImportRow = {
  seat?: string;
  name: string;
  school?: string;
  classGroup?: string;
  phone?: string;
  parentPhone?: string;
  parentEmail?: string;
  grade: string;
  mentorName?: string;
  academySchedule?: string;
  studentInfo?: string;
  selectedSubjects?: string;
  admissionType?: string;
  onlineLectures?: string;
  schedules: { dayOfWeek: number; startTime: string; endTime: string }[];
  outings: { dayOfWeek: number; outStart: string; outEnd: string }[];
};

export type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; name: string; reason: string }[];
};

export async function importStudentsCSV(rows: CSVImportRow[]): Promise<ImportResult> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  // 멘토 이름 → id 캐시
  const mentorCache = new Map<string, string>();

  async function getMentorId(name: string): Promise<string | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;
    if (mentorCache.has(trimmed)) return mentorCache.get(trimmed)!;
    const mentor = await prisma.user.findFirst({
      where: { name: trimmed, role: { in: ["MENTOR", "STAFF", "DIRECTOR", "ADMIN"] } },
      select: { id: true },
    });
    if (mentor) mentorCache.set(trimmed, mentor.id);
    return mentor?.id ?? null;
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.name?.trim()) {
      result.skipped++;
      continue;
    }

    try {
      const mentorId = row.mentorName ? await getMentorId(row.mentorName) : null;

      const data = {
        name: row.name.trim(),
        seat: row.seat?.trim() || null,
        school: row.school?.trim() || null,
        classGroup: row.classGroup?.trim() || null,
        phone: row.phone?.trim() || null,
        parentPhone: row.parentPhone?.trim() || "",
        parentEmail: row.parentEmail?.trim() || null,
        grade: row.grade?.trim() || "",
        academySchedule: row.academySchedule?.trim() || null,
        studentInfo: row.studentInfo?.trim() || null,
        selectedSubjects: row.selectedSubjects?.trim() || null,
        admissionType: row.admissionType?.trim() || null,
        onlineLectures: row.onlineLectures?.trim() || null,
        ...(mentorId ? { mentorId } : {}),
      };

      // 좌석번호로 먼저 매칭, 없으면 이름으로 매칭
      let existing = row.seat?.trim()
        ? await prisma.student.findFirst({ where: { seat: row.seat.trim() } })
        : null;
      if (!existing) {
        existing = await prisma.student.findFirst({ where: { name: row.name.trim() } });
      }

      let studentId: string;

      if (existing) {
        await prisma.student.update({ where: { id: existing.id }, data });
        studentId = existing.id;
        result.updated++;
      } else {
        const created = await prisma.student.create({
          data: { ...data, startDate: new Date(), status: "ACTIVE" },
        });
        studentId = created.id;
        result.created++;
      }

      // 스케줄 교체 (기존 삭제 후 재등록)
      await prisma.attendanceSchedule.deleteMany({ where: { studentId } });
      await prisma.outingSchedule.deleteMany({ where: { studentId } });

      if (row.schedules.length > 0) {
        await prisma.attendanceSchedule.createMany({
          data: row.schedules.map((s) => ({ ...s, studentId })),
        });
      }
      if (row.outings.length > 0) {
        await prisma.outingSchedule.createMany({
          data: row.outings.map((o) => ({ ...o, studentId })),
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push({ row: i + 2, name: row.name, reason: msg.slice(0, 80) });
    }
  }

  revalidatePath("/students");
  return result;
}
