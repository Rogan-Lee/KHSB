"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { STAFF_ROLES, requireAnyStaff } from "@/lib/roles";
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

const MAX_IMPORT_ROWS = 1000;
const MAX_SCHEDULE_ROWS = 100;

function validDayOfWeek(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 6;
}

// 클라이언트가 보낸 일정 객체를 그대로 spread 하지 않고 허용 필드만 남긴다.
function pickSchedules(studentId: string, schedules: CSVImportRow["schedules"]) {
  if (!Array.isArray(schedules)) return [];
  return schedules
    .slice(0, MAX_SCHEDULE_ROWS)
    .filter((s) => validDayOfWeek(s?.dayOfWeek) && typeof s.startTime === "string" && typeof s.endTime === "string")
    .map((s) => ({
      studentId,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime.slice(0, 10),
      endTime: s.endTime.slice(0, 10),
    }));
}

function pickOutings(studentId: string, outings: CSVImportRow["outings"]) {
  if (!Array.isArray(outings)) return [];
  return outings
    .slice(0, MAX_SCHEDULE_ROWS)
    .filter((o) => validDayOfWeek(o?.dayOfWeek) && typeof o.outStart === "string" && typeof o.outEnd === "string")
    .map((o) => ({
      studentId,
      dayOfWeek: o.dayOfWeek,
      outStart: o.outStart.slice(0, 10),
      outEnd: o.outEnd.slice(0, 10),
    }));
}

export async function importStudentsCSV(rows: CSVImportRow[]): Promise<ImportResult> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

  if (!Array.isArray(rows)) throw new Error("가져올 데이터 형식이 올바르지 않습니다");
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new Error(`한 번에 최대 ${MAX_IMPORT_ROWS}행까지 가져올 수 있습니다`);
  }

  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  // 멘토 이름 → id 캐시
  const mentorCache = new Map<string, string>();

  async function getMentorId(name: string): Promise<string | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;
    if (mentorCache.has(trimmed)) return mentorCache.get(trimmed)!;
    const mentor = await prisma.user.findFirst({
      // CSV import 시 신규 학생→멘토 배정 picker — 퇴사한 동명이인이 신규 배정 받지 않도록 제외
      where: { status: "ACTIVE", name: trimmed, role: { in: [...STAFF_ROLES] } },
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

      const scheduleRows = pickSchedules(studentId, row.schedules);
      const outingRows = pickOutings(studentId, row.outings);
      if (scheduleRows.length > 0) {
        await prisma.attendanceSchedule.createMany({ data: scheduleRows });
      }
      if (outingRows.length > 0) {
        await prisma.outingSchedule.createMany({ data: outingRows });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push({ row: i + 2, name: row.name, reason: msg.slice(0, 80) });
    }
  }

  revalidatePath("/students");
  return result;
}
