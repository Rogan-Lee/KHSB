"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { parseSchool } from "@/lib/utils";
import { requireAnyStaff } from "@/lib/roles";

// 보안: "use server" export 는 공개 POST 엔드포인트 — 조회 함수도 직원 세션을 검증한다.
// 호출처는 모두 대시보드(시간표·멘토링 상세·면담 상세)이며 전 직원 공용 화면이다.
async function requireStaffSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);
  return session.user;
}

const TIME_RE = /^\d{2}:\d{2}$/;

function validateEntryFields(data: {
  dayOfWeek?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  subject?: unknown;
  details?: unknown;
  colorCode?: unknown;
}) {
  if (data.dayOfWeek !== undefined && !(Number.isInteger(data.dayOfWeek) && (data.dayOfWeek as number) >= 0 && (data.dayOfWeek as number) <= 6)) {
    throw new Error("요일이 올바르지 않습니다");
  }
  for (const t of [data.startTime, data.endTime]) {
    if (t !== undefined && (typeof t !== "string" || !TIME_RE.test(t))) {
      throw new Error("시간 형식이 올바르지 않습니다 (HH:MM)");
    }
  }
  if (data.subject !== undefined && (typeof data.subject !== "string" || data.subject.length > 100)) {
    throw new Error("과목명은 100자 이하로 입력하세요");
  }
  if (data.details != null && (typeof data.details !== "string" || data.details.length > 1000)) {
    throw new Error("상세 내용은 1000자 이하로 입력하세요");
  }
  if (data.colorCode !== undefined && (typeof data.colorCode !== "string" || data.colorCode.length > 20)) {
    throw new Error("색상 값이 올바르지 않습니다");
  }
}

export type SchoolEventInfo = {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date | null;
  type: string;
};

export async function getTimetableEntries(studentId: string) {
  await requireStaffSession();
  return prisma.timetableEntry.findMany({
    where: { studentId },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
}

export async function createTimetableEntry(data: {
  studentId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  subject: string;
  details?: string;
  colorCode?: string;
  allDay?: boolean;
}) {
  const user = await requireStaffSession();
  validateEntryFields(data);

  const entry = await prisma.timetableEntry.create({
    data: {
      studentId: data.studentId,
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      endTime: data.endTime,
      subject: data.subject,
      details: data.details ?? null,
      colorCode: data.colorCode ?? "blue",
      allDay: data.allDay ?? false,
      createdById: user.id,
    },
  });
  revalidatePath("/timetable");
  return entry;
}

export async function updateTimetableEntry(
  id: string,
  data: Partial<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    subject: string;
    details: string | null;
    colorCode: string;
    allDay: boolean;
  }>
) {
  await requireStaffSession();
  validateEntryFields(data);
  // 보안: 클라이언트 객체를 그대로 넘기지 않는다 (studentId·createdById 등 임의 컬럼 변경 차단)
  await prisma.timetableEntry.update({
    where: { id },
    data: {
      ...(data.dayOfWeek !== undefined && { dayOfWeek: data.dayOfWeek }),
      ...(data.startTime !== undefined && { startTime: data.startTime }),
      ...(data.endTime !== undefined && { endTime: data.endTime }),
      ...(data.subject !== undefined && { subject: data.subject }),
      ...(data.details !== undefined && { details: data.details }),
      ...(data.colorCode !== undefined && { colorCode: data.colorCode }),
      ...(data.allDay !== undefined && { allDay: data.allDay === true }),
    },
  });
  revalidatePath("/timetable");
}

export async function deleteTimetableEntry(id: string) {
  await requireStaffSession();
  await prisma.timetableEntry.delete({ where: { id } });
  revalidatePath("/timetable");
}

export async function getStudentSchoolEvents(
  studentId: string,
  from: Date,
  to: Date,
): Promise<SchoolEventInfo[]> {
  await requireStaffSession();
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { school: true },
  });
  if (!student?.school) return [];
  const schoolName = parseSchool(student.school);
  return prisma.calendarEvent.findMany({
    where: {
      schoolName,
      type: { in: ["SCHOOL_EXAM", "SCHOOL_EVENT"] },
      startDate: { lte: to },
      OR: [{ endDate: null }, { endDate: { gte: from } }],
    },
    orderBy: { startDate: "asc" },
    select: { id: true, title: true, startDate: true, endDate: true, type: true },
  });
}

export async function getAttendanceAutoBlocks(studentId: string) {
  await requireStaffSession();
  const [schedules, outings] = await Promise.all([
    prisma.attendanceSchedule.findMany({
      where: { studentId },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    }),
    prisma.outingSchedule.findMany({
      where: { studentId },
      orderBy: [{ dayOfWeek: "asc" }, { outStart: "asc" }],
    }),
  ]);

  // 시간표 캔버스(timetable-grid)는 "HH:MM" 만 파싱 가능 — "FLEXIBLE" 이 들어가면
  // timeToMin → NaN 으로 top/height 가 망가져 블록이 콘텐츠 크기로 쪼그라든다.
  // 자율 입실 → 06:00, 자율 퇴실 → 22:00 으로 가시화. 양쪽 다 자율이면 종일 블록.
  const FLEX_START = "06:00";
  const FLEX_END = "22:00";
  const fix = (t: string, fallback: string) => (t === "FLEXIBLE" ? fallback : t);

  return [
    ...schedules.map((s) => ({
      dayOfWeek: s.dayOfWeek,
      startTime: fix(s.startTime, FLEX_START),
      endTime: fix(s.endTime, FLEX_END),
      type: "ATTENDANCE" as const,
      label:
        s.startTime === "FLEXIBLE" && s.endTime === "FLEXIBLE"
          ? "등원 (자율)"
          : s.startTime === "FLEXIBLE"
            ? "등원 (입실 자율)"
            : s.endTime === "FLEXIBLE"
              ? "등원 (퇴실 자율)"
              : "등원",
    })),
    ...outings.map((o) => ({
      dayOfWeek: o.dayOfWeek,
      startTime: fix(o.outStart, FLEX_START),
      endTime: fix(o.outEnd, FLEX_END),
      type: "OUTING" as const,
      label: o.reason ?? "외출",
    })),
  ];
}
